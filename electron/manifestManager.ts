import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import type {
  DataManifest,
  ManifestFileEntry,
} from '../src/types/persistence'

const MANIFEST_FILENAME = 'manifest.json'
const SCHEMA_VERSION = 1

export function createDefaultManifest(
  dataDir: string,
  appVersion: string,
): DataManifest {
  const now = Date.now()
  return {
    schemaVersion: SCHEMA_VERSION,
    appVersion,
    deviceId: crypto.randomUUID(),
    createdAt: now,
    updatedAt: now,
    activeDataDir: dataDir,
    files: [],
  }
}

export function loadManifest(dataDir: string): DataManifest {
  const manifestPath = path.join(dataDir, MANIFEST_FILENAME)

  let raw: string
  try {
    raw = fs.readFileSync(manifestPath, 'utf-8')
  } catch {
    throw new Error(
      `Manifest not found at ${manifestPath}. Run ensureDataDir first.`,
    )
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    const backupPath = `${manifestPath}.corrupted.${Date.now()}`
    try {
      fs.writeFileSync(backupPath, raw, 'utf-8')
    } catch {
      // best effort
    }
    throw new Error(
      `Manifest at ${manifestPath} is corrupted JSON. Backed up to ${backupPath}.`,
    )
  }

  const manifest = parsed as DataManifest

  if (
    typeof manifest?.schemaVersion !== 'number' ||
    manifest.schemaVersion > SCHEMA_VERSION
  ) {
    throw new Error(
      `Unsupported manifest schema version: ${manifest?.schemaVersion}. ` +
      `App supports up to version ${SCHEMA_VERSION}.`,
    )
  }

  if (!Array.isArray(manifest.files)) {
    manifest.files = []
  }

  return manifest
}

export async function saveManifest(
  dataDir: string,
  manifest: DataManifest,
): Promise<void> {
  const manifestPath = path.join(dataDir, MANIFEST_FILENAME)
  manifest.updatedAt = Date.now()

  const json = JSON.stringify(manifest, null, 2)
  const tmpPath = `${manifestPath}.tmp-${crypto.randomUUID()}`

  const fd = await fs.promises.open(tmpPath, 'w')
  await fd.writeFile(json, 'utf-8')
  await fd.sync()
  await fd.close()

  await fs.promises.rename(tmpPath, manifestPath)
}

export function updateFileEntry(
  manifest: DataManifest,
  filePath: string,
  checksum: string,
): void {
  const now = Date.now()
  const existing = manifest.files.find((f) => f.path === filePath)

  if (existing) {
    existing.version += 1
    existing.updatedAt = now
    existing.checksum = checksum
  } else {
    const entry: ManifestFileEntry = {
      path: filePath,
      version: 1,
      updatedAt: now,
      checksum,
    }
    manifest.files.push(entry)
  }
}

export async function checksumFile(filePath: string): Promise<string> {
  const hash = crypto.createHash('sha256')
  const data = await fs.promises.readFile(filePath)
  hash.update(data)
  return hash.digest('hex')
}
