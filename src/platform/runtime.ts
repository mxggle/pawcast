import { isTauri } from "@tauri-apps/api/core";

import type { DesktopAPI } from "./desktop/types";
import type { DesktopFetchOptions } from "../types/desktop";
import { tauriDesktop } from "./desktop/tauriDesktop";

/**
 * Dev-only escape hatch: lets the browser dev server render the desktop shell
 * (`localStorage.setItem("pawcast-force-desktop", "1")` + reload). Desktop API
 * calls will fail in the browser, so this is for layout/UI work only.
 */
const isDesktopForcedInDev = (): boolean => {
  try {
    return import.meta.env.DEV && localStorage.getItem("pawcast-force-desktop") === "1";
  } catch {
    return false;
  }
};

export const isDesktop = (): boolean => isTauri() || isDesktopForcedInDev();

export const desktopApi: DesktopAPI | null = isDesktop() ? tauriDesktop : null;

type DesktopFetchCapability = Pick<DesktopAPI, "fetch">;

const serializeBody = async (
  request: Request,
  originalBody: BodyInit | null | undefined,
): Promise<Pick<DesktopFetchOptions, "body" | "bodyBytes">> => {
  if (request.body === null) return {};
  if (typeof originalBody === "string") return { body: originalBody };
  return { bodyBytes: Array.from(new Uint8Array(await request.arrayBuffer())) };
};

export const createPlatformFetch = (
  getDesktopApi: () => DesktopFetchCapability | null,
  webFetch: typeof globalThis.fetch = globalThis.fetch,
): typeof fetch => async (input, init) => {
  const api = getDesktopApi();
  if (!api) return webFetch(input, init);

  const request = new Request(input, init);
  if (request.signal.aborted) {
    throw request.signal.reason ?? new DOMException("The operation was aborted.", "AbortError");
  }
  const options: DesktopFetchOptions = {
    method: request.method,
    headers: Object.fromEntries(request.headers.entries()),
    ...await serializeBody(request, init?.body),
  };
  const result = await api.fetch(request.url, options);
  const body = [101, 204, 205, 304].includes(result.status) ? null : result.data;
  return new Response(body, {
    status: result.status,
    statusText: result.statusText,
    headers: result.headers,
  });
};

export const platformFetch = createPlatformFetch(() => desktopApi);
