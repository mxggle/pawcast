import {
  AIProvider,
  AIServiceConfig,
  AIResponse,
  OpenAIRequest,
  OpenAIResponse,
  GeminiRequest,
  GeminiResponse,
  GrokRequest,
  GrokResponse,
  ModelOption,
  getAllModels,
  getModelById,
  DEFAULT_MODELS,
  normalizeModelId,
} from "../types/aiService";

const LEGACY_DEFAULT_OPENCODE_BASE_URL = "https://opencode.ai/zen/v1";
const LEGACY_DEFAULT_OPENCODE_CHAT_COMPLETIONS_URL = `${LEGACY_DEFAULT_OPENCODE_BASE_URL}/chat/completions`;
export const DEFAULT_OPENCODE_BASE_URL = "https://opencode.ai/zen/go/v1";
export const DEFAULT_OPENCODE_CHAT_COMPLETIONS_URL = `${DEFAULT_OPENCODE_BASE_URL}/chat/completions`;

export const normalizeOpenCodeBaseUrl = (baseURL?: string | null): string => {
  const trimmedBaseURL = baseURL?.trim().replace(/\/+$/, "");

  if (!trimmedBaseURL || trimmedBaseURL === LEGACY_DEFAULT_OPENCODE_BASE_URL) {
    return DEFAULT_OPENCODE_BASE_URL;
  }

  if (trimmedBaseURL === LEGACY_DEFAULT_OPENCODE_CHAT_COMPLETIONS_URL) {
    return DEFAULT_OPENCODE_CHAT_COMPLETIONS_URL;
  }

  return trimmedBaseURL;
};

const getStoredItem = (key: string): string | null => {
  if (typeof localStorage === "undefined") {
    return null;
  }

  return localStorage.getItem(key);
};

async function safeFetch(url: string, options?: RequestInit): Promise<Response> {
  const startTime = Date.now();
  const urlObj = new URL(url);
  const host = urlObj.host;
  
  const finishLog = (res: { ok: boolean, status: number }) => {
    const duration = Date.now() - startTime;
    console.log(`[AI Service] fetch to ${host} took ${duration}ms (status: ${res.status} ${res.ok ? 'OK' : 'Error'})`);
  };

  try {
    // Use IPC fetch in Electron to bypass CORS issues
    if (window.electronAPI?.fetch) {
      const res = await window.electronAPI.fetch(url, options);
      finishLog({ ok: res.ok, status: res.status });
      return {
        ok: res.ok,
        status: res.status,
        statusText: res.statusText,
        headers: new Headers(res.headers),
        text: async () => res.data,
        json: async () => JSON.parse(res.data),
      } as Response;
    }
    
    // For web, route OpenCode requests through our proxy to avoid CORS
    if (url.includes("opencode.ai")) {
      // Matches https://opencode.ai, https://api.opencode.ai, https://www.opencode.ai, etc.
      const proxyUrl = url.replace(/https?:\/\/(?:[a-zA-Z0-9-]+\.)?opencode\.ai/, "/api/opencode");
      const res = await fetch(proxyUrl, options);
      finishLog(res);
      return res;
    }

    // For web, route DeepSeek requests through our proxy to avoid CORS
    if (url.includes("api.deepseek.com")) {
      const proxyUrl = url.replace("https://api.deepseek.com", "/api/deepseek");
      const res = await fetch(proxyUrl, options);
      finishLog(res);
      return res;
    }

    const res = await fetch(url, options);
    finishLog(res);
    return res;
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`[AI Service] fetch to ${host} failed after ${duration}ms:`, error);
    throw error;
  }
}

const buildChatCompletionsUrl = (baseURL: string): string => {
  const trimmedBaseURL = baseURL.trim().replace(/\/+$/, "");

  if (trimmedBaseURL.endsWith("/chat/completions")) {
    return trimmedBaseURL;
  }

  return `${trimmedBaseURL}/chat/completions`;
};

const extractApiErrorMessage = (provider: string, status: number, errorText: string): string => {
  try {
    const parsed = JSON.parse(errorText) as {
      error?: { message?: string } | string;
      message?: string;
    };
    const message =
      typeof parsed.error === "string"
        ? parsed.error
        : parsed.error?.message || parsed.message;

    if (message) {
      return `${provider} API error: ${status} - ${message}`;
    }
  } catch {
    // Fall back to the raw response body below.
  }

  return `${provider} API error: ${status} - ${errorText}`;
};

export class UnifiedAIService {
  private static instance: UnifiedAIService;

  public static getInstance(): UnifiedAIService {
    if (!UnifiedAIService.instance) {
      UnifiedAIService.instance = new UnifiedAIService();
    }
    return UnifiedAIService.instance;
  }

  // OpenAI API call
  private async callOpenAI(
    config: AIServiceConfig,
    prompt: string
  ): Promise<AIResponse> {
    const model = getModelById(config.model);
    if (!model || model.provider !== "openai") {
      throw new Error(`Invalid OpenAI model: ${config.model}`);
    }

    const request: OpenAIRequest = {
      model: config.model,
      messages: [
        ...(config.systemPrompt
          ? [{ role: "system" as const, content: config.systemPrompt }]
          : []),
        { role: "user" as const, content: prompt },
      ],
      temperature: config.temperature ?? 0.7,
      max_tokens: config.maxTokens ?? model.maxOutputTokens,
      top_p: config.topP ?? 1,
      frequency_penalty: config.frequencyPenalty ?? 0,
      presence_penalty: config.presencePenalty ?? 0,
      response_format: config.responseFormat ? { type: config.responseFormat } : undefined,
    };

    const response = await safeFetch(
      config.baseURL || "https://api.openai.com/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify(request),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenAI API error: ${response.status} - ${error}`);
    }

    const data: OpenAIResponse = await response.json();

    return {
      content: data.choices[0]?.message?.content || "",
      usage: {
        promptTokens: data.usage.prompt_tokens,
        completionTokens: data.usage.completion_tokens,
        totalTokens: data.usage.total_tokens,
      },
      model: config.model,
      provider: "openai",
      finishReason: data.choices[0]?.finish_reason,
    };
  }

  // Gemini API call
  private async callGemini(
    config: AIServiceConfig,
    prompt: string
  ): Promise<AIResponse> {
    const normalizedModel = normalizeModelId("gemini", config.model);
    const model = getModelById(normalizedModel);
    if (!model || model.provider !== "gemini") {
      throw new Error(`Invalid Gemini model: ${config.model}`);
    }

    const request: GeminiRequest = {
      contents: [
        {
          role: "user",
          parts: [{ text: prompt }],
        },
      ],
      ...(config.systemPrompt
        ? {
            systemInstruction: {
              role: "system",
              parts: [{ text: config.systemPrompt }],
            },
          }
        : {}),
      generationConfig: {
        temperature: config.temperature ?? 0.7,
        topP: config.topP ?? 1,
        maxOutputTokens: config.maxTokens ?? model.maxOutputTokens,
        responseMimeType: config.responseFormat === "json_object" ? "application/json" : "text/plain",
      },
    };

    const apiKey = config.apiKey;
    const baseURL =
      config.baseURL || "https://generativelanguage.googleapis.com/v1beta";
    const url = `${baseURL}/models/${normalizedModel}:generateContent?key=${apiKey}`;

    const response = await safeFetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Gemini API error: ${response.status} - ${error}`);
    }

    const data: GeminiResponse = await response.json();

    return {
      content: data.candidates[0]?.content?.parts[0]?.text || "",
      usage: {
        promptTokens: data.usageMetadata.promptTokenCount,
        completionTokens: data.usageMetadata.candidatesTokenCount,
        totalTokens: data.usageMetadata.totalTokenCount,
      },
      model: normalizedModel,
      provider: "gemini",
      finishReason: data.candidates[0]?.finishReason,
    };
  }

  // Ollama API call (OpenAI-compatible, no API key required)
  private async callOllama(
    config: AIServiceConfig,
    prompt: string
  ): Promise<AIResponse> {
    const baseURL =
      config.baseURL ||
      localStorage.getItem("ollama_base_url") ||
      "http://localhost:11434";

    const request: OpenAIRequest = {
      model: config.model,
      messages: [
        ...(config.systemPrompt
          ? [{ role: "system" as const, content: config.systemPrompt }]
          : []),
        { role: "user" as const, content: prompt },
      ],
      temperature: config.temperature ?? 0.7,
      max_tokens: config.maxTokens ?? 2048,
      top_p: config.topP ?? 1,
      response_format: config.responseFormat ? { type: config.responseFormat } : undefined,
    };

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (config.apiKey) {
      headers["Authorization"] = `Bearer ${config.apiKey}`;
    }

    const response = await safeFetch(`${baseURL}/v1/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Ollama API error: ${response.status} - ${error}`);
    }

    const data: OpenAIResponse = await response.json();

    return {
      content: data.choices[0]?.message?.content || "",
      usage: {
        promptTokens: data.usage?.prompt_tokens ?? 0,
        completionTokens: data.usage?.completion_tokens ?? 0,
        totalTokens: data.usage?.total_tokens ?? 0,
      },
      model: config.model,
      provider: "ollama",
      finishReason: data.choices[0]?.finish_reason,
    };
  }

  // OpenCode Go API call (OpenAI-compatible)
  private async callOpenCode(
    config: AIServiceConfig,
    prompt: string
  ): Promise<AIResponse> {
    const modelId = normalizeModelId("opencode", config.model);
    const request: OpenAIRequest = {
      model: modelId,
      messages: [
        ...(config.systemPrompt
          ? [{ role: "system" as const, content: config.systemPrompt }]
          : []),
        { role: "user" as const, content: prompt },
      ],
      temperature: config.temperature ?? 0.7,
      max_tokens: config.maxTokens ?? 2048,
      top_p: config.topP ?? 1,
      response_format: config.responseFormat ? { type: config.responseFormat } : undefined,
    };

    const baseURL = normalizeOpenCodeBaseUrl(
      config.baseURL || getStoredItem("opencode_base_url")
    );

    const response = await safeFetch(buildChatCompletionsUrl(baseURL), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(extractApiErrorMessage("OpenCode", response.status, error));
    }

    const data: OpenAIResponse = await response.json();

    return {
      content: data.choices[0]?.message?.content || "",
      usage: {
        promptTokens: data.usage?.prompt_tokens ?? 0,
        completionTokens: data.usage?.completion_tokens ?? 0,
        totalTokens: data.usage?.total_tokens ?? 0,
      },
      model: modelId,
      provider: "opencode",
      finishReason: data.choices[0]?.finish_reason,
    };
  }

  // Grok API call
  private async callGrok(
    config: AIServiceConfig,
    prompt: string
  ): Promise<AIResponse> {
    const model = getModelById(config.model);
    if (!model || model.provider !== "grok") {
      throw new Error(`Invalid Grok model: ${config.model}`);
    }

    const request: GrokRequest = {
      model: config.model,
      messages: [
        ...(config.systemPrompt
          ? [{ role: "system" as const, content: config.systemPrompt }]
          : []),
        { role: "user" as const, content: prompt },
      ],
      temperature: config.temperature ?? 0.7,
      max_tokens: config.maxTokens ?? model.maxOutputTokens,
      top_p: config.topP ?? 1,
      response_format: config.responseFormat ? { type: config.responseFormat } : undefined,
    };

    const response = await safeFetch(
      config.baseURL || "https://api.x.ai/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify(request),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Grok API error: ${response.status} - ${error}`);
    }

    const data: GrokResponse = await response.json();

    return {
      content: data.choices[0]?.message?.content || "",
      usage: {
        promptTokens: data.usage.prompt_tokens,
        completionTokens: data.usage.completion_tokens,
        totalTokens: data.usage.total_tokens,
      },
      model: config.model,
      provider: "grok",
      finishReason: data.choices[0]?.finish_reason,
    };
  }

  // DeepSeek API call (OpenAI-compatible)
  private async callDeepSeek(
    config: AIServiceConfig,
    prompt: string
  ): Promise<AIResponse> {
    const normalizedModel = normalizeModelId("deepseek", config.model);
    const model = getModelById(normalizedModel, "deepseek");
    if (!model || model.provider !== "deepseek") {
      throw new Error(`Invalid DeepSeek model: ${config.model}`);
    }

    const request: OpenAIRequest = {
      model: normalizedModel,
      messages: [
        ...(config.systemPrompt
          ? [{ role: "system" as const, content: config.systemPrompt }]
          : []),
        { role: "user" as const, content: prompt },
      ],
      temperature: config.temperature ?? 0.7,
      max_tokens: config.maxTokens ?? model.maxOutputTokens,
      top_p: config.topP ?? 1,
      response_format: config.responseFormat ? { type: config.responseFormat } : undefined,
    };

    const response = await safeFetch(
      config.baseURL || "https://api.deepseek.com/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify(request),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`DeepSeek API error: ${response.status} - ${error}`);
    }

    const data: OpenAIResponse = await response.json();

    return {
      content: data.choices[0]?.message?.content || "",
      usage: {
        promptTokens: data.usage.prompt_tokens,
        completionTokens: data.usage.completion_tokens,
        totalTokens: data.usage.total_tokens,
      },
      model: config.model,
      provider: "deepseek",
      finishReason: data.choices[0]?.finish_reason,
    };
  }

  // Main method to call any AI service
  public async generateResponse(
    config: AIServiceConfig,
    prompt: string
  ): Promise<AIResponse> {
    const startTime = Date.now();
    const requestId = Math.random().toString(36).substring(7);
    console.log(`[AI Service] [${requestId}] Request starting for ${config.provider} (model: ${config.model})`);

    if (!config.apiKey && config.provider !== "ollama") {
      throw new Error(`API key is required for ${config.provider}`);
    }

    try {
      let response: AIResponse;
      switch (config.provider) {
        case "openai":
          response = await this.callOpenAI(config, prompt);
          break;
        case "gemini":
          response = await this.callGemini(config, prompt);
          break;
        case "grok":
          response = await this.callGrok(config, prompt);
          break;
        case "ollama":
          response = await this.callOllama(config, prompt);
          break;
        case "opencode":
          response = await this.callOpenCode(config, prompt);
          break;
        case "deepseek":
          response = await this.callDeepSeek(config, prompt);
          break;
        default:
          throw new Error(`Unsupported AI provider: ${config.provider}`);
      }

      const duration = Date.now() - startTime;
      console.log(`[AI Service] [${requestId}] Request completed successfully in ${duration}ms. Tokens: ${response.usage?.totalTokens || 'unknown'}`);
      return response;
    } catch (error) {
      const duration = Date.now() - startTime;
      console.error(`[AI Service] [${requestId}] Request failed after ${duration}ms:`, error);
      throw error;
    }
  }

  // Get available models
  public getAvailableModels(): ModelOption[] {
    return getAllModels();
  }

  // Get models by provider
  public getModelsByProvider(provider: AIProvider): ModelOption[] {
    return getAllModels().filter((model) => model.provider === provider);
  }

  // Get default model for provider
  public getDefaultModel(provider: AIProvider): string {
    return DEFAULT_MODELS[provider];
  }

  // Validate API key format
  public validateApiKey(provider: AIProvider, apiKey: string): boolean {
    if (!apiKey || apiKey.trim() === "") return false;

    switch (provider) {
      case "openai":
        return apiKey.startsWith("sk-") && apiKey.length > 20;
      case "gemini":
        return apiKey.length > 20; // Gemini keys don't have a specific prefix
      case "grok":
        return apiKey.startsWith("xai-") || apiKey.length > 20;
      case "ollama":
        return true; // No API key required
      case "opencode":
        return apiKey.length > 10;
      case "deepseek":
        return apiKey.startsWith("sk-") && apiKey.length > 20;
      default:
        return false;
    }
  }

  // Test API connection
  public async testConnection(config: AIServiceConfig): Promise<{ success: boolean; message?: string }> {
    console.log(`[AI Service] Testing connection for ${config.provider}...`);
    try {
      const testPrompt =
        "Hello, this is a test message. Please respond with 'OK'.";
      
      // Ensure we have a reasonable maxTokens and temperature for testing
      const testConfig = {
        ...config,
        maxTokens: config.maxTokens || 100,
        temperature: config.temperature ?? 0.1,
      };

      const response = await this.generateResponse(testConfig, testPrompt);
      const success = response.content.length > 0;
      console.log(`[AI Service] Connection test for ${config.provider} result: ${success ? 'Success' : 'Empty response'}`);
      return { success };
    } catch (error) {
      console.error(`[AI Service] Connection test failed for ${config.provider}:`, error);
      return { 
        success: false, 
        message: error instanceof Error ? error.message : String(error)
      };
    }
  }
}

// Export singleton instance
export const aiService = UnifiedAIService.getInstance();
