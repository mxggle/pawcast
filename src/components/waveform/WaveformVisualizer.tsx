import React, { useRef, useEffect, useState, useCallback, useMemo } from "react";
import { usePlayerStore } from "../../stores/playerStore";
import { useSettingsStore } from "../../stores/settingsStore";
import type { LoopBookmark } from "../../stores/playerStore";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { useShadowingStore } from "../../stores/shadowingStore";
import { useShallow } from "zustand/react/shallow";
import {
  CachedWaveformData,
  getCachedWaveform,
  retrieveMediaFile,
  setCachedWaveform,
} from "../../utils/mediaStorage";
import { useShadowingPlayer } from "../../hooks/useShadowingPlayer";
import { X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "../../utils/cn";
import { bumpRender } from "../../utils/perfMonitor";
import { useShadowingRecorder } from "../../hooks/useShadowingRecorder";
import {
  analyzeAudioFileWaveform,
  buildWaveformMediaKey,
  createPlaceholderWaveform,
  shouldUseAdaptiveWaveform,
  shouldUseDetailedWaveform,
  shouldUseProgressiveWaveform,
} from "../../utils/waveformAnalysis";
import { WaveformRenderer } from "../../player/WaveformRenderer";
import type { BookmarkRenderData } from "../../player/WaveformRenderer";
import { playbackClock } from "../../player/PlaybackClock";
import { waveformLoader } from "../../player/WaveformLoader";
import { usePlayerSelection } from "../../player/hooks";

// Stable empty arrays used in selectors to avoid creating
// a new [] on every render (prevents infinite re-render loops)
type ShadowingSegmentView = {
  id: string;
  startTime: number;
  duration: number;
  storageId: string;
  fileOffset?: number;
  peaks?: number[];
  peakTimes?: number[];
};

const EMPTY_SEGMENTS: readonly ShadowingSegmentView[] = Object.freeze([]);
const EMPTY_BOOKMARKS: readonly LoopBookmark[] = Object.freeze([]);

type BrowserWindowWithLegacyAudio = Window &
  typeof globalThis & {
    webkitAudioContext?: typeof AudioContext;
  };

const normalizeCachedWaveform = (
  waveform: CachedWaveformData
): CachedWaveformData => ({
  ...waveform,
  status:
    waveform.status ?? (waveform.strategy === "placeholder" ? "placeholder" : "ready"),
  progress:
    typeof waveform.progress === "number"
      ? Math.max(0, Math.min(100, waveform.progress))
      : waveform.strategy === "placeholder"
        ? 0
        : 100,
});

type ShadowWaveform = {
  start: number;
  data: Float32Array;
  duration: number;
};

type CurrentRecordingOverlay = {
  startTime: number;
  peaks: number[];
  peakTimes: number[];
};

type RecordingOverlay = CurrentRecordingOverlay & {
  startedAt: number;
};

// Utility function to format time in mm:ss.ms format
const formatTime = (time: number): string => {
  if (isNaN(time)) return "00:00.0";

  const minutes = Math.floor(time / 60);
  const seconds = Math.floor(time % 60);
  const milliseconds = Math.floor((time % 1) * 10);

  return `${minutes.toString().padStart(2, "0")}:${seconds
    .toString()
    .padStart(2, "0")}.${milliseconds}`;
};

interface WaveformVisualizerProps {
  className?: string;
}

export const WaveformVisualizer = ({ className }: WaveformVisualizerProps) => {
  bumpRender("WaveformVisualizer");
  const { t } = useTranslation();
  const staticCanvasRef = useRef<HTMLCanvasElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const playheadCanvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Track clickable bookmark lane rects (CSS pixel units)
  const laneRectsRef = useRef<
    { id: string; x1: number; x2: number; y1: number; y2: number }[]
  >([]);

  // WaveformRenderer instance
  const rendererRef = useRef<WaveformRenderer | null>(null);
  // FFmpeg waveform state (Electron-only)
  const ffmpegMediaIdRef = useRef<string | null>(null);
  const ffmpegReadyRef = useRef(false);

  const [waveformData, setWaveformData] = useState<Float32Array | null>(null);
  const [waveformLoadState, setWaveformLoadState] = useState<{
    status: "idle" | "placeholder" | "analyzing" | "ready" | "error";
    progress: number;
  }>({ status: "idle", progress: 0 });

  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState<number | null>(null);
  const [dragEnd, setDragEnd] = useState<number | null>(null);
  const [hoverTime, setHoverTime] = useState<number | null>(null);
  const [touchStartTime, setTouchStartTime] = useState<number | null>(null);
  const [pinchStartDistance, setPinchStartDistance] = useState<number | null>(null);
  const [pinchStartZoom, setPinchStartZoom] = useState<number>(1);

  const [overlapMenu, setOverlapMenu] = useState<{
    x: number;
    y: number;
    items: { id: string; name: string; start: number; end: number }[];
  } | null>(null);

  const dragStartXRef = useRef<number | null>(null);
  const lastSelectionUpdateRef = useRef(0);
  const [resizingBookmark, setResizingBookmark] = useState<{ id: string; edge: "start" | "end" } | null>(null);
  const resizingRef = useRef(false);
  const wasPlayingRef = useRef(false);

  // Desktop: independent viewport scroll position (left edge of visible window in seconds)
  const [scrollOffset, setScrollOffset] = useState(0);
  const [isPanning, setIsPanning] = useState(false);
  const panStartScrollRef = useRef(0);

  // Detect if device is mobile
  const isMobile = useMediaQuery("(max-width: 768px)");

  const {
    currentTime,
    duration,
    loopStart,
    loopEnd,
    isLooping,
    selectedBookmarkId,
    setCurrentTime,
    setLoopPoints,
    setIsLooping,
    loadBookmark,
    setIsPlaying,
    isPlaying,
    updateBookmark,
  } = usePlayerStore(
    useShallow((state) => ({
      currentTime: state.currentTime,
      duration: state.duration,
      loopStart: state.loopStart,
      loopEnd: state.loopEnd,
      isLooping: state.isLooping,
      selectedBookmarkId: state.selectedBookmarkId,
      setCurrentTime: state.setCurrentTime,
      setLoopPoints: state.setLoopPoints,
      setIsLooping: state.setIsLooping,
      loadBookmark: state.loadBookmark,
      setIsPlaying: state.setIsPlaying,
      isPlaying: state.isPlaying,
      updateBookmark: state.updateBookmark,
    }))
  );

  const { waveformZoom, showWaveform, setWaveformZoom } = useSettingsStore();

  const {
    currentRecording,
    currentRecordingRevision,
    isShadowingMode, setShadowingMode,
  } = useShadowingStore(
    useShallow((state) => ({
      currentRecording: state.currentRecording,
      currentRecordingRevision: state.currentRecordingRevision,
      isShadowingMode: state.isShadowingMode,
      setShadowingMode: state.setShadowingMode,
    }))
  );

  const { currentFile, currentYouTube } = usePlayerStore(
    useShallow((state) => ({
      currentFile: state.currentFile,
      currentYouTube: state.currentYouTube,
    }))
  );

  const mediaId = useMemo(() => {
    if (!currentFile && !currentYouTube) return null;
    return currentFile
      ? currentFile.storageId || currentFile.id || `file-${currentFile.name}-${currentFile.size}`
      : `youtube-${currentYouTube!.id}`;
  }, [currentFile, currentYouTube]);

  const shadowingSegments = useShadowingStore((state) => {
    if (!mediaId) return EMPTY_SEGMENTS;
    return state.sessions[mediaId]?.segments || EMPTY_SEGMENTS;
  });

  const [shadowingWaveforms, setShadowingWaveforms] = useState<ShadowWaveform[]>([]);
  const [fadingRecording, setFadingRecording] = useState<RecordingOverlay | null>(null);
  const previousCurrentRecordingRef = useRef<CurrentRecordingOverlay | null>(null);
  const [fadeFrame, setFadeFrame] = useState(0);

  // Shadowing panel expand/collapse state
  const [isShadowingExpanded, setIsShadowingExpanded] = useState(false);
  const prevShouldExpandRef = useRef(false);

  // Auto-expand shadowing when recording or segments exist
  useEffect(() => {
    const shouldExpand = isShadowingMode || shadowingSegments.length > 0 || !!currentRecording;
    if (shouldExpand && !prevShouldExpandRef.current) {
      setIsShadowingExpanded(true);
    }
    prevShouldExpandRef.current = shouldExpand;
  }, [isShadowingMode, shadowingSegments.length, currentRecording]);

  // Shared selection for transcript-timeline sync
  const { selection, setSelection } = usePlayerSelection();

  // Initialize Shadowing Player & Recorder
  useShadowingPlayer();
  useShadowingRecorder();

  // Load shadowing waveforms
  useEffect(() => {
    if (shadowingSegments.length === 0) {
      setShadowingWaveforms([]);
      return;
    }

    let active = true;
    const loadShadowing = async () => {
      const loaded = await Promise.all(
        shadowingSegments.map(async (seg, index) => {
          try {
            if (seg.peaks?.length) {
              return {
                start: seg.startTime,
                data: Float32Array.from(seg.peaks),
                duration: seg.duration,
              };
            }

            const file = await retrieveMediaFile(seg.storageId);
            if (!file) return null;

            const arrayBuffer = await file.arrayBuffer();
            const AudioContextCtor =
              window.AudioContext ||
              (window as BrowserWindowWithLegacyAudio).webkitAudioContext;
            if (!AudioContextCtor) return null;
            const audioContext = new AudioContextCtor();
            const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

            const fileOffset = seg.fileOffset || 0;
            const segmentDuration = seg.duration > 0 ? seg.duration : (audioBuffer.duration - fileOffset);

            const startSample = Math.floor(fileOffset * audioBuffer.sampleRate);
            const endSample = Math.min(
              Math.floor((fileOffset + segmentDuration) * audioBuffer.sampleRate),
              audioBuffer.length
            );

            let rawData = audioBuffer.getChannelData(0);
            if (fileOffset > 0 || endSample < rawData.length) {
              rawData = rawData.slice(startSample, endSample);
            }

            const data = downsampleAudioData(rawData, 1000);
            audioContext.close();

            return {
              start: seg.startTime,
              data,
              duration: segmentDuration
            };
          } catch (e) {
            console.error(`[WaveformVisualizer] Failed to load shadowing segment ${index}:`, e);
            return null;
          }
        })
      );

      if (active) {
        const validWaveforms = loaded.filter((s): s is NonNullable<typeof s> => s !== null);
        setShadowingWaveforms(validWaveforms);
      }
    };

    loadShadowing();
    return () => { active = false; };
  }, [shadowingSegments, mediaId]);

  useEffect(() => {
    if (currentRecording) {
      previousCurrentRecordingRef.current = currentRecording;
      setFadingRecording(null);
      return;
    }

    const previousRecording = previousCurrentRecordingRef.current;
    if (!previousRecording || previousRecording.peaks.length === 0) return;

    const overlay: RecordingOverlay = {
      ...previousRecording,
      startedAt: performance.now(),
    };
    setFadingRecording(overlay);
    previousCurrentRecordingRef.current = null;

    const timeoutId = window.setTimeout(() => {
      setFadingRecording((current) => current === overlay ? null : current);
    }, 350);

    return () => window.clearTimeout(timeoutId);
  }, [currentRecording]);

  useEffect(() => {
    if (!fadingRecording) return;
    let frameId = 0;
    const tick = () => {
      setFadeFrame((value) => value + 1);
      frameId = window.requestAnimationFrame(tick);
    };
    frameId = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frameId);
  }, [fadingRecording]);

  // Subscribe to bookmarks
  const bookmarks = usePlayerStore((state) => {
    return mediaId && state.mediaBookmarks[mediaId]
      ? state.mediaBookmarks[mediaId]
      : EMPTY_BOOKMARKS;
  });

  const bookmarkMap = useMemo(
    () => new Map(bookmarks.map((bookmark) => [bookmark.id, bookmark])),
    [bookmarks]
  );
  const getBookmarkById = useCallback(
    (id: string) => bookmarkMap.get(id) ?? null,
    [bookmarkMap]
  );

  // YouTube notice dismissal state
  const [isYoutubeNoticeDismissed, setIsYoutubeNoticeDismissed] = useState(false);

  useEffect(() => {
    if (currentYouTube?.id) setIsYoutubeNoticeDismissed(false);
  }, [currentYouTube?.id]);

  useEffect(() => {
    if (typeof waveformZoom !== "number" || !isFinite(waveformZoom)) {
      setWaveformZoom(1);
    }
  }, [waveformZoom, setWaveformZoom]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOverlapMenu(null);
        setSelection(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setSelection]);

  // Load audio/video file and analyze waveform
  useEffect(() => {
    const hasMedia = currentFile?.url || currentYouTube?.id;
    if (!hasMedia || (currentFile && !currentFile.type.includes("audio") && !currentFile.type.includes("video"))) {
      setWaveformData(null);
      setWaveformLoadState({ status: "idle", progress: 0 });
      ffmpegMediaIdRef.current = null;
      ffmpegReadyRef.current = false;
      return;
    }

    let cancelled = false;
    let idleId: number | null = null;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const setWaveformPreview = (waveform: CachedWaveformData) => {
      if (cancelled) return;
      const normalized = normalizeCachedWaveform(waveform);
      setWaveformData(Float32Array.from(normalized.peaks));
      setWaveformLoadState({
        status: normalized.status ?? "ready",
        progress: normalized.progress ?? 0,
      });
    };

    const scheduleBackgroundAnalysis = (task: () => void) => {
      if (typeof window !== "undefined" && "requestIdleCallback" in window) {
        idleId = window.requestIdleCallback(() => task());
        return;
      }
      timeoutId = globalThis.setTimeout(task, 0);
    };

    const loadAudio = async () => {
      // FFmpeg path (Electron only) — fall through to AudioContext on failure
      if (waveformLoader.isAvailable && currentFile?.nativePath) {
        const filePath = currentFile.nativePath;
        ffmpegMediaIdRef.current = filePath;
        ffmpegReadyRef.current = false;
        setWaveformLoadState({ status: 'analyzing', progress: 0 });
        try {
          let meta = await waveformLoader.getMeta(filePath);
          if (!meta) {
            meta = await waveformLoader.analyze(filePath, filePath, (fraction) => {
              if (cancelled) return;
              setWaveformLoadState({ status: 'analyzing', progress: Math.round(fraction * 100) });
            });
          }
          if (cancelled) return;
          const canvasW = staticCanvasRef.current?.clientWidth ?? 800;
          const levelData = await waveformLoader.loadForViewport({
            mediaId: filePath,
            visibleDuration: duration / (waveformZoom ?? 1),
            canvasWidth: canvasW,
          });
          if (levelData && !cancelled) {
            rendererRef.current?.setWaveformData(levelData);
            ffmpegReadyRef.current = true;
            setWaveformLoadState({ status: 'ready', progress: 100 });
            return;
          }
        } catch (error) {
          console.error('FFmpeg waveform analysis failed, falling back to AudioContext:', error);
        }
        // FFmpeg path failed — reset and fall through to AudioContext
        ffmpegMediaIdRef.current = null;
        ffmpegReadyRef.current = false;
      }

      try {
        if (currentYouTube) {
          if (!cancelled) setWaveformPreview(createPlaceholderWaveform(duration || 0, 1200));
          return;
        }

        if (!currentFile?.url) return;

        const mediaKey = buildWaveformMediaKey(currentFile);
        const cached = await getCachedWaveform(mediaKey);

        if (currentFile.type.includes("video")) {
          const placeholder: CachedWaveformData = {
            ...createPlaceholderWaveform(duration || 0, 1200),
            status: "ready",
            progress: 100,
          };
          await setCachedWaveform(mediaKey, placeholder);
          setWaveformPreview(placeholder);
          return;
        }

        const file = currentFile.storageId
            ? await retrieveMediaFile(currentFile.storageId)
            : await fetch(currentFile.url).then(r => r.blob()).then(b => new File([b], currentFile.name, { type: currentFile.type }));

        if (!file) throw new Error("Unable to load file for waveform analysis");

        const normalizedCached = cached ? normalizeCachedWaveform(cached) : null;
        const isDetailed = shouldUseDetailedWaveform(file);
        const isAdaptive = shouldUseAdaptiveWaveform(file);
        const isProgressive = shouldUseProgressiveWaveform(file);
        const canAnalyze = isDetailed || isAdaptive;

        if (normalizedCached) {
          setWaveformPreview(normalizedCached);
          if (normalizedCached.status === "ready" || !canAnalyze) return;
        }

        if (!canAnalyze) {
          const placeholder: CachedWaveformData = {
            ...(normalizedCached ?? createPlaceholderWaveform(duration || 0, 800)),
            status: "placeholder",
            progress: 0,
            updatedAt: Date.now(),
          };
          await setCachedWaveform(mediaKey, placeholder);
          setWaveformPreview(placeholder);
          return;
        }

        if (isProgressive) {
          const placeholder: CachedWaveformData = {
            ...(normalizedCached ?? createPlaceholderWaveform(duration || 0, 1000)),
            status: "analyzing",
            progress: Math.max(5, normalizedCached?.progress ?? 0),
            updatedAt: Date.now(),
          };

          await setCachedWaveform(mediaKey, placeholder);
          setWaveformPreview(placeholder);

          scheduleBackgroundAnalysis(() => {
            void (async () => {
              try {
                const analysis = await analyzeAudioFileWaveform(file, (update) => {
                  if (cancelled) return;
                  const previewWaveform: CachedWaveformData = {
                    peaks: placeholder.peaks,
                    resolution: placeholder.resolution,
                    duration: duration || placeholder.duration,
                    strategy: placeholder.strategy,
                    status: update.status,
                    progress: update.progress,
                    updatedAt: Date.now(),
                  };
                  setWaveformLoadState({ status: update.status, progress: update.progress });
                  void setCachedWaveform(mediaKey, previewWaveform);
                });
                await setCachedWaveform(mediaKey, analysis);
                setWaveformPreview(analysis);
              } catch (error) {
                console.error("Error analyzing waveform in background:", error);
              }
            })();
          });
          return;
        }

        const analysis = await analyzeAudioFileWaveform(file, (update) => {
          if (cancelled) return;
          setWaveformLoadState({ status: update.status, progress: update.progress });
        });

        await setCachedWaveform(mediaKey, analysis);
        setWaveformPreview(analysis);
      } catch (error) {
        console.error("Error loading audio for waveform:", error);
      }
    };

    loadAudio();
    return () => {
      cancelled = true;
      if (idleId !== null && typeof window !== "undefined" && "cancelIdleCallback" in window) window.cancelIdleCallback(idleId);
      if (timeoutId !== null) globalThis.clearTimeout(timeoutId);
    };
    // waveformZoom intentionally omitted — zoom changes should not re-trigger
    // media reload; a separate effect (below) re-loads viewport-sized levels.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentFile, currentYouTube, duration]);

  // ─── WaveformRenderer lifecycle ───────────────────────────────────────────

  // Create WaveformRenderer on mount, passing the 3 canvases
  useEffect(() => {
    if (staticCanvasRef.current && overlayCanvasRef.current && playheadCanvasRef.current) {
      const renderer = new WaveformRenderer({
        static: staticCanvasRef.current,
        overlay: overlayCanvasRef.current,
        playhead: playheadCanvasRef.current,
      });
      rendererRef.current = renderer;
      return () => {
        renderer.destroy();
        rendererRef.current = null;
      };
    }
  }, []);

  // ─── Sync: waveform data (peaks fallback — skipped when FFmpeg data is active) ──

  useEffect(() => {
    const r = rendererRef.current;
    if (!r || !waveformData || !duration) return;
    if (ffmpegReadyRef.current) return;
    r.setWaveform(waveformData, duration);
    r.redrawStatic();
  }, [waveformData, duration]);

  // ─── FFmpeg: reload waveform level when viewport changes ───────────────────

  useEffect(() => {
    const mediaId = ffmpegMediaIdRef.current;
    if (!mediaId || !duration) return;
    if (!rendererRef.current) return;

    let cancelled = false;
    const canvasW = staticCanvasRef.current?.clientWidth ?? 800;
    const visibleDuration = duration / (waveformZoom ?? 1);

    waveformLoader.loadForViewport({ mediaId, visibleDuration, canvasWidth: canvasW })
      .then((levelData) => {
        if (!cancelled && levelData) {
          rendererRef.current?.setWaveformData(levelData);
          rendererRef.current?.redrawStatic();
        }
      })
      .catch(() => {});

    return () => { cancelled = true; };
  }, [waveformZoom, scrollOffset, duration]);

  // ─── Sync: viewport (zoom + scroll offset) ────────────────────────────────

  useEffect(() => {
    const r = rendererRef.current;
    if (!r || !duration) return;
    const zoom = waveformZoom ?? 1;
    const visibleDuration = duration / zoom;
    // Mobile: viewport follows the playhead
    // Desktop: viewport is independently scrollable
    const effectiveOffset = isMobile
      ? Math.max(0, currentTime - visibleDuration / 2)
      : scrollOffset;
    r.setViewport(zoom, effectiveOffset);
    r.redrawStatic();
    r.redrawOverlay();
  }, [waveformZoom, scrollOffset, isMobile, currentTime, duration]);

  // ─── Sync: bookmarks ─────────────────────────────────────────────────────

  useEffect(() => {
    const r = rendererRef.current;
    if (!r) return;
    const bmList = Array.isArray(bookmarks) ? bookmarks : [];
    const renderData: BookmarkRenderData[] = bmList.map((bm) => ({
      id: bm.id,
      start: bm.start,
      end: bm.end,
      name: bm.name,
    }));
    r.setBookmarks(renderData, selectedBookmarkId);
    r.redrawOverlay();
  }, [bookmarks, selectedBookmarkId]);

  // ─── Sync: loop range ────────────────────────────────────────────────────

  useEffect(() => {
    const r = rendererRef.current;
    if (!r) return;
    r.setLoopRange(loopStart, loopEnd);
    r.redrawOverlay();
  }, [loopStart, loopEnd]);

  // ─── Sync: drag selection ────────────────────────────────────────────────

  useEffect(() => {
    const r = rendererRef.current;
    if (!r) return;
    if (isDragging && dragStart !== null && dragEnd !== null) {
      r.setDragSelection({
        start: Math.min(dragStart, dragEnd),
        end: Math.max(dragStart, dragEnd),
      });
    } else {
      r.setDragSelection(null);
    }
    r.redrawOverlay();
  }, [isDragging, dragStart, dragEnd]);

  // ─── Sync: transcript/bookmark selection → waveform highlight ────────────

  useEffect(() => {
    const r = rendererRef.current;
    if (!r) return;
    if (selection?.source === 'transcript' || selection?.source === 'bookmark') {
      r.setTranscriptSelection({ start: selection.start, end: selection.end });
      r.redrawOverlay();
    } else {
      r.setTranscriptSelection(null);
      r.redrawOverlay();
    }
  }, [selection]);

  // ─── Sync: shadowing expanded ────────────────────────────────────────────

  useEffect(() => {
    const r = rendererRef.current;
    if (!r) return;
    r.setShadowingExpanded(isShadowingExpanded);
    r.redrawStatic();
    r.redrawOverlay();
  }, [isShadowingExpanded]);

  // ─── Sync: shadowing waveforms ───────────────────────────────────────────

  useEffect(() => {
    const r = rendererRef.current;
    if (!r) return;
    const sw = shadowingWaveforms.map((w, idx) => ({
      start: w.start,
      peaks: w.data,
      duration: w.duration,
      takeIndex: idx,
    }));
    r.setShadowingWaveforms(sw);
  }, [shadowingWaveforms]);

  // ─── Sync: recording overlay ─────────────────────────────────────────────

  useEffect(() => {
    const r = rendererRef.current;
    if (!r) return;
    if (currentRecording) {
      r.setRecordingOverlay({
        startTime: currentRecording.startTime,
        peaks: currentRecording.peaks,
        peakTimes: currentRecording.peakTimes,
      });
    } else if (fadingRecording) {
      r.setRecordingOverlay(fadingRecording);
    } else {
      r.setRecordingOverlay(null);
    }
  }, [currentRecording, currentRecordingRevision, fadingRecording, fadeFrame]);

  // ─── Sync: bookmark lane hit-test rects ──────────────────────────────────

  // Compute clickable rects for bookmark lanes without involving canvas drawing.
  // The WaveformRenderer handles rendering; this effect keeps laneRectsRef in
  // sync for mouse/touch hit testing in the React handlers.
  useEffect(() => {
    laneRectsRef.current = [];
    if (!duration || !staticCanvasRef.current || !waveformData) return;

    const zoom = waveformZoom ?? 1;
    const visibleDuration = duration / zoom;
    const startOffset = isMobile
      ? currentTime - visibleDuration / 2
      : scrollOffset;
    const endOffset = startOffset + visibleDuration;

    const canvasW = staticCanvasRef.current.clientWidth;
    const lanePaddingCss = isMobile ? 8 : 4;
    const laneHeightCss = isMobile ? 24 : 16;
    const laneGapCss = isMobile ? 4 : 3;

    const bmList = Array.isArray(bookmarks) ? bookmarks : [];
    const visibleBookmarks = bmList.filter(
      (bm) => !(bm.end < startOffset || bm.start > endOffset)
    );

    // Lane assignment (same algorithm as original draw effect)
    const lanes: { lastEnd: number }[] = [];
    const assigned: { id: string; start: number; end: number; lane: number }[] = [];
    visibleBookmarks
      .slice()
      .sort((a, b) => a.start - b.start || a.end - a.start - (b.end - b.start))
      .forEach((bm) => {
        let placed = false;
        for (let i = 0; i < lanes.length; i++) {
          if (bm.start >= lanes[i].lastEnd) {
            lanes[i].lastEnd = bm.end;
            assigned.push({ id: bm.id, start: bm.start, end: bm.end, lane: i });
            placed = true;
            break;
          }
        }
        if (!placed) {
          lanes.push({ lastEnd: bm.end });
          assigned.push({ id: bm.id, start: bm.start, end: bm.end, lane: lanes.length - 1 });
        }
      });

    const toCssX = (t: number) => ((t - startOffset) / visibleDuration) * canvasW;

    assigned.forEach(({ id, start, end, lane }) => {
      const x1 = toCssX(start);
      const x2 = toCssX(Math.min(end, endOffset));
      const y = lanePaddingCss + lane * (laneHeightCss + laneGapCss);
      const hitPadY = isMobile ? 12 : 2;
      const hitPadX = isMobile ? 4 : 1;
      laneRectsRef.current.push({
        id,
        x1: x1 - hitPadX,
        x2: x2 + hitPadX,
        y1: Math.max(0, y - hitPadY),
        y2: y + laneHeightCss + hitPadY,
      });
    });
  }, [bookmarks, waveformZoom, scrollOffset, isMobile, currentTime, duration, waveformData]);

  // ─── Playhead via PlaybackClock (NOT React state) ─────────────────────────

  useEffect(() => {
    if (!isPlaying || !rendererRef.current) return;
    const unsub = playbackClock.subscribe(
      (time) => rendererRef.current!.setPlayhead(time),
      { maxFps: 60 }
    );
    return unsub;
  }, [isPlaying]);

  // ─── Auto-scroll (desktop) ────────────────────────────────────────────────

  useEffect(() => {
    if (isMobile || !isPlaying || !duration) return;
    const visibleDuration = duration / waveformZoom;
    const playheadPos = (currentTime - scrollOffset) / visibleDuration;
    if (playheadPos > 0.85 || playheadPos < 0.05) setScrollOffset(Math.max(0, Math.min(duration - visibleDuration, currentTime - visibleDuration * 0.15)));
  }, [isMobile, isPlaying, currentTime, duration, waveformZoom, scrollOffset]);

  // ─── Native wheel + touch event listeners ─────────────────────────────────

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (ev: WheelEvent) => {
      ev.preventDefault(); ev.stopPropagation();
      const state = usePlayerStore.getState();
      const dur = state.duration;
      const zoom = useSettingsStore.getState().waveformZoom;
      if (ev.ctrlKey || ev.metaKey) {
        const nextZoom = ev.deltaY < 0 ? Math.min(zoom * 1.15, 50) : Math.max(zoom / 1.15, 1);
        setWaveformZoom(nextZoom);
        if (dur > 0) {
          const visBefore = dur / zoom, visAfter = dur / nextZoom, rect = el.getBoundingClientRect();
          const mPct = (ev.clientX - rect.left) / rect.width, mTime = scrollOffset + mPct * visBefore;
          setScrollOffset(Math.max(0, Math.min(dur - visAfter, mTime - mPct * visAfter)));
        }
      } else if (dur > 0) {
        const visDur = dur / zoom;
        setScrollOffset(p => Math.max(0, Math.min(dur - visDur, p + (ev.deltaY / el.clientWidth) * visDur * 2)));
      }
    };
    const onTouchMove = (ev: TouchEvent) => { if (ev.touches.length >= 1) ev.preventDefault(); };
    el.addEventListener("wheel", onWheel, { passive: false });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    return () => { el.removeEventListener("wheel", onWheel as EventListener); el.removeEventListener("touchmove", onTouchMove as EventListener); };
  }, [setWaveformZoom, scrollOffset]);

  // ─── Interaction handlers ─────────────────────────────────────────────────

  const positionToTime = useCallback((x: number): number => {
    if (!staticCanvasRef.current || !duration) return 0;
    const rect = staticCanvasRef.current.getBoundingClientRect();
    const percentage = (x - rect.left) / rect.width;
    const visibleDuration = duration / waveformZoom;
    return (isMobile ? currentTime - visibleDuration / 2 : scrollOffset) + percentage * visibleDuration;
  }, [duration, waveformZoom, currentTime, isMobile, scrollOffset]);

  const timeToPosition = useCallback((time: number): number => {
    if (!duration) return 0;
    const visibleDuration = duration / waveformZoom;
    const startOffset = isMobile ? currentTime - visibleDuration / 2 : scrollOffset;
    if (time < startOffset) return -10;
    if (time > startOffset + visibleDuration) return 110;
    return ((time - startOffset) / visibleDuration) * 100;
  }, [duration, waveformZoom, currentTime, isMobile, scrollOffset]);

  const handleTouchStart = useCallback((e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length === 1) {
      setIsDragging(true);
      setTouchStartTime(currentTime);
      dragStartXRef.current = e.touches[0].clientX;
      wasPlayingRef.current = usePlayerStore.getState().isPlaying;
      if (wasPlayingRef.current) setIsPlaying(false);
      document.body.classList.add("user-seeking");
    } else if (e.touches.length === 2) {
      setPinchStartDistance(Math.hypot(e.touches[1].clientX - e.touches[0].clientX, e.touches[1].clientY - e.touches[0].clientY));
      setPinchStartZoom(waveformZoom);
      setIsDragging(false);
    }
  }, [currentTime, waveformZoom, setIsPlaying, setIsDragging]);

  const handleTouchMove = useCallback((e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length === 1 && isDragging && dragStartXRef.current !== null) {
      const deltaX = e.touches[0].clientX - dragStartXRef.current;
      const visibleDuration = duration / waveformZoom;
      setCurrentTime(Math.max(0, Math.min(duration, (touchStartTime || 0) - (deltaX / staticCanvasRef.current!.clientWidth) * visibleDuration)));
    } else if (e.touches.length === 2 && pinchStartDistance !== null) {
      const distance = Math.hypot(e.touches[1].clientX - e.touches[0].clientX, e.touches[1].clientY - e.touches[0].clientY);
      setWaveformZoom(Math.min(Math.max(pinchStartZoom * (distance / pinchStartDistance), 1), 50));
    }
  }, [isDragging, duration, waveformZoom, pinchStartDistance, pinchStartZoom, touchStartTime, setCurrentTime, setWaveformZoom]);

  const handleTouchEnd = useCallback((e: React.TouchEvent<HTMLDivElement>) => {
    if (e.changedTouches.length === 1 && dragStartXRef.current !== null) {
      const pixelDist = Math.abs(e.changedTouches[0].clientX - dragStartXRef.current);
      if (pixelDist < 5) {
        const time = positionToTime(e.changedTouches[0].clientX);
        if (time >= 0 && time <= duration) {
          const rect = containerRef.current?.getBoundingClientRect();
          const xCss = rect ? e.changedTouches[0].clientX - rect.left : 0;
          const yCss = rect ? e.changedTouches[0].clientY - rect.top : 0;
          const laneHit = laneRectsRef.current.find(r => xCss >= r.x1 && xCss <= r.x2 && yCss >= r.y1 && yCss <= r.y2);
          if (laneHit) {
            loadBookmark(laneHit.id);
            setCurrentTime(getBookmarkById(laneHit.id)!.start);
            setIsPlaying(true);
          } else {
            setCurrentTime(time);
            if (isShadowingMode) setShadowingMode(false);
            if (isLooping && loopStart !== null && loopEnd !== null && (time < loopStart || time > loopEnd)) setIsLooping(false);
          }
        }
      }
    }
    setPinchStartDistance(null);
    setIsDragging(false);
    setDragStart(null);
    setDragEnd(null);
    setTouchStartTime(null);
    setHoverTime(null);
    dragStartXRef.current = null;
    document.body.classList.remove("user-seeking");
    if (wasPlayingRef.current) { setIsPlaying(true); wasPlayingRef.current = false; }
  }, [setIsPlaying, positionToTime, duration, loadBookmark, setCurrentTime, isLooping, loopStart, loopEnd, isShadowingMode, setShadowingMode, setIsLooping, getBookmarkById]);

  const handleMouseWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    e.preventDefault(); e.stopPropagation();
    const nextZoom = e.deltaY < 0 ? Math.min(waveformZoom * 1.1, 20) : Math.max(waveformZoom / 1.1, 1);
    setWaveformZoom(nextZoom);
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (overlapMenu) setOverlapMenu(null);
    if (!staticCanvasRef.current || e.button !== 0) return;
    const rect = containerRef.current?.getBoundingClientRect();
    if (rect && laneRectsRef.current.length > 0) {
      const xCss = e.clientX - rect.left, yCss = e.clientY - rect.top;
      for (const lane of laneRectsRef.current) {
        if (yCss >= lane.y1 && yCss <= lane.y2) {
          if (Math.abs(xCss - lane.x1) <= 8) { setResizingBookmark({ id: lane.id, edge: "start" }); resizingRef.current = true; return; }
          if (Math.abs(xCss - lane.x2) <= 8) { setResizingBookmark({ id: lane.id, edge: "end" }); resizingRef.current = true; return; }
        }
      }
    }
    if (e.altKey) { setIsPanning(true); dragStartXRef.current = e.clientX; panStartScrollRef.current = scrollOffset; return; }
    const time = positionToTime(e.clientX);
    if (time >= 0 && time <= duration) { setIsDragging(true); setDragStart(time); setDragEnd(null); dragStartXRef.current = e.clientX; }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!staticCanvasRef.current) return;
    const rect = containerRef.current?.getBoundingClientRect();
    const xCss = rect ? e.clientX - rect.left : 0, yCss = rect ? e.clientY - rect.top : 0;
    if (resizingBookmark) {
      const time = positionToTime(e.clientX);
      if (time >= 0 && time <= duration) {
        const bm = getBookmarkById(resizingBookmark.id);
        if (bm) {
          if (resizingBookmark.edge === "start") { const newStart = Math.min(time, bm.end - 0.1); if (newStart >= 0) updateBookmark(bm.id, { start: newStart }); }
          else { const newEnd = Math.max(time, bm.start + 0.1); if (newEnd <= duration) updateBookmark(bm.id, { end: newEnd }); }
        }
      }
      return;
    }
    if (isPanning && dragStartXRef.current !== null) {
      const visDur = duration / waveformZoom;
      setScrollOffset(Math.max(0, Math.min(duration - visDur, panStartScrollRef.current + -(e.clientX - dragStartXRef.current) / staticCanvasRef.current.clientWidth * visDur)));
      if (containerRef.current) containerRef.current.style.cursor = "grabbing";
      return;
    }
    let onHandle = false;
    if (rect && !isDragging) { for (const lane of laneRectsRef.current) if (yCss >= lane.y1 && yCss <= lane.y2 && (Math.abs(xCss - lane.x1) <= 8 || Math.abs(xCss - lane.x2) <= 8)) { onHandle = true; break; } }
    if (containerRef.current) containerRef.current.style.cursor = onHandle ? "ew-resize" : (isDragging ? "crosshair" : "default");
    const time = positionToTime(e.clientX);
    if (time >= 0 && time <= duration) {
      setHoverTime(time);
      if (isDragging && dragStart !== null) {
        setDragEnd(time);
        // Throttle shared selection updates to ~30fps for timeline-sourced drag
        const now = performance.now();
        if (now - lastSelectionUpdateRef.current > 33) {
          lastSelectionUpdateRef.current = now;
          setSelection({
            type: 'time-range',
            start: Math.min(dragStart, time),
            end: Math.max(dragStart, time),
            source: 'timeline',
          });
        }
      }
    } else setHoverTime(null);
  };

  const handleMouseUp = (e: React.MouseEvent<HTMLDivElement>) => {
    if (resizingBookmark) { setResizingBookmark(null); setTimeout(() => resizingRef.current = false, 50); return; }
    if (isPanning) { setIsPanning(false); dragStartXRef.current = null; return; }
    if (!isDragging || dragStart === null) return;
    const time = positionToTime(e.clientX);
    const pixelDist = dragStartXRef.current !== null ? Math.abs(e.clientX - dragStartXRef.current) : 0;
    if (time >= 0 && time <= duration && pixelDist > 5 && Math.abs(time - dragStart) > 0.1) setLoopPoints(Math.min(dragStart, time), Math.max(dragStart, time));
    setIsDragging(false); setDragStart(null); setDragEnd(null); dragStartXRef.current = null;
    setSelection(null);
  };

  const handleMouseLeave = () => {
    setHoverTime(null); setResizingBookmark(null); resizingRef.current = false;
    if (isDragging) { setIsDragging(false); setDragStart(null); setDragEnd(null); dragStartXRef.current = null; }
    if (isPanning) { setIsPanning(false); dragStartXRef.current = null; }
    if (overlapMenu) setOverlapMenu(null);
  };

  const handleWaveformClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!staticCanvasRef.current || isDragging || resizingRef.current || isPanning || e.button !== 0 || dragStart !== null) return;
    setSelection(null);
    const time = positionToTime(e.clientX);
    if (time >= 0 && time <= duration) {
      const rect = containerRef.current?.getBoundingClientRect();
      const xCss = rect ? e.clientX - rect.left : 0, yCss = rect ? e.clientY - rect.top : 0;
      const laneHit = laneRectsRef.current.find(r => xCss >= r.x1 && xCss <= r.x2 && yCss >= r.y1 && yCss <= r.y2);
      if (laneHit) {
        const bm = getBookmarkById(laneHit.id);
        if (bm) { loadBookmark(bm.id); setCurrentTime(bm.start); setIsPlaying(true); document.body.classList.add("user-seeking"); setTimeout(() => document.body.classList.remove("user-seeking"), 100); return; }
      }
      if (isLooping && loopStart !== null && loopEnd !== null && (time < loopStart || time > loopEnd)) setIsLooping(false);
      setCurrentTime(time);
      if (isShadowingMode) setShadowingMode(false);
      if (!isMobile) { const visDur = duration / waveformZoom, relPos = (time - scrollOffset) / visDur; if (relPos < 0 || relPos > 1) setScrollOffset(Math.max(0, Math.min(duration - visDur, time - visDur / 2))); }
      document.body.classList.add("user-seeking"); setTimeout(() => document.body.classList.remove("user-seeking"), 100);
    }
  };

  const handleSelectBookmark = (id: string) => {
    const bm = getBookmarkById(id);
    if (!bm) return;
    loadBookmark(id); setCurrentTime(bm.start); setIsPlaying(true); setOverlapMenu(null);
    if (isShadowingMode) setShadowingMode(false);
    document.body.classList.add("user-seeking"); setTimeout(() => document.body.classList.remove("user-seeking"), 100);
  };

  // ─── Helpers ──────────────────────────────────────────────────────────────

  const downsampleAudioData = (data: Float32Array, targetLength: number): Float32Array => {
    const result = new Float32Array(targetLength);
    const step = Math.floor(data.length / targetLength);
    for (let i = 0; i < targetLength; i++) {
      const start = i * step;
      const end = Math.min(start + step, data.length);
      let sum = 0;
      for (let j = start; j < end; j++) sum += Math.abs(data[j]);
      result[i] = (end > start) ? sum / (end - start) : 0;
    }
    return result;
  };

  const hasMedia = !!(currentFile?.url || currentYouTube?.id);
  if (!showWaveform || !hasMedia) return null;

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className={cn("flex flex-col w-full h-full max-w-[1280px] max-h-[260px]", className)}>
      <div className="relative flex flex-col flex-1 min-h-0 overflow-hidden">
        <div
          ref={containerRef}
          className="flex-1 min-h-0 overflow-hidden relative touch-none select-none"
          style={{ touchAction: "none" }}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseLeave}
          onClick={handleWaveformClick}
          onWheel={handleMouseWheel}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          {/* Layer 1: static waveform (bars, bookmarks, loop range, shadowing divider) */}
          <canvas ref={staticCanvasRef} className="absolute inset-0 w-full h-full" />

          {/* Layer 2: overlay (drag selection, shadowing waveforms, recording, A/B markers) */}
          <canvas ref={overlayCanvasRef} className="absolute inset-0 w-full h-full pointer-events-none" />

          {/* Layer 3: playhead (red line) */}
          <canvas ref={playheadCanvasRef} className="absolute inset-0 w-full h-full pointer-events-none" />

          {overlapMenu && (
            <div
              className={isMobile ? "absolute z-20 bg-gray-900/90 text-white rounded-lg shadow-lg ring-1 ring-white/10 backdrop-blur" : "absolute z-20 bg-gray-900/90 text-white text-xs rounded-lg shadow-lg ring-1 ring-white/10 backdrop-blur min-w-[160px]"}
              style={isMobile ? { left: 8, right: 8, top: 8 } : { left: overlapMenu.x, top: Math.min(overlapMenu.y, (containerRef.current?.clientHeight || 0) - 8) }}
              onMouseDown={e => e.stopPropagation()}
              onClick={e => e.stopPropagation()}
              onTouchStart={e => e.stopPropagation()}
            >
              {overlapMenu.items.map((item) => (
                <button key={item.id} className={isMobile ? "w-full text-left px-4 py-3 text-sm hover:bg-white/10 focus:bg-white/10 focus:outline-none" : "w-full text-left px-3 py-2 hover:bg-white/10 focus:bg-white/10 focus:outline-none"} onClick={() => handleSelectBookmark(item.id)}>
                  <div className="flex items-center justify-between">
                    <span className={isMobile ? "truncate" : "truncate max-w-[120px]"}>{item.name || "Clip"}</span>
                    <span className={isMobile ? "ml-2 text-xs text-white/70" : "ml-2 text-[11px] text-white/70"}>{formatTime(item.start)}–{formatTime(item.end)}</span>
                  </div>
                </button>
              ))}
            </div>
          )}

          {isDragging && dragStart !== null && dragEnd !== null && (
            <div className="absolute bg-primary-500/30 border border-primary-500 pointer-events-none" style={{ left: `${timeToPosition(Math.min(dragStart, dragEnd))}%`, width: `${timeToPosition(Math.max(dragStart, dragEnd)) - timeToPosition(Math.min(dragStart, dragEnd))}%`, top: 0, height: "100%", zIndex: 5 }} />
          )}

          {currentYouTube && !isYoutubeNoticeDismissed && (
            <div className="absolute top-2 right-2 z-20 flex items-center gap-2 px-3 py-1.5 bg-black/50 backdrop-blur-sm rounded border border-white/10 shadow-sm">
              <span className="text-white/80 text-xs font-medium">{t("waveform.youtubePlaceholder")}</span>
              <button onClick={(e) => { e.stopPropagation(); setIsYoutubeNoticeDismissed(true); }} className="p-0.5 hover:bg-white/20 rounded-full text-white/70 hover:text-white transition-colors"><X size={12} /></button>
            </div>
          )}

          {!currentYouTube && (waveformLoadState.status === "analyzing" || waveformLoadState.status === "error") && (
            <div className="absolute top-2 right-2 z-20 flex items-center gap-2 px-3 py-1.5 bg-black/55 backdrop-blur-sm rounded border border-white/10 shadow-sm">
              <span className="text-white/80 text-xs font-medium">{waveformLoadState.status === "error" ? t("waveform.analysisError") : `${t("waveform.analyzing")} ${waveformLoadState.progress}%`}</span>
            </div>
          )}

          {hoverTime !== null && (
            <div className={`absolute bg-gray-800/90 text-white ${isMobile ? "text-sm px-3 py-1.5" : "text-xs px-2 py-1"} rounded pointer-events-none z-10`} style={{ left: `${timeToPosition(hoverTime)}%`, top: isMobile ? "10px" : "0px", transform: "translateX(-50%)" }}>{formatTime(hoverTime)}</div>
          )}

        </div>
      </div>
    </div>
  );
};
