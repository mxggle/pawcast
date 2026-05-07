import type { TranscriptSegment } from "../types/transcript";

const SEEK_EPSILON_SECONDS = 0.05;

const sortSegmentsByStartTime = (segments: TranscriptSegment[]) =>
  [...segments].sort((a, b) => a.startTime - b.startTime);

export const getNextSentenceSeekTime = (
  segments: TranscriptSegment[],
  currentTime: number
): number | null => {
  const sortedSegments = sortSegmentsByStartTime(segments);
  const nextSegment = sortedSegments.find(
    (segment) => segment.startTime > currentTime + SEEK_EPSILON_SECONDS
  );

  return nextSegment?.startTime ?? null;
};

export const getPreviousSentenceSeekTime = (
  segments: TranscriptSegment[],
  currentTime: number
): number | null => {
  const sortedSegments = sortSegmentsByStartTime(segments);
  const currentSegmentIndex = sortedSegments.findIndex(
    (segment) =>
      currentTime >= segment.startTime - SEEK_EPSILON_SECONDS &&
      currentTime <= segment.endTime + SEEK_EPSILON_SECONDS
  );

  if (currentSegmentIndex === 0) {
    return null;
  }

  if (currentSegmentIndex > 0) {
    return sortedSegments[currentSegmentIndex - 1].startTime;
  }

  const previousSegments = sortedSegments.filter(
    (segment) => segment.startTime < currentTime - SEEK_EPSILON_SECONDS
  );

  return previousSegments.length > 0
    ? previousSegments[previousSegments.length - 1].startTime
    : null;
};
