interface ElectronMediaFile {
  name: string
  path: string
}

type SettingsWindowTab = 'general' | 'ai'

export interface FolderTreeNode {
  name: string
  path: string
  type: 'file' | 'directory'
  children?: FolderTreeNode[]
}

export interface MediaTreeChangedPayload {
  folderPath: string
  changedPath: string | null
}

interface ElectronAPI {
  isElectron: boolean
  platform: string
  openFile: () => Promise<string | null>
  openFolder: () => Promise<string | null>
  openSettingsWindow: (tab?: SettingsWindowTab, section?: string) => Promise<void>
  closeSettingsWindow: () => Promise<void>
  showInFileManager: (targetPath: string) => Promise<boolean>
  listMediaFiles: (folderPath: string) => Promise<ElectronMediaFile[]>
  listMediaTree: (folderPath: string) => Promise<FolderTreeNode[]>
  watchMediaTree: (
    folderPath: string,
    onChange: (payload: MediaTreeChangedPayload) => void,
  ) => () => void
  configGet: (key: string) => Promise<unknown>
  configSet: (key: string, value: unknown) => Promise<void>
  configGetAll: () => Promise<unknown>
  fetch: (url: string, options?: RequestInit) => Promise<{ ok: boolean, status: number, statusText: string, data: string, headers: Record<string, string> }>
  waveformAnalyze: (filePath: string, mediaId: string) => Promise<{
    mediaId: string
    duration: number
    sampleRate: number
    levels: Array<{ level: number; samplesPerPeak: number; points: number; path: string }>
  }>
  waveformGetMeta: (mediaId: string) => Promise<{
    mediaId: string
    duration: number
    sampleRate: number
    levels: Array<{ level: number; samplesPerPeak: number; points: number; path: string }>
  } | null>
  waveformGetLevel: (mediaId: string, level: number) => Promise<{
    mediaId: string
    level: number
    samplesPerPeak: number
    sampleRate: number
    min: number[]
    max: number[]
    rms: number[]
  } | null>
  waveformDelete: (mediaId: string) => Promise<void>
  onWaveformProgress: (callback: (payload: { mediaId: string; fraction: number }) => void) => () => void
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI
  }
}

export {}
