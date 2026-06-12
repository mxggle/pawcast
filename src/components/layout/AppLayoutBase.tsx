import { useState, Dispatch, SetStateAction } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { usePlayerStore } from "../../stores/playerStore";
import { useSettingsStore } from "../../stores/settingsStore";
import { useShallow } from "zustand/react/shallow";
import {
  Moon, Sun, Settings, Layout, Eye, EyeOff,
  Music, Video, Youtube, BookOpen,
} from "lucide-react";
import * as Popover from "@radix-ui/react-popover";
import { cn } from "../../utils/cn";
import { ScrollLock } from "../../hooks/useScrollLock";
import { KeyboardShortcutsDialog } from "./KeyboardShortcutsDialog";

import { LayoutSettings } from "../../stores/layoutStore";

export interface AppLayoutBaseProps {
  children: React.ReactNode;
  layoutSettings?: LayoutSettings;
  setLayoutSettings?: Dispatch<SetStateAction<LayoutSettings>>;
  /** Left slot in the header: logo button (web) or sidebar toggle (Electron) */
  headerLeadingSlot?: React.ReactNode;
  /** Sidebar element rendered as a fixed aside (Electron only) */
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
      containerClassName,
      "pl-2 sm:pl-4"
    )}>
      {sidebar}

      <div
        className="flex flex-col flex-1 min-w-0 h-full transition-[padding-left] duration-300 ease-in-out"
        style={{ paddingLeft: contentPaddingLeft }}
      >
        {/* Spacer for fixed header */}
        <div className="h-[52px] sm:h-[56px]"></div>

        <header
          className={`flex items-center h-[52px] sm:h-[56px] justify-between px-2 sm:px-4 border-b border-black/5 dark:border-white/5 bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl fixed top-0 right-0 z-[55] transition-[left,padding-left] duration-300 ease-in-out ${
            desktopMode ? "[-webkit-app-region:drag] select-none [&_button]:[-webkit-app-region:no-drag] [&_input]:[-webkit-app-region:no-drag] [&_a]:[-webkit-app-region:no-drag] [&_[role='dialog']]:[-webkit-app-region:no-drag]" : ""
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

          {/* Media title – centered */}
          {(currentFile || currentYouTube) && (
            <div className="flex-1 flex justify-center px-2 sm:px-4 overflow-hidden min-w-0">
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-gray-50/80 dark:bg-white/10 backdrop-blur-sm border border-gray-200/60 dark:border-white/10 max-w-full transition-all hover:bg-white dark:hover:bg-white/15">
                {currentYouTube ? (
                  <Youtube className="h-3 w-3 text-error-500 shrink-0" />
                ) : currentFile?.type.includes("video") ? (
                  <Video className="h-3 w-3 text-blue-500 shrink-0" />
                ) : (
                  <Music className="h-3 w-3 text-primary-500 shrink-0" />
                )}
                <span className="text-[10px] sm:text-xs font-medium text-gray-600 dark:text-gray-200 truncate max-w-[100px] sm:max-w-[350px]">
                  {currentYouTube
                    ? currentYouTube.title || currentYouTube.id
                    : currentFile?.name}
                </span>
              </div>
            </div>
          )}

          <div className="flex items-center space-x-1 sm:space-x-3 shrink-0">
            {/* Layout settings popover */}
            {(currentFile || youtubeId) && layoutSettings && setLayoutSettings && (
              <Popover.Root open={isLayoutPopoverOpen} onOpenChange={setIsLayoutPopoverOpen}>
                <Popover.Trigger asChild>
                  <button
                    className="p-1.5 sm:p-2 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-300 transition-colors"
                    aria-label={t("layout.layoutSettings")}
                  >
                    <Layout className="h-4 w-4 sm:h-5 sm:w-5" />
                  </button>
                </Popover.Trigger>
                <Popover.Portal>
                  <Popover.Content
                    className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg p-4 w-64 z-50"
                    sideOffset={8}
                    align="end"
                  >
                    <ScrollLock />
                    <div className="space-y-3">
                      <h3 className="font-medium text-gray-900 dark:text-white text-sm">
                        {t("layout.layoutSettings")}
                      </h3>

                      {(
                        [
                          ["transcriptPanelVisible", "layout.transcript"],
                          ["videoPanelVisible", "player.video"],
                          ["timelinePanelVisible", "layout.waveform"],
                        ] as const
                      ).map(([key, labelKey]) => (
                        <div key={key} className="flex items-center justify-between">
                          <div className="flex items-center space-x-2">
                            {layoutSettings[key] ? (
                              <Eye className="h-4 w-4 text-gray-500" />
                            ) : (
                              <EyeOff className="h-4 w-4 text-gray-500" />
                            )}
                            <span className="text-sm text-gray-700 dark:text-gray-300">
                              {t(labelKey)}
                            </span>
                          </div>
                          <button
                            onClick={() =>
                              setLayoutSettings((current) => ({
                                ...current,
                                [key]: !current[key],
                              }))
                            }
                            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                              layoutSettings[key]
                                ? "bg-primary-600"
                                : "bg-gray-200 dark:bg-gray-600"
                            }`}
                          >
                            <span
                              className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${
                                layoutSettings[key] ? "translate-x-5" : "translate-x-1"
                              }`}
                            />
                          </button>
                        </div>
                      ))}
                    </div>
                    <Popover.Arrow className="fill-white dark:fill-gray-800" />
                  </Popover.Content>
                </Popover.Portal>
              </Popover.Root>
            )}

            {!hideGlossary && (
              <button
                onClick={() => navigate("/glossary")}
                className="p-1.5 sm:p-2 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-300 transition-colors"
                aria-label={t("glossary.openGlossary")}
              >
                <BookOpen className="h-4 w-4 sm:h-5 sm:w-5" />
              </button>
            )}

            {/* Theme toggle */}
            {!hideThemeToggle && (
              <button
                onClick={toggleTheme}
                className="p-1.5 sm:p-2 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-300 transition-colors"
                aria-label={
                  theme === "dark"
                    ? t("layout.switchToLightTheme")
                    : t("layout.switchToDarkTheme")
                }
              >
                {theme === "dark" ? (
                  <Sun className="h-4 w-4 sm:h-5 sm:w-5" />
                ) : (
                  <Moon className="h-4 w-4 sm:h-5 sm:w-5" />
                )}
              </button>
            )}

            {/* Settings */}
            {!hideSettings && onOpenSettings && (
              <button
                onClick={onOpenSettings}
                className="p-1.5 sm:p-2 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-300 transition-colors"
                aria-label={t("layout.openSettings")}
              >
                <Settings className="h-4 w-4 sm:h-5 sm:w-5" />
              </button>
            )}

            {/* Keyboard shortcuts dialog */}
            {!hideHelp && <KeyboardShortcutsDialog />}
          </div>
        </header>

        <main className={`flex flex-1 min-h-0 w-full flex-col overflow-y-auto overflow-x-hidden ${bottomPaddingClassName}`}>
          {children}
        </main>
      </div>
    </div>
  );
};
