import type { MigrationPayload } from '../types/persistence'

async function readAllFromStore(db: IDBDatabase, storeName: string): Promise<unknown[]> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly')
    const store = tx.objectStore(storeName)
    const req = store.getAll()
    req.onsuccess = () => resolve(req.result || [])
    req.onerror = () => reject(req.error)
  })
}

async function openIndexedDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('abloop-media-storage', 4)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export async function collectLocalStorageData(): Promise<Record<string, string>> {
  const keys = ['shadowing-store', 'sentence-practice-store']
  const data: Record<string, string> = {}
  for (const key of keys) {
    try {
      const value = localStorage.getItem(key)
      if (value) data[key] = value
    } catch { /* localStorage may not be available */ }
  }
  return data
}

export async function collectIndexedDBData(): Promise<MigrationPayload['indexedDB']> {
  let db: IDBDatabase | null = null
  try {
    db = await openIndexedDB()
  } catch {
    return { mediaFiles: [], transcripts: [] }
  }

  try {
    const rawMediaFiles = await readAllFromStore(db, 'media-files')
    const rawTranscripts = await readAllFromStore(db, 'transcripts')

    const mediaFiles = await Promise.all((rawMediaFiles as Array<Record<string, unknown>>).map(async (f) => {
      let fileData: number[] = []
      if (f.fileData instanceof ArrayBuffer) {
        fileData = Array.from(new Uint8Array(f.fileData))
      } else if (f.fileData instanceof Blob) {
        fileData = Array.from(new Uint8Array(await f.fileData.arrayBuffer()))
      }
      return {
        id: String(f.id || ''),
        fileData,
        fileType: String(f.fileType || ''),
        fileName: String(f.fileName || ''),
        fileSize: Number(f.fileSize || 0),
        timestamp: Number(f.timestamp || Date.now()),
      }
    }))

    const transcripts = (rawTranscripts as Array<Record<string, unknown>>).map((t) => ({
      mediaId: String(t.mediaId || ''),
      segments: (t.segments || []) as unknown[],
      studyBySegment: t.studyBySegment as Record<string, unknown> | undefined,
      updatedAt: Number(t.updatedAt || Date.now()),
    }))

    return { mediaFiles, transcripts }
  } finally {
    db.close()
  }
}

export async function runMigrationIfNeeded(): Promise<boolean> {
  if (!window.electronAPI) return false

  try {
    const isMigrated = await window.electronAPI.dataIsMigrated()
    if (isMigrated) return false
  } catch {
    return false
  }

  try {
    const localStorageData = await collectLocalStorageData()
    const indexedDBData = await collectIndexedDBData()
    const result = await window.electronAPI.dataRunMigration(localStorageData, indexedDBData)
    console.log('Migration result:', result)
    return result.success
  } catch (err) {
    console.error('Migration failed:', err)
    return false
  }
}
