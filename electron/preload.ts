import { contextBridge, ipcRenderer } from 'electron'
import type { IpcRendererEvent } from 'electron'

type SettingsWindowTab = 'general' | 'ai' | 'data'
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
  openGlossaryWindow: () => ipcRenderer.invoke('window:openGlossary'),
  closeGlossaryWindow: () => ipcRenderer.invoke('window:closeGlossary'),
  navigateInMainWindow: (route: string, entryId?: string) =>
    ipcRenderer.invoke('window:navigateInMain', route, entryId),
  onNavigate: (callback: (payload: { route: string; entryId?: string }) => void) => {
    const listener = (_event: IpcRendererEvent, payload: { route: string; entryId?: string }) => {
      callback(payload)
    }
    ipcRenderer.on('navigate', listener)
    return () => { ipcRenderer.removeListener('navigate', listener) }
  },
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
  dataGet: (path: string) => ipcRenderer.invoke('data:get', path),
  dataPut: (path: string, data: unknown) => ipcRenderer.invoke('data:put', path, data),
  dataDelete: (path: string) => ipcRenderer.invoke('data:delete', path),
  dataList: (path: string) => ipcRenderer.invoke('data:list', path),
  dataGetMediaFile: (path: string) => ipcRenderer.invoke('data:getMediaFile', path),
  dataPutMediaFile: (path: string, data: ArrayBuffer) =>
    ipcRenderer.invoke('data:putMediaFile', path, Array.from(new Uint8Array(data))),
  dataGetDirectory: () => ipcRenderer.invoke('data:getDirectory'),
  dataIsMigrated: () => ipcRenderer.invoke('data:isMigrated'),
  dataRunMigration: (localStorage: Record<string, string>, indexedDB: unknown) =>
    ipcRenderer.invoke('data:migrate', { localStorage, indexedDB }),
  dataExportSnapshot: () => ipcRenderer.invoke('data:exportSnapshot'),
  dataImportSnapshot: (zipPath: string) => ipcRenderer.invoke('data:importSnapshot', zipPath),
  dataChangeDirectory: (targetPath: string) =>
    ipcRenderer.invoke('data:changeDirectory', targetPath),
  dataHealthCheck: () => ipcRenderer.invoke('data:healthCheck'),
  dataRecover: (strategy: string) => ipcRenderer.invoke('data:recover', strategy),
  approvePath: (filePath: string) => ipcRenderer.invoke('fs:approvePath', filePath),
})
