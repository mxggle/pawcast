import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { toast } from "react-hot-toast";
import i18n from "../i18n";
import { desktopStorage } from "./desktopStorage";
import { seedFromLegacyPlayerStorage } from "./legacyPlayerStorage";
import { usePlayerStore, revokeObjectUrlIfNeeded } from "./playerStore";
import { useBookmarkStore } from "./bookmarkStore";
import { useTranscriptStore } from "./transcriptStore";
import {
  retrieveMediaFile,
  deleteMediaFile,
  clearAllStoredTranscripts,
} from "../utils/mediaStorage";
import { nativePathToUrl } from "../utils/platform";
import { dataClient } from "../repositories/dataClient";
import type { MediaFile, YouTubeMedia } from "./playerStore";

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

export interface HistoryState {
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

export interface HistoryActions {
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

const initialState: HistoryState = {
  recentYouTubeVideos: [],
  mediaHistory: [],
  historyLimit: 30,
  mediaFolders: {},
  historySortBy: "date",
  historySortOrder: "desc",
  historyFolderFilter: "unfiled",
  sourceFolders: [],
  isSidebarOpen: false,
  sidebarWidth: 288,
  activeSidebarTab: "recent",
  sidebarSections: { explorer: true, recent: true },
};

export const LIBRARY_STORAGE_KEY = "pawcast-library";

export const useHistoryStore = create<HistoryState & HistoryActions>()(
  persist(
    (set, get) => ({
      ...initialState,

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
        usePlayerStore.setState({ isLoadingMedia: true });
        const historyItem = get().mediaHistory.find((h) => h.id === historyItemId);
        if (!historyItem) { usePlayerStore.setState({ isLoadingMedia: false }); return; }

        try {
          if (historyItem.type === "file" && historyItem.fileData) {
            if (historyItem.nativePath) {
              await dataClient.approvePath(historyItem.nativePath);
              const url = nativePathToUrl(historyItem.nativePath);
              const fd: MediaFile = { ...historyItem.fileData, url, nativePath: historyItem.nativePath };
              usePlayerStore.getState().setCurrentFile(fd);
              const mediaId = fd.storageId || fd.id || `file-${fd.name}-${fd.size}`;
              useTranscriptStore.getState().loadTranscriptForMedia(mediaId);
              if (historyItem.playbackTime) usePlayerStore.setState({ currentTime: historyItem.playbackTime });
              usePlayerStore.setState({ isLoadingMedia: false });
              return;
            }
            if (historyItem.storageId) {
              try {
                const file = await retrieveMediaFile(historyItem.storageId);
                if (file) {
                  const url = URL.createObjectURL(file);
                  const fd: MediaFile = { ...historyItem.fileData, url, storageId: historyItem.storageId };
                  usePlayerStore.getState().setCurrentFile(fd);
                  const mediaId = fd.storageId || fd.id || `file-${fd.name}-${fd.size}`;
                  useTranscriptStore.getState().loadTranscriptForMedia(mediaId);
                  if (historyItem.playbackTime) usePlayerStore.setState({ currentTime: historyItem.playbackTime });
                  usePlayerStore.setState({ isLoadingMedia: false });
                  return;
                }
              } catch (e) { console.error("Failed to load file from storage:", e); }
              toast.error(i18n.t("player.couldNotRetrieveMedia"));
              usePlayerStore.setState({ isLoadingMedia: false });
              return;
            }
            const savedUrl = historyItem.fileData.url;
            if (!savedUrl || savedUrl.startsWith("blob:")) {
              toast.error(i18n.t("player.couldNotRetrieveMedia"));
              usePlayerStore.setState({ isLoadingMedia: false });
              return;
            }
            const fd: MediaFile = { ...historyItem.fileData };
            usePlayerStore.getState().setCurrentFile(fd);
            const mediaId = fd.storageId || fd.id || `file-${fd.name}-${fd.size}`;
            useTranscriptStore.getState().loadTranscriptForMedia(mediaId);
            if (historyItem.playbackTime) usePlayerStore.setState({ currentTime: historyItem.playbackTime });
          } else if (historyItem.type === "youtube" && historyItem.youtubeData) {
            const yid = historyItem.youtubeData.youtubeId;
            if (!yid) { usePlayerStore.setState({ isLoadingMedia: false }); return; }
            usePlayerStore.getState().setCurrentYouTube({ id: yid, title: historyItem.youtubeData.title });
            useTranscriptStore.getState().loadTranscriptForMedia(`youtube-${yid}`);
            if (historyItem.playbackTime) usePlayerStore.setState({ currentTime: historyItem.playbackTime });
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
          usePlayerStore.setState({ isLoadingMedia: false });
        }
      },

      removeFromHistory: async (historyItemId) => {
        const historyItem = get().mediaHistory.find((h) => h.id === historyItemId);
        if (!historyItem) return;

        const derivedMediaId =
          historyItem.type === "file"
            ? historyItem.storageId || (historyItem.fileData ? `file-${historyItem.fileData.name}-${historyItem.fileData.size}` : null)
            : historyItem.youtubeData?.youtubeId ? `youtube-${historyItem.youtubeData.youtubeId}` : null;

        const ps = usePlayerStore.getState();
        const isDeletingCurrent =
          (historyItem.type === "file" && !!ps.currentFile &&
            ((historyItem.storageId && ps.currentFile.storageId === historyItem.storageId) ||
              (!!historyItem.fileData && ps.currentFile.name === historyItem.fileData.name && ps.currentFile.size === historyItem.fileData.size))) ||
          (historyItem.type === "youtube" && !!ps.currentYouTube && ps.currentYouTube.id === historyItem.youtubeData?.youtubeId);

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
            revokeObjectUrlIfNeeded(ps.currentFile?.url);
            usePlayerStore.setState({
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

        revokeObjectUrlIfNeeded(usePlayerStore.getState().currentFile?.url);
        usePlayerStore.setState({
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
    }),
    {
      name: LIBRARY_STORAGE_KEY,
      storage: createJSONStorage(() => desktopStorage),
      version: 1,
    }
  )
);

const pickLegacyLibraryState = (legacy: Record<string, unknown>): Partial<HistoryState> => {
  const picked: Partial<HistoryState> = {};
  if (Array.isArray(legacy.recentYouTubeVideos)) picked.recentYouTubeVideos = legacy.recentYouTubeVideos as YouTubeMedia[];
  if (Array.isArray(legacy.mediaHistory)) picked.mediaHistory = legacy.mediaHistory as MediaHistoryItem[];
  if (typeof legacy.historyLimit === "number") picked.historyLimit = legacy.historyLimit;
  if (legacy.mediaFolders && typeof legacy.mediaFolders === "object") picked.mediaFolders = legacy.mediaFolders as Record<string, MediaFolder>;
  if (legacy.historySortBy === "date" || legacy.historySortBy === "name" || legacy.historySortBy === "type") picked.historySortBy = legacy.historySortBy;
  if (legacy.historySortOrder === "asc" || legacy.historySortOrder === "desc") picked.historySortOrder = legacy.historySortOrder;
  if (typeof legacy.historyFolderFilter === "string") picked.historyFolderFilter = legacy.historyFolderFilter;
  if (Array.isArray(legacy.sourceFolders)) picked.sourceFolders = legacy.sourceFolders as string[];
  if (typeof legacy.isSidebarOpen === "boolean") picked.isSidebarOpen = legacy.isSidebarOpen;
  if (typeof legacy.sidebarWidth === "number") picked.sidebarWidth = legacy.sidebarWidth;
  if (legacy.activeSidebarTab === "recent" || legacy.activeSidebarTab === "folders") picked.activeSidebarTab = legacy.activeSidebarTab;
  if (legacy.sidebarSections && typeof legacy.sidebarSections === "object") picked.sidebarSections = legacy.sidebarSections as HistoryState["sidebarSections"];
  return picked;
};

// Seed from the legacy snapshot, then restore the most recent session —
// mirrors the previous playerStore onRehydrateStorage behavior.
void seedFromLegacyPlayerStorage(useHistoryStore, LIBRARY_STORAGE_KEY, pickLegacyLibraryState).then(() => {
  const { mediaHistory } = useHistoryStore.getState();
  if (mediaHistory.length > 0) {
    const latest = [...mediaHistory].sort((a, b) => b.accessedAt - a.accessedAt)[0];
    if (latest) {
      setTimeout(() => {
        useHistoryStore.getState().loadFromHistory(latest.id);
      }, 0);
    }
  }
});
