对，这个方向我重新修正：**不再按 Web + Electron 兼容方案设计**，而是按 **Electron-only 桌面应用** 来做。

而且重点不应该是“怎么把 Web 包进 Electron”，而是：

> **把播放器区域做成一个 Descript-style 的媒体工作台：Transcript 是主模型，Waveform / Timeline / Player 都只是这个模型的不同视图。**

下面是新的核心方案。

---

# LoopMate Electron-only Player 重构方案

## 1. 核心设计原则

不要再把它当成普通播放器：

```txt
video/audio element + waveform + transcript panel
```

而要改成 Descript 的思路：

```txt
Media Document
  ↓
Transcript Model
  ↓
Timeline Model
  ↓
Playback Engine
  ↓
Waveform Renderer
  ↓
Transcript Renderer
```

也就是说，**Transcript、Waveform、A-B Loop、Bookmark、Shadowing 都必须基于同一个时间轴模型**。

---

# 2. Electron-only 架构

既然只做桌面应用，就不需要考虑 Web fallback，也不需要 IndexedDB 作为主要存储。

## 推荐架构

```txt
Electron App
├── Main Process
│   ├── Media Engine
│   │   ├── FFmpeg
│   │   ├── ffprobe
│   │   ├── waveform analyzer
│   │   ├── audio extractor
│   │   ├── thumbnail generator
│   │   └── cache manager
│   │
│   ├── Project Storage
│   │   ├── SQLite
│   │   ├── transcript store
│   │   ├── bookmark store
│   │   └── media metadata store
│   │
│   └── IPC API
│
├── Preload
│   └── window.loopmate
│
└── Renderer
    ├── Player Workspace
    │   ├── Preview Player
    │   ├── Waveform Timeline
    │   ├── Transcript Editor
    │   ├── Caption Layer
    │   └── Shadowing Layer
    │
    └── React UI
```

重点：

```txt
Main Process / Worker:
处理媒体

Renderer:
只显示和交互

React:
只管 UI 状态

Canvas:
管 waveform / timeline 绘制

Transcript:
作为核心数据模型
```

---

# 3. Descript 的核心不是 UI，而是数据模型

你要借鉴 Descript，最关键不是把界面画得像它，而是借鉴它的内部逻辑：

```txt
word-level transcript
  ↓
每个 word 都有 start / end
  ↓
句子、段落、字幕、bookmark 都由 word 组合出来
  ↓
用户点击文字 = seek 到对应 time
  ↓
用户选择文字 = 选择对应 media range
  ↓
用户删除文字 = 未来可以映射成 media edit
```

所以你的核心模型应该从现在的 segment-level 升级到 word-level。

---

# 4. 核心数据模型

## 4.1 MediaDocument

```ts
export type MediaDocument = {
  id: string
  mediaId: string
  filePath: string
  duration: number
  sampleRate?: number

  transcript: TranscriptDocument
  timeline: TimelineDocument
  bookmarks: Bookmark[]
  shadowing: ShadowingTake[]

  createdAt: number
  updatedAt: number
}
```

---

## 4.2 TranscriptDocument

```ts
export type TranscriptDocument = {
  mediaId: string
  language: string

  paragraphs: TranscriptParagraph[]
  segments: TranscriptSegment[]
  words: TranscriptWord[]

  speakers: Speaker[]
  updatedAt: number
}
```

---

## 4.3 Word-level Transcript

```ts
export type TranscriptWord = {
  id: string
  text: string
  start: number
  end: number
  confidence?: number
  speakerId?: string

  paragraphId?: string
  segmentId?: string

  isDeleted?: boolean
}
```

这就是 Descript-style 的核心。

以后所有功能都可以围绕它做：

```txt
点击单词
选择句子
生成字幕
A-B loop
Shadowing 对齐
当前单词高亮
字幕导出
文本剪辑
```

---

## 4.4 TranscriptSegment

```ts
export type TranscriptSegment = {
  id: string
  start: number
  end: number
  text: string
  wordIds: string[]
  speakerId?: string
}
```

注意：segment 不应该是唯一真相。

真正的 source of truth 是：

```txt
words[]
```

segment 只是 words 的聚合视图。

---

## 4.5 Bookmark

```ts
export type Bookmark = {
  id: string
  mediaId: string
  name: string

  start: number
  end: number

  source?: {
    type: 'manual' | 'transcript-selection' | 'sentence' | 'shadowing'
    wordIds?: string[]
    segmentIds?: string[]
  }

  note?: string
  createdAt: number
  updatedAt: number
}
```

这样 bookmark 就不只是一个时间片段，而是可以和 transcript 绑定。

---

# 5. Player Workspace 设计

播放器区域不要分散成几个互相独立组件，而应该做成一个 workspace。

```txt
PlayerWorkspace
├── PreviewPane
├── TimelinePane
│   ├── VideoThumbnailTrack
│   ├── WaveformTrack
│   ├── TranscriptTimeTrack
│   ├── BookmarkTrack
│   └── ShadowingTrack
│
└── TranscriptPane
    ├── ParagraphView
    ├── WordHighlight
    ├── SelectionToLoop
    └── ClickToSeek
```

---

# 6. Waveform 部分重点重构

你现在不应该再用浏览器 AudioContext 处理大文件。

Electron-only 下，直接用 FFmpeg。

## 6.1 旧模式

```txt
Renderer
  ↓
AudioContext.decodeAudioData
  ↓
生成 peaks
  ↓
Canvas draw
```

## 6.2 新模式

```txt
Main / Worker
  ↓
FFmpeg decode PCM
  ↓
计算 min / max / rms
  ↓
生成 multi-resolution waveform cache
  ↓
Renderer 请求当前 zoom level
  ↓
Canvas 只画 visible range
```

---

## 6.3 Waveform 数据结构

```ts
export type WaveformMeta = {
  mediaId: string
  duration: number
  sampleRate: number
  levels: WaveformLevelMeta[]
}

export type WaveformLevelMeta = {
  level: number
  samplesPerPeak: number
  points: number
  path: string
}

export type WaveformLevelData = {
  mediaId: string
  level: number
  samplesPerPeak: number
  sampleRate: number
  min: Int16Array
  max: Int16Array
  rms: Uint16Array
}
```

重点：**不要只存 peak。**

专业波形应该存：

```txt
min
max
rms
```

这样才能画出真正的上下波形，而不是音量柱。

---

## 6.4 多级 waveform

```ts
export const WAVEFORM_LEVELS = [
  256,
  512,
  1024,
  2048,
  4096,
  8192,
  16384,
  32768,
  65536
]
```

选择逻辑：

```ts
function chooseWaveformLevel(params: {
  levels: WaveformLevelMeta[]
  visibleDuration: number
  canvasWidth: number
  sampleRate: number
}) {
  const secondsPerPixel = params.visibleDuration / params.canvasWidth
  const samplesPerPixel = secondsPerPixel * params.sampleRate

  return (
    params.levels.find(level => level.samplesPerPeak >= samplesPerPixel) ??
    params.levels[params.levels.length - 1]
  )
}
```

---

# 7. Waveform Renderer 设计

Waveform 不应该由 React 高频渲染。

正确方式：

```txt
React component mount
  ↓
new WaveformRenderer(canvas)
  ↓
renderer.setWaveform()
  ↓
renderer.setViewport()
  ↓
renderer.setSelection()
  ↓
renderer.draw()
```

播放时：

```txt
requestAnimationFrame
  ↓
read media.currentTime
  ↓
draw playhead
```

不要每帧：

```txt
setCurrentTime
  ↓
Zustand update
  ↓
React re-render
  ↓
Canvas redraw
```

---

## 7.1 Canvas 分层

建议分成三层：

```txt
Static Canvas
- waveform
- video thumbnails

Overlay Canvas
- bookmarks
- loop range
- transcript selection

Playhead Canvas
- current playhead
- hover cursor
```

这样播放时只重绘 playhead。

---

# 8. Transcript 部分重点重构

Transcript 要变成真正的编辑器，而不是普通列表。

## 8.1 当前普通 transcript panel 的问题

普通 transcript panel 通常是：

```txt
segments.map(...)
```

问题：

```txt
1. 只能句子级跳转
2. 不能 word highlight
3. 不能文字选择映射到时间范围
4. 不能像 Descript 一样“文字即媒体”
```

---

## 8.2 Descript-style Transcript Editor

目标：

```txt
文字可以点击
文字可以选择
文字和时间轴双向同步
当前播放位置高亮单词
选中文字可以创建 A-B loop
```

---

## 8.3 交互设计

### 点击单词

```txt
click word
  ↓
seek word.start
  ↓
playhead update
  ↓
timeline sync
```

### 选择文字

```txt
select words
  ↓
get firstWord.start
  ↓
get lastWord.end
  ↓
create temporary range
  ↓
timeline highlight same range
```

### 创建 A-B Loop

```txt
selected words
  ↓
create bookmark
  ↓
set loopStart / loopEnd
  ↓
start loop playback
```

### 播放高亮

```txt
media.currentTime
  ↓
binary search words
  ↓
activeWordId
  ↓
highlight word
```

注意：active word 不要每帧 setState，可以 80ms / 100ms 更新一次。

---

# 9. Transcript 渲染性能

长 transcript 不能全部渲染。

保留虚拟列表，但粒度要改：

```txt
Paragraph-level virtualization
  ↓
Paragraph 内部渲染 words
```

不要 word-level virtualization，否则选择文字会很麻烦。

推荐：

```txt
Virtualized paragraphs
  ├── word span
  ├── word span
  ├── word span
```

---

# 10. Transcript 与 Timeline 同步

建立一个统一 selection model。

```ts
export type TimeRangeSelection = {
  type: 'time-range'
  start: number
  end: number
  source?: 'timeline' | 'transcript' | 'bookmark'
  wordIds?: string[]
  segmentIds?: string[]
}
```

当用户在 transcript 选择文字：

```txt
Transcript selection
  ↓
TimeRangeSelection
  ↓
Timeline highlight
```

当用户在 waveform 拖拽：

```txt
Timeline selection
  ↓
TimeRangeSelection
  ↓
Transcript highlight words in range
```

这才是 Descript 的关键体验。

---

# 11. Playback Engine

当前播放器应该抽象出 MediaController。

```ts
export class MediaController {
  constructor(private media: HTMLMediaElement) {}

  play() {
    return this.media.play()
  }

  pause() {
    this.media.pause()
  }

  seek(time: number) {
    this.media.currentTime = time
  }

  getCurrentTime() {
    return this.media.currentTime
  }

  setPlaybackRate(rate: number) {
    this.media.playbackRate = rate
  }
}
```

再加一个 PlaybackClock。

```ts
export class PlaybackClock {
  private rafId: number | null = null
  private listeners = new Set<(time: number) => void>()

  constructor(private media: HTMLMediaElement) {}

  subscribe(listener: (time: number) => void) {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  start() {
    const tick = () => {
      const time = this.media.currentTime

      for (const listener of this.listeners) {
        listener(time)
      }

      this.rafId = requestAnimationFrame(tick)
    }

    this.rafId = requestAnimationFrame(tick)
  }
}
```

用途：

```txt
Waveform playhead:
每帧更新

Zustand currentTime:
每 100ms 更新

Transcript active word:
每 80-100ms 更新
```

---

# 12. Main Process IPC

Electron-only 下可以设计更直接的 API。

```ts
window.loopmate.media.probe(filePath)

window.loopmate.waveform.analyze({
  mediaId,
  filePath
})

window.loopmate.waveform.getLevel({
  mediaId,
  level,
  startTime,
  endTime
})

window.loopmate.transcript.save(document)

window.loopmate.transcript.load(mediaId)

window.loopmate.project.save(project)

window.loopmate.project.load(projectId)
```

---

# 13. 本地缓存设计

```txt
appData/
└── LoopMate/
    ├── loopmate.db
    ├── cache/
    │   ├── waveform/
    │   │   └── {mediaId}/
    │   │       ├── meta.json
    │   │       ├── level-0.bin
    │   │       └── level-1.bin
    │   │
    │   ├── thumbnails/
    │   │   └── {mediaId}/
    │   │       ├── meta.json
    │   │       ├── thumb_00001.jpg
    │   │       └── thumb_00002.jpg
    │   │
    │   └── audio/
    │       └── {mediaId}/
    │           └── extracted.wav
    │
    └── projects/
        └── {projectId}.json
```

---

# 14. 重构优先级

你现在要重点优化播放器，那顺序应该是：

## Phase 1：播放器核心解耦

目标：

```txt
把 MediaPlayer、Waveform、Transcript 从互相调用，改成统一 PlayerWorkspace。
```

任务：

```txt
1. 新建 PlayerWorkspace
2. 新建 MediaController
3. 新建 PlaybackClock
4. currentTime 高频更新从 Zustand 移出去
5. Zustand 只保留低频业务状态
```

---

## Phase 2：Waveform v2

目标：

```txt
完全替换当前 waveform 分析和绘制逻辑。
```

任务：

```txt
1. Main Process 用 FFmpeg 生成 waveform
2. 生成 min/max/rms
3. 生成多 resolution level
4. Canvas 只画可视区域
5. 播放时只移动 playhead
```

---

## Phase 3：Transcript v2

目标：

```txt
Transcript 从普通 segment list 变成 word-level transcript editor。
```

任务：

```txt
1. 新增 TranscriptWord
2. segment 改成 words 聚合
3. 点击 word seek
4. 播放时 active word highlight
5. 选择 words 生成 time range
6. time range 同步 timeline
```

---

## Phase 4：Transcript ↔ Timeline 双向联动

目标：

```txt
实现 Descript-style 交互。
```

任务：

```txt
1. transcript selection 映射到 waveform range
2. waveform drag selection 映射到 transcript words
3. 选中文字创建 A-B loop
4. bookmark 可以绑定 wordIds
```

---

## Phase 5：Shadowing 与 Transcript 对齐

目标：

```txt
Shadowing 录音也成为 timeline track。
```

任务：

```txt
1. shadowing take 绑定 start/end
2. 显示为独立 waveform lane
3. 可以和原音频 waveform 对比
4. 可以按 transcript sentence 录音
```

---

# 15. 给 AI 的实现 Prompt

你可以直接把这段给 coding agent：

```txt
This project is already an Electron desktop app. Do not design for web deployment. Do not keep web compatibility as a goal.

The goal is to refactor the player area into a Descript-style media workspace.

Focus only on:
1. Player
2. Waveform
3. Transcript
4. Timeline synchronization

Do not work on marketing pages, web deployment, Vercel, or browser-only fallback.

Core architecture:
- Electron Main Process handles media analysis.
- Renderer only handles UI and Canvas rendering.
- FFmpeg generates waveform data and thumbnails.
- React should not re-render on every playback frame.
- Transcript should become the source of truth, similar to Descript.

Implement these phases:

Phase 1:
Refactor player area into `PlayerWorkspace`.
Add:
- `MediaController`
- `PlaybackClock`
- `PlayerWorkspace`
- `TimelineSelectionStore`

Move high-frequency `currentTime` updates out of Zustand.
Use requestAnimationFrame for playhead rendering.
Sync Zustand currentTime only every 100-200ms.

Phase 2:
Replace waveform implementation.
Main process should use FFmpeg to decode media audio into PCM.
Generate multi-resolution waveform levels.
Each level must store:
- min
- max
- rms

Do not store only peak values.

Renderer should:
- choose waveform level by zoom
- draw only visible range
- use Canvas
- avoid React re-render during playback

Phase 3:
Upgrade Transcript model to word-level.

Add:
- TranscriptDocument
- TranscriptParagraph
- TranscriptSegment
- TranscriptWord

Words must have:
- id
- text
- start
- end
- confidence
- speakerId optional

Transcript interactions:
- click word to seek
- active word highlight during playback
- select words to create time range
- create A-B loop from selected words

Phase 4:
Implement bidirectional sync between Transcript and Timeline.

Transcript selection should highlight waveform range.
Waveform range selection should highlight transcript words.
Bookmarks should be able to store wordIds and segmentIds.

Important constraints:
- Do not rewrite the entire app.
- Do not change unrelated UI.
- Do not use WebCodecs yet.
- Do not implement full video editor.
- Focus on Descript-like player, waveform, and transcript interaction.
```

---

# 16. 最重要的修正

之前方案里“Web + Electron 兼容”这块应该删掉。

现在你的路线应该是：

```txt
Electron-only
FFmpeg-first
Transcript-first
Canvas timeline
Word-level model
Descript-style interaction
```

一句话：

> **不要做一个带波形的播放器，要做一个以 Transcript 为核心的媒体学习工作台。**
