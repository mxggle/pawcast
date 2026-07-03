export interface DesktopMediaFile {
  name: string;
  path: string;
}

export type SettingsWindowTab = "general" | "ai" | "data";

export interface FolderTreeNode {
  name: string;
  path: string;
  type: "file" | "directory";
  children?: FolderTreeNode[];
}

export interface MediaTreeChangedPayload {
  folderPath: string;
  changedPath: string | null;
}

export interface NavigationPayload {
  route: string;
  entryId?: string;
}

export interface WaveformLevelMeta {
  level: number;
  samplesPerPeak: number;
  points: number;
  path: string;
}

export interface WaveformMeta {
  mediaId: string;
  duration: number;
  sampleRate: number;
  levels: WaveformLevelMeta[];
}

export interface WaveformLevel {
  mediaId: string;
  level: number;
  samplesPerPeak: number;
  sampleRate: number;
  min: number[];
  max: number[];
  rms: number[];
}

export interface HealthCheckResult {
  manifestOk: boolean;
  failedChecksums: string[];
  orphanedReferences: string[];
  corruptedFiles: string[];
  status: "healthy" | "degraded" | "damaged";
}

export interface RecoveryResult {
  success: boolean;
  recoveredFiles: string[];
  failedFiles: string[];
  message: string;
}

export interface MigrationResult {
  success: boolean;
  migratedCounts: Record<string, number>;
  errors: string[];
}

export interface DesktopFetchResult {
  ok: boolean;
  status: number;
  statusText: string;
  data: string;
  headers: Record<string, string>;
}
