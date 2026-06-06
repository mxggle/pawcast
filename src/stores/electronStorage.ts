import type { StateStorage } from 'zustand/middleware'

export interface ElectronStorageChange {
  key: string
}

/**
 * Custom Zustand StateStorage that delegates to Electron's config IPC.
 */
export const electronStorage: StateStorage = {
  getItem: async (name: string): Promise<string | null> => {
    const value = await window.electronAPI!.configGet(name)
    return typeof value === 'string' ? value : null
  },
  setItem: async (name: string, value: string): Promise<void> => {
    await window.electronAPI!.configSet(name, value)
  },
  removeItem: async (name: string): Promise<void> => {
    await window.electronAPI!.configSet(name, null)
  },
}

export const subscribeElectronStorageChanges = (
  callback: (change: ElectronStorageChange) => void,
) => {
  return window.electronAPI?.onConfigChanged?.(callback) ?? (() => {})
}
