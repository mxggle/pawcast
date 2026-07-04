import { useEffect, useRef, useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import {
  Play,
  Pause,
  ChevronLeft,
  ChevronRight,
  Repeat,
  SkipForward,
  ArrowLeft,
  ListMusic,
  Volume2,
  VolumeX,
  Gauge,
  Brain,
} from "lucide-react";
import { usePlayerStore } from "../../stores/playerStore";
import { useTranscriptStore } from "../../stores/transcriptStore";
import { useSentencePracticeStore } from "../../stores/sentencePracticeStore";
import { useShallow } from "zustand/react/shallow";
import { formatTime } from "../../utils/formatTime";
import { SentenceRecorder } from "./SentenceRecorder";
import { Popover, PopoverTrigger, PopoverContent } from "../ui/popover";
import { Slider } from "../ui/slider";
import { TranscriptTextRenderer } from "../transcript/TranscriptTextRenderer";
import { TranscriptSelectionPopover } from "../transcript/TranscriptSelectionPopover";
import { ExplanationDrawer } from "../transcript/ExplanationDrawer";
import type { TranscriptSelectionState } from "../../types/transcriptStudy";
import type { TranscriptSegment } from "../../types/transcript";

const EMPTY_SEGMENTS: TranscriptSegment[] = [];

export const SentencePracticeView = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const {
    isPlaying,
    currentTime,
    setCurrentTime,
    setIsPlaying,
    setLoopPoints,
    setIsLooping,
    getCurrentMediaId,
    playbackRate,
    volume,
    muted,
    setPlaybackRate,
    setVolume,
    toggleMute,
  } = usePlayerStore(
    useShallow((state) => ({
      isPlaying: state.isPlaying,
      currentTime: state.currentTime,
      setCurrentTime: state.setCurrentTime,
      setIsPlaying: state.setIsPlaying,
      setLoopPoints: state.setLoopPoints,
      setIsLooping: state.setIsLooping,
      getCurrentMediaId: state.getCurrentMediaId,
      playbackRate: state.playbackRate,
      volume: state.volume,
      muted: state.muted,
      setPlaybackRate: state.setPlaybackRate,
      setVolume: state.setVolume,
      toggleMute: state.toggleMute,
    }))
  );

  const mediaId = getCurrentMediaId();
  const transcriptSegments = useTranscriptStore(
    useShallow((state) => (mediaId ? state.mediaTranscripts[mediaId] ?? EMPTY_SEGMENTS : EMPTY_SEGMENTS))
  );

  const {
    currentSentenceIndex,
    autoAdvance,
    loopCurrent,
    setCurrentSentenceIndex,
    setAutoAdvance,
    setLoopCurrent,
    setIsActive,
  } = useSentencePracticeStore(
    useShallow((state) => ({
      currentSentenceIndex: state.currentSentenceIndex,
      autoAdvance: state.autoAdvance,
      loopCurrent: state.loopCurrent,
      setCurrentSentenceIndex: state.setCurrentSentenceIndex,
      setAutoAdvance: state.setAutoAdvance,
      setLoopCurrent: state.setLoopCurrent,
      setIsActive: state.setIsActive,
    }))
  );

  const [hasNavigatedToInitial, setHasNavigatedToInitial] = useState(false);
  const [activeSelection, setActiveSelection] = useState<TranscriptSelectionState | null>(null);
  const [showExplanation, setShowExplanation] = useState(false);
  const [wasPlayingBeforeSelection, setWasPlayingBeforeSelection] = useState(false);
  const lastSegmentEndRef = useRef<number>(0);
  const isAdvancingRef = useRef(false);
  const lastAppliedSegmentRef = useRef<{ index: number; start: number; end: number } | null>(null);
  const skipTimeSeekRef = useRef(false);

  const goNext = useCallback(() => {
    if (currentSentenceIndex < transcriptSegments.length - 1) {
      setCurrentSentenceIndex(currentSentenceIndex + 1);
    }
  }, [currentSentenceIndex, transcriptSegments.length, setCurrentSentenceIndex]);

  const goPrevious = useCallback(() => {
    if (currentSentenceIndex > 0) {
      setCurrentSentenceIndex(currentSentenceIndex - 1);
    }
  }, [currentSentenceIndex, setCurrentSentenceIndex]);

  // Initialize: find the segment closest to current playback time
  // Note: only depends on transcriptSegments and hasNavigatedToInitial to avoid
  // re-running when currentTime ticks during playback.
  useEffect(() => {
    if (hasNavigatedToInitial || transcriptSegments.length === 0) return;

    const timeAtRender = usePlayerStore.getState().currentTime;
    let closestIndex = 0;
    let closestDistance = Infinity;

    transcriptSegments.forEach((segment, index) => {
      const mid = (segment.startTime + segment.endTime) / 2;
      const distance = Math.abs(mid - timeAtRender);
      if (distance < closestDistance) {
        closestDistance = distance;
        closestIndex = index;
      }
    });

    setCurrentSentenceIndex(closestIndex);
    setHasNavigatedToInitial(true);
  }, [hasNavigatedToInitial, transcriptSegments, setCurrentSentenceIndex]);

  // Apply loop points when sentence changes or loopCurrent changes
  useEffect(() => {
    // Wait until init effect has determined the correct currentSentenceIndex
    if (!hasNavigatedToInitial) return;
    if (transcriptSegments.length === 0) return;

    const segment = transcriptSegments[currentSentenceIndex];
    if (!segment) return;

    // Defensive: avoid repeatedly calling player store if we're already on this sentence
    if (
      lastAppliedSegmentRef.current &&
      lastAppliedSegmentRef.current.index === currentSentenceIndex &&
      lastAppliedSegmentRef.current.start === segment.startTime &&
      lastAppliedSegmentRef.current.end === segment.endTime
    ) {
      return;
    }

    lastAppliedSegmentRef.current = {
      index: currentSentenceIndex,
      start: segment.startTime,
      end: segment.endTime,
    };

    if (loopCurrent) {
      setLoopPoints(segment.startTime, segment.endTime);
      setIsLooping(true);
    } else {
      setLoopPoints(null, null);
      setIsLooping(false);
    }

    if (!skipTimeSeekRef.current) {
      setCurrentTime(segment.startTime);
    }
    skipTimeSeekRef.current = false;
    lastSegmentEndRef.current = segment.endTime;
  }, [
    hasNavigatedToInitial,
    currentSentenceIndex,
    loopCurrent,
    transcriptSegments,
    setLoopPoints,
    setIsLooping,
    setCurrentTime,
  ]);

  // Auto-advance: detect when playback passes sentence end
  useEffect(() => {
    if (!autoAdvance || !loopCurrent || transcriptSegments.length === 0) return;
    if (isAdvancingRef.current) return;

    const segment = transcriptSegments[currentSentenceIndex];
    if (!segment) return;

    if (
      lastSegmentEndRef.current >= segment.endTime - 0.1 &&
      currentTime <= segment.startTime + 0.3 &&
      currentTime >= segment.startTime
    ) {
      isAdvancingRef.current = true;
      const nextIndex = currentSentenceIndex + 1;
      if (nextIndex < transcriptSegments.length) {
        setCurrentSentenceIndex(nextIndex);
      } else {
        setIsPlaying(false);
      }
      setTimeout(() => {
        isAdvancingRef.current = false;
      }, 500);
    }

    lastSegmentEndRef.current = currentTime;
  }, [
    currentTime,
    autoAdvance,
    loopCurrent,
    currentSentenceIndex,
    transcriptSegments,
    setCurrentSentenceIndex,
    setIsPlaying,
  ]);

  // Follow current playback position and auto-switch displayed sentence
  useEffect(() => {
    if (!hasNavigatedToInitial || transcriptSegments.length === 0) return;

    let foundIndex = currentSentenceIndex;
    for (let i = 0; i < transcriptSegments.length; i++) {
      const seg = transcriptSegments[i];
      if (currentTime >= seg.startTime && currentTime < seg.endTime) {
        foundIndex = i;
        break;
      }
    }

    if (foundIndex !== currentSentenceIndex) {
      skipTimeSeekRef.current = true;
      setCurrentSentenceIndex(foundIndex);
    }
  }, [
    currentTime,
    hasNavigatedToInitial,
    transcriptSegments,
    currentSentenceIndex,
    setCurrentSentenceIndex,
  ]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      switch (e.key) {
        case " ":
          e.preventDefault();
          setIsPlaying(!isPlaying);
          break;
        case "ArrowRight":
          e.preventDefault();
          goNext();
          break;
        case "ArrowLeft":
          e.preventDefault();
          goPrevious();
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isPlaying, setIsPlaying, goNext, goPrevious]);

  // Clear selection and explanation when sentence changes
  useEffect(() => {
    setActiveSelection(null);
    setShowExplanation(false);
  }, [currentSentenceIndex]);

  // Auto-pause on text selection and resume on dismissal
  useEffect(() => {
    if (activeSelection) {
      if (!wasPlayingBeforeSelection && isPlaying) {
        setWasPlayingBeforeSelection(true);
        setIsPlaying(false);
      }
    } else {
      if (wasPlayingBeforeSelection) {
        setIsPlaying(true);
        setWasPlayingBeforeSelection(false);
      }
    }
  }, [activeSelection, isPlaying, setIsPlaying, wasPlayingBeforeSelection]);

  // Clear selection when clicking outside
  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      if (
        target.closest(".transcript-selection-popover") ||
        target.closest("[data-sentence-text]")
      ) {
        return;
      }
      setActiveSelection(null);
    };
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, []);

  const handleExit = () => {
    setIsActive(false);
    setLoopPoints(null, null);
    setIsLooping(false);
    navigate("/player");
  };

  const togglePlay = () => {
    setIsPlaying(!isPlaying);
  };

  const handlePlayOnce = () => {
    const segment = transcriptSegments[currentSentenceIndex];
    if (!segment) return;

    setLoopPoints(null, null);
    setIsLooping(false);
    setCurrentTime(segment.startTime);
    setIsPlaying(true);
  };

  const segment = transcriptSegments[currentSentenceIndex];

  if (transcriptSegments.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 px-4">
        <ListMusic size={48} className="text-gray-300 dark:text-gray-600" />
        <p className="text-lg text-gray-500 dark:text-gray-400 text-center">
          {t("sentencePractice.noTranscript")}
        </p>
        <button
          onClick={handleExit}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary-600 text-white hover:bg-primary-700 transition-colors"
        >
          <ArrowLeft size={16} />
          {t("sentencePractice.exit")}
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-white dark:bg-gray-950">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-100 dark:border-white/5 shrink-0">
        <button
          onClick={handleExit}
          className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200 transition-colors"
        >
          <ArrowLeft size={16} />
          {t("sentencePractice.exit")}
        </button>
        <div className="text-xs text-gray-400 dark:text-gray-500 font-medium">
          {currentSentenceIndex + 1} / {transcriptSegments.length}
        </div>
        <div className="w-16" />
      </div>

      {/* Main sentence display */}
      <div className="flex-1 min-h-0 flex flex-col items-center justify-center px-4 sm:px-8 py-4 sm:py-6 overflow-hidden">
        <div className="w-full max-w-4xl text-center max-h-full overflow-y-auto" data-sentence-text>
          {segment && (
            <>
              <TranscriptTextRenderer
                segmentId={segment.id}
                text={segment.text}
                study={undefined}
                highlightsEnabled={false}
                activeLevels={null}
                selectionEnabled={true}
                onSelectionChange={setActiveSelection}
                isActive={true}
                className="text-2xl sm:text-4xl md:text-5xl lg:text-6xl font-semibold text-gray-900 dark:text-gray-100 leading-relaxed tracking-tight break-words"
              />
              <div className="mt-4 sm:mt-6 flex items-center justify-center gap-2">
                <button
                  onClick={() => setShowExplanation((prev) => !prev)}
                  className={`p-1.5 rounded-full transition-colors ${
                    showExplanation
                      ? "text-blue-600 dark:text-blue-400 bg-blue-100/50 dark:bg-blue-900/30"
                      : "text-gray-500 hover:text-blue-600 dark:text-gray-400 dark:hover:text-blue-400 hover:bg-gray-100 dark:hover:bg-gray-800"
                  }`}
                  title={t("transcript.explainWithAI")}
                >
                  <Brain size={16} />
                </button>
              </div>
              <div className="mt-2 sm:mt-4 flex items-center justify-center gap-3 text-sm text-gray-400 dark:text-gray-500 font-mono shrink-0">
                <span>{formatTime(segment.startTime)}</span>
                <span className="w-8 h-px bg-gray-200 dark:bg-gray-700" />
                <span>{formatTime(segment.endTime)}</span>
              </div>
            </>
          )}
        </div>
      </div>

      {/* AI Explanation */}
      {segment && showExplanation && (
        <div className="px-4 pb-2 shrink-0">
          <ExplanationDrawer
            isOpen={showExplanation}
            onClose={() => setShowExplanation(false)}
            text={segment.text}
          />
        </div>
      )}

      {/* Recording section */}
      {segment && mediaId && (
        <div className="px-4 pb-2 shrink-0">
          <SentenceRecorder mediaId={mediaId} sentenceIndex={currentSentenceIndex} />
        </div>
      )}

      {/* Bottom controls */}
      <div className="px-4 pb-4 pt-2 border-t border-gray-100 dark:border-white/5 shrink-0">
        <div className="max-w-xl mx-auto space-y-3">
          {/* Settings row */}
          <div className="flex items-center justify-center gap-2 flex-wrap">
            <button
              onClick={() => setLoopCurrent(!loopCurrent)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                loopCurrent
                  ? "bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300"
                  : "bg-gray-100 text-gray-500 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700"
              }`}
            >
              <Repeat size={13} />
              {t("sentencePractice.loopPlay")}
            </button>
            <button
              onClick={() => setAutoAdvance(!autoAdvance)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                autoAdvance
                  ? "bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300"
                  : "bg-gray-100 text-gray-500 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700"
              }`}
            >
              <SkipForward size={13} />
              {t("sentencePractice.autoAdvance")}
            </button>

            {/* Playback speed */}
            <Popover>
              <PopoverTrigger asChild>
                <button
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors bg-gray-100 text-gray-500 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700`}
                >
                  <Gauge size={13} />
                  {playbackRate.toFixed(2)}x
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-2" align="center" side="top">
                <div className="grid grid-cols-4 gap-1">
                  {[0.5, 0.75, 1.0, 1.25, 1.5, 1.75, 2.0].map((rate) => (
                    <button
                      key={rate}
                      onClick={() => setPlaybackRate(rate)}
                      className={`px-2 py-1.5 rounded-md text-xs font-medium transition-colors ${
                        Math.abs(playbackRate - rate) < 0.01
                          ? "bg-primary-600 text-white"
                          : "bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
                      }`}
                    >
                      {rate.toFixed(2)}x
                    </button>
                  ))}
                </div>
              </PopoverContent>
            </Popover>

            {/* Volume */}
            <div className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full bg-gray-100 dark:bg-gray-800">
              <button
                onClick={toggleMute}
                className="p-1 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400 transition-colors"
              >
                {muted || volume === 0 ? <VolumeX size={13} /> : <Volume2 size={13} />}
              </button>
              <Slider
                value={[muted ? 0 : volume]}
                min={0}
                max={1}
                step={0.01}
                onValueChange={(v) => setVolume(v[0])}
                className="w-14 sm:w-20"
              />
            </div>
          </div>

          {/* Playback + Navigation */}
          <div className="flex items-center justify-center gap-4 sm:gap-6">
            <button
              onClick={goPrevious}
              disabled={currentSentenceIndex === 0}
              className="p-3 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-400 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft size={24} />
            </button>

            <button
              onClick={handlePlayOnce}
              className="p-3 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-400 transition-colors"
              title={t("sentencePractice.playOnce")}
            >
              <Play size={20} />
            </button>

            <button
              onClick={togglePlay}
              className="p-4 bg-primary-600 hover:bg-primary-700 text-white rounded-full shadow-lg hover:shadow-xl active:scale-95 transition-all"
            >
              {isPlaying ? (
                <Pause size={24} fill="currentColor" />
              ) : (
                <Play size={24} fill="currentColor" className="ml-0.5" />
              )}
            </button>

            <button
              onClick={goNext}
              disabled={currentSentenceIndex >= transcriptSegments.length - 1}
              className="p-3 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-400 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronRight size={24} />
            </button>
          </div>
        </div>
      </div>

      {activeSelection && segment && (
        <TranscriptSelectionPopover
          selection={activeSelection}
          segment={segment}
          segmentText={segment.text}
          onClose={() => setActiveSelection(null)}
        />
      )}
    </div>
  );
};
