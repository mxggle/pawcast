import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { execSync } from 'child_process'
import { loadManifest, saveManifest } from './manifestManager'
import type { SnapshotRef } from '../src/types/persistence'

function snapshotDir(dataDir: string): string {
  return path.join(dataDir, 'backups', 'snapshots')
}

function snapshotFileName(): string {
  return new Date().toISOString().replace(/[:.]/g, '-') + '.zip'
}

function isCachePath(p: string): boolean {
  return p.startsWith('cache/') || p.startsWith('cache' + path.sep)
}

export async function createSnapshot(dataDir: string): Promise<SnapshotRef> {
  const dir = snapshotDir(dataDir)
  await fs.promises.mkdir(dir, { recursive: true })

  const fileName = snapshotFileName()
  const zipPath = path.join(dir, fileName)

  // Collect all non-cache files
  const files = await collectFiles(dataDir, dataDir, '')
  const filtered = files.filter((f) => !isCachePath(f))
  const sorted = filtered.sort()

  // Use system zip for compression
  const fileArgs = sorted.map((f) => `"${f}"`).join(' ')
  try {
    execSync(`cd "${dataDir}" && zip -q "${zipPath}" ${fileArgs}`, {
      stdio: 'ignore',
    })
  } catch {
    throw new Error('Failed to create snapshot zip')
  }

  const checksum = await checksumFile(zipPath)

  const ref: SnapshotRef = {
    path: path.relative(dataDir, zipPath),
    createdAt: Date.now(),
    checksum,
  }

  // Update manifest
  const manifest = loadManifest(dataDir)
  manifest.latestSnapshot = ref
  await saveManifest(dataDir, manifest)

  return ref
}

async function collectFiles(
  baseDir: string,
  dirPath: string,
  relativePrefix: string,
): Promise<string[]> {
  const results: string[] = []
  const entries = await fs.promises.readdir(dirPath, { withFileTypes: true })

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name)
    const relPath = relativePrefix ? `${relativePrefix}/${entry.name}` : entry.name

    // Skip backups directory (avoid recursive snapshots)
    if (entry.isDirectory() && entry.name === 'backups') continue

    if (entry.isDirectory()) {
      const sub = await collectFiles(baseDir, fullPath, relPath)
      results.push(...sub)
    } else {
      results.push(relPath)
    }
  }

  return results
}

export async function restoreSnapshot(
  dataDir: string,
  snapshotPath: string,
): Promise<void> {
  const fullSnapshotPath = path.isAbsolute(snapshotPath)
    ? snapshotPath
    : path.join(dataDir, snapshotPath)

  try {
    await fs.promises.access(fullSnapshotPath)
  } catch {
    throw new Error(`Snapshot not found: ${fullSnapshotPath}`)
  }

  // Extract to temp directory
  const tempDir = path.join(dataDir, 'backups', '.restore-temp')
  await fs.promises.mkdir(tempDir, { recursive: true })

  try {
    execSync(`unzip -o -q "${fullSnapshotPath}" -d "${tempDir}"`, {
      stdio: 'ignore',
    })
  } catch {
    throw new Error('Failed to extract snapshot')
  }

  // Move files from temp to data dir (overwrite)
  const entries = await fs.promises.readdir(tempDir, { withFileTypes: true })
  for (const entry of entries) {
    const srcPath = path.join(tempDir, entry.name)
    const destPath = path.join(dataDir, entry.name)

    if (entry.isDirectory()) {
      await copyOverwrite(srcPath, destPath)
    } else {
      const destDir = path.dirname(destPath)
      await fs.promises.mkdir(destDir, { recursive: true })
      await fs.promises.copyFile(srcPath, destPath)
    }
  }

  // Clean temp
  await fs.promises.rm(tempDir, { recursive: true, force: true })
}

async function copyOverwrite(src: string, dest: string): Promise<void> {
  await fs.promises.mkdir(dest, { recursive: true })
  const entries = await fs.promises.readdir(src, { withFileTypes: true })

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name)
    const destPath = path.join(dest, entry.name)

    if (entry.isDirectory()) {
      await copyOverwrite(srcPath, destPath)
    } else {
      await fs.promises.copyFile(srcPath, destPath)
    }
  }
}

export async function cleanupOldSnapshots(dataDir: string): Promise<void> {
  const dir = snapshotDir(dataDir)
  let entries: fs.Dirent[]
  try {
    entries = await fs.promises.readdir(dir, { withFileTypes: true })
  } catch {
    return
  }

  const snapshotFiles = entries
    .filter((e) => e.isFile() && e.name.endsWith('.zip'))
    .map((e) => ({
      name: e.name,
      fullPath: path.join(dir, e.name),
      date: parseSnapshotDate(e.name),
    }))
    .filter((f) => f.date > 0)
    .sort((a, b) => b.date - a.date) // newest first

  if (snapshotFiles.length <= 7) return

  // Keep 7 most recent daily + 4 most recent weekly (Sundays)
  const keep = new Set<string>()

  // Keep 7 most recent
  for (let i = 0; i < Math.min(7, snapshotFiles.length); i++) {
    keep.add(snapshotFiles[i].name)
  }

  // Keep 4 weekly (Sundays), skipping already kept
  const sundays = snapshotFiles.filter(
    (f) => new Date(f.date).getDay() === 0,
  )
  let keptSundays = 0
  for (const s of sundays) {
    if (keptSundays >= 4) break
    if (keep.has(s.name)) continue
    keep.add(s.name)
    keptSundays++
  }

  // Delete the rest
  for (const f of snapshotFiles) {
    if (!keep.has(f.name)) {
      try {
        await fs.promises.unlink(f.fullPath)
      } catch {
        // skip
      }
    }
  }
}

function parseSnapshotDate(fileName: string): number {
  // Format: YYYY-MM-DDTHH-MM-SS-SSSZ.zip
  const base = fileName.replace(/\.zip$/i, '')
  const iso = base.replace(/-/g, ':').replace(/T(\d{2}):(\d{2}):(\d{2})/, 'T$1-$2-$3')
  // Try parsing
  const fixed = base.slice(0, 19).replace(/-/g, ':').replace('T', ' ').replace(/-(\d{2})$/, ':$1')
  const d = new Date(fixed)
  return isNaN(d.getTime()) ? 0 : d.getTime()
}

async function checksumFile(filePath: string): Promise<string> {
  const hash = crypto.createHash('sha256')
  const data = await fs.promises.readFile(filePath)
  hash.update(data)
  return hash.digest('hex')
}
