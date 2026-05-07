import { memo, useCallback, useMemo, useRef } from "react";
import type { TranscriptWord } from "../../types/transcriptWord";
import type {
  SegmentTranscriptStudy,
  TranscriptStudyLevel,
  TranscriptSelectionState,
} from "../../types/transcriptStudy";
import {
  findMatchingStudyItem,
  getRenderableStudyItems,
  getStudyLevelClassName,
} from "../../utils/transcriptStudy";
import { useWordState } from "../../hooks/useWordState";
import { cn } from "@/utils/cn";
import { usePlayerSelection } from "../../player/hooks";

interface TranscriptWordRendererProps {
  segmentId: string;
  words: TranscriptWord[];
  study: SegmentTranscriptStudy | undefined;
  highlightsEnabled: boolean;
  activeLevels: Set<TranscriptStudyLevel> | null;
  selectionEnabled: boolean;
  onSelectionChange: (selection: TranscriptSelectionState | null) => void;
  onWordClick: (wordId: string, startTime: number) => void;
  isActive?: boolean;
  className?: string;
}

const MAX_SELECTION_LENGTH = 120;

/**
 * Get character offset for each word in the full segment text, assuming
 * words are separated by single spaces. This is used to map study
 * highlighting items (which use char offsets) onto word spans.
 */
function getWordCharOffsets(
  words: TranscriptWord[]
): Array<{ start: number; end: number }> {
  const offsets: Array<{ start: number; end: number }> = [];
  let cursor = 0;
  for (let i = 0; i < words.length; i++) {
    const wordLen = words[i].text.length;
    offsets.push({ start: cursor, end: cursor + wordLen });
    // After each word except the last, account for a space
    cursor += wordLen + (i < words.length - 1 ? 1 : 0);
  }
  return offsets;
}

export const TranscriptWordRenderer = memo(
  ({
    segmentId,
    words,
    study,
    highlightsEnabled,
    activeLevels,
    selectionEnabled,
    onSelectionChange,
    onWordClick,
    isActive,
    className,
  }: TranscriptWordRendererProps) => {
    const containerRef = useRef<HTMLParagraphElement | null>(null);
    const isSelecting = useRef(false);
    const selectionStartPos = useRef<{ x: number; y: number } | null>(null);

    // Throttled active-word detection via useSyncExternalStore (~10 fps)
    const activeWordId = useWordState(words);

    // Timeline-sourced selection highlighting (also applies to bookmark with wordIds)
    const { selection: playerSelection } = usePlayerSelection();
    const timelineHighlightedWordIds = useMemo<Set<string> | null>(() => {
      if (!playerSelection) return null;
      const { source, start, end, wordIds } = playerSelection;
      if (source === 'timeline') {
        // Timeline drag: highlight words that overlap the time range
        const ids = new Set<string>();
        for (const word of words) {
          if (word.start < end && word.end > start) {
            ids.add(word.id);
          }
        }
        return ids.size > 0 ? ids : null;
      }
      if (source === 'bookmark' && wordIds && wordIds.length > 0) {
        // Bookmark: highlight explicitly linked word IDs that belong to this segment
        const ids = new Set<string>();
        for (const word of words) {
          if (wordIds.includes(word.id)) {
            ids.add(word.id);
          }
        }
        return ids.size > 0 ? ids : null;
      }
      return null;
    }, [playerSelection, words]);

    // Memoize the study items lookup
    const wordCharOffsets = useMemo(() => getWordCharOffsets(words), [words]);

    const studyItems = useMemo(
      () =>
        highlightsEnabled
          ? getRenderableStudyItems(study?.items || [], activeLevels)
          : [],
      [activeLevels, highlightsEnabled, study?.items]
    );

    // For each word, determine which study items (if any) overlap its char range
    const wordStudyMap = useMemo(() => {
      if (studyItems.length === 0) return null;
      const map = new Map<number, (typeof studyItems)[number]>();
      for (let i = 0; i < wordCharOffsets.length; i++) {
        const offsets = wordCharOffsets[i];
        for (const item of studyItems) {
          if (offsets.start < item.end && offsets.end > item.start) {
            map.set(i, item);
            break;
          }
        }
      }
      return map;
    }, [studyItems, wordCharOffsets]);

    const handleSelectionCapture = useCallback(() => {
      if (!selectionEnabled || !containerRef.current || typeof window === "undefined") {
        onSelectionChange(null);
        return;
      }

      const selection = window.getSelection();
      if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
        onSelectionChange(null);
        return;
      }

      const range = selection.getRangeAt(0);
      const root = containerRef.current;

      if (!root.contains(range.commonAncestorContainer)) {
        return;
      }

      const offsets = getRangeOffsets(root, range);
      if (!offsets) {
        onSelectionChange(null);
        return;
      }

      const rect = range.getBoundingClientRect();
      const selectedText = getFullText(words).slice(offsets.start, offsets.end);
      const normalizedText = selectedText.trim();

      if (
        normalizedText.length === 0 ||
        normalizedText.length > MAX_SELECTION_LENGTH ||
        rect.width === 0
      ) {
        onSelectionChange(null);
        return;
      }

      const leadingTrim = selectedText.length - selectedText.trimStart().length;
      const trailingTrim = selectedText.length - selectedText.trimEnd().length;
      const start = offsets.start + leadingTrim;
      const end = offsets.end - trailingTrim;

      // Build time range from selected words
      const timeRange = getSelectionTimeRange(wordCharOffsets, words, start, end);

      onSelectionChange({
        segmentId,
        text: getFullText(words).slice(start, end),
        start,
        end,
        rect: {
          top: rect.top,
          left: rect.left,
          width: rect.width,
          height: rect.height,
        },
        matchedItem: findMatchingStudyItem(studyItems, start, end),
        ...(timeRange ? { timeRange } : {}),
      });
    }, [
      selectionEnabled,
      onSelectionChange,
      segmentId,
      words,
      wordCharOffsets,
      studyItems,
    ]);

    const handleMouseDown = useCallback((e: React.MouseEvent) => {
      selectionStartPos.current = { x: e.clientX, y: e.clientY };
      isSelecting.current = false;
    }, []);

    const handleMouseUp = useCallback(
      (e: React.MouseEvent) => {
        const pos = selectionStartPos.current;
        if (pos) {
          const dx = e.clientX - pos.x;
          const dy = e.clientY - pos.y;
          const moved = Math.sqrt(dx * dx + dy * dy);
          if (moved > 5) {
            // User was selecting text, not clicking a word
            isSelecting.current = true;
          }
          selectionStartPos.current = null;
        }
        handleSelectionCapture();
      },
      [handleSelectionCapture]
    );

    const handleWordClick = useCallback(
      (wordId: string, startTime: number) => {
        if (isSelecting.current) {
          isSelecting.current = false;
          return;
        }
        onWordClick(wordId, startTime);
      },
      [onWordClick]
    );

    const handleDoubleClick = useCallback(() => {
      if (!selectionEnabled || !containerRef.current) return;

      requestAnimationFrame(() => {
        const selection = window.getSelection();
        if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
          return;
        }

        const range = selection.getRangeAt(0);
        const root = containerRef.current;
        if (!root || !root.contains(range.commonAncestorContainer)) {
          return;
        }

        const offsets = getRangeOffsets(root, range);
        if (!offsets) return;

        const fullText = getFullText(words);
        const snapped = snapToWordBoundaries(fullText, offsets.start, offsets.end);
        if (snapped.start === offsets.start && snapped.end === offsets.end) {
          return;
        }

        if (setDomSelection(root, snapped.start, snapped.end)) {
          requestAnimationFrame(() => handleSelectionCapture());
        }
      });
    }, [selectionEnabled, words, handleSelectionCapture]);

    // Build word spans
    const wordSpans = useMemo(() => {
      const spans: JSX.Element[] = [];
      for (let i = 0; i < words.length; i++) {
        const word = words[i];
        const studyItem = wordStudyMap?.get(i);

        // Space between words (render as text after each word except last)
        if (i > 0) {
          spans.push(<span key={`space-${i}`}> </span>);
        }

        spans.push(
          <span
            key={word.id}
            data-word-id={word.id}
            data-start={word.start}
            data-end={word.end}
            role="button"
            tabIndex={0}
            onClick={() => handleWordClick(word.id, word.start)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                handleWordClick(word.id, word.start);
              }
            }}
            className={cn(
              // Base word style
              "inline cursor-pointer rounded-sm transition-colors duration-150 ease-out",
              // Active word highlight (amber) - playback sync
              activeWordId === word.id
                ? "bg-amber-300/60 text-amber-900 dark:bg-amber-400/30 dark:text-amber-200"
                : "hover:bg-gray-200/50 dark:hover:bg-gray-700/50",
              // Timeline selection highlight (blue) - from waveform drag
              timelineHighlightedWordIds?.has(word.id)
                ? "bg-blue-300/50 text-blue-900 dark:bg-blue-400/30 dark:text-blue-200"
                : "",
              // Study highlighting (applied with lower specificity so word/timeline highlight wins)
              studyItem
                ? cn(
                    getStudyLevelClassName(studyItem.level),
                    studyItem.type === "expression" ? "font-semibold" : "font-medium"
                  )
                : ""
            )}
          >
            {word.text}
          </span>
        );
      }
      return spans;
    }, [words, wordStudyMap, activeWordId, handleWordClick]);

    return (
      <p
        ref={containerRef}
        className={cn(
          "text-base leading-relaxed select-text whitespace-pre-wrap font-medium transition-[color,opacity] duration-300 ease-out md:text-lg",
          isActive
            ? "text-gray-900 opacity-100 dark:text-white"
            : "text-gray-600 opacity-90 dark:text-gray-400",
          className
        )}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onKeyUp={handleSelectionCapture}
        onDoubleClick={handleDoubleClick}
      >
        {wordSpans}
      </p>
    );
  }
);

TranscriptWordRenderer.displayName = "TranscriptWordRenderer";

// ─── Helper functions ───────────────────────────────────────────────────

function getFullText(words: TranscriptWord[]): string {
  return words.map((w) => w.text).join(" ");
}

function getRangeOffsets(root: HTMLElement, range: Range) {
  const startRange = range.cloneRange();
  startRange.selectNodeContents(root);
  startRange.setEnd(range.startContainer, range.startOffset);

  const endRange = range.cloneRange();
  endRange.selectNodeContents(root);
  endRange.setEnd(range.endContainer, range.endOffset);

  const start = startRange.toString().length;
  const end = endRange.toString().length;

  if (end <= start) {
    return null;
  }

  return { start, end };
}

/**
 * Given character offsets of a selection, find the time range spanning
 * from the start of the first word to the end of the last word.
 */
function getSelectionTimeRange(
  wordCharOffsets: Array<{ start: number; end: number }>,
  words: TranscriptWord[],
  selectionStart: number,
  selectionEnd: number
): { start: number; end: number } | undefined {
  let firstWordIdx = -1;
  let lastWordIdx = -1;

  for (let i = 0; i < wordCharOffsets.length; i++) {
    const w = wordCharOffsets[i];
    if (selectionStart < w.end && selectionEnd > w.start) {
      if (firstWordIdx === -1) firstWordIdx = i;
      lastWordIdx = i;
    }
  }

  if (firstWordIdx === -1 || lastWordIdx === -1) return undefined;

  return {
    start: words[firstWordIdx].start,
    end: words[lastWordIdx].end,
  };
}

/**
 * For scripts without spaces (CJK, etc.), snap text offsets to word boundaries.
 */
function snapToWordBoundaries(
  text: string,
  start: number,
  end: number
): { start: number; end: number } {
  const selectedText = text.slice(start, end);

  const hasCjk =
    /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u.test(
      selectedText
    );
  if (!hasCjk) {
    return { start, end };
  }

  const SegmenterCtor = (
    Intl as typeof Intl & {
      Segmenter?: new (
        locales?: Intl.LocalesArgument,
        options?: { granularity?: "word" }
      ) => {
        segment(input: string): Iterable<{
          segment: string;
          index: number;
          isWordLike?: boolean;
        }>;
      };
    }
  ).Segmenter;

  if (!SegmenterCtor) {
    return { start, end };
  }

  const segmenter = new SegmenterCtor(undefined, { granularity: "word" });
  const segments = Array.from(segmenter.segment(text));

  let newStart = start;
  let newEnd = end;

  for (const seg of segments) {
    const segStart = seg.index;
    const segEnd = seg.index + seg.segment.length;

    if (segStart < start && start < segEnd) {
      newStart = segStart;
    }
    if (segStart < end && end < segEnd) {
      newEnd = segEnd;
    }
  }

  return { start: newStart, end: newEnd };
}

/**
 * Set the browser's DOM selection to the given character offsets.
 */
function setDomSelection(
  root: HTMLElement,
  start: number,
  end: number
): boolean {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let currentOffset = 0;
  let startNode: Node | null = null;
  let startOffset = 0;
  let endNode: Node | null = null;
  let endOffset = 0;

  let node: Node | null;
  while ((node = walker.nextNode())) {
    const length = node.textContent?.length ?? 0;

    if (!startNode && currentOffset + length >= start) {
      startNode = node;
      startOffset = Math.max(0, start - currentOffset);
    }

    if (!endNode && currentOffset + length >= end) {
      endNode = node;
      endOffset = Math.max(0, end - currentOffset);
      break;
    }

    currentOffset += length;
  }

  if (startNode && endNode) {
    const range = document.createRange();
    range.setStart(startNode, startOffset);
    range.setEnd(endNode, endOffset);

    const selection = window.getSelection();
    if (selection) {
      selection.removeAllRanges();
      selection.addRange(range);
      return true;
    }
  }

  return false;
}
