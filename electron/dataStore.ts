import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { app } from 'electron'
import {
  loadManifest,
  saveManifest,
  createDefaultManifest,
  updateFileEntry,
  checksumFile,
} from './manifestManager'
import { appendJournal, generateOperationId } from './journalManager'
import type { DataManifest } from '../src/types/persistence'

const DATA_DIR_CONFIG_FILE = '.loopmate-datadir'
const dataMutationQueues = new Map<string, Promise<void>>()

function defaultDataDir(): string {
  return path.join(app.getPath('userData'), 'LoopMateData')
}

export function getDataDir(): string {
  try {
    const configPath = path.join(app.getPath('userData'), DATA_DIR_CONFIG_FILE)
    const raw = fs.readFileSync(configPath, 'utf-8').trim()
    if (raw.length > 0) return raw
  } catch {
    // file doesn't exist
  }
  return defaultDataDir()
}

export async function setDataDir(dirPath: string): Promise<void> {
  const configPath = path.join(app.getPath('userData'), DATA_DIR_CONFIG_FILE)
  await fs.promises.writeFile(configPath, dirPath, 'utf-8')
}

export async function ensureDataDir(dataDir: string): Promise<void> {
  const dirs = [
    dataDir,
    path.join(dataDir, 'settings'),
    path.join(dataDir, 'library'),
    path.join(dataDir, 'study', 'transcripts'),
    path.join(dataDir, 'study', 'transcript-study'),
    path.join(dataDir, 'recordings', 'shadowing', 'files'),
    path.join(dataDir, 'recordings', 'sentence-practice', 'files'),
    path.join(dataDir, 'media', 'imported', 'files'),
    path.join(dataDir, 'cache', 'waveform'),
    path.join(dataDir, 'backups', 'snapshots'),
    path.join(dataDir, 'backups', 'journal'),
  ]

  for (const dir of dirs) {
    await fs.promises.mkdir(dir, { recursive: true })
  }

  const manifestPath = path.join(dataDir, 'manifest.json')
  try {
    await fs.promises.access(manifestPath)
  } catch {
    const manifest = createDefaultManifest(dataDir, app.getVersion())
    await saveManifest(dataDir, manifest)
  }
}

export function sanitizePath(dataDir: string, relativePath: string): string {
  const normalized = path.normalize(path.resolve(dataDir))
  const fullPath = path.normalize(path.resolve(normalized, relativePath))

  if (
    !fullPath.startsWith(normalized + path.sep) &&
    fullPath !== normalized
  ) {
    throw new Error(
      `Path traversal blocked: "${relativePath}" resolves outside data directory.`,
    )
  }

  return fullPath
}

export async function readJSON<T>(
  dataDir: string,
  relativePath: string,
): Promise<T | null> {
  const fullPath = sanitizePath(dataDir, relativePath)
  try {
    const raw = await fs.promises.readFile(fullPath, 'utf-8')
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

export async function writeJSON<T>(
  dataDir: string,
  relativePath: string,
  data: T,
): Promise<void> {
  return enqueueDataMutation(dataDir, () => writeJSONNow(dataDir, relativePath, data))
}

async function writeJSONNow<T>(
  dataDir: string,
  relativePath: string,
  data: T,
): Promise<void> {
  const fullPath = sanitizePath(dataDir, relativePath)
  const operationId = generateOperationId()
  const tmpPath = `${fullPath}.tmp-${operationId}`

  const dir = path.dirname(fullPath)
  await fs.promises.mkdir(dir, { recursive: true })

  let beforeChecksum: string | null = null
  try {
    beforeChecksum = await checksumFile(fullPath)
  } catch {
    // file doesn't exist yet
  }

  const json = JSON.stringify(data, null, 2)

  const afterHash = crypto.createHash('sha256')
  afterHash.update(json)
  const afterChecksum = afterHash.digest('hex')

  await appendJournal(dataDir, {
    operationId,
    type: 'write',
    targetPath: relativePath,
    beforeChecksum,
    afterChecksum,
    timestamp: Date.now(),
    status: 'pending',
  })

  const fd = await fs.promises.open(tmpPath, 'w')
  await fd.writeFile(json, 'utf-8')
  await fd.sync()
  await fd.close()

  await fs.promises.rename(tmpPath, fullPath)

  let manifest: DataManifest
  try {
    manifest = loadManifest(dataDir)
  } catch {
    manifest = createDefaultManifest(dataDir, app.getVersion())
  }
  updateFileEntry(manifest, relativePath, afterChecksum)
  await saveManifest(dataDir, manifest)

  await appendJournal(dataDir, {
    operationId,
    type: 'write',
    targetPath: relativePath,
    beforeChecksum,
    afterChecksum,
    timestamp: Date.now(),
    status: 'committed',
  })
}

export async function deleteFile(
  dataDir: string,
  relativePath: string,
): Promise<void> {
  return enqueueDataMutation(dataDir, () => deleteFileNow(dataDir, relativePath))
}

async function deleteFileNow(
  dataDir: string,
  relativePath: string,
): Promise<void> {
  const fullPath = sanitizePath(dataDir, relativePath)
  const operationId = generateOperationId()

  let beforeChecksum: string | null = null
  try {
    beforeChecksum = await checksumFile(fullPath)
  } catch {
    // doesn't exist
  }

  await appendJournal(dataDir, {
    operationId,
    type: 'delete',
    targetPath: relativePath,
    beforeChecksum,
    afterChecksum: null,
    timestamp: Date.now(),
    status: 'pending',
  })

  try {
    await fs.promises.unlink(fullPath)
  } catch {
    // already gone
  }

  let manifest: DataManifest
  try {
    manifest = loadManifest(dataDir)
  } catch {
    manifest = createDefaultManifest(dataDir, app.getVersion())
  }
  manifest.files = manifest.files.filter((f) => f.path !== relativePath)
  await saveManifest(dataDir, manifest)

  await appendJournal(dataDir, {
    operationId,
    type: 'delete',
    targetPath: relativePath,
    beforeChecksum,
    afterChecksum: null,
    timestamp: Date.now(),
    status: 'committed',
  })
}

export async function listDir(
  dataDir: string,
  relativePath: string,
): Promise<string[]> {
  const fullPath = sanitizePath(dataDir, relativePath)
  try {
    const entries = await fs.promises.readdir(fullPath, { withFileTypes: true })
    return entries.filter((e) => e.isFile()).map((e) => e.name)
  } catch {
    return []
  }
}

export async function readBinary(
  dataDir: string,
  relativePath: string,
): Promise<ArrayBuffer> {
  const fullPath = sanitizePath(dataDir, relativePath)
  const buf = await fs.promises.readFile(fullPath)
  return buf.buffer.slice(
    buf.byteOffset,
    buf.byteOffset + buf.byteLength,
  ) as ArrayBuffer
}

export async function writeBinary(
  dataDir: string,
  relativePath: string,
  data: ArrayBuffer,
): Promise<void> {
  return enqueueDataMutation(dataDir, () => writeBinaryNow(dataDir, relativePath, data))
}

async function writeBinaryNow(
  dataDir: string,
  relativePath: string,
  data: ArrayBuffer,
): Promise<void> {
  const fullPath = sanitizePath(dataDir, relativePath)
  const operationId = generateOperationId()
  const tmpPath = `${fullPath}.tmp-${operationId}`

  const dir = path.dirname(fullPath)
  await fs.promises.mkdir(dir, { recursive: true })

  const buf = Buffer.from(data)

  const fd = await fs.promises.open(tmpPath, 'w')
  await fd.writeFile(buf)
  await fd.sync()
  await fd.close()

  await fs.promises.rename(tmpPath, fullPath)

  const afterHash = crypto.createHash('sha256')
  afterHash.update(buf)
  const afterChecksum = afterHash.digest('hex')

  let manifest: DataManifest
  try {
    manifest = loadManifest(dataDir)
  } catch {
    manifest = createDefaultManifest(dataDir, app.getVersion())
  }
  updateFileEntry(manifest, relativePath, afterChecksum)
  await saveManifest(dataDir, manifest)
}

export async function copyDataDir(
  srcDir: string,
  destDir: string,
): Promise<void> {
  await fs.promises.mkdir(destDir, { recursive: true })
  await copyRecursive(srcDir, destDir)
}

async function copyRecursive(src: string, dest: string): Promise<void> {
  const entries = await fs.promises.readdir(src, { withFileTypes: true })
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name)
    const destPath = path.join(dest, entry.name)
    if (entry.isDirectory()) {
      await fs.promises.mkdir(destPath, { recursive: true })
      await copyRecursive(srcPath, destPath)
    } else {
      await fs.promises.copyFile(srcPath, destPath)
    }
  }
}

function enqueueDataMutation<T>(
  dataDir: string,
  task: () => Promise<T>,
): Promise<T> {
  const key = path.normalize(path.resolve(dataDir))
  const previous = dataMutationQueues.get(key) ?? Promise.resolve()
  const queued = previous.catch(() => undefined).then(task)
  const tail = queued.then(
    () => undefined,
    () => undefined,
  )

  dataMutationQueues.set(key, tail)
  tail.finally(() => {
    if (dataMutationQueues.get(key) === tail) {
      dataMutationQueues.delete(key)
    }
  })

  return queued
}
