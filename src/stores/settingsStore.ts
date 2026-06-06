import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { electronStorage } from "./electronStorage";
import { settingsRepository } from "../repositories/settingsRepository";

export interface SettingsState {
  theme: "light" | "dark";
  waveformZoom: number;
  showWaveform: boolean;
  videoSize: "sm" | "md" | "lg" | "xl";
}

export interface SettingsActions {
  setTheme: (theme: "light" | "dark") => void;
  setWaveformZoom: (zoom: number) => void;
  setShowWaveform: (show: boolean) => void;
  setVideoSize: (size: "sm" | "md" | "lg" | "xl") => void;
}

export const useSettingsStore = create<SettingsState & SettingsActions>()(
  persist(
    (set) => ({
      theme: "dark",
      waveformZoom: 1,
      showWaveform: true,
      videoSize: "md",

      setTheme: (theme) => set({ theme }),
      setWaveformZoom: (waveformZoom) => set({ waveformZoom }),
      setShowWaveform: (showWaveform) => set({ showWaveform }),
      setVideoSize: (videoSize) => set({ videoSize }),
    }),
    {
      name: "abloop-settings-storage",
      storage: createJSONStorage(() => electronStorage),
      partialize: (state) => ({
        theme: state.theme,
        waveformZoom: state.waveformZoom,
        showWaveform: state.showWaveform,
        videoSize: state.videoSize,
      }),
    }
  )
);

// ─── Dual-write sync ───
let _settingsSaveTimer: ReturnType<typeof setTimeout>
useSettingsStore.subscribe((state) => {
  clearTimeout(_settingsSaveTimer)
  _settingsSaveTimer = setTimeout(() => {
    settingsRepository.saveAppSettings({
      version: 1,
      volume: 1,
      muted: false,
      playbackRate: 1,
      showTranscript: true,
      transcriptLanguage: 'en',
      seekStepSeconds: 5,
      seekSmallStepSeconds: 1,
      seekMode: 'relative',
      waveformZoom: state.waveformZoom ?? 1,
      showWaveform: state.showWaveform ?? true,
      videoSize: state.videoSize ?? 'md',
    }).catch(() => {})
  }, 300)
})
