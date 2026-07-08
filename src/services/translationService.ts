import {
  AIProvider,
  AIServiceConfig,
  DEFAULT_MODELS,
  normalizeModelId,
} from "../types/aiService";
import { aiService } from "./aiService";

/**
 * Reads the current AI provider/model/key configuration from the same
 * localStorage keys used by the explanation drawer and AI settings panel,
 * so per-line translation shares one source of truth with the rest of the app.
 */
export interface ResolvedAiConfig {
  provider: AIProvider;
  config: AIServiceConfig;
}

export const getStoredAiConfig = (systemPrompt: string): ResolvedAiConfig | null => {
  if (typeof localStorage === "undefined") return null;

  const provider = (localStorage.getItem("preferred_ai_provider") as AIProvider) || "openai";
  const apiKey = localStorage.getItem(`${provider}_api_key`) || "";

  if (!aiService.validateApiKey(provider, apiKey) && provider !== "ollama") {
    return null;
  }

  const model = normalizeModelId(
    provider,
    localStorage.getItem(`${provider}_model`) || DEFAULT_MODELS[provider]
  );

  return {
    provider,
    config: {
      provider,
      model,
      apiKey,
      baseURL:
        provider === "opencode"
          ? localStorage.getItem("opencode_base_url") || undefined
          : undefined,
      temperature: parseFloat(localStorage.getItem("ai_temperature") || "0.3"),
      maxTokens: parseInt(localStorage.getItem("ai_max_tokens") || "2000"),
      systemPrompt,
      responseFormat: "json_object",
    },
  };
};

const TRANSLATION_SYSTEM_PROMPT = (targetLanguage: string) =>
  `You are a professional subtitle translator. Translate each source line into ${targetLanguage}. ` +
  `Preserve meaning and tone; produce natural, concise translations suitable for a language learner. ` +
  `Return ONLY a JSON object of the form {"translations": ["...", ...]} whose array has exactly the same ` +
  `number of items and the same order as the input lines. Do not add notes, romanization, or commentary.`;

const buildTranslationPrompt = (texts: string[], targetLanguage: string): string =>
  `Translate the following ${texts.length} line(s) into ${targetLanguage}.\n` +
  `Respond with {"translations": [...]} — one translated string per input line, same order.\n\n` +
  `Input lines (JSON array):\n${JSON.stringify(texts)}`;

const parseTranslations = (content: string, expected: number): string[] => {
  let jsonStr = content.trim();
  if (jsonStr.startsWith("```")) {
    jsonStr = jsonStr.replace(/^```(json)?\n?|```$/g, "").trim();
  }

  const parsed = JSON.parse(jsonStr) as
    | { translations?: unknown }
    | unknown[];

  const list = Array.isArray(parsed)
    ? parsed
    : Array.isArray((parsed as { translations?: unknown }).translations)
      ? (parsed as { translations: unknown[] }).translations
      : null;

  if (!list) {
    throw new Error("Translation response missing translations array");
  }

  const strings = list.map((item) => (typeof item === "string" ? item : String(item ?? "")));

  // Pad/truncate defensively so the caller can always zip results 1:1 with input.
  if (strings.length < expected) {
    return [...strings, ...new Array(expected - strings.length).fill("")];
  }
  return strings.slice(0, expected);
};

/**
 * Translate a batch of source lines in a single AI request. Returns one
 * translated string per input line, in the same order.
 */
export const translateLines = async (
  texts: string[],
  targetLanguage: string
): Promise<string[]> => {
  if (texts.length === 0) return [];

  const resolved = getStoredAiConfig(TRANSLATION_SYSTEM_PROMPT(targetLanguage));
  if (!resolved) {
    throw new Error("MISSING_API_KEY");
  }

  const response = await aiService.generateResponse(
    resolved.config,
    buildTranslationPrompt(texts, targetLanguage)
  );

  return parseTranslations(response.content, texts.length);
};
