export const isElectron = (): boolean => true

export const getPlatform = (): string =>
  window.electronAPI?.platform ?? 'electron'

const ensureLeadingSlash = (path: string): string =>
  path.startsWith('/') ? path : `/${path}`

const encodePathForUrl = (path: string): string =>
  ensureLeadingSlash(path)
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/')

/**
 * Convert a native filesystem path to a URL suitable for <audio>/<video>.
 * Uses the custom local-media:// protocol which bypasses
 * cross-origin restrictions that block file:// URLs in dev mode.
 */
export const nativePathToUrl = (filePath: string): string => {
  const normalized = filePath.replace(/\\/g, '/')
  const encodedPath = encodePathForUrl(normalized)
  return `local-media://media${encodedPath}`
}
