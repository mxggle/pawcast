import type { TranscriptFile, PersistedTranscriptSegment } from '../types/persistence'
import { dataClient } from './dataClient'

export const transcriptRepository = {
  async loadTranscript(mediaId: string): Promise<TranscriptFile | null> {
    return dataClient.get<TranscriptFile>(`study/transcripts/${mediaId}.json`)
  },
  async loadSegments(mediaId: string): Promise<PersistedTranscriptSegment[]> {
    const data = await this.loadTranscript(mediaId)
    return data?.segments ?? []
  },
  async saveTranscript(mediaId: string, segments: PersistedTranscriptSegment[]): Promise<void> {
    await dataClient.put(`study/transcripts/${mediaId}.json`, {
      version: 1,
      mediaId,
      updatedAt: Date.now(),
      segments,
    })
  },
  async deleteTranscript(mediaId: string): Promise<void> {
    await dataClient.delete(`study/transcripts/${mediaId}.json`)
  },
  async listTranscriptIds(): Promise<string[]> {
    const files = await dataClient.list('study/transcripts')
    return files.map((f: string) => f.replace('.json', ''))
  },
}
