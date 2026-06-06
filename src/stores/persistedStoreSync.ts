import { electronStorage, subscribeElectronStorageChanges } from "./electronStorage";
import i18n from "../i18n";
import { useLayoutStore } from "./layoutStore";
import { useMediaStore } from "./mediaStore";
import { usePlayerStore } from "./playerStore";
import { useSettingsStore } from "./settingsStore";
import { useThemeStore } from "./themeStore";

export type PersistedStoreSyncTarget =
  | "settings"
  | "layout"
  | "theme"
  | "player"
  | "mediaSettings"
  | "language"
  | "aiSettings";

const PERSISTED_STORE_TARGETS: Record<string, PersistedStoreSyncTarget[]> = {
  "abloop-settings-storage": ["settings"],
  "layout-storage": ["layout"],
  "theme-storage": ["theme"],
  "abloop-player-storage": ["player", "mediaSettings"],
  i18nextLng: ["language"],
  "ai-settings-storage": ["aiSettings"],
};

export const getPersistedStoreSyncTargets = (
  key: string,
): PersistedStoreSyncTarget[] => PERSISTED_STORE_TARGETS[key] ?? [];

const syncMediaSettingsFromPlayerStore = () => {
  const {
    volume,
    mediaVolume,
    muted,
    playbackRate,
    seekStepSeconds,
    seekSmallStepSeconds,
    seekMode,
  } = usePlayerStore.getState();

  useMediaStore.setState({
    volume,
    mediaVolume,
    muted,
    playbackRate,
    seekStepSeconds,
    seekSmallStepSeconds,
    seekMode,
  });
};

const syncPlayerSettingsFromStorage = async () => {
  const persistedValue = await electronStorage.getItem("abloop-player-storage");
  if (!persistedValue) return;

  let persisted: {
    state?: Partial<{
      volume: number;
      mediaVolume: number;
      muted: boolean;
      playbackRate: number;
      seekStepSeconds: number;
      seekSmallStepSeconds: number;
      seekMode: "seconds" | "sentence";
    }>;
  };

  try {
    persisted = JSON.parse(persistedValue) as typeof persisted;
  } catch {
    return;
  }
  const state = persisted.state;
  if (!state) return;

  const current = usePlayerStore.getState();
  const nextSettings = {
    volume: typeof state.volume === "number" ? state.volume : current.volume,
    mediaVolume:
      typeof state.mediaVolume === "number" ? state.mediaVolume : current.mediaVolume,
    muted: typeof state.muted === "boolean" ? state.muted : current.muted,
    playbackRate:
      typeof state.playbackRate === "number" ? state.playbackRate : current.playbackRate,
    seekStepSeconds:
      typeof state.seekStepSeconds === "number"
        ? state.seekStepSeconds
        : current.seekStepSeconds,
    seekSmallStepSeconds:
      typeof state.seekSmallStepSeconds === "number"
        ? state.seekSmallStepSeconds
        : current.seekSmallStepSeconds,
    seekMode:
      state.seekMode === "seconds" || state.seekMode === "sentence"
        ? state.seekMode
        : current.seekMode,
  };

  const didChange =
    current.volume !== nextSettings.volume ||
    current.mediaVolume !== nextSettings.mediaVolume ||
    current.muted !== nextSettings.muted ||
    current.playbackRate !== nextSettings.playbackRate ||
    current.seekStepSeconds !== nextSettings.seekStepSeconds ||
    current.seekSmallStepSeconds !== nextSettings.seekSmallStepSeconds ||
    current.seekMode !== nextSettings.seekMode;

  if (didChange) {
    usePlayerStore.setState(nextSettings);
  }
};

const syncLanguageFromStorage = async () => {
  const language = await electronStorage.getItem("i18nextLng");
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
    } else if (target === "player") {
      await syncPlayerSettingsFromStorage();
    } else if (target === "mediaSettings") {
      syncMediaSettingsFromPlayerStore();
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

  const unsubscribe = subscribeElectronStorageChanges(({ key }) => {
    void syncPersistedStoreForConfigKey(key);
  });

  stopPersistedStoreSync = () => {
    unsubscribe();
    stopPersistedStoreSync = null;
  };

  return stopPersistedStoreSync;
};

export const stopPersistedStoreSyncForTests = () => {
  stopPersistedStoreSync?.();
  stopPersistedStoreSync = null;
};
