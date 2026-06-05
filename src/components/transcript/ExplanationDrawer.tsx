import React, { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { AI_PROMPTS } from "../../config/prompts";

import { MarkdownRenderer } from "../ui/MarkdownRenderer";
import { Loader } from "lucide-react";
import { toast } from "react-hot-toast";
import {
  AIProvider,
  AIServiceConfig,
  DEFAULT_MODELS,
  normalizeModelId,
} from "../../types/aiService";
import { aiService } from "../../services/aiService";
import {
  ExplanationResult,
  globalExplanationListeners,
  explanationCache,
  setGlobalExplanationState,
  getGlobalExplanationState,
  JapaneseExplanation,
} from "./explanationState";

interface ExplanationDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  text: string;
}

export const ExplanationDrawer: React.FC<ExplanationDrawerProps> = ({
  isOpen,
  onClose,
  text,
}) => {
  const { t } = useTranslation();
  const [explanation, setExplanation] = useState<ExplanationResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [selectedProvider, setSelectedProvider] = useState<AIProvider>(
    () => (localStorage.getItem("preferred_ai_provider") as AIProvider) || "openai"
  );
  const [targetLanguage, setTargetLanguage] = useState(
    () => localStorage.getItem("target_language") || "English"
  );
  const [selectedModel, setSelectedModel] = useState(() => {
    const provider = (localStorage.getItem("preferred_ai_provider") as AIProvider) || "openai";
    return normalizeModelId(
      provider,
      localStorage.getItem(`${provider}_model`) || DEFAULT_MODELS[provider]
    );
  });

  // Handle ESC key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) onClose();
    };
    if (isOpen) document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  // Subscribe to global explanation state
  useEffect(() => {
    if (typeof window === "undefined") return;

    const updateLocalState = () => {
      const globalState = getGlobalExplanationState(text);
      if (globalState.status === "completed" && globalState.result) {
        setExplanation(globalState.result);
        setError(null);
        setIsLoading(false);
      } else if (globalState.status === "error") {
        setError(globalState.error || "Unknown error");
        setExplanation(null);
        setIsLoading(false);
      } else if (globalState.status === "loading") {
        setIsLoading(true);
        setError(null);
      } else {
        setIsLoading(false);
        setError(null);
      }
    };

    globalExplanationListeners.add(updateLocalState);
    updateLocalState();
    return () => { globalExplanationListeners.delete(updateLocalState); };
  }, [text]);

  // Load settings
  useEffect(() => {
    const loadSettings = () => {
      const savedProvider = (localStorage.getItem("preferred_ai_provider") as AIProvider) || "openai";
      const savedLanguage = localStorage.getItem("target_language") || "English";
      const savedModel = normalizeModelId(
        savedProvider,
        localStorage.getItem(`${savedProvider}_model`) || DEFAULT_MODELS[savedProvider]
      );
      localStorage.setItem(`${savedProvider}_model`, savedModel);
      setSelectedProvider(savedProvider);
      setTargetLanguage(savedLanguage);
      setSelectedModel(savedModel);
    };
    loadSettings();
    window.addEventListener("aiSettingsUpdated", loadSettings);
    return () => window.removeEventListener("aiSettingsUpdated", loadSettings);
  }, []);

  useEffect(() => {
    const savedModel = normalizeModelId(
      selectedProvider,
      localStorage.getItem(`${selectedProvider}_model`) || DEFAULT_MODELS[selectedProvider]
    );
    localStorage.setItem(`${selectedProvider}_model`, savedModel);
    setSelectedModel(savedModel);
  }, [selectedProvider]);

  // Check cache
  useEffect(() => {
    if (text) {
      const cached = explanationCache.get(text);
      if (cached) { setExplanation(cached); setError(null); }
    }
  }, [text]);

  const getApiKey = useCallback((provider: AIProvider) =>
    localStorage.getItem(`${provider}_api_key`) || "", []);

  const hasValidApiKey = useCallback((provider: AIProvider) =>
    aiService.validateApiKey(provider, getApiKey(provider)), [getApiKey]);

  const generateExplanation = useCallback(async () => {
    if (!text.trim()) { toast.error(t("explanation.noTextSelected")); return; }
    if (!hasValidApiKey(selectedProvider)) {
      toast.error(t("explanation.configureApiKey", { provider: selectedProvider.toUpperCase() }));
      return;
    }

    setIsLoading(true);
    setError(null);
    setExplanation(null);
    setGlobalExplanationState(text, { status: "loading" });

    try {
      const config: AIServiceConfig = {
        provider: selectedProvider,
        model: selectedModel,
        apiKey: getApiKey(selectedProvider),
        baseURL:
          selectedProvider === "opencode"
            ? localStorage.getItem("opencode_base_url") || undefined
            : undefined,
        temperature: parseFloat(localStorage.getItem("ai_temperature") || "0.7"),
        maxTokens: parseInt(localStorage.getItem("ai_max_tokens") || "2000"),
        systemPrompt: AI_PROMPTS.system.languageTutor(targetLanguage),
        responseFormat: "json_object",
      };

      const prompt = AI_PROMPTS.features.sentenceExplanation(text, targetLanguage);
      const response = await aiService.generateResponse(config, prompt);
      let structuredExplanation: JapaneseExplanation | undefined;
      const cleanedContent = response.content;

      // Robust JSON Parsing with auto-repair
      const healJson = (str: string): string => {
        let jsonStr = str.trim();
        // Remove markdown formatting if present
        if (jsonStr.startsWith("```")) {
          jsonStr = jsonStr.replace(/^```(json)?\n?|```$/g, "").trim();
        }
        
        // Simple brace counting to fix truncated JSON
        let braceCount = 0;
        let bracketCount = 0;
        let inString = false;
        let lastChar = "";
        
        for (let i = 0; i < jsonStr.length; i++) {
          const char = jsonStr[i];
          if (char === '"' && lastChar !== "\\") inString = !inString;
          if (!inString) {
            if (char === "{") braceCount++;
            else if (char === "}") braceCount--;
            else if (char === "[") bracketCount++;
            else if (char === "]") bracketCount--;
          }
          lastChar = char;
        }

        // If truncated inside a string, close it
        if (inString) jsonStr += '"';
        
        // Remove trailing comma if it exists (common after truncation)
        jsonStr = jsonStr.replace(/,\s*$/, "");
        
        // Close missing brackets and braces
        while (bracketCount > 0) { jsonStr += "]"; bracketCount--; }
        while (braceCount > 0) { jsonStr += "}"; braceCount--; }
        
        return jsonStr;
      };

      try {
        // First try finding anything that looks like JSON
        const jsonMatch = response.content.match(/```json\n?([\s\S]*?)\n?```/) || 
                         response.content.match(/{[\s\S]*}/);
        
        const rawJson = jsonMatch ? (jsonMatch[1] || jsonMatch[0]) : response.content;
        const healedJson = healJson(rawJson);
        structuredExplanation = JSON.parse(healedJson);
      } catch (parseErr) {
        console.error("Failed to parse structured explanation:", parseErr);
        // Fallback to treating as raw markdown if JSON parsing fails
      }

      const result: ExplanationResult = {
        explanation: cleanedContent,
        structuredExplanation,
        usage: response.usage,
        model: response.model,
        provider: response.provider,
      };

      explanationCache.set(text, result);
      setExplanation(result);
      setGlobalExplanationState(text, { status: "completed", result });
    } catch (err) {
      const msg = err instanceof Error ? err.message : t("explanation.unknownError");
      setError(msg);
      setGlobalExplanationState(text, { status: "error", error: msg });
      toast.error(t("explanation.generationFailed", { message: msg }));
    } finally {
      setIsLoading(false);
    }
  }, [text, selectedProvider, selectedModel, targetLanguage, getApiKey, hasValidApiKey, t]);

  // Auto-generate when opened
  useEffect(() => {
    if (isOpen && text && !explanation && !isLoading && !error) {
      generateExplanation();
    }
  }, [isOpen, text, explanation, isLoading, error, generateExplanation]);

  if (!isOpen) return null;

  return (
    <div className="mt-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 max-h-80 overflow-y-auto animate-in fade-in slide-in-from-top-1 duration-150">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-200 dark:border-gray-700">
        <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
          {t("explanation.title")}
        </span>
      </div>

      {/* Content */}
      <div className="px-3 py-3">
        {isLoading && (
          <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
            <Loader size={14} className="animate-spin shrink-0" />
            <span>{t("explanation.generating")}</span>
          </div>
        )}

        {error && (
          <p className="text-xs text-error-600 dark:text-error-400">{error}</p>
        )}

        {explanation && (
          <div className="space-y-4">
            {explanation.structuredExplanation ? (
              <div className="space-y-6">
                {/* Sensei Overview */}
                <div className="bg-blue-50/50 dark:bg-blue-900/10 rounded-lg p-3 border-l-4 border-blue-400 dark:border-blue-500">
                  <h4 className="flex items-center gap-2 text-xs font-bold text-blue-700 dark:text-blue-300 uppercase tracking-wider mb-2">
                    <span className="text-sm">👨‍🏫</span> {t("explanation.overview")}
                  </h4>
                  <p className="text-xs text-gray-700 dark:text-gray-300 italic leading-relaxed">
                    "{explanation.structuredExplanation.senseiOverview}"
                  </p>
                </div>

                {/* Translation */}
                <div>
                  <h4 className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
                    {t("explanation.translation")}
                  </h4>
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                      {explanation.structuredExplanation.translation.natural}
                    </p>
                    {explanation.structuredExplanation.translation.literal && (
                      <p className="text-xs text-gray-500 dark:text-gray-400 italic">
                        (Literal: {explanation.structuredExplanation.translation.literal})
                      </p>
                    )}
                  </div>
                </div>

                {/* Breakdown */}
                <div className="grid gap-3">
                  <h4 className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    {t("explanation.breakdown")}
                  </h4>
                  <div className="space-y-3">
                    {explanation.structuredExplanation.breakdown.map((item, idx) => (
                      <div key={idx} className="flex gap-3 text-xs">
                        <span className="font-bold text-blue-600 dark:text-blue-400 whitespace-nowrap">
                          {item.item}
                        </span>
                        <span className="text-gray-700 dark:text-gray-300">
                          {item.explanation}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Grammar Spotlight */}
                {explanation.structuredExplanation.grammarSpotlight && explanation.structuredExplanation.grammarSpotlight.length > 0 && (
                  <div className="space-y-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                    <h4 className="flex items-center gap-2 text-xs font-bold text-purple-700 dark:text-purple-400 uppercase tracking-wider">
                      <span className="text-sm">🎯</span> {t("explanation.grammarSpotlight")}
                    </h4>
                    {explanation.structuredExplanation.grammarSpotlight.map((gram, idx) => (
                      <div key={idx} className="bg-white dark:bg-gray-800/50 rounded-lg border border-gray-100 dark:border-gray-700 overflow-hidden">
                        <div className="px-3 py-2 bg-gray-50/50 dark:bg-gray-800 border-b border-gray-100 dark:border-gray-700">
                          <span className="font-bold text-gray-900 dark:text-gray-100">{gram.point}</span>
                        </div>
                        <div className="p-3 space-y-2 text-xs">
                          <div>
                            <span className="text-[10px] font-semibold text-gray-400 uppercase mr-2">{t("explanation.form")}</span>
                            <code className="text-gray-800 dark:text-gray-200">{gram.form}</code>
                          </div>
                          <div>
                            <span className="text-[10px] font-semibold text-gray-400 uppercase mr-2">{t("explanation.meaning")}</span>
                            <span className="text-gray-700 dark:text-gray-300">{gram.meaning}</span>
                          </div>
                          <div className="space-y-1">
                            <span className="text-[10px] font-semibold text-gray-400 uppercase">{t("explanation.examples")}</span>
                            <ul className="list-disc list-inside text-gray-600 dark:text-gray-400 pl-1 space-y-1">
                              {gram.examples.map((ex, i) => (
                                <li key={i}>{ex}</li>
                              ))}
                            </ul>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Summary & Checklist */}
                <div className="pt-4 border-t border-gray-200 dark:border-gray-700 space-y-3">
                  <div className="bg-green-50/30 dark:bg-green-900/10 rounded-lg p-3">
                    <h4 className="text-xs font-bold text-green-700 dark:text-green-400 uppercase tracking-wider mb-1">
                      {t("explanation.logicSummary")}
                    </h4>
                    <p className="text-xs text-gray-700 dark:text-gray-300 leading-relaxed font-medium">
                      {explanation.structuredExplanation.logicSummary}
                    </p>
                  </div>
                  
                  {explanation.structuredExplanation.checklist && (
                    <div className="px-3 py-1">
                      <div className="flex flex-wrap gap-2">
                        {explanation.structuredExplanation.checklist.map((tag, i) => (
                          <span key={i} className="px-2 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded-full text-[10px] font-medium border border-gray-200 dark:border-gray-600">
                            {tag}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="prose prose-sm dark:prose-invert max-w-none [&_h1]:text-xs [&_h1]:font-bold [&_h1]:text-blue-700 dark:[&_h1]:text-blue-400 [&_h1]:mb-1 [&_h1]:mt-3 [&_h1]:border-0 [&_h2]:text-xs [&_h2]:font-bold [&_h2]:text-blue-700 dark:[&_h2]:text-blue-400 [&_h2]:mb-1 [&_h2]:mt-3 [&_h3]:text-xs [&_h3]:font-semibold [&_h3]:text-gray-700 dark:[&_h3]:text-gray-300 [&_h3]:mb-1 [&_h3]:mt-2 [&_h4]:text-xs [&_h4]:font-semibold [&_h4]:text-gray-600 dark:[&_h4]:text-gray-400 [&_h4]:mb-1 [&_p]:text-xs [&_p]:mb-2 [&_li]:text-xs">
                <MarkdownRenderer content={explanation.explanation} />
              </div>
            )}

            <div className="mt-4 flex items-center gap-1.5 text-[10px] text-gray-400 dark:text-gray-500 pt-2 border-t border-gray-100 dark:border-gray-800">
              {t("explanation.providerInfo", {
                provider: explanation.provider,
                model: explanation.model,
                tokens: explanation.usage?.totalTokens ?? 0
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
