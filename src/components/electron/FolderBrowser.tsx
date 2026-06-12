import { useState, useCallback, useEffect, useMemo, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { usePlayerStore } from "../../stores/playerStore";
import { nativePathToUrl } from "../../utils/platform";
import { formatRelativeTime } from "../../utils/relativeTime";
import { cn } from "../../utils/cn";
import type { FolderTreeNode } from "../../types/electron";
import {
  getShowInFileManagerLabel,
  revealInFileManager,
} from "./fileManager";
import {
  buildLibraryItems,
  filterLibraryItems,
  filterFolderTree,
  getMediaKindFromName,
  getPathBaseName,
  sortLibraryItems,
  sortFolderTree,
  type LibraryItem,
  type LibraryMediaKind,
  type LibraryScope,
  type LibrarySortBy,
  type LibrarySortOrder,
} from "./librarySidebar";
import {
  ChevronDown,
  ChevronRight,
  Folder,
  FolderOpen,
  FolderPlus,
  Music,
  FileVideo,
  X,
  Loader2,
  RefreshCw,
  SquareArrowOutUpRight,
  Youtube,
} from "lucide-react";
import { SidebarRow } from "../ui/SidebarRow";
import { SidebarRowAction } from "../ui/SidebarRowAction";

const VIDEO_EXTS = new Set(["mp4", "mkv", "avi", "mov", "webm", "m4v"]);

const getMimeType = (name: string): string => {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  return VIDEO_EXTS.has(ext) ? `video/${ext}` : `audio/${ext}`;
};

interface SourceTreeState {
  tree: FolderTreeNode[];
  loading: boolean;
}

/** Left accent bar applied to the active row (calm, pill-shaped indicator). */
const ACTIVE_ROW =
  "relative before:absolute before:left-0 before:top-1/2 before:h-5 before:w-[3px] before:-translate-y-1/2 before:rounded-full before:bg-primary-500 before:content-['']";

/** Calm two-line secondary styling: sans, muted, full opacity. */
const SUBTITLE_CLASS =
  "font-sans not-italic text-[10px] leading-tight opacity-100 text-gray-400 dark:text-gray-500";

/** Soft, type-tinted media icon tile used in the curated (All/Recent) list. */
const MediaTile = ({ kind }: { kind: LibraryMediaKind }) => {
  const styles: Record<LibraryMediaKind, string> = {
    audio: "bg-primary-500/10 text-primary-600 dark:text-primary-400",
    video: "bg-accent-500/10 text-accent-600 dark:text-accent-400",
    youtube: "bg-error-500/10 text-error-600 dark:text-error-500",
  };
  const Icon = kind === "youtube" ? Youtube : kind === "video" ? FileVideo : Music;
  return (
    <span className={cn("flex h-6 w-6 items-center justify-center rounded-md", styles[kind])}>
      <Icon className="h-3.5 w-3.5" />
    </span>
  );
};

/** Placeholder row shown while a source folder loads for the first time. */
const SkeletonRow = () => (
  <div className="flex items-center gap-2 px-3 py-1.5">
    <span className="h-6 w-6 shrink-0 rounded-md bg-black/5 dark:bg-white/5 animate-pulse" />
    <div className="flex-1 space-y-1.5">
      <span className="block h-2.5 w-3/4 rounded bg-black/5 dark:bg-white/5 animate-pulse" />
      <span className="block h-2 w-2/5 rounded bg-black/5 dark:bg-white/5 animate-pulse" />
    </div>
  </div>
);

/** Calm, uppercase section label with an optional count badge. */
const SectionLabel = ({ label, count }: { label: string; count?: number }) => (
  <div className="flex items-center gap-1.5 px-3 pb-1 pt-2">
    <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
      {label}
    </span>
    {typeof count === "number" && count > 0 && (
      <span className="text-[10px] font-medium tabular-nums text-gray-300 dark:text-gray-600">
        {count}
      </span>
    )}
  </div>
);

/* ── Exported component ─────────────────────────────────────────── */
interface FolderBrowserProps {
  /** Called by parent section header to add a folder */
  onAddFolder?: () => void;
  query?: string;
  scope?: LibraryScope;
  sortBy?: LibrarySortBy;
  sortOrder?: LibrarySortOrder;
}

export const FolderBrowser = ({
  onAddFolder: _onAddFolder,
  query = "",
  scope = "all",
  sortBy = "recent",
  sortOrder = "desc",
}: FolderBrowserProps) => {
  const { t, i18n } = useTranslation();
  const {
    setCurrentFile,
    sourceFolders,
    addSourceFolder,
    removeSourceFolder,
    currentFile,
    currentYouTube,
    mediaHistory,
    loadFromHistory,
    removeFromHistory,
  } = usePlayerStore();
  const [sourceTrees, setSourceTrees] = useState<Record<string, SourceTreeState>>({});
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());
  const showInFileManagerLabel = getShowInFileManagerLabel(t);

  const buildSubtitle = useCallback(
    (folderLabel: string, accessedAt: number): string => {
      const time = accessedAt > 0 ? formatRelativeTime(accessedAt, i18n.language) : "";
      if (folderLabel && time) return `${folderLabel} · ${time}`;
      return folderLabel || time;
    },
    [i18n.language]
  );

  const handleAddFolder = useCallback(async () => {
    const selected = await window.electronAPI!.openFolder();
    if (!selected) return;
    addSourceFolder(selected);
  }, [addSourceFolder]);

  // Use prop if given, else local handler
  const addFolder = _onAddFolder ?? handleAddFolder;

  const loadTree = useCallback(async (folderPath: string) => {
    setSourceTrees((state) => ({
      ...state,
      [folderPath]: {
        tree: state[folderPath]?.tree ?? [],
        loading: true,
      },
    }));

    try {
      const tree = await window.electronAPI!.listMediaTree(folderPath);
      setSourceTrees((state) => ({
        ...state,
        [folderPath]: { tree, loading: false },
      }));
    } catch (err) {
      console.error("Failed to list media tree:", err);
      setSourceTrees((state) => ({
        ...state,
        [folderPath]: { tree: [], loading: false },
      }));
    }
  }, []);

  useEffect(() => {
    const sourceFolderSet = new Set(sourceFolders);

    setSourceTrees((state) =>
      Object.fromEntries(
        Object.entries(state).filter(([folderPath]) => sourceFolderSet.has(folderPath))
      )
    );

    sourceFolders.forEach((folderPath) => {
      void loadTree(folderPath);
    });
  }, [loadTree, sourceFolders]);

  useEffect(() => {
    setExpandedPaths((current) => {
      const next = new Set(
        [...current].filter((path) =>
          sourceFolders.some((sourcePath) => path === sourcePath || path.startsWith(sourcePath))
        )
      );

      if (scope === "folders") {
        sourceFolders.forEach((folderPath) => next.add(folderPath));
      }

      return next;
    });
  }, [scope, sourceFolders]);

  useEffect(() => {
    const disposers = sourceFolders
      .map((folderPath) =>
        window.electronAPI?.watchMediaTree(folderPath, () => {
          void loadTree(folderPath);
        })
      )
      .filter((dispose): dispose is () => void => Boolean(dispose));

    return () => {
      disposers.forEach((dispose) => dispose());
    };
  }, [loadTree, sourceFolders]);

  const handleFileClick = useCallback(
    (node: FolderTreeNode | LibraryItem) => {
      if (!node.path) return;

      setCurrentFile({
        name: node.name,
        type: getMimeType(node.name),
        size: 0,
        url: nativePathToUrl(node.path),
        nativePath: node.path,
      });
    },
    [setCurrentFile]
  );

  const activeFilePath = currentFile?.nativePath ?? null;
  const activeYouTubeId = currentYouTube?.id ?? null;
  const hasFolders = sourceFolders.length > 0;
  const isLoading = sourceFolders.some((folderPath) => sourceTrees[folderPath]?.loading);

  const libraryItems = useMemo(() => {
    const sourceTreeEntries = sourceFolders.map((sourcePath) => ({
      sourcePath,
      tree: sourceTrees[sourcePath]?.tree ?? [],
    }));

    return sortLibraryItems(
      filterLibraryItems(
        buildLibraryItems({
          sourceTrees: sourceTreeEntries,
          history: mediaHistory,
        }),
        { query, scope }
      ),
      { sortBy, sortOrder }
    );
  }, [mediaHistory, query, scope, sortBy, sortOrder, sourceFolders, sourceTrees]);

  const folderTrees = useMemo(
    () =>
      sourceFolders.map((sourcePath) => ({
        sourcePath,
        tree: sortFolderTree(
          filterFolderTree(sourceTrees[sourcePath]?.tree ?? [], query),
          { sortBy, sortOrder }
        ),
      })),
    [query, sortBy, sortOrder, sourceFolders, sourceTrees]
  );

  const sourceFoldersVisible = scope === "all" && !query.trim();
  const isFolderTreeVisible = scope === "folders";
  const hasFolderTreeItems = query.trim()
    ? folderTrees.some(({ tree }) => tree.length > 0)
    : folderTrees.length > 0;
  const forceExpandedBySearch = Boolean(query.trim());

  const toggleExpanded = (path: string) => {
    setExpandedPaths((current) => {
      const next = new Set(current);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  };

  if (!hasFolders && mediaHistory.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
        <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-accent-500/10 text-accent-500 dark:text-accent-400">
          <FolderOpen className="h-6 w-6" />
        </span>
        <p className="mb-4 text-xs leading-relaxed text-gray-400 dark:text-gray-500">
          {t("sidebar.noFolders", "No folders added yet.")}
        </p>
        <button
          onClick={addFolder}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary-500/10 px-3 py-1.5 text-xs font-medium text-primary-600 transition-colors hover:bg-primary-500/15 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 dark:text-primary-400"
        >
          <FolderPlus className="h-3.5 w-3.5" />
          {t("sidebar.addFolder", "Add folder")}
        </button>
      </div>
    );
  }

  const renderLibraryItem = (item: LibraryItem) => {
    const nativePath = item.path;
    const isActive =
      item.kind === "recent" && item.historyItem?.type === "youtube"
        ? item.historyItem.youtubeData?.youtubeId === activeYouTubeId
        : !!nativePath && nativePath === activeFilePath;
    const subtitle = buildSubtitle(item.sourceLabel, item.accessedAt);

    return (
      <li key={item.id} className="px-1.5">
        <SidebarRow
          onClick={() => {
            if (item.kind === "recent" && item.historyItem) {
              loadFromHistory(item.historyItem.id);
              return;
            }
            handleFileClick(item);
          }}
          isActive={isActive}
          title={nativePath ?? item.name}
          icon={<MediaTile kind={item.mediaKind} />}
          iconClassName="w-6 h-6"
          primaryText={item.name}
          secondaryText={subtitle || undefined}
          className={cn("h-auto rounded-lg py-1.5", isActive && ACTIVE_ROW)}
          primaryTextClassName={cn("text-xs", isActive ? "font-semibold" : "font-medium")}
          secondaryTextClassName={SUBTITLE_CLASS}
          actions={
            <>
              {nativePath && (
                <SidebarRowAction
                  icon={<SquareArrowOutUpRight />}
                  onClick={() => void revealInFileManager(nativePath)}
                  title={showInFileManagerLabel}
                  className="hidden group-hover:flex group-focus-within:flex"
                />
              )}
              {item.kind === "recent" && item.historyItem && (
                <SidebarRowAction
                  variant="error"
                  icon={<X />}
                  onClick={() => removeFromHistory(item.historyItem!.id)}
                  title={t("sidebar.removeItem", "Remove")}
                  className="hidden group-hover:flex group-focus-within:flex"
                />
              )}
            </>
          }
        />
      </li>
    );
  };

  const renderFolderTreeNode = (node: FolderTreeNode, depth: number): ReactNode => {
    const isDirectory = node.type === "directory";
    const isExpanded = forceExpandedBySearch || expandedPaths.has(node.path);
    const hasChildren = Boolean(node.children?.length);
    const isActive = node.type === "file" && node.path === activeFilePath;
    const mediaKind = getMediaKindFromName(node.name);

    return (
      <li key={node.path} className="px-1.5">
        <SidebarRow
          onClick={() => {
            if (isDirectory) {
              toggleExpanded(node.path);
              return;
            }

            handleFileClick(node);
          }}
          isActive={isActive}
          depth={depth}
          title={node.path}
          icon={
            isDirectory ? (
              <div className="flex items-center gap-0.5">
                {hasChildren ? (
                  isExpanded ? (
                    <ChevronDown className="w-3 h-3 text-gray-400 dark:text-gray-500" />
                  ) : (
                    <ChevronRight className="w-3 h-3 text-gray-400 dark:text-gray-500" />
                  )
                ) : (
                  <span className="w-3" />
                )}
                {isExpanded ? (
                  <FolderOpen className="w-3.5 h-3.5 text-accent-500 dark:text-accent-400" />
                ) : (
                  <Folder className="w-3.5 h-3.5 text-accent-500 dark:text-accent-400" />
                )}
              </div>
            ) : mediaKind === "video" ? (
              <FileVideo className="w-3.5 h-3.5 text-accent-400 dark:text-accent-500" />
            ) : (
              <Music className="w-3.5 h-3.5 text-primary-400 dark:text-primary-500" />
            )
          }
          primaryText={node.name}
          className={cn("rounded-lg", isActive && ACTIVE_ROW)}
          actions={
            <SidebarRowAction
              icon={<SquareArrowOutUpRight />}
              onClick={() => void revealInFileManager(node.path)}
              title={showInFileManagerLabel}
              className="hidden group-hover:flex group-focus-within:flex"
            />
          }
        />
        {isDirectory && hasChildren && isExpanded && (
          <ul>{node.children!.map((child) => renderFolderTreeNode(child, depth + 1))}</ul>
        )}
      </li>
    );
  };

  const renderSourceTree = (sourcePath: string, tree: FolderTreeNode[]) => {
    const loading = sourceTrees[sourcePath]?.loading ?? true;
    const isExpanded = forceExpandedBySearch || expandedPaths.has(sourcePath);

    return (
      <li key={sourcePath} className="px-1.5">
        <SidebarRow
          onClick={() => toggleExpanded(sourcePath)}
          title={sourcePath}
          icon={
            <div className="flex items-center gap-0.5">
              {isExpanded ? (
                <ChevronDown className="w-3 h-3 text-gray-400 dark:text-gray-500" />
              ) : (
                <ChevronRight className="w-3 h-3 text-gray-400 dark:text-gray-500" />
              )}
              {isExpanded ? (
                <FolderOpen className="w-3.5 h-3.5 text-accent-500 dark:text-accent-400" />
              ) : (
                <Folder className="w-3.5 h-3.5 text-accent-500 dark:text-accent-400" />
              )}
            </div>
          }
          primaryText={getPathBaseName(sourcePath)}
          secondaryText={sourcePath}
          className="h-auto rounded-lg py-1.5"
          contentClassName="text-gray-800 dark:text-gray-100"
          primaryTextClassName="font-semibold"
          secondaryTextClassName={SUBTITLE_CLASS}
          actions={
            <>
              {loading && <Loader2 className="w-3 h-3 text-gray-400 animate-spin mr-1" />}
              <SidebarRowAction
                icon={<RefreshCw />}
                onClick={() => void loadTree(sourcePath)}
                title={t("folderBrowser.refreshFolder", "Refresh folder")}
                disabled={loading}
              />
              <SidebarRowAction
                icon={<SquareArrowOutUpRight />}
                onClick={() => void revealInFileManager(sourcePath)}
                title={showInFileManagerLabel}
              />
              <SidebarRowAction
                variant="error"
                icon={<X />}
                onClick={() => removeSourceFolder(sourcePath)}
                title={t("folderBrowser.removeFolder", "Remove folder")}
              />
            </>
          }
        />
        {isExpanded && tree.length > 0 && (
          <ul>{tree.map((node) => renderFolderTreeNode(node, 1))}</ul>
        )}
      </li>
    );
  };

  const initialLoading =
    isLoading && (isFolderTreeVisible ? !hasFolderTreeItems : libraryItems.length === 0);

  const emptyMessage = (
    <p className="px-3 py-6 text-center text-xs text-gray-400 dark:text-gray-500">
      {query.trim()
        ? t("sidebar.noSearchResults", "No matching files.")
        : t("folderBrowser.noFiles", "No media files found.")}
    </p>
  );

  return (
    <div className="py-1" aria-label={t("folderBrowser.title", "Source Folders")}>
      {sourceFoldersVisible && hasFolders && (
        <div className="mb-1.5">
          <SectionLabel label={t("sidebar.sources", "Sources")} count={sourceFolders.length} />
          <ul>
            {sourceFolders.map((folderPath) => {
              const loading = sourceTrees[folderPath]?.loading ?? true;
              return (
                <li key={folderPath} className="px-1.5">
                  <SidebarRow
                    onClick={() => void revealInFileManager(folderPath)}
                    title={folderPath}
                    icon={
                      <span className="flex h-6 w-6 items-center justify-center rounded-md bg-accent-500/10 text-accent-600 dark:text-accent-400">
                        <Folder className="h-3.5 w-3.5" />
                      </span>
                    }
                    iconClassName="w-6 h-6"
                    primaryText={getPathBaseName(folderPath)}
                    secondaryText={folderPath}
                    className="h-auto rounded-lg py-1.5"
                    contentClassName="text-gray-800 dark:text-gray-100"
                    primaryTextClassName="text-xs font-medium"
                    secondaryTextClassName={SUBTITLE_CLASS}
                    actions={
                      <>
                        {loading && <Loader2 className="w-3 h-3 text-gray-400 animate-spin mr-1" />}
                        <SidebarRowAction
                          icon={<RefreshCw />}
                          onClick={() => void loadTree(folderPath)}
                          title={t("folderBrowser.refreshFolder", "Refresh folder")}
                          disabled={loading}
                        />
                        <SidebarRowAction
                          icon={<SquareArrowOutUpRight />}
                          onClick={() => void revealInFileManager(folderPath)}
                          title={showInFileManagerLabel}
                        />
                        <SidebarRowAction
                          variant="error"
                          icon={<X />}
                          onClick={() => removeSourceFolder(folderPath)}
                          title={t("folderBrowser.removeFolder", "Remove folder")}
                        />
                      </>
                    }
                  />
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* The scope tab already names the list; only label search results
          or the Files block when it sits below the Sources section. */}
      {query.trim() ? (
        <SectionLabel
          label={t("sidebar.searchResults", "Results")}
          count={isFolderTreeVisible ? undefined : libraryItems.length}
        />
      ) : (
        scope === "all" && (
          <SectionLabel
            label={t("sidebar.libraryItems", "Files")}
            count={libraryItems.length}
          />
        )
      )}

      {isFolderTreeVisible && (
        <div className="px-1.5 pb-1.5 pt-1">
          <button
            type="button"
            onClick={addFolder}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-black/15 px-3 py-2 text-xs font-medium text-gray-500 transition-colors hover:border-primary-400/60 hover:bg-primary-500/[0.06] hover:text-primary-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/30 dark:border-white/15 dark:text-gray-400 dark:hover:border-primary-400/50 dark:hover:text-primary-400"
          >
            <FolderPlus className="h-4 w-4" />
            {t("sidebar.addFolder", "Add folder")}
          </button>
        </div>
      )}

      {initialLoading ? (
        <div aria-label={t("folderBrowser.loading", "Loading...")}>
          {Array.from({ length: 5 }).map((_, index) => (
            <SkeletonRow key={index} />
          ))}
        </div>
      ) : isFolderTreeVisible ? (
        hasFolderTreeItems ? (
          <ul>{folderTrees.map(({ sourcePath, tree }) => renderSourceTree(sourcePath, tree))}</ul>
        ) : (
          emptyMessage
        )
      ) : libraryItems.length === 0 ? (
        emptyMessage
      ) : (
        <ul>{libraryItems.map(renderLibraryItem)}</ul>
      )}
    </div>
  );
};
