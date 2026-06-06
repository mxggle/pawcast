# Pawcast

A modern web-based audio/video loop player with A-B repeat & Shadowing Recorder.

Pawcast is a sleek and intuitive web app designed for language learners, musicians, and content reviewers. It allows you to loop YouTube videos and local files with precision, and now features a powerful **Shadowing Mode** to record and compare your voice with the original audio.

🎯 **Supports:** MP3, MP4, WebM, FLAC, YouTube links, and more.
📼 **Input:** Drag & drop local files or paste a YouTube URL.
🔁 **Loop:** Set custom A-B loop points to focus on specific sections.
🎙️ **Shadow:** Record your voice over the track to practice pronunciation.

<img width="2844" height="1874" alt="CleanShot 2026-04-29 at 21 32 03@2x" src="https://github.com/user-attachments/assets/25c9cac9-df0b-4ce5-a25f-20ec0e700f2b" />
<img width="2844" height="1874" alt="CleanShot 2026-04-29 at 21 32 24@2x" src="https://github.com/user-attachments/assets/4ec4b59d-9c06-4615-8cba-beef5c1e88f0" />

## ✨ Features

### Core Playback
- **Audio/Video Playback**: Robust support for local media files and YouTube videos.
- **A-B Loop**: Precise loop points with start/end markers and fine-tuning controls.
- **Waveform Visualization**: Interactive, zoomable waveform for precise navigation and loop setting, with background analysis and caching for large files.
- **Playback Speed**: Adjustable playback rate (0.25x – 2.0x) without altering pitch.
- **Bookmarks**: Save important timestamps with notes for quick access.
- **Persistent Player**: Playback state survives page navigation; a mini-player keeps your session alive across routes.

### 🎙️ Shadowing & Recording
Designed for language learners to practice speaking:
- **Integrated Recorder**: Record your voice while the media plays.
- **Smart Overwrite**: Automatically trims or splits existing recordings if you re-record a section (non-destructive punch-in).
- **Dual Waveforms**: Visualize your recorded audio overlaid on the original track in real time.
- **Auto-Mute**: Automatically mutes previous takes while recording to prevent echo.
- **Mobile Support**: Fully functional recording controls on mobile devices.

### 🤖 AI-Powered Transcription
- **Multi-Provider Support**: OpenAI Whisper, Groq Whisper, Google Gemini, and local Whisper (via Ollama) for offline transcription.
- **Chunked Transcription**: Long files are split into overlapping chunks for reliable, progressive transcription with progress feedback.
- **Loop-Range Transcription**: Transcribe only the current A–B selection.
- **Real-Time Sync**: Transcript segments sync to playback position and support click-to-seek.
- **Virtualized Rendering**: Smooth scrolling for transcripts with thousands of segments.

### 💬 AI Assistant & Explanation
- **Multi-Provider Chat**: OpenAI, Google Gemini, xAI Grok, DeepSeek, OpenCode, and Ollama.
- **Contextual Explanations**: Select any transcript segment and ask the AI for grammar, vocabulary, or cultural explanations tailored to language learners.
- **Customizable Models**: Per-provider model selection, API key management, and connection testing.

### 🧠 Sentence Practice & Glossary
- **Sentence Practice Mode**: Isolate individual transcript sentences for focused listening and repetition.
- **Glossary**: Build a personal vocabulary list from transcript selections.

### User Experience
- **Responsive Design**: Optimized for desktop, tablet, and mobile.
- **Touch Controls**: Mobile-friendly seek and loop controls.
- **Dark/Light Theme**: Automatic or manual theme switching.
- **Keyboard Shortcuts**: Comprehensive hotkeys for mouse-free operation.
- **Privacy First**: Local files and recordings are stored in the browser (IndexedDB). The Electron build keeps everything on your machine.
- **Internationalization**: Full UI translations in English, 日本語, and 中文.

## 🏗 Architecture

Pawcast ships as both a **web app** (Vite SPA) and a **desktop app** (Electron) from a single TypeScript codebase. A 4-layer architecture keeps shared and platform-specific code strictly separated.

```
┌─────────────────────────────────────────────────────────────────────┐
│                     Layer 4 · Entry Points                          │
│                                                                     │
│   pages/WebHomePage.tsx          pages/ElectronHomePage.tsx         │
│   pages/PlayerPage.tsx           electron/main.ts                   │
│   components/layout/AppLayout.tsx  ← single platform branch here    │
└───────────────┬─────────────────────────┬───────────────────────────┘
                │                         │
                ▼                         ▼
┌───────────────────────┐   ┌─────────────────────────┐
│  Layer 3 · Web UI     │   │  Layer 3 · Electron UI  │
│                       │   │                         │
│  components/web/      │   │  components/electron/   │
│  ├ WebAppLayout       │   │  ├ ElectronAppLayout    │
│  ├ FileUploader       │   │  ├ ElectronFileOpener   │
│  ├ MediaHistory       │   │  ├ FolderBrowser        │
│  └ StorageUsageInfo   │   │  └ PlayHistory          │
│                       │   │                         │
│  Web APIs only        │   │  window.electronAPI only│
└───────────┬───────────┘   └────────────┬────────────┘
            │                            │
            └──────────┬─────────────────┘
                       ▼
┌─────────────────────────────────────────────────────────────────────┐
│                   Layer 2 · Shared UI & State                       │
│                                                                     │
│   components/layout/AppLayoutBase.tsx   (shared chrome)             │
│   components/ui/         Radix UI primitives                        │
│   components/controls/   Playback & A-B loop controls               │
│   components/transcript/ components/waveform/ components/bookmarks/ │
│   stores/playerStore.ts  hooks/                                     │
│                                                                     │
│   No isElectron() · No window.electronAPI · No Layer 3 imports      │
└───────────────────────────────┬─────────────────────────────────────┘
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     Layer 1 · Core (Pure)                           │
│                                                                     │
│   utils/platform.ts          ← isElectron() defined here           │
│   stores/electronStorage.ts  ← only file allowed to call IPC       │
│   utils/   services/   types/   i18n/                               │
│                                                                     │
│   No DOM APIs · No platform-specific calls                          │
└─────────────────────────────────────────────────────────────────────┘
```

**How it works at runtime:**
- `AppLayout.tsx` makes a single `isElectron()` check and renders either `ElectronAppLayout` or `WebAppLayout`
- All pages use `<AppLayout>` — they never know which shell they are inside
- Shared state lives in Zustand (`playerStore`, `shadowingStore`, `themeStore`, etc.) and is persisted via `electronStorage`, which transparently routes to Electron IPC or `localStorage`
- AI service calls are automatically proxied in the web build (`/api/opencode`, `/api/deepseek`) to avoid CORS, while the Electron build calls providers directly via IPC `fetch`

## 🛠 Tech Stack

- **Frontend**: React 18, TypeScript, Vite
- **Routing**: React Router v7
- **Styling**: Tailwind CSS, Radix UI Themes, Framer Motion
- **State**: Zustand (with persistent storage and platform-aware adapters)
- **Data Fetching & Virtualization**: TanStack Query, TanStack Virtual
- **Audio**: Web Audio API, Tone.js
- **Desktop**: Electron 41, electron-vite, electron-builder, electron-store
- **AI SDKs**: OpenAI, Google GenAI, `@ai-sdk/xai` (Grok), custom adapters for DeepSeek / OpenCode / Ollama
- **i18n**: i18next + react-i18next + browser language detector
- **Deployment**: Vercel ready (SPA + API proxy for CORS-free AI requests)

## 🚀 Getting Started

### Prerequisites

- Node.js 18+
- Yarn (classic) or npm
- Browser with Web Audio API support (Chrome, Firefox, Safari, Edge)

### Web App

1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/pawcast.git
   cd pawcast
   ```

2. Install dependencies:
   ```bash
   yarn install
   ```

3. Start the Vite dev server:
   ```bash
   yarn dev
   ```

4. Open `http://localhost:5173`

### Desktop App (Electron)

```bash
# Dev mode with hot reload
yarn dev:electron

# Build for production
yarn build:electron

# Package for current platform
yarn dist

# Platform-specific packaging
yarn dist:win
yarn dist:mac
yarn dist:linux
```

## 🎛 Usage

1. **Load Media**: Drag & drop a file or paste a YouTube link.
2. **Looping**:
   - Press **A** to set start, **B** to set end.
   - Press **L** to toggle loop.
3. **Shadowing**:
   - Click the **Mic** icon to enable Shadowing Mode.
   - Press **R** or click the Record button to start/stop recording.
   - Your recording is visualized in **Red** over the original **Green** waveform.
   - Use the volume sliders to balance original audio and your recording.
4. **AI Transcription**:
   - Open the **Transcript** panel and choose a provider in **Settings → AI**.
   - Click **Transcribe** to generate a timestamped transcript.
   - Click any sentence to jump to that timestamp.
5. **AI Explanation**:
   - Select any transcript text and click **Explain**.
   - The AI provides grammar, vocabulary, or cultural context tailored to language learners.

## ⌨️ Keyboard Shortcuts

| Key | Action |
| :--- | :--- |
| **Space** | Play/Pause |
| **A** | Set Loop Start (A) |
| **B** | Set Loop End (B) |
| **L** | Toggle Loop |
| **C** | Clear Loop Points |
| **R** | Start/Stop Recording (Shadowing) |
| **M** | Add Bookmark |
| **← / →** | Seek -5s / +5s |
| **Shift + ← / →** | Seek -1s / +1s |
| **↑ / ↓** | Volume Up / Down |

## 📝 License

MIT License. See [LICENSE](LICENSE) for details.
