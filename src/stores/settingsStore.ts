import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { desktopStorage } from "./desktopStorage";

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
      storage: createJSONStorage(() => desktopStorage),
      partialize: (state) => ({
        theme: state.theme,
        waveformZoom: state.waveformZoom,
        showWaveform: state.showWaveform,
        videoSize: state.videoSize,
      }),
    }
  )
);
