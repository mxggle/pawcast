import assert from "node:assert/strict";
import { mock, test } from "node:test";

import { toDesktopError } from "../src/platform/desktop/errors.ts";
import { createTauriDesktop } from "../src/platform/desktop/tauriDesktop.ts";

test("tauri desktop maps config and cleans up listeners", async () => {
  const calls: unknown[] = [];
  const unlisten = mock.fn();
  const api = createTauriDesktop({
    invoke: async (command, payload) => {
      calls.push([command, payload]);
      return "value";
    },
    listen: async () => unlisten,
    open: async () => null,
    revealItemInDir: async () => undefined,
    convertFileSrc: (path) => `asset://${path}`,
  });

  assert.equal(await api.configGet("theme-storage"), "value");
  assert.deepEqual(calls[0], ["config_get", { key: "theme-storage" }]);

  const stop = api.onConfigChanged(() => undefined);
  await stop.ready;
  stop();
  assert.equal(unlisten.mock.callCount(), 1);
});

test("listener cleanup is safe before asynchronous registration resolves", async () => {
  let resolveListen!: (unlisten: () => void) => void;
  const unlisten = mock.fn();
  const api = createTauriDesktop({
    invoke: async () => undefined,
    listen: () => new Promise((resolve) => { resolveListen = resolve; }),
    open: async () => null,
    revealItemInDir: async () => undefined,
    convertFileSrc: (path) => path,
  });

  const stop = api.onNavigate(() => undefined);
  stop();
  resolveListen(unlisten);
  await stop.ready;

  assert.equal(unlisten.mock.callCount(), 1);
});

test("media tree cleanup stops the Rust watcher by returned watch id", async () => {
  const calls: unknown[] = [];
  const api = createTauriDesktop({
    invoke: async (command, payload) => {
      calls.push([command, payload]);
      return command === "watch_media_tree" ? "watch-7" : undefined;
    },
    listen: async () => () => undefined,
    open: async () => null,
    revealItemInDir: async () => undefined,
    convertFileSrc: (path) => path,
  });

  const stop = api.watchMediaTree("/media", () => undefined);
  await stop.ready;
  stop();
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.deepEqual(calls, [
    ["watch_media_tree", { folderPath: "/media" }],
    ["unwatch_media_tree", { watchId: "watch-7" }],
  ]);
});

test("tauri desktop explicitly maps dialogs, commands, and media URLs", async () => {
  const calls: Array<[string, unknown]> = [];
  const dialogCalls: unknown[] = [];
  const revealCalls: string[] = [];
  const api = createTauriDesktop({
    invoke: async (command, payload) => {
      calls.push([command, payload]);
      if (command === "show_in_file_manager") return true;
      return null;
    },
    listen: async () => () => undefined,
    open: async (options) => {
      dialogCalls.push(options);
      return "/media/example.mp3";
    },
    revealItemInDir: async (path) => { revealCalls.push(path); },
    convertFileSrc: (path, protocol) => `${protocol}://${path}`,
  });

  assert.equal(await api.openFile(), "/media/example.mp3");
  assert.equal(await api.openFolder(), "/media/example.mp3");
  await api.openSettingsWindow("ai", "providers");
  await api.navigateInMainWindow("/player", "entry-1");
  await api.approvePath("/media/example.mp3");
  await api.showInFileManager("/media/example.mp3");

  assert.deepEqual(dialogCalls, [
    { multiple: false, directory: false },
    { multiple: false, directory: true },
  ]);
  assert.deepEqual(calls, [
    ["open_settings_window", { tab: "ai", section: "providers" }],
    ["navigate_in_main_window", { route: "/player", entryId: "entry-1" }],
    ["approve_path", { filePath: "/media/example.mp3" }],
    ["show_in_file_manager", { targetPath: "/media/example.mp3" }],
  ]);
  assert.deepEqual(revealCalls, []);
  assert.equal(api.mediaUrl("/media/example.mp3"), "local-media:///media/example.mp3");
});

test("tauri desktop maps data, waveform, and fetch command payloads", async () => {
  const calls: unknown[] = [];
  const api = createTauriDesktop({
    invoke: async (command, payload) => {
      calls.push([command, payload]);
      return null;
    },
    listen: async () => () => undefined,
    open: async () => null,
    revealItemInDir: async () => undefined,
    convertFileSrc: (path) => path,
  });

  await api.fetch("https://example.com", { method: "POST", body: "body" });
  await api.waveformAnalyze("/media/a.mp3", "media-1");
  await api.waveformGetLevel("media-1", 2);
  await api.dataPut("settings/app.json", { enabled: true });
  await api.dataPutMediaFile("media/a.bin", new ArrayBuffer(2));
  await api.dataChangeDirectory("/data/PawcastData");
  await api.dataRunMigration({ theme: "dark" }, { recordings: [] });
  await api.dataRecover("journal");

  assert.deepEqual(calls.map(([command]) => command), [
    "desktop_fetch",
    "waveform_analyze",
    "waveform_get_level",
    "data_put",
    "data_put_media_file",
    "data_change_directory",
    "data_run_migration",
    "data_recover",
  ]);
  assert.deepEqual(calls[1], ["waveform_analyze", { filePath: "/media/a.mp3", mediaId: "media-1" }]);
  assert.deepEqual(calls[2], ["waveform_get_level", { mediaId: "media-1", level: 2 }]);
  assert.deepEqual(calls[4], ["data_put_media_file", { path: "media/a.bin", data: [0, 0] }]);
});

test("toDesktopError preserves structured failures and sanitizes unknown values", () => {
  const structured = toDesktopError({
    code: "no_audio_stream",
    message: "This file has no audio stream",
    operation: "waveform_analyze",
    retryable: false,
  });
  assert.equal(structured.code, "no_audio_stream");
  assert.equal(structured.operation, "waveform_analyze");
  assert.equal(structured.retryable, false);

  const unknown = toDesktopError({ authorization: "secret", internal: { path: "/private" } });
  assert.equal(unknown.code, "desktop_command_failed");
  assert.equal(unknown.message, "The desktop command failed.");
  assert.equal(unknown.message.includes("secret"), false);
});
