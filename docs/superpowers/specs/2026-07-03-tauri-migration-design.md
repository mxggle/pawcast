# Pawcast Electron-to-Tauri Migration Design

**Date:** 2026-07-03
**Status:** Approved architecture; pending written-spec review

## Objective

Replace the Electron desktop runtime with Tauri 2 while preserving Pawcast's
current React user experience and the standalone Vite web build. Every page,
component, store, repository, native capability, and persisted-data workflow
must continue to work. The completed repository must not contain an Electron
runtime, Electron dependencies, Electron build configuration, or renderer code
that depends on `window.electronAPI`.

The migration is a behavioral port, not a visual redesign. Existing UX and
business rules remain authoritative unless a platform limitation requires a
documented equivalent.

## Agreed Product Decisions

- Tauri 2 replaces Electron as the only desktop runtime.
- The standalone Vite web build remains supported.
- Existing Electron data is migrated automatically and non-destructively.
- The supported desktop upgrade source is the audited current release,
  `1.0.0-beta.3`, or a later Electron release using the same schema. Older
  installs must first run the current Electron release once so its existing
  renderer migration writes browser-only data into `PawcastData`.
- macOS, Windows, and Linux remain supported desktop targets.
- Waveform generation uses packaged FFmpeg and FFprobe sidecars in release
  builds, with explicit development-time discovery and actionable errors.
- Existing React pages, Zustand state, persistence schemas, translations, and
  interaction patterns are preserved.
- The eight currently failing tests are corrected as part of the migration;
  they are not accepted as baseline failures in the completed system.

## Current-State Audit

The Electron integration currently contains approximately 2,891 lines in
`electron/`, 2,178 lines in `src/components/electron/`, and 31 IPC handlers or
event bridges. The native surface includes:

- main, settings, and glossary windows;
- file and folder dialogs;
- reveal-in-file-manager behavior;
- local media enumeration, recursive trees, path approval, and directory
  watching;
- renderer configuration persistence and cross-window change notifications;
- provider HTTP requests that bypass browser CORS restrictions;
- FFmpeg/FFprobe waveform analysis, progress events, cache metadata, level
  reads, and deletion;
- JSON and binary data persistence;
- configurable data-directory movement;
- journaling, manifests, checksums, health checks, and recovery;
- migration from Electron Store, localStorage, and IndexedDB;
- a custom `local-media://` protocol for seekable media playback.

Baseline verification on 2026-07-03:

- `npm run build`: passes with existing bundle-size warnings.
- `npm run build:electron`: passes with existing bundle-size warnings.
- `npm run lint`: passes.
- `node --import tsx --test tests/*.test.ts tests/*.test.mjs`: 72 of 80
  tests pass. Failures include direct `window` use in `aiService`, a test that
  requires an unset module environment variable, and stale layout assertions.

## Architecture

### Layer 1: Core and contracts

Pure types, repository interfaces, persistence schemas, media algorithms, and
business rules remain under `src/types`, `src/repositories`, `src/services`,
and `src/utils`. They must not import Tauri or web-platform adapters.

The native contract becomes `DesktopAPI` in `src/platform/desktop/types.ts`.
It describes capabilities rather than transport details. It covers dialogs,
windows, filesystem operations, configuration, HTTP, waveform operations,
data operations, migration, and events. The contract uses existing domain
types wherever possible.

### Layer 2: Runtime adapters

`src/platform/desktop/tauriDesktop.ts` implements `DesktopAPI` using Tauri
commands, channels, events, and official plugins. `src/platform/web/` contains
the browser implementations required by the standalone Vite build. Runtime
selection occurs in one platform module using Tauri's injected globals rather
than scattered runtime checks.

Shared stores, repositories, services, and hooks consume injected capability
functions. They never import `@tauri-apps/*` directly and never read a Tauri
global. This preserves testability and prevents another platform-specific API
from leaking through the application.

### Layer 3: Platform UI

Electron-specific UI moves from `src/components/electron/` to
`src/components/desktop/` and is renamed by behavior:

- `ElectronAppLayout` becomes `DesktopAppLayout`.
- `ElectronFileOpener` becomes `DesktopFileOpener`.
- data, health, folder, history, settings-window, and glossary-window
  components retain their product responsibilities but use `DesktopAPI`.

Web-specific components remain under `src/components/web/`. Cross-imports
between desktop and web directories remain forbidden.

### Layer 4: Entry points

`AppLayout`, `HomePage`, and the router remain the platform selectors. Desktop
auxiliary routes are renamed from Electron terminology while preserving route
compatibility during migration. Tauri creates settings and glossary webview
windows with stable labels and routes. Pages continue to consume `AppLayout`
rather than importing a platform layout directly.

### Native backend

`src-tauri/src/` is split into focused Rust modules:

- `commands/dialogs.rs`: file and folder selection.
- `commands/windows.rs`: open, focus, close, and navigate desktop windows.
- `commands/filesystem.rs`: approved paths, media trees, watching, and reveal.
- `commands/config.rs`: durable key/value state and change events.
- `commands/http.rs`: validated outbound provider requests.
- `commands/waveform.rs`: waveform job control, cache reads, and deletion.
- `commands/data.rs`: JSON/binary persistence and data-directory management.
- `commands/migration.rs`: browser and Electron migration orchestration.
- `persistence/`: manifest, journal, health, recovery, and atomic file helpers.
- `media/`: FFmpeg probing, waveform extraction, binary cache encoding, and
  secure media protocol support.
- `state.rs`: shared application state, watcher registry, approved-path set,
  data-directory lock, and waveform job registry.
- `error.rs`: serializable error codes and safe user-facing messages.

No single Rust command module should reproduce the current 980-line Electron
main file. Modules expose narrow functions with unit-testable pure helpers.

## Capability Mapping

| Existing Electron capability | Tauri design |
|---|---|
| `dialog:openFile`, `dialog:openFolder` | Tauri dialog plugin behind `DesktopAPI` |
| settings/glossary `BrowserWindow` | Labeled Tauri webview windows |
| `window:navigateInMain` | Tauri event addressed to the main window |
| `shell:showInFileManager` | Tauri opener reveal command with validated path |
| media tree listing | Rust directory traversal with existing extension rules |
| media tree watcher | Rust `notify` watcher registry emitting debounced events |
| Electron Store configuration | Rust JSON store with atomic writes and change events |
| Electron `net.fetch` | Rust HTTP command with allowlisted schemes and sanitized responses |
| waveform IPC | Rust-managed FFmpeg/FFprobe sidecar jobs and Tauri channels/events |
| data IPC | Rust persistence modules preserving current file schema |
| `local-media://` | Tauri custom protocol with approved paths and byte-range responses |
| preload bridge | Typed `DesktopAPI` adapter; no preload script |

## Data and Configuration

### Canonical data schema

The existing `PawcastData` directory layout and schema version 1 remain
canonical. Tauri ports the current atomic-write, manifest, checksum, journal,
health-check, and recovery semantics. File paths stored in indexes remain
relative to the active data directory. Native media source paths remain native
absolute paths because the user chose them explicitly.

All mutating data commands are serialized per active data directory. Each
write follows this sequence:

1. validate and resolve the relative path inside the active data directory;
2. append a pending journal entry;
3. write and sync a uniquely named temporary file;
4. atomically replace the destination;
5. update and atomically save the manifest checksum;
6. append the committed journal entry;
7. emit a typed change event where consumers require rehydration.

### Electron migration

On the first Tauri launch, migration examines the OS-specific Electron user
data locations associated with Pawcast and `com.pawcast.app`. It reads the
Electron `.pawcast-datadir` pointer and `app-config.json` when present. The
current Electron release already migrates its Chromium localStorage and
IndexedDB records into the canonical directory during normal startup. Tauri
therefore migrates the supported `1.0.0-beta.3` upgrade source without trying
to decode Chromium's private LevelDB/IndexedDB files. The process then:

1. detects whether an existing `PawcastData` directory already contains a
   valid manifest;
2. reuses that directory in place when safe, avoiding a large duplicate copy;
3. imports Electron Store values not already represented by canonical files;
4. imports browser storage from the current renderer only when canonical files
   do not already contain the same stable IDs; this supports the Vite web data
   flow but is not presented as an Electron Chromium-profile reader;
5. records migration source, timestamp, counts, and completion status;
6. leaves all Electron source files untouched;
7. allows a failed migration to be retried after displaying the exact failing
   stage and preserving all successfully written canonical data.

Migration is idempotent. Stable IDs and existing canonical records prevent
duplicates. A newer canonical file always wins over a legacy value.

### Configuration synchronization

Zustand persistence continues to use a `StateStorage` implementation. On
desktop it delegates to the Tauri configuration commands; on web it uses
browser storage. Config writes are atomic. A Tauri event containing the
changed key triggers the existing targeted store-rehydration logic across all
windows.

## Filesystem and Media Security

User-selected files and directories become approved roots held in Rust state.
Persisted source folders are re-approved after existence and canonicalization
checks on launch. Every media enumeration, watcher, waveform, reveal, and
protocol request must resolve to an approved file or a descendant of an
approved directory.

Path comparison uses canonical filesystem paths and platform-aware behavior.
Path traversal, symlink escapes, unsupported URL schemes, and unapproved paths
return structured errors. The custom media protocol implements `Range`
requests, content length, media MIME types, and partial-content responses so
audio/video seeking behaves like the Electron protocol.

Directory watchers are owned by a window label and automatically removed when
that window closes. Replacing a watched folder removes the old watcher first.
Events are debounced and contain the watched folder plus the changed path when
available.

## Waveform Processing

The Rust waveform service preserves the current public metadata and level
formats so `WaveformLoader`, `WaveformRenderer`, and the React waveform UI need
no behavioral rewrite.

For each media ID, the service:

1. validates the media path and cache key;
2. probes for an audio stream with FFprobe;
3. decodes mono floating-point PCM with the packaged FFmpeg sidecar;
4. computes min, max, and RMS peaks at the existing resolution levels;
5. writes level files and metadata atomically under `cache/waveform`;
6. streams bounded progress updates to the requesting window;
7. supports cancellation and removes incomplete temporary files;
8. returns a typed `no_audio_stream` error for silent video files so the
   renderer can fall back to its existing AudioContext behavior where valid.

Development builds search configured sidecars first and then the local PATH.
Release builds use target-specific packaged sidecars. Packaging validation
fails if either executable is missing. Sidecar licenses and notices ship with
the application artifacts.

## Windows and Navigation

The desktop runtime owns three window labels: `main`, `settings`, and
`glossary`. Opening an existing auxiliary window focuses it and navigates it to
the requested route or section instead of creating a duplicate. Closing an
auxiliary window releases its watchers and event listeners.

Main-window navigation is emitted as a typed event and handled by the router
adapter. Settings and glossary routes retain their current content and window
chrome behavior. The standalone web build renders the corresponding pages in
the main browser window.

## Network Requests

Desktop provider requests go through a Rust HTTP command to preserve behavior
for endpoints that reject browser CORS requests. The command accepts only
`http` and `https`, rejects credentials embedded in URLs, limits response size,
and returns status, headers, and text data in the shape currently expected by
`aiService` and `transcriptionService`.

Provider keys remain in the existing persisted settings for compatibility in
this migration. Moving secrets into the OS keychain is outside this migration
because it changes backup and cross-window semantics; it should be addressed
as a separate security project.

The web build keeps its current Vite proxy/browser request behavior. Services
select transport through an injected fetch function and do not inspect global
desktop objects.

## UI and Component Migration

The migration must preserve the behavior of every current route:

- `/`: source folders, file opening, drag and drop, recent history, and
  YouTube submission;
- `/player`: local and YouTube playback, persistent media mounting, A-B loops,
  timeline, waveform, bookmarks, transcript, selection explanations, panel
  resizing, keyboard shortcuts, and navigation;
- `/sentence-practice`: segment navigation, recording, playback, saving, and
  deletion;
- `/settings`: general, AI, appearance, playback, and data settings;
- `/glossary`: glossary search, navigation, and deletion;
- desktop settings and glossary auxiliary-window routes.

Component changes are mechanical where possible: imports, platform facade
calls, names, drag-and-drop path extraction, and window actions. Shared media,
recording, transcript, controls, and UI primitive components retain their
public props. Any prop or state-shape change requires a focused regression
test proving equivalent behavior.

User-facing references to Electron become “desktop app” or Tauri-specific copy
only where the runtime name is genuinely useful. Copy changes must update
English, Japanese, and Chinese locale files together.

## Error Model

Rust commands return a serializable error with:

- a stable code such as `path_not_approved`, `no_audio_stream`,
  `migration_failed`, or `sidecar_missing`;
- a safe user-facing message;
- an optional operation and retryability flag;
- diagnostic detail logged in Rust but excluded from renderer responses when
  it contains filesystem or credential data.

The TypeScript adapter maps rejected commands into `DesktopError` and retains
the code. UI flows display translated actionable messages, clear loading
states in `finally` blocks, and preserve prior valid state. Background watcher
and progress-channel failures log once and offer a direct retry when they stop
a visible workflow.

## Testing and Verification

### Automated tests

- Rust unit tests cover path containment, symlink escape prevention, data-path
  sanitization, atomic file replacement, manifest checksums, journal replay,
  migration precedence/idempotency, media filtering/sorting, byte ranges,
  waveform peak calculation, and error serialization.
- Rust integration tests use temporary directories for data CRUD, directory
  movement, health checks, recovery, Electron fixture migration, watcher
  events, and waveform cache lifecycle.
- TypeScript tests cover runtime selection, every `DesktopAPI` method mapping,
  event unsubscribe behavior, store synchronization, service transport, and
  web fallback behavior.
- Existing player, transcript, waveform, layout, and persistence tests remain
  and are updated only when an assertion is demonstrably stale.
- Browser-driven smoke tests cover every route in web and Tauri development
  modes. Native smoke tests exercise window creation, dialogs through test
  seams, local media playback/seek, folder watching, recording permissions,
  saved recording playback, settings synchronization, and glossary-to-player
  navigation.

### Build matrix

The completion gate includes:

- TypeScript type checking and Vite production build;
- ESLint with zero warnings;
- all Node/TypeScript tests passing through a documented `npm test` script;
- `cargo fmt --check`, `cargo clippy --all-targets --all-features -- -D warnings`,
  and `cargo test`;
- `tauri build --no-bundle` on the development platform;
- packaging configuration and sidecar presence validation for macOS, Windows,
  and Linux in CI;
- searches proving no Electron packages, source directories, configuration,
  globals, or runtime imports remain.

### Manual acceptance matrix

At least one representative audio file, video file with audio, video file
without audio, YouTube item, transcript, and saved recording is exercised.
The matrix verifies:

- open, drag/drop, folder tree, search/sort, reveal, and live folder refresh;
- play, pause, seek, volume, rate, mute, A-B loop, and keyboard controls;
- waveform generation, progress, zoom, cache reuse, and fallback;
- transcript upload/render/navigation, AI transcription, explanations, and
  glossary creation;
- shadowing and sentence recording, permission denial, save, reload, play,
  and delete;
- bookmarks, history, source folders, layout, theme, language, and AI settings
  surviving restart;
- auxiliary windows opening once, focusing, synchronizing, navigating, and
  closing cleanly;
- data-directory movement, health checking, recovery, and failed-migration
  retry;
- automatic Electron-data migration with source files unchanged;
- migration from an Electron `1.0.0-beta.3` fixture whose browser-origin data
  has completed the release's normal canonical-data migration;
- main workflows on macOS, Windows, and Linux release artifacts.

## Implementation Sequence

The work is divided into independently reviewable subprojects, each ending in
a runnable application rather than scaffolding:

1. **Tauri shell and typed desktop boundary:** create the Tauri application,
   main/auxiliary windows, runtime selection, command error contract, and
   initial adapter tests while retaining an internal Electron adapter only as
   a temporary parity oracle.
2. **Configuration and canonical persistence:** port configuration, data CRUD,
   manifests, journals, health/recovery, directory movement, and automatic
   Electron migration; switch all stores and repositories to the desktop
   facade.
3. **Filesystem and local media:** port dialogs, approved roots, file/folder
   trees, watching, reveal, drag/drop, and the range-capable media protocol.
4. **Waveform and network services:** port FFmpeg/FFprobe analysis, cache and
   progress behavior, sidecar packaging checks, and desktop HTTP transport.
5. **Desktop UI and window parity:** rename Electron-specific components and
   pages, migrate every native action, verify all routes and cross-window
   behavior, and retain the web adapter.
6. **Removal and release verification:** remove Electron source/dependencies,
   correct the pre-existing test failures, add CI/build scripts and docs, run
   the full automated/manual matrix, and audit for residual Electron coupling.

Each subproject receives a detailed implementation plan with test-first steps
and exact file changes. A temporary compatibility adapter may exist only until
subproject 6. It must not ship in the completed application and may not hide an
unported feature.

## Out of Scope

- Visual redesign or new language-learning features.
- Persistence schema changes unrelated to Tauri compatibility.
- Cloud sync or account systems.
- OS keychain migration for AI provider keys.
- Mobile Tauri targets.
- Replacing React, Zustand, Vite, Tailwind, or the current media workspace.

## Completion Criteria

The migration is complete only when all of the following are true:

1. Tauri is the sole desktop runtime and produces a runnable desktop build.
2. The standalone Vite web build still works.
3. Every native capability listed in the audit has a real Rust/Tauri
   implementation wired through `DesktopAPI`.
4. Every listed route and critical workflow passes automated or documented
   manual acceptance checks on the applicable platforms.
5. Existing Electron data migrates automatically, idempotently, and without
   source deletion.
6. All automated verification commands pass, including the corrected baseline
   tests and Rust checks.
7. macOS, Windows, and Linux packaging configuration includes validated
   FFmpeg/FFprobe sidecars and required notices.
8. Repository searches find no Electron runtime source, dependencies, build
   configuration, imports, globals, or Electron-named production components.
9. Documentation describes only the supported Tauri desktop and Vite web
   development, build, distribution, architecture, and troubleshooting flows.
