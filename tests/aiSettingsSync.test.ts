import assert from "node:assert/strict";
import test from "node:test";

import {
  AI_SETTINGS_STORAGE_KEYS,
  applyAiSettingsPayload,
  getAiSettingsPayload,
} from "../src/utils/aiSettingsSync.ts";

const createStorage = (initial: Record<string, string> = {}) => {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
    clear: () => values.clear(),
    key: (index: number) => [...values.keys()][index] ?? null,
    get length() { return values.size; },
  } satisfies Storage;
};

test("AI settings payload includes every supported setting", () => {
  globalThis.localStorage = createStorage({ openai_model: "gpt-test" });

  const payload = getAiSettingsPayload();

  assert.deepEqual(Object.keys(payload), [...AI_SETTINGS_STORAGE_KEYS]);
  assert.equal(payload.openai_model, "gpt-test");
});

test("AI settings sync applies allowlisted string values only", () => {
  globalThis.localStorage = createStorage({ openai_model: "old-model" });

  const changed = applyAiSettingsPayload({
    openai_model: "new-model",
    unexpected_setting: "rejected",
    ai_max_tokens: 3000,
    __proto__: { polluted: true },
  });

  assert.equal(changed, true);
  assert.equal(localStorage.getItem("openai_model"), "new-model");
  assert.equal(localStorage.getItem("unexpected_setting"), null);
  assert.equal(localStorage.getItem("ai_max_tokens"), null);
  assert.equal(({} as { polluted?: boolean }).polluted, undefined);
});
