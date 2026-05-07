import { create } from "zustand";

export interface MediaFile {
  name: string;
  type: string;
  size: number;
  url: string;
  id?: string;
  storageId?: string;
  nativePath?: string;
}

export interface YouTubeMedia {
  id: string;
  title?: string;
}

export interface MediaState {
  currentFile: MediaFile | null;
  currentYouTube: YouTubeMedia | null;
  isPlaying: boolean;
  isTransitioning: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  mediaVolume: number;
  previousMediaVolume?: number;
  previousVolume?: number;
  playbackRate: number;
  muted: boolean;
  isLoadingMedia: boolean;

  loopStart: number | null;
  loopEnd: number | null;
  isLooping: boolean;
  loopCount: number;
  maxLoops: number;
  autoAdvanceBookmarks: boolean;
  bpm: number | null;
  quantizeLoop: boolean;
  loopDelay: number;

  seekStepSeconds: number;
  seekSmallStepSeconds: number;
  seekMode: "seconds" | "sentence";
}

export interface MediaActions {
  setCurrentFile: (file: MediaFile | null) => void;
  setCurrentYouTube: (youtube: YouTubeMedia | null) => void;
  setIsPlaying: (isPlaying: boolean) => void;
  setIsTransitioning: (isTransitioning: boolean) => void;
  setCurrentTime: (time: number) => void;
  setDuration: (duration: number) => void;
  setVolume: (volume: number) => void;
  setMediaVolume: (volume: number) => void;
  setPreviousMediaVolume: (volume: number) => void;
  setPreviousVolume: (volume: number) => void;
  setPlaybackRate: (rate: number) => void;
  setMuted: (muted: boolean) => void;
  togglePlay: () => void;
  toggleMute: () => void;
  seekForward: (seconds: number) => void;
  seekBackward: (seconds: number) => void;
  setIsLoadingMedia: (loading: boolean) => void;

  setLoopPoints: (start: number | null, end: number | null) => void;
  setIsLooping: (isLooping: boolean) => void;
  setLoopCount: (count: number) => void;
  setMaxLoops: (max: number) => void;
  toggleLooping: () => void;
  moveLoopWindow: (deltaTime: number) => void;
  extendLoopStart: (deltaTime: number) => void;
  extendLoopEnd: (deltaTime: number) => void;
  scaleLoop: (factor: number) => void;
  setBpm: (bpm: number | null) => void;
  setQuantizeLoop: (quantize: boolean) => void;
  quantizeCurrentLoop: () => void;
  setLoopDelay: (delay: number) => void;

  setAutoAdvanceBookmarks: (enable: boolean) => void;
  setSeekStepSeconds: (seconds: number) => void;
  setSeekSmallStepSeconds: (seconds: number) => void;
  setSeekMode: (mode: "seconds" | "sentence") => void;

  getCurrentMediaId: () => string | null;
}

const initialState: MediaState = {
  currentFile: null,
  currentYouTube: null,
  isPlaying: false,
  isTransitioning: false,
  currentTime: 0,
  duration: 0,
  volume: 1,
  mediaVolume: 1,
  playbackRate: 1,
  muted: false,
  isLoadingMedia: false,
  loopStart: null,
  loopEnd: null,
  isLooping: false,
  loopCount: 0,
  maxLoops: 0,
  autoAdvanceBookmarks: false,
  bpm: null,
  quantizeLoop: false,
  loopDelay: 0,
  seekStepSeconds: 5,
  seekSmallStepSeconds: 1,
  seekMode: "seconds",
};

export const useMediaStore = create<MediaState & MediaActions>()((set, get) => ({
  ...initialState,

  setCurrentFile: (file) => {
    const previousUrl = get().currentFile?.url;
    if (file) {
      set({
        currentFile: file,
        currentYouTube: null,
        currentTime: 0,
        isPlaying: false,
        loopStart: null,
        loopEnd: null,
        isLooping: false,
      });
    } else {
      set({
        currentFile: null,
        currentTime: 0,
        isPlaying: false,
        loopStart: null,
        loopEnd: null,
        isLooping: false,
      });
    }
    if (previousUrl && previousUrl.startsWith("blob:") && previousUrl !== file?.url) {
      URL.revokeObjectURL(previousUrl);
    }
  },

  setCurrentYouTube: (youtube) => {
    const prevUrl = get().currentFile?.url;
    if (prevUrl?.startsWith("blob:")) URL.revokeObjectURL(prevUrl);
    set({
      currentYouTube: youtube,
      currentFile: null,
      currentTime: 0,
      isPlaying: false,
      loopStart: null,
      loopEnd: null,
      isLooping: false,
    });
  },

  setIsPlaying: (isPlaying) => set({ isPlaying }),
  setIsTransitioning: (isTransitioning) => set({ isTransitioning }),
  setCurrentTime: (currentTime) => set({ currentTime }),
  setDuration: (duration) => set({ duration }),
  setVolume: (volume) => set({ volume }),
  setMediaVolume: (mediaVolume) => set({ mediaVolume }),
  setPreviousMediaVolume: (previousMediaVolume) => set({ previousMediaVolume }),
  setPreviousVolume: (previousVolume) => set({ previousVolume }),
  setPlaybackRate: (playbackRate) => set({ playbackRate }),
  setMuted: (muted) => set({ muted }),
  togglePlay: () => set((state) => ({ isPlaying: !state.isPlaying })),
  toggleMute: () => {
    const { muted, volume, previousVolume } = get();
    if (muted) {
      if (volume === 0) {
        set({ volume: previousVolume && previousVolume > 0 ? previousVolume : 1, muted: false });
      } else {
        set({ muted: false });
      }
    } else {
      set({ previousVolume: volume, volume: 0, muted: true });
    }
  },

  seekForward: (seconds) => {
    const { currentTime, duration } = get();
    set({ currentTime: Math.min(currentTime + seconds, duration) });
  },

  seekBackward: (seconds) => {
    const { currentTime } = get();
    set({ currentTime: Math.max(currentTime - seconds, 0) });
  },

  setIsLoadingMedia: (loading) => set({ isLoadingMedia: loading }),

  setLoopPoints: (loopStart, loopEnd) => set({ loopStart, loopEnd }),
  setIsLooping: (isLooping) => set({ isLooping }),
  setLoopCount: (loopCount) => set({ loopCount }),
  setMaxLoops: (maxLoops) => set({ maxLoops }),
  toggleLooping: () => {
    set((state) => ({ isLooping: !state.isLooping, loopCount: 0 }));
  },
  moveLoopWindow: (deltaTime) => {
    const { loopStart, loopEnd, duration } = get();
    if (loopStart === null || loopEnd === null) return;
    let newStart = loopStart + deltaTime;
    let newEnd = loopEnd + deltaTime;
    if (newStart < 0) { newStart = 0; newEnd = Math.min(newEnd - newStart + loopEnd, duration); }
    if (newEnd > duration) { newEnd = duration; newStart = Math.max(loopStart - (newEnd - loopEnd), 0); }
    set({ loopStart: newStart, loopEnd: newEnd });
  },
  extendLoopStart: (deltaTime) => {
    const { loopStart, loopEnd } = get();
    if (loopStart === null || loopEnd === null) return;
    const newStart = Math.max(0, loopStart + deltaTime);
    if (newStart < loopEnd) set({ loopStart: newStart });
  },
  extendLoopEnd: (deltaTime) => {
    const { loopStart, loopEnd, duration } = get();
    if (loopStart === null || loopEnd === null) return;
    const newEnd = Math.min(duration, loopEnd + deltaTime);
    if (newEnd > loopStart) set({ loopEnd: newEnd });
  },
  scaleLoop: (factor) => {
    const { loopStart, loopEnd, duration } = get();
    if (loopStart === null || loopEnd === null) return;
    const center = (loopStart + loopEnd) / 2;
    const halfLength = (loopEnd - loopStart) / 2 * factor;
    set({
      loopStart: Math.max(0, center - halfLength),
      loopEnd: Math.min(duration, center + halfLength),
    });
  },
  setBpm: (bpm) => set({ bpm }),
  setQuantizeLoop: (quantizeLoop) => set({ quantizeLoop }),
  quantizeCurrentLoop: () => {
    const { loopStart, loopEnd, bpm } = get();
    if (loopStart === null || loopEnd === null || !bpm) return;
    const beats = Math.max(1, Math.round((loopEnd - loopStart) / (60 / bpm)));
    set({ loopEnd: loopStart + beats * (60 / bpm) });
  },
  setLoopDelay: (loopDelay) => set({ loopDelay }),

  setAutoAdvanceBookmarks: (autoAdvanceBookmarks) => set({ autoAdvanceBookmarks }),
  setSeekStepSeconds: (seconds) => set({ seekStepSeconds: Math.max(0.1, Math.min(120, seconds)) }),
  setSeekSmallStepSeconds: (seconds) => set({ seekSmallStepSeconds: Math.max(0.05, Math.min(10, seconds)) }),
  setSeekMode: (seekMode) => set({ seekMode }),

  getCurrentMediaId: () => {
    const { currentFile, currentYouTube } = get();
    if (currentFile) {
      return currentFile.storageId || currentFile.id || `file-${currentFile.name}-${currentFile.size}`;
    }
    if (currentYouTube) return `youtube-${currentYouTube.id}`;
    return null;
  },
}));
