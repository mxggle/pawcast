import test from "node:test";
import assert from "node:assert/strict";

import {
  assignWordsToSegments,
  findMatchingBookmarkId,
  findSegmentIndexAtTime,
  isTimeWithinSegment,
  normalizeRange,
} from "../src/utils/transcriptSegments.ts";
import type { TranscriptSegment } from "../src/types/transcript.ts";
import type { LoopBookmark } from "../src/types/bookmark.ts";

const seg = (id: string, startTime: number, endTime: number): TranscriptSegment => ({
  id,
  text: id,
  startTime,
  endTime,
  confidence: 1,
  isFinal: true,
});

const bookmark = (id: string, start: number, end: number): LoopBookmark => ({
  id,
  name: id,
  start,
  end,
  createdAt: 0,
});

test("normalizeRange accepts only well-formed ranges", () => {
  assert.deepEqual(normalizeRange({ start: 1, end: 2 }), { start: 1, end: 2 });
  assert.equal(normalizeRange({ start: 2, end: 2 }), undefined);
  assert.equal(normalizeRange({ start: 2, end: 1 }), undefined);
  assert.equal(normalizeRange({ start: 1 }), undefined);
  assert.equal(normalizeRange(undefined), undefined);
});

test("assignWordsToSegments maps words into their containing segments", () => {
  const segments = [
    { id: 0, start: 0, end: 2 },
    { id: 1, start: 2, end: 5 },
  ];
  const words = [
    { word: "a", start: 0.1, end: 0.5 },
    { word: "b", start: 1.5, end: 1.9 },
    { word: "c", start: 2.2, end: 2.8 },
    { word: "d", start: 4.5, end: 4.9 },
  ];

  const map = assignWordsToSegments(words, segments);
  assert.deepEqual(map.get(0)?.map((w) => w.word), ["a", "b"]);
  assert.deepEqual(map.get(1)?.map((w) => w.word), ["c", "d"]);
});

test("assignWordsToSegments skips words that straddle a segment boundary", () => {
  const segments = [{ id: 0, start: 0, end: 2 }];
  const words = [{ word: "straddle", start: 1.5, end: 2.5 }];
  const map = assignWordsToSegments(words, segments);
  assert.equal(map.size, 0);
});

test("assignWordsToSegments handles empty input", () => {
  assert.equal(assignWordsToSegments(undefined, [{ id: 0, start: 0, end: 1 }]).size, 0);
  assert.equal(assignWordsToSegments([], [{ id: 0, start: 0, end: 1 }]).size, 0);
});

test("isTimeWithinSegment is boundary-inclusive", () => {
  const s = seg("s", 1, 2);
  assert.equal(isTimeWithinSegment(1, s), true);
  assert.equal(isTimeWithinSegment(2, s), true);
  assert.equal(isTimeWithinSegment(0.99, s), false);
  assert.equal(isTimeWithinSegment(2.01, s), false);
});

test("findMatchingBookmarkId matches within the 0.5s tolerance", () => {
  const s = seg("s", 10, 15);
  assert.equal(findMatchingBookmarkId(s, [bookmark("b1", 10.3, 14.7)]), "b1");
  assert.equal(findMatchingBookmarkId(s, [bookmark("b2", 10.6, 15)]), null);
  assert.equal(findMatchingBookmarkId(s, []), null);
});

test("findSegmentIndexAtTime binary-searches without a hint", () => {
  const segments = [seg("a", 0, 1), seg("b", 1.5, 3), seg("c", 3.5, 6)];
  assert.equal(findSegmentIndexAtTime(segments, 0.5), 0);
  assert.equal(findSegmentIndexAtTime(segments, 2), 1);
  assert.equal(findSegmentIndexAtTime(segments, 5.9), 2);
  assert.equal(findSegmentIndexAtTime(segments, 1.2), -1); // in a gap
  assert.equal(findSegmentIndexAtTime([], 1), -1);
});

test("findSegmentIndexAtTime prefers the hint and its neighbors", () => {
  const segments = [seg("a", 0, 1), seg("b", 1.5, 3), seg("c", 3.5, 6)];
  assert.equal(findSegmentIndexAtTime(segments, 2, 1), 1);
  assert.equal(findSegmentIndexAtTime(segments, 4, 1), 2); // next neighbor
  assert.equal(findSegmentIndexAtTime(segments, 0.5, 1), 0); // previous neighbor
  assert.equal(findSegmentIndexAtTime(segments, 5, 0), 2); // falls back to search
});
