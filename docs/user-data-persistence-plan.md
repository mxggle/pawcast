# 用户数据持久化与防丢失技术方案

## 1. 背景与目标

当前应用的用户数据分散在多个存储位置：

- Electron `electron-store`：保存部分 Zustand persist 数据。
- 浏览器 `localStorage`：保存 AI 设置、录音索引、部分 UI 偏好。
- IndexedDB：保存导入媒体文件、转写数据、录音音频文件、部分波形缓存。
- Electron `userData/waveform-cache`：保存桌面端波形缓存文件。

这种结构的问题是：数据入口分散、迁移困难、恢复路径不清晰、录音索引与录音文件可能不同步。目标是建立一套 Electron 优先的本地数据目录，让用户产生的核心数据都保存到可见、可备份、可迁移的文件结构中，并为未来迁移到 SQLite 或后端服务保留清晰边界。

本方案中的“防丢失”定义为：应用崩溃、升级失败、写入中断、单个数据文件损坏、旧数据迁移失败时，能通过原子写入、journal、snapshot 或旧存储恢复。它不承诺抵抗磁盘物理损坏、用户手动删除整个数据目录、系统级加密盘故障等外部灾难。

## 2. 当前用户数据盘点

核心用户数据包括：

- 媒体库数据：本地文件历史、YouTube 历史、播放进度、来源文件夹、媒体文件夹、排序、过滤、侧边栏状态。
- 收藏夹 / AB Loop 书签：书签名称、开始/结束时间、播放速率、注释、关联 transcript segment/word。
- 转写数据：每个 mediaId 的 transcript segments、word timestamps、confidence、final 状态。
- 转写学习数据：每个 segment 的学习项、CEFR/JLPT level、单词/表达标注。
- 生词本 / 词汇收藏：选中文本、上下文、mediaId、segmentId、时间范围。
- 导入媒体文件：用户导入的 File/Blob、本地文件元数据、storageId。
- Shadowing 录音：录音音频文件、录音时间范围、peaks、segmentId。
- Sentence Practice 录音：句子索引、录音音频文件、duration、createdAt、peaks。
- AI / 转写服务配置：provider、model、base URL、temperature、max tokens、target language、API keys。
- UI 和应用设置：主题、布局、面板开关、transcript toggles、pane size。

非核心但需要管理的数据：

- 波形缓存：可重建，不应作为必须备份的核心数据。

## 3. 推荐数据目录结构

第一版以 Electron 为主。默认数据目录：

```text
<electron userData>/PawcastData/
```

用户可以在设置中修改为指定文件夹。修改目录时必须迁移并校验现有数据，失败时保留旧目录并回滚。

推荐目录结构：

```text
PawcastData/
  manifest.json
  settings/
    app-settings.json
    ai-settings.json
    layout-settings.json
  library/
    media-sources.json
    media-history.json
    media-folders.json
  study/
    bookmarks.json
    glossary.json
    transcripts/
      <mediaId>.json
    transcript-study/
      <mediaId>.json
  recordings/
    shadowing/
      index.json
      files/
        <recordingId>.<ext>
    sentence-practice/
      index.json
      files/
        <recordingId>.<ext>
  media/
    imported/
      index.json
      files/
        <mediaFileId>.<ext>
  cache/
    waveform/
      <mediaId>/
        meta.json
        level-*.bin
  backups/
    snapshots/
    journal/
```

## 4. Manifest 设计

`manifest.json` 是数据目录入口，用于校验、迁移和恢复。

建议字段：

```json
{
  "schemaVersion": 1,
  "appVersion": "x.y.z",
  "deviceId": "uuid",
  "createdAt": 1710000000000,
  "updatedAt": 1710000000000,
  "activeDataDir": "/absolute/path/to/PawcastData",
  "files": [
    {
      "path": "library/media-history.json",
      "version": 1,
      "updatedAt": 1710000000000,
      "checksum": "sha256..."
    }
  ],
  "latestSnapshot": {
    "path": "backups/snapshots/2026-05-07T120000Z.zip",
    "createdAt": 1710000000000,
    "checksum": "sha256..."
  }
}
```

规则：

- 每个核心 JSON 文件写入后更新 manifest。
- 启动时校验 manifest 与关键文件 checksum。
- manifest 本身也使用原子写入。
- manifest 损坏时，尝试从最近 snapshot 或 journal 恢复。

## 5. 数据模型设计

长期存储格式避免保存 Zustand 大对象，改用扁平、表式 JSON，方便未来迁移 SQLite。

### 5.1 媒体历史

`library/media-history.json`

```json
{
  "version": 1,
  "items": [
    {
      "id": "history-...",
      "mediaId": "file-... | youtube-...",
      "type": "file",
      "name": "lesson.mp4",
      "accessedAt": 1710000000000,
      "playbackTime": 123.45,
      "folderId": null,
      "nativePath": "/path/to/file.mp4",
      "storageId": null,
      "fileData": {
        "name": "lesson.mp4",
        "type": "video/mp4",
        "size": 123456
      },
      "youtubeData": null
    }
  ]
}
```

### 5.2 收藏夹

`study/bookmarks.json`

```json
{
  "version": 1,
  "bookmarks": [
    {
      "id": "bookmark-...",
      "mediaId": "youtube-abc",
      "name": "Useful phrase",
      "start": 10.2,
      "end": 14.8,
      "createdAt": 1710000000000,
      "playbackRate": 0.8,
      "annotation": "note",
      "segmentIds": ["segment-..."],
      "wordIds": ["word-..."]
    }
  ]
}
```

### 5.3 转写数据

`study/transcripts/<mediaId>.json`

```json
{
  "version": 1,
  "mediaId": "youtube-abc",
  "updatedAt": 1710000000000,
  "segments": [
    {
      "id": "segment-...",
      "text": "Hello world.",
      "startTime": 0,
      "endTime": 2.5,
      "confidence": 0.98,
      "isFinal": true,
      "words": []
    }
  ]
}
```

### 5.4 转写学习数据

`study/transcript-study/<mediaId>.json`

```json
{
  "version": 1,
  "mediaId": "youtube-abc",
  "updatedAt": 1710000000000,
  "segmentStudies": [
    {
      "segmentId": "segment-...",
      "levelSystem": "cefr",
      "updatedAt": 1710000000000,
      "items": []
    }
  ]
}
```

### 5.5 生词本

`study/glossary.json`

```json
{
  "version": 1,
  "entries": [
    {
      "id": "glossary-...",
      "mediaId": "youtube-abc",
      "mediaName": "Video title",
      "mediaType": "youtube",
      "youtubeId": "abc",
      "segmentId": "segment-...",
      "text": "phrase",
      "contextText": "full sentence",
      "selectionStart": 0,
      "selectionEnd": 6,
      "startTime": 10.2,
      "endTime": 14.8,
      "createdAt": 1710000000000,
      "updatedAt": 1710000000000
    }
  ]
}
```

### 5.6 录音数据

录音文件使用真实文件保存，索引只保存相对路径。

`recordings/shadowing/index.json`

```json
{
  "version": 1,
  "segments": [
    {
      "id": "recording-...",
      "mediaId": "youtube-abc",
      "startTime": 12.3,
      "duration": 4.5,
      "filePath": "files/recording-....webm",
      "fileOffset": 0,
      "segmentId": "segment-...",
      "peaks": [],
      "peakTimes": [],
      "createdAt": 1710000000000
    }
  ]
}
```

`recordings/sentence-practice/index.json`

```json
{
  "version": 1,
  "recordings": [
    {
      "id": "recording-...",
      "mediaId": "youtube-abc",
      "sentenceIndex": 3,
      "filePath": "files/recording-....webm",
      "duration": 2.1,
      "createdAt": 1710000000000,
      "peaks": []
    }
  ]
}
```

## 6. Electron 数据服务设计

新增 Electron 主进程数据服务 `dataStore`，作为所有文件读写入口。

建议 IPC：

- `data:get(path)`
- `data:put(path, data, options)`
- `data:delete(path, options)`
- `data:list(path)`
- `data:exportSnapshot()`
- `data:changeDirectory(targetPath)`
- `data:healthCheck()`
- `data:recover(strategy)`

主进程负责：

- 路径规范化，禁止路径逃逸。
- 创建默认数据目录。
- 原子写入 JSON。
- 大文件写入和相对路径管理。
- journal 与 snapshot。
- manifest checksum 维护。
- 数据目录迁移与回滚。

Renderer 不直接写文件系统。

## 7. Renderer Repository 设计

新增 renderer 侧 repository 层，替代组件和 store 直接访问 `localStorage`、IndexedDB、`electron-store`。

建议模块：

- `settingsRepository`
- `libraryRepository`
- `bookmarkRepository`
- `transcriptRepository`
- `glossaryRepository`
- `recordingRepository`
- `mediaFileRepository`

Zustand 负责运行态状态；持久化数据通过 repository hydrate/save。

原则：

- 不再持久化整份 player store blob。
- 不在组件里直接 `localStorage.setItem`。
- 大文件先写文件，再写 index。
- index 文件中的文件引用必须是相对路径。
- 读写 API 使用业务实体，而不是原始文件路径。

## 8. 写入可靠性设计

所有核心 JSON 写入使用原子流程：

1. 读取当前 manifest。
2. 写 journal entry：`pending`。
3. 将目标 JSON 写到临时文件：`file.json.tmp-<uuid>`。
4. flush/fsync 临时文件。
5. rename 临时文件覆盖正式文件。
6. 更新 manifest checksum。
7. 将 journal entry 标记为 `committed`。

如果应用在步骤中崩溃：

- 启动时扫描 journal。
- 对 `pending` entry 检查目标文件与临时文件。
- 能确认完成则补写 manifest。
- 不能确认则回滚到上一个 snapshot 或保留旧文件。

## 9. 备份与恢复

### 9.1 Snapshot

建议策略：

- 每日最多生成一次完整 snapshot。
- 保留最近 7 个日备份。
- 保留最近 4 个周备份。
- snapshot 包含核心 JSON、录音文件、导入媒体文件。
- cache 默认不进入 snapshot，除非用户选择完整备份。

### 9.2 Journal

journal 用于恢复最近写入，保存到：

```text
backups/journal/
```

每条 journal 记录包含：

- operation id
- operation type
- target path
- before checksum
- after checksum
- timestamp
- status: pending | committed | rolled_back

### 9.3 启动恢复顺序

启动时执行轻量 health check：

1. 检查 manifest 是否可读。
2. 校验核心 JSON 是否可解析。
3. 校验 checksum。
4. 检查录音索引引用的文件是否存在。
5. 检查导入媒体索引引用的文件是否存在。

发现异常时恢复顺序：

1. 重放 committed journal。
2. 回滚 pending journal。
3. 从最近 snapshot 恢复损坏文件。
4. 从旧 `electron-store`、`localStorage`、IndexedDB 遗留数据再次迁移。
5. 仍失败时进入只读恢复模式，提示用户导出可恢复数据。

## 10. 数据目录切换

设置页增加“数据目录”管理能力：

- 显示当前数据目录。
- 打开数据目录。
- 修改数据目录。
- 导出备份。
- 运行健康检查。

修改目录流程：

1. 暂停新的写入。
2. 创建目标目录。
3. 复制核心 JSON、大文件、manifest。
4. 校验目标目录 checksum。
5. 写入新 active data dir 配置。
6. 重启或重新 hydrate。
7. 旧目录保留为 rollback，不自动删除。

失败时：

- 不切换 active path。
- 保留旧目录。
- 显示错误和恢复建议。

## 11. 旧数据迁移策略

迁移来源：

- `abloop-player-storage`
- `layout-storage`
- `theme-storage`
- `abloop-settings-storage`
- `shadowing-store`
- `sentence-practice-store`
- AI 相关 `localStorage` keys
- Transcript UI 相关 `localStorage` keys
- IndexedDB `abloop-media-storage`
- Electron waveform cache

迁移规则：

- 首次发现新数据目录不存在时自动迁移。
- 迁移成功后保留旧存储，不立即删除。
- manifest 记录 migration status。
- 迁移必须幂等；重复运行不会产生重复书签、重复录音或重复媒体历史。
- IndexedDB 中的 Blob 写入 `media/imported/files` 或 `recordings/*/files`。
- 原有 storageId 映射到新的 filePath，并记录在 migration map 中。

## 12. SQLite 兼容性设计

为未来 SQLite 做准备：

- JSON 文件使用表式数组，不使用深层 Zustand 状态树作为长期格式。
- 每条实体都有稳定 ID。
- 关系通过外键字段表示：`mediaId`、`segmentId`、`recordingId`、`folderId`。
- 每个 JSON 文件对应未来一张或几张表。
- 每个文件都有 `version`。
- 每次 schema 变化都提供迁移函数。

未来 SQLite 表可以直接映射为：

- `media_history`
- `media_folders`
- `media_sources`
- `bookmarks`
- `transcripts`
- `transcript_segments`
- `transcript_words`
- `transcript_study_items`
- `glossary_entries`
- `shadowing_recordings`
- `sentence_recordings`
- `imported_media_files`
- `settings`

## 13. 安全与隐私

API keys 属于敏感数据，不建议长期明文混在普通业务 JSON 中。

推荐优先级：

1. Electron 使用系统 keychain 保存 API keys。
2. `ai-settings.json` 只保存 provider、model、base URL 等非敏感配置。
3. 如果第一版暂不接 keychain，API keys 单独保存在 `settings/ai-settings.json`，并在文档和 UI 中明确说明是本机明文保存。

本地文件路径可能包含用户名或隐私信息，应只存必要路径，并在导出备份前提示用户。

## 14. Cache 与核心数据边界

核心数据：

- 播放历史
- 来源文件夹
- 媒体文件夹
- 书签
- 转写
- 转写学习数据
- glossary
- shadowing 录音索引与音频
- sentence practice 录音索引与音频
- 导入媒体文件
- 用户设置

可重建 cache：

- 波形分析结果
- 临时 object URL
- 转写过程中的临时状态
- UI 运行态状态

cache 损坏时可以删除并重建；核心数据不得静默删除。

## 15. 测试计划

### 单元测试

- 原子写入成功。
- 写入中断后 journal 恢复。
- checksum 不匹配时进入恢复流程。
- schema migration round trip。
- repository save/load round trip。
- 旧存储到新数据目录的迁移映射。

### 集成测试

- 新用户首次启动创建数据目录。
- 老用户自动迁移现有播放历史、书签、转写、glossary、录音和设置。
- 添加书签后重启，书签仍存在。
- 导入 transcript 后重启，转写仍存在。
- 生成 AI transcript 后重启，转写和学习数据仍存在。
- 录制 shadowing 后重启，索引和音频都可播放。
- 录制 sentence practice 后重启，索引和音频都可播放。
- 修改数据目录后重启，数据仍存在。
- 模拟 JSON 文件损坏后可从 snapshot 恢复。
- 模拟录音文件丢失时 health check 能报告 orphan reference。

### 手动验收

- 完整使用一轮：本地文件、YouTube、书签、转写、生词、shadowing 录音、sentence practice 录音。
- 正常退出重启后数据存在。
- 强制杀进程后重启，数据存在或可恢复。
- 切换到用户指定目录后重启，数据存在。
- 导出 snapshot 后，在干净环境恢复成功。

## 16. 实施阶段建议

### Phase 1：只读数据审计与 repository 接口

- 定义长期 JSON schema。
- 新增 repository 接口和类型。
- 不改变现有行为。

### Phase 2：Electron dataStore 与基础 JSON 持久化

- 实现数据目录、manifest、原子写入。
- 迁移设置、播放历史、书签、glossary。

### Phase 3：转写与学习数据迁移

- 将 transcript 和 transcript-study 从 IndexedDB 迁到文件。
- 保留 IndexedDB 读取 fallback。

### Phase 4：录音和导入媒体文件迁移

- 将 IndexedDB Blob 导出到真实文件。
- 将 shadowing / sentence practice index 迁到 JSON。
- 建立 orphan 文件清理和 health check。

### Phase 5：备份、恢复、数据目录切换

- 实现 snapshot、journal replay、目录切换、导出/恢复。

## 17. 明确假设

- 第一版以 Electron 为主。
- Web 端暂时保留 IndexedDB/localStorage，后续提供导出/导入适配。
- 默认数据目录是 `<electron userData>/PawcastData`。
- 用户可以在设置中改为指定文件夹。
- 波形数据是 cache，不作为必须备份的核心用户数据。
- 旧存储迁移成功后先保留，不立即删除。
- API keys 后续优先迁移到 OS keychain。

