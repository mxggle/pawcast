import { useState, Dispatch, SetStateAction } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { usePlayerStore } from "../../stores/playerStore";
import { useSettingsStore } from "../../stores/settingsStore";
import { useShallow } from "zustand/react/shallow";
import {
  Moon, Sun, Settings, Layout,
  Music, Video, Youtube, BookOpen,
} from "lucide-react";
import * as Popover from "@radix-ui/react-popover";
import { cn } from "../../utils/cn";
import { ScrollLock } from "../../hooks/useScrollLock";
import { KeyboardShortcutsDialog } from "./KeyboardShortcutsDialog";
import { Switch } from "../ui/switch";

/** Shared header icon-button style: consistent hit target + visible focus ring. */
export const headerIconButtonClass =
  "flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 transition-colors hover:bg-black/5 hover:text-gray-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 dark:text-gray-400 dark:hover:bg-white/10 dark:hover:text-gray-100";

import { LayoutSettings } from "../../stores/layoutStore";

export interface AppLayoutBaseProps {
  children: React.ReactNode;
  layoutSettings?: LayoutSettings;
  setLayoutSettings?: Dispatch<SetStateAction<LayoutSettings>>;
  /** Left slot in the header: logo button (web) or sidebar toggle (desktop app) */
  headerLeadingSlot?: React.ReactNode;
  /** Sidebar element rendered as a fixed aside (desktop only) */
  sidebar?: React.ReactNode;
  /** Dynamic left padding for main content when sidebar is open */
  contentPaddingLeft?: number;
  /** Dynamic left offset for the fixed header when sidebar is open */
  headerOffsetLeft?: number;
  /** Extra className on the outermost wrapper, e.g. "max-w-5xl mx-auto overflow-x-hidden" for web */
  containerClassName?: string;
  /** Bottom padding reserved for fixed overlays like the player controls */
  bottomPaddingClassName?: string;
  /** Enables desktop-specific styling like draggable header */
  desktopMode?: boolean;
  /** Hides the theme toggle from the header (useful when moved to sidebar) */
  hideThemeToggle?: boolean;
  /** Hides the settings button from the header (useful when moved to sidebar) */
  hideSettings?: boolean;
  /** Hides the glossary button from the header (useful when moved to sidebar) */
  hideGlossary?: boolean;
  /** Hides the keyboard-shortcuts/help button from the header (useful when moved to sidebar) */
  hideHelp?: boolean;
  /** Opens settings using the active platform shell behavior */
  onOpenSettings?: () => void;
  /** Opens the glossary using the active platform shell behavior (defaults to route navigation) */
  onOpenGlossary?: () => void;
}

export const AppLayoutBase = ({
  children,
  layoutSettings,
  setLayoutSettings,
  headerLeadingSlot,
  sidebar,
  contentPaddingLeft = 0,
  headerOffsetLeft = 0,
  containerClassName = "",
  bottomPaddingClassName = "pb-24 sm:pb-32",
  desktopMode = false,
  hideThemeToggle = false,
  hideSettings = false,
  hideGlossary = false,
  hideHelp = false,
  onOpenSettings,
  onOpenGlossary,
}: AppLayoutBaseProps) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [isLayoutPopoverOpen, setIsLayoutPopoverOpen] = useState(false);
  const isMac = typeof window !== "undefined" && navigator.userAgent.includes("Mac OS X");
  const isWindows = typeof window !== "undefined" && navigator.userAgent.includes("Windows");

  const {
    currentFile,
    currentYouTube,
  } = usePlayerStore(
    useShallow((state) => ({
      currentFile: state.currentFile,
      currentYouTube: state.currentYouTube,
    }))
  );

  const { theme, setTheme } = useSettingsStore();

  const toggleTheme = () => {
    setTheme(theme === "dark" ? "light" : "dark");
  };

  const youtubeId = currentYouTube?.id;

  return (
    <div className={cn(
      "flex h-screen w-full overflow-hidden transition-colors duration-300",
      desktopMode
        ? "bg-gray-50 dark:bg-[#0a0a12]"
        : "bg-white dark:bg-gray-900",
      containerClassName
    )}>
      {sidebar}

      <div
        className="flex flex-col flex-1 min-w-0 h-full transition-[padding-left] duration-300 ease-in-out"
        style={{ paddingLeft: contentPaddingLeft }}
      >
        {/* Spacer for fixed header */}
        <div className="h-[52px] sm:h-[56px]"></div>

        <header
          data-tauri-drag-region={desktopMode ? "deep" : undefined}
          className={`flex items-center h-[52px] sm:h-[56px] justify-between px-2 sm:px-4 border-b border-black/5 dark:border-white/5 bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl fixed top-0 right-0 z-[55] transition-[left,padding-left] duration-300 ease-in-out ${
            desktopMode ? "select-none" : ""
          }`}
          style={{
            left: headerOffsetLeft,
            paddingLeft: desktopMode && isMac && headerOffsetLeft === 0 ? "80px" : undefined,
            // Reserve space for the native Windows caption buttons (top-right) so
            // header controls aren't covered by minimize/maximize/close.
            paddingRight: desktopMode && isWindows ? "140px" : undefined,
          }}
        >
          {headerLeadingSlot}

          {/* Now playing – centered */}
          {(currentFile || currentYouTube) && (
            <div className="flex-1 flex justify-center px-2 sm:px-4 overflow-hidden min-w-0">
              <div className="flex max-w-full items-center gap-2 rounded-full border border-black/[0.06] bg-black/[0.03] py-1 pl-1.5 pr-3 dark:border-white/10 dark:bg-white/[0.06]">
                <span
                  className={cn(
                    "flex h-5 w-5 shrink-0 items-center justify-center rounded-full",
                    currentYouTube
                      ? "bg-error-500/10 text-error-500"
                      : currentFile?.type.includes("video")
                        ? "bg-info-500/10 text-info-500"
                        : "bg-primary-500/10 text-primary-500"
                  )}
                >
                  {currentYouTube ? (
                    <Youtube className="h-3 w-3" />
                  ) : currentFile?.type.includes("video") ? (
                    <Video className="h-3 w-3" />
                  ) : (
                    <Music className="h-3 w-3" />
                  )}
                </span>
                <span className="truncate text-[11px] font-medium text-gray-700 dark:text-gray-200 sm:text-xs max-w-[120px] sm:max-w-[350px]">
                  {currentYouTube
                    ? currentYouTube.title || currentYouTube.id
                    : currentFile?.name}
                </span>
              </div>
            </div>
          )}

          <div className="flex items-center gap-0.5 sm:gap-1 shrink-0">
            {/* Layout settings popover */}
            {(currentFile || youtubeId) && layoutSettings && setLayoutSettings && (
              <Popover.Root open={isLayoutPopoverOpen} onOpenChange={setIsLayoutPopoverOpen}>
                <Popover.Trigger asChild>
                  <button
                    className={headerIconButtonClass}
                    title={t("layout.layoutSettings")}
                    aria-label={t("layout.layoutSettings")}
                  >
                    <Layout className="h-4 w-4" />
                  </button>
                </Popover.Trigger>
                <Popover.Portal>
                  <Popover.Content
                    className="z-[70] w-60 rounded-xl border border-black/5 bg-white p-1.5 shadow-xl dark:border-white/10 dark:bg-gray-900"
                    sideOffset={8}
                    align="end"
                  >
                    <ScrollLock />
                    <h3 className="px-2.5 pb-1 pt-1.5 text-[11px] font-bold uppercase tracking-[0.08em] text-gray-400 dark:text-gray-500">
                      {t("layout.layoutSettings")}
                    </h3>

                    {(
                      [
                        ["transcriptPanelVisible", "layout.transcript"],
                        ["videoPanelVisible", "player.video"],
                        ["timelinePanelVisible", "layout.waveform"],
                      ] as const
                    ).map(([key, labelKey]) => (
                      <label
                        key={key}
                        className="flex cursor-pointer items-center justify-between gap-3 rounded-lg px-2.5 py-2 transition-colors hover:bg-black/[0.03] dark:hover:bg-white/[0.05]"
                      >
                        <span className="text-sm text-gray-700 dark:text-gray-300">
                          {t(labelKey)}
                        </span>
                        <Switch
                          checked={layoutSettings[key]}
                          onCheckedChange={(checked) =>
                            setLayoutSettings((current) => ({
                              ...current,
                              [key]: checked,
                            }))
                          }
                        />
                      </label>
                    ))}
                  </Popover.Content>
                </Popover.Portal>
              </Popover.Root>
            )}

            {!hideGlossary && (
              <button
                onClick={() => (onOpenGlossary ? onOpenGlossary() : navigate("/glossary"))}
                className={headerIconButtonClass}
                title={t("glossary.openGlossary")}
                aria-label={t("glossary.openGlossary")}
              >
                <BookOpen className="h-4 w-4" />
              </button>
            )}

            {/* Theme toggle */}
            {!hideThemeToggle && (
              <button
                onClick={toggleTheme}
                className={headerIconButtonClass}
                title={
                  theme === "dark"
                    ? t("layout.switchToLightTheme")
                    : t("layout.switchToDarkTheme")
                }
                aria-label={
                  theme === "dark"
                    ? t("layout.switchToLightTheme")
                    : t("layout.switchToDarkTheme")
                }
              >
                {theme === "dark" ? (
                  <Sun className="h-4 w-4" />
                ) : (
                  <Moon className="h-4 w-4" />
                )}
              </button>
            )}

            {/* Settings */}
            {!hideSettings && onOpenSettings && (
              <button
                onClick={onOpenSettings}
                className={headerIconButtonClass}
                title={t("layout.openSettings")}
                aria-label={t("layout.openSettings")}
              >
                <Settings className="h-4 w-4" />
              </button>
            )}

            {/* Keyboard shortcuts dialog */}
            {!hideHelp && (
              <KeyboardShortcutsDialog triggerClassName={headerIconButtonClass} />
            )}
          </div>
        </header>

        <main className={`flex flex-1 min-h-0 w-full flex-col overflow-y-auto overflow-x-hidden ${bottomPaddingClassName}`}>
          {children}
        </main>
      </div>
    </div>
  );
};
