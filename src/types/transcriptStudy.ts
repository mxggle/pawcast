export type CEFRLevel = "A1" | "A2" | "B1" | "B2" | "C1" | "C2";
export type JLPTLevel = "N5" | "N4" | "N3" | "N2" | "N1";
export type TranscriptStudyLevel = CEFRLevel | JLPTLevel;
export type TranscriptLevelSystem = "cefr" | "jlpt";

export type TranscriptStudyItemType = "word" | "expression";

export interface TranscriptStudyItem {
  text: string;
  normalizedText: string;
  start: number;
  end: number;
  level: TranscriptStudyLevel;
  type: TranscriptStudyItemType;
}

export interface SegmentTranscriptStudy {
  items: TranscriptStudyItem[];
  levelSystem: TranscriptLevelSystem;
  updatedAt: number;
}

export interface MediaTranscriptStudy {
  [segmentId: string]: SegmentTranscriptStudy;
}

export interface TranscriptSelectionRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

export interface TranscriptSelectionState {
  segmentId: string;
  text: string;
  start: number;
  end: number;
  rect: TranscriptSelectionRect;
  matchedItem: TranscriptStudyItem | null;
  timeRange?: { start: number; end: number };
}

export interface GlossaryEntry {
  id: string;
  mediaId: string;
  mediaName: string;
  mediaType?: string;
  youtubeId?: string;
  segmentId: string;
  text: string;
  contextText: string;
  selectionStart: number;
  selectionEnd: number;
  startTime: number;
  endTime: number;
  createdAt: number;
  updatedAt: number;
}

export interface CreateGlossaryEntryInput {
  mediaId: string;
  mediaName: string;
  mediaType?: string;
  youtubeId?: string;
  segmentId: string;
  text: string;
  contextText: string;
  selectionStart: number;
  selectionEnd: number;
  startTime: number;
  endTime: number;
}
