import { translateLines } from "../../services/translationService";

export type TranslationStatus = "idle" | "loading" | "completed" | "error";

export interface TranslationEntry {
  status: TranslationStatus;
  text?: string;
  /** Error code — "MISSING_API_KEY" or a generic message. */
  error?: string;
}

/** Cache key isolates translations per target language. */
const makeKey = (targetLanguage: string, sourceText: string): string =>
  `${targetLanguage}${sourceText}`;

/** Shared singleton so `useSyncExternalStore` gets a stable reference for
    lines that have not been requested yet (avoids an infinite render loop). */
const IDLE_ENTRY: TranslationEntry = { status: "idle" };

const states = new Map<string, TranslationEntry>();
const listeners = new Map<string, Set<() => void>>();

/** Pending source texts awaiting a batched request, grouped by language. */
const pending = new Map<string, Set<string>>();
let flushTimer: ReturnType<typeof setTimeout> | null = null;

const MAX_BATCH = 20;
const FLUSH_DELAY_MS = 350;

const notify = (key: string): void => {
  listeners.get(key)?.forEach((listener) => listener());
};

const setState = (key: string, entry: TranslationEntry): void => {
  states.set(key, entry);
  notify(key);
};

export const getTranslationState = (
  targetLanguage: string,
  sourceText: string
): TranslationEntry => {
  return states.get(makeKey(targetLanguage, sourceText)) || IDLE_ENTRY;
};

export const subscribeToTranslation = (
  targetLanguage: string,
  sourceText: string,
  listener: () => void
): (() => void) => {
  const key = makeKey(targetLanguage, sourceText);
  if (!listeners.has(key)) {
    listeners.set(key, new Set());
  }
  listeners.get(key)!.add(listener);
  return () => {
    listeners.get(key)?.delete(listener);
    if (listeners.get(key)?.size === 0) {
      listeners.delete(key);
    }
  };
};

const scheduleFlush = (): void => {
  if (flushTimer !== null) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    void flush();
  }, FLUSH_DELAY_MS);
};

const flush = async (): Promise<void> => {
  // Process one language's chunk per flush, re-scheduling while work remains.
  const nextLang = pending.keys().next().value as string | undefined;
  if (!nextLang) return;

  const queue = pending.get(nextLang)!;
  const batch = Array.from(queue).slice(0, MAX_BATCH);
  batch.forEach((text) => queue.delete(text));
  if (queue.size === 0) {
    pending.delete(nextLang);
  }

  try {
    const results = await translateLines(batch, nextLang);
    batch.forEach((text, index) => {
      const translated = results[index] ?? "";
      setState(makeKey(nextLang, text), {
        status: "completed",
        text: translated,
      });
    });
  } catch (error) {
    const code =
      error instanceof Error && error.message === "MISSING_API_KEY"
        ? "MISSING_API_KEY"
        : error instanceof Error
          ? error.message
          : "UNKNOWN";
    batch.forEach((text) => {
      setState(makeKey(nextLang, text), { status: "error", error: code });
    });
  }

  if (pending.size > 0) {
    scheduleFlush();
  }
};

/**
 * Ensure a translation exists for the given line. No-op if it is already
 * cached or in flight. Enqueues the line for the next batched request.
 */
export const requestTranslation = (
  targetLanguage: string,
  sourceText: string
): void => {
  const trimmed = sourceText.trim();
  if (!trimmed) return;

  const key = makeKey(targetLanguage, trimmed);
  const existing = states.get(key);
  if (existing && (existing.status === "loading" || existing.status === "completed")) {
    return;
  }

  setState(key, { status: "loading" });

  if (!pending.has(targetLanguage)) {
    pending.set(targetLanguage, new Set());
  }
  pending.get(targetLanguage)!.add(trimmed);
  scheduleFlush();
};

/** Clear a failed entry so the next request retries it. */
export const retryTranslation = (
  targetLanguage: string,
  sourceText: string
): void => {
  states.delete(makeKey(targetLanguage, sourceText.trim()));
  requestTranslation(targetLanguage, sourceText);
};
