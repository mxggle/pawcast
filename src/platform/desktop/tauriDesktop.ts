import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { open } from "@tauri-apps/plugin-dialog";

import type {
  DesktopMediaFile,
  AiSettingsChangedPayload,
  DesktopFetchOptions,
  FolderTreeNode,
  GlossaryPlaybackPayload,
  HealthCheckResult,
  MediaTreeChangedPayload,
  MigrationResult,
  NavigationPayload,
  RecoveryResult,
  WaveformLevel,
  WaveformMeta,
} from "../../types/desktop";
import { toDesktopError } from "./errors";
import type { DesktopError } from "./errors";
import type { DesktopAPI, DesktopUnlisten } from "./types";

type Invoke = <T>(command: string, payload?: Record<string, unknown>) => Promise<T>;
type Unlisten = () => void;
type EventHandler<T> = (event: { payload: T }) => void;

interface DragDropEvent {
  payload: {
    type: string;
    paths?: string[];
  };
}

interface CurrentWindow {
  onDragDropEvent(handler: (event: DragDropEvent) => void): Promise<Unlisten>;
}

export interface TauriDesktopDependencies {
  invoke: Invoke;
  listen<T>(event: string, handler: EventHandler<T>): Promise<Unlisten>;
  open(options: { multiple: false; directory: boolean }): Promise<string | string[] | null>;
  convertFileSrc(path: string, protocol?: string): string;
  getCurrentWindow?: () => CurrentWindow;
  reportError?: (error: DesktopError) => void;
}

const asSinglePath = (value: string | string[] | null): string | null =>
  Array.isArray(value) ? value[0] ?? null : value;

const createSubscription = (
  register: () => Promise<Unlisten>,
  afterStop?: () => void,
): DesktopUnlisten => {
  let stopped = false;
  let unlisten: Unlisten | undefined;
  const ready = register()
    .then((cleanup) => {
      if (stopped) cleanup();
      else unlisten = cleanup;
    })
    .catch((error) => {
      if (!stopped) console.error(toDesktopError(error));
    });

  const stop = (() => {
    if (stopped) return;
    stopped = true;
    unlisten?.();
    unlisten = undefined;
    afterStop?.();
  }) as DesktopUnlisten;
  stop.ready = ready;
  return stop;
};

export const createTauriDesktop = (dependencies: TauriDesktopDependencies): DesktopAPI => {
  const reportError = dependencies.reportError ?? ((error: DesktopError) => console.error(error));
  const execute = async <T>(operation: () => Promise<T>): Promise<T> => {
    try {
      return await operation();
    } catch (error) {
      throw toDesktopError(error);
    }
  };

  const call = async <T>(command: string, payload?: Record<string, unknown>): Promise<T> => {
    return execute(() => dependencies.invoke<T>(command, payload));
  };

  const subscribe = <T>(event: string, callback: (payload: T) => void): DesktopUnlisten =>
    createSubscription(() => dependencies.listen<T>(event, ({ payload }) => callback(payload)));

  return {
    openFile: async () => asSinglePath(await execute(() => dependencies.open({ multiple: false, directory: false }))),
    openFolder: async () => asSinglePath(await execute(() => dependencies.open({ multiple: false, directory: true }))),
    openSettingsWindow: (tab, section) => call("open_settings_window", { tab, section }),
    closeSettingsWindow: () => call("close_settings_window"),
    openGlossaryWindow: () => call("open_glossary_window"),
    closeGlossaryWindow: () => call("close_glossary_window"),
    navigateInMainWindow: (route, entryId) => call("navigate_in_main_window", { route, entryId }),
    onNavigate: (callback) => subscribe<NavigationPayload>("navigate", callback),
    playGlossaryEntryInMainWindow: (entryId) => call("play_glossary_entry_in_main_window", { entryId }),
    onGlossaryPlayback: (callback) => subscribe<GlossaryPlaybackPayload>("play-glossary-entry", callback),
    showInFileManager: (targetPath) => call<boolean>("show_in_file_manager", { targetPath }),
    listMediaFiles: (folderPath) => call<DesktopMediaFile[]>("list_media_files", { folderPath }),
    listMediaTree: (folderPath) => call<FolderTreeNode[]>("list_media_tree", { folderPath }),
    watchMediaTree: (folderPath, callback) =>
      createSubscription(async () => {
        const unlisten = await dependencies.listen<MediaTreeChangedPayload>(
          "media-tree-changed",
          ({ payload }) => {
            if (payload.folderPath === folderPath) callback(payload);
          },
        );
        let watchId: string;
        try {
          watchId = await call<string>("watch_media_tree", { folderPath });
        } catch (error) {
          unlisten();
          throw error;
        }
        return () => {
          unlisten();
          void call("unwatch_media_tree", { watchId }).catch(reportError);
        };
      }),
    configGet: (key) => call("config_get", { key }),
    configSet: (key, value) => call("config_set", { key, value }),
    configGetAll: () => call("config_get_all"),
    onConfigChanged: (callback) => subscribe("config-changed", callback),
    broadcastAiSettings: (payload) => call("broadcast_ai_settings", { payload }),
    onAiSettingsChanged: (callback) =>
      subscribe<AiSettingsChangedPayload>("ai-settings-changed", callback),
    fetch: (url, options: DesktopFetchOptions) => call("desktop_fetch", { url, options }),
    waveformAnalyze: (filePath, mediaId) => call<WaveformMeta | null>("waveform_analyze", { filePath, mediaId }),
    waveformGetMeta: (mediaId) => call<WaveformMeta | null>("waveform_get_meta", { mediaId }),
    waveformGetLevel: (mediaId, level) => call<WaveformLevel | null>("waveform_get_level", { mediaId, level }),
    waveformDelete: (mediaId) => call("waveform_delete", { mediaId }),
    onWaveformProgress: (callback) => subscribe("waveform-progress", callback),
    dataGet: (path) => call("data_get", { path }),
    dataPut: (path, data) => call("data_put", { path, data }),
    dataDelete: (path) => call("data_delete", { path }),
    dataList: (path) => call<string[]>("data_list", { path }),
    dataGetMediaFile: async (filePath) => {
      const result = await call<ArrayBuffer | number[]>("data_get_media_file", { path: filePath });
      return result instanceof ArrayBuffer ? result : Uint8Array.from(result).buffer;
    },
    dataPutMediaFile: (filePath, data) =>
      call("data_put_media_file", { path: filePath, data: Array.from(new Uint8Array(data)) }),
    dataGetDirectory: () => call<string>("data_get_directory"),
    dataChangeDirectory: (targetPath) => call("data_change_directory", { targetPath }),
    dataHealthCheck: () => call<HealthCheckResult>("data_health_check"),
    dataRecover: (strategy) => call<RecoveryResult>("data_recover", { strategy }),
    dataRunMigration: (localStorage, indexedDB) =>
      call<MigrationResult>("data_run_migration", { localStorage, indexedDb: indexedDB }),
    dataIsMigrated: () => call<boolean>("data_is_migrated"),
    approvePath: (filePath) => call("approve_path", { filePath }),
    mediaUrl: (filePath) => dependencies.convertFileSrc(filePath, "local-media"),
    onFileDrop: (callback) => {
      let currentWindow: CurrentWindow | undefined;
      try {
        // Throws outside a real Tauri runtime (browser dev with the
        // force-desktop escape hatch); treat that as "no drop events".
        currentWindow = dependencies.getCurrentWindow?.();
      } catch {
        currentWindow = undefined;
      }
      if (!currentWindow) return createSubscription(async () => () => undefined);
      return createSubscription(() => currentWindow.onDragDropEvent((event) => {
        if (event.payload.type === "drop" && event.payload.paths) callback(event.payload.paths);
      }));
    },
  };
};

export const tauriDesktop = createTauriDesktop({
  invoke,
  listen,
  open,
  convertFileSrc,
  getCurrentWindow,
});
