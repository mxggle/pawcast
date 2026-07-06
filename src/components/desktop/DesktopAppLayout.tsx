import { useState, useCallback, useEffect, useRef, Dispatch, SetStateAction } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { usePlayerStore } from "../../stores/playerStore";
import { useHistoryStore } from "../../stores/historyStore";
import { useTranscriptStore } from "../../stores/transcriptStore";
import { useSettingsStore } from "../../stores/settingsStore";
import { useShallow } from "zustand/react/shallow";
import { desktopApi } from "../../platform/runtime";
import {
  Search,
  X,
  ArrowUpDown,
  Check,
  PanelLeftOpen,
  PanelLeftClose,
  Home,
  Moon,
  Sun,
  Settings,
  BookOpen,
} from "lucide-react";
import { Popover, PopoverTrigger, PopoverContent } from "../ui/popover";
import { AppLayoutBase, headerIconButtonClass } from "../layout/AppLayoutBase";
import { KeyboardShortcutsDialog } from "../layout/KeyboardShortcutsDialog";
import { SidebarRow } from "../ui/SidebarRow";
import { FolderBrowser } from "./FolderBrowser";
import type {
  LibraryScope,
  LibrarySortBy,
  LibrarySortOrder,
} from "./librarySidebar";
import {
  onSettingsOpenIntent,
  type SettingsOpenIntentDetail,
} from "../../utils/settingsIntents";

/* ── Sidebar sizing (single macOS-style source list) ────────────── */
const MIN_SIDEBAR_WIDTH = 200;
const MAX_SIDEBAR_WIDTH = 450;

/* ── Library sort menu (compact popover, replaces inline controls) ── */
const SORT_FIELD_OPTIONS: { value: LibrarySortBy; labelKey: string; fallback: string }[] = [
  { value: "recent", labelKey: "sidebar.sortRecent", fallback: "Last played" },
  { value: "name", labelKey: "sidebar.sortName", fallback: "Name" },
  { value: "type", labelKey: "sidebar.sortType", fallback: "Type" },
  { value: "source", labelKey: "sidebar.sortSource", fallback: "Source" },
];

const sortMenuItemClass =
  "flex h-7 w-full items-center gap-2 rounded-md px-2 text-xs text-gray-700 transition-colors hover:bg-black/5 focus:outline-none focus-visible:bg-black/5 dark:text-gray-200 dark:hover:bg-white/10 dark:focus-visible:bg-white/10";

interface LibrarySortMenuProps {
  sortBy: LibrarySortBy;
  sortOrder: LibrarySortOrder;
  onSortByChange: (value: LibrarySortBy) => void;
  onSortOrderChange: (value: LibrarySortOrder) => void;
}

const LibrarySortMenu = ({
  sortBy,
  sortOrder,
  onSortByChange,
  onSortOrderChange,
}: LibrarySortMenuProps) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  const select = (apply: () => void) => {
    apply();
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          title={t("sidebar.sortLabel", "Sort files")}
          aria-label={t("sidebar.sortLabel", "Sort files")}
          className="flex h-6 w-6 items-center justify-center rounded-md text-gray-400 transition-colors hover:bg-black/5 hover:text-gray-700 focus:outline-none focus-visible:ring-1 focus-visible:ring-primary-500 dark:text-gray-500 dark:hover:bg-white/5 dark:hover:text-gray-200"
        >
          <ArrowUpDown className="h-3.5 w-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={6} className="z-[70] w-44 p-1">
        {SORT_FIELD_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            role="menuitemradio"
            aria-checked={sortBy === option.value}
            onClick={() => select(() => onSortByChange(option.value))}
            className={sortMenuItemClass}
          >
            <span className="flex-1 truncate text-left">
              {t(option.labelKey, option.fallback)}
            </span>
            {sortBy === option.value && (
              <Check className="h-3.5 w-3.5 shrink-0 text-primary-500" />
            )}
          </button>
        ))}
        <div className="my-1 h-px bg-black/5 dark:bg-white/10" />
        {(["asc", "desc"] as const).map((order) => (
          <button
            key={order}
            type="button"
            role="menuitemradio"
            aria-checked={sortOrder === order}
            onClick={() => select(() => onSortOrderChange(order))}
            className={sortMenuItemClass}
          >
            <span className="flex-1 truncate text-left">
              {order === "asc"
                ? t("sidebar.sortAscending", "Ascending")
                : t("sidebar.sortDescending", "Descending")}
            </span>
            {sortOrder === order && (
              <Check className="h-3.5 w-3.5 shrink-0 text-primary-500" />
            )}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
};

/* ── Layout settings ────────────────────────────────────────────── */
import { LayoutSettings } from "../../stores/layoutStore";

interface DesktopAppLayoutProps {
  children: React.ReactNode;
  layoutSettings?: LayoutSettings;
  setLayoutSettings?: Dispatch<SetStateAction<LayoutSettings>>;
  bottomPaddingClassName?: string;
}

/* ── Main component ─────────────────────────────────────────────── */
export const DesktopAppLayout = ({
  children,
  layoutSettings,
  setLayoutSettings,
  bottomPaddingClassName,
}: DesktopAppLayoutProps) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const [isResizing, setIsResizing] = useState(false);
  const [libraryQuery, setLibraryQuery] = useState("");
  const [libraryScope, setLibraryScope] = useState<LibraryScope>("recent");
  const [librarySortBy, setLibrarySortBy] = useState<LibrarySortBy>("recent");
  const [librarySortOrder, setLibrarySortOrder] = useState<LibrarySortOrder>("desc");
  const sidebarRef = useRef<HTMLDivElement>(null);

  const {
    isSidebarOpen,
    sidebarWidth,
    setIsSidebarOpen,
    setSidebarWidth,
    addSourceFolder,
  } = useHistoryStore(
    useShallow((state) => ({
      isSidebarOpen: state.isSidebarOpen,
      sidebarWidth: state.sidebarWidth,
      setIsSidebarOpen: state.setIsSidebarOpen,
      setSidebarWidth: state.setSidebarWidth,
      addSourceFolder: state.addSourceFolder,
    }))
  );

  const { theme, setTheme } = useSettingsStore();

  /* ── Resize logic ──────────────────────────────────────────────── */
  const startResizing = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  }, []);

  const stopResizing = useCallback(() => setIsResizing(false), []);

  const resize = useCallback(
    (e: MouseEvent) => {
      if (isResizing) {
        const newWidth = e.clientX;
        if (newWidth >= MIN_SIDEBAR_WIDTH && newWidth <= MAX_SIDEBAR_WIDTH) {
          setSidebarWidth(newWidth);
        }
      }
    },
    [isResizing, setSidebarWidth]
  );

  useEffect(() => {
    window.addEventListener("mousemove", resize);
    window.addEventListener("mouseup", stopResizing);
    return () => {
      window.removeEventListener("mousemove", resize);
      window.removeEventListener("mouseup", stopResizing);
    };
  }, [resize, stopResizing]);

  /* ── Handlers ──────────────────────────────────────────────────── */
  const navigateToHome = () => {
    const { setCurrentFile, setCurrentYouTube } = usePlayerStore.getState();
    setCurrentFile(null);
    setCurrentYouTube(null);
    navigate("/");
  };

  const handleAddFolder = useCallback(async () => {
    const api = desktopApi;
    if (!api) return;
    const selected = await api.openFolder();
    if (!selected) return;
    await api.approvePath(selected);
    addSourceFolder(selected);
  }, [addSourceFolder]);

  const handleOpenSettings = useCallback(
    async (detail: SettingsOpenIntentDetail = {}) => {
      await desktopApi?.openSettingsWindow(detail.tab, detail.section);
    },
    []
  );

  const handleOpenGlossary = useCallback(() => {
    if (desktopApi?.openGlossaryWindow) {
      void desktopApi.openGlossaryWindow();
    } else {
      navigate("/glossary");
    }
  }, [navigate]);

  const toggleTheme = useCallback(
    () => setTheme(theme === "dark" ? "light" : "dark"),
    [theme, setTheme]
  );

  useEffect(() => {
    return onSettingsOpenIntent((detail) => {
      void handleOpenSettings(detail);
    });
  }, [handleOpenSettings]);

  useEffect(() => {
    if (!desktopApi?.onNavigate) return;
    return desktopApi.onNavigate(async ({ route, entryId }) => {
      if (!entryId) {
        navigate(route);
        return;
      }

      const transcriptStore = useTranscriptStore.getState();
      const entry = transcriptStore.glossaryEntries.find((e) => e.id === entryId);
      if (!entry) return;

      if (transcriptStore.playGlossaryEntryContext(entryId)) {
        navigate(route);
        return;
      }

      const historyStore = useHistoryStore.getState();
      const historyItem = historyStore.mediaHistory.find((h) => {
        if (h.type === "youtube" && h.youtubeData?.youtubeId) {
          return `youtube-${h.youtubeData.youtubeId}` === entry.mediaId;
        }
        if (h.type === "file") {
          return (h.storageId || `file-${h.name}-${h.fileData?.size}`) === entry.mediaId;
        }
        return false;
      });

      if (!historyItem) return;

      await historyStore.loadFromHistory(historyItem.id);

      if (transcriptStore.playGlossaryEntryContext(entryId)) {
        navigate(route);
      }
    });
  }, [navigate]);

  useEffect(() => {
    if (!desktopApi?.onGlossaryPlayback) return;
    return desktopApi.onGlossaryPlayback(async ({ entryId }) => {
      const transcriptStore = useTranscriptStore.getState();
      const entry = transcriptStore.glossaryEntries.find((item) => item.id === entryId);
      if (!entry) return;

      if (transcriptStore.playGlossaryEntryContext(entryId)) return;

      const historyStore = useHistoryStore.getState();
      const historyItem = historyStore.mediaHistory.find((item) => {
        if (item.type === "youtube" && item.youtubeData?.youtubeId) {
          return `youtube-${item.youtubeData.youtubeId}` === entry.mediaId;
        }
        if (item.type === "file") {
          return (item.storageId || `file-${item.name}-${item.fileData?.size}`) === entry.mediaId;
        }
        return false;
      });

      if (!historyItem) return;

      await historyStore.loadFromHistory(historyItem.id);
      transcriptStore.playGlossaryEntryContext(entryId);
    });
  }, []);

  useEffect(() => {
    import("../../utils/migrationBridge").then(({ runMigrationIfNeeded }) => {
      void runMigrationIfNeeded();
    });
  }, []);

  /* ── Sidebar toggle (title-bar/toolbar control, macOS convention) ── */
  const sidebarToggle = (
    <button
      onClick={() => setIsSidebarOpen(!isSidebarOpen)}
      className={headerIconButtonClass}
      aria-expanded={isSidebarOpen}
      title={
        isSidebarOpen
          ? t("layout.hideSidebar", "Hide Sidebar")
          : t("layout.showSidebar", "Show Sidebar")
      }
      aria-label={
        isSidebarOpen
          ? t("layout.hideSidebar", "Hide Sidebar")
          : t("layout.showSidebar", "Show Sidebar")
      }
    >
      {isSidebarOpen ? (
        <PanelLeftClose className="h-4 w-4" />
      ) : (
        <PanelLeftOpen className="h-4 w-4" />
      )}
    </button>
  );

  /* ── Sidebar (unified macOS-style source list) ─────────────────── */
  const navRowClass = "h-8 rounded-lg";

  const sidebar = (
    <aside
      ref={sidebarRef}
      style={{ width: isSidebarOpen ? sidebarWidth : 0 }}
      aria-label={t("sidebar.explorer", "Explorer")}
      className={`fixed left-0 top-0 bottom-0 border-r border-black/5 dark:border-white/5 bg-white/60 dark:bg-gray-950/60 backdrop-blur-3xl flex flex-col z-[60] shrink-0 ${
        !isSidebarOpen ? "border-none overflow-hidden" : ""
      } transition-[width] duration-300 ease-in-out`}
    >
      {isSidebarOpen && (
        <>
          {/* Title bar row: window drag area + traffic-light clearance,
              with the sidebar toggle at the trailing edge (Finder/Notes style) */}
          <div
            data-tauri-drag-region="deep"
            className="flex w-full shrink-0 items-center justify-end h-[52px] px-2 sm:h-[56px] select-none"
          >
            {sidebarToggle}
          </div>

          {/* ─── Primary navigation (labeled source-list rows) ───── */}
          <nav
            aria-label={t("sidebar.navigation", "Navigation")}
            className="shrink-0 space-y-0.5 px-2 pb-1"
          >
            <SidebarRow
              onClick={navigateToHome}
              isActive={location.pathname === "/"}
              aria-current={location.pathname === "/" ? "page" : undefined}
              icon={<Home className="h-4 w-4" />}
              primaryText={t("navigation.home", "Home")}
              primaryTextClassName="text-[13px]"
              className={navRowClass}
            />
            <SidebarRow
              onClick={handleOpenGlossary}
              icon={<BookOpen className="h-4 w-4" />}
              primaryText={t("glossary.title", "Glossary")}
              primaryTextClassName="text-[13px]"
              className={navRowClass}
            />
          </nav>

          {/* ─── Library section ─────────────────────────────────── */}
          <div className="mt-2 flex h-7 shrink-0 select-none items-center justify-between pl-4 pr-2">
            <span className="truncate text-[10px] font-bold uppercase tracking-[0.1em] text-gray-500/70 dark:text-gray-300/60">
              {t("sidebar.library", "LIBRARY")}
            </span>
            <LibrarySortMenu
              sortBy={librarySortBy}
              sortOrder={librarySortOrder}
              onSortByChange={setLibrarySortBy}
              onSortOrderChange={setLibrarySortOrder}
            />
          </div>
          <div className="flex-1 min-h-0 flex flex-col">
              <div className="px-2 pb-1.5 space-y-1.5 shrink-0">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
                  <input
                    value={libraryQuery}
                    onChange={(event) => setLibraryQuery(event.target.value)}
                    placeholder={t("sidebar.searchPlaceholder", "Search files")}
                    aria-label={t("sidebar.searchPlaceholder", "Search files")}
                    className="h-7 w-full rounded-md border border-transparent bg-black/[0.04] pl-8 pr-7 text-xs text-gray-800 outline-none transition-colors placeholder:text-gray-400 focus:border-primary-400/50 focus:bg-white focus:ring-2 focus:ring-primary-500/15 dark:bg-white/[0.05] dark:text-gray-100 dark:focus:border-primary-400/40 dark:focus:bg-gray-900"
                  />
                  {libraryQuery && (
                    <button
                      type="button"
                      onClick={() => setLibraryQuery("")}
                      title={t("sidebar.clearSearch", "Clear search")}
                      aria-label={t("sidebar.clearSearch", "Clear search")}
                      className="absolute right-1 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded text-gray-400 hover:bg-black/5 hover:text-gray-700 focus:outline-none focus-visible:ring-1 focus-visible:ring-primary-500 dark:hover:bg-white/5 dark:hover:text-gray-200"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>

                <div
                  className="grid grid-cols-2 rounded-md bg-black/[0.04] p-0.5 dark:bg-white/[0.05]"
                  role="tablist"
                  aria-label={t("sidebar.scopeLabel", "Library scope")}
                >
                  {(["recent", "folders"] as const).map((scope) => (
                    <button
                      key={scope}
                      type="button"
                      onClick={() => setLibraryScope(scope)}
                      aria-selected={libraryScope === scope}
                      className={`h-6 rounded-[5px] text-[11px] font-medium transition-all focus:outline-none focus-visible:ring-1 focus-visible:ring-primary-500 ${
                        libraryScope === scope
                          ? "bg-white text-gray-900 shadow-sm dark:bg-gray-800 dark:text-gray-100"
                          : "text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-100"
                      }`}
                    >
                      {scope === "recent"
                        ? t("sidebar.scopeRecent", "Recent")
                        : t("sidebar.scopeFolders", "Folders")}
                    </button>
                  ))}
                </div>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain custom-scrollbar">
                <FolderBrowser
                  onAddFolder={handleAddFolder}
                  query={libraryQuery}
                  scope={libraryScope}
                  sortBy={librarySortBy}
                  sortOrder={librarySortOrder}
                />
              </div>
            </div>

          {/* ─── Footer utilities (settings / theme / shortcuts) ─── */}
          <div className="flex shrink-0 items-center gap-0.5 border-t border-black/5 px-2 py-1.5 dark:border-white/5">
            <button
              onClick={() => void handleOpenSettings()}
              className={headerIconButtonClass}
              title={t("layout.openSettings", "Open Settings")}
              aria-label={t("layout.openSettings", "Open Settings")}
            >
              <Settings className="h-4 w-4" />
            </button>
            <button
              onClick={toggleTheme}
              className={headerIconButtonClass}
              title={
                theme === "dark"
                  ? t("layout.switchToLightTheme", "Light Theme")
                  : t("layout.switchToDarkTheme", "Dark Theme")
              }
              aria-label={
                theme === "dark"
                  ? t("layout.switchToLightTheme", "Light Theme")
                  : t("layout.switchToDarkTheme", "Dark Theme")
              }
            >
              {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
            <KeyboardShortcutsDialog triggerClassName={headerIconButtonClass} />
          </div>

          {/* ─── Resize handle ───────────────────────────────────── */}
          <div
            onMouseDown={startResizing}
            className={`absolute top-0 right-0 w-[1px] h-full cursor-col-resize hover:bg-black/10 dark:hover:bg-white/10 transition-colors z-[70] ${
              isResizing ? "bg-black/20 dark:bg-white/20 w-1" : ""
            }`}
          />
        </>
      )}

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: transparent;
          border-radius: 10px;
          transition: background 0.3s ease;
        }
        .custom-scrollbar.is-scrolling::-webkit-scrollbar-thumb,
        .custom-scrollbar:hover::-webkit-scrollbar-thumb {
          background: rgba(156,163,175,0.5);
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(156,163,175,0.7);
        }
      `}</style>
    </aside>
  );

  const contentLeft = isSidebarOpen ? sidebarWidth : 0;

  return (
    <AppLayoutBase
      layoutSettings={layoutSettings}
      setLayoutSettings={setLayoutSettings}
      bottomPaddingClassName={bottomPaddingClassName}
      sidebar={sidebar}
      contentPaddingLeft={contentLeft}
      headerOffsetLeft={contentLeft}
      // When the sidebar is collapsed, its toggle and utility actions move to
      // the header so every control stays reachable (macOS toolbar behavior).
      headerLeadingSlot={!isSidebarOpen ? sidebarToggle : undefined}
      desktopMode={true}
      hideThemeToggle={isSidebarOpen}
      hideSettings={isSidebarOpen}
      hideGlossary={isSidebarOpen}
      hideHelp={isSidebarOpen}
      onOpenSettings={() => void handleOpenSettings()}
      onOpenGlossary={handleOpenGlossary}
    >
      {children}
    </AppLayoutBase>
  );
};
