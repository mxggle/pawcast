import type { TranscriptSegment } from "../types/transcript";
import type { LoopBookmark } from "../types/bookmark";

// Pure segment/bookmark matching helpers shared by the transcript UI.

export const BOOKMARK_MATCH_TOLERANCE_SECONDS = 0.5;

export interface TimeRange {
  start: number;
  end: number;
}

export const normalizeRange = (range?: Partial<TimeRange>): TimeRange | undefined => {
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

/**
 * Map word-level timing data from the API response to the segments they
 * belong to, based on time overlap. Each word is assigned to the segment
 * whose [start, end) range contains the word's start time.
 */
export function assignWordsToSegments(
  words: Array<{ word: string; start: number; end: number }> | undefined,
  segments: Array<{ id: number; start: number; end: number }>
): Map<number, Array<{ word: string; start: number; end: number }>> {
  const map = new Map<number, Array<{ word: string; start: number; end: number }>>();
  if (!words || words.length === 0) return map;

  let segIdx = 0;
  for (const word of words) {
    // Advance to the segment that contains this word's start time
    while (segIdx < segments.length && segments[segIdx].end <= word.start) {
      segIdx++;
    }
    if (segIdx < segments.length) {
      const seg = segments[segIdx];
      if (word.start >= seg.start && word.end <= seg.end) {
        if (!map.has(seg.id)) map.set(seg.id, []);
        map.get(seg.id)!.push(word);
      }
    }
  }

  return map;
}

export const isTimeWithinSegment = (time: number, segment: TranscriptSegment) =>
  time >= segment.startTime && time <= segment.endTime;

export const findMatchingBookmarkId = (
  segment: TranscriptSegment,
  bookmarks: LoopBookmark[]
) =>
  bookmarks.find(
    (bookmark) =>
      Math.abs(bookmark.start - segment.startTime) < BOOKMARK_MATCH_TOLERANCE_SECONDS &&
      Math.abs(bookmark.end - segment.endTime) < BOOKMARK_MATCH_TOLERANCE_SECONDS
  )?.id ?? null;

/**
 * Binary search for the segment containing `time`, with a locality hint:
 * during playback the active segment is almost always the hinted one or an
 * immediate neighbor, so those are checked first.
 */
export const findSegmentIndexAtTime = (
  segments: TranscriptSegment[],
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
