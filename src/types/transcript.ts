import type { TranscriptWord } from "./transcriptWord";
import type { MediaTranscriptStudy } from "./transcriptStudy";

export interface TranscriptSegment {
  id: string;
  text: string;
  startTime: number;
  endTime: number;
  confidence: number;
  isFinal: boolean;
  words?: TranscriptWord[];
  wordIds?: string[];
}

export interface MediaTranscripts {
  [mediaId: string]: TranscriptSegment[];
}

export interface MediaTranscriptStudies {
  [mediaId: string]: MediaTranscriptStudy;
}
