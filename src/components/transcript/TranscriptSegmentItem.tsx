import { memo, useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { useShallow } from "zustand/react/shallow";
import { Bookmark, Brain, CheckCircle2, Pause, Play, Repeat } from "lucide-react";
import {
  TranscriptSegment as TranscriptSegmentType,
  usePlayerStore,
} from "../../stores/playerStore";
import { useBookmarkStore } from "../../stores/bookmarkStore";
import { useTranscriptStore } from "../../stores/transcriptStore";
import type {
  SegmentTranscriptStudy,
  TranscriptStudyLevel,
  TranscriptSelectionState,
} from "../../types/transcriptStudy";
import { useSegmentState } from "../../hooks/useSegmentState";
import { ExplanationDrawer } from "./ExplanationDrawer";
import { TranscriptSelectionPopover } from "./TranscriptSelectionPopover";
import { TranscriptTextRenderer } from "./TranscriptTextRenderer";
import { TranscriptWordRenderer } from "./TranscriptWordRenderer";

interface TranscriptSegmentItemProps {
  segment: TranscriptSegmentType;
  matchedBookmarkId: string | null;
  /** Whether this sentence has a saved practice recording. */
  isPracticed?: boolean;
  study: SegmentTranscriptStudy | undefined;
  highlightsEnabled: boolean;
  activeLevels: Set<TranscriptStudyLevel> | null;
  activeSelection: TranscriptSelectionState | null;
  selectionEnabled: boolean;
  onSelectionChange: (selection: TranscriptSelectionState | null) => void;
  onClearSelection: () => void;
}

export const TranscriptSegmentItem = memo(
  ({
    segment,
    matchedBookmarkId,
    isPracticed = false,
    study,
    highlightsEnabled,
    activeLevels,
    activeSelection,
    selectionEnabled,
    onSelectionChange,
    onClearSelection,
  }: TranscriptSegmentItemProps) => {
    const { t } = useTranslation();
    const [showExplanation, setShowExplanation] = useState(false);

    const {
      setCurrentTime,
      setIsPlaying,
      setIsLooping,
      setLoopPoints,
    } = usePlayerStore(
      useShallow((state) => ({
        setCurrentTime: state.setCurrentTime,
        setIsPlaying: state.setIsPlaying,
        setIsLooping: state.setIsLooping,
        setLoopPoints: state.setLoopPoints,
      }))
    );
    const createBookmarkFromTranscript = useTranscriptStore((state) => state.createBookmarkFromTranscript);
    const deleteBookmark = useBookmarkStore((state) => state.deleteBookmark);

    const { isActive, isPlaying, isCurrentlyLooping } = useSegmentState(segment);
    const isBookmarked = matchedBookmarkId !== null;

    const shouldShowPauseButton = isActive && isPlaying;

    const handleJumpToTime = () => {
      onClearSelection();
      setIsLooping(false);
      const startTime = Math.max(0, segment.startTime - 0.15);
      setCurrentTime(startTime);
      setIsPlaying(true);
    };

    const handlePausePlayback = () => {
      onClearSelection();
      setIsPlaying(false);
    };

    const handleToggleLoop = () => {
      onClearSelection();
      if (isCurrentlyLooping) {
        setIsLooping(false);
      } else {
        const loopStartTime = Math.max(0, segment.startTime - 0.15);
        setLoopPoints(loopStartTime, segment.endTime);
        setIsLooping(true);
        setCurrentTime(loopStartTime);
        setIsPlaying(true);
      }
    };

    const handleToggleBookmark = () => {
      onClearSelection();
      if (matchedBookmarkId) {
        deleteBookmark(matchedBookmarkId);
      } else {
        createBookmarkFromTranscript(segment.id);
      }
    };

    const handleExplain = () => {
      onClearSelection();
      setShowExplanation((previous) => !previous);
    };

    const handleWordClick = useCallback(
      (_wordId: string, startTime: number) => {
        onClearSelection();
        setIsLooping(false);
        setCurrentTime(startTime);
        setIsPlaying(true);
      },
      [onClearSelection, setIsLooping, setCurrentTime, setIsPlaying]
    );

    return (
      <>
        <div
          data-transcript-row
          className={`group relative overflow-hidden rounded-xl px-4 py-3.5 transition-[opacity,background-color,box-shadow,transform] duration-300 ease-out ${
            isActive
              ? "translate-x-[1px] bg-primary-500/5 opacity-100 shadow-[inset_0_0_0_1px_rgba(0,0,0,0.04)] dark:bg-white/5 dark:shadow-[inset_0_0_0_1px_rgba(255,255,255,0.05)]"
              : "bg-transparent opacity-70 hover:bg-gray-900/[0.03] hover:opacity-100 dark:text-gray-400 dark:hover:bg-white/[0.03]"
          }`}
        >
          <span
            aria-hidden="true"
            className={`absolute inset-y-4 left-0 w-px origin-center rounded-full bg-primary-500/70 transition-[opacity,transform] duration-300 ease-out ${
              isActive ? "scale-y-100 opacity-100" : "scale-y-50 opacity-0"
            }`}
          />
          <div className="flex flex-col gap-2">
            <div className="flex justify-between items-center">
              <span className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-gray-500 dark:text-gray-500 font-mono">
                {formatSegmentTime(segment.startTime)}
                {isPracticed && (
                  <CheckCircle2
                    size={11}
                    className="text-emerald-500/80"
                    aria-label={t("sentencePractice.practicedBadge")}
                  />
                )}
              </span>

              <div className={`flex space-x-1 transition-opacity ${
                isActive 
                  ? "opacity-100" 
                  : "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 active:opacity-100"
              }`}>
                <button
                  onClick={shouldShowPauseButton ? handlePausePlayback : handleJumpToTime}
                  className={`p-1.5 rounded-full transition-colors ${
                    isActive
                      ? "text-primary-600 dark:text-primary-400 bg-primary-100/50 dark:bg-primary-900/30"
                      : "text-gray-500 hover:text-primary-600 dark:text-gray-400 dark:hover:text-primary-400 hover:bg-gray-100 dark:hover:bg-gray-800"
                  }`}
                  title={t(
                    shouldShowPauseButton
                      ? "transcript.pausePlayback"
                      : "transcript.playSegment"
                  )}
                >
                  {shouldShowPauseButton ? (
                    <Pause size={16} fill="currentColor" />
                  ) : (
                    <Play size={16} fill={isActive ? "currentColor" : "none"} />
                  )}
                </button>

                <button
                  onClick={handleToggleLoop}
                  className={`p-1.5 rounded-full transition-colors ${
                    isCurrentlyLooping
                      ? "text-primary-600 dark:text-primary-400 bg-primary-100/50 dark:bg-primary-900/30"
                      : "text-gray-500 hover:text-primary-600 dark:text-gray-400 dark:hover:text-primary-400 hover:bg-gray-100 dark:hover:bg-gray-800"
                  }`}
                  title={t(
                    isCurrentlyLooping
                      ? "transcript.stopLoopingSegment"
                      : "transcript.loopSegment"
                  )}
                >
                  <Repeat
                    size={16}
                    fill={isCurrentlyLooping ? "currentColor" : "none"}
                  />
                </button>

                <button
                  onClick={handleToggleBookmark}
                  className={`p-1.5 rounded-full transition-colors ${
                    isBookmarked
                      ? "text-primary-600 dark:text-primary-400 bg-primary-100/50 dark:bg-primary-900/30"
                      : "text-gray-500 hover:text-primary-600 dark:text-gray-400 dark:hover:text-primary-400 hover:bg-gray-100 dark:hover:bg-gray-800"
                  }`}
                  title={t(
                    isBookmarked
                      ? "transcript.removeBookmark"
                      : "transcript.createBookmark"
                  )}
                >
                  <Bookmark size={16} fill={isBookmarked ? "currentColor" : "none"} />
                </button>

                <button
                  onClick={handleExplain}
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
            </div>

            <div
              className={`transition-transform duration-300 ease-out ${
                isActive ? "translate-x-0.5" : "translate-x-0"
              }`}
            >
              {segment.words && segment.words.length > 0 ? (
                <TranscriptWordRenderer
                  segmentId={segment.id}
                  words={segment.words}
                  study={study}
                  highlightsEnabled={highlightsEnabled}
                  activeLevels={activeLevels}
                  selectionEnabled={selectionEnabled}
                  onSelectionChange={onSelectionChange}
                  onWordClick={handleWordClick}
                  isActive={isActive}
                />
              ) : (
                <TranscriptTextRenderer
                  segmentId={segment.id}
                  text={segment.text}
                  study={study}
                  highlightsEnabled={highlightsEnabled}
                  activeLevels={activeLevels}
                  selectionEnabled={selectionEnabled}
                  onSelectionChange={onSelectionChange}
                  isActive={isActive}
                />
              )}
            </div>
          </div>
        </div>

        {showExplanation && (
          <ExplanationDrawer
            isOpen={showExplanation}
            onClose={() => setShowExplanation(false)}
            text={segment.text}
          />
        )}

        {selectionEnabled && activeSelection && (
          <TranscriptSelectionPopover
            selection={activeSelection}
            segment={segment}
            segmentText={segment.text}
            onClose={onClearSelection}
          />
        )}
      </>
    );
  }
);

TranscriptSegmentItem.displayName = "TranscriptSegmentItem";

function formatSegmentTime(seconds: number) {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}
