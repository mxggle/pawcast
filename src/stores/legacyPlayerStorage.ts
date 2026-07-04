import { desktopStorage } from "./desktopStorage";

/**
 * One-time seeding from the legacy monolithic `abloop-player-storage` snapshot.
 *
 * Before the store split, a single persisted playerStore held media settings,
 * bookmarks, glossary, history, and sidebar state. Each focused store now has
 * its own storage key; on first run with an empty key it seeds itself from the
 * legacy snapshot. The legacy key is never written or deleted, so downgrading
 * to an older build keeps working.
 */
export const LEGACY_PLAYER_STORAGE_KEY = "abloop-player-storage";

let legacyStatePromise: Promise<Record<string, unknown> | null> | null = null;

export const readLegacyPlayerState = (): Promise<Record<string, unknown> | null> => {
  if (!legacyStatePromise) {
    legacyStatePromise = (async () => {
      try {
        const raw = await desktopStorage.getItem(LEGACY_PLAYER_STORAGE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw) as { state?: Record<string, unknown> };
        return parsed.state ?? null;
      } catch {
        return null;
      }
    })();
  }
  return legacyStatePromise;
};

/** Reset the memoized legacy snapshot (test hook). */
export const resetLegacyPlayerStateForTests = () => {
  legacyStatePromise = null;
};

interface SeedableStore<T> {
  setState: (partial: Partial<T>) => void;
  persist: {
    hasHydrated: () => boolean;
    onFinishHydration: (cb: (state: T) => void) => () => void;
  };
}

export const seedFromLegacyPlayerStorage = async <T>(
  store: SeedableStore<T>,
  storageKey: string,
  pick: (legacy: Record<string, unknown>) => Partial<T> | null,
): Promise<boolean> => {
  if (!store.persist.hasHydrated()) {
    await new Promise<void>((resolve) => {
      const unsubscribe = store.persist.onFinishHydration(() => {
        unsubscribe();
        resolve();
      });
    });
  }

  const existing = await desktopStorage.getItem(storageKey);
  if (existing !== null) return false;

  const legacy = await readLegacyPlayerState();
  if (!legacy) return false;

  const picked = pick(legacy);
  if (!picked || Object.keys(picked).length === 0) return false;

  store.setState(picked);
  return true;
};
