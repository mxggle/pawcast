/** Waveform data with min/max/rms (not just peaks) for proper waveform rendering. */
export interface WaveformLevelData {
  mediaId: string;
  level: number;
  samplesPerPeak: number;
  sampleRate: number;
  min: Int16Array;
  max: Int16Array;
  rms: Uint16Array;
}

export interface WaveformLevelMeta {
  level: number;
  samplesPerPeak: number;
  points: number;
  path: string;
}

export interface WaveformMeta {
  mediaId: string;
  duration: number;
  sampleRate: number;
  levels: WaveformLevelMeta[];
}

/** Multi-resolution levels — choose based on zoom / visible duration. */
export const WAVEFORM_LEVEL_SAMPLES = [256, 512, 1024, 2048, 4096, 8192, 16384, 32768, 65536];

/** Unified time-range selection model — bridges transcript, timeline, and bookmarks. */
export interface TimeRangeSelection {
  type: 'time-range';
  start: number;
  end: number;
  source?: 'timeline' | 'transcript' | 'bookmark';
  wordIds?: string[];
  segmentIds?: string[];
}

export interface WaveformRenderState {
  /** Float32Array of peak values (fallback when min/max/rms not available). */
  peaks: Float32Array | null;
  min: Int16Array | null;
  max: Int16Array | null;
  rms: Uint16Array | null;
  duration: number;
  /** Current zoom level (1 = full view, higher = zoomed in). */
  zoom: number;
  /** Left edge of visible window in seconds. */
  scrollOffset: number;
  /** Playhead position in seconds. */
  playheadTime: number;
  /** A-B loop range in seconds. */
  loopStart: number | null;
  loopEnd: number | null;
  /** Whether the waveform region is being actively dragged as a selection. */
  dragSelection: { start: number; end: number } | null;
}

export type PlaybackClockListener = (time: number) => void;

export interface PlaybackClockOptions {
  /** Max update frequency in Hz (default 60). */
  maxFps?: number;
}
