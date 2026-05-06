import { contextBridge, ipcRenderer } from 'electron'
import type { IpcRendererEvent } from 'electron'

type SettingsWindowTab = 'general' | 'ai'
type MediaTreeChangedPayload = {
  folderPath: string
  changedPath: string | null
}

contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,
  platform: process.platform,
  openFile: () => ipcRenderer.invoke('dialog:openFile'),
  openFolder: () => ipcRenderer.invoke('dialog:openFolder'),
  openSettingsWindow: (tab?: SettingsWindowTab, section?: string) =>
    ipcRenderer.invoke('window:openSettings', tab, section),
  closeSettingsWindow: () => ipcRenderer.invoke('window:closeSettings'),
  showInFileManager: (targetPath: string) =>
    ipcRenderer.invoke('shell:showInFileManager', targetPath),
  listMediaFiles: (folderPath: string) =>
    ipcRenderer.invoke('fs:listMediaFiles', folderPath),
  listMediaTree: (folderPath: string) =>
    ipcRenderer.invoke('fs:listMediaTree', folderPath),
  watchMediaTree: (
    folderPath: string,
    onChange: (payload: MediaTreeChangedPayload) => void,
  ) => {
    let active = true
    let watchId: number | null = null
    const listener = (_event: IpcRendererEvent, payload: MediaTreeChangedPayload) => {
      if (active && payload.folderPath === folderPath) {
        onChange(payload)
      }
    }

    ipcRenderer.on('fs:mediaTreeChanged', listener)
    void ipcRenderer
      .invoke('fs:watchMediaTree', folderPath)
      .then((id: number) => {
        if (!active) {
          void ipcRenderer.invoke('fs:unwatchMediaTree', id)
          return
        }
        watchId = id
      })
      .catch((error) => {
        ipcRenderer.removeListener('fs:mediaTreeChanged', listener)
        console.error('Failed to watch media tree:', error)
      })

    return () => {
      active = false
      ipcRenderer.removeListener('fs:mediaTreeChanged', listener)
      if (watchId !== null) {
        void ipcRenderer.invoke('fs:unwatchMediaTree', watchId)
      }
    }
  },
  configGet: (key: string) => ipcRenderer.invoke('config:get', key),
  configSet: (key: string, value: unknown) =>
    ipcRenderer.invoke('config:set', key, value),
  configGetAll: () => ipcRenderer.invoke('config:getAll'),
  fetch: (url: string, options?: RequestInit) => ipcRenderer.invoke('net:fetch', url, options),
  waveformAnalyze: (filePath: string, mediaId: string) =>
    ipcRenderer.invoke('waveform:analyze', { filePath, mediaId }),
  waveformGetMeta: (mediaId: string) =>
    ipcRenderer.invoke('waveform:getMeta', mediaId),
  waveformGetLevel: (mediaId: string, level: number) =>
    ipcRenderer.invoke('waveform:getLevel', { mediaId, level }),
  waveformDelete: (mediaId: string) =>
    ipcRenderer.invoke('waveform:delete', mediaId),
  onWaveformProgress: (callback: (payload: { mediaId: string; fraction: number }) => void) => {
    const listener = (_event: IpcRendererEvent, payload: { mediaId: string; fraction: number }) => {
      callback(payload)
    }
    ipcRenderer.on('waveform:analyzeProgress', listener)
    return () => { ipcRenderer.removeListener('waveform:analyzeProgress', listener) }
  },
})
