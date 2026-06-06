import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import * as esbuild from "esbuild";

const bundleModule = async (entryPoint) => {
  const outdir = await mkdtemp(join(tmpdir(), "pawcast-ai-service-"));
  const outfile = join(outdir, "bundle.mjs");

  await esbuild.build({
    entryPoints: [entryPoint],
    outfile,
    bundle: true,
    format: "esm",
    platform: "node",
    target: "node22",
  });

  const module = await import(pathToFileURL(outfile).href);
  await rm(outdir, { recursive: true, force: true });
  return module;
};

test("opencode keeps custom model ids instead of falling back to the placeholder", async () => {
  const { normalizeModelId } = await bundleModule("src/types/aiService.ts");

  assert.equal(normalizeModelId("opencode", "glm-5"), "glm-5");
});

test("opencode accepts config-style model ids and sends API model ids", async () => {
  const { aiService } = await bundleModule("src/services/aiService.ts");
  const fetchCalls = [];

  globalThis.fetch = async (url, init) => {
    fetchCalls.push({ url: String(url), init });
    return {
      ok: true,
      json: async () => ({
        id: "test",
        object: "chat.completion",
        created: 0,
        model: "glm-5",
        choices: [
          {
            index: 0,
            message: { role: "assistant", content: "OK" },
            finish_reason: "stop",
          },
        ],
        usage: {
          prompt_tokens: 1,
          completion_tokens: 1,
          total_tokens: 2,
        },
      }),
    };
  };

  await aiService.generateResponse(
    {
      provider: "opencode",
      model: "opencode-go/glm-5",
      apiKey: "opencode-test-key",
    },
    "Hello"
  );

  const body = JSON.parse(fetchCalls[0]?.init?.body);
  assert.equal(body.model, "glm-5");
});

test("opencode uses the current OpenCode Go chat completions endpoint by default", async () => {
  const { aiService } = await bundleModule("src/services/aiService.ts");
  const fetchCalls = [];

  globalThis.fetch = async (url, init) => {
    fetchCalls.push({ url: String(url), init });
    return {
      ok: true,
      json: async () => ({
        id: "test",
        object: "chat.completion",
        created: 0,
        model: "glm-5",
        choices: [
          {
            index: 0,
            message: { role: "assistant", content: "OK" },
            finish_reason: "stop",
          },
        ],
        usage: {
          prompt_tokens: 1,
          completion_tokens: 1,
          total_tokens: 2,
        },
      }),
    };
  };

  await aiService.generateResponse(
    {
      provider: "opencode",
      model: "glm-5",
      apiKey: "opencode-test-key",
    },
    "Hello"
  );

  const url = fetchCalls[0]?.url;
  assert.ok(
    url === "https://opencode.ai/zen/go/v1/chat/completions" || 
    url === "/api/opencode/zen/go/v1/chat/completions",
    `Unexpected URL: ${url}`
  );
});

test("opencode uses the saved base url when generation callers omit baseURL", async () => {
  const { aiService } = await bundleModule("src/services/aiService.ts");
  const fetchCalls = [];

  globalThis.localStorage = {
    getItem: (key) =>
      key === "opencode_base_url" ? "https://example.test/v1" : null,
  };
  globalThis.fetch = async (url, init) => {
    fetchCalls.push({ url: String(url), init });
    return {
      ok: true,
      json: async () => ({
        id: "test",
        object: "chat.completion",
        created: 0,
        model: "glm-5",
        choices: [
          {
            index: 0,
            message: { role: "assistant", content: "OK" },
            finish_reason: "stop",
          },
        ],
        usage: {
          prompt_tokens: 1,
          completion_tokens: 1,
          total_tokens: 2,
        },
      }),
    };
  };

  await aiService.generateResponse(
    {
      provider: "opencode",
      model: "glm-5",
      apiKey: "opencode-test-key",
    },
    "Hello"
  );

  assert.equal(fetchCalls[0]?.url, "https://example.test/v1/chat/completions");
});

test("opencode migrates the previously saved legacy default base url", async () => {
  const { aiService } = await bundleModule("src/services/aiService.ts");
  const fetchCalls = [];

  globalThis.localStorage = {
    getItem: (key) =>
      key === "opencode_base_url" ? "https://opencode.ai/zen/v1" : null,
  };
  globalThis.fetch = async (url, init) => {
    fetchCalls.push({ url: String(url), init });
    return {
      ok: true,
      json: async () => ({
        id: "test",
        object: "chat.completion",
        created: 0,
        model: "glm-5",
        choices: [
          {
            index: 0,
            message: { role: "assistant", content: "OK" },
            finish_reason: "stop",
          },
        ],
        usage: {
          prompt_tokens: 1,
          completion_tokens: 1,
          total_tokens: 2,
        },
      }),
    };
  };

  await aiService.generateResponse(
    {
      provider: "opencode",
      model: "glm-5",
      apiKey: "opencode-test-key",
    },
    "Hello"
  );

  const url = fetchCalls[0]?.url;
  assert.ok(
    url === "https://opencode.ai/zen/go/v1/chat/completions" || 
    url === "/api/opencode/zen/go/v1/chat/completions",
    `Unexpected URL: ${url}`
  );
});

test("opencode migrates legacy default base url variants with trailing slash or chat path", async () => {
  const { normalizeOpenCodeBaseUrl } = await bundleModule("src/services/aiService.ts");

  assert.equal(
    normalizeOpenCodeBaseUrl("https://opencode.ai/zen/v1/"),
    "https://opencode.ai/zen/go/v1"
  );
  assert.equal(
    normalizeOpenCodeBaseUrl("https://opencode.ai/zen/v1/chat/completions"),
    "https://opencode.ai/zen/go/v1/chat/completions"
  );
});

test("opencode exposes current chat-completions Go models", async () => {
  const { getModelsByProvider } = await bundleModule("src/types/aiService.ts");
  const modelIds = getModelsByProvider("opencode").map((model) => model.id);

  assert.deepEqual(
    modelIds,
    [
      "glm-5.1",
      "glm-5",
      "kimi-k2.5",
      "kimi-k2.6",
      "deepseek-v4-pro",
      "deepseek-v4-flash",
      "qwen3.6-plus",
      "qwen3.5-plus",
      "minimax-m2.7",
      "minimax-m2.5",
      "mimo-v2.5-pro",
      "mimo-v2.5",
      "mimo-v2-pro",
      "mimo-v2-omni",
    ]
  );
});

test("deepseek exposes expected models", async () => {
  const { getModelsByProvider } = await bundleModule("src/types/aiService.ts");
  const modelIds = getModelsByProvider("deepseek").map((model) => model.id);

  assert.deepEqual(
    modelIds,
    [
      "deepseek-v4-flash",
      "deepseek-v4-pro",
      "deepseek-chat",
      "deepseek-reasoner",
    ]
  );
});

test("deepseek api key validation works", async () => {
  const { aiService } = await bundleModule("src/services/aiService.ts");
  
  assert.equal(aiService.validateApiKey("deepseek", "sk-123456789012345678901"), true);
  assert.equal(aiService.validateApiKey("deepseek", "sk-short"), false);
  assert.equal(aiService.validateApiKey("deepseek", "invalid-prefix"), false);
});

test("deepseek model normalization maps legacy models", async () => {
  const { normalizeModelId } = await bundleModule("src/types/aiService.ts");

  assert.equal(normalizeModelId("deepseek", "deepseek-chat"), "deepseek-v4-flash");
  assert.equal(normalizeModelId("deepseek", "deepseek-reasoner"), "deepseek-v4-flash");
  assert.equal(normalizeModelId("deepseek", "deepseek-v4-pro"), "deepseek-v4-pro");
});

test("deepseek uses the correct api endpoint and request format", async () => {
  const { aiService } = await bundleModule("src/services/aiService.ts");
  const fetchCalls = [];

  globalThis.fetch = async (url, init) => {
    fetchCalls.push({ url: String(url), init });
    return {
      ok: true,
      json: async () => ({
        id: "test",
        object: "chat.completion",
        created: 0,
        model: "deepseek-v4-flash",
        choices: [
          {
            index: 0,
            message: { role: "assistant", content: "DeepSeek OK" },
            finish_reason: "stop",
          },
        ],
        usage: {
          prompt_tokens: 5,
          completion_tokens: 2,
          total_tokens: 7,
        },
      }),
    };
  };

  await aiService.generateResponse(
    {
      provider: "deepseek",
      model: "deepseek-v4-flash",
      apiKey: "sk-test-key-long-enough-for-validation",
    },
    "Hello DeepSeek"
  );

  const url = fetchCalls[0]?.url;
  assert.ok(
    url === "https://api.deepseek.com/chat/completions" || 
    url === "/api/deepseek/chat/completions",
    `Unexpected URL: ${url}`
  );
  const body = JSON.parse(fetchCalls[0]?.init?.body);
  assert.equal(body.model, "deepseek-v4-flash");
  assert.equal(body.messages[0].content, "Hello DeepSeek");
});
