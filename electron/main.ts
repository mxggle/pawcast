import { app, BrowserWindow, shell, ipcMain, dialog, protocol } from 'electron'
import { join, extname, sep, normalize } from 'path'
import { Readable } from 'stream'
import { pathToFileURL } from 'url'
import fs from 'fs'
import { configStore } from './configStore'
import {
  analyzeWaveform,
  getWaveformMeta,
  getWaveformLevel,
  deleteWaveformCache,
  mediaIdFromPath,
  type WaveformMeta,
} from './waveformEngine'

const isDev = process.env.NODE_ENV === 'development'
const transientApprovedFiles = new Set<string>()
const transientApprovedFolders = new Set<string>()
let settingsWindow: BrowserWindow | null = null
let nextMediaTreeWatchId = 1

type MediaTreeWatcher = {
  watcher: fs.FSWatcher
  debounceTimer: NodeJS.Timeout | null
  ownerWebContentsId: number
}

const mediaTreeWatchers = new Map<number, MediaTreeWatcher>()

type SettingsWindowTab = 'general' | 'ai'

function closeMediaTreeWatch(watchId: number): void {
  const entry = mediaTreeWatchers.get(watchId)
  if (!entry) return

  if (entry.debounceTimer) {
    clearTimeout(entry.debounceTimer)
  }
  entry.watcher.close()
  mediaTreeWatchers.delete(watchId)
}

// Register custom protocol for serving local media files.
// Must be called before app.whenReady() so the scheme is available.
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'local-media',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true,
      bypassCSP: true,
    },
  },
])

const MEDIA_EXTENSIONS = new Set([
  '.mp3', '.mp4', '.wav', '.flac', '.ogg', '.m4a', '.aac',
  '.webm', '.mkv', '.avi', '.mov', '.m4v', '.opus', '.wma',
])

const MIME_TYPES: Record<string, string> = {
  '.aac': 'audio/aac',
  '.avi': 'video/x-msvideo',
  '.flac': 'audio/flac',
  '.m4a': 'audio/mp4',
  '.m4v': 'video/x-m4v',
  '.mkv': 'video/x-matroska',
  '.mov': 'video/quicktime',
  '.mp3': 'audio/mpeg',
  '.mp4': 'video/mp4',
  '.ogg': 'audio/ogg',
  '.opus': 'audio/opus',
  '.wav': 'audio/wav',
  '.webm': 'video/webm',
  '.wma': 'audio/x-ms-wma',
}

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 16 },
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
    },
  })

  // Bypass CORS for local-whisper servers so the renderer can fetch localhost:8000.
  // Electron webRequest URL patterns do not accept explicit ports, so match the
  // local hosts and gate on the port inside the callback.
  win.webContents.session.webRequest.onHeadersReceived(
    { urls: ['http://localhost/*', 'http://127.0.0.1/*'] },
    (details, callback) => {
      const requestUrl = new URL(details.url)
      if (requestUrl.port !== '8000') {
        callback({})
        return
      }

      const responseHeaders = details.responseHeaders || {}
      const hasCorsOrigin = Object.keys(responseHeaders).some(
        (k) => k.toLowerCase() === 'access-control-allow-origin'
      )
      if (!hasCorsOrigin) {
        responseHeaders['Access-Control-Allow-Origin'] = ['*']
      }
      callback({ responseHeaders })
    }
  )

  // Open external links in the default browser, not in Electron
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  void win.loadURL(buildRendererUrl('/'))
}

function buildRendererUrl(
  route: string,
  query?: Record<string, string | undefined>,
): string {
  const baseUrl = isDev && process.env.ELECTRON_RENDERER_URL
    ? process.env.ELECTRON_RENDERER_URL
    : pathToFileURL(join(__dirname, '../renderer/index.html')).toString()
  const url = new URL(baseUrl)
  const searchParams = new URLSearchParams()

  for (const [key, value] of Object.entries(query ?? {})) {
    if (value) {
      searchParams.set(key, value)
    }
  }

  const search = searchParams.toString()
  url.hash = search ? `${route}?${search}` : route
  return url.toString()
}

async function openSettingsWindow(
  tab?: SettingsWindowTab,
  section?: string,
): Promise<void> {
  const normalizedSection = section?.trim() || undefined
  const targetUrl = buildRendererUrl('/settings-window', {
    tab,
    section: normalizedSection,
  })

  if (settingsWindow && !settingsWindow.isDestroyed()) {
    if (settingsWindow.isMinimized()) {
      settingsWindow.restore()
    }

    if (settingsWindow.webContents.getURL() !== targetUrl) {
      await settingsWindow.loadURL(targetUrl)
    }

    settingsWindow.focus()
    return
  }

  const nextSettingsWindow = new BrowserWindow({
    width: 960,
    height: 760,
    minWidth: 720,
    minHeight: 560,
    title: 'Settings',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: -100, y: -100 },
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
    },
  })

  if (process.platform === 'darwin') {
    nextSettingsWindow.setWindowButtonVisibility(false)
  }

  nextSettingsWindow.on('closed', () => {
    if (settingsWindow === nextSettingsWindow) {
      settingsWindow = null
    }
  })

  nextSettingsWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  try {
    await nextSettingsWindow.loadURL(targetUrl)
  } catch (error) {
    if (!nextSettingsWindow.isDestroyed()) {
      nextSettingsWindow.destroy()
    }
    throw error
  }

  settingsWindow = nextSettingsWindow
  nextSettingsWindow.focus()
}

// IPC: open a single audio/video file via native OS dialog
ipcMain.handle('dialog:openFile', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [
      {
        name: 'Audio / Video',
        extensions: Array.from(MEDIA_EXTENSIONS).map((e) => e.slice(1)),
      },
    ],
  })
  if (canceled || filePaths.length === 0) return null

  const approvedPath = normalize(filePaths[0])
  transientApprovedFiles.add(approvedPath)
  transientApprovedFolders.add(normalize(join(approvedPath, '..')))
  return filePaths[0]
})

// IPC: open a folder via native OS dialog
ipcMain.handle('dialog:openFolder', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    properties: ['openDirectory'],
  })
  if (canceled || filePaths.length === 0) return null

  transientApprovedFolders.add(normalize(filePaths[0]))
  return filePaths[0]
})

ipcMain.handle('shell:showInFileManager', async (_event, targetPath: string) => {
  try {
    const normalizedPath = normalize(targetPath)
    const stats = await fs.promises.stat(normalizedPath)

    if (stats.isDirectory()) {
      const result = await shell.openPath(normalizedPath)
      return result === ''
    }

    shell.showItemInFolder(normalizedPath)
    return true
  } catch (error) {
    console.error('Failed to show path in file manager:', targetPath, error)
    return false
  }
})

ipcMain.handle(
  'window:openSettings',
  async (_event, tab?: SettingsWindowTab, section?: string) => {
    await openSettingsWindow(tab, section)
  },
)

ipcMain.handle('window:closeSettings', () => {
  if (!settingsWindow || settingsWindow.isDestroyed()) {
    return
  }

  settingsWindow.close()
})

/**
 * Read source folders from the Zustand persisted state blob.
 * Falls back to the legacy top-level configStore key for older installs.
 */
function getSourceFolders(): string[] {
  const raw = configStore.get('abloop-player-storage')
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw)
      const folders = parsed?.state?.sourceFolders
      if (Array.isArray(folders)) return folders as string[]
    } catch {
      // fall through to legacy key
    }
  }
  return configStore.get('sourceFolders')
}

function getHistoryNativePaths(): string[] {
  const raw = configStore.get('abloop-player-storage')
  if (typeof raw !== 'string') {
    return []
  }

  try {
    const parsed = JSON.parse(raw)
    const history = parsed?.state?.mediaHistory
    if (!Array.isArray(history)) {
      return []
    }

    return history
      .map((item) => (typeof item?.nativePath === 'string' ? item.nativePath : null))
      .filter((path): path is string => !!path)
  } catch {
    return []
  }
}

function isPathWithin(basePath: string, targetPath: string): boolean {
  const base = normalize(basePath).toLowerCase()
  const target = normalize(targetPath).toLowerCase()
  return target === base || target.startsWith(base + sep.toLowerCase())
}

async function tryRealpath(targetPath: string): Promise<string | null> {
  try {
    return normalize(await fs.promises.realpath(targetPath))
  } catch {
    return null
  }
}

async function isPathWithinApprovedFolder(
  folderPath: string,
  normalizedTargetPath: string,
  resolvedTargetPath: string | null,
): Promise<boolean> {
  const normalizedFolderPath = normalize(folderPath)
  if (!isPathWithin(normalizedFolderPath, normalizedTargetPath)) {
    return false
  }

  const resolvedFolderPath = await tryRealpath(folderPath)
  if (!resolvedFolderPath || !resolvedTargetPath) {
    return true
  }

  return isPathWithin(resolvedFolderPath, resolvedTargetPath)
}

function decodeRequestPath(pathname: string): string {
  const decodedPath = decodeURIComponent(pathname)

  if (process.platform === 'win32') {
    if (/^\/[A-Za-z]:\//.test(decodedPath)) {
      return decodedPath.slice(1)
    }
    if (decodedPath.startsWith('//')) {
      return decodedPath
    }
  }

  return decodedPath
}

function getMediaMimeType(filePath: string): string {
  return MIME_TYPES[extname(filePath).toLowerCase()] ?? 'application/octet-stream'
}

function parseRangeHeader(
  rangeHeader: string,
  fileSize: number,
): { start: number; end: number } | null {
  const match = /^bytes=(\d*)-(\d*)$/i.exec(rangeHeader.trim())
  if (!match) {
    return null
  }

  const [, startRaw, endRaw] = match

  if (!startRaw && !endRaw) {
    return null
  }

  if (!startRaw) {
    const suffixLength = Number(endRaw)
    if (!Number.isFinite(suffixLength) || suffixLength <= 0) {
      return null
    }
    const start = Math.max(0, fileSize - suffixLength)
    return { start, end: fileSize - 1 }
  }

  const start = Number(startRaw)
  const end = endRaw ? Number(endRaw) : fileSize - 1

  if (
    !Number.isFinite(start) ||
    !Number.isFinite(end) ||
    start < 0 ||
    end < start ||
    start >= fileSize
  ) {
    return null
  }

  return {
    start,
    end: Math.min(end, fileSize - 1),
  }
}

/**
 * Verify that targetPath is within one of the user-approved source folders.
 * Uses normalized path checks first, then realpath-based checks when both sides
 * resolve successfully so symlink/junction escapes are still blocked. Falls
 * back to normalized comparisons when realpath is unavailable on network
 * volumes (e.g. SMB mounts).
 * Path comparison is case-insensitive to support Windows (NTFS).
 */
async function assertPathInSourceFolders(targetPath: string): Promise<void> {
  const sourceFolders = getSourceFolders()
  const historyNativePaths = getHistoryNativePaths()
  const normalizedTarget = normalize(targetPath)
  const resolvedTarget = await tryRealpath(targetPath)
  const hasConfiguredFolderAccess = (
    await Promise.all(
      sourceFolders.map((folder) =>
        isPathWithinApprovedFolder(folder, normalizedTarget, resolvedTarget),
      ),
    )
  ).some(Boolean)
  const resolvedHistoryPaths = await Promise.all(
    historyNativePaths.map((path) => tryRealpath(path)),
  )
  const hasHistoryAccess = historyNativePaths.some((path, index) => {
    const normalizedHistoryPath = normalize(path)
    if (normalizedTarget === normalizedHistoryPath) {
      return true
    }

    if (!resolvedTarget) {
      return false
    }

    const resolvedHistoryPath = resolvedHistoryPaths[index]
    if (!resolvedHistoryPath) {
      return false
    }

    return resolvedTarget === resolvedHistoryPath
  })
  const hasTransientFolderAccess = (
    await Promise.all(
      Array.from(transientApprovedFolders).map((folder) =>
        isPathWithinApprovedFolder(folder, normalizedTarget, resolvedTarget),
      ),
    )
  ).some(Boolean)
  const hasTransientAccess =
    transientApprovedFiles.has(normalizedTarget) || hasTransientFolderAccess
  const hasConfiguredAccess = hasConfiguredFolderAccess || hasHistoryAccess
  const isApproved = hasConfiguredAccess || hasTransientAccess
  if (!isApproved) {
    throw new Error('Path is outside approved source folders')
  }
}

// IPC: list media files in a folder (non-recursive)
ipcMain.handle('fs:listMediaFiles', async (_event, folderPath: string) => {
  await assertPathInSourceFolders(folderPath)
  const entries = await fs.promises.readdir(folderPath, { withFileTypes: true })
  return entries
    .filter(
      (e) => e.isFile() && MEDIA_EXTENSIONS.has(extname(e.name).toLowerCase()),
    )
    .map((e) => ({ name: e.name, path: join(folderPath, e.name) }))
})

export interface FolderTreeNode {
  name: string
  path: string
  type: 'file' | 'directory'
  children?: FolderTreeNode[]
}

async function buildMediaTree(
  dirPath: string,
  depth: number,
  visited: Set<string>,
): Promise<FolderTreeNode[]> {
  if (depth <= 0) return []
  // Resolve symlinks for cycle detection; fall back to normalized path on failure
  // (realpath can fail on network volumes due to Electron's asar fs patches)
  let realPath: string
  try {
    realPath = await fs.promises.realpath(dirPath)
  } catch {
    realPath = normalize(dirPath)
  }
  if (visited.has(realPath)) return []
  visited.add(realPath)

  let entries: fs.Dirent[]
  try {
    entries = await fs.promises.readdir(dirPath, { withFileTypes: true })
  } catch {
    return []
  }

  const nodes: FolderTreeNode[] = []
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue
    const fullPath = join(dirPath, entry.name)
    if (entry.isDirectory()) {
      const children = await buildMediaTree(fullPath, depth - 1, visited)
      // Only include directories that contain media (directly or transitively)
      if (children.length > 0) {
        nodes.push({ name: entry.name, path: fullPath, type: 'directory', children })
      }
    } else if (
      entry.isFile() &&
      MEDIA_EXTENSIONS.has(extname(entry.name).toLowerCase())
    ) {
      nodes.push({ name: entry.name, path: fullPath, type: 'file' })
    }
  }
  return nodes
}

// IPC: list media files as a recursive tree
ipcMain.handle('fs:listMediaTree', async (_event, folderPath: string) => {
  await assertPathInSourceFolders(folderPath)
  return buildMediaTree(folderPath, 10, new Set())
})

ipcMain.handle('fs:watchMediaTree', async (event, folderPath: string) => {
  await assertPathInSourceFolders(folderPath)

  const normalizedFolderPath = normalize(folderPath)
  const watchId = nextMediaTreeWatchId++
  const sender = event.sender

  const handleChange = (_eventType: string, changedName: string | Buffer | null) => {
    const entry = mediaTreeWatchers.get(watchId)
    if (entry?.debounceTimer) {
      clearTimeout(entry.debounceTimer)
    }

    const debounceTimer = setTimeout(() => {
      if (sender.isDestroyed()) {
        closeMediaTreeWatch(watchId)
        return
      }

      sender.send('fs:mediaTreeChanged', {
        folderPath,
        changedPath: changedName
          ? join(normalizedFolderPath, changedName.toString())
          : null,
      })
    }, 250)

    if (entry) {
      entry.debounceTimer = debounceTimer
    }
  }

  let watcher: fs.FSWatcher
  try {
    watcher = fs.watch(normalizedFolderPath, { recursive: true }, handleChange)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ERR_FEATURE_UNAVAILABLE_ON_PLATFORM') {
      throw error
    }
    watcher = fs.watch(normalizedFolderPath, handleChange)
  }

  mediaTreeWatchers.set(watchId, {
    watcher,
    debounceTimer: null,
    ownerWebContentsId: sender.id,
  })

  sender.once('destroyed', () => {
    closeMediaTreeWatch(watchId)
  })

  return watchId
})

ipcMain.handle('fs:unwatchMediaTree', (event, watchId: number) => {
  const entry = mediaTreeWatchers.get(watchId)
  if (entry?.ownerWebContentsId === event.sender.id) {
    closeMediaTreeWatch(watchId)
  }
})

// IPC: config store
ipcMain.handle('config:get', (_event, key: string) => {
  return configStore.get(key as any)
})

ipcMain.handle('config:set', (_event, key: string, value: unknown) => {
  configStore.set(key as any, value as any)
})

ipcMain.handle('config:getAll', () => {
  return configStore.store
})

ipcMain.handle('net:fetch', async (_event, url: string, options: RequestInit) => {
  try {
    const response = await fetch(url, options)
    const data = await response.text()
    return {
      ok: response.ok,
      status: response.status,
      statusText: response.statusText,
      data,
      headers: Object.fromEntries(response.headers.entries())
    }
  } catch (error) {
    return {
      ok: false,
      status: 500,
      statusText: 'Network Error',
      data: error instanceof Error ? error.message : String(error),
      headers: {}
    }
  }
})


// IPC: waveform analysis
ipcMain.handle('waveform:analyze', async (event, params: { filePath: string; mediaId: string }) => {
  await assertPathInSourceFolders(params.filePath)
  const mediaId = params.mediaId || mediaIdFromPath(params.filePath)

  const meta = await analyzeWaveform({
    filePath: params.filePath,
    mediaId,
    onProgress: (fraction) => {
      if (!event.sender.isDestroyed()) {
        event.sender.send('waveform:analyzeProgress', { mediaId, fraction })
      }
    },
  })

  return meta
})

ipcMain.handle('waveform:getMeta', async (_event, mediaId: string) => {
  return getWaveformMeta(mediaId)
})

ipcMain.handle('waveform:getLevel', async (_event, params: { mediaId: string; level: number }) => {
  const data = await getWaveformLevel(params.mediaId, params.level)
  if (!data) return null
  // Transfer typed arrays to renderer (they get serialized as regular arrays over IPC)
  return {
    mediaId: data.mediaId,
    level: data.level,
    samplesPerPeak: data.samplesPerPeak,
    sampleRate: data.sampleRate,
    min: Array.from(data.min),
    max: Array.from(data.max),
    rms: Array.from(data.rms),
  }
})

ipcMain.handle('waveform:delete', async (_event, mediaId: string) => {
  deleteWaveformCache(mediaId)
})

app.whenReady().then(() => {
  // Serve local media files through the local-media:// protocol.
  // URL format: local-media://media/ENCODED_PATH
  protocol.handle('local-media', async (request) => {
    const url = new URL(request.url)
    const filePath = decodeRequestPath(url.pathname)
    // Security: only serve files within approved source folders
    await assertPathInSourceFolders(filePath)

    const stats = await fs.promises.stat(filePath)
    if (!stats.isFile()) {
      return new Response('Not found', { status: 404 })
    }

    const headers = new Headers({
      'Accept-Ranges': 'bytes',
      'Content-Type': getMediaMimeType(filePath),
      'Cache-Control': 'no-store',
    })

    if (request.method === 'HEAD') {
      headers.set('Content-Length', String(stats.size))
      return new Response(null, { status: 200, headers })
    }

    const rangeHeader = request.headers.get('range')
    if (rangeHeader) {
      const range = parseRangeHeader(rangeHeader, stats.size)
      if (!range) {
        headers.set('Content-Range', `bytes */${stats.size}`)
        return new Response(null, { status: 416, headers })
      }

      const { start, end } = range
      headers.set('Content-Length', String(end - start + 1))
      headers.set('Content-Range', `bytes ${start}-${end}/${stats.size}`)

      const stream = fs.createReadStream(filePath, { start, end })
      return new Response(Readable.toWeb(stream) as ReadableStream, {
        status: 206,
        headers,
      })
    }

    headers.set('Content-Length', String(stats.size))
    const stream = fs.createReadStream(filePath)
    return new Response(Readable.toWeb(stream) as ReadableStream, {
      status: 200,
      headers,
    })
  })

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
