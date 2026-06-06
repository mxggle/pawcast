import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "react-hot-toast";
import {
  DEFAULT_OPENCODE_BASE_URL,
  aiService,
  normalizeOpenCodeBaseUrl,
} from "../services/aiService";
import {
  AIProvider,
  AIServiceConfig,
  DEFAULT_MODELS,
  DEFAULT_TRANSCRIPTION_PROVIDER,
  TranscriptionProvider,
  normalizeModelId,
} from "../types/aiService";

export type ConnectionStatus = "idle" | "success" | "error";

export type ProviderSetupTone = "success" | "warning" | "error";

type ProviderRecord<T> = Record<AIProvider, T>;

type PersistedAiSettings = {
  openaiApiKey: string;
  geminiApiKey: string;
  grokApiKey: string;
  groqApiKey: string;
  opencodeApiKey: string;
  deepseekApiKey: string;
  openaiModel: string;
  geminiModel: string;
  grokModel: string;
  deepseekModel: string;
  ollamaBaseUrl: string;
  ollamaModel: string;
  opencodeBaseUrl: string;
  opencodeModel: string;
  localWhisperUrl: string;
  localWhisperModel: string;
  preferredProvider: AIProvider;
  preferredTranscriptionProvider: TranscriptionProvider;
  targetLanguage: string;
  temperature: number;
  maxTokens: number;
};

export interface ProviderConfigState {
  provider: AIProvider;
  apiKey: string;
  setApiKey: (apiKey: string) => void;
  model: string;
  setModel: (model: string) => void;
  setupStatus: {
    label: string;
    tone: ProviderSetupTone;
    isConfigured: boolean;
  };
}

export interface AiDefaultsState {
  preferredProvider: AIProvider;
  setPreferredProvider: (provider: AIProvider) => void;
  targetLanguage: string;
  setTargetLanguage: (language: string) => void;
  temperature: number;
  setTemperature: (temperature: number) => void;
  maxTokens: number;
  setMaxTokens: (maxTokens: number) => void;
}

export interface AiProvidersState {
  selectedProvider: AIProvider;
  setSelectedProvider: (provider: AIProvider) => void;
  showApiKeys: ProviderRecord<boolean>;
  toggleApiKeyVisibility: (provider: AIProvider) => void;
  testingConnection: ProviderRecord<boolean>;
  connectionStatus: ProviderRecord<ConnectionStatus>;
  testConnection: (provider: AIProvider) => Promise<void>;
  ollamaBaseUrl: string;
  setOllamaBaseUrl: (url: string) => void;
  opencodeBaseUrl: string;
  setOpencodeBaseUrl: (url: string) => void;
}

export interface AiTranscriptionState {
  preferredTranscriptionProvider: TranscriptionProvider;
  setPreferredTranscriptionProvider: (provider: TranscriptionProvider) => void;
  transcriptionSharedProvider: AIProvider | null;
  groqApiKey: string;
  setGroqApiKey: (apiKey: string) => void;
  showGroqApiKey: boolean;
  setShowGroqApiKey: (show: boolean | ((current: boolean) => boolean)) => void;
  localWhisperUrl: string;
  setLocalWhisperUrl: (url: string) => void;
  localWhisperModel: string;
  setLocalWhisperModel: (model: string) => void;
}

export interface UseAiSettingsStateResult {
  providerConfigs: ProviderConfigState[];
  defaultsState: AiDefaultsState;
  providersState: AiProvidersState;
  transcriptionState: AiTranscriptionState;
}

const DEFAULT_OLLAMA_BASE_URL = "http://localhost:11434";
const DEFAULT_LOCAL_WHISPER_URL = "http://localhost:8000";
const DEFAULT_LOCAL_WHISPER_MODEL = "Systran/faster-whisper-large-v3";
const DEFAULT_TEMPERATURE = 0.7;
const DEFAULT_MAX_TOKENS = 1000;

const DEFAULT_SHOW_API_KEYS: ProviderRecord<boolean> = {
  openai: false,
  gemini: false,
  grok: false,
  deepseek: false,
  ollama: false,
  opencode: false,
};

const DEFAULT_TESTING_CONNECTION: ProviderRecord<boolean> = {
  openai: false,
  gemini: false,
  grok: false,
  deepseek: false,
  ollama: false,
  opencode: false,
};

const DEFAULT_CONNECTION_STATUS: ProviderRecord<ConnectionStatus> = {
  openai: "idle",
  gemini: "idle",
  grok: "idle",
  deepseek: "idle",
  ollama: "idle",
  opencode: "idle",
};

const settingsBroadcastChannel =
  typeof window !== "undefined" && "BroadcastChannel" in window
    ? new BroadcastChannel("abloop-settings")
    : null;

const isPlausibleHttpUrl = (value: string) => {
  const trimmedValue = value.trim();

  if (!trimmedValue) {
    return false;
  }

  try {
    const parsedUrl = new URL(trimmedValue);
    return parsedUrl.protocol === "http:" || parsedUrl.protocol === "https:";
  } catch {
    return false;
  }
};

const getProviderConfigSignatures = (config: {
  openaiApiKey: string;
  openaiModel: string;
  geminiApiKey: string;
  geminiModel: string;
  grokApiKey: string;
  grokModel: string;
  deepseekApiKey: string;
  deepseekModel: string;
  ollamaBaseUrl: string;
  ollamaModel: string;
  opencodeApiKey: string;
  opencodeBaseUrl: string;
  opencodeModel: string;
}): ProviderRecord<string> => ({
  openai: `${config.openaiApiKey}\u0000${config.openaiModel}`,
  gemini: `${config.geminiApiKey}\u0000${config.geminiModel}`,
  grok: `${config.grokApiKey}\u0000${config.grokModel}`,
  deepseek: `${config.deepseekApiKey}\u0000${config.deepseekModel}`,
  ollama: `${config.ollamaBaseUrl}\u0000${config.ollamaModel}`,
  opencode: `${config.opencodeApiKey}\u0000${config.opencodeBaseUrl}\u0000${config.opencodeModel}`,
});

const serializeAiSettings = (settings: PersistedAiSettings) => JSON.stringify(settings);

const getLoadedAiSettings = (): PersistedAiSettings => {
  const preferredProvider =
    (localStorage.getItem("preferred_ai_provider") as AIProvider) || "openai";
  const preferredTranscriptionProvider =
    (localStorage.getItem(
      "preferred_transcription_provider"
    ) as TranscriptionProvider) || DEFAULT_TRANSCRIPTION_PROVIDER;
  const savedTemp = parseFloat(
    localStorage.getItem("ai_temperature") || DEFAULT_TEMPERATURE.toString()
  );
  const savedTokens = parseInt(
    localStorage.getItem("ai_max_tokens") || DEFAULT_MAX_TOKENS.toString(),
    10
  );

  return {
    openaiApiKey: localStorage.getItem("openai_api_key") || "",
    geminiApiKey: localStorage.getItem("gemini_api_key") || "",
    grokApiKey: localStorage.getItem("grok_api_key") || "",
    groqApiKey: localStorage.getItem("groq_api_key") || "",
    opencodeApiKey: localStorage.getItem("opencode_api_key") || "",
    deepseekApiKey: localStorage.getItem("deepseek_api_key") || "",
    openaiModel: normalizeModelId("openai", localStorage.getItem("openai_model")),
    geminiModel: normalizeModelId("gemini", localStorage.getItem("gemini_model")),
    grokModel: normalizeModelId("grok", localStorage.getItem("grok_model")),
    deepseekModel: normalizeModelId("deepseek", localStorage.getItem("deepseek_model")),
    ollamaBaseUrl:
      localStorage.getItem("ollama_base_url") || DEFAULT_OLLAMA_BASE_URL,
    ollamaModel: normalizeModelId("ollama", localStorage.getItem("ollama_model")),
    opencodeBaseUrl: normalizeOpenCodeBaseUrl(
      localStorage.getItem("opencode_base_url")
    ),
    opencodeModel: normalizeModelId("opencode", localStorage.getItem("opencode_model")),
    localWhisperUrl:
      localStorage.getItem("local_whisper_url") || DEFAULT_LOCAL_WHISPER_URL,
    localWhisperModel:
      localStorage.getItem("local_whisper_model") || DEFAULT_LOCAL_WHISPER_MODEL,
    preferredProvider,
    preferredTranscriptionProvider,
    targetLanguage: localStorage.getItem("target_language") || "English",
    temperature: Number.isFinite(savedTemp) ? savedTemp : DEFAULT_TEMPERATURE,
    maxTokens: Number.isFinite(savedTokens) ? savedTokens : DEFAULT_MAX_TOKENS,
  };
};

export function useAiSettingsState(): UseAiSettingsStateResult {
  const { t } = useTranslation();
  const hasHydratedAiSettingsRef = useRef(false);
  const pendingAiSettingsSaveRef = useRef<number | null>(null);
  const lastSavedAiSettingsRef = useRef<string | null>(null);
  const previousProviderConfigSignaturesRef =
    useRef<ProviderRecord<string> | null>(null);
  const latestProviderConfigSignaturesRef = useRef<ProviderRecord<string>>({
    openai: "",
    gemini: "",
    grok: "",
    deepseek: "",
    ollama: "",
    opencode: "",
  });
  const providerConnectionRequestIdsRef = useRef<ProviderRecord<number>>({
    openai: 0,
    gemini: 0,
    grok: 0,
    deepseek: 0,
    ollama: 0,
    opencode: 0,
  });

  const [openaiApiKey, setOpenaiApiKey] = useState("");
  const [geminiApiKey, setGeminiApiKey] = useState("");
  const [grokApiKey, setGrokApiKey] = useState("");
  const [deepseekApiKey, setDeepseekApiKey] = useState("");
  const [groqApiKey, setGroqApiKey] = useState("");
  const [opencodeApiKey, setOpencodeApiKey] = useState("");

  const [openaiModel, setOpenaiModel] = useState(DEFAULT_MODELS.openai);
  const [geminiModel, setGeminiModel] = useState(DEFAULT_MODELS.gemini);
  const [grokModel, setGrokModel] = useState(DEFAULT_MODELS.grok);
  const [deepseekModel, setDeepseekModel] = useState(DEFAULT_MODELS.deepseek);

  const [ollamaBaseUrl, setOllamaBaseUrl] = useState(DEFAULT_OLLAMA_BASE_URL);
  const [ollamaModel, setOllamaModel] = useState(DEFAULT_MODELS.ollama);
  const [opencodeBaseUrl, setOpencodeBaseUrl] = useState(
    DEFAULT_OPENCODE_BASE_URL
  );
  const [opencodeModel, setOpencodeModel] = useState(DEFAULT_MODELS.opencode);
  const [localWhisperUrl, setLocalWhisperUrl] = useState(DEFAULT_LOCAL_WHISPER_URL);
  const [localWhisperModel, setLocalWhisperModel] = useState(
    DEFAULT_LOCAL_WHISPER_MODEL
  );

  const [preferredProvider, setPreferredProvider] = useState<AIProvider>("openai");
  const [preferredTranscriptionProvider, setPreferredTranscriptionProvider] =
    useState<TranscriptionProvider>(DEFAULT_TRANSCRIPTION_PROVIDER);
  const [targetLanguage, setTargetLanguage] = useState("English");
  const [temperature, setTemperature] = useState(DEFAULT_TEMPERATURE);
  const [maxTokens, setMaxTokens] = useState(DEFAULT_MAX_TOKENS);

  const [showApiKeys, setShowApiKeys] =
    useState<ProviderRecord<boolean>>(DEFAULT_SHOW_API_KEYS);
  const [showGroqApiKey, setShowGroqApiKey] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState<AIProvider>("openai");
  const [testingConnection, setTestingConnection] = useState<
    ProviderRecord<boolean>
  >(DEFAULT_TESTING_CONNECTION);
  const [connectionStatus, setConnectionStatus] = useState<
    ProviderRecord<ConnectionStatus>
  >(DEFAULT_CONNECTION_STATUS);

  const getProviderSetupStatus = (
    provider: AIProvider,
    apiKey: string,
    model: string,
    baseURL?: string
  ) => {
    if (provider === "ollama" || provider === "opencode") {
      if (!model.trim() || !baseURL?.trim()) {
        return {
          label: t("aiSettingsPage.status.missing"),
          tone: "warning" as const,
          isConfigured: false,
        };
      }

      if (!isPlausibleHttpUrl(baseURL)) {
        return {
          label: t("aiSettingsPage.status.invalid"),
          tone: "error" as const,
          isConfigured: false,
        };
      }

      if (provider === "opencode" && !apiKey.trim()) {
        return {
          label: t("aiSettingsPage.status.missing"),
          tone: "warning" as const,
          isConfigured: false,
        };
      }

      if (provider === "opencode" && !aiService.validateApiKey(provider, apiKey)) {
        return {
          label: t("aiSettingsPage.status.invalid"),
          tone: "error" as const,
          isConfigured: false,
        };
      }

      return {
        label: t("aiSettingsPage.status.ready"),
        tone: "success" as const,
        isConfigured: true,
      };
    }

    if (!apiKey.trim()) {
      return {
        label: t("aiSettingsPage.status.missing"),
        tone: "warning" as const,
        isConfigured: false,
      };
    }

    if (!aiService.validateApiKey(provider, apiKey)) {
      return {
        label: t("aiSettingsPage.status.invalid"),
        tone: "error" as const,
        isConfigured: false,
      };
    }

    return {
      label: t("aiSettingsPage.status.ready"),
      tone: "success" as const,
      isConfigured: true,
    };
  };

  const providerConfigs: ProviderConfigState[] = [
    {
      provider: "openai",
      apiKey: openaiApiKey,
      setApiKey: setOpenaiApiKey,
      model: openaiModel,
      setModel: setOpenaiModel,
      setupStatus: getProviderSetupStatus("openai", openaiApiKey, openaiModel),
    },
    {
      provider: "gemini",
      apiKey: geminiApiKey,
      setApiKey: setGeminiApiKey,
      model: geminiModel,
      setModel: setGeminiModel,
      setupStatus: getProviderSetupStatus("gemini", geminiApiKey, geminiModel),
    },
    {
      provider: "grok",
      apiKey: grokApiKey,
      setApiKey: setGrokApiKey,
      model: grokModel,
      setModel: setGrokModel,
      setupStatus: getProviderSetupStatus("grok", grokApiKey, grokModel),
    },
    {
      provider: "deepseek",
      apiKey: deepseekApiKey,
      setApiKey: setDeepseekApiKey,
      model: deepseekModel,
      setModel: setDeepseekModel,
      setupStatus: getProviderSetupStatus("deepseek", deepseekApiKey, deepseekModel),
    },
    {
      provider: "opencode",
      apiKey: opencodeApiKey,
      setApiKey: setOpencodeApiKey,
      model: opencodeModel,
      setModel: setOpencodeModel,
      setupStatus: getProviderSetupStatus(
        "opencode",
        opencodeApiKey,
        opencodeModel,
        opencodeBaseUrl
      ),
    },
    {
      provider: "ollama",
      apiKey: "",
      setApiKey: () => undefined,
      model: ollamaModel,
      setModel: setOllamaModel,
      setupStatus: getProviderSetupStatus(
        "ollama",
        "",
        ollamaModel,
        ollamaBaseUrl
      ),
    },
  ];

  const currentAiSettingsSnapshot = serializeAiSettings({
    openaiApiKey,
    geminiApiKey,
    grokApiKey,
    groqApiKey,
    opencodeApiKey,
    deepseekApiKey,
    openaiModel,
    geminiModel,
    grokModel,
    deepseekModel,
    ollamaBaseUrl,
    ollamaModel,
    opencodeBaseUrl,
    opencodeModel,
    localWhisperUrl,
    localWhisperModel,
    preferredProvider,
    preferredTranscriptionProvider,
    targetLanguage,
    temperature,
    maxTokens,
  });
  latestProviderConfigSignaturesRef.current = getProviderConfigSignatures({
    openaiApiKey,
    openaiModel,
    geminiApiKey,
    geminiModel,
    grokApiKey,
    grokModel,
    deepseekApiKey,
    deepseekModel,
    ollamaBaseUrl,
    ollamaModel,
    opencodeApiKey,
    opencodeBaseUrl,
    opencodeModel,
  });

  useEffect(() => {
    const loadedSettings = getLoadedAiSettings();

    setOpenaiApiKey(loadedSettings.openaiApiKey);
    setGeminiApiKey(loadedSettings.geminiApiKey);
    setGrokApiKey(loadedSettings.grokApiKey);
    setDeepseekApiKey(loadedSettings.deepseekApiKey);
    setGroqApiKey(loadedSettings.groqApiKey);
    setOpencodeApiKey(loadedSettings.opencodeApiKey);
    setOpenaiModel(loadedSettings.openaiModel);
    setGeminiModel(loadedSettings.geminiModel);
    setGrokModel(loadedSettings.grokModel);
    setDeepseekModel(loadedSettings.deepseekModel);
    setOllamaBaseUrl(loadedSettings.ollamaBaseUrl);
    setOllamaModel(loadedSettings.ollamaModel);
    setOpencodeBaseUrl(loadedSettings.opencodeBaseUrl);
    setOpencodeModel(loadedSettings.opencodeModel);
    setLocalWhisperUrl(loadedSettings.localWhisperUrl);
    setLocalWhisperModel(loadedSettings.localWhisperModel);
    setPreferredProvider(loadedSettings.preferredProvider);
    setSelectedProvider(loadedSettings.preferredProvider);
    setPreferredTranscriptionProvider(
      loadedSettings.preferredTranscriptionProvider
    );
    setTargetLanguage(loadedSettings.targetLanguage);
    setTemperature(loadedSettings.temperature);
    setMaxTokens(loadedSettings.maxTokens);

    lastSavedAiSettingsRef.current = serializeAiSettings(loadedSettings);
    previousProviderConfigSignaturesRef.current = getProviderConfigSignatures(
      loadedSettings
    );
    hasHydratedAiSettingsRef.current = true;

    return () => {
      if (pendingAiSettingsSaveRef.current !== null) {
        window.clearTimeout(pendingAiSettingsSaveRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!hasHydratedAiSettingsRef.current) {
      return;
    }

    if (currentAiSettingsSnapshot === lastSavedAiSettingsRef.current) {
      return;
    }

    if (pendingAiSettingsSaveRef.current !== null) {
      window.clearTimeout(pendingAiSettingsSaveRef.current);
    }

    pendingAiSettingsSaveRef.current = window.setTimeout(() => {
      localStorage.setItem("openai_api_key", openaiApiKey);
      localStorage.setItem("gemini_api_key", geminiApiKey);
      localStorage.setItem("grok_api_key", grokApiKey);
      localStorage.setItem("deepseek_api_key", deepseekApiKey);
      localStorage.setItem("groq_api_key", groqApiKey);
      localStorage.setItem("opencode_api_key", opencodeApiKey);
      localStorage.setItem("openai_model", openaiModel);
      localStorage.setItem("gemini_model", geminiModel);
      localStorage.setItem("grok_model", grokModel);
      localStorage.setItem("deepseek_model", deepseekModel);
      localStorage.setItem("ollama_base_url", ollamaBaseUrl);
      localStorage.setItem("ollama_model", ollamaModel);
      localStorage.setItem("opencode_base_url", opencodeBaseUrl);
      localStorage.setItem("opencode_model", opencodeModel);
      localStorage.setItem("local_whisper_url", localWhisperUrl);
      localStorage.setItem("local_whisper_model", localWhisperModel);
      localStorage.setItem("preferred_ai_provider", preferredProvider);
      localStorage.setItem(
        "preferred_transcription_provider",
        preferredTranscriptionProvider
      );
      localStorage.setItem("target_language", targetLanguage);
      localStorage.setItem("ai_temperature", temperature.toString());
      localStorage.setItem("ai_max_tokens", maxTokens.toString());

      lastSavedAiSettingsRef.current = currentAiSettingsSnapshot;
      pendingAiSettingsSaveRef.current = null;
      window.dispatchEvent(new CustomEvent("aiSettingsUpdated"));
      window.dispatchEvent(new CustomEvent("ai-settings-updated"));
      settingsBroadcastChannel?.postMessage({ type: "ai-settings-updated" });
      void window.electronAPI?.configSet("ai-settings-storage", Date.now().toString());
    }, 400);

    return () => {
      if (pendingAiSettingsSaveRef.current !== null) {
        window.clearTimeout(pendingAiSettingsSaveRef.current);
      }
    };
  }, [
    currentAiSettingsSnapshot,
    geminiApiKey,
    geminiModel,
    grokApiKey,
    grokModel,
    deepseekApiKey,
    deepseekModel,
    groqApiKey,
    opencodeApiKey,
    localWhisperModel,
    localWhisperUrl,
    maxTokens,
    ollamaBaseUrl,
    ollamaModel,
    opencodeBaseUrl,
    opencodeModel,
    openaiApiKey,
    openaiModel,
    preferredProvider,
    preferredTranscriptionProvider,
    targetLanguage,
    temperature,
  ]);

  useEffect(() => {
    if (!hasHydratedAiSettingsRef.current) {
      return;
    }

    const currentProviderConfigSignatures = getProviderConfigSignatures({
      openaiApiKey,
      openaiModel,
      geminiApiKey,
      geminiModel,
      grokApiKey,
      grokModel,
      deepseekApiKey,
      deepseekModel,
      ollamaBaseUrl,
      ollamaModel,
      opencodeApiKey,
      opencodeBaseUrl,
      opencodeModel,
    });

    if (previousProviderConfigSignaturesRef.current === null) {
      previousProviderConfigSignaturesRef.current = currentProviderConfigSignatures;
      return;
    }

    const changedProviders = (Object.keys(currentProviderConfigSignatures) as AIProvider[]).filter(
      (provider) =>
        currentProviderConfigSignatures[provider] !==
        previousProviderConfigSignaturesRef.current?.[provider]
    );

    if (changedProviders.length === 0) {
      return;
    }

    setConnectionStatus((current) => {
      const nextStatus = { ...current };

      changedProviders.forEach((provider) => {
        nextStatus[provider] = "idle";
      });

      return nextStatus;
    });
    previousProviderConfigSignaturesRef.current = currentProviderConfigSignatures;
  }, [
    geminiApiKey,
    geminiModel,
    grokApiKey,
    grokModel,
    deepseekApiKey,
    deepseekModel,
    ollamaBaseUrl,
    ollamaModel,
    opencodeApiKey,
    opencodeBaseUrl,
    opencodeModel,
    openaiApiKey,
    openaiModel,
  ]);

  const toggleApiKeyVisibility = (provider: AIProvider) => {
    setShowApiKeys((current) => ({ ...current, [provider]: !current[provider] }));
  };

  const providerDisplayName = (provider: AIProvider) =>
    t(`aiSettingsPage.providers.${provider}`);

  const testConnection = async (provider: AIProvider) => {
    const config = providerConfigs.find((item) => item.provider === provider);

    if (!config || (!config.apiKey.trim() && provider !== "ollama")) {
      toast.error(
        t("aiSettingsPage.enterApiKeyFirst", {
          provider: providerDisplayName(provider),
        })
      );
      return;
    }

    const requestId = providerConnectionRequestIdsRef.current[provider] + 1;
    providerConnectionRequestIdsRef.current[provider] = requestId;
    const requestSignature = latestProviderConfigSignaturesRef.current[provider];

    setTestingConnection((current) => ({ ...current, [provider]: true }));
    setConnectionStatus((current) => ({ ...current, [provider]: "idle" }));

    try {
      const getBaseURL = () => {
        if (provider === "ollama") return ollamaBaseUrl.trim();
        if (provider === "opencode") return opencodeBaseUrl.trim();
        return undefined;
      };

      const requestConfig: AIServiceConfig = {
        provider,
        model: config.model,
        apiKey: config.apiKey,
        baseURL: getBaseURL(),
        temperature: 0.1,
        maxTokens: 100,
      };
      const result = await aiService.testConnection(requestConfig);
      const isLatestRequest =
        providerConnectionRequestIdsRef.current[provider] === requestId;
      const hasMatchingSignature =
        latestProviderConfigSignaturesRef.current[provider] === requestSignature;

      if (!isLatestRequest || !hasMatchingSignature) {
        return;
      }

      if (result.success) {
        setConnectionStatus((current) => ({ ...current, [provider]: "success" }));
        toast.success(
          t("aiSettingsPage.connectionSuccess", {
            provider: providerDisplayName(provider),
          })
        );
      } else {
        setConnectionStatus((current) => ({ ...current, [provider]: "error" }));
        if (result.message) {
          toast.error(
            t("aiSettingsPage.connectionFailedWithError", {
              provider: providerDisplayName(provider),
              message: result.message,
            })
          );
        } else {
          toast.error(
            t("aiSettingsPage.connectionFailed", {
              provider: providerDisplayName(provider),
            })
          );
        }
      }
    } catch (error) {
      const isLatestRequest =
        providerConnectionRequestIdsRef.current[provider] === requestId;
      const hasMatchingSignature =
        latestProviderConfigSignaturesRef.current[provider] === requestSignature;

      if (!isLatestRequest || !hasMatchingSignature) {
        return;
      }

      setConnectionStatus((current) => ({ ...current, [provider]: "error" }));
      toast.error(
        t("aiSettingsPage.connectionFailedWithError", {
          provider: providerDisplayName(provider),
          message:
            error instanceof Error ? error.message : t("explanation.unknownError"),
        })
      );
    } finally {
      if (providerConnectionRequestIdsRef.current[provider] === requestId) {
        setTestingConnection((current) => ({ ...current, [provider]: false }));
      }
    }
  };

  const transcriptionSharedProvider =
    preferredTranscriptionProvider === "groq" ||
    preferredTranscriptionProvider === "local-whisper"
      ? null
      : preferredTranscriptionProvider;

  return {
    providerConfigs,
    defaultsState: {
      preferredProvider,
      setPreferredProvider,
      targetLanguage,
      setTargetLanguage,
      temperature,
      setTemperature,
      maxTokens,
      setMaxTokens,
    },
    providersState: {
      selectedProvider,
      setSelectedProvider,
      showApiKeys,
      toggleApiKeyVisibility,
      testingConnection,
      connectionStatus,
      testConnection,
      ollamaBaseUrl,
      setOllamaBaseUrl,
      opencodeBaseUrl,
      setOpencodeBaseUrl,
    },
    transcriptionState: {
      preferredTranscriptionProvider,
      setPreferredTranscriptionProvider,
      transcriptionSharedProvider,
      groqApiKey,
      setGroqApiKey,
      showGroqApiKey,
      setShowGroqApiKey,
      localWhisperUrl,
      setLocalWhisperUrl,
      localWhisperModel,
      setLocalWhisperModel,
    },
  };
}
