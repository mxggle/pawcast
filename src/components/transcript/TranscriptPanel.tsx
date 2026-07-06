import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { usePlayerStore } from "../../stores/playerStore";
import { useBookmarkStore } from "../../stores/bookmarkStore";
import { useTranscriptStore } from "../../stores/transcriptStore";
import { useShallow } from "zustand/react/shallow";
import { useVirtualizer, type VirtualItem } from "@tanstack/react-virtual";
import {
  Loader,
  Trash,
  Bookmark,
  FileAudio,
  Settings,
  Edit,
  PlayCircle,
  Sidebar,
  PanelLeftClose,
  Download,
  Upload,
  Locate,
  LocateFixed,
  ListMusic,
  ChevronDown,
  SlidersHorizontal,
} from "lucide-react";
import { cn } from "../../utils/cn";
import { TimelineOverflowMenu } from "../player/TimelineOverflowMenu";
import { toast } from "react-hot-toast";
import { transcriptionService } from "../../services/transcriptionService";
import { TranscriptUploader } from "./TranscriptUploader";
import { TranscriptSegmentItem } from "./TranscriptSegmentItem";
import { getCurrentTime, subscribeCurrentTime } from "../../stores/currentTimeStore";
import { usePlayerSelection } from "../../player/hooks";
import { useTranscriptionRunner } from "../../hooks/useTranscriptionRunner";
import { useBookmarkIO } from "../../hooks/useBookmarkIO";
import { useProgressStore } from "../../stores/progressStore";
import {
  findMatchingBookmarkId,
  findSegmentIndexAtTime,
} from "../../utils/transcriptSegments";

import { TranscriptSegment as TranscriptSegmentType, LoopBookmark } from "../../stores/playerStore";
import type {
  MediaTranscriptStudy,
  TranscriptLevelSystem,
  TranscriptStudyLevel,
  TranscriptSelectionState,
} from "../../types/transcriptStudy";
import {
  buildTranscriptStudy,
  getLevelOptionsForSystem,
  inferTranscriptLevelSystem,
} from "../../utils/transcriptStudy";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Textarea } from "../ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { requestOpenSettings } from "../../utils/settingsIntents";

const EMPTY_SEGMENTS: TranscriptSegmentType[] = [];
const EMPTY_BOOKMARKS: LoopBookmark[] = [];
const EMPTY_STUDY: MediaTranscriptStudy = {};
const SEGMENT_SCROLL_OFFSET_RATIO = 0.15;

/* Unified transcript-header controls: one icon-button shape + one active state,
   sized to the compact panel header (28px hit target). */
const headerIconBtn =
  "flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-gray-500 transition-colors hover:bg-black/5 hover:text-gray-700 focus:outline-none focus-visible:ring-1 focus-visible:ring-primary-500 disabled:pointer-events-none disabled:opacity-40 dark:text-gray-400 dark:hover:bg-white/5 dark:hover:text-gray-200";
const headerIconBtnActive =
  "bg-primary-500/10 text-primary-600 hover:bg-primary-500/15 hover:text-primary-600 dark:bg-primary-400/10 dark:text-primary-400 dark:hover:bg-primary-400/15 dark:hover:text-primary-400";

interface TranscriptPanelProps {
  /** Collapses the whole transcript panel (rendered as a header button when provided). */
  onCollapse?: () => void;
}

export const TranscriptPanel = ({ onCollapse }: TranscriptPanelProps = {}) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const mediaId = usePlayerStore((state) => state.getCurrentMediaId());
  const {
    currentFile,
    currentYouTube,
    setCurrentTime,
    setIsPlaying,
    loopStart,
    loopEnd,
    isPlaying,
  } = usePlayerStore(
    useShallow((state) => ({
      currentFile: state.currentFile,
      currentYouTube: state.currentYouTube,
      setCurrentTime: state.setCurrentTime,
      setIsPlaying: state.setIsPlaying,
      loopStart: state.loopStart,
      loopEnd: state.loopEnd,
      isPlaying: state.isPlaying,
    }))
  );
  const {
    clearTranscript,
    exportTranscript,
    isTranscriptLoading,
    transcriptLanguage,
    setTranscriptLanguage,
  } = useTranscriptStore(
    useShallow((state) => ({
      clearTranscript: state.clearTranscript,
      exportTranscript: state.exportTranscript,
      isTranscriptLoading: state.isTranscriptLoading,
      transcriptLanguage: state.transcriptLanguage,
      setTranscriptLanguage: state.setTranscriptLanguage,
    }))
  );
  const {
    updateBookmark,
    selectedBookmarkId,
    loadBookmark,
    setSelectedBookmarkId,
  } = useBookmarkStore(
    useShallow((state) => ({
      updateBookmark: state.updateBookmark,
      selectedBookmarkId: state.selectedBookmarkId,
      loadBookmark: state.loadBookmark,
      setSelectedBookmarkId: state.setSelectedBookmarkId,
    }))
  );
  const transcriptSegments = useTranscriptStore(
    (state) => (mediaId ? state.mediaTranscripts[mediaId] ?? EMPTY_SEGMENTS : EMPTY_SEGMENTS)
  );
  const bookmarks = useBookmarkStore(
    (state) => (mediaId ? state.mediaBookmarks[mediaId] ?? EMPTY_BOOKMARKS : EMPTY_BOOKMARKS)
  );
  const transcriptStudy = useTranscriptStore((state) =>
    mediaId ? state.mediaTranscriptStudy[mediaId] ?? EMPTY_STUDY : EMPTY_STUDY
  );
  const practicedIndices = useProgressStore(
    (state) => (mediaId ? state.progress[mediaId]?.practicedSentenceIndices : undefined)
  );

  const [exportOpen, setExportOpen] = useState(false);
  const [activeSelection, setActiveSelection] = useState<TranscriptSelectionState | null>(null);
  const [wasPlayingBeforeSelection, setWasPlayingBeforeSelection] = useState(false);
  const [selectionEnabled, setSelectionEnabled] = useState(false);
  const [levelFilterOpen, setLevelFilterOpen] = useState(false);
  const [highlightsEnabled, setHighlightsEnabled] = useState<boolean>(() => {
    if (typeof window === "undefined") {
      return true;
    }
    return localStorage.getItem("transcript_study_enabled") !== "false";
  });
  const [activeLevels, setActiveLevels] = useState<Set<TranscriptStudyLevel> | null>(null);
  const [autoScrollEnabled, setAutoScrollEnabled] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("transcript_auto_scroll") === "true";
  });

  const { selection: playerSelection, setSelection } = usePlayerSelection();

  const LANGUAGE_OPTIONS = [
    { value: "en-US", label: t("transcript.languages.en-US") },
    { value: "en-GB", label: t("transcript.languages.en-GB") },
    { value: "es-ES", label: t("transcript.languages.es-ES") },
    { value: "fr-FR", label: t("transcript.languages.fr-FR") },
    { value: "de-DE", label: t("transcript.languages.de-DE") },
    { value: "ja-JP", label: t("transcript.languages.ja-JP") },
    { value: "ko-KR", label: t("transcript.languages.ko-KR") },
    { value: "zh-CN", label: t("transcript.languages.zh-CN") },
    { value: "ru-RU", label: t("transcript.languages.ru-RU") },
  ];

  const { importFileInputRef, handleExportBookmarks, handleImportBookmarks } =
    useBookmarkIO(bookmarks);

  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [editingBookmarkId, setEditingBookmarkId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editStart, setEditStart] = useState<number>(0);
  const [editEnd, setEditEnd] = useState<number>(0);
  const [editAnnotation, setEditAnnotation] = useState("");
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const updateSelectionSupport = () => {
      const isTouchDevice =
        window.matchMedia("(pointer: coarse)").matches ||
        navigator.maxTouchPoints > 0;
      setSelectionEnabled(!isTouchDevice);
    };

    updateSelectionSupport();
    window.addEventListener("resize", updateSelectionSupport);
    return () => window.removeEventListener("resize", updateSelectionSupport);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    localStorage.setItem("transcript_study_enabled", String(highlightsEnabled));
  }, [highlightsEnabled]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("transcript_auto_scroll", String(autoScrollEnabled));
    }
  }, [autoScrollEnabled]);

  useEffect(() => {
    setActiveSelection(null);
  }, [mediaId, activeTabId]);

  // Handle auto-pause on selection and auto-resume on dismissal
  useEffect(() => {
    if (activeSelection) {
      // If a selection is made and media is playing, pause it and remember the state
      if (!wasPlayingBeforeSelection && isPlaying) {
        setWasPlayingBeforeSelection(true);
        setIsPlaying(false);
      }
    } else {
      // If selection is dismissed and we had paused the media, resume it
      if (wasPlayingBeforeSelection) {
        setIsPlaying(true);
        setWasPlayingBeforeSelection(false);
      }
    }
  }, [activeSelection, isPlaying, setIsPlaying, wasPlayingBeforeSelection]);

  useEffect(() => {
    const transcriptNode = transcriptRef.current;
    if (!transcriptNode) {
      return;
    }

    const clearSelection = () => setActiveSelection(null);
    transcriptNode.addEventListener("scroll", clearSelection);
    return () => transcriptNode.removeEventListener("scroll", clearSelection);
  }, []);

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) {
        return;
      }

      if (
        target.closest(".transcript-selection-popover") ||
        target.closest("[data-transcript-row]")
      ) {
        return;
      }

      setActiveSelection(null);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setActiveSelection(null);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  // Sync transcript word selection → PlayerWorkspace context (for waveform highlight)
  useEffect(() => {
    if (activeSelection?.timeRange) {
      const { timeRange } = activeSelection;
      // Find words in the selected segment that overlap the time range
      const segment = transcriptSegments.find((s) => s.id === activeSelection.segmentId);
      const wordIds = segment?.words
        ?.filter((w) => w.start < timeRange.end && w.end > timeRange.start)
        .map((w) => w.id);
      setSelection({
        type: 'time-range',
        start: timeRange.start,
        end: timeRange.end,
        source: 'transcript',
        segmentIds: [activeSelection.segmentId],
        wordIds,
      });
    } else if (activeSelection === null) {
      // User cleared the transcript selection (clicked empty space, scrolled, etc.)
      // Also clear the shared selection
      setSelection(null);
    }
  }, [activeSelection, transcriptSegments, setSelection]);

  // Sync active tab with selected bookmark from store (e.g. from waveform interactions)
  useEffect(() => {
    setActiveTabId(selectedBookmarkId);
  }, [selectedBookmarkId]);

  // When a bookmark tab is selected and has wordIds/segmentIds, highlight those words
  useEffect(() => {
    if (!activeTabId) {
      // Full transcript view — no bookmark-related highlighting
      return;
    }
    const bookmark = bookmarks.find((b) => b.id === activeTabId);
    if (bookmark) {
      // If the bookmark references transcript words, create a selection highlight
      if (bookmark.wordIds && bookmark.wordIds.length > 0) {
        setSelection({
          type: 'time-range',
          start: bookmark.start,
          end: bookmark.end,
          source: 'bookmark',
          wordIds: bookmark.wordIds,
          segmentIds: bookmark.segmentIds,
        });
      } else {
        // No word links — clear any bookmark selection highlight
        if (playerSelection?.source === 'bookmark') {
          setSelection(null);
        }
      }
    }
    // playerSelection.source / setSelection intentionally omitted — re-running
    // when those change would loop the bookmark-selection sync.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTabId, bookmarks]);

  // Filter segments based on active tab
  const activeBookmark = useMemo(
    () => bookmarks.find((bookmark) => bookmark.id === activeTabId) ?? null,
    [bookmarks, activeTabId]
  );

  const filteredSegments = useMemo(() => {
    if (!activeBookmark) {
      return transcriptSegments;
    }

    return transcriptSegments.filter((segment) => {
      const elementStart = segment.startTime;
      const elementEnd = segment.endTime;
      return (
        (elementStart >= activeBookmark.start - 0.5 &&
          elementEnd <= activeBookmark.end + 0.5) ||
        (elementStart <= activeBookmark.start && elementEnd >= activeBookmark.end)
      );
    });
  }, [activeBookmark, transcriptSegments]);

  // Sentence-practice indices refer to positions in the full transcript.
  const practicedSegmentIds = useMemo(() => {
    const ids = new Set<string>();
    if (!practicedIndices) return ids;
    for (const index of practicedIndices) {
      const segment = transcriptSegments[index];
      if (segment) ids.add(segment.id);
    }
    return ids;
  }, [practicedIndices, transcriptSegments]);

  const segmentBookmarkLookup = useMemo(() => {
    const lookup = new Map<string, string>();

    filteredSegments.forEach((segment) => {
      const bookmarkId = findMatchingBookmarkId(segment, bookmarks);
      if (bookmarkId) {
        lookup.set(segment.id, bookmarkId);
      }
    });

    return lookup;
  }, [bookmarks, filteredSegments]);

  const levelSystem: TranscriptLevelSystem = useMemo(
    () => inferTranscriptLevelSystem(transcriptLanguage),
    [transcriptLanguage]
  );

  const levelOptions = useMemo(
    () => getLevelOptionsForSystem(levelSystem),
    [levelSystem]
  );

  const displayTranscriptStudy = useMemo(() => {
    const firstStudy = transcriptSegments
      .map((segment) => transcriptStudy[segment.id])
      .find(Boolean);

    if (!firstStudy || firstStudy.levelSystem !== levelSystem) {
      return buildTranscriptStudy(transcriptSegments, levelSystem);
    }

    return transcriptStudy;
  }, [levelSystem, transcriptSegments, transcriptStudy]);

  useEffect(() => {
    setActiveLevels(null);
  }, [levelSystem, mediaId]);

  useEffect(() => {
    if (!activeSelection) {
      return;
    }

    const isSelectionVisible = filteredSegments.some(
      (segment) => segment.id === activeSelection.segmentId
    );

    if (!isSelectionVisible) {
      setActiveSelection(null);
    }
  }, [activeSelection, filteredSegments]);

  const handleTabSelect = (id: string | null) => {
    if (id) {
      // If switching to a specific bookmark tab
      const bookmark = bookmarks.find((b) => b.id === id);
      if (bookmark) {
        // Use loadBookmark to sync store state (loop points, selected ID, etc.)
        loadBookmark(id);
        setCurrentTime(bookmark.start);
      }
    } else {
      // If switching to "Full Transcript"
      setSelectedBookmarkId(null);
    }
  };

  const toggleLevel = (level: TranscriptStudyLevel) => {
    setActiveLevels((previous) => {
      const next = new Set(previous ?? levelOptions);
      if (next.has(level)) {
        next.delete(level);
      } else {
        next.add(level);
      }
      return next.size === levelOptions.length ? null : next;
    });
  };

  const clearLevelFilter = () => {
    setActiveLevels(null);
  };

  const isLevelActive = (level: TranscriptStudyLevel) =>
    activeLevels ? activeLevels.has(level) : true;

  const handlePlayBookmark = (e: React.MouseEvent, bookmarkId: string) => {
    e.stopPropagation();
    const bookmark = bookmarks.find((b) => b.id === bookmarkId);
    if (bookmark) {
      loadBookmark(bookmarkId);
      setCurrentTime(bookmark.start);
      setIsPlaying(true);
    }
  };

  const handleEditBookmark = (e: React.MouseEvent, bookmark: LoopBookmark) => {
    e.stopPropagation();
    setEditingBookmarkId(bookmark.id);
    setEditName(bookmark.name);
    setEditStart(bookmark.start);
    setEditEnd(bookmark.end);
    setEditAnnotation(bookmark.annotation || "");
    setIsEditDialogOpen(true);
  };

  const handleSaveEdit = () => {
    if (!editingBookmarkId) return;

    if (!editName.trim()) {
      toast.error(t("bookmarks.nameCannotBeEmpty"));
      return;
    }

    updateBookmark(editingBookmarkId, {
      name: editName.trim(),
      start: editStart,
      end: editEnd,
      annotation: editAnnotation.trim(),
    });

    setIsEditDialogOpen(false);
    setEditingBookmarkId(null);
    toast.success(t("bookmarks.bookmarkUpdated"));
  };

  const handleTranscribeBookmark = () => {
    const bookmark = bookmarks.find((b) => b.id === activeTabId);
    if (bookmark) {
      transcribeMedia({ start: bookmark.start, end: bookmark.end });
    }
  };

  const getPreferredTranscriptRange = () => {
    if (loopStart !== null && loopEnd !== null && loopEnd > loopStart) {
      return { start: loopStart, end: loopEnd };
    }

    return undefined;
  };

  const {
    isProcessing,
    processingProgress,
    transcriptionStatus,
    errorMessage,
    showApiKeyInput,
    setShowApiKeyInput,
    currentProvider,
    transcribeMedia,
    cancelTranscription,
  } = useTranscriptionRunner({ getFallbackRange: getPreferredTranscriptRange });

  const handleTranscribeDefault = () => {
    transcribeMedia(getPreferredTranscriptRange());
  };

  const transcriptRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: filteredSegments.length,
    getScrollElement: () => transcriptRef.current,
    estimateSize: () => 104,
    overscan: 5,
    getItemKey: (index: number) => filteredSegments[index]?.id ?? `segment-${index}`,
  });

  const handleOpenAISettings = () => {
    requestOpenSettings({ tab: "ai" });
  };

  const scrollToSegmentIndex = useCallback(
    (index: number, behavior: ScrollBehavior = "smooth") => {
      if (index < 0 || index >= filteredSegments.length) {
        return;
      }

      const containerHeight = transcriptRef.current?.clientHeight || 0;
      const item = virtualizer.getVirtualItems().find((virtualItem) => virtualItem.index === index);

      if (item) {
        virtualizer.scrollToOffset(
          Math.max(0, item.start - containerHeight * SEGMENT_SCROLL_OFFSET_RATIO),
          { behavior }
        );
        return;
      }

      virtualizer.scrollToIndex(index, { align: "center", behavior });
    },
    [filteredSegments.length, virtualizer]
  );

  const scrollToActiveSegment = useCallback(() => {
    const time = getCurrentTime();
    const index = findSegmentIndexAtTime(
      filteredSegments,
      time,
      currentSegmentIndexRef.current
    );

    if (index !== -1) {
      currentSegmentIndexRef.current = index;
      scrollToSegmentIndex(index);
    } else {
      toast.error(t("transcript.segmentNotFound"));
    }
  }, [filteredSegments, scrollToSegmentIndex, t]);

  const currentSegmentIndexRef = useRef<number>(-1);

  useEffect(() => {
    currentSegmentIndexRef.current = findSegmentIndexAtTime(
      filteredSegments,
      getCurrentTime()
    );
  }, [filteredSegments]);

  useEffect(() => {
    if (!autoScrollEnabled) {
      return undefined;
    }

    const unsubscribe = subscribeCurrentTime(() => {
      const time = getCurrentTime();
      const segments = filteredSegments;
      if (segments.length === 0) return;

      const nextIndex = findSegmentIndexAtTime(
        segments,
        time,
        currentSegmentIndexRef.current
      );

      if (nextIndex === -1) {
        currentSegmentIndexRef.current = -1;
        return;
      }

      if (nextIndex !== currentSegmentIndexRef.current) {
        currentSegmentIndexRef.current = nextIndex;
        scrollToSegmentIndex(nextIndex);
      }
    });

    return () => {
      unsubscribe();
    };
  }, [autoScrollEnabled, filteredSegments, scrollToSegmentIndex]);

  // Track whether the user is reading at the bottom of the transcript, so
  // live transcription only follows new segments when they aren't reading
  // earlier content (stick-to-bottom, like chat/log views).
  const isPinnedToBottomRef = useRef(true);

  useEffect(() => {
    const node = transcriptRef.current;
    if (!node) {
      return;
    }

    const updatePinned = () => {
      const distanceFromBottom = node.scrollHeight - node.scrollTop - node.clientHeight;
      isPinnedToBottomRef.current = distanceFromBottom < 80;
    };

    updatePinned();
    node.addEventListener("scroll", updatePinned, { passive: true });
    return () => node.removeEventListener("scroll", updatePinned);
  }, []);

  // Follow new segments during live transcription — but never yank the
  // user away from earlier segments they scrolled up to read.
  useEffect(() => {
    if (isProcessing && filteredSegments.length > 0 && isPinnedToBottomRef.current) {
      virtualizer.scrollToIndex(filteredSegments.length - 1, { align: "end" });
    }
  }, [filteredSegments.length, isProcessing, virtualizer]);

  // Stable callback for clearing selection — prevents breaking React.memo
  // on TranscriptSegmentItem via a new function reference each render.
  const handleClearSelection = useCallback(() => setActiveSelection(null), []);

  // Handle export
  const handleExport = (format: "txt" | "srt" | "vtt") => {
    const content = exportTranscript(format);
    if (!content) return;

    // Create a blob and download link
    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `transcript.${format}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    toast.success(t("transcript.exportSuccess", { format: format.toUpperCase() }));
  };

  // State and handlers moved to top level of component


  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("transcript_sidebar_open") === "true";
  });

  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("transcript_sidebar_open", String(isSidebarOpen));
    }
  }, [isSidebarOpen]);


  const handleDeleteBookmark = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (confirm(t("bookmarks.deleteConfirmation"))) {
      useBookmarkStore.getState().deleteBookmark(id);
      toast.success(t("bookmarks.bookmarkDeleted"));
    }
  };

  return (
    <div className="flex h-full w-full flex-1 min-h-0 @container/transcript bg-white dark:bg-gray-950/40 overflow-hidden relative z-0">
      {/* Sidebar */}
      <div
        className={`${isSidebarOpen ? "w-1/4 min-w-[200px] max-w-[300px] border-r" : "w-0 border-none"} transition-all duration-300 ease-in-out border-gray-100 dark:border-white/5 flex flex-col bg-gray-50 dark:bg-gray-950/60 overflow-hidden relative`}
      >
        <div className="p-3 border-b border-gray-100 dark:border-white/5 flex items-center justify-between">
          <span className="font-semibold text-[10px] text-gray-400 uppercase tracking-widest whitespace-nowrap overflow-hidden text-ellipsis">
            {t("transcript.sections")}
          </span>
          <div className="flex items-center space-x-1">
            <button
              onClick={handleExportBookmarks}
              className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
              title={t("bookmarks.exportBookmarks")}
            >
              <Download size={14} />
            </button>
            <button
              onClick={() => importFileInputRef.current?.click()}
              className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
              title={t("bookmarks.importBookmarks")}
            >
              <Upload size={14} />
            </button>
            <input
              ref={importFileInputRef}
              type="file"
              accept=".json"
              className="hidden"
              onChange={handleImportBookmarks}
            />
            <button
              onClick={() => setIsSidebarOpen(false)}
              className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-500"
            >
              <PanelLeftClose size={14} />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          <button
            onClick={() => handleTabSelect(null)}
            className={`w-full text-left px-3 py-2 rounded text-sm transition-colors whitespace-nowrap overflow-hidden text-ellipsis ${activeTabId === null
              ? "bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300 font-medium"
              : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
              }`}
          >
            {t("transcript.fullTranscript")}
          </button>

          {bookmarks.length > 0 && (
            <div className="mt-4 mb-2 px-2 text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase whitespace-nowrap overflow-hidden text-ellipsis">
              {t("transcript.bookmarks")}
            </div>
          )}

          {bookmarks.map(b => (
            <div
              key={b.id}
              role="button"
              tabIndex={0}
              onClick={() => handleTabSelect(b.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  handleTabSelect(b.id);
                }
              }}
              className={`group w-full text-left px-3 py-2 rounded text-sm transition-colors flex items-center justify-between outline-none focus-visible:ring-1 focus-visible:ring-primary-500 cursor-pointer ${activeTabId === b.id
                ? "bg-primary-100 dark:bg-primary-900/30"
                : "hover:bg-gray-100 dark:hover:bg-gray-800"
                }`}
              title={b.name}
            >
              <div className="flex-1 min-w-0 mr-2 overflow-hidden">
                <div className={`truncate font-medium ${activeTabId === b.id
                  ? "text-primary-700 dark:text-primary-300"
                  : "text-gray-700 dark:text-gray-300"
                  }`}>
                  {b.name}
                </div>
                <div className="text-xs opacity-70 font-mono text-gray-500 dark:text-gray-400 truncate">
                  {Math.floor(b.start / 60)}:{Math.floor(b.start % 60).toString().padStart(2, '0')} -
                  {Math.floor(b.end / 60)}:{Math.floor(b.end % 60).toString().padStart(2, '0')}
                </div>
              </div>

              <div className="flex items-center opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity space-x-1 shrink-0">
                <button
                  onClick={(e) => handlePlayBookmark(e, b.id)}
                  className="p-1 rounded-full hover:bg-white/50 dark:hover:bg-black/50 text-gray-500 hover:text-primary-600 dark:text-gray-400 dark:hover:text-primary-400"
                  title={t("player.play")}
                >
                  <PlayCircle size={16} />
                </button>
                <button
                  onClick={(e) => handleEditBookmark(e, b)}
                  className="p-1 rounded-full hover:bg-white/50 dark:hover:bg-black/50 text-gray-500 hover:text-blue-600 dark:text-gray-400 dark:hover:text-blue-400"
                  title={t("bookmarks.editBookmark")}
                >
                  <Edit size={14} />
                </button>
                <button
                  onClick={(e) => handleDeleteBookmark(e, b.id)}
                  className="p-1 rounded-full hover:bg-white/50 dark:hover:bg-black/50 text-gray-500 hover:text-error-600 dark:text-gray-400 dark:hover:text-error-400"
                  title={t("bookmarks.deleteBookmark")}
                >
                  <Trash size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Main Content */}
      <div className="transcript-panel-main flex h-full flex-1 flex-col min-w-0 min-h-0 bg-white dark:bg-transparent">
        <div className="transcript-container flex h-full flex-1 min-h-0 min-w-0 flex-col overflow-hidden">
          <div className="transcript-header flex items-center justify-between px-2 py-1.5 @[460px]/transcript:px-3 border-b border-gray-100 dark:border-white/5 bg-white dark:bg-gray-950/60 backdrop-blur-md min-w-0 gap-2">
            <div className="flex items-center min-w-0 mr-2 gap-0.5">
              {onCollapse && (
                <button
                  onClick={onCollapse}
                  className={headerIconBtn}
                  title={t("common.collapse")}
                >
                  <PanelLeftClose size={15} />
                </button>
              )}
              {!isSidebarOpen && (
                <button
                  onClick={() => setIsSidebarOpen(true)}
                  className={headerIconBtn}
                  title={t("transcript.toggleSidebar")}
                >
                  <Sidebar size={15} />
                </button>
              )}
              <h3 className="transcript-header-title text-sm font-medium text-gray-700 dark:text-gray-300 truncate ml-1">
                {activeTabId
                  ? bookmarks.find(b => b.id === activeTabId)?.name || t("transcript.title")
                  : t("transcript.title")
                }
              </h3>
              {isProcessing && (
                <div
                  className="ml-2 flex items-center flex-shrink-0"
                  title={transcriptionStatus || t("transcript.processing", { progress: processingProgress })}
                >
                  <div className="w-2 h-2 bg-primary-500 rounded-full animate-pulse"></div>
                </div>
              )}
            </div>

            <div className="transcript-header-actions flex items-center gap-1 flex-shrink-0">
              {/* Level highlight toggle (JLPT / CEFR) */}
              <button
                onClick={() => setHighlightsEnabled((previous) => !previous)}
                aria-pressed={highlightsEnabled}
                className={cn(
                  "hidden @[300px]/transcript:flex h-7 shrink-0 items-center rounded-md px-2 text-[11px] font-semibold uppercase tracking-wide transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-primary-500",
                  highlightsEnabled
                    ? headerIconBtnActive
                    : "text-gray-500 hover:bg-black/5 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-white/5 dark:hover:text-gray-200"
                )}
                title={t("transcript.levelToggle")}
              >
                {levelSystem === "jlpt" ? "JLPT" : "CEFR"}
              </button>

              {/* Level filter */}
              <div className="relative hidden @[340px]/transcript:block">
                <button
                  onClick={() => setLevelFilterOpen((open) => !open)}
                  disabled={!highlightsEnabled}
                  className={cn(headerIconBtn, activeLevels && headerIconBtnActive)}
                  title={t("transcript.levelFilter")}
                >
                  <SlidersHorizontal size={14} />
                </button>
                {levelFilterOpen && highlightsEnabled && (
                  <>
                    <div
                      className="fixed inset-0 z-10"
                      onClick={() => setLevelFilterOpen(false)}
                    />
                    <div className="absolute right-0 top-full z-20 mt-1 w-40 rounded-lg border border-gray-200 bg-white p-2 shadow-xl dark:border-white/10 dark:bg-gray-900">
                      <button
                        onClick={clearLevelFilter}
                        className="mb-2 w-full rounded px-2 py-1 text-left text-xs text-gray-500 transition-colors hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-white/5"
                      >
                        {t("transcript.levelFilterAll")}
                      </button>
                      <div className="space-y-1">
                        {levelOptions.map((level) => (
                          <label
                            key={level}
                            className="flex cursor-pointer items-center justify-between rounded px-2 py-1 text-xs text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-white/5"
                          >
                            <span>{level}</span>
                            <input
                              type="checkbox"
                              checked={isLevelActive(level)}
                              onChange={() => toggleLevel(level)}
                              className="h-3.5 w-3.5 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                            />
                          </label>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </div>

              {/* Auto-scroll toggle */}
              <button
                onClick={() => setAutoScrollEnabled(!autoScrollEnabled)}
                aria-pressed={autoScrollEnabled}
                className={cn(headerIconBtn, autoScrollEnabled && headerIconBtnActive)}
                title={t("transcript.autoScroll")}
              >
                <LocateFixed size={15} />
              </button>

              {/* Jump to current segment — inline on wider panels */}
              <button
                onClick={scrollToActiveSegment}
                disabled={filteredSegments.length === 0}
                className={cn(headerIconBtn, "hidden @[560px]/transcript:flex")}
                title={t("transcript.scrollToCurrent")}
              >
                <Locate size={15} />
              </button>

              {/* Export — inline on wider panels */}
              <div className="relative hidden @[560px]/transcript:block">
                <button
                  onClick={() => setExportOpen((o) => !o)}
                  disabled={transcriptSegments.length === 0}
                  className={headerIconBtn}
                  title={t("common.export")}
                >
                  <Download size={15} />
                </button>
                {exportOpen && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setExportOpen(false)} />
                    <div className="absolute right-0 top-full z-20 mt-1 min-w-[72px] rounded-lg border border-gray-200 bg-white py-1 shadow-xl dark:border-white/10 dark:bg-gray-900">
                      {(["txt", "srt", "vtt"] as const).map((fmt) => (
                        <button
                          key={fmt}
                          onClick={() => { handleExport(fmt); setExportOpen(false); }}
                          className="block w-full px-3 py-1.5 text-left text-xs text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-white/5"
                        >
                          {fmt.toUpperCase()}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>

              {/* AI settings — inline on wide panels */}
              <button
                onClick={handleOpenAISettings}
                className={cn(headerIconBtn, "hidden @[640px]/transcript:flex")}
                title={t("transcript.openAiSettings")}
              >
                <Settings size={15} />
              </button>

              {/* Sentence practice — inline on wide panels */}
              <button
                onClick={() => navigate("/sentence-practice")}
                disabled={transcriptSegments.length === 0}
                className={cn(headerIconBtn, "hidden @[640px]/transcript:flex")}
                title={t("sentencePractice.title")}
              >
                <ListMusic size={15} />
              </button>

              {/* Overflow: narrow-panel fallbacks + destructive actions */}
              <TimelineOverflowMenu
                side="bottom"
                triggerClassName="rounded-md h-7 w-7 p-0 flex items-center justify-center"
                items={[
                  {
                    id: "locate",
                    label: t("transcript.scrollToCurrent"),
                    icon: <Locate size={12} />,
                    onSelect: scrollToActiveSegment,
                    disabled: filteredSegments.length === 0,
                    hideAtClass: "@[560px]/transcript:hidden",
                  },
                  ...(["txt", "srt", "vtt"] as const).map((fmt) => ({
                    id: `export-${fmt}`,
                    label: `${t("common.export")} ${fmt.toUpperCase()}`,
                    icon: <Download size={12} />,
                    onSelect: () => handleExport(fmt),
                    disabled: transcriptSegments.length === 0,
                    hideAtClass: "@[560px]/transcript:hidden",
                  })),
                  {
                    id: "ai-settings",
                    label: t("transcript.openAiSettings"),
                    icon: <Settings size={12} />,
                    onSelect: handleOpenAISettings,
                    hideAtClass: "@[640px]/transcript:hidden",
                  },
                  {
                    id: "sentence-practice",
                    label: t("sentencePractice.title"),
                    icon: <ListMusic size={12} />,
                    onSelect: () => navigate("/sentence-practice"),
                    disabled: transcriptSegments.length === 0,
                    hideAtClass: "@[640px]/transcript:hidden",
                  },
                  {
                    id: "clear",
                    label: t("transcript.clearTranscript"),
                    icon: <Trash size={12} />,
                    onSelect: () => clearTranscript(),
                    disabled: transcriptSegments.length === 0,
                    destructive: true,
                  },
                ]}
              />
            </div>
          </div>

        <div
          ref={transcriptRef}
          className="transcript-content-scroll flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-3 pt-3 pb-6 @[460px]/transcript:px-6 @[460px]/transcript:pt-4 @[700px]/transcript:px-12 @[700px]/transcript:pb-12"
        >
          {showApiKeyInput && (
            <div className="p-4 bg-blue-50 dark:bg-blue-900/20 text-blue-800 dark:text-blue-200 rounded-md mb-3">
              <h4 className="font-medium mb-2">{t("transcript.apiKeyRequired")}</h4>
              <p className="text-xs mb-3">{t("transcript.apiKeyNotice")}</p>
              <div className="flex space-x-2">
                <button
                  onClick={handleOpenAISettings}
                  className="px-3 py-1 bg-primary-600 hover:bg-primary-700 text-white rounded text-xs font-medium flex items-center gap-1"
                >
                  <Settings size={14} />
                  {t("transcript.openAiSettings")}
                </button>
                <button
                  onClick={() => setShowApiKeyInput(false)}
                  className="px-3 py-1 bg-gray-300 hover:bg-gray-400 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-800 dark:text-gray-200 rounded text-xs font-medium"
                >
                  {t("common.cancel")}
                </button>
              </div>
            </div>
          )}

          {errorMessage && (
            <div className="p-3 bg-red-50 dark:bg-error-900/20 text-error-800 dark:text-error-200 rounded-md">
              {errorMessage}
            </div>
          )}

          {/* Centered loading state only while no segments exist yet; once
              partial segments stream in, the slim status bar below the list
              takes over so the transcript stays readable. */}
          {isProcessing && filteredSegments.length === 0 && (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <Loader size={24} className="animate-spin text-primary-500 mb-2" />
              <p className="text-gray-600 dark:text-gray-400">
                {transcriptionStatus || t("transcript.processingTranscription")}
              </p>
              <div className="w-full max-w-xs bg-gray-200 dark:bg-gray-700 rounded-full h-2.5 mt-3">
                <div
                  className="bg-primary-600 h-2.5 rounded-full transition-all duration-300"
                  style={{ width: `${processingProgress}%` }}
                ></div>
              </div>
              <button
                type="button"
                onClick={cancelTranscription}
                className="mt-3 rounded-md bg-gray-100 px-3 py-1 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
              >
                {t("transcript.cancelTranscription")}
              </button>
            </div>
          )}

          {/* Empty state logic based on active tab */}
          {!isProcessing && !showApiKeyInput && (
            <>
              {isTranscriptLoading ? (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <Loader size={24} className="animate-spin text-primary-500 mb-2" />
                  <p className="text-gray-600 dark:text-gray-400">
                    {t("common.loading")}
                  </p>
                </div>
              ) : activeTabId ? (
                // Bookmark View Empty State
                filteredSegments.length === 0 ? (
                  <div className="mx-auto flex min-h-[240px] max-w-md items-center justify-center py-6">
                    <div className="w-full rounded-lg border border-gray-200 bg-gray-50 px-6 py-7 text-center dark:border-gray-700 dark:bg-gray-800/50">
                      <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-primary-100 text-primary-600 dark:bg-primary-900/30 dark:text-primary-400">
                        <Bookmark size={18} />
                      </div>
                      <h3 className="text-sm font-medium text-gray-800 dark:text-gray-200">
                        {t("transcript.noTranscriptForBookmark")}
                      </h3>
                      <div className="mt-4 flex justify-center">
                        <button
                          onClick={handleTranscribeBookmark}
                          className="inline-flex items-center gap-2 rounded-md bg-primary-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-700"
                        >
                          <FileAudio size={16} />
                          {t("transcript.transcribeBookmarkButton")}
                        </button>
                      </div>
                    </div>
                  </div>
                ) : null
              ) : (
                // Full Transcript Empty State
                transcriptSegments.length === 0 ? (
                  <div className="mx-auto flex min-h-[200px] max-w-lg items-center justify-center py-6">
                    <div className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 @[260px]/transcript:px-4 @[400px]/transcript:px-6 py-5 @[400px]/transcript:py-7 text-center dark:border-gray-700 dark:bg-gray-800/50">
                      <div className="mx-auto mb-3 flex h-8 w-8 @[260px]/transcript:h-10 @[260px]/transcript:w-10 @[400px]/transcript:h-12 @[400px]/transcript:w-12 items-center justify-center rounded-full bg-primary-100 text-primary-600 dark:bg-primary-900/30 dark:text-primary-400">
                        <span className="@[260px]/transcript:hidden">
                          <FileAudio size={14} />
                        </span>
                        <span className="hidden @[260px]/transcript:inline @[400px]/transcript:hidden">
                          <FileAudio size={18} />
                        </span>
                        <span className="hidden @[400px]/transcript:inline">
                          <FileAudio size={22} />
                        </span>
                      </div>
                      <h3 className="text-xs @[260px]/transcript:text-sm font-medium text-gray-800 dark:text-gray-200">
                        {t(!currentFile && !currentYouTube ? "transcript.loadMediaFirst" : "transcript.clickToTranscribe", { provider: transcriptionService.getProviderInfo(currentProvider).name })}
                      </h3>
                      <p className="mx-auto mt-2 max-w-md text-[11px] @[260px]/transcript:text-xs @[400px]/transcript:text-sm text-gray-500 dark:text-gray-400">
                        {currentFile || currentYouTube
                          ? t("transcript.uploadExisting")
                          : t("transcript.loadMediaFirst")}
                      </p>
                      {(currentFile || currentYouTube) && (
                        <div className="mt-4 @[260px]/transcript:mt-5 space-y-3">
                          <div className="flex items-center justify-center gap-2">
                            <label
                              htmlFor="transcribe-language"
                              className="text-[11px] font-medium text-gray-500 dark:text-gray-400"
                            >
                              {t("transcript.language")}
                            </label>
                            <div className="relative">
                              <select
                                id="transcribe-language"
                                value={transcriptLanguage}
                                onChange={(e) => setTranscriptLanguage(e.target.value)}
                                className="h-8 appearance-none rounded-md border border-gray-200 bg-white pl-2.5 pr-7 text-xs text-gray-700 outline-none transition-colors hover:border-gray-300 focus-visible:ring-1 focus-visible:ring-primary-500 dark:border-white/10 dark:bg-gray-900 dark:text-gray-300 dark:hover:border-white/20"
                              >
                                {LANGUAGE_OPTIONS.map((option) => (
                                  <option key={option.value} value={option.value}>
                                    {option.label}
                                  </option>
                                ))}
                              </select>
                              <ChevronDown
                                size={12}
                                className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500"
                              />
                            </div>
                          </div>
                          <div className="flex flex-col @[300px]/transcript:flex-row items-stretch @[300px]/transcript:items-center justify-center gap-2">
                            <button
                              onClick={handleTranscribeDefault}
                              className="inline-flex items-center justify-center gap-2 rounded-md bg-primary-600 px-3 @[260px]/transcript:px-4 py-2 text-xs @[260px]/transcript:text-sm font-medium text-white transition-colors hover:bg-primary-700"
                            >
                              <FileAudio size={14} />
                              <span>
                                {loopStart !== null && loopEnd !== null
                                  ? t("transcript.transcribeLoopRangeButton")
                                  : t("transcript.transcribeWithWhisper")}
                              </span>
                            </button>
                            <TranscriptUploader variant="prominent" />
                          </div>
                          <div className="text-[10px] @[260px]/transcript:text-xs text-gray-400 dark:text-gray-500">
                            .srt / .vtt / .txt
                          </div>
                          {loopStart !== null && loopEnd !== null && (
                            <div className="text-[10px] @[260px]/transcript:text-xs text-primary-600 dark:text-primary-400">
                              {t("transcript.transcribeLoopRangeButton")}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                ) : null
              )}
            </>
          )}

          {filteredSegments.length > 0 && (
            <div
              style={{ height: virtualizer.getTotalSize(), position: "relative" }}
            >
              {virtualizer.getVirtualItems().map((virtualItem: VirtualItem) => {
                const segment = filteredSegments[virtualItem.index];
                if (!segment) {
                  return null;
                }

                return (
                  <div
                    key={segment.id}
                    data-index={virtualItem.index}
                    ref={virtualizer.measureElement}
                    style={{
                      position: "absolute",
                      top: 0,
                      left: 0,
                      width: "100%",
                      transform: `translateY(${virtualItem.start}px)`,
                    }}
                    className="pb-2"
                  >
                    <TranscriptSegmentItem
                      segment={segment}
                      matchedBookmarkId={segmentBookmarkLookup.get(segment.id) ?? null}
                      isPracticed={practicedSegmentIds.has(segment.id)}
                      study={displayTranscriptStudy[segment.id]}
                      highlightsEnabled={highlightsEnabled}
                      activeLevels={activeLevels}
                      activeSelection={
                        activeSelection?.segmentId === segment.id ? activeSelection : null
                      }
                      selectionEnabled={selectionEnabled}
                      onSelectionChange={setActiveSelection}
                      onClearSelection={handleClearSelection}
                    />
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Slim live-transcription status bar — shown once partial segments
            exist, so progress stays visible without covering the transcript. */}
        {isProcessing && filteredSegments.length > 0 && (
          <div className="flex items-center gap-2.5 border-t border-gray-100 dark:border-white/5 bg-white/95 dark:bg-gray-950/80 px-3 py-1.5 shrink-0">
            <Loader size={13} className="animate-spin text-primary-500 shrink-0" />
            <span className="text-xs text-gray-500 dark:text-gray-400 truncate">
              {transcriptionStatus || t("transcript.processingTranscription")}
            </span>
            <div className="flex-1 min-w-[60px] h-1 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
              <div
                className="h-full rounded-full bg-primary-500 transition-all duration-300"
                style={{ width: `${processingProgress}%` }}
              />
            </div>
            <button
              type="button"
              onClick={cancelTranscription}
              className="text-xs font-medium text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors shrink-0"
            >
              {t("common.cancel")}
            </button>
          </div>
        )}
      </div>
      </div>

      {/* Edit bookmark dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("bookmarks.editBookmark")}</DialogTitle>
            <DialogDescription>{t("bookmarks.updateBookmarkDescription")}</DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <label htmlFor="edit-name" className="text-sm font-medium">{t("bookmarks.name")}</label>
              <Input
                id="edit-name"
                value={editName}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setEditName(e.target.value)
                }
                placeholder={t("bookmarks.bookmarkName")}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label htmlFor="edit-start" className="text-sm font-medium">{t("common.start")}</label>
                <Input
                  id="edit-start"
                  type="number"
                  step="0.1"
                  min="0"
                  value={editStart}
                  onChange={(e) => setEditStart(Number(e.target.value))}
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="edit-end" className="text-sm font-medium">{t("common.end")}</label>
                <Input
                  id="edit-end"
                  type="number"
                  step="0.1"
                  min="0"
                  value={editEnd}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEditEnd(Number(e.target.value))}
                />
              </div>
            </div>

            <div className="space-y-2">
              <label htmlFor="edit-annotation" className="text-sm font-medium">{t("bookmarks.annotation")}</label>
              <Textarea
                id="edit-annotation"
                value={editAnnotation}
                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                  setEditAnnotation(e.target.value)
                }
                placeholder={t("bookmarks.annotationOptional")}
                className="h-24"
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsEditDialogOpen(false)}
            >
              {t("common.cancel")}
            </Button>

            <Button
              variant="default"
              onClick={handleSaveEdit}
              disabled={!editName.trim()}
            >
              {t("bookmarks.saveChanges")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
