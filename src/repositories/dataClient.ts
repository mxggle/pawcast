// Approved IPC bridge for repository layer — mirrors src/stores/electronStorage.ts pattern
// This is the ONLY file in src/repositories/ that calls window.electronAPI

export const dataClient = {
  get: async <T>(path: string): Promise<T | null> => {
    if (!window.electronAPI) return null
    return window.electronAPI.dataGet(path) as Promise<T | null>
  },
  put: async (path: string, data: unknown): Promise<void> => {
    if (!window.electronAPI) return
    await window.electronAPI.dataPut(path, data)
  },
  delete: async (path: string): Promise<void> => {
    if (!window.electronAPI) return
    await window.electronAPI.dataDelete(path)
  },
  list: async (path: string): Promise<string[]> => {
    if (!window.electronAPI) return []
    return window.electronAPI.dataList(path)
  },
  getBinary: async (path: string): Promise<ArrayBuffer | null> => {
    if (!window.electronAPI) return null
    return window.electronAPI.dataGetMediaFile(path)
  },
  putBinary: async (path: string, data: ArrayBuffer): Promise<void> => {
    if (!window.electronAPI) return
    await window.electronAPI.dataPutMediaFile(path, data)
  },
  getDirectory: async (): Promise<string | null> => {
    if (!window.electronAPI) return null
    return window.electronAPI.dataGetDirectory()
  },
  isMigrated: async (): Promise<boolean> => {
    if (!window.electronAPI) return false
    return window.electronAPI.dataIsMigrated()
  },
  approvePath: async (filePath: string): Promise<void> => {
    if (!window.electronAPI?.approvePath) return
    await window.electronAPI.approvePath(filePath)
  },
}
