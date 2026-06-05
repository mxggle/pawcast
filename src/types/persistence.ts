// ─── Manifest ────────────────────────────────────────────────

export interface DataManifest {
  schemaVersion: number
  appVersion: string
  deviceId: string
  createdAt: number
  updatedAt: number
  activeDataDir: string
  files: ManifestFileEntry[]
  latestSnapshot?: SnapshotRef
  migrationStatus?: 'pending' | 'completed' | 'failed'
}

export interface ManifestFileEntry {
  path: string
  version: number
  updatedAt: number
  checksum: string
}

export interface SnapshotRef {
  path: string
  createdAt: number
  checksum: string
}

// ─── Library ─────────────────────────────────────────────────

export interface MediaHistoryFile {
  version: number
  items: MediaHistoryItem[]
}

export interface MediaHistoryItem {
  id: string
  mediaId: string
  type: 'file' | 'youtube'
  name: string
  accessedAt: number
  playbackTime: number
  folderId: string | null
  nativePath?: string
  storageId?: string | null
  fileData?: { name: string; type: string; size: number } | null
  youtubeData?: { id: string; title: string } | null
}

export interface MediaSourcesFile {
  version: number
  folders: string[]
}

export interface MediaFoldersFile {
  version: number
  folders: MediaFolderEntry[]
}

export interface MediaFolderEntry {
  id: string
  name: string
  createdAt: number
  parentId: string | null
}

// ─── Bookmarks ───────────────────────────────────────────────

export interface BookmarkFile {
  version: number
  bookmarks: PersistedBookmark[]
}

export interface PersistedBookmark {
  id: string
  mediaId: string
  name: string
  start: number
  end: number
  createdAt: number
  mediaName?: string
  mediaType?: string
  youtubeId?: string
  playbackRate?: number
  annotation?: string
  segmentIds?: string[]
  wordIds?: string[]
}

// ─── Transcripts ─────────────────────────────────────────────

export interface TranscriptFile {
  version: number
  mediaId: string
  updatedAt: number
  segments: PersistedTranscriptSegment[]
}

export interface PersistedTranscriptSegment {
  id: string
  text: string
  startTime: number
  endTime: number
  confidence: number
  isFinal: boolean
  words?: PersistedTranscriptWord[]
}

export interface PersistedTranscriptWord {
  text: string
  startTime: number
  endTime: number
  confidence: number
}

// ─── Transcript Study ────────────────────────────────────────

export interface TranscriptStudyFile {
  version: number
  mediaId: string
  updatedAt: number
  segmentStudies: PersistedSegmentStudy[]
}

export interface PersistedSegmentStudy {
  segmentId: string
  levelSystem: string
  updatedAt: number
  items: PersistedStudyItem[]
}

export interface PersistedStudyItem {
  id: string
  type: 'word' | 'expression' | 'grammar'
  text: string
  reading?: string
  meaning?: string
  level?: string
  notes?: string
  createdAt: number
}

// ─── Glossary ────────────────────────────────────────────────

export interface GlossaryFile {
  version: number
  entries: PersistedGlossaryEntry[]
}

export interface PersistedGlossaryEntry {
  id: string
  mediaId: string
  mediaName: string
  mediaType: string
  youtubeId?: string
  segmentId: string
  text: string
  contextText: string
  selectionStart: number
  selectionEnd: number
  startTime: number
  endTime: number
  createdAt: number
  updatedAt: number
}

// ─── Recordings ──────────────────────────────────────────────

export interface ShadowingIndexFile {
  version: number
  segments: PersistedShadowingSegment[]
}

export interface PersistedShadowingSegment {
  id: string
  mediaId: string
  startTime: number
  duration: number
  filePath: string
  fileOffset: number
  segmentId?: string
  peaks: number[]
  peakTimes: number[]
  createdAt: number
}

export interface SentencePracticeIndexFile {
  version: number
  recordings: PersistedSentenceRecording[]
}

export interface PersistedSentenceRecording {
  id: string
  mediaId: string
  sentenceIndex: number
  filePath: string
  duration: number
  createdAt: number
  peaks: number[]
}

// ─── Imported Media ──────────────────────────────────────────

export interface ImportedMediaIndexFile {
  version: number
  files: ImportedMediaEntry[]
}

export interface ImportedMediaEntry {
  id: string
  fileName: string
  fileType: string
  fileSize: number
  filePath: string
  createdAt: number
}

// ─── Settings ────────────────────────────────────────────────

export interface AppSettingsFile {
  version: number
  volume: number
  muted: boolean
  playbackRate: number
  showTranscript: boolean
  transcriptLanguage: string
  seekStepSeconds: number
  seekSmallStepSeconds: number
  seekMode: string
  waveformZoom: number
  showWaveform: boolean
  videoSize: string
}

export interface AISettingsFile {
  version: number
  provider: string
  model: string
  baseUrl: string
  temperature: number
  maxTokens: number
  targetLanguage: string
  apiKey?: string
}

export interface LayoutSettingsFile {
  version: number
  showPlayer: boolean
  showWaveform: boolean
  showTranscript: boolean
  showControls: boolean
  transcriptPanelVisible: boolean
  transcriptPanelCollapsed: boolean
  videoPanelVisible: boolean
  videoPanelCollapsed: boolean
  timelinePanelVisible: boolean
  timelinePanelCollapsed: boolean
  isSidebarOpen: boolean
  sidebarWidth: number
  activeSidebarTab: string
}

export interface ThemeSettingsFile {
  version: number
  theme: 'light' | 'dark'
  colors: {
    primary: string
    accent: string
    success: string
    warning: string
    error: string
    info: string
  }
}

// ─── Journal ─────────────────────────────────────────────────

export interface JournalEntry {
  operationId: string
  type: 'write' | 'delete'
  targetPath: string
  beforeChecksum: string | null
  afterChecksum: string | null
  timestamp: number
  status: 'pending' | 'committed' | 'rolled_back'
}

// ─── Health ──────────────────────────────────────────────────

export interface HealthCheckResult {
  manifestOk: boolean
  failedChecksums: string[]
  orphanedReferences: string[]
  corruptedFiles: string[]
  status: 'healthy' | 'degraded' | 'damaged'
}

export interface RecoveryResult {
  success: boolean
  recoveredFiles: string[]
  failedFiles: string[]
  message: string
}

// ─── Migration ───────────────────────────────────────────────

export interface MigrationPayload {
  localStorage: Record<string, string>
  indexedDB: {
    mediaFiles: Array<{
      id: string
      fileData: number[]
      fileType: string
      fileName: string
      fileSize: number
      timestamp: number
    }>
    transcripts: Array<{
      mediaId: string
      segments: unknown[]
      studyBySegment?: Record<string, unknown>
      updatedAt: number
    }>
  }
}

export interface MigrationResult {
  success: boolean
  migratedCounts: Record<string, number>
  errors: string[]
}
