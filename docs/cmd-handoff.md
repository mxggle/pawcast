# Handoff: User Data Persistence System

## Goal

Migrate from scattered storage (electron-store, localStorage, IndexedDB) to unified file-based `LoopMateData/` directory with atomic writes, journaling, snapshots, and repository-based access — per `docs/user-data-persistence-plan.md`.

## What Was Implemented (Phases 0–4)

### Backend (Electron main process)
- **`electron/manifestManager.ts`** — manifest.json load/save with corrupted-file backup, schema version check, atomic write
- **`electron/dataStore.ts`** — core file I/O: readJSON/writeJSON with atomic tmp→fsync→rename flow, readBinary/writeBinary, path sanitization (no traversal), directory switching (`copyDataDir`)
- **`electron/journalManager.ts`** — JSONL append-only journal, `replayCommitted()` and `rollbackPending()` for crash recovery
- **`electron/healthCheck.ts`** — checksum verification, orphan reference detection (indexes point to missing files)
- **`electron/snapshotManager.ts`** — zip-based snapshots (system `zip`), 7 daily + 4 weekly retention, restore
- **`electron/migrationManager.ts`** — idempotent migration from electron-store (`abloop-player-storage` etc.), localStorage, and IndexedDB payloads
- **`electron/main.ts`** — 14 new IPC handlers registered, `ensureDataDir` + `replayCommitted` + `rollbackPending` + `cleanupOldSnapshots` in `app.whenReady()`
- **`electron/preload.ts`** — all data* methods exposed via contextBridge

### Frontend (Renderer)
- **`src/types/persistence.ts`** — all flat data model types (Manifest, MediaHistory, Bookmarks, Transcripts, Recordings, Settings, Journal, Health, Migration)
- **`src/types/electron.d.ts`** — 14 new method signatures on ElectronAPI
- **`src/repositories/dataClient.ts`** — IPC bridge, mirrors `electronStorage.ts` pattern, approved Layer 1 `window.electronAPI` caller
- **8 repositories** (`settingsRepository`, `libraryRepository`, `bookmarkRepository`, `transcriptRepository`, `transcriptStudyRepository`, `glossaryRepository`, `recordingRepository`, `mediaFileRepository`) — each with typed load/save and domain methods
- **`src/utils/migrationBridge.ts`** — collects localStorage + IndexedDB data, triggers migration via IPC
- **7 stores modified** (`playerStore`, `transcriptStore`, `shadowingStore`, `sentencePracticeStore`, `settingsStore`, `themeStore`, `layoutStore`) — dual-write sync (300ms debounce) to repositories while old persistence stays active
- **`docs/platform-architecture.md`** — `dataClient.ts` added to approved `window.electronAPI` callers

### Architecture decision: Dual-write transition
Old persistence (electronStorage/localStorage/IndexedDB) remains active. New repositories write in parallel via debounced `.subscribe()`. After stability confirmed → remove old persistence.

## Files Modified

### Created (19)
```
src/types/persistence.ts
electron/manifestManager.ts
electron/dataStore.ts
electron/journalManager.ts
electron/snapshotManager.ts
electron/healthCheck.ts
electron/migrationManager.ts
src/repositories/dataClient.ts
src/repositories/settingsRepository.ts
src/repositories/libraryRepository.ts
src/repositories/bookmarkRepository.ts
src/repositories/transcriptRepository.ts
src/repositories/transcriptStudyRepository.ts
src/repositories/glossaryRepository.ts
src/repositories/recordingRepository.ts
src/repositories/mediaFileRepository.ts
src/utils/migrationBridge.ts
src/components/electron/DataDirectorySettings.tsx   ← NOT YET
src/components/electron/DataHealthPanel.tsx         ← NOT YET
```

### Modified (11)
```
src/types/electron.d.ts
electron/main.ts
electron/preload.ts
src/stores/playerStore.ts
src/stores/transcriptStore.ts
src/stores/shadowingStore.ts
src/stores/sentencePracticeStore.ts
src/stores/settingsStore.ts
src/stores/themeStore.ts
src/stores/layoutStore.ts
docs/platform-architecture.md
```

## Remaining TODOs

| Priority | Task | Phase |
|----------|------|-------|
| HIGH | `electron/main.ts`: update `getSourceFolders()` and `getHistoryNativePaths()` to dual-read from new data directory (security check compatibility) | 4 |
| HIGH | `src/components/electron/DataDirectorySettings.tsx` — UI for directory management | 6 |
| MEDIUM | `src/components/electron/DataHealthPanel.tsx` — health check results display | 6 |
| MEDIUM | Add `'data'` tab to settings window (currently `'general'`, `'ai'`) | 6 |
| MEDIUM | i18n keys for new UI (en.json, ja.json, zh.json) | 6 |
| LOW | Remove old persistence code after transition stable | cleanup |

## Commands Run

```
npm run build  → ✓ passes
npm run lint   → ✓ 0 errors, 3 pre-existing warnings
```

## Known Risks

1. **Security check regression**: `main.ts` still reads source folders from old `electron-store` only. Must dual-read from `library/media-sources.json` first.
2. **Migration not auto-triggered**: `runMigrationIfNeeded()` exists but isn't called on startup yet — needs integration into app init flow.
3. **SnapshotManager uses system `zip`**: won't work on Windows without zip in PATH. Consider using `archiver` npm package.
4. **Dual-write type casts**: Several `as unknown as Record<string, unknown>` casts in store sync code due to type incompatibilities between old store types and new persistence types. These are intentional for the transitional period.
5. **Recording blobs not auto-migrated**: Binary recording files (from IndexedDB) are only migrated when `runMigrationIfNeeded()` is called — the dual-write sync only saves indexes, not blobs.
