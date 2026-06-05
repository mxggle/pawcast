export interface ProbeAudioMetadata {
  duration: number
  sampleRate: number
}

interface FfprobeStream {
  codec_type?: string
  duration?: string
  sample_rate?: string
}

interface FfprobeOutput {
  format?: {
    duration?: string
  }
  streams?: FfprobeStream[]
}

export class NoAudioStreamError extends Error {
  constructor(filePath: string) {
    super(`No audio stream found in media file: ${filePath}`)
    this.name = 'NoAudioStreamError'
  }
}

export function parseProbeAudioMetadata(info: FfprobeOutput): ProbeAudioMetadata | null {
  const audioStream = (info.streams || []).find((stream) => stream.codec_type === 'audio')
  if (!audioStream) return null

  const formatDur = parseFloat(info.format?.duration || '') || 0
  const streamDur = parseFloat(audioStream.duration || '') || formatDur
  const sampleRate = parseInt(audioStream.sample_rate || '', 10) || 44100

  return { duration: streamDur, sampleRate }
}
