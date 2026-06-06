import test from "node:test";
import assert from "node:assert/strict";

import { getPersistedStoreSyncTargets } from "../src/stores/persistedStoreSync.ts";

test("config changes rehydrate the matching persisted store only", () => {
  assert.deepEqual(getPersistedStoreSyncTargets("layout-storage"), ["layout"]);
  assert.deepEqual(getPersistedStoreSyncTargets("theme-storage"), ["theme"]);
  assert.deepEqual(getPersistedStoreSyncTargets("abloop-settings-storage"), ["settings"]);
});

test("player config changes rehydrate player state and mirrored media settings", () => {
  assert.deepEqual(getPersistedStoreSyncTargets("abloop-player-storage"), [
    "player",
    "mediaSettings",
  ]);
});

test("unknown config changes do not trigger app store rehydration", () => {
  assert.deepEqual(getPersistedStoreSyncTargets("unrelated-storage"), []);
});

test("language config changes update the i18n runtime", () => {
  assert.deepEqual(getPersistedStoreSyncTargets("i18nextLng"), ["language"]);
});

test("AI settings config changes notify local AI settings consumers", () => {
  assert.deepEqual(getPersistedStoreSyncTargets("ai-settings-storage"), [
    "aiSettings",
  ]);
});
