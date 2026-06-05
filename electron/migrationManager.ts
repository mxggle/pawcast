import { configStore } from './configStore'
import { writeJSON, writeBinary } from './dataStore'
import type {
  MigrationPayload,
  MigrationResult,
  MediaHistoryFile,
  BookmarkFile,
  GlossaryFile,
  MediaSourcesFile,
  MediaFoldersFile,
  PersistedBookmark,
  PersistedGlossaryEntry,
  MediaHistoryItem,
  MediaFolderEntry,
  ShadowingIndexFile,
  PersistedShadowingSegment,
  SentencePracticeIndexFile,
  PersistedSentenceRecording,
  TranscriptFile,
  TranscriptStudyFile,
  PersistedSegmentStudy,
  PersistedTranscriptSegment,
  AppSettingsFile,
  LayoutSettingsFile,
  ThemeSettingsFile,
  AISettingsFile,
} from '../src/types/persistence'
import { loadManifest, saveManifest } from './manifestManager'

interface ZustandPersistBlob {
  state: Record<string, unknown>
  version: number
}

export async function runMigration(
  dataDir: string,
  payload: MigrationPayload,
): Promise<MigrationResult> {
  const result: MigrationResult = {
    success: true,
    migratedCounts: {},
    errors: [],
  }

  // Migrate electron-store data
  try {
    await migrateElectronStore(dataDir, result)
  } catch (err) {
    result.errors.push(`electron-store: ${err instanceof Error ? err.message : String(err)}`)
  }

  // Migrate localStorage data
  try {
    await migrateLocalStorage(dataDir, payload, result)
  } catch (err) {
    result.errors.push(`localStorage: ${err instanceof Error ? err.message : String(err)}`)
  }

  // Migrate IndexedDB data
  try {
    await migrateIndexedDB(dataDir, payload, result)
  } catch (err) {
    result.errors.push(`IndexedDB: ${err instanceof Error ? err.message : String(err)}`)
  }

  result.success = result.errors.length === 0

  // Update manifest
  const manifest = loadManifest(dataDir)
  manifest.migrationStatus = result.success ? 'completed' : 'failed'
  await saveManifest(dataDir, manifest)

  return result
}

function parseZustandState(raw: string | undefined): ZustandPersistBlob | null {
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

async function migrateElectronStore(
  dataDir: string,
  result: MigrationResult,
): Promise<void> {
  // Player store (abloop-player-storage)
  const playerRaw = configStore.get('abloop-player-storage') as string | undefined
  const player = parseZustandState(playerRaw)
  const state = player?.state

  if (state) {
    // Media history
    if (Array.isArray(state.mediaHistory)) {
      const items = state.mediaHistory as MediaHistoryItem[]
      const existing = await loadExisting<MediaHistoryFile>(dataDir, 'library/media-history.json')
      const existingIds = new Set((existing?.items || []).map(i => i.id))
      const newItems = items.filter(i => !existingIds.has(i.id))
      if (newItems.length > 0) {
        const allItems = [...(existing?.items || []), ...newItems]
        await writeJSON(dataDir, 'library/media-history.json', { version: 1, items: allItems })
        result.migratedCounts['mediaHistory'] = newItems.length
      }
    }

    // Bookmarks
    if (state.mediaBookmarks && typeof state.mediaBookmarks === 'object') {
      const bookmarksMap = state.mediaBookmarks as Record<string, PersistedBookmark[]>
      const allBookmarks: PersistedBookmark[] = []
      for (const key of Object.keys(bookmarksMap)) {
        allBookmarks.push(...bookmarksMap[key])
      }
      if (allBookmarks.length > 0) {
        const existing = await loadExisting<BookmarkFile>(dataDir, 'study/bookmarks.json')
        const existingIds = new Set((existing?.bookmarks || []).map(b => b.id))
        const newBookmarks = allBookmarks.filter(b => !existingIds.has(b.id))
        if (newBookmarks.length > 0) {
          await writeJSON(dataDir, 'study/bookmarks.json', {
            version: 1,
            bookmarks: [...(existing?.bookmarks || []), ...newBookmarks],
          })
          result.migratedCounts['bookmarks'] = newBookmarks.length
        }
      }
    }

    // Glossary
    if (Array.isArray(state.glossaryEntries)) {
      const entries = state.glossaryEntries as PersistedGlossaryEntry[]
      const existing = await loadExisting<GlossaryFile>(dataDir, 'study/glossary.json')
      const existingIds = new Set((existing?.entries || []).map(e => e.id))
      const newEntries = entries.filter(e => !existingIds.has(e.id))
      if (newEntries.length > 0) {
        await writeJSON(dataDir, 'study/glossary.json', {
          version: 1,
          entries: [...(existing?.entries || []), ...newEntries],
        })
        result.migratedCounts['glossary'] = newEntries.length
      }
    }

    // Source folders
    if (Array.isArray(state.sourceFolders)) {
      const folders = state.sourceFolders as string[]
      await writeJSON(dataDir, 'library/media-sources.json', { version: 1, folders })
    }

    // Media folders
    if (Array.isArray(state.mediaFolders)) {
      const folders = state.mediaFolders as MediaFolderEntry[]
      await writeJSON(dataDir, 'library/media-folders.json', { version: 1, folders })
    }

    // Sidebar state merged into layout
    if (typeof state.isSidebarOpen === 'boolean') {
      const layout = await loadExisting<LayoutSettingsFile>(dataDir, 'settings/layout-settings.json')
      if (!layout || layout.isSidebarOpen === undefined) {
        await writeJSON(dataDir, 'settings/layout-settings.json', {
          version: 1,
          showPlayer: true, showWaveform: true, showTranscript: true, showControls: true,
          transcriptPanelVisible: true, transcriptPanelCollapsed: false,
          videoPanelVisible: true, videoPanelCollapsed: false,
          timelinePanelVisible: true, timelinePanelCollapsed: false,
          isSidebarOpen: state.isSidebarOpen as boolean,
          sidebarWidth: (state.sidebarWidth as number) || 320,
          activeSidebarTab: (state.activeSidebarTab as string) || 'history',
        })
      }
    }
  }

  // Settings store (abloop-settings-storage)
  const settingsRaw = configStore.get('abloop-settings-storage') as string | undefined
  const settings = parseZustandState(settingsRaw)?.state
  if (settings) {
    const appSettings: AppSettingsFile = {
      version: 1,
      volume: (settings.volume as number) ?? 1,
      muted: (settings.muted as boolean) ?? false,
      playbackRate: (settings.playbackRate as number) ?? 1,
      showTranscript: (settings.showTranscript as boolean) ?? true,
      transcriptLanguage: (settings.transcriptLanguage as string) ?? 'en',
      seekStepSeconds: (settings.seekStepSeconds as number) ?? 5,
      seekSmallStepSeconds: 1,
      seekMode: (settings.seekMode as string) ?? 'relative',
      waveformZoom: (settings.waveformZoom as number) ?? 1,
      showWaveform: (settings.showWaveform as boolean) ?? true,
      videoSize: (settings.videoSize as string) ?? 'md',
    }
    await writeJSON(dataDir, 'settings/app-settings.json', appSettings)
  }

  // Theme store (theme-storage)
  const themeRaw = configStore.get('theme-storage') as string | undefined
  const theme = parseZustandState(themeRaw)?.state
  if (theme) {
    const themeSettings: ThemeSettingsFile = {
      version: 1,
      theme: (theme.theme as 'light' | 'dark') || 'dark',
      colors: {
        primary: (theme.colors as any)?.primary || '#a855f7',
        accent: (theme.colors as any)?.accent || '#22d3ee',
        success: (theme.colors as any)?.success || '#22c55e',
        warning: (theme.colors as any)?.warning || '#f59e0b',
        error: (theme.colors as any)?.error || '#ef4444',
        info: (theme.colors as any)?.info || '#3b82f6',
      },
    }
    await writeJSON(dataDir, 'settings/theme-settings.json', themeSettings)
  }

  // Layout store (layout-storage)
  const layoutRaw = configStore.get('layout-storage') as string | undefined
  const layout = parseZustandState(layoutRaw)?.state
  if (layout) {
    const layoutSettings: LayoutSettingsFile = {
      version: 1,
      showPlayer: (layout.showPlayer as boolean) ?? true,
      showWaveform: (layout.showWaveform as boolean) ?? true,
      showTranscript: (layout.showTranscript as boolean) ?? true,
      showControls: (layout.showControls as boolean) ?? true,
      transcriptPanelVisible: (layout.transcriptPanelVisible as boolean) ?? true,
      transcriptPanelCollapsed: (layout.transcriptPanelCollapsed as boolean) ?? false,
      videoPanelVisible: (layout.videoPanelVisible as boolean) ?? true,
      videoPanelCollapsed: (layout.videoPanelCollapsed as boolean) ?? false,
      timelinePanelVisible: (layout.timelinePanelVisible as boolean) ?? true,
      timelinePanelCollapsed: (layout.timelinePanelCollapsed as boolean) ?? false,
      isSidebarOpen: (layout.isSidebarOpen as boolean) ?? true,
      sidebarWidth: (layout.sidebarWidth as number) ?? 320,
      activeSidebarTab: 'history',
    }
    await writeJSON(dataDir, 'settings/layout-settings.json', layoutSettings)
  }
}

async function migrateLocalStorage(
  dataDir: string,
  payload: MigrationPayload,
  result: MigrationResult,
): Promise<void> {
  // Shadowing store
  const shadowRaw = payload.localStorage?.['shadowing-store']
  if (shadowRaw) {
    try {
      const parsed = JSON.parse(shadowRaw)
      const state = parsed?.state
      if (state?.sessions && typeof state.sessions === 'object') {
        const sessions = state.sessions as Record<string, { segments: Array<PersistedShadowingSegment & { storageId?: string }> }>
        const allSegments: PersistedShadowingSegment[] = []
        for (const key of Object.keys(sessions)) {
          const session = sessions[key]
          if (Array.isArray(session.segments)) {
            for (const seg of session.segments) {
              const storageId = seg.storageId || seg.filePath || seg.id
              const filePath = await migrateIndexedRecordingFile(
                dataDir,
                payload,
                storageId,
                'recordings/shadowing/files',
              )
              if (!filePath) {
                result.errors.push(`shadowing recording file missing: ${storageId}`)
                continue
              }

              allSegments.push({
                id: seg.id,
                mediaId: seg.mediaId || key,
                startTime: seg.startTime,
                duration: seg.duration,
                filePath,
                fileOffset: seg.fileOffset || 0,
                segmentId: seg.segmentId,
                peaks: seg.peaks || [],
                peakTimes: seg.peakTimes || [],
                createdAt: seg.createdAt || Date.now(),
              })
            }
          }
        }
        if (allSegments.length > 0) {
          const existing = await loadExisting<ShadowingIndexFile>(
            dataDir,
            'recordings/shadowing/index.json',
          )
          const existingSegments = existing?.segments || []
          const mergedSegments = mergeById(existingSegments, allSegments)
          if (mergedSegments.changed) {
            await writeJSON(dataDir, 'recordings/shadowing/index.json', {
              version: 1,
              segments: mergedSegments.items,
            })
            result.migratedCounts['shadowingSegments'] = allSegments.length
          }
        }
      }
    } catch (err) {
      result.errors.push(`shadowing-store parse: ${String(err)}`)
    }
  }

  // Sentence practice store
  const sentenceRaw = payload.localStorage?.['sentence-practice-store']
  if (sentenceRaw) {
    try {
      const parsed = JSON.parse(sentenceRaw)
      const state = parsed?.state
      if (state?.recordings && typeof state.recordings === 'object') {
        const recordings = state.recordings as Record<string, Array<PersistedSentenceRecording & { storageId?: string }>>
        const allRecordings: PersistedSentenceRecording[] = []
        for (const key of Object.keys(recordings)) {
          const recs = recordings[key]
          if (Array.isArray(recs)) {
            for (const rec of recs) {
              const storageId = rec.storageId || rec.filePath || rec.id
              const filePath = await migrateIndexedRecordingFile(
                dataDir,
                payload,
                storageId,
                'recordings/sentence-practice/files',
              )
              if (!filePath) {
                result.errors.push(`sentence recording file missing: ${storageId}`)
                continue
              }

              allRecordings.push({
                id: rec.id,
                mediaId: rec.mediaId || key,
                sentenceIndex: rec.sentenceIndex,
                filePath,
                duration: rec.duration,
                createdAt: rec.createdAt || Date.now(),
                peaks: rec.peaks || [],
              })
            }
          }
        }
        if (allRecordings.length > 0) {
          const existing = await loadExisting<SentencePracticeIndexFile>(
            dataDir,
            'recordings/sentence-practice/index.json',
          )
          const existingRecordings = existing?.recordings || []
          const mergedRecordings = mergeById(existingRecordings, allRecordings)
          if (mergedRecordings.changed) {
            await writeJSON(dataDir, 'recordings/sentence-practice/index.json', {
              version: 1,
              recordings: mergedRecordings.items,
            })
            result.migratedCounts['sentenceRecordings'] = allRecordings.length
          }
        }
      }
    } catch (err) {
      result.errors.push(`sentence-practice-store parse: ${String(err)}`)
    }
  }
}

async function migrateIndexedDB(
  dataDir: string,
  payload: MigrationPayload,
  result: MigrationResult,
): Promise<void> {
  // Media files → binary files
  const mediaFiles = payload.indexedDB?.mediaFiles
  if (Array.isArray(mediaFiles)) {
    const recordingStorageIds = collectRecordingStorageIds(payload)
    const existing = await loadExisting<{ version: number; files: { id: string; fileName: string; fileType: string; fileSize: number; filePath: string; createdAt: number }[] }>(
      dataDir,
      'media/imported/index.json',
    )
    const existingIds = new Set((existing?.files || []).map(f => f.id))
    let importedCount = 0

    for (const mf of mediaFiles) {
      if (recordingStorageIds.has(mf.id)) continue
      if (existingIds.has(mf.id)) continue

      const ext = mf.fileType?.split('/')?.[1] || 'bin'
      const filePath = `media/imported/files/${mf.id}.${ext}`
      const buf = Buffer.from(mf.fileData)
      await writeBinary(dataDir, filePath, toArrayBuffer(buf))

      importedCount++
    }

    if (importedCount > 0) {
      const newFiles = mediaFiles
        .filter(mf => !recordingStorageIds.has(mf.id) && !existingIds.has(mf.id))
        .map(mf => ({
          id: mf.id,
          fileName: mf.fileName,
          fileType: mf.fileType,
          fileSize: mf.fileSize,
          filePath: `media/imported/files/${mf.id}.${mf.fileType?.split('/')?.[1] || 'bin'}`,
          createdAt: mf.timestamp || Date.now(),
        }))

      await writeJSON(dataDir, 'media/imported/index.json', {
        version: 1,
        files: [...(existing?.files || []), ...newFiles],
      })
      result.migratedCounts['importedMedia'] = importedCount
    }
  }

  // Transcripts → JSON files
  const transcripts = payload.indexedDB?.transcripts
  if (Array.isArray(transcripts)) {
    let transcriptCount = 0

    for (const t of transcripts) {
      if (!t.mediaId) continue

      const segments = (t.segments || []) as PersistedTranscriptSegment[]
      const studyBySegment = t.studyBySegment as Record<string, PersistedSegmentStudy> | undefined

      if (segments.length > 0) {
        await writeJSON(dataDir, `study/transcripts/${t.mediaId}.json`, {
          version: 1,
          mediaId: t.mediaId,
          updatedAt: t.updatedAt || Date.now(),
          segments,
        })
        transcriptCount++
      }

      if (studyBySegment) {
        const segmentStudies: PersistedSegmentStudy[] = []
        for (const key of Object.keys(studyBySegment)) {
          const study = studyBySegment[key]
          if (study) {
            segmentStudies.push({
              segmentId: study.segmentId || key,
              levelSystem: study.levelSystem || 'cefr',
              updatedAt: study.updatedAt || Date.now(),
              items: study.items || [],
            })
          }
        }

        if (segmentStudies.length > 0) {
          await writeJSON(dataDir, `study/transcript-study/${t.mediaId}.json`, {
            version: 1,
            mediaId: t.mediaId,
            updatedAt: t.updatedAt || Date.now(),
            segmentStudies,
          })
        }
      }
    }

    if (transcriptCount > 0) {
      result.migratedCounts['transcripts'] = transcriptCount
    }
  }
}

async function loadExisting<T>(dataDir: string, relativePath: string): Promise<T | null> {
  const { readJSON } = await import('./dataStore')
  return readJSON<T>(dataDir, relativePath)
}

async function migrateIndexedRecordingFile(
  dataDir: string,
  payload: MigrationPayload,
  storageId: string | undefined,
  targetDir: string,
): Promise<string | null> {
  if (!storageId) return null

  const mediaFile = payload.indexedDB?.mediaFiles?.find((file) => file.id === storageId)
  if (!mediaFile) return null

  const filePath = `${targetDir}/${storageId}`
  const buf = Buffer.from(mediaFile.fileData)
  await writeBinary(dataDir, filePath, toArrayBuffer(buf))
  return filePath
}

function toArrayBuffer(buf: Buffer): ArrayBuffer {
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer
}

function mergeById<T extends { id: string }>(
  existing: T[],
  incoming: T[],
): { items: T[]; changed: boolean } {
  let changed = false
  const byId = new Map(existing.map((item) => [item.id, item]))

  for (const item of incoming) {
    const previous = byId.get(item.id)
    if (!previous || JSON.stringify(previous) !== JSON.stringify(item)) {
      byId.set(item.id, item)
      changed = true
    }
  }

  return { items: Array.from(byId.values()), changed }
}

function collectRecordingStorageIds(payload: MigrationPayload): Set<string> {
  const ids = new Set<string>()
  collectShadowingStorageIds(payload.localStorage?.['shadowing-store'], ids)
  collectSentenceStorageIds(payload.localStorage?.['sentence-practice-store'], ids)
  return ids
}

function collectShadowingStorageIds(raw: string | undefined, ids: Set<string>): void {
  if (!raw) return
  try {
    const state = JSON.parse(raw)?.state
    const sessions = state?.sessions
    if (!sessions || typeof sessions !== 'object') return

    for (const session of Object.values(sessions) as Array<{ segments?: Array<PersistedShadowingSegment & { storageId?: string }> }>) {
      if (!Array.isArray(session?.segments)) continue
      for (const segment of session.segments) {
        const storageId = segment.storageId || segment.filePath || segment.id
        if (storageId) ids.add(storageId)
      }
    }
  } catch {
    // Parse errors are reported by the main localStorage migration path.
  }
}

function collectSentenceStorageIds(raw: string | undefined, ids: Set<string>): void {
  if (!raw) return
  try {
    const state = JSON.parse(raw)?.state
    const recordings = state?.recordings
    if (!recordings || typeof recordings !== 'object') return

    for (const recs of Object.values(recordings) as Array<Array<PersistedSentenceRecording & { storageId?: string }>>) {
      if (!Array.isArray(recs)) continue
      for (const recording of recs) {
        const storageId = recording.storageId || recording.filePath || recording.id
        if (storageId) ids.add(storageId)
      }
    }
  } catch {
    // Parse errors are reported by the main localStorage migration path.
  }
}
