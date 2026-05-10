# Plan: Finish User Data Persistence Remaining TODOs

## Overview

Six remaining items from `docs/cmd-handoff.md` — security check dual-read, two UI components, settings tab, i18n keys, and migration auto-trigger.

---

## 1. Dual-read security check in `electron/main.ts`

**Files**: `electron/main.ts`

**Change**: Make `getSourceFolders()` and `getHistoryNativePaths()` read from the new file-based persistence first (via `readJSON`), fall back to `electron-store`. Both become `async` since `readJSON` returns a Promise.

Same pattern for `getHistoryNativePaths()` — reads `library/media-history.json` first, maps `.items` to `.nativePath`, then falls back.

The callers in `assertPathInSourceFolders()` already use `await`, so they just work — no caller changes needed except `const sourceFolders = await getSourceFolders()`.

---

## 2. Data health check results panel

**New file**: `src/components/settings/DataHealthPanel.tsx`

**Pattern**: Model after `GeneralSettingsPanel` — uses `SettingsSection`, `Card`, `CardContent`, `SettingsRow`.

**Features**:
- Calls `window.electronAPI?.dataHealthCheck()` on mount
- Displays: status badge (healthy=green, degraded=yellow, damaged=red)
- Lists: `failedChecksums`, `orphanedReferences`, `corruptedFiles` in expandable sections
- Recovery buttons: "Replay Journal", "Restore Snapshot", "Re-migrate"
- Shows `manifestOk` status
- If not Electron: shows "Available in desktop app" message

---

## 3. Data directory management UI

**New file**: `src/components/electron/DataDirectorySettings.tsx`

**Layer**: Layer 3 (platform-specific UI — uses `window.electronAPI`)

**Features**:
- Displays current data directory path (from `dataGetDirectory()`)
- "Change Directory" button → native folder dialog → `dataChangeDirectory()`
- Shows directory size / file count
- "Export Snapshot" button → `dataExportSnapshot()`
- "Import Snapshot" button → file dialog → `dataImportSnapshot()`
- Confirmation dialog before directory change

---

## 4. Add `'data'` tab to settings

**Files to modify (7)**:

| File | Change |
|------|--------|
| `src/components/settings/SettingsSidebar.tsx` | `SettingsTab = "general" \| "ai" \| "data"` |
| `src/components/settings/SettingsWorkspace.tsx` | Add "data" nav item (Database icon), render `<DataSettingsPanel />` branch, update `parseSearch` |
| `src/utils/settingsIntents.ts` | `SettingsIntentTab = "general" \| "ai" \| "data"` |
| `src/types/electron.d.ts` | `SettingsWindowTab = 'general' \| 'ai' \| 'data'` |
| `electron/main.ts` (line 48) | `type SettingsWindowTab = 'general' \| 'ai' \| 'data'` |
| `electron/preload.ts` (line 4) | `type SettingsWindowTab = 'general' \| 'ai' \| 'data'` |
| `src/pages/ElectronSettingsWindowPage.tsx` | Handle "data" tab subtitle |

**New file**: `src/components/settings/DataSettingsPanel.tsx`

Wraps `DataHealthPanel` + `DataDirectorySettings` (gated on `window.electronAPI`). Modeled after `GeneralSettingsPanel`.

---

## 5. i18n keys

**Keys to add to `en.json`, `ja.json`, `zh.json`** under `settingsPage`:

```
data.title, data.description, data.directory, data.currentDirectory,
data.changeDirectory, data.changeDirectoryDescription, data.changeDirectoryConfirm,
data.directorySize, data.fileCount, data.healthCheck, data.runHealthCheck,
data.healthStatus, data.healthy, data.degraded, data.damaged,
data.manifestStatus, data.manifestOk, data.manifestCorrupt,
data.failedChecksums, data.orphanedReferences, data.corruptedFiles,
data.noIssues, data.recovery, data.replayJournal, data.restoreSnapshot,
data.remigrate, data.recoverySuccess, data.recoveryFailed,
data.snapshots, data.exportSnapshot, data.importSnapshot,
data.exportSuccess, data.importSuccess, data.electronOnly
```

Plus `settingsPage.tabs.data`.

---

## 6. Auto-trigger migration on startup

**File**: `src/components/electron/ElectronAppLayout.tsx`

Add a `useEffect` that calls `runMigrationIfNeeded()` once on mount via dynamic `import()`. The `dataIsMigrated` check prevents re-runs.

---

## Implementation Order

1. Dual-read security check (main.ts)
2. i18n keys (3 locale files)
3. DataHealthPanel + DataDirectorySettings
4. DataSettingsPanel
5. Settings tab wiring (7 files)
6. Migration auto-trigger
7. Build + lint
