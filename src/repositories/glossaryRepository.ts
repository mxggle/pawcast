import type { GlossaryFile, PersistedGlossaryEntry } from '../types/persistence'
import { dataClient } from './dataClient'

export const glossaryRepository = {
  async loadGlossary(): Promise<PersistedGlossaryEntry[]> {
    const data = await dataClient.get<GlossaryFile>('study/glossary.json')
    return data?.entries ?? []
  },
  async saveGlossary(entries: PersistedGlossaryEntry[]): Promise<void> {
    await dataClient.put('study/glossary.json', { version: 1, entries })
  },
  async addEntry(entry: PersistedGlossaryEntry): Promise<void> {
    const entries = await this.loadGlossary()
    const exists = entries.some((e) => e.id === entry.id)
    if (!exists) {
      entries.push(entry)
      await this.saveGlossary(entries)
    }
  },
  async removeEntry(id: string): Promise<void> {
    const entries = await this.loadGlossary()
    await this.saveGlossary(entries.filter((e) => e.id !== id))
  },
  async getByMediaId(mediaId: string): Promise<PersistedGlossaryEntry[]> {
    const entries = await this.loadGlossary()
    return entries.filter((e) => e.mediaId === mediaId)
  },
}
