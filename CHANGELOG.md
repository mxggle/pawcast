# Changelog

All notable changes to Pawcast (formerly LoopMate / ModernABLoop) will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.0.0-beta.4] - 2026-07-09

### Added

- Tauri 2 desktop runtime with Rust persistence, filesystem, window, network, local-media, and waveform services.
- Automatic non-destructive migration from the Pawcast Electron `1.0.0-beta.3` data layout.
- Target-specific FFmpeg and FFprobe sidecar preparation and validation.
- **Per-media study progress**: cumulative listening time, practiced-sentence tracking, and last-studied stamps (`progressStore`).
- **Library-first home**: "Continue studying" resume cards with playback progress bars and bookmark/glossary/takes/practiced stat chips.
- **Practice deep link**: "Practice this sentence" in the transcript selection popover jumps into Sentence Practice with that segment preselected.
- **Shadowing takes drawer** under the timeline: list takes per sentence, play a take, replay the original range (A/B compare), delete takes.
- Practiced sentences show a checkmark in the transcript panel.
- Glossary entries grouped by source media with per-section counts.
- **Per-line AI translation**: toggle inline translations beneath each transcript segment, with selectable target language (English, 简体中文, 繁體中文, 日本語, 한국어, Español, Français, Deutsch) and a blur mode (none / reveal on hover / reveal on click) for active-recall practice.
- **Native YouTube support**: native media preparation and caption fetching for smoother loading and stored captions.
- **Automatic language detection** for loaded media, plus a level system-override UI.
- **Interactive product website** (`website/`): a self-contained landing page that acts as a digital twin of the app, with live A-B loop, transcript, shadowing, theme-switching, and settings demos.

### Changed

- Rebranded from LoopMate to Pawcast across all files, configs, and identifiers.
- Replaced the Electron desktop runtime and IPC preload bridge with a typed Tauri `DesktopAPI` boundary.
- Desktop-only: web-specific UI removed; the Vite dev server remains usable as a development fallback shell.
- **State architecture**: one store per domain (player/playback, history/library, bookmarks, transcripts+glossary, progress) with per-domain persistence keys; existing data seeds once from the legacy storage snapshot, which is left intact for downgrade safety.
- Canonical PawcastData JSON mirroring consolidated into a single module, fixing two writers racing on `app-settings.json` with partly hardcoded values.
- Decomposed the transcript panel (2,000+ lines) into a transcription runner hook, pure segmentation utilities (unit-tested), and a bookmark import/export hook; extracted the player page's panel choreography into `usePanelLayout`.
- macOS unified title bar; glossary playback and AI settings now sync across auxiliary windows.

### Fixed

- Windows Tauri startup packaging.
- Aborting an in-flight platform media fetch no longer surfaces a spurious error.

### Removed

- ~3,700 lines of dead code: the unused `components/controls/` directory, `TriplePaneLayout`, `SettingsDrawer`, `BookmarkDrawer`, `BookmarkManager`, dev/test components, and commented-out segmentation code.

## [1.0.0-beta.2] - 2026-06-05

### Added

- **Player revamp — 3-layer waveform renderer**:
  - Extracted player core abstractions (`MediaController`, `PlaybackClock`, `WaveformRenderer`, `WaveformLoader`)
  - 3-layer canvas-based waveform rendering for smooth 60fps performance
  - `TrackHeader` component in the waveform area with per-track metadata and controls
  - `TrackVolumeControl` for independent per-track volume adjustment
  - `TimelineOverflowMenu` dropdown for overflow actions on narrow widths
  - Smart-fold timeline toolbar that collapses into an overflow menu
  - NotebookLM-style panel collapse/expand with accurate size restoration
  - Reliable canvas-based seek implementation
  - Container queries for responsive layout in `MediaPreviewPanel` and transcript panel

- **File-based data persistence infrastructure**:
  - `DataStore` with journaled writes and manifest tracking (`electron/dataStore.ts`)
  - `MigrationManager` for data format versioning (`electron/migrationManager.ts`)
  - `JournalManager` for write-ahead logging (`electron/journalManager.ts`)
  - `SnapshotManager` for periodic data snapshots (`electron/snapshotManager.ts`)
  - `HealthCheck` system for data integrity verification (`electron/healthCheck.ts`)
  - Repository layer (`repositories/*`) with typed data access patterns
  - Dual-write store sync between Zustand stores and the persistence layer
  - Data management settings UI with health status display and i18n

- **FFmpeg waveform analysis engine**:
  - `WaveformEngine` for native audio analysis in Electron main process (`electron/waveformEngine.ts`)
  - `WaveformProbe` for efficient stream inspection (`electron/waveformProbe.ts`)
  - Cached waveform generation with progressive loading states

- **Glossary as standalone Electron popup window**:
  - Dedicated `GlossaryWindowShell` component with custom window chrome
  - Cross-window IPC communication for "Play contents" navigation to main window
  - Shared `GlossaryContent` component reused across in-app and popup window pages

- **Word-level transcript system**:
  - `TranscriptWordRenderer` for word-level highlighting synchronized with playback
  - `useWordState` hook for per-word active/inactive tracking
  - `findActiveWord` algorithm for bidirectional transcript-audio sync
  - Shadowing timeline track for visual recording alignment

- **Transcript management system**:
  - Automated study analysis with persistent storage and export support
  - Motion-animated transcript selection with cross-segment range capture
  - Container-query-based transcript panel for responsive layout

- **Bookmark system**:
  - Dedicated `bookmarkStore` with repository-backed persistence
  - Timeline toolbar bookmarking with visual indicators

- **Settings infrastructure**:
  - Extracted `settingsStore` with persistence layer backing
  - Configuration for Electron-only features and data directory
  - Settings window IPC channel pattern

- **Testing**:
  - `findActiveWord.test.ts` — word-level sync algorithm tests
  - `mediaController.test.ts` — playback controller tests
  - `playbackClock.test.ts` — rAF clock implementation tests
  - `waveformEngine.test.ts` and `waveformRenderer.test.ts` — waveform unit tests

### Changed

- **Player architecture**:
  - Removed floating canvas controls — `TrackHeader` takes over all waveform-area controls
  - Refactored `MediaPlayer` to use extracted player abstractions
  - Overhauled `WaveformVisualizer` to use the new renderer
  - Overhauled panel layout controls with updated icons and flexible alignment

- **State management**:
  - Major `playerStore` refactoring — extracted dedicated stores (media, transcript, bookmark, settings)
  - Created `mediaStore` for media file lifecycle management
  - Created `transcriptStore` for transcript state and persistence
  - Restored transcripts and last session on page refresh

- **Electron security**:
  - Added file path approval IPC (`approvePath` API) for explicit user consent
  - Restricted file system access in preload to approved paths

### Fixed

- Fixed canvas seek reliability issues
- Fixed waveform height stretching on panel resize
- Fixed no-audio-stream handling in ffprobe parsing
- Fixed timeline button sizing and alignment consistency
- Fixed transcript session state loss on page refresh
- Fixed P0 UI/UX issues (prose typo, i18n key, timeline highlight dependencies, loading state, clear-history confirmation)

### Removed

- Removed web-only components: `FileUploader`, `MediaHistory`, `StorageUsageInfo`, `WebAppLayout`, `WebHomePage`
  (Web support moved to dedicated platform architecture)

### Dependencies

- Added `@tailwindcss/container-queries` plugin for responsive container-based layouts

## [1.0.0-beta.1] - 2026-03-15

### Added
- **Electron desktop app (major milestone)**:
  - Native local file and folder browsing via Electron APIs
  - Local source folder management with a tree browser for navigating media libraries
  - Media play history persisted natively on desktop
  - Draggable window header for frameless desktop mode
  - Configurable visibility for theme toggle and settings icon in desktop mode
- **Platform architecture**:
  - Enforced 4-layer platform architecture separating Electron and web code paths
  - `WebHomePage` and `ElectronHomePage` platform-specific home page components
  - Media history conditionally rendered per platform on the home page

### Changed
- **Electron security hardening**:
  - Restricted file access to user-approved folders only
  - Removed the legacy `ABLoopPlayer` component
- **Sidebar and layout**:
  - Sidebar defaults to closed on first load
  - Sidebar open state and width are now global in the player store
  - Control bar position adjusts dynamically based on sidebar state

### Technical
- Platform detection (`isElectron()`) restricted to designated files to prevent architecture drift
- `window.electronAPI` access consolidated into `electron/preload.ts`, `electronStorage.ts`, and `src/components/electron/`

## [0.9.2] - 2026-03-15

### Added
- **Persistent player**:
  - Persistent media player that survive page navigation, preserving playback state across routes
  - Virtualized transcript list for smooth rendering of long transcripts without performance degradation

### Changed
- **Transcript controls**:
  - Merged transcript action buttons directly into the header for a cleaner, more accessible layout
  - Replaced individual export buttons with a single dropdown menu to reduce toolbar clutter
- **Storage cleanup**:
  - Transcript records are now deleted atomically alongside media files using a shared `deleteMediaRecords` helper
  - `clearAllMediaFiles` now clears both the media store and transcript store in a single transaction
  - Cleanup routine removes orphaned transcript records when old media files are purged

### Fixed
- **AI settings**:
  - AI provider and model selections now initialize correctly from localStorage on first render
- **Storage**:
  - Removed obsolete v3 migration block that incorrectly wiped `mediaTranscripts` on store rehydration

## [0.9.1] - 2026-03-14

### Added
- **Local AI services**:
  - Added Ollama integration as a local LLM provider for AI chat and explanation features
  - Added Local Whisper transcription support for fully offline audio transcription

### Changed
- **Playlist cleanup**:
  - Removed leftover playlist and queue controls from desktop and mobile player UIs
  - Removed obsolete queue state and media-end auto-advance behavior from the player store
  - Removed `Play All` actions from the media library after playlist support was dropped
- **Transcript and explanation UX**:
  - Tightened explanation prompts to produce shorter language-learning focused output
  - Updated transcript empty-state copy to reference the active transcription provider
  - Refined transcript-related translations across English, Japanese, and Chinese
- **AI provider defaults**:
  - Refreshed OpenAI, Gemini, and Grok model catalogs and pricing metadata
  - Updated default chat and transcription model selections to newer provider defaults
- **Settings navigation**:
  - Added support for opening the AI tab directly with the `tab=ai` settings query parameter

### Fixed
- **Build**:
  - Removed unused variables in `TranscriptPanel` that caused TypeScript compilation errors

## [0.9.0] - 2026-03-12

### Added
- **Playback controls**:
  - Added a dedicated "play from start" control in the player UI
  - Added safer pending-play handling so media can begin automatically once the element is ready
- **Transcription workflow**:
  - Added loop-range transcription so the active A-B selection can be sent directly for transcription
  - Added an explicit full-range transcription action and cancel controls for long-running jobs
- **Waveform processing**:
  - Added cached waveform analysis utilities for background generation and progressive loading
  - Added large-file waveform loading feedback with analysis progress states

### Changed
- **AI settings overhaul**:
  - Rebuilt the AI settings page into clearer defaults, providers, and transcription sections
  - Improved provider selection, model selection, API key handling, and connection testing flows
  - Expanded translations for the new AI and transcription settings UI
- **Shadowing workflow simplification**:
  - Simplified shadowing playback and recording to a single-track model
  - Refined recorder state handling, cleanup behavior, and waveform rendering for shadowing sessions
- **Waveform experience**:
  - Reworked waveform loading and rendering to better handle very large local audio files
  - Improved waveform caching, zoom behavior, and loading transitions for stored media
- **Player and media state management**:
  - Improved playback state synchronization between the media element and the global store
  - Reduced noisy current-time updates and tightened media cleanup during unmounts
- **Transcript actions**:
  - Refined transcript action buttons and range-aware transcription entry points

### Fixed
- **Playback reliability**:
  - Fixed cases where play requests could be dropped before media was ready
  - Fixed store playback state drifting out of sync with the actual media element
- **Waveform stability**:
  - Fixed large audio waveform loading regressions and reduced failures during background analysis
  - Improved recovery and status handling when waveform analysis cannot complete normally
- **Shadowing and storage cleanup**:
  - Improved cleanup around shadowing recordings and related persisted media state
  - Fixed several edge cases in local media storage and waveform cache updates

## [0.8.1] - 2026-02-17

### Added
- **AI Service Updates**:
  - Updated AI models (GPT-5 family, Gemini 3 family, Grok 4) in `aiService.ts`
  - Improved transcription timestamp accuracy and audio resampling logic
- **Player Enhancements**:
  - Added media title display to the player UI
  - Robust shadowing segment deletion with automatic file cleanup

### Fixed
- **Bug Fixes**:
  - Fixed loop playback issue when no A/B area is focused
  - Resolved infinite re-render loop in `WaveformVisualizer`
  - Fixed volume control visibility and aesthetics
- **Maintenance**:
  - Resolved multiple TypeScript linting errors and removed unsafe `any` casts
  - Cleaned up unused variables in `shadowingStore.ts`

## [0.8.0] - 2025-12-13

### Added
- **Playback Persistence**:
  - Automatically saves and restores playback position for media files and YouTube videos
  - Includes new `mediaVolume` and `previousMediaVolume` states in store
- **Advanced Audio Controls**:
  - Three-level volume architecture: Media, Recording (Shadowing), and Master
  - Independent mute controls for each level with visual feedback
  - Synchronized volume state across all player components
- **Shadowing Enhancements**:
  - **Mobile Support**: Added dedicated recording button to mobile interface
  - **Smart Overwrite**: New logic to handle overlapping shadowing recordings purely
  - **Media Track Control**: Added volume slider and mute toggle for the backing media track in shadowing view
- **Visual Updates**:
  - **Bar Waveform**: Transitioned from line to bar-based waveform visualization for clearer silence formatting
  - **YouTube UI**: Stylized "waveform not supported" notice with improved aesthetics

### Changed
- **Loop & Interaction Refinements**:
  - Implemented "Smart Looping": auto-activates loop when clicking loop button inside a bookmark
  - Restricted 'M' shortcut to strictly require A-B loop for bookmark creation
  - Separated waveform interactions: body click for seeking, marker click for selection
- **Shadowing Workflow**:
  - Improved auto-mute behavior: restores previous mute state instead of always unmuting after recording
  - Enhanced recording state management for mobile users

### Fixed
- Resolved block-scoped variable error in WaveformVisualizer
- Removed redundant total storage display in StorageUsageInfo
- Added missing `common.remove` translation key

## [0.7.0] - 2025-09-19

### Added
- **Shadowing Recorder (Major Feature)**:
  - Integrated voice recorder to practice speaking alongside media
  - **Real-time Visualization**: See your recording waveform (red) overlaid on the original audio (green) instantly
  - **Smart Overwrite**: Re-recording a section automatically trims or splits existing recordings (non-destructive punch-in)
  - **Auto-Mute**: Automatically mutes the shadowing track while recording to prevent echo/feedback
  - **Dual Volume Control**: Independent volume sliders for the original track and your recorded voice
- **Mobile Recording Controls**: Added a dedicated microphone button to the mobile player interface

### Changed
- Updated `ShadowingStore` to support file slicing (`fileOffset`) for efficient audio segment management
- Optimized waveform rendering to handle layered audio visualizations
- Refactored `useShadowingPlayer` to use Web Audio API for precise playback synchronization

## [0.6.1] - 2025-09-19

### Added
- Enhanced Media History UI with folder navigation and sorting controls
- Added i18n translations for player controls and loop components

### Changed
- Updated disabled bookmark button styling
- Changed history icon to ListVideo for better visual representation

## [0.6.0] - 2025-09-14

### Added

- Internationalization (i18n) support:
  - Complete translations for player controls and bookmarks
  - Language detection and switching capability
  - Support for English, Chinese, and Japanese languages
- Video file support:
  - Native video player integration
  - Waveform visualization for video files
  - Enhanced native media controls
- Playlist management:
  - UI for playlist creation and editing
  - Playback mode controls (shuffle, repeat)
  - Queue management system
- Media organization:
  - Folder organization for media history
  - Sorting options for media files
  - Improved media history panel
- Enhanced controls:
  - Redesigned mobile controls
  - Quick-add bookmark feature
  - Configurable seek steps
  - Improved bookmark navigation

### Fixed

- Standardized z-index layering across components
- Added ESC key and click-outside handling for all drawers
- Improved bookmark management across components

## [0.5.0] - 2025-05-29

### Added

- AI-powered text explanation feature for transcript segments:
  - Explain button on each transcript segment for language learning
  - Support for OpenAI GPT, Google Gemini, and xAI Grok AI services
  - Translation, explanation, difficulty assessment, and key vocabulary extraction
  - Configurable target language and preferred AI service
  - Secure API key storage in browser localStorage
  - Fallback between AI services for reliability

## [0.4.0] - 2025-05-26

### Added

- Comprehensive transcript management system:
  - Advanced parsing for SRT, VTT, and TXT transcript formats
  - Detailed error handling with user feedback
  - Auto-format detection based on file extension and content
- Enhanced UI customization:
  - Expanded settings drawer with interface layout controls
  - Component-level visibility toggles for player, waveform, transcript, and controls
  - Persistent layout preferences across sessions
- Improved media interaction:
  - Auto-play functionality when navigating through transcript segments
  - Media-scoped transcript system that persists across sessions
  - Bookmark creation directly from transcript segments

### Enhanced

- OpenAI Whisper integration:
  - Improved transcription workflow with progress indicators
  - Secure API key management with local storage
  - Multiple export format options (SRT, VTT, TXT)
- Navigation system:
  - Streamlined routing architecture
  - Better integration with media history
  - Simplified user flow between components

### Technical

- Refactored store architecture:
  - Media-scoped data structures for transcripts and bookmarks
  - Centralized seeking logic
  - Improved state management for UI components
- Performance optimizations:
  - Reduced re-renders in transcript components
  - Optimized media loading process
  - Enhanced error handling throughout the application

## [0.3.0] - 2025-05-25

### Added

- Transcript file upload support with SRT, VTT, and TXT formats
- Settings drawer to control UI component visibility
- Layout settings for customizable UI component visibility
- OpenAI Whisper transcription with UI controls and export options
- Enhanced navigation system with simplified routing and media history integration
- Hidden mode for media players to maintain functionality without UI
- Auto-play when jumping to transcript segments

### Changed

- Increased icon sizes for better visibility
- Refactored transcript management to support media-scoped transcripts
- Updated related components to work with the new transcript system

## [0.2.0] - 2025-05-25

### Added

- Mobile touch support and responsive design for waveform visualizer
- Mobile-optimized controls and touch-friendly UI components
- Notification badges for bookmark and history features

### Changed

- Rebranded from ModernABLoop to LoopMate across all files
- Moved bookmark and history buttons to header for better accessibility
- Adjusted header layout and icon sizes for improved mobile responsiveness

### Refactored

- Centralized seeking logic in playerStore for better code organization
- Updated useMediaQuery import path to use alias

## [0.1.0] - 2025-05-25

- Initial release with core functionality including:
  - Audio and YouTube media player components
  - A-B loop functionality for precise media loops
  - Audio visualization features
  - Media controls (play, pause, loop, etc.)
  - Layout optimizations for desktop view
  - TypeScript and React component structure

[Unreleased]: https://github.com/mxggle/lingoloop/compare/v1.0.0-beta.2...HEAD
[1.0.0-beta.2]: https://github.com/mxggle/lingoloop/compare/v1.0.0-beta.1...v1.0.0-beta.2
[1.0.0-beta.1]: https://github.com/mxggle/lingoloop/compare/v0.9.1...v1.0.0-beta.1
[0.9.1]: https://github.com/mxggle/lingoloop/compare/v0.9.0...v0.9.1
[0.9.0]: https://github.com/mxggle/lingoloop/compare/v0.8.1...v0.9.0
[0.8.1]: https://github.com/mxggle/lingoloop/compare/v0.8.0...v0.8.1
[0.8.0]: https://github.com/mxggle/lingoloop/compare/v0.7.0...v0.8.0
[0.7.0]: https://github.com/mxggle/lingoloop/compare/v0.6.1...v0.7.0
[0.6.1]: https://github.com/mxggle/lingoloop/compare/v0.6.0...v0.6.1
[0.6.0]: https://github.com/mxggle/lingoloop/compare/v0.5.0...v0.6.0
[0.5.0]: https://github.com/mxggle/lingoloop/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/mxggle/lingoloop/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/mxggle/lingoloop/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/mxggle/lingoloop/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/mxggle/lingoloop/releases/tag/v0.1.0
