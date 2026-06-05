import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { electronStorage } from "./electronStorage";
import { settingsRepository } from "../repositories/settingsRepository";

export type ThemeColors = {
  primary: string; // Base color for primary (e.g., 500)
  accent: string;  // Base color for accent
  success: string;
  warning: string;
  error: string;
  info: string;
};

export interface ThemeState {
  colors: ThemeColors;
  setColors: (colors: Partial<ThemeColors>) => void;
  resetColors: () => void;
}

export const defaultColors: ThemeColors = {
  primary: "#8B5CF6", // Purple-500
  accent: "#6366F1",  // Indigo-500
  success: "#10B981", // Emerald-500
  warning: "#F59E0B", // Amber-500
  error: "#EF4444",   // Red-500
  info: "#0EA5E9",    // Sky-500
};

export const THEME_PRESETS: Record<string, ThemeColors> = {
  purple: defaultColors,
  blue: {
    primary: "#3B82F6", // Blue-500
    accent: "#0EA5E9",  // Sky-500
    success: "#10B981",
    warning: "#F59E0B",
    error: "#EF4444",
    info: "#6366F1",
  },
  green: {
    primary: "#10B981", // Emerald-500
    accent: "#065F46",  // Emerald-800
    success: "#059669",
    warning: "#D97706",
    error: "#DC2626",
    info: "#2563EB",
  },
  rose: {
    primary: "#F43F5E", // Rose-500
    accent: "#FB7185",  // Rose-400
    success: "#10B981",
    warning: "#F59E0B",
    error: "#E11D48",
    info: "#3B82F6",
  },
  orange: {
    primary: "#F97316", // Orange-500
    accent: "#FB923C",  // Orange-400
    success: "#10B981",
    warning: "#F59E0B",
    error: "#EF4444",
    info: "#0EA5E9",
    },
    black: {
    primary: "#0F172A", // Slate-900
    accent: "#475569",  // Slate-600
    success: "#10B981",
    warning: "#F59E0B",
    error: "#EF4444",
    info: "#3B82F6",
    },
    };

    export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      colors: defaultColors,
      setColors: (newColors) =>
        set((state) => ({
          colors: { ...state.colors, ...newColors },
        })),
      resetColors: () => set({ colors: defaultColors }),
    }),
    {
      name: "theme-storage",
      storage: createJSONStorage(() => electronStorage),
    }
  )
);

// ─── Dual-write sync ───
let _themeSaveTimer: ReturnType<typeof setTimeout>
useThemeStore.subscribe((state) => {
  clearTimeout(_themeSaveTimer)
  _themeSaveTimer = setTimeout(() => {
    if (!window.electronAPI?.dataPut) return
    settingsRepository.saveThemeSettings({
      version: 1,
      theme: 'dark',
      colors: state.colors,
    }).catch(() => {})
  }, 300)
})
