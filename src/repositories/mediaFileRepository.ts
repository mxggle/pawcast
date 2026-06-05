import type { ImportedMediaIndexFile, ImportedMediaEntry } from '../types/persistence'
import { dataClient } from './dataClient'

export const mediaFileRepository = {
  async loadIndex(): Promise<ImportedMediaEntry[]> {
    const data = await dataClient.get<ImportedMediaIndexFile>('media/imported/index.json')
    return data?.files ?? []
  },
  async saveIndex(files: ImportedMediaEntry[]): Promise<void> {
    await dataClient.put('media/imported/index.json', { version: 1, files })
  },
  async addEntry(entry: ImportedMediaEntry): Promise<void> {
    const files = await this.loadIndex()
    const exists = files.some((f) => f.id === entry.id)
    if (!exists) {
      files.push(entry)
      await this.saveIndex(files)
    }
  },
  async removeEntry(id: string): Promise<void> {
    const files = await this.loadIndex()
    const target = files.find((f) => f.id === id)
    if (target?.filePath) {
      try {
        await dataClient.delete(target.filePath)
      } catch { /* file may not exist */ }
    }
    await this.saveIndex(files.filter((f) => f.id !== id))
  },
  async getImportedFile(filePath: string): Promise<ArrayBuffer | null> {
    return dataClient.getBinary(filePath)
  },
  async saveImportedFile(filePath: string, blob: Blob): Promise<void> {
    const buffer = await blob.arrayBuffer()
    await dataClient.putBinary(filePath, buffer)
  },
  async deleteImportedFile(id: string): Promise<void> {
    await this.removeEntry(id)
  },
}
