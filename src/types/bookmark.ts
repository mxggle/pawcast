export interface LoopBookmark {
  id: string;
  name: string;
  start: number;
  end: number;
  createdAt: number;
  mediaName?: string;
  mediaType?: string;
  youtubeId?: string;
  playbackRate?: number;
  annotation?: string;
  wordIds?: string[];
  segmentIds?: string[];
}

export interface MediaBookmarks {
  [mediaId: string]: LoopBookmark[];
}
