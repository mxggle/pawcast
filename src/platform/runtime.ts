import { isTauri } from "@tauri-apps/api/core";

import type { DesktopAPI } from "./desktop/types";
import { tauriDesktop } from "./desktop/tauriDesktop";

export const isDesktop = (): boolean => isTauri();

export const desktopApi: DesktopAPI | null = isDesktop() ? tauriDesktop : null;

/** Fetch through the desktop backend when its string-body contract can represent the request. */
export const platformFetch: typeof fetch = async (input, init) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  const canUseDesktop = desktopApi && !(input instanceof Request) && (!init?.body || typeof init.body === "string");
  if (!canUseDesktop) return globalThis.fetch(input, init);

  const result = await desktopApi.fetch(url, init);
  const body = [101, 204, 205, 304].includes(result.status) ? null : result.data;
  return new Response(body, {
    status: result.status,
    statusText: result.statusText,
    headers: result.headers,
  });
};
