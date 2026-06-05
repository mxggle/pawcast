import { memo, useEffect, useMemo, useRef } from "react";
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
import { cn } from "@/utils/cn";

interface TranscriptTextRendererProps {
  segmentId: string;
  text: string;
  study: SegmentTranscriptStudy | undefined;
  highlightsEnabled: boolean;
  activeLevels: Set<TranscriptStudyLevel> | null;
  selectionEnabled: boolean;
  onSelectionChange: (selection: TranscriptSelectionState | null) => void;
  isActive?: boolean;
  className?: string;
}

const MAX_SELECTION_LENGTH = 120;

export const TranscriptTextRenderer = memo(
  ({
    segmentId,
    text,
    study,
    highlightsEnabled,
    activeLevels,
    selectionEnabled,
    onSelectionChange,
    isActive,
    className,
  }: TranscriptTextRendererProps) => {
    const containerRef = useRef<HTMLParagraphElement | null>(null);
    // Always-current ref so the document listener never captures a stale closure.
    const captureRef = useRef<() => void>(() => {});

    const items = useMemo(
      () =>
        highlightsEnabled
          ? getRenderableStudyItems(study?.items || [], activeLevels)
          : [],
      [activeLevels, highlightsEnabled, study?.items]
    );

    const handleSelectionCapture = () => {
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

      if (!root.contains(range.commonAncestorContainer) && !root.contains(range.startContainer)) {
        return;
      }

      const offsets = getRangeOffsets(root, range);
      if (!offsets) {
        onSelectionChange(null);
        return;
      }

      const rect = range.getBoundingClientRect();
      const selectedText = text.slice(offsets.start, offsets.end);
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

      onSelectionChange({
        segmentId,
        text: text.slice(start, end),
        start,
        end,
        rect: {
          top: rect.top,
          left: rect.left,
          width: rect.width,
          height: rect.height,
        },
        matchedItem: findMatchingStudyItem(items, start, end),
      });
    };

    // Keep the ref current so the document listener always calls the latest version.
    captureRef.current = handleSelectionCapture;

    // Catch selections whose mouseup fires outside the <p> (e.g. user drags
    // across the segment boundary or into whitespace between segments).
    useEffect(() => {
      const handler = (e: MouseEvent) => {
        const root = containerRef.current;
        if (!root) return;
        // Inside the element: the element's onMouseUp already handles this.
        if (root.contains(e.target as Node)) return;
        // Only capture if the selection actually started within this container.
        const sel = window.getSelection();
        if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return;
        const range = sel.getRangeAt(0);
        if (root.contains(range.startContainer) || root.contains(range.commonAncestorContainer)) {
          captureRef.current();
        }
      };
      document.addEventListener("mouseup", handler);
      return () => document.removeEventListener("mouseup", handler);
    }, []);

    const handleDoubleClick = () => {
      if (!selectionEnabled || !containerRef.current) return;

      // Give the browser a frame to expand its double-click word selection,
      // then snap CJK boundaries and always re-capture the final result.
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

        const snapped = snapToWordBoundaries(text, offsets.start, offsets.end);

        if (snapped.start !== offsets.start || snapped.end !== offsets.end) {
          // CJK: update DOM selection, then re-capture in the next frame
          // so the bounding rect reflects the new range.
          if (setDomSelection(root, snapped.start, snapped.end)) {
            requestAnimationFrame(() => captureRef.current());
            return;
          }
        }

        // Always re-capture to reflect the browser's final word selection —
        // the first mouseup may have caught a partial selection.
        captureRef.current();
      });
    };

    // Memoize the expensive JSX parts building — only recompute when text or
    // study highlights actually change, not on every parent re-render.
    const parts = useMemo(() => {
      const result: JSX.Element[] = [];
      let cursor = 0;

      items.forEach((item) => {
        if (item.start > cursor) {
          result.push(
            <span key={`plain-${cursor}`}>{text.slice(cursor, item.start)}</span>
          );
        }

        result.push(
          <span
            key={`${item.type}-${item.start}-${item.end}`}
            className={cn(
              getStudyLevelClassName(item.level),
              item.type === "expression" ? "font-semibold" : "font-medium",
              "transition-colors duration-300"
            )}
          >
            {text.slice(item.start, item.end)}
          </span>
        );

        cursor = item.end;
      });

      if (cursor < text.length) {
        result.push(<span key={`plain-${cursor}`}>{text.slice(cursor)}</span>);
      }

      return result;
    }, [text, items]);

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
        onMouseUp={handleSelectionCapture}
        onKeyUp={handleSelectionCapture}
        onDoubleClick={handleDoubleClick}
      >
        {parts}
      </p>
    );
  }
);

TranscriptTextRenderer.displayName = "TranscriptTextRenderer";

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
 * For scripts without spaces (CJK, etc.), the browser's double-click word
 * selection often picks only part of a word. Snap the given text offsets to
 * the nearest word boundaries using `Intl.Segmenter`.
 */
function snapToWordBoundaries(
  text: string,
  start: number,
  end: number
): { start: number; end: number } {
  const selectedText = text.slice(start, end);

  // Only snap for CJK-like scripts where browser word selection is unreliable.
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
 * Set the browser's DOM selection to the given character offsets inside the
 * provided root element. Returns `true` on success.
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
