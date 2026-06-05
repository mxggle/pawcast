import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import type { JournalEntry } from '../src/types/persistence'

function journalFileName(): string {
  const now = new Date()
  const yyyy = now.getFullYear()
  const mm = String(now.getMonth() + 1).padStart(2, '0')
  const dd = String(now.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}.jsonl`
}

function journalDir(dataDir: string): string {
  return path.join(dataDir, 'backups', 'journal')
}

export function generateOperationId(): string {
  return crypto.randomUUID()
}

export async function appendJournal(
  dataDir: string,
  entry: JournalEntry,
): Promise<void> {
  const dir = journalDir(dataDir)
  await fs.promises.mkdir(dir, { recursive: true })

  const filePath = path.join(dir, journalFileName())
  const line = JSON.stringify(entry) + '\n'
  await fs.promises.appendFile(filePath, line, 'utf-8')
}

export async function replayCommitted(dataDir: string): Promise<void> {
  const dir = journalDir(dataDir)
  let entries: fs.Dirent[]
  try {
    entries = await fs.promises.readdir(dir, { withFileTypes: true })
  } catch {
    return
  }

  const journalFiles = entries
    .filter((e) => e.isFile() && e.name.endsWith('.jsonl'))
    .map((e) => path.join(dir, e.name))

  for (const filePath of journalFiles) {
    let raw: string
    try {
      raw = await fs.promises.readFile(filePath, 'utf-8')
    } catch {
      continue
    }

    const lines = raw.split('\n').filter((l) => l.trim())
    for (const line of lines) {
      let entry: JournalEntry
      try {
        entry = JSON.parse(line)
      } catch {
        continue
      }

      if (entry.status !== 'committed') continue

      const targetPath = path.join(dataDir, entry.targetPath)
      const tmpPath = `${targetPath}.tmp-${entry.operationId}`

      let currentChecksum: string | null = null
      try {
        const hash = crypto.createHash('sha256')
        const data = await fs.promises.readFile(targetPath)
        hash.update(data)
        currentChecksum = hash.digest('hex')
      } catch {
        currentChecksum = null
      }

      if (currentChecksum === entry.afterChecksum) {
        continue
      }

      if (entry.afterChecksum) {
        try {
          const tmpHash = crypto.createHash('sha256')
          const tmpData = await fs.promises.readFile(tmpPath)
          tmpHash.update(tmpData)
          if (tmpHash.digest('hex') === entry.afterChecksum) {
            await fs.promises.rename(tmpPath, targetPath)
          }
        } catch {
          // tmp doesn't exist or doesn't match
        }
      }
    }
  }
}

export async function rollbackPending(dataDir: string): Promise<void> {
  const dir = journalDir(dataDir)
  let entries: fs.Dirent[]
  try {
    entries = await fs.promises.readdir(dir, { withFileTypes: true })
  } catch {
    return
  }

  const journalFiles = entries
    .filter((e) => e.isFile() && e.name.endsWith('.jsonl'))
    .map((e) => path.join(dir, e.name))

  for (const filePath of journalFiles) {
    let raw: string
    try {
      raw = await fs.promises.readFile(filePath, 'utf-8')
    } catch {
      continue
    }

    const lines = raw.split('\n').filter((l) => l.trim())
    const updatedLines: string[] = []

    for (const line of lines) {
      let entry: JournalEntry
      try {
        entry = JSON.parse(line)
      } catch {
        updatedLines.push(line)
        continue
      }

      if (entry.status !== 'pending') {
        updatedLines.push(line)
        continue
      }

      const targetPath = path.join(dataDir, entry.targetPath)
      const tmpPath = `${targetPath}.tmp-${entry.operationId}`

      let resolved = false
      try {
        await fs.promises.stat(tmpPath)
        if (entry.afterChecksum) {
          const hash = crypto.createHash('sha256')
          const data = await fs.promises.readFile(tmpPath)
          hash.update(data)
          if (hash.digest('hex') === entry.afterChecksum) {
            await fs.promises.rename(tmpPath, targetPath)
            entry.status = 'committed'
            resolved = true
          }
        }
      } catch {
        // tmp doesn't exist
      }

      if (!resolved) {
        try {
          await fs.promises.unlink(tmpPath)
        } catch {
          // doesn't exist
        }
        entry.status = 'rolled_back'
      }

      updatedLines.push(JSON.stringify(entry))
    }

    await fs.promises.writeFile(filePath, updatedLines.join('\n') + '\n', 'utf-8')
  }
}
