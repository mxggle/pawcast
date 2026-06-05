import type { BookmarkFile, PersistedBookmark } from '../types/persistence'
import { dataClient } from './dataClient'

export const bookmarkRepository = {
  async loadBookmarks(): Promise<PersistedBookmark[]> {
    const data = await dataClient.get<BookmarkFile>('study/bookmarks.json')
    return data?.bookmarks ?? []
  },
  async saveBookmarks(bookmarks: PersistedBookmark[]): Promise<void> {
    await dataClient.put('study/bookmarks.json', { version: 1, bookmarks })
  },
  async addBookmark(bookmark: PersistedBookmark): Promise<void> {
    const bookmarks = await this.loadBookmarks()
    const exists = bookmarks.some(
      (b) =>
        b.mediaId === bookmark.mediaId &&
        Math.abs(b.start - bookmark.start) < 0.05,
    )
    if (!exists) {
      bookmarks.push(bookmark)
      await this.saveBookmarks(bookmarks)
    }
  },
  async removeBookmark(id: string): Promise<void> {
    const bookmarks = await this.loadBookmarks()
    await this.saveBookmarks(bookmarks.filter((b) => b.id !== id))
  },
  async updateBookmark(id: string, updates: Partial<PersistedBookmark>): Promise<void> {
    const bookmarks = await this.loadBookmarks()
    const idx = bookmarks.findIndex((b) => b.id === id)
    if (idx >= 0) {
      bookmarks[idx] = { ...bookmarks[idx], ...updates }
      await this.saveBookmarks(bookmarks)
    }
  },
}
