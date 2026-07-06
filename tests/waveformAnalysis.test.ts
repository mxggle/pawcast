import assert from "node:assert/strict";
import test from "node:test";

import { buildNativeWaveformId } from "../src/utils/waveformAnalysis";

test("buildNativeWaveformId returns a stable native-safe identifier", () => {
  const path = "/Volumes/rasp/audio/zoe_interview/RadState.mp3";
  const id = buildNativeWaveformId(path);

  assert.equal(id, buildNativeWaveformId(path));
  assert.match(id, /^[A-Za-z0-9_-]+$/);
  assert.ok(id.length <= 128);
});

test("buildNativeWaveformId distinguishes different media keys", () => {
  assert.notEqual(
    buildNativeWaveformId("first.mp3:100:audio/mp3"),
    buildNativeWaveformId("second.mp3:100:audio/mp3"),
  );
});
