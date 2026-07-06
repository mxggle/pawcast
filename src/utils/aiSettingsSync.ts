import type { AiSettingsChangedPayload } from "../types/desktop";

export const AI_SETTINGS_STORAGE_KEYS = [
  "openai_api_key",
  "gemini_api_key",
  "grok_api_key",
  "deepseek_api_key",
  "groq_api_key",
  "opencode_api_key",
  "openai_model",
  "gemini_model",
  "grok_model",
  "deepseek_model",
  "ollama_base_url",
  "ollama_model",
  "opencode_base_url",
  "opencode_model",
  "local_whisper_url",
  "local_whisper_model",
  "preferred_ai_provider",
  "preferred_transcription_provider",
  "target_language",
  "ai_temperature",
  "ai_max_tokens",
] as const;

const AI_SETTINGS_STORAGE_KEY_SET = new Set<string>(AI_SETTINGS_STORAGE_KEYS);

export const getAiSettingsPayload = (): AiSettingsChangedPayload =>
  Object.fromEntries(
    AI_SETTINGS_STORAGE_KEYS.map((key) => [key, localStorage.getItem(key) ?? ""]),
  );

export const applyAiSettingsPayload = (payload: unknown): boolean => {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return false;

  let changed = false;
  for (const [key, value] of Object.entries(payload)) {
    if (!AI_SETTINGS_STORAGE_KEY_SET.has(key) || typeof value !== "string") continue;
    if (localStorage.getItem(key) === value) continue;
    localStorage.setItem(key, value);
    changed = true;
  }
  return changed;
};
