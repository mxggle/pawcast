import type { TranscriptStudyFile, PersistedSegmentStudy } from '../types/persistence'
import { dataClient } from './dataClient'

export const transcriptStudyRepository = {
  async loadStudy(mediaId: string): Promise<PersistedSegmentStudy[]> {
    const data = await dataClient.get<TranscriptStudyFile>(
      `study/transcript-study/${mediaId}.json`,
    )
    return data?.segmentStudies ?? []
  },
  async saveStudy(mediaId: string, segmentStudies: PersistedSegmentStudy[]): Promise<void> {
    await dataClient.put(`study/transcript-study/${mediaId}.json`, {
      version: 1,
      mediaId,
      updatedAt: Date.now(),
      segmentStudies,
    })
  },
  async deleteStudy(mediaId: string): Promise<void> {
    await dataClient.delete(`study/transcript-study/${mediaId}.json`)
  },
}
