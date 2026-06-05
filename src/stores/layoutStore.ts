import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { electronStorage } from "./electronStorage";
import { settingsRepository } from "../repositories/settingsRepository";

export interface LayoutSettings {
  showPlayer: boolean;
  showWaveform: boolean;
  showTranscript: boolean;
  showControls: boolean;
  // panel visibility states
  transcriptPanelVisible: boolean;
  transcriptPanelCollapsed: boolean;
  videoPanelVisible: boolean;
  videoPanelCollapsed: boolean;
  timelinePanelVisible: boolean;
  timelinePanelCollapsed: boolean;
}

export interface LayoutState {
  layoutSettings: LayoutSettings;
  setLayoutSettings: (settings: LayoutSettings | ((prev: LayoutSettings) => LayoutSettings)) => void;
  updateLayoutSettings: (changes: Partial<LayoutSettings>) => void;
}

export const defaultLayoutSettings: LayoutSettings = {
  showPlayer: true,
  showWaveform: true,
  showTranscript: true,
  showControls: true,
  transcriptPanelVisible: true,
  transcriptPanelCollapsed: false,
  videoPanelVisible: true,
  videoPanelCollapsed: false,
  timelinePanelVisible: true,
  timelinePanelCollapsed: false,
};

const isLayoutSettingsLike = (value: unknown): value is Partial<LayoutSettings> =>
  typeof value === "object" && value !== null;

export const mergePersistedLayoutState = (
  persistedState: unknown,
  currentState: LayoutState,
): LayoutState => {
  if (typeof persistedState !== "object" || persistedState === null) {
    return currentState;
  }

  const persisted = persistedState as { layoutSettings?: unknown };
  const persistedLayoutSettings = isLayoutSettingsLike(persisted.layoutSettings)
    ? persisted.layoutSettings
    : {};

  return {
    ...currentState,
    layoutSettings: {
      ...defaultLayoutSettings,
      ...persistedLayoutSettings,
    },
  };
};

export const useLayoutStore = create<LayoutState>()(
  persist(
    (set) => ({
      layoutSettings: defaultLayoutSettings,
      setLayoutSettings: (settings) =>
        set((state) => ({
          layoutSettings: typeof settings === "function" ? settings(state.layoutSettings) : settings,
        })),
      updateLayoutSettings: (changes) =>
        set((state) => ({
          layoutSettings: { ...state.layoutSettings, ...changes },
        })),
    }),
    {
      name: "layout-storage",
      storage: createJSONStorage(() => electronStorage),
      merge: mergePersistedLayoutState,
    }
  )
);

// ─── Dual-write sync ───
let _layoutSaveTimer: ReturnType<typeof setTimeout>
useLayoutStore.subscribe((state) => {
  clearTimeout(_layoutSaveTimer)
  _layoutSaveTimer = setTimeout(() => {
    if (!window.electronAPI?.dataPut) return
    settingsRepository.saveLayoutSettings({
      version: 1,
      ...state.layoutSettings,
      isSidebarOpen: true,
      sidebarWidth: 320,
      activeSidebarTab: 'history',
    }).catch(() => {})
  }, 300)
})
