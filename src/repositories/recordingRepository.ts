import type {
  ShadowingIndexFile,
  PersistedShadowingSegment,
  SentencePracticeIndexFile,
  PersistedSentenceRecording,
} from '../types/persistence'
import { dataClient } from './dataClient'

export const recordingRepository = {
  // ─── Shadowing ────────────────────────────────────────────
  async loadShadowingIndex(): Promise<PersistedShadowingSegment[]> {
    const data = await dataClient.get<ShadowingIndexFile>('recordings/shadowing/index.json')
    return data?.segments ?? []
  },
  async saveShadowingIndex(segments: PersistedShadowingSegment[]): Promise<void> {
    await dataClient.put('recordings/shadowing/index.json', { version: 1, segments })
  },
  async addShadowingSegment(segment: PersistedShadowingSegment): Promise<void> {
    const segments = await this.loadShadowingIndex()
    const exists = segments.some((s) => s.id === segment.id)
    if (!exists) {
      segments.push(segment)
      await this.saveShadowingIndex(segments)
    }
  },
  async removeShadowingSegment(id: string): Promise<void> {
    const segments = await this.loadShadowingIndex()
    const target = segments.find((s) => s.id === id)
    if (target?.filePath) {
      try {
        await dataClient.delete(target.filePath)
      } catch { /* file may not exist */ }
    }
    await this.saveShadowingIndex(segments.filter((s) => s.id !== id))
  },

  // ─── Sentence Practice ────────────────────────────────────
  async loadSentenceIndex(): Promise<PersistedSentenceRecording[]> {
    const data = await dataClient.get<SentencePracticeIndexFile>(
      'recordings/sentence-practice/index.json',
    )
    return data?.recordings ?? []
  },
  async saveSentenceIndex(recordings: PersistedSentenceRecording[]): Promise<void> {
    await dataClient.put('recordings/sentence-practice/index.json', { version: 1, recordings })
  },
  async addSentenceRecording(recording: PersistedSentenceRecording): Promise<void> {
    const recordings = await this.loadSentenceIndex()
    const exists = recordings.some((r) => r.id === recording.id)
    if (!exists) {
      recordings.push(recording)
      await this.saveSentenceIndex(recordings)
    }
  },
  async removeSentenceRecording(id: string): Promise<void> {
    const recordings = await this.loadSentenceIndex()
    const target = recordings.find((r) => r.id === id)
    if (target?.filePath) {
      try {
        await dataClient.delete(target.filePath)
      } catch { /* file may not exist */ }
    }
    await this.saveSentenceIndex(recordings.filter((r) => r.id !== id))
  },

  // ─── Binary data ──────────────────────────────────────────
  async getRecordingData(filePath: string): Promise<ArrayBuffer | null> {
    return dataClient.getBinary(filePath)
  },
  async saveRecordingData(filePath: string, blob: Blob): Promise<void> {
    const buffer = await blob.arrayBuffer()
    await dataClient.putBinary(filePath, buffer)
  },
  async deleteRecording(filePath: string): Promise<void> {
    try {
      await dataClient.delete(filePath)
    } catch { /* may not exist */ }
  },
}
