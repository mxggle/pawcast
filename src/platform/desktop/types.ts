import type {
  DesktopFetchResult,
  DesktopFetchOptions,
  DesktopMediaFile,
  FolderTreeNode,
  GlossaryPlaybackPayload,
  HealthCheckResult,
  MediaTreeChangedPayload,
  MigrationResult,
  NavigationPayload,
  RecoveryResult,
  SettingsWindowTab,
  AiSettingsChangedPayload,
  WaveformLevel,
  WaveformMeta,
} from "../../types/desktop";

export type DesktopUnlisten = (() => void) & { ready: Promise<void> };

export interface DesktopAPI {
  openFile(): Promise<string | null>;
  openFolder(): Promise<string | null>;
  openSettingsWindow(tab?: SettingsWindowTab, section?: string): Promise<void>;
  closeSettingsWindow(): Promise<void>;
  openGlossaryWindow(): Promise<void>;
  closeGlossaryWindow(): Promise<void>;
  navigateInMainWindow(route: string, entryId?: string): Promise<void>;
  onNavigate(callback: (payload: NavigationPayload) => void): DesktopUnlisten;
  playGlossaryEntryInMainWindow(entryId: string): Promise<void>;
  onGlossaryPlayback(callback: (payload: GlossaryPlaybackPayload) => void): DesktopUnlisten;
  showInFileManager(targetPath: string): Promise<boolean>;
  listMediaFiles(folderPath: string): Promise<DesktopMediaFile[]>;
  listMediaTree(folderPath: string): Promise<FolderTreeNode[]>;
  watchMediaTree(folderPath: string, callback: (payload: MediaTreeChangedPayload) => void): DesktopUnlisten;
  configGet(key: string): Promise<unknown>;
  configSet(key: string, value: unknown): Promise<void>;
  configGetAll(): Promise<unknown>;
  onConfigChanged(callback: (payload: { key: string }) => void): DesktopUnlisten;
  broadcastAiSettings(payload: AiSettingsChangedPayload): Promise<void>;
  onAiSettingsChanged(callback: (payload: AiSettingsChangedPayload) => void): DesktopUnlisten;
  fetch(url: string, options: DesktopFetchOptions): Promise<DesktopFetchResult>;
  waveformAnalyze(filePath: string, mediaId: string): Promise<WaveformMeta | null>;
  waveformGetMeta(mediaId: string): Promise<WaveformMeta | null>;
  waveformGetLevel(mediaId: string, level: number): Promise<WaveformLevel | null>;
  waveformDelete(mediaId: string): Promise<void>;
  onWaveformProgress(callback: (payload: { mediaId: string; fraction: number }) => void): DesktopUnlisten;
  dataGet(path: string): Promise<unknown>;
  dataPut(path: string, data: unknown): Promise<void>;
  dataDelete(path: string): Promise<void>;
  dataList(path: string): Promise<string[]>;
  dataGetMediaFile(filePath: string): Promise<ArrayBuffer>;
  dataPutMediaFile(filePath: string, data: ArrayBuffer): Promise<void>;
  dataGetDirectory(): Promise<string>;
  dataChangeDirectory(targetPath: string): Promise<void>;
  dataHealthCheck(): Promise<HealthCheckResult>;
  dataRecover(strategy: string): Promise<RecoveryResult>;
  dataRunMigration(localStorage: Record<string, string>, indexedDB: unknown): Promise<MigrationResult>;
  dataIsMigrated(): Promise<boolean>;
  approvePath(filePath: string): Promise<void>;
  mediaUrl(filePath: string): string;
  onFileDrop(callback: (paths: string[]) => void): DesktopUnlisten;
}
