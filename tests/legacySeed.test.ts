import test from "node:test";
import assert from "node:assert/strict";

import {
  seedFromLegacyPlayerStorage,
  resetLegacyPlayerStateForTests,
  LEGACY_PLAYER_STORAGE_KEY,
} from "../src/stores/legacyPlayerStorage.ts";

// desktopStorage falls back to globalThis.localStorage outside the Tauri
// runtime, so tests drive the seed path through an in-memory localStorage.
const installFakeLocalStorage = (entries: Record<string, string>) => {
  const map = new Map(Object.entries(entries));
  (globalThis as Record<string, unknown>).localStorage = {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
    removeItem: (key: string) => void map.delete(key),
  };
  return map;
};

interface FakeState {
  mediaBookmarks?: Record<string, unknown[]>;
  volume?: number;
}

const makeFakeStore = () => {
  const applied: Partial<FakeState>[] = [];
  return {
    applied,
    setState: (partial: Partial<FakeState>) => void applied.push(partial),
    persist: {
      hasHydrated: () => true,
      onFinishHydration: (_cb: (state: FakeState) => void) => () => {},
    },
  };
};

const LEGACY_SNAPSHOT = JSON.stringify({
  state: {
    volume: 0.7,
    mediaBookmarks: { "file-a-1": [{ id: "1", start: 1, end: 2 }] },
    mediaHistory: [{ id: "h1", type: "file", name: "a", accessedAt: 1 }],
  },
  version: 3,
});

test("seeds a store from the legacy snapshot when its own key is empty", async () => {
  resetLegacyPlayerStateForTests();
  installFakeLocalStorage({ [LEGACY_PLAYER_STORAGE_KEY]: LEGACY_SNAPSHOT });

  const store = makeFakeStore();
  const seeded = await seedFromLegacyPlayerStorage(store, "pawcast-test-key", (legacy) => ({
    volume: legacy.volume as number,
    mediaBookmarks: legacy.mediaBookmarks as Record<string, unknown[]>,
  }));

  assert.equal(seeded, true);
  assert.equal(store.applied.length, 1);
  assert.equal(store.applied[0].volume, 0.7);
  assert.deepEqual(Object.keys(store.applied[0].mediaBookmarks ?? {}), ["file-a-1"]);
});

test("does not seed when the store's own key already has data", async () => {
  resetLegacyPlayerStateForTests();
  installFakeLocalStorage({
    [LEGACY_PLAYER_STORAGE_KEY]: LEGACY_SNAPSHOT,
    "pawcast-test-key": JSON.stringify({ state: { volume: 0.4 }, version: 1 }),
  });

  const store = makeFakeStore();
  const seeded = await seedFromLegacyPlayerStorage(store, "pawcast-test-key", (legacy) => ({
    volume: legacy.volume as number,
  }));

  assert.equal(seeded, false);
  assert.equal(store.applied.length, 0);
});

test("does not seed when there is no legacy snapshot", async () => {
  resetLegacyPlayerStateForTests();
  installFakeLocalStorage({});

  const store = makeFakeStore();
  const seeded = await seedFromLegacyPlayerStorage(store, "pawcast-test-key", (legacy) => ({
    volume: legacy.volume as number,
  }));

  assert.equal(seeded, false);
  assert.equal(store.applied.length, 0);
});

test("never writes to the legacy key", async () => {
  resetLegacyPlayerStateForTests();
  const map = installFakeLocalStorage({ [LEGACY_PLAYER_STORAGE_KEY]: LEGACY_SNAPSHOT });

  const store = makeFakeStore();
  await seedFromLegacyPlayerStorage(store, "pawcast-test-key", (legacy) => ({
    volume: legacy.volume as number,
  }));

  assert.equal(map.get(LEGACY_PLAYER_STORAGE_KEY), LEGACY_SNAPSHOT);
});
