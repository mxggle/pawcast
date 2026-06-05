import fs from 'fs'
import path from 'path'
import { loadManifest, checksumFile } from './manifestManager'
import { readJSON, listDir } from './dataStore'
import { replayCommitted, rollbackPending } from './journalManager'
import type {
  HealthCheckResult,
  RecoveryResult,
  ShadowingIndexFile,
  SentencePracticeIndexFile,
  ImportedMediaIndexFile,
} from '../src/types/persistence'

export async function runHealthCheck(dataDir: string): Promise<HealthCheckResult> {
  const result: HealthCheckResult = {
    manifestOk: false,
    failedChecksums: [],
    orphanedReferences: [],
    corruptedFiles: [],
    status: 'healthy',
  }

  let manifest
  try {
    manifest = loadManifest(dataDir)
    result.manifestOk = true
  } catch {
    result.status = 'damaged'
    return result
  }

  // Check manifest file entries
  for (const entry of manifest.files) {
    const fullPath = path.join(dataDir, entry.path)
    try {
      const actual = await checksumFile(fullPath)
      if (actual !== entry.checksum) {
        result.failedChecksums.push(entry.path)
      }
    } catch {
      result.failedChecksums.push(entry.path)
      result.corruptedFiles.push(entry.path)
    }
  }

  // Check orphan references in recording indexes
  await checkRecordingOrphans(dataDir, result)
  await checkImportedMediaOrphans(dataDir, result)

  if (result.corruptedFiles.length > 0 || result.failedChecksums.length > 0) {
    result.status = 'damaged'
  } else if (result.orphanedReferences.length > 0) {
    result.status = 'degraded'
  }

  return result
}

async function checkRecordingOrphans(
  dataDir: string,
  result: HealthCheckResult,
): Promise<void> {
  const shadowIndex = await readJSON<ShadowingIndexFile>(
    dataDir,
    'recordings/shadowing/index.json',
  )
  if (shadowIndex) {
    for (const seg of shadowIndex.segments) {
      const filePath = path.join(dataDir, seg.filePath)
      try {
        await fs.promises.access(filePath)
      } catch {
        result.orphanedReferences.push(seg.filePath)
      }
    }
  }

  const sentenceIndex = await readJSON<SentencePracticeIndexFile>(
    dataDir,
    'recordings/sentence-practice/index.json',
  )
  if (sentenceIndex) {
    for (const rec of sentenceIndex.recordings) {
      const filePath = path.join(dataDir, rec.filePath)
      try {
        await fs.promises.access(filePath)
      } catch {
        result.orphanedReferences.push(rec.filePath)
      }
    }
  }
}

async function checkImportedMediaOrphans(
  dataDir: string,
  result: HealthCheckResult,
): Promise<void> {
  const mediaIndex = await readJSON<ImportedMediaIndexFile>(
    dataDir,
    'media/imported/index.json',
  )
  if (mediaIndex) {
    for (const file of mediaIndex.files) {
      const filePath = path.join(dataDir, file.filePath)
      try {
        await fs.promises.access(filePath)
      } catch {
        result.orphanedReferences.push(file.filePath)
      }
    }
  }
}

export async function recover(
  dataDir: string,
  strategy: 'journal' | 'snapshot' | 'remigrate',
): Promise<RecoveryResult> {
  const recoveredFiles: string[] = []
  const failedFiles: string[] = []

  if (strategy === 'journal') {
    try {
      await replayCommitted(dataDir)
      await rollbackPending(dataDir)
    } catch (err) {
      return {
        success: false,
        recoveredFiles: [],
        failedFiles: [],
        message: `Journal recovery failed: ${err instanceof Error ? err.message : String(err)}`,
      }
    }
    return {
      success: true,
      recoveredFiles,
      failedFiles,
      message: 'Journal replay completed',
    }
  }

  return {
    success: false,
    recoveredFiles,
    failedFiles,
    message: `Recovery strategy "${strategy}" not yet implemented`,
  }
}
