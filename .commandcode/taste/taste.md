# Taste (Continuously Learned by [CommandCode][cmd])

[cmd]: https://commandcode.ai/

# Electron Architecture
- When creating new Electron popup windows, follow the exact Settings window pattern: singleton BrowserWindow with module-level variable, IPC channels (window:openX/window:closeX), preload methods, dedicated route, shell component with custom chrome (hiddenInset, hidden traffic lights, custom close button). Confidence: 0.80
- Extract shared content components so both the in-app page and the popup window page reuse the same rendering logic (e.g., GlossaryContent used by both GlossaryPage and ElectronGlossaryWindowPage). Confidence: 0.70
- Skip PersistentPlayer rendering in popup windows (glossary-window, settings-window) — Zustand localStorage rehydration causes PlayerPage to mount in popups otherwise. Confidence: 0.65
- Glossary popup window should be display-only: navigation actions (e.g., "Play contents" clicks) must fire IPC to the main window via electronAPI, not navigate within the popup. Confidence: 0.70

# Communication Style
- Provide detailed, in-depth technical explanations for each point. Confidence: 0.85
- Use specialized subagents (frontend engineer, performance engineer, etc.) for complex tasks instead of general-purpose agents. Confidence: 0.90

# Performance
- Prioritize silky smooth UI performance; use techniques like 3-layer canvas, rAF-based clocks, and throttling. Confidence: 0.85

# UI/UX Design
- Hide non-core elements when modules are too small. Confidence: 0.75
- Prefer vertical scrollbar only; avoid simultaneous horizontal and vertical scrollbars. Confidence: 0.75
- Set max width/height for waveform to prevent ugly stretching. Confidence: 0.75
- Use adaptive elements without borders that deform when compressed. Confidence: 0.75

