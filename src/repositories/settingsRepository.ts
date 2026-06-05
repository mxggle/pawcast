import type { AppSettingsFile, AISettingsFile, LayoutSettingsFile, ThemeSettingsFile } from '../types/persistence'
import { dataClient } from './dataClient'

const DEFAULT_APP_SETTINGS: AppSettingsFile = {
  version: 1,
  volume: 1,
  muted: false,
  playbackRate: 1,
  showTranscript: true,
  transcriptLanguage: 'en',
  seekStepSeconds: 5,
  seekSmallStepSeconds: 1,
  seekMode: 'relative',
  waveformZoom: 1,
  showWaveform: true,
  videoSize: 'md',
}

const DEFAULT_AI_SETTINGS: AISettingsFile = {
  version: 1,
  provider: 'openai',
  model: 'gpt-4o',
  baseUrl: '',
  temperature: 0.7,
  maxTokens: 4096,
  targetLanguage: 'en',
}

const DEFAULT_LAYOUT_SETTINGS: LayoutSettingsFile = {
  version: 1,
  showPlayer: true,
  showWaveform: true,
  showTranscript: true,
  showControls: true,
  transcriptPanelVisible: true,
  transcriptPanelCollapsed: false,
  videoPanelVisible: true,
  videoPanelCollapsed: false,
  timelinePanelVisible: true,
  timelinePanelCollapsed: false,
  isSidebarOpen: true,
  sidebarWidth: 320,
  activeSidebarTab: 'history',
}

const DEFAULT_THEME_SETTINGS: ThemeSettingsFile = {
  version: 1,
  theme: 'dark',
  colors: {
    primary: '#a855f7',
    accent: '#22d3ee',
    success: '#22c55e',
    warning: '#f59e0b',
    error: '#ef4444',
    info: '#3b82f6',
  },
}

export const settingsRepository = {
  async loadAppSettings(): Promise<AppSettingsFile> {
    const data = await dataClient.get<AppSettingsFile>('settings/app-settings.json')
    return data ?? { ...DEFAULT_APP_SETTINGS }
  },
  async saveAppSettings(settings: AppSettingsFile): Promise<void> {
    await dataClient.put('settings/app-settings.json', settings)
  },
  async loadAISettings(): Promise<AISettingsFile> {
    const data = await dataClient.get<AISettingsFile>('settings/ai-settings.json')
    return data ?? { ...DEFAULT_AI_SETTINGS }
  },
  async saveAISettings(settings: AISettingsFile): Promise<void> {
    await dataClient.put('settings/ai-settings.json', settings)
  },
  async loadLayoutSettings(): Promise<LayoutSettingsFile> {
    const data = await dataClient.get<LayoutSettingsFile>('settings/layout-settings.json')
    return data ?? { ...DEFAULT_LAYOUT_SETTINGS }
  },
  async saveLayoutSettings(settings: LayoutSettingsFile): Promise<void> {
    await dataClient.put('settings/layout-settings.json', settings)
  },
  async loadThemeSettings(): Promise<ThemeSettingsFile> {
    const data = await dataClient.get<ThemeSettingsFile>('settings/theme-settings.json')
    return data ?? { ...DEFAULT_THEME_SETTINGS }
  },
  async saveThemeSettings(settings: ThemeSettingsFile): Promise<void> {
    await dataClient.put('settings/theme-settings.json', settings)
  },
}
