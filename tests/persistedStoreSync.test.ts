import test from "node:test";
import assert from "node:assert/strict";

import { getPersistedStoreSyncTargets } from "../src/stores/persistedStoreSync.ts";

test("config changes rehydrate the matching persisted store only", () => {
  assert.deepEqual(getPersistedStoreSyncTargets("layout-storage"), ["layout"]);
  assert.deepEqual(getPersistedStoreSyncTargets("theme-storage"), ["theme"]);
  assert.deepEqual(getPersistedStoreSyncTargets("abloop-settings-storage"), ["settings"]);
});

test("per-domain config changes rehydrate their matching stores", () => {
  assert.deepEqual(getPersistedStoreSyncTargets("pawcast-player-settings"), ["playerSettings"]);
  assert.deepEqual(getPersistedStoreSyncTargets("pawcast-bookmarks"), ["bookmarks"]);
  assert.deepEqual(getPersistedStoreSyncTargets("pawcast-study"), ["study"]);
  assert.deepEqual(getPersistedStoreSyncTargets("pawcast-library"), ["library"]);
});

test("the legacy monolithic player key no longer triggers rehydration", () => {
  assert.deepEqual(getPersistedStoreSyncTargets("abloop-player-storage"), []);
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
