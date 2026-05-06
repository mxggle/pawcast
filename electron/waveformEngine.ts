import { spawn } from 'child_process'
import { join } from 'path'
import fs from 'fs'
import { app } from 'electron'

export interface WaveformLevelMeta {
  level: number
  samplesPerPeak: number
  points: number
  path: string
}

export interface WaveformMeta {
  mediaId: string
  duration: number
  sampleRate: number
  levels: WaveformLevelMeta[]
}

export interface WaveformLevelData {
  mediaId: string
  level: number
  samplesPerPeak: number
  sampleRate: number
  min: Int16Array
  max: Int16Array
  rms: Uint16Array
}

/** Samples aggregated per "peak" at each zoom level. */
export const WAVEFORM_LEVEL_SAMPLES = [256, 512, 1024, 2048, 4096, 8192, 16384, 32768, 65536]

/** Size per point in the binary cache: 2×int16 (min, max) + 1×uint16 (rms) = 6 bytes. */
const BYTES_PER_POINT = 6

function cacheDir(): string {
  return join(app.getPath('userData'), 'waveform-cache')
}

function mediaDir(mediaId: string): string {
  return join(cacheDir(), mediaId)
}

function metaPath(mediaId: string): string {
  return join(mediaDir(mediaId), 'meta.json')
}

function levelPath(mediaId: string, level: number): string {
  return join(mediaDir(mediaId), `level-${level}.bin`)
}

/** Sum of absolute path chars → short hex string. */
function hashPath(filePath: string): string {
  let h = 0
  for (let i = 0; i < filePath.length; i++) {
    h = ((h << 5) - h + filePath.charCodeAt(i)) | 0
  }
  return (h >>> 0).toString(16)
}

/** Derive mediaId from filePath when the caller doesn't have one. */
export function mediaIdFromPath(filePath: string): string {
  return `media-${hashPath(filePath)}`
}

// ─── ffprobe ────────────────────────────────────────────────

async function probeDuration(filePath: string): Promise<{ duration: number; sampleRate: number }> {
  return new Promise((resolve, reject) => {
    const proc = spawn('ffprobe', [
      '-v', 'quiet',
      '-print_format', 'json',
      '-show_format',
      '-show_streams',
      filePath,
    ])

    let stdout = ''
    let stderr = ''

    proc.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString() })
    proc.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString() })

    proc.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`ffprobe exited ${code}: ${stderr}`))
        return
      }
      try {
        const info = JSON.parse(stdout)
        const formatDur = parseFloat(info.format?.duration) || 0
        const audioStream = (info.streams || []).find((s: any) => s.codec_type === 'audio')
        const streamDur = parseFloat(audioStream?.duration) || formatDur
        const sampleRate = parseInt(audioStream?.sample_rate, 10) || 44100
        resolve({ duration: streamDur, sampleRate })
      } catch (e) {
        reject(e)
      }
    })

    proc.on('error', reject)
  })
}

// ─── PCM decode + analysis ─────────────────────────────────

interface AnalysisProgress {
  onProgress?: (fraction: number) => void
}

async function decodePCM(
  filePath: string,
  sampleRate: number,
  progress: AnalysisProgress,
): Promise<{ chunks: Buffer[]; totalSamples: number }> {
  const args = [
    '-i', filePath,
    '-f', 's16le',
    '-acodec', 'pcm_s16le',
    '-ar', String(sampleRate),
    '-ac', '1',
    '-',
  ]

  return new Promise((resolve, reject) => {
    const proc = spawn('ffmpeg', args, { stdio: ['ignore', 'pipe', 'pipe'] })
    const chunks: Buffer[] = []
    let totalBytes = 0
    let stderr = ''

    proc.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString() })

    proc.stdout.on('data', (chunk: Buffer) => {
      chunks.push(chunk)
      totalBytes += chunk.length
    })

    proc.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`ffmpeg exited ${code}: ${stderr.slice(-200)}`))
        return
      }
      resolve({
        chunks,
        totalSamples: Math.floor(totalBytes / 2), // s16le = 2 bytes per sample
      })
    })

    proc.on('error', reject)
  })
}

/** Compute min/max/rms for a single window of Int16Array samples. */
function computeWindowStats(
  samples: Int16Array,
  start: number,
  end: number,
): { min: number; max: number; rms: number } {
  let min = 32767
  let max = -32768
  let sumSq = 0
  const len = end - start

  for (let i = start; i < end; i++) {
    const v = samples[i]
    if (v < min) min = v
    if (v > max) max = v
    sumSq += v * v
  }

  return {
    min,
    max,
    rms: Math.round(Math.sqrt(sumSq / len)),
  }
}

/** Merge consecutive finest-level points into a single coarser point. */
function combineWindows(
  finest: { min: Int16Array; max: Int16Array; rms: Uint16Array },
  start: number,
  end: number,
): { min: number; max: number; rms: number } {
  let min = 32767
  let max = -32768
  let sumSqRms = 0
  const len = end - start

  for (let i = start; i < end; i++) {
    if (finest.min[i] < min) min = finest.min[i]
    if (finest.max[i] > max) max = finest.max[i]
    sumSqRms += finest.rms[i] * finest.rms[i]
  }

  return {
    min,
    max,
    rms: Math.round(Math.sqrt(sumSqRms / len)),
  }
}

// ─── Binary I/O ────────────────────────────────────────────

function writeLevelBinary(
  filePath: string,
  min: Int16Array,
  max: Int16Array,
  rms: Uint16Array,
): void {
  const points = min.length
  const buf = Buffer.allocUnsafe(points * BYTES_PER_POINT)

  for (let i = 0; i < points; i++) {
    const off = i * BYTES_PER_POINT
    buf.writeInt16LE(min[i], off)
    buf.writeInt16LE(max[i], off + 2)
    buf.writeUInt16LE(rms[i], off + 4)
  }

  fs.writeFileSync(filePath, buf)
}

function readLevelBinary(filePath: string): {
  min: Int16Array
  max: Int16Array
  rms: Uint16Array
} {
  const buf = fs.readFileSync(filePath)
  const points = Math.floor(buf.length / BYTES_PER_POINT)
  const min = new Int16Array(points)
  const max = new Int16Array(points)
  const rms = new Uint16Array(points)

  for (let i = 0; i < points; i++) {
    const off = i * BYTES_PER_POINT
    min[i] = buf.readInt16LE(off)
    max[i] = buf.readInt16LE(off + 2)
    rms[i] = buf.readUInt16LE(off + 4)
  }

  return { min, max, rms }
}

// ─── Public API ────────────────────────────────────────────

export async function analyzeWaveform(params: {
  filePath: string
  mediaId: string
  sampleRate?: number
  onProgress?: (fraction: number) => void
}): Promise<WaveformMeta> {
  const { filePath, mediaId, sampleRate = 44100, onProgress } = params

  const dir = mediaDir(mediaId)
  fs.mkdirSync(dir, { recursive: true })

  // Get metadata
  onProgress?.(0.02)
  const { duration } = await probeDuration(filePath)

  // Decode PCM
  onProgress?.(0.05)
  const { chunks: rawChunks, totalSamples } = await decodePCM(filePath, sampleRate, {
    onProgress: (f) => onProgress?.(0.05 + f * 0.75),
  })

  // Concatenate into a single buffer then wrap as Int16Array
  onProgress?.(0.80)
  const rawBuf = Buffer.concat(rawChunks)
  const samples = new Int16Array(
    rawBuf.buffer,
    rawBuf.byteOffset,
    Math.floor(rawBuf.length / 2),
  )

  // Finest level (256 samples per peak)
  const finestSPS = WAVEFORM_LEVEL_SAMPLES[0]
  const finestPoints = Math.max(1, Math.floor(totalSamples / finestSPS))
  const finestMin = new Int16Array(finestPoints)
  const finestMax = new Int16Array(finestPoints)
  const finestRms = new Uint16Array(finestPoints)

  for (let i = 0; i < finestPoints; i++) {
    const start = i * finestSPS
    const end = Math.min(totalSamples, start + finestSPS)
    const { min, max, rms } = computeWindowStats(samples, start, end)
    finestMin[i] = min
    finestMax[i] = max
    finestRms[i] = rms
  }

  onProgress?.(0.85)

  // Save finest level
  const levels: WaveformLevelMeta[] = []
  const finestPath = levelPath(mediaId, finestSPS)
  writeLevelBinary(finestPath, finestMin, finestMax, finestRms)
  levels.push({
    level: finestSPS,
    samplesPerPeak: finestSPS,
    points: finestPoints,
    path: finestPath,
  })

  // Derive and save coarser levels
  for (let li = 1; li < WAVEFORM_LEVEL_SAMPLES.length; li++) {
    const sps = WAVEFORM_LEVEL_SAMPLES[li]
    const ratio = sps / finestSPS
    const coarsePoints = Math.max(1, Math.floor(finestPoints / ratio))
    const coarseMin = new Int16Array(coarsePoints)
    const coarseMax = new Int16Array(coarsePoints)
    const coarseRms = new Uint16Array(coarsePoints)

    for (let i = 0; i < coarsePoints; i++) {
      const start = i * ratio
      const end = Math.min(finestPoints, start + ratio)
      const { min, max, rms } = combineWindows(
        { min: finestMin, max: finestMax, rms: finestRms },
        start,
        end,
      )
      coarseMin[i] = min
      coarseMax[i] = max
      coarseRms[i] = rms
    }

    const lvlPath = levelPath(mediaId, sps)
    writeLevelBinary(lvlPath, coarseMin, coarseMax, coarseRms)
    levels.push({
      level: sps,
      samplesPerPeak: sps,
      points: coarsePoints,
      path: lvlPath,
    })
  }

  // Write metadata
  const meta: WaveformMeta = { mediaId, duration, sampleRate, levels }
  fs.writeFileSync(metaPath(mediaId), JSON.stringify(meta, null, 2))

  onProgress?.(1)
  return meta
}

export async function getWaveformMeta(mediaId: string): Promise<WaveformMeta | null> {
  try {
    const raw = fs.readFileSync(metaPath(mediaId), 'utf-8')
    return JSON.parse(raw) as WaveformMeta
  } catch {
    return null
  }
}

export async function getWaveformLevel(
  mediaId: string,
  level: number,
): Promise<WaveformLevelData | null> {
  const meta = await getWaveformMeta(mediaId)
  if (!meta) return null

  const lvlMeta = meta.levels.find((l) => l.level === level)
  if (!lvlMeta) return null

  const { min, max, rms } = readLevelBinary(lvlMeta.path)

  return {
    mediaId,
    level,
    samplesPerPeak: lvlMeta.samplesPerPeak,
    sampleRate: meta.sampleRate,
    min,
    max,
    rms,
  }
}

export function deleteWaveformCache(mediaId: string): void {
  const dir = mediaDir(mediaId)
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true })
  }
}

/** Choose the best waveform level for a given viewport. */
export function chooseLevel(params: {
  levels: WaveformLevelMeta[]
  visibleDuration: number
  canvasWidth: number
  sampleRate: number
}): WaveformLevelMeta {
  const secondsPerPixel = params.visibleDuration / Math.max(1, params.canvasWidth)
  const samplesPerPixel = secondsPerPixel * params.sampleRate

  return (
    params.levels.find((l) => l.samplesPerPeak >= samplesPerPixel) ??
    params.levels[params.levels.length - 1]
  )
}
