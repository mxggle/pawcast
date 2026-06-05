export interface TranscriptWord {
  id: string;
  text: string;
  start: number;  // seconds
  end: number;    // seconds
  confidence?: number;
  speakerId?: string;
  paragraphId?: string;
  segmentId?: string;
  isDeleted?: boolean;
}
