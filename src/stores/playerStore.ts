import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { toast } from "react-hot-toast";
import i18n from "../i18n";
import { electronStorage } from "./electronStorage";
import {
  retrieveMediaFile,
  deleteMediaFile,
  clearAllStoredTranscripts,
} from "../utils/mediaStorage";
import { nativePathToUrl } from "../utils/platform";
import { getNextSentenceSeekTime, getPreviousSentenceSeekTime } from "../utils/sentenceSeek";
import { useMediaStore } from "./mediaStore";
import { useBookmarkStore } from "./bookmarkStore";
import { useTranscriptStore } from "./transcriptStore";
import type { MediaFile, YouTubeMedia } from "./mediaStore";
import type { LoopBookmark, MediaBookmarks } from "../types/bookmark";
import type { TranscriptSegment, MediaTranscripts, MediaTranscriptStudies } from "../types/transcript";
import type { GlossaryEntry, CreateGlossaryEntryInput } from "../types/transcriptStudy";

// Re-export sub-stores
export { useMediaStore } from "./mediaStore";
export { useBookmarkStore } from "./bookmarkStore";
export { useTranscriptStore } from "./transcriptStore";
export type { MediaFile, YouTubeMedia } from "./mediaStore";
export type { LoopBookmark, MediaBookmarks } from "../types/bookmark";
export type { TranscriptSegment, MediaTranscripts, MediaTranscriptStudies } from "../types/transcript";

export const revokeObjectUrlIfNeeded = (url?: string | null) => {
  if (url?.startsWith("blob:")) URL.revokeObjectURL(url);
};

export interface MediaHistoryItem {
  id: string;
  type: "file" | "youtube";
  name: string;
  accessedAt: number;
  folderId?: string | null;
  playbackTime?: number;
  fileData?: Omit<MediaFile, "id">;
  youtubeData?: { title?: string; youtubeId?: string };
  storageId?: string;
  nativePath?: string;
}

export interface MediaFolder {
  id: string;
  name: string;
  createdAt: number;
  parentId: string | null;
}

type PersistedPlayerStoreState = {
  mediaFolders?: Record<string, { parentId?: string | null; name?: string; createdAt?: number; id?: string }>;
  historyFolderFilter?: string;
  sourceFolder?: string;
  sourceFolders?: string[];
};

export interface PlayerState {
  // Mirrored from mediaStore
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

  // Mirrored from bookmarkStore
  mediaBookmarks: MediaBookmarks;
  selectedBookmarkId: string | null;

  // Mirrored from transcriptStore
  mediaTranscripts: MediaTranscripts;
  mediaTranscriptStudy: MediaTranscriptStudies;
  glossaryEntries: GlossaryEntry[];
  isTranscriptLoading: boolean;
  showTranscript: boolean;
  isTranscribing: boolean;
  transcriptLanguage: string;

  // Owned
  recentYouTubeVideos: YouTubeMedia[];
  mediaHistory: MediaHistoryItem[];
  historyLimit: number;
  mediaFolders: Record<string, MediaFolder>;
  historySortBy: "date" | "name" | "type";
  historySortOrder: "asc" | "desc";
  historyFolderFilter: "all" | "unfiled" | string;
  sourceFolders: string[];
  isSidebarOpen: boolean;
  sidebarWidth: number;
  activeSidebarTab: "recent" | "folders";
  sidebarSections: { explorer: boolean; recent: boolean };
}

export interface PlayerActions {
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

  addBookmark: (bookmark: Omit<LoopBookmark, "id" | "createdAt">) => boolean;
  updateBookmark: (id: string, changes: Partial<LoopBookmark>) => void;
  deleteBookmark: (id: string) => void;
  loadBookmark: (id: string) => void;
  setSelectedBookmarkId: (id: string | null) => void;
  importBookmarks: (bookmarks: LoopBookmark[]) => void;
  getCurrentMediaBookmarks: () => LoopBookmark[];

  startTranscribing: () => void;
  stopTranscribing: () => void;
  toggleTranscribing: () => void;
  addTranscriptSegment: (segment: Omit<TranscriptSegment, "id">) => void;
  addTranscriptSegments: (segments: Array<Omit<TranscriptSegment, "id">>) => void;
  updateTranscriptSegment: (id: string, changes: Partial<TranscriptSegment>) => void;
  clearTranscript: () => void;
  setShowTranscript: (show: boolean) => void;
  toggleShowTranscript: () => void;
  setTranscriptLanguage: (language: string) => void;
  exportTranscript: (format: "txt" | "srt" | "vtt") => string;
  importTranscript: (file: File) => Promise<void>;
  createBookmarkFromTranscript: (segmentId: string) => void;
  loadTranscriptForMedia: (mediaId: string) => Promise<void>;
  addGlossaryEntry: (entry: CreateGlossaryEntryInput) => boolean;
  deleteGlossaryEntry: (id: string) => void;
  playGlossaryEntryContext: (id: string) => boolean;
  getCurrentMediaTranscripts: () => TranscriptSegment[];

  getCurrentMediaId: () => string | null;

  addRecentYouTubeVideo: (video: YouTubeMedia) => void;
  clearRecentYouTubeVideos: () => void;
  addToMediaHistory: (item: Omit<MediaHistoryItem, "id" | "accessedAt">) => void;
  updateHistoryPlaybackTime: (id: string, time: number) => void;
  loadFromHistory: (historyItemId: string) => void;
  removeFromHistory: (historyItemId: string) => Promise<void>;
  clearMediaHistory: () => Promise<void>;
  setHistoryLimit: (limit: number) => void;

  addSourceFolder: (path: string) => void;
  removeSourceFolder: (path: string) => void;

  createMediaFolder: (name: string, parentId?: string | null) => string;
  renameMediaFolder: (folderId: string, newName: string) => void;
  deleteMediaFolder: (folderId: string) => void;
  moveHistoryItemToFolder: (historyItemId: string, folderId: string | null) => void;
  renameHistoryItem: (historyItemId: string, newName: string) => void;
  setHistorySort: (by: "date" | "name" | "type", order: "asc" | "desc") => void;
  setHistoryFolderFilter: (filter: "all" | "unfiled" | string) => void;

  setIsSidebarOpen: (isOpen: boolean) => void;
  setSidebarWidth: (width: number) => void;
  setActiveSidebarTab: (tab: "recent" | "folders") => void;
  toggleSidebarSection: (section: "explorer" | "recent") => void;
}

const initialState: PlayerState = {
  currentFile: null, currentYouTube: null, isPlaying: false, isTransitioning: false,
  currentTime: 0, duration: 0, volume: 1, mediaVolume: 1, playbackRate: 1, muted: false,
  isLoadingMedia: false,
  loopStart: null, loopEnd: null, isLooping: false, loopCount: 0, maxLoops: 0,
  autoAdvanceBookmarks: false, bpm: null, quantizeLoop: false, loopDelay: 0,
  seekStepSeconds: 5, seekSmallStepSeconds: 1, seekMode: "seconds",
  mediaBookmarks: {}, selectedBookmarkId: null,
  mediaTranscripts: {}, mediaTranscriptStudy: {}, glossaryEntries: [],
  isTranscriptLoading: false, showTranscript: false, isTranscribing: false, transcriptLanguage: "en-US",
  recentYouTubeVideos: [], mediaHistory: [], historyLimit: 30,
  mediaFolders: {}, historySortBy: "date", historySortOrder: "desc", historyFolderFilter: "unfiled",
  sourceFolders: [],
  isSidebarOpen: false, sidebarWidth: 288, activeSidebarTab: "recent",
  sidebarSections: { explorer: true, recent: true },
};

export const usePlayerStore = create<PlayerState & PlayerActions>()(
  persist(
    (set, get) => {
      // ── Sub-store subscriptions (keep playerStore mirrors in sync) ──
      useMediaStore.subscribe(() => {
        const ms = useMediaStore.getState();
        set({
          currentFile: ms.currentFile, currentYouTube: ms.currentYouTube,
          isPlaying: ms.isPlaying, isTransitioning: ms.isTransitioning,
          currentTime: ms.currentTime, duration: ms.duration,
          volume: ms.volume, mediaVolume: ms.mediaVolume,
          previousMediaVolume: ms.previousMediaVolume, previousVolume: ms.previousVolume,
          playbackRate: ms.playbackRate, muted: ms.muted, isLoadingMedia: ms.isLoadingMedia,
          loopStart: ms.loopStart, loopEnd: ms.loopEnd, isLooping: ms.isLooping,
          loopCount: ms.loopCount, maxLoops: ms.maxLoops,
          autoAdvanceBookmarks: ms.autoAdvanceBookmarks,
          bpm: ms.bpm, quantizeLoop: ms.quantizeLoop, loopDelay: ms.loopDelay,
          seekStepSeconds: ms.seekStepSeconds, seekSmallStepSeconds: ms.seekSmallStepSeconds,
          seekMode: ms.seekMode,
        });
      });

      useBookmarkStore.subscribe(() => {
        const bs = useBookmarkStore.getState();
        set({ mediaBookmarks: bs.mediaBookmarks, selectedBookmarkId: bs.selectedBookmarkId });
      });

      useTranscriptStore.subscribe(() => {
        const ts = useTranscriptStore.getState();
        set({
          mediaTranscripts: ts.mediaTranscripts, mediaTranscriptStudy: ts.mediaTranscriptStudy,
          glossaryEntries: ts.glossaryEntries, isTranscriptLoading: ts.isTranscriptLoading,
          showTranscript: ts.showTranscript, isTranscribing: ts.isTranscribing,
          transcriptLanguage: ts.transcriptLanguage,
        });
      });

      return {
        ...initialState,

        // ── Enriched Media actions ──
        setCurrentFile: async (file) => {
          useMediaStore.getState().setCurrentFile(file);
          if (file) {
            const isNativeFile = !!file.nativePath;
            let storageId = file.storageId;
            if (!isNativeFile && !storageId) {
              try {
                const { storeMediaFile } = await import("../utils/mediaStorage");
                const currentId = useMediaStore.getState().currentFile?.storageId;
                storageId = await storeMediaFile(file as unknown as File, undefined, undefined, currentId ? [currentId] : []);
              } catch (_) { /* ignore */ }
            }
            get().addToMediaHistory({
              type: "file",
              name: file.name,
              fileData: { name: file.name, type: file.type, size: file.size, url: file.url, nativePath: file.nativePath },
              storageId: isNativeFile ? undefined : storageId,
              nativePath: file.nativePath,
            });
            const mediaId = storageId || file.id || `file-${file.name}-${file.size}`;
            useTranscriptStore.getState().loadTranscriptForMedia(mediaId);
          }
        },

        setCurrentYouTube: async (youtube) => {
          useMediaStore.getState().setCurrentYouTube(youtube);
          if (youtube) {
            get().addRecentYouTubeVideo(youtube);
            get().addToMediaHistory({
              type: "youtube",
              name: youtube.title || `YouTube Video: ${youtube.id}`,
              youtubeData: { title: youtube.title, youtubeId: youtube.id },
            });
            if (youtube.id) {
              useTranscriptStore.getState().loadTranscriptForMedia(`youtube-${youtube.id}`);
            }
          }
        },

        setIsPlaying: (v) => useMediaStore.setState({ isPlaying: v }),
        setIsTransitioning: (v) => useMediaStore.setState({ isTransitioning: v }),
        setCurrentTime: (v) => useMediaStore.setState({ currentTime: v }),
        setDuration: (v) => useMediaStore.setState({ duration: v }),
        setVolume: (v) => useMediaStore.setState({ volume: v }),
        setMediaVolume: (v) => useMediaStore.setState({ mediaVolume: v }),
        setPreviousMediaVolume: (v) => useMediaStore.setState({ previousMediaVolume: v }),
        setPreviousVolume: (v) => useMediaStore.setState({ previousVolume: v }),
        setPlaybackRate: (v) => useMediaStore.setState({ playbackRate: v }),
        setMuted: (v) => useMediaStore.setState({ muted: v }),
        togglePlay: () => useMediaStore.getState().togglePlay(),
        toggleMute: () => useMediaStore.getState().toggleMute(),

        seekForward: (seconds) => {
          const ms = useMediaStore.getState();
          if (ms.seekMode === "sentence") {
            const transcripts = useTranscriptStore.getState().getCurrentMediaTranscripts();
            const nextTime = getNextSentenceSeekTime(transcripts, ms.currentTime);
            if (nextTime !== null) { useMediaStore.setState({ currentTime: nextTime }); return; }
          }
          useMediaStore.getState().seekForward(seconds);
        },

        seekBackward: (seconds) => {
          const ms = useMediaStore.getState();
          if (ms.seekMode === "sentence") {
            const transcripts = useTranscriptStore.getState().getCurrentMediaTranscripts();
            const prevTime = getPreviousSentenceSeekTime(transcripts, ms.currentTime);
            if (prevTime !== null) { useMediaStore.setState({ currentTime: prevTime }); return; }
          }
          useMediaStore.getState().seekBackward(seconds);
        },

        setIsLoadingMedia: (v) => useMediaStore.setState({ isLoadingMedia: v }),

        setLoopPoints: (s, e) => useMediaStore.setState({ loopStart: s, loopEnd: e }),
        setIsLooping: (v) => useMediaStore.setState({ isLooping: v }),
        setLoopCount: (v) => useMediaStore.setState({ loopCount: v }),
        setMaxLoops: (v) => useMediaStore.setState({ maxLoops: v }),

        toggleLooping: () => {
          const ms = useMediaStore.getState();
          if (ms.isLooping) {
            useMediaStore.setState({ isLooping: false });
          } else {
            const bookmarks = useBookmarkStore.getState().getCurrentMediaBookmarks();
            const covering = bookmarks.filter((b) => b.start <= ms.currentTime && b.end >= ms.currentTime);
            if (covering.length > 0) {
              const shortest = covering.reduce((p, c) => (c.end - c.start) < (p.end - p.start) ? c : p);
              useMediaStore.setState({
                isLooping: true, loopStart: shortest.start, loopEnd: shortest.end, loopCount: 0,
              });
              useBookmarkStore.setState({ selectedBookmarkId: shortest.id });
              toast.success(i18n.t("bookmarks.loopingBookmark", { name: shortest.name }));
              return;
            }
            useMediaStore.setState({ isLooping: true, loopCount: 0 });
          }
        },

        moveLoopWindow: (d) => useMediaStore.getState().moveLoopWindow(d),
        extendLoopStart: (d) => useMediaStore.getState().extendLoopStart(d),
        extendLoopEnd: (d) => useMediaStore.getState().extendLoopEnd(d),
        scaleLoop: (f) => useMediaStore.getState().scaleLoop(f),
        setBpm: (v) => useMediaStore.setState({ bpm: v }),
        setQuantizeLoop: (v) => useMediaStore.setState({ quantizeLoop: v }),
        quantizeCurrentLoop: () => useMediaStore.getState().quantizeCurrentLoop(),
        setLoopDelay: (v) => useMediaStore.setState({ loopDelay: v }),
        setAutoAdvanceBookmarks: (v) => useMediaStore.setState({ autoAdvanceBookmarks: v }),
        setSeekStepSeconds: (s) => useMediaStore.getState().setSeekStepSeconds(s),
        setSeekSmallStepSeconds: (s) => useMediaStore.getState().setSeekSmallStepSeconds(s),
        setSeekMode: (m) => useMediaStore.setState({ seekMode: m }),

        // ── Bookmark actions ──
        addBookmark: (b) => useBookmarkStore.getState().addBookmark(b),
        updateBookmark: (id, c) => useBookmarkStore.getState().updateBookmark(id, c),
        deleteBookmark: (id) => useBookmarkStore.getState().deleteBookmark(id),
        loadBookmark: (id) => useBookmarkStore.getState().loadBookmark(id),
        setSelectedBookmarkId: (id) => useBookmarkStore.setState({ selectedBookmarkId: id }),
        importBookmarks: (b) => useBookmarkStore.getState().importBookmarks(b),
        getCurrentMediaBookmarks: () => useBookmarkStore.getState().getCurrentMediaBookmarks(),

        // ── Transcript actions ──
        startTranscribing: () => useTranscriptStore.getState().startTranscribing(),
        stopTranscribing: () => useTranscriptStore.getState().stopTranscribing(),
        toggleTranscribing: () => useTranscriptStore.getState().toggleTranscribing(),
        addTranscriptSegment: (s) => useTranscriptStore.getState().addTranscriptSegment(s),
        addTranscriptSegments: (s) => useTranscriptStore.getState().addTranscriptSegments(s),
        updateTranscriptSegment: (id, c) => useTranscriptStore.getState().updateTranscriptSegment(id, c),
        clearTranscript: () => useTranscriptStore.getState().clearTranscript(),
        setShowTranscript: (s) => useTranscriptStore.setState({ showTranscript: s }),
        toggleShowTranscript: () => useTranscriptStore.getState().toggleShowTranscript(),
        setTranscriptLanguage: (l) => useTranscriptStore.setState({ transcriptLanguage: l }),
        exportTranscript: (f) => useTranscriptStore.getState().exportTranscript(f),
        importTranscript: (f) => useTranscriptStore.getState().importTranscript(f),
        createBookmarkFromTranscript: (id) => useTranscriptStore.getState().createBookmarkFromTranscript(id),
        loadTranscriptForMedia: (id) => useTranscriptStore.getState().loadTranscriptForMedia(id),
        addGlossaryEntry: (e) => useTranscriptStore.getState().addGlossaryEntry(e),
        deleteGlossaryEntry: (id) => useTranscriptStore.getState().deleteGlossaryEntry(id),
        playGlossaryEntryContext: (id) => useTranscriptStore.getState().playGlossaryEntryContext(id),
        getCurrentMediaTranscripts: () => useTranscriptStore.getState().getCurrentMediaTranscripts(),

        getCurrentMediaId: () => useMediaStore.getState().getCurrentMediaId(),

        // ── History actions ──
        addRecentYouTubeVideo: (video) =>
          set((state) => {
            const exists = state.recentYouTubeVideos.some((v) => v.id === video.id);
            if (exists) {
              return { recentYouTubeVideos: [video, ...state.recentYouTubeVideos.filter((v) => v.id !== video.id)].slice(0, 10) };
            }
            return { recentYouTubeVideos: [video, ...state.recentYouTubeVideos].slice(0, 10) };
          }),
        clearRecentYouTubeVideos: () => set({ recentYouTubeVideos: [] }),

        addToMediaHistory: (item) =>
          set((state) => {
            const id = `history-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
            const timestamp = Date.now();
            let existingItemIndex = -1;

            if (item.type === "file" && item.fileData) {
              if (item.storageId) {
                existingItemIndex = state.mediaHistory.findIndex((h) => h.type === "file" && h.storageId === item.storageId);
              }
              if (existingItemIndex === -1 && item.fileData.name) {
                existingItemIndex = state.mediaHistory.findIndex(
                  (h) => h.type === "file" && h.fileData?.name === item.fileData?.name && h.fileData?.size === item.fileData?.size
                );
              }
            } else if (item.type === "youtube" && item.youtubeData) {
              existingItemIndex = state.mediaHistory.findIndex(
                (h) => h.type === "youtube" && h.youtubeData?.youtubeId === item.youtubeData?.youtubeId
              );
            }

            if (existingItemIndex >= 0) {
              const updatedHistory = [...state.mediaHistory];
              const existingItem = updatedHistory.splice(existingItemIndex, 1)[0];
              return {
                mediaHistory: [{
                  ...existingItem, accessedAt: timestamp,
                  name: existingItem.name || item.name,
                  ...(item.storageId && !existingItem.storageId ? { storageId: item.storageId } : {}),
                  ...(item.fileData ? { fileData: { ...existingItem.fileData, ...item.fileData } } : {}),
                  folderId: existingItem.folderId ?? null,
                }, ...updatedHistory].slice(0, state.historyLimit),
              };
            }
            return { mediaHistory: [{ ...item, id, accessedAt: timestamp, folderId: null }, ...state.mediaHistory].slice(0, state.historyLimit) };
          }),

        updateHistoryPlaybackTime: (id, time) =>
          set((state) => ({ mediaHistory: state.mediaHistory.map((h) => h.id === id ? { ...h, playbackTime: time } : h) })),

        loadFromHistory: async (historyItemId) => {
          useMediaStore.setState({ isLoadingMedia: true });
          const historyItem = get().mediaHistory.find((h) => h.id === historyItemId);
          if (!historyItem) { useMediaStore.setState({ isLoadingMedia: false }); return; }

          try {
            if (historyItem.type === "file" && historyItem.fileData) {
              if (historyItem.nativePath) {
                const url = nativePathToUrl(historyItem.nativePath);
                const fd: MediaFile = { ...historyItem.fileData, url, nativePath: historyItem.nativePath };
                // Don't go through setCurrentFile to avoid double-adding to history
                useMediaStore.getState().setCurrentFile(fd);
                if (historyItem.playbackTime) useMediaStore.setState({ currentTime: historyItem.playbackTime });
                useMediaStore.setState({ isLoadingMedia: false });
                return;
              }
              if (historyItem.storageId) {
                try {
                  const file = await retrieveMediaFile(historyItem.storageId);
                  if (file) {
                    const url = URL.createObjectURL(file);
                    const fd: MediaFile = { ...historyItem.fileData, url, storageId: historyItem.storageId };
                    useMediaStore.getState().setCurrentFile(fd);
                    if (historyItem.playbackTime) useMediaStore.setState({ currentTime: historyItem.playbackTime });
                    useMediaStore.setState({ isLoadingMedia: false });
                    return;
                  }
                } catch (e) { console.error("Failed to load file from storage:", e); }
                toast.error(i18n.t("player.couldNotRetrieveMedia"));
                useMediaStore.setState({ isLoadingMedia: false });
                return;
              }
              const savedUrl = historyItem.fileData.url;
              if (!savedUrl || savedUrl.startsWith("blob:")) {
                toast.error(i18n.t("player.couldNotRetrieveMedia"));
                useMediaStore.setState({ isLoadingMedia: false });
                return;
              }
              const fd: MediaFile = { ...historyItem.fileData };
              useMediaStore.getState().setCurrentFile(fd);
              if (historyItem.playbackTime) useMediaStore.setState({ currentTime: historyItem.playbackTime });
            } else if (historyItem.type === "youtube" && historyItem.youtubeData) {
              const yid = historyItem.youtubeData.youtubeId;
              if (!yid) { useMediaStore.setState({ isLoadingMedia: false }); return; }
              useMediaStore.getState().setCurrentYouTube({ id: yid, title: historyItem.youtubeData.title });
              if (historyItem.playbackTime) useMediaStore.setState({ currentTime: historyItem.playbackTime });
            }

            set((state) => {
              const updated = [...state.mediaHistory];
              const idx = updated.findIndex((h) => h.id === historyItemId);
              if (idx >= 0) {
                const existing = updated.splice(idx, 1)[0];
                return { mediaHistory: [{ ...existing, accessedAt: Date.now() }, ...updated].slice(0, state.historyLimit) };
              }
              return state;
            });
          } finally {
            useMediaStore.setState({ isLoadingMedia: false });
          }
        },

        removeFromHistory: async (historyItemId) => {
          const historyItem = get().mediaHistory.find((h) => h.id === historyItemId);
          if (!historyItem) return;

          const derivedMediaId =
            historyItem.type === "file"
              ? historyItem.storageId || (historyItem.fileData ? `file-${historyItem.fileData.name}-${historyItem.fileData.size}` : null)
              : historyItem.youtubeData?.youtubeId ? `youtube-${historyItem.youtubeData.youtubeId}` : null;

          const ms = useMediaStore.getState();
          const isDeletingCurrent =
            (historyItem.type === "file" && !!ms.currentFile &&
              ((historyItem.storageId && ms.currentFile.storageId === historyItem.storageId) ||
                (!!historyItem.fileData && ms.currentFile.name === historyItem.fileData.name && ms.currentFile.size === historyItem.fileData.size))) ||
            (historyItem.type === "youtube" && !!ms.currentYouTube && ms.currentYouTube.id === historyItem.youtubeData?.youtubeId);

          set((state) => {
            const nextBm = { ...useBookmarkStore.getState().mediaBookmarks };
            const nextTs = { ...useTranscriptStore.getState().mediaTranscripts };
            const nextStudy = { ...useTranscriptStore.getState().mediaTranscriptStudy };
            if (derivedMediaId) {
              delete nextBm[derivedMediaId];
              delete nextTs[derivedMediaId];
              delete nextStudy[derivedMediaId];
            }
            useBookmarkStore.setState({ mediaBookmarks: nextBm });
            useTranscriptStore.setState({ mediaTranscripts: nextTs, mediaTranscriptStudy: nextStudy });

            if (isDeletingCurrent) {
              revokeObjectUrlIfNeeded(ms.currentFile?.url);
              useMediaStore.setState({
                currentFile: null, currentYouTube: null, isPlaying: false,
                currentTime: 0, duration: 0, loopStart: null, loopEnd: null, isLooping: false,
              });
              useBookmarkStore.setState({ selectedBookmarkId: null });
            }
            return { mediaHistory: state.mediaHistory.filter((h) => h.id !== historyItemId) };
          });

          if (derivedMediaId) {
            const { deleteStoredTranscript } = await import("../utils/mediaStorage");
            await deleteStoredTranscript(derivedMediaId);
            try {
              const { useShadowingStore } = await import("./shadowingStore");
              await useShadowingStore.getState().deleteAllSegments(derivedMediaId);
            } catch (e) { console.error("Failed to delete shadowing segments:", e); }
          }
          if (historyItem.storageId) {
            try { await deleteMediaFile(historyItem.storageId); } catch (e) { console.error("Failed to delete media file:", e); }
          }
        },

        clearMediaHistory: async () => {
          const mediaIds = get().mediaHistory
            .map((h) =>
              h.type === "file"
                ? h.storageId || (h.fileData ? `file-${h.fileData.name}-${h.fileData.size}` : null)
                : h.youtubeData?.youtubeId ? `youtube-${h.youtubeData.youtubeId}` : null
            )
            .filter(Boolean) as string[];

          revokeObjectUrlIfNeeded(useMediaStore.getState().currentFile?.url);
          useMediaStore.setState({
            currentFile: null, currentYouTube: null, isPlaying: false,
            currentTime: 0, duration: 0, loopStart: null, loopEnd: null, isLooping: false, isLoadingMedia: false,
          });
          useBookmarkStore.setState({ mediaBookmarks: {}, selectedBookmarkId: null });
          useTranscriptStore.setState({ mediaTranscripts: {}, mediaTranscriptStudy: {}, isTranscriptLoading: false });
          set({ mediaHistory: [] });

          try {
            await clearAllStoredTranscripts();
            const { useShadowingStore } = await import("./shadowingStore");
            await Promise.all(mediaIds.map((id) => useShadowingStore.getState().deleteAllSegments(id)));
          } catch (e) { console.error("Failed to clear shadowing sessions:", e); }
          try {
            const { clearAllMediaFiles } = await import("../utils/mediaStorage");
            await clearAllMediaFiles();
          } catch (e) { console.error("Failed to clear media storage:", e); }
        },

        setHistoryLimit: (l) => set({ historyLimit: l }),

        createMediaFolder: (name, parentId = null) => {
          const id = `folder-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
          set((s) => ({ mediaFolders: { ...s.mediaFolders, [id]: { id, name, createdAt: Date.now(), parentId: parentId ?? null } } }));
          return id;
        },
        renameMediaFolder: (folderId, newName) =>
          set((s) => ({ mediaFolders: { ...s.mediaFolders, [folderId]: { ...s.mediaFolders[folderId], name: newName } } })),
        deleteMediaFolder: (folderId) =>
          set((s) => {
            const removalSet = new Set<string>();
            const stack = [folderId];
            while (stack.length) {
              const cur = stack.pop()!;
              removalSet.add(cur);
              Object.values(s.mediaFolders).forEach((f) => { if (f.parentId === cur) stack.push(f.id); });
            }
            const mf = Object.fromEntries(Object.entries(s.mediaFolders).filter(([id]) => !removalSet.has(id)));
            const mh = s.mediaHistory.map((h) => h.folderId && removalSet.has(h.folderId) ? { ...h, folderId: null } : h);
            const resetFilter = s.historyFolderFilter !== "all" && s.historyFolderFilter !== "unfiled" && typeof s.historyFolderFilter === "string" && removalSet.has(s.historyFolderFilter);
            return { mediaFolders: mf, mediaHistory: mh, historyFolderFilter: resetFilter ? "unfiled" : s.historyFolderFilter };
          }),
        moveHistoryItemToFolder: (historyItemId, folderId) =>
          set((s) => ({ mediaHistory: s.mediaHistory.map((h) => h.id === historyItemId ? { ...h, folderId: folderId ?? null } : h) })),
        renameHistoryItem: (historyItemId, newName) =>
          set((s) => ({
            mediaHistory: s.mediaHistory.map((h) =>
              h.id === historyItemId ? { ...h, name: newName, ...(h.type === "file" && h.fileData ? { fileData: { ...h.fileData, name: newName } } : {}), ...(h.type === "youtube" && h.youtubeData ? { youtubeData: { ...h.youtubeData, title: newName } } : {}) } : h
            ),
          })),
        setHistorySort: (by, order) => set({ historySortBy: by, historySortOrder: order }),
        setHistoryFolderFilter: (f) => set({ historyFolderFilter: f }),
        addSourceFolder: (path) =>
          set((s) => ({ sourceFolders: s.sourceFolders.includes(path) ? s.sourceFolders : [...s.sourceFolders, path] })),
        removeSourceFolder: (path) =>
          set((s) => ({ sourceFolders: s.sourceFolders.filter((f) => f !== path) })),

        setIsSidebarOpen: (v) => set({ isSidebarOpen: v }),
        setSidebarWidth: (v) => set({ sidebarWidth: v }),
        setActiveSidebarTab: (v) => set({ activeSidebarTab: v }),
        toggleSidebarSection: (section) =>
          set((s) => ({ sidebarSections: { ...s.sidebarSections, [section]: !s.sidebarSections[section] } })),
      };
    },
    {
      name: "abloop-player-storage",
      storage: createJSONStorage(() => electronStorage),
      version: 3,
      migrate: (persistedState: unknown, version) => {
        const state = persistedState as PersistedPlayerStoreState | undefined;
        if (!state) return state;

        if (version < 2 && state.mediaFolders) {
          state.mediaFolders = Object.fromEntries(
            Object.entries(state.mediaFolders).map(([id, folder]) => [
              id, { ...folder, parentId: folder?.parentId ?? null },
            ])
          );
        }
        if (version < 2 && state.historyFolderFilter === "all") {
          state.historyFolderFilter = "unfiled";
        }
        if (version < 3) {
          if (state.sourceFolder) {
            state.sourceFolders = [state.sourceFolder];
          } else {
            state.sourceFolders = [];
          }
          delete state.sourceFolder;
        }
        return state;
      },
      onRehydrateStorage: () => (state, error) => {
        if (error || !state) return;
        // Sync persisted data into sub-stores on app start
        if (state.mediaBookmarks && Object.keys(state.mediaBookmarks).length > 0) {
          useBookmarkStore.setState({ mediaBookmarks: state.mediaBookmarks });
        }
        if (state.glossaryEntries?.length > 0) {
          useTranscriptStore.setState({ glossaryEntries: state.glossaryEntries });
        }
        if (state.showTranscript) {
          useTranscriptStore.setState({ showTranscript: state.showTranscript });
        }
        if (state.transcriptLanguage && state.transcriptLanguage !== "en-US") {
          useTranscriptStore.setState({ transcriptLanguage: state.transcriptLanguage });
        }
      },
      partialize: (state) => ({
        volume: state.volume,
        muted: state.muted,
        playbackRate: state.playbackRate,
        mediaBookmarks: state.mediaBookmarks,
        glossaryEntries: state.glossaryEntries,
        showTranscript: state.showTranscript,
        transcriptLanguage: state.transcriptLanguage,
        seekStepSeconds: state.seekStepSeconds,
        seekSmallStepSeconds: state.seekSmallStepSeconds,
        seekMode: state.seekMode,
        recentYouTubeVideos: state.recentYouTubeVideos,
        mediaHistory: state.mediaHistory,
        historyLimit: state.historyLimit,
        mediaFolders: state.mediaFolders,
        historySortBy: state.historySortBy,
        historySortOrder: state.historySortOrder,
        historyFolderFilter: state.historyFolderFilter,
        sourceFolders: state.sourceFolders,
        isSidebarOpen: state.isSidebarOpen,
        sidebarWidth: state.sidebarWidth,
        activeSidebarTab: state.activeSidebarTab,
        sidebarSections: state.sidebarSections,
      }),
    }
  )
);
