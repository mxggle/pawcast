import { create } from "zustand";
import { toast } from "react-hot-toast";
import i18n from "../i18n";
import { useMediaStore } from "./mediaStore";
import type { LoopBookmark, MediaBookmarks } from "../types/bookmark";

let lastDuplicateToastAt = 0;
const DUPLICATE_TOAST_ID = "bookmark-duplicate";

export interface BookmarkState {
  mediaBookmarks: MediaBookmarks;
  selectedBookmarkId: string | null;
}

export interface BookmarkActions {
  addBookmark: (bookmark: Omit<LoopBookmark, "id" | "createdAt">) => boolean;
  updateBookmark: (id: string, changes: Partial<LoopBookmark>) => void;
  deleteBookmark: (id: string) => void;
  loadBookmark: (id: string) => void;
  setSelectedBookmarkId: (id: string | null) => void;
  importBookmarks: (bookmarks: LoopBookmark[]) => void;
  getCurrentMediaBookmarks: () => LoopBookmark[];
}

export const useBookmarkStore = create<BookmarkState & BookmarkActions>()((set, get) => ({
  mediaBookmarks: {},
  selectedBookmarkId: null,

  addBookmark: (bookmark) => {
    const mediaId = useMediaStore.getState().getCurrentMediaId();
    if (!mediaId) return false;

    const TOL = 0.05;
    const existing = get().mediaBookmarks[mediaId] || [];
    const isDup = existing.some(
      (b) => Math.abs(b.start - bookmark.start) < TOL && Math.abs(b.end - bookmark.end) < TOL
    );
    if (isDup) {
      const now = Date.now();
      if (now - lastDuplicateToastAt > 1500) {
        lastDuplicateToastAt = now;
        toast.error(i18n.t("bookmarks.duplicateRange"), { id: DUPLICATE_TOAST_ID, duration: 1500 });
      }
      return false;
    }

    set((state) => ({
      mediaBookmarks: {
        ...state.mediaBookmarks,
        [mediaId!]: [
          ...(state.mediaBookmarks[mediaId!] || []),
          { ...bookmark, id: Date.now().toString(), createdAt: Date.now() },
        ],
      },
    }));
    return true;
  },

  updateBookmark: (id, changes) => {
    const mediaId = useMediaStore.getState().getCurrentMediaId();
    if (!mediaId) return;
    set((state) => ({
      mediaBookmarks: {
        ...state.mediaBookmarks,
        [mediaId!]: (state.mediaBookmarks[mediaId!] || []).map((b) =>
          b.id === id ? { ...b, ...changes } : b
        ),
      },
    }));
  },

  deleteBookmark: (id) => {
    const mediaId = useMediaStore.getState().getCurrentMediaId();
    if (!mediaId) return;
    set((state) => ({
      mediaBookmarks: {
        ...state.mediaBookmarks,
        [mediaId!]: (state.mediaBookmarks[mediaId!] || []).filter((b) => b.id !== id),
      },
      selectedBookmarkId: state.selectedBookmarkId === id ? null : state.selectedBookmarkId,
    }));
  },

  loadBookmark: (id) => {
    const bookmarks = get().getCurrentMediaBookmarks();
    const bookmark = bookmarks.find((b) => b.id === id);
    if (bookmark) {
      useMediaStore.setState({
        loopStart: bookmark.start,
        loopEnd: bookmark.end,
        isLooping: true,
        loopCount: 0,
        ...(bookmark.playbackRate !== undefined ? { playbackRate: bookmark.playbackRate } : {}),
      });
      set({ selectedBookmarkId: id });
    }
  },

  setSelectedBookmarkId: (id) => set({ selectedBookmarkId: id }),

  importBookmarks: (bookmarks) => {
    const mediaId = useMediaStore.getState().getCurrentMediaId();
    if (!mediaId) return;
    const TOL = 0.05;
    const current = get().mediaBookmarks[mediaId] || [];
    const filtered = bookmarks.filter(
      (bm) => !current.some((b) => Math.abs(b.start - bm.start) < TOL && Math.abs(b.end - bm.end) < TOL)
    );
    set((state) => ({
      mediaBookmarks: {
        ...state.mediaBookmarks,
        [mediaId!]: [...(state.mediaBookmarks[mediaId!] || []), ...filtered],
      },
    }));
  },

  getCurrentMediaBookmarks: () => {
    const mediaId = useMediaStore.getState().getCurrentMediaId();
    return mediaId ? get().mediaBookmarks[mediaId] || [] : [];
  },
}));
