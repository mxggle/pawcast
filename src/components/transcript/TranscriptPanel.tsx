import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { usePlayerStore } from "../../stores/playerStore";
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
} from "lucide-react";
import { toast } from "react-hot-toast";
import { transcriptionService } from "../../services/transcriptionService";
import { TranscriptionProvider } from "../../types/aiService";
import { TranscriptUploader } from "./TranscriptUploader";
import { TranscriptSegmentItem } from "./TranscriptSegmentItem";
import { breakIntoSentences as utilBreakIntoSentences } from "../../utils/sentenceBreaker";
import { getCurrentTime, subscribeCurrentTime } from "../../stores/currentTimeStore";

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
import { encodeWAV } from "../../utils/wavEncoder";
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
const BOOKMARK_MATCH_TOLERANCE_SECONDS = 0.5;

// WhisperSegment/WhisperResponse types moved to transcriptionService.ts

const isTimeWithinSegment = (time: number, segment: TranscriptSegmentType) =>
  time >= segment.startTime && time <= segment.endTime;

const findMatchingBookmarkId = (
  segment: TranscriptSegmentType,
  bookmarks: LoopBookmark[]
) =>
  bookmarks.find(
    (bookmark) =>
      Math.abs(bookmark.start - segment.startTime) < BOOKMARK_MATCH_TOLERANCE_SECONDS &&
      Math.abs(bookmark.end - segment.endTime) < BOOKMARK_MATCH_TOLERANCE_SECONDS
  )?.id ?? null;

const findSegmentIndexAtTime = (
  segments: TranscriptSegmentType[],
  time: number,
  hintIndex = -1
) => {
  if (segments.length === 0) {
    return -1;
  }

  if (hintIndex >= 0 && hintIndex < segments.length) {
    if (isTimeWithinSegment(time, segments[hintIndex])) {
      return hintIndex;
    }

    const nextIndex = hintIndex + 1;
    if (nextIndex < segments.length && isTimeWithinSegment(time, segments[nextIndex])) {
      return nextIndex;
    }

    const previousIndex = hintIndex - 1;
    if (previousIndex >= 0 && isTimeWithinSegment(time, segments[previousIndex])) {
      return previousIndex;
    }
  }

  let low = 0;
  let high = segments.length - 1;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const segment = segments[mid];

    if (time < segment.startTime) {
      high = mid - 1;
      continue;
    }

    if (time > segment.endTime) {
      low = mid + 1;
      continue;
    }

    return mid;
  }

  return -1;
};

export const TranscriptPanel = () => {
  const LARGE_TRANSCRIPTION_FILE_SIZE = 25 * 1024 * 1024;
  const PROGRESSIVE_TRANSCRIPTION_THRESHOLD_SECONDS = 8 * 60;
  const { t } = useTranslation();
  const navigate = useNavigate();
  const mediaId = usePlayerStore((state) => state.getCurrentMediaId());
  const {
    currentFile,
    currentYouTube,
    startTranscribing,
    stopTranscribing,
    addTranscriptSegment,
    addTranscriptSegments,
    clearTranscript,
    exportTranscript,
    updateBookmark,
    selectedBookmarkId,
    loadBookmark,
    setSelectedBookmarkId,
    setCurrentTime,
    setIsPlaying,
    loopStart,
    loopEnd,
    importBookmarks: storeImportBookmarks,
    isTranscriptLoading,
    isPlaying,
    transcriptLanguage,
    setTranscriptLanguage,
    duration,
  } = usePlayerStore(
    useShallow((state) => ({
      currentFile: state.currentFile,
      currentYouTube: state.currentYouTube,
      startTranscribing: state.startTranscribing,
      stopTranscribing: state.stopTranscribing,
      addTranscriptSegment: state.addTranscriptSegment,
      addTranscriptSegments: state.addTranscriptSegments,
      clearTranscript: state.clearTranscript,
      exportTranscript: state.exportTranscript,
      updateBookmark: state.updateBookmark,
      selectedBookmarkId: state.selectedBookmarkId,
      loadBookmark: state.loadBookmark,
      setSelectedBookmarkId: state.setSelectedBookmarkId,
      setCurrentTime: state.setCurrentTime,
      setIsPlaying: state.setIsPlaying,
      loopStart: state.loopStart,
      loopEnd: state.loopEnd,
      importBookmarks: state.importBookmarks,
      isTranscriptLoading: state.isTranscriptLoading,
      isPlaying: state.isPlaying,
      transcriptLanguage: state.transcriptLanguage,
      setTranscriptLanguage: state.setTranscriptLanguage,
      duration: state.duration,
    }))
  );
  const transcriptSegments = usePlayerStore(
    (state) => (mediaId ? state.mediaTranscripts[mediaId] ?? EMPTY_SEGMENTS : EMPTY_SEGMENTS)
  );
  const bookmarks = usePlayerStore(
    (state) => (mediaId ? state.mediaBookmarks[mediaId] ?? EMPTY_BOOKMARKS : EMPTY_BOOKMARKS)
  );
  const transcriptStudy = usePlayerStore((state) =>
    mediaId ? state.mediaTranscriptStudy[mediaId] ?? EMPTY_STUDY : EMPTY_STUDY
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

  const importFileInputRef = useRef<HTMLInputElement>(null);

  const handleExportBookmarks = () => {
    if (bookmarks.length === 0) {
      toast.error(t("bookmarks.noBookmarksToExport"));
      return;
    }
    const dataStr = JSON.stringify(bookmarks, null, 2);
    const dataUri = `data:application/json;charset=utf-8,${encodeURIComponent(dataStr)}`;
    const exportFileDefaultName = `abloop-bookmarks-${new Date().toISOString().slice(0, 10)}.json`;
    const linkElement = document.createElement("a");
    linkElement.setAttribute("href", dataUri);
    linkElement.setAttribute("download", exportFileDefaultName);
    linkElement.click();
    toast.success(t("bookmarks.bookmarksExported"));
  };

  const handleImportBookmarks = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const importedBookmarks = JSON.parse(e.target?.result as string);
        if (Array.isArray(importedBookmarks)) {
          storeImportBookmarks(importedBookmarks);
          toast.success(t("bookmarks.bookmarksImported", { count: importedBookmarks.length }));
        } else {
          toast.error(t("bookmarks.invalidFileFormat"));
        }
      } catch (error) {
        console.error("Error importing bookmarks:", error);
        toast.error(t("bookmarks.importError"));
      }
    };
    reader.readAsText(file);
    event.target.value = "";
  };

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

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, []);

  // Sync active tab with selected bookmark from store (e.g. from waveform interactions)
  useEffect(() => {
    setActiveTabId(selectedBookmarkId);
  }, [selectedBookmarkId]);

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

  const handleTranscribeDefault = () => {
    transcribeMedia(getPreferredTranscriptRange());
  };

  const [isProcessing, setIsProcessing] = useState(false);
  const [processingProgress, setProcessingProgress] = useState(0);
  const [transcriptionStatus, setTranscriptionStatus] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [apiKey, setApiKey] = useState<string>("");
  const [showApiKeyInput, setShowApiKeyInput] = useState(false);
  const [currentProvider, setCurrentProvider] = useState<TranscriptionProvider>("openai");
  const transcriptRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const virtualizer = useVirtualizer({
    count: filteredSegments.length,
    getScrollElement: () => transcriptRef.current,
    estimateSize: () => 140,
    overscan: 5,
    getItemKey: (index: number) => filteredSegments[index]?.id ?? `segment-${index}`,
  });

  // Load API key and transcription provider from localStorage on component mount
  useEffect(() => {
    const loadSettings = () => {
      const provider = transcriptionService.getPreferredProvider();
      setCurrentProvider(provider);
      const key = transcriptionService.getApiKeyForProvider(provider);
      setApiKey(key);
    };

    loadSettings();

    // Listen for AI settings updates from the AI Settings page
    const handleSettingsUpdate = () => {
      loadSettings();
    };

    window.addEventListener("ai-settings-updated", handleSettingsUpdate);
    window.addEventListener("aiSettingsUpdated", handleSettingsUpdate);

    // Cross-tab/window sync via BroadcastChannel
    let broadcastChannel: BroadcastChannel | null = null;
    if (typeof window !== "undefined" && "BroadcastChannel" in window) {
      broadcastChannel = new BroadcastChannel("abloop-settings");
      broadcastChannel.onmessage = (event) => {
        if (event.data?.type === "ai-settings-updated") {
          loadSettings();
        }
      };
    }

    return () => {
      window.removeEventListener("ai-settings-updated", handleSettingsUpdate);
      window.removeEventListener("aiSettingsUpdated", handleSettingsUpdate);
      broadcastChannel?.close();
    };
  }, []);

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

  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
      abortControllerRef.current = null;
    };
  }, []);

  type TimeRange = { start: number; end: number };

  const normalizeRange = (range?: Partial<TimeRange>): TimeRange | undefined => {
    if (
      range &&
      typeof range.start === "number" &&
      typeof range.end === "number" &&
      range.end > range.start
    ) {
      return { start: range.start, end: range.end };
    }

    return undefined;
  };

  // Function to extract audio from the media file
  const extractAudioFromMedia = async (range?: TimeRange): Promise<Blob> => {
    return new Promise((resolve, reject) => {
      if (!currentFile) {
        reject(new Error(t("transcript.noFileLoaded")));
        return;
      }

      // For audio files, we can use them directly or slice them if range provided
      if (currentFile.type.includes("audio")) {
        fetch(currentFile.url)
          .then(async (response) => {
            if (!range) {
              resolve(await response.blob());
              return;
            }

            return response.arrayBuffer();
          })
          .then(async (arrayBuffer) => {
            if (!range || !arrayBuffer) {
              return;
            }

            try {
              const audioContext = new AudioContext();
              const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

              let startFrame = 0;
              let endFrame = audioBuffer.length;

              if (range) {
                startFrame = Math.floor(range.start * audioBuffer.sampleRate);
                endFrame = Math.floor(range.end * audioBuffer.sampleRate);
                // Ensure bounds
                startFrame = Math.max(0, startFrame);
                endFrame = Math.min(audioBuffer.length, endFrame);
              }

              const frameCount = endFrame - startFrame;
              if (frameCount <= 0) {
                reject(new Error("Invalid time range"));
                return;
              }

              // Extract channel data (mix down to mono if needed, or just take left channel for speech)
              // Better to mix down for speech recognition
              const channel0 = audioBuffer.getChannelData(0);
              const slicedData = new Float32Array(frameCount);

              if (audioBuffer.numberOfChannels > 1) {
                const channel1 = audioBuffer.getChannelData(1);
                // Simple average mixdown
                for (let i = 0; i < frameCount; i++) {
                  const idx = startFrame + i;
                  slicedData[i] = (channel0[idx] + channel1[idx]) / 2;
                }
              } else {
                // Mono copy
                for (let i = 0; i < frameCount; i++) {
                  slicedData[i] = channel0[startFrame + i];
                }
              }

              // Encode to WAV
              const wavBlob = encodeWAV(slicedData, audioBuffer.sampleRate);
              audioContext.close();
              resolve(wavBlob);

            } catch (err) {
              console.error("Error processing audio:", err);
              reject(err);
            }
          })
          .catch((error) => reject(error));
        return;
      }

      // For video files, we need to extract the audio
      if (currentFile.type.includes("video")) {
        const video = document.createElement("video");
        video.src = currentFile.url;

        // Create an audio context and source node
        const audioContext = new AudioContext();
        const destination = audioContext.createMediaStreamDestination();
        const source = audioContext.createMediaElementSource(video);
        source.connect(destination);

        // Create a media recorder to capture the audio
        const mediaRecorder = new MediaRecorder(destination.stream);
        const chunks: BlobPart[] = [];

        mediaRecorder.ondataavailable = (e) => {
          if (e.data.size > 0) {
            chunks.push(e.data);
          }
        };

        mediaRecorder.onstop = () => {
          const blob = new Blob(chunks, { type: "audio/wav" });
          resolve(blob);
        };

        // Start recording and playing the video
        video.onloadedmetadata = () => {
          const startTime = range ? range.start : 0;
          const duration = range ? (range.end - range.start) : video.duration;

          video.currentTime = startTime;

          const onSeeked = () => {
            video.removeEventListener("seeked", onSeeked);
            video.play();
            mediaRecorder.start();

            // Stop recording after the duration
            setTimeout(() => {
              video.pause();
              mediaRecorder.stop();
              audioContext.close();
              video.remove(); // Clean up
            }, duration * 1000);
          };

          video.addEventListener("seeked", onSeeked);
        };

        video.onerror = () => {
          reject(new Error(t("transcript.errorLoadingVideo")));
        };

        return;
      }

      reject(new Error(t("transcript.unsupportedFileType")));
    });
  };

  // Function to transcribe the current media using the selected transcription service
  const transcribeMedia = async (
    requestedRange?: Partial<TimeRange>,
    options?: { forceFullRange?: boolean }
  ) => {
    // Check if we have media to transcribe
    if (!currentFile && !currentYouTube) {
      toast.error(t("transcript.noMediaToTranscribe"));
      return;
    }

    // Check if API key is provided for the current provider
    if (!apiKey && currentProvider !== "local-whisper") {
      setShowApiKeyInput(true);
      return;
    }

    const range = options?.forceFullRange
      ? normalizeRange(requestedRange)
      : normalizeRange(requestedRange) || getPreferredTranscriptRange();

    if (
      currentFile &&
      !range &&
      currentFile.size > LARGE_TRANSCRIPTION_FILE_SIZE
    ) {
      toast(t("transcript.largeFileRangeRecommended"));
    }

    try {
      setIsProcessing(true);
      setErrorMessage("");
      setTranscriptionStatus(null);

      // Only clear if doing full transcript
      if (!range || options?.forceFullRange) {
        clearTranscript();
      }

      abortControllerRef.current?.abort();
      const abortController = new AbortController();
      abortControllerRef.current = abortController;
      startTranscribing();
      setProcessingProgress(10);

      // For YouTube videos, we can't directly access the audio
      if (currentYouTube) {
        toast.error(t("transcript.youtubeTranscriptionWarning"));
        await simulateTranscription();
        return;
      }

      // Extract audio from the media file
      const audioBlob = await extractAudioFromMedia(range);
      setProcessingProgress(30);

      const providerInfo = transcriptionService.getProviderInfo(currentProvider);
      toast(t("transcript.processingWithProvider", { provider: providerInfo.name }));

      setProcessingProgress(50);

      const transcriptionConfig = {
        provider: currentProvider,
        apiKey: apiKey,
        language: transcriptLanguage,
      };
      const shouldUseChunkedTranscription =
        !range && duration >= PROGRESSIVE_TRANSCRIPTION_THRESHOLD_SECONDS;

      // Call the unified transcription service
      const result = shouldUseChunkedTranscription
        ? await transcriptionService.transcribeInChunks(
          transcriptionConfig,
          audioBlob,
          {
            signal: abortController.signal,
            onChunkComplete: (segments, chunkIndex, totalChunks) => {
              setTranscriptionStatus(
                t("transcript.processingChunk", {
                  current: chunkIndex,
                  total: totalChunks,
                })
              );
              setProcessingProgress(
                Math.min(95, 50 + Math.round((chunkIndex / totalChunks) * 45))
              );
              addTranscriptSegments(
                segments.map((segment) => ({
                  text: segment.text.trim(),
                  startTime: Math.max(0, segment.start),
                  endTime: Math.max(segment.start, segment.end),
                  confidence: segment.confidence,
                  isFinal: true,
                }))
              );
            },
          }
        )
        : await transcriptionService.transcribe(
          transcriptionConfig,
          audioBlob,
          { signal: abortController.signal }
        );

      setProcessingProgress(80);

      const startTimeOffset = range ? range.start : 0;

      if (shouldUseChunkedTranscription) {
        setProcessingProgress(100);
        return;
      }

      if (result.segments && result.segments.length > 0) {
        addTranscriptSegments(
          result.segments.map((segment) => ({
            text: segment.text.trim(),
            startTime: Math.max(0, segment.start + startTimeOffset),
            endTime: Math.max(segment.start + startTimeOffset, segment.end + startTimeOffset),
            confidence: segment.confidence,
            isFinal: true,
          }))
        );
      } else {
        // If no segments are returned, use the full transcript with basic sentence breaking
        const sentences = await utilBreakIntoSentences(result.fullText);

        addTranscriptSegments(sentences.map((sentence, index) => {
          const startTime = (index * 30) / sentences.length;
          const endTime = ((index + 1) * 30) / sentences.length;

          return {
            text: sentence.trim(),
            startTime: Math.max(0, startTime + startTimeOffset),
            endTime: Math.max(startTime + startTimeOffset, endTime + startTimeOffset),
            confidence: 0.85,
            isFinal: true,
          };
        }));
      }

      setProcessingProgress(100);
    } catch (error) {
      console.error("Error transcribing media:", error);

      if (error instanceof Error && error.name === "AbortError") {
        toast(t("transcript.transcriptionCancelled"));
        return;
      }

      // More detailed error handling
      let errorMessage = t("transcript.transcriptionFailed");

      if (error instanceof Error) {
        if (
          error.message.includes("401") ||
          error.message.includes("Unauthorized")
        ) {
          errorMessage += t("transcript.invalidApiKey");
        } else if (
          error.message.includes("429") ||
          error.message.includes("rate limit")
        ) {
          errorMessage += t("transcript.rateLimitExceeded");
        } else if (
          error.message.includes("413") ||
          error.message.includes("too large")
        ) {
          errorMessage += t("transcript.audioFileTooLarge");
        } else if (
          error.message.includes("network") ||
          error.message.includes("fetch")
        ) {
          errorMessage += t("transcript.networkError");
        } else {
          errorMessage += t("transcript.genericError", { message: error.message });
        }
      } else {
        errorMessage += t("transcript.unknownError");
      }

      setErrorMessage(errorMessage);
      toast.error(errorMessage);
    } finally {
      if (abortControllerRef.current?.signal.aborted || abortControllerRef.current) {
        abortControllerRef.current = null;
      }
      setTranscriptionStatus(null);
      setIsProcessing(false);
      stopTranscribing();
    }
  };

  // Helper function to create intelligent segments from word-level timestamps
  // TEMPORARILY DISABLED
  /*
  const createIntelligentSegments = async (
    words: Array<{ word: string; start: number; end: number }>,
    fullText: string
  ) => {
    console.log("Creating intelligent segments from", words.length, "words");
    console.log("Full text:", fullText);

    // Instead of trying to match sentences to words, let's use a simpler approach:
    // 1. Create segments based on natural pauses in the word timestamps
    // 2. Then apply sentence breaking to the text within reasonable time boundaries
    // 3. Bridge gaps to create continuous timing for better loop functionality

    const segments = [];
    const pauseThreshold = 0.8; // If there's more than 0.8s gap between words, consider it a segment break

    let currentSegmentWords = [];
    let currentSegmentText = "";
    let lastSegmentEndTime = 0; // Track the end time of the last segment to ensure continuity

    for (let i = 0; i < words.length; i++) {
      const word = words[i];
      const nextWord = words[i + 1];

      currentSegmentWords.push(word);
      currentSegmentText += word.word + " ";

      // Check if this should be the end of a segment
      const shouldEndSegment =
        !nextWord || // Last word
        nextWord.start - word.end > pauseThreshold || // Long pause
        currentSegmentText.length > 200; // Segment getting too long

      if (shouldEndSegment && currentSegmentWords.length > 0) {
        // Use continuous timing - start where last segment ended, or at the first word's start time
        const segmentStart =
          lastSegmentEndTime > 0
            ? lastSegmentEndTime
            : currentSegmentWords[0].start;
        const naturalSegmentEnd =
          currentSegmentWords[currentSegmentWords.length - 1].end;

        // If there's a next word, extend this segment to bridge the gap
        const segmentEnd = nextWord ? nextWord.start : naturalSegmentEnd;

        // Apply sentence breaking to this segment's text
        const sentences = utilBreakIntoSentences(currentSegmentText.trim());

        if (sentences.length > 1) {
          // Multiple sentences in this segment - split the timing proportionally
          const totalDuration = segmentEnd - segmentStart;
          const totalLength = currentSegmentText.trim().length;

          let currentTime = segmentStart;

          sentences.forEach((sentence, sentenceIndex) => {
            const sentenceLength = sentence.length;
            const sentenceDuration = Math.max(
              0.5,
              (sentenceLength / totalLength) * totalDuration
            );
            let endTime =
              sentenceIndex === sentences.length - 1
                ? segmentEnd
                : currentTime + sentenceDuration;

            // Ensure minimum duration of 0.3 seconds but don't create gaps
            const minDuration = 0.3;
            const actualDuration = endTime - currentTime;
            if (actualDuration < minDuration) {
              endTime = currentTime + minDuration;
            }

            segments.push({
              text: sentence,
              startTime: currentTime,
              endTime: endTime,
              confidence: 0.9,
            });

            console.log(
              `Created sentence segment: "${sentence}" (${currentTime}s - ${endTime}s)`
            );
            currentTime = endTime; // No gap - next sentence starts exactly where this one ends
          });

          lastSegmentEndTime = segmentEnd;
        } else {
          // Single sentence - use the full segment timing
          segments.push({
            text: currentSegmentText.trim(),
            startTime: segmentStart,
            endTime: segmentEnd,
            confidence: 0.9,
          });

          console.log(
            `Created single segment: "${currentSegmentText.trim()}" (${segmentStart}s - ${segmentEnd}s)`
          );

          lastSegmentEndTime = segmentEnd;
        }

        // Reset for next segment
        currentSegmentWords = [];
        currentSegmentText = "";
      }
    }

    console.log("Final segments:", segments);
    return segments;
  };
  */

  // Helper function to post-process segments for better sentence breaking
  // TEMPORARILY DISABLED
  /*
  const postProcessSegments = async (segments: WhisperSegment[]) => {
    const processedSegments = [];

    for (const segment of segments) {
      // If segment is too long, try to break it into sentences
      if (segment.text.length > 100) {
        const sentences = await utilBreakIntoSentences(segment.text);

        if (sentences.length > 1) {
          const duration = segment.end - segment.start;
          const timePerSentence = duration / sentences.length;

          sentences.forEach((sentence, index) => {
            const segmentStart = segment.start + index * timePerSentence;
            const segmentEnd = segment.start + (index + 1) * timePerSentence;

            // Ensure minimum duration of 0.3 seconds but don't create gaps
            const minDuration = 0.3;
            const actualDuration = segmentEnd - segmentStart;
            const finalEnd =
              actualDuration < minDuration
                ? segmentStart + minDuration
                : segmentEnd;

            processedSegments.push({
              ...segment,
              text: sentence,
              start: segmentStart,
              end: finalEnd,
            });
          });
        } else {
          processedSegments.push(segment);
        }
      } else {
        processedSegments.push(segment);
      }
    }

    return processedSegments;
  };
  */

  // Segment processing is now handled by transcriptionService.ts


  // Simulate transcription process for demo purposes
  const simulateTranscription = async () => {
    // Sample transcript segments to simulate real transcription - with continuous timing (no gaps)
    const sampleSegments = [
      {
        text: "Welcome to this audio demonstration.",
        startTime: 0.0,
        endTime: 3.5,
        confidence: 0.92,
      },
      {
        text: "Today we'll explore the key features of our application.",
        startTime: 3.5,
        endTime: 7.2,
        confidence: 0.89,
      },
      {
        text: "The first feature is the ability to create precise loops.",
        startTime: 7.2,
        endTime: 10.8,
        confidence: 0.95,
      },
      {
        text: "You can set the start and end points exactly where you want them.",
        startTime: 10.8,
        endTime: 14.5,
        confidence: 0.91,
      },
      {
        text: "This is perfect for musicians practicing difficult passages.",
        startTime: 14.5,
        endTime: 18.2,
        confidence: 0.88,
      },
      {
        text: "Or for language learners who want to repeat specific phrases.",
        startTime: 18.2,
        endTime: 22.0,
        confidence: 0.93,
      },
      {
        text: "The second feature is our waveform visualization.",
        startTime: 22.0,
        endTime: 25.8,
        confidence: 0.9,
      },
      {
        text: "It helps you see the audio structure and identify specific parts.",
        startTime: 25.8,
        endTime: 30.0,
        confidence: 0.87,
      },
      {
        text: "And now we've added automatic transcription.",
        startTime: 30.0,
        endTime: 33.2,
        confidence: 0.94,
      },
      {
        text: "So you can read along as you listen.",
        startTime: 33.2,
        endTime: 36.0,
        confidence: 0.92,
      },
    ];

    // Clear any existing transcript
    clearTranscript();

    // Add segments with delay to simulate processing time
    for (let i = 0; i < sampleSegments.length; i++) {
      const segment = sampleSegments[i];
      const progress = Math.round(((i + 1) / sampleSegments.length) * 100);

      // Update progress
      setProcessingProgress(progress);

      // Add segment to store
      addTranscriptSegment({
        text: segment.text,
        startTime: Math.max(0, segment.startTime),
        endTime: Math.max(segment.startTime, segment.endTime), // Remove the 0.5s buffer
        confidence: segment.confidence,
        isFinal: true,
      });

      // Delay to simulate processing time
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  };

  // Scroll to bottom when new segments are added (during live transcription)
  useEffect(() => {
    if (isProcessing && filteredSegments.length > 0) {
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
      usePlayerStore.getState().deleteBookmark(id);
      toast.success(t("bookmarks.bookmarkDeleted"));
    }
  };

  return (
    <div className="flex h-full w-full flex-1 min-h-0 bg-white dark:bg-gray-950/40 rounded-t-xl border border-gray-100 dark:border-white/5 overflow-hidden relative z-0">
      {/* Sidebar Toggle Button (Floating or inside) */}
      <button
        onClick={() => setIsSidebarOpen(!isSidebarOpen)}
        className={`absolute z-10 top-2 left-2 p-1.5 rounded-md bg-white dark:bg-gray-900 shadow-lg border border-gray-200 dark:border-white/10 text-gray-500 hover:text-primary-600 dark:text-gray-400 dark:hover:text-primary-400 transition-all duration-300 ${isSidebarOpen ? "opacity-0 pointer-events-none" : "opacity-100"}`}
        title={t("transcript.toggleSidebar")}
      >
        <Sidebar size={16} />
      </button>

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
          <div className="transcript-header flex items-center justify-between p-3 sm:p-4 border-b border-gray-100 dark:border-white/5 bg-white dark:bg-gray-950/60 backdrop-blur-md min-w-0 gap-2">
            <div className="flex items-center min-w-0 mr-2">
              <h3 className="transcript-header-title text-sm font-medium text-gray-700 dark:text-gray-300 truncate">
                {activeTabId
                  ? bookmarks.find(b => b.id === activeTabId)?.name || t("transcript.title")
                  : t("transcript.title")
                }
              </h3>
              {isProcessing && (
                <div className="ml-2 flex items-center flex-shrink-0">
                  <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
                  <span className="ml-1 text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">
                    {transcriptionStatus || t("transcript.processing", { progress: processingProgress })}
                  </span>
                </div>
              )}
            </div>

            <div className="transcript-header-actions flex items-center gap-1.5 sm:gap-2 flex-shrink-0 overflow-hidden">
            <button
              onClick={() => setHighlightsEnabled((previous) => !previous)}
              className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-colors ${highlightsEnabled
                ? "bg-primary-100 text-primary-700 hover:bg-primary-200 dark:bg-primary-900/30 dark:text-primary-300 dark:hover:bg-primary-900/50"
                : "bg-gray-100 text-gray-500 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700"
                }`}
              title={t("transcript.levelToggle")}
            >
              <span className="text-[10px] font-semibold uppercase tracking-wide">
                {levelSystem === "jlpt" ? "JLPT" : "CEFR"}
              </span>
              <span className="hidden sm:inline">
                {highlightsEnabled
                  ? t("transcript.levelsOn")
                  : t("transcript.levelsOff")}
              </span>
            </button>

            <div className="transcript-secondary-control relative hidden sm:block">
              <button
                onClick={() => setLevelFilterOpen((open) => !open)}
                disabled={!highlightsEnabled}
                className="inline-flex items-center gap-1 rounded-md bg-gray-100 px-2 py-1 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-200 disabled:opacity-40 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700"
                title={t("transcript.levelFilter")}
              >
                {t("transcript.levelFilter")}
                <span className="text-[10px]">{t("transcript.dropdownArrow")}</span>
              </button>
              {levelFilterOpen && highlightsEnabled && (
                <>
                  <div
                    className="fixed inset-0 z-10"
                    onClick={() => setLevelFilterOpen(false)}
                  />
                  <div className="absolute right-0 top-full z-20 mt-1 w-40 rounded-md border border-gray-200 bg-white p-2 shadow-md dark:border-gray-700 dark:bg-gray-800">
                    <button
                      onClick={clearLevelFilter}
                      className="mb-2 w-full rounded px-2 py-1 text-left text-xs text-gray-500 transition-colors hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
                    >
                      {t("transcript.levelFilterAll")}
                    </button>
                    <div className="space-y-1">
                      {levelOptions.map((level) => (
                        <label
                          key={level}
                          className="flex cursor-pointer items-center justify-between rounded px-2 py-1 text-xs text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
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

            <div className="transcript-language-select relative">
              <select
                value={transcriptLanguage}
                onChange={(e) => setTranscriptLanguage(e.target.value)}
                className="appearance-none rounded-md border border-gray-300 bg-white px-2 py-1 pr-6 text-xs text-gray-700 outline-none transition focus:border-primary-400 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300"
              >
                {LANGUAGE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <span className="pointer-events-none absolute inset-y-0 right-1.5 flex items-center text-[10px] text-gray-400 dark:text-gray-500">
                ▼
              </span>
            </div>

            <div className="transcript-secondary-control relative hidden md:block">
              <button
                onClick={() => setExportOpen((o) => !o)}
                disabled={transcriptSegments.length === 0}
                className="inline-flex items-center gap-1 rounded-md bg-gray-100 px-2 py-1 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-200 disabled:opacity-40 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700"
              >
                <Download size={13} />
                <span className="hidden lg:inline">{t("common.export")}</span>
                <span className="text-[10px]">{t("transcript.dropdownArrow")}</span>
              </button>
              {exportOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setExportOpen(false)} />
                  <div className="absolute right-0 top-full z-20 mt-1 min-w-[72px] rounded-md border border-gray-200 bg-white py-1 shadow-md dark:border-gray-700 dark:bg-gray-800">
                    {(["txt", "srt", "vtt"] as const).map((fmt) => (
                      <button
                        key={fmt}
                        onClick={() => { handleExport(fmt); setExportOpen(false); }}
                        className="block w-full px-3 py-1.5 text-left text-xs text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
                      >
                        {fmt.toUpperCase()}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>

            <button
              onClick={() => setAutoScrollEnabled(!autoScrollEnabled)}
              className={`p-1.5 rounded-full transition-all duration-200 ${autoScrollEnabled
                ? "bg-primary-500/20 text-primary-600 dark:bg-primary-500/30 dark:text-primary-400"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700"
                }`}
              title={t("transcript.autoScroll")}
            >
              <LocateFixed size={16} className={autoScrollEnabled ? "fill-current" : ""} />
            </button>

            <button
              onClick={scrollToActiveSegment}
              className="transcript-secondary-control hidden sm:flex p-1.5 rounded-full bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700 disabled:opacity-40 transition-all duration-200 active:scale-90"
              title={t("transcript.scrollToCurrent")}
              disabled={filteredSegments.length === 0}
            >
              <Locate size={16} />
            </button>

            <button
              onClick={handleOpenAISettings}
              className="transcript-secondary-control hidden sm:flex p-1.5 rounded-full bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700"
              title={t("transcript.openAiSettings")}
            >
              <Settings size={16} />
            </button>

            <button
              onClick={() => navigate("/sentence-practice")}
              className="transcript-secondary-control hidden lg:flex p-1.5 rounded-full bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700 disabled:opacity-40 transition-all duration-200 active:scale-90"
              title={t("sentencePractice.title")}
              disabled={transcriptSegments.length === 0}
            >
              <ListMusic size={16} />
            </button>

            <button
              onClick={() => clearTranscript()}
              className="p-1.5 rounded-full bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700"
              title={t("transcript.clearTranscript")}
              disabled={transcriptSegments.length === 0}
            >
              <Trash size={16} />
            </button>
            </div>
          </div>

        <div
          ref={transcriptRef}
          className="transcript-content-scroll flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-4 pt-8 pb-6 md:px-8 lg:px-16 md:pb-12"
        >
          {showApiKeyInput && (
            <div className="p-4 bg-blue-50 dark:bg-blue-900/20 text-blue-800 dark:text-blue-200 rounded-md mb-3">
              <h4 className="font-medium mb-2">{t("transcript.apiKeyRequired")}</h4>
              <p className="text-xs mb-3">{t("transcript.apiKeyNotice")}</p>
              <div className="flex space-x-2">
                <button
                  onClick={handleOpenAISettings}
                  className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs font-medium flex items-center gap-1"
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

          {isProcessing && (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <Loader size={24} className="animate-spin text-blue-500 mb-2" />
              <p className="text-gray-600 dark:text-gray-400">
                {transcriptionStatus || t("transcript.processingTranscription")}
              </p>
              <div className="w-full max-w-xs bg-gray-200 dark:bg-gray-700 rounded-full h-2.5 mt-3">
                <div
                  className="bg-blue-600 h-2.5 rounded-full transition-all duration-300"
                  style={{ width: `${processingProgress}%` }}
                ></div>
              </div>
              <button
                type="button"
                onClick={() => abortControllerRef.current?.abort()}
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
                  <Loader size={24} className="animate-spin text-blue-500 mb-2" />
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
                      <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                        {t("transcript.noTranscriptForBookmark")}
                      </p>
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
                  <div className="mx-auto flex min-h-[260px] max-w-lg items-center justify-center py-6">
                    <div className="w-full rounded-lg border border-gray-200 bg-gray-50 px-6 py-7 text-center dark:border-gray-700 dark:bg-gray-800/50">
                      <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-primary-100 text-primary-600 dark:bg-primary-900/30 dark:text-primary-400">
                        <FileAudio size={18} />
                      </div>
                      <h3 className="text-sm font-medium text-gray-800 dark:text-gray-200">
                        {t(!currentFile && !currentYouTube ? "transcript.loadMediaFirst" : "transcript.clickToTranscribe", { provider: transcriptionService.getProviderInfo(currentProvider).name })}
                      </h3>
                      <p className="mx-auto mt-2 max-w-md text-sm text-gray-500 dark:text-gray-400">
                        {currentFile || currentYouTube
                          ? t("transcript.uploadExisting")
                          : t("transcript.loadMediaFirst")}
                      </p>
                      {(currentFile || currentYouTube) && (
                        <div className="mt-5 space-y-3">
                          <div className="flex flex-col items-center justify-center gap-2 sm:flex-row">
                            <button
                              onClick={handleTranscribeDefault}
                              className="inline-flex items-center justify-center gap-2 rounded-md bg-primary-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-700"
                            >
                              <FileAudio size={16} />
                              {loopStart !== null && loopEnd !== null
                                ? t("transcript.transcribeLoopRangeButton")
                                : t("transcript.transcribeWithWhisper")}
                            </button>
                            <TranscriptUploader variant="prominent" />
                          </div>
                          <div className="text-xs text-gray-400 dark:text-gray-500">
                            .srt / .vtt / .txt
                          </div>
                          {loopStart !== null && loopEnd !== null && (
                            <div className="text-xs text-primary-600 dark:text-primary-400">
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
