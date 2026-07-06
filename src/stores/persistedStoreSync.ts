import { subscribeDesktopStorageChanges } from "./desktopStorage";
import i18n from "../i18n";
import { desktopStorage } from "./desktopStorage";
import { useLayoutStore } from "./layoutStore";
import { usePlayerStore, PLAYER_SETTINGS_STORAGE_KEY } from "./playerStore";
import { useBookmarkStore, BOOKMARKS_STORAGE_KEY } from "./bookmarkStore";
import { useTranscriptStore, STUDY_STORAGE_KEY } from "./transcriptStore";
import { useHistoryStore, LIBRARY_STORAGE_KEY } from "./historyStore";
import { useSettingsStore } from "./settingsStore";
import { useThemeStore } from "./themeStore";
import { applyAiSettingsPayload } from "../utils/aiSettingsSync";
import { desktopApi } from "../platform/runtime";

/**
 * Cross-window persisted-store sync.
 *
 * Auxiliary windows (settings, glossary) run their own store instances and
 * persist through the same desktop config storage. When another window writes
 * a key, this module rehydrates the matching store so the current window
 * reflects the change. Rehydration only touches each store's partialized
 * (persisted) fields, so live playback state is never disturbed.
 */
export type PersistedStoreSyncTarget =
  | "settings"
  | "layout"
  | "theme"
  | "playerSettings"
  | "bookmarks"
  | "study"
  | "library"
  | "language"
  | "aiSettings";

const PERSISTED_STORE_TARGETS: Record<string, PersistedStoreSyncTarget[]> = {
  "abloop-settings-storage": ["settings"],
  "layout-storage": ["layout"],
  "theme-storage": ["theme"],
  [PLAYER_SETTINGS_STORAGE_KEY]: ["playerSettings"],
  [BOOKMARKS_STORAGE_KEY]: ["bookmarks"],
  [STUDY_STORAGE_KEY]: ["study"],
  [LIBRARY_STORAGE_KEY]: ["library"],
  i18nextLng: ["language"],
  "ai-settings-storage": ["aiSettings"],
};

export const getPersistedStoreSyncTargets = (
  key: string,
): PersistedStoreSyncTarget[] => PERSISTED_STORE_TARGETS[key] ?? [];

const syncLanguageFromStorage = async () => {
  const language = await desktopStorage.getItem("i18nextLng");
  if (!language || i18n.language === language) return;

  localStorage.setItem("i18nextLng", language);
  await i18n.changeLanguage(language);
};

const notifyAiSettingsChanged = () => {
  window.dispatchEvent(new CustomEvent("aiSettingsUpdated"));
  window.dispatchEvent(new CustomEvent("ai-settings-updated"));
};

export const syncPersistedStoreForConfigKey = async (key: string) => {
  const targets = getPersistedStoreSyncTargets(key);

  for (const target of targets) {
    if (target === "settings") {
      await useSettingsStore.persist.rehydrate();
    } else if (target === "layout") {
      await useLayoutStore.persist.rehydrate();
    } else if (target === "theme") {
      await useThemeStore.persist.rehydrate();
    } else if (target === "playerSettings") {
      await usePlayerStore.persist.rehydrate();
    } else if (target === "bookmarks") {
      await useBookmarkStore.persist.rehydrate();
    } else if (target === "study") {
      await useTranscriptStore.persist.rehydrate();
    } else if (target === "library") {
      await useHistoryStore.persist.rehydrate();
    } else if (target === "language") {
      await syncLanguageFromStorage();
    } else if (target === "aiSettings") {
      notifyAiSettingsChanged();
    }
  }
};

let stopPersistedStoreSync: (() => void) | null = null;

export const startPersistedStoreSync = () => {
  if (stopPersistedStoreSync) return stopPersistedStoreSync;

  const unsubscribe = subscribeDesktopStorageChanges(({ key }) => {
    void syncPersistedStoreForConfigKey(key);
  });
  const unsubscribeAiSettings = desktopApi?.onAiSettingsChanged((payload) => {
    applyAiSettingsPayload(payload);
    notifyAiSettingsChanged();
  }) ?? (() => undefined);

  stopPersistedStoreSync = () => {
    unsubscribe();
    unsubscribeAiSettings();
    stopPersistedStoreSync = null;
  };

  return stopPersistedStoreSync;
};

export const stopPersistedStoreSyncForTests = () => {
  stopPersistedStoreSync?.();
  stopPersistedStoreSync = null;
};
