import test from "node:test";
import assert from "node:assert/strict";

import type { TranscriptSegment } from "../src/types/transcript";
import {
  getNextSentenceSeekTime,
  getPreviousSentenceSeekTime,
} from "../src/utils/sentenceSeek.ts";

const buildSegment = (
  id: string,
  startTime: number,
  endTime: number,
  text = id
): TranscriptSegment => ({
  id,
  text,
  startTime,
  endTime,
  confidence: 1,
  isFinal: true,
});

const segments = [
  buildSegment("first", 0, 4),
  buildSegment("second", 5, 9),
  buildSegment("third", 10, 14),
];

test("sentence seek forward jumps to the next segment start", () => {
  assert.equal(getNextSentenceSeekTime(segments, 5.2), 10);
});

test("sentence seek backward jumps to the previous segment start", () => {
  assert.equal(getPreviousSentenceSeekTime(segments, 6.5), 0);
});

test("sentence seek backward returns null before the first segment", () => {
  assert.equal(getPreviousSentenceSeekTime(segments, 0.02), null);
});
