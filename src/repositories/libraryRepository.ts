import type {
  MediaHistoryFile,
  MediaHistoryItem,
  MediaFoldersFile,
  MediaFolderEntry,
  MediaSourcesFile,
} from '../types/persistence'
import { dataClient } from './dataClient'

export const libraryRepository = {
  async loadHistory(): Promise<MediaHistoryItem[]> {
    const data = await dataClient.get<MediaHistoryFile>('library/media-history.json')
    return data?.items ?? []
  },
  async saveHistory(items: MediaHistoryItem[]): Promise<void> {
    await dataClient.put('library/media-history.json', { version: 1, items })
  },
  async addToHistory(item: MediaHistoryItem): Promise<void> {
    const items = await this.loadHistory()
    const existing = items.findIndex((i) => i.mediaId === item.mediaId)
    if (existing >= 0) {
      items[existing] = { ...items[existing], ...item, accessedAt: Date.now() }
    } else {
      items.unshift(item)
    }
    await this.saveHistory(items)
  },
  async removeFromHistory(mediaId: string): Promise<void> {
    const items = await this.loadHistory()
    await this.saveHistory(items.filter((i) => i.mediaId !== mediaId))
  },
  async loadSourceFolders(): Promise<string[]> {
    const data = await dataClient.get<MediaSourcesFile>('library/media-sources.json')
    return data?.folders ?? []
  },
  async saveSourceFolders(folders: string[]): Promise<void> {
    await dataClient.put('library/media-sources.json', { version: 1, folders })
  },
  async loadFolders(): Promise<MediaFolderEntry[]> {
    const data = await dataClient.get<MediaFoldersFile>('library/media-folders.json')
    return data?.folders ?? []
  },
  async saveFolders(folders: MediaFolderEntry[]): Promise<void> {
    await dataClient.put('library/media-folders.json', { version: 1, folders })
  },
}
