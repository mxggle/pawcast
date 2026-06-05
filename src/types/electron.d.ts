interface ElectronMediaFile {
  name: string
  path: string
}

type SettingsWindowTab = 'general' | 'ai' | 'data'

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
  openGlossaryWindow: () => Promise<void>
  closeGlossaryWindow: () => Promise<void>
  navigateInMainWindow: (route: string, entryId?: string) => Promise<void>
  onNavigate: (callback: (payload: { route: string; entryId?: string }) => void) => () => void
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
  } | null>
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
  dataGet: (path: string) => Promise<unknown>
  dataPut: (path: string, data: unknown) => Promise<void>
  dataDelete: (path: string) => Promise<void>
  dataList: (path: string) => Promise<string[]>
  dataExportSnapshot: () => Promise<{ path: string }>
  dataImportSnapshot: (zipPath: string) => Promise<void>
  dataChangeDirectory: (targetPath: string) => Promise<void>
  dataHealthCheck: () => Promise<{
    manifestOk: boolean
    failedChecksums: string[]
    orphanedReferences: string[]
    corruptedFiles: string[]
    status: 'healthy' | 'degraded' | 'damaged'
  }>
  dataRecover: (strategy: string) => Promise<{
    success: boolean
    recoveredFiles: string[]
    failedFiles: string[]
    message: string
  }>
  dataGetMediaFile: (filePath: string) => Promise<ArrayBuffer>
  dataPutMediaFile: (filePath: string, data: ArrayBuffer) => Promise<void>
  dataGetDirectory: () => Promise<string>
  dataRunMigration: (localStorage: Record<string, string>, indexedDB: unknown) => Promise<{ success: boolean; migratedCounts: Record<string, number>; errors: string[] }>
  dataIsMigrated: () => Promise<boolean>
  approvePath: (filePath: string) => Promise<void>
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI
  }
}

export {}
