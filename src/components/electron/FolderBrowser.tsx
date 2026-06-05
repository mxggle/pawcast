import { useState, useCallback, useEffect, useMemo, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { usePlayerStore, type MediaHistoryItem } from "../../stores/playerStore";
import { nativePathToUrl } from "../../utils/platform";
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
  type LibraryScope,
  type LibrarySortBy,
  type LibrarySortOrder,
} from "./librarySidebar";
import {
  ChevronDown,
  ChevronRight,
  Folder,
  FolderOpen,
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

const getHistorySubtext = (item: MediaHistoryItem): string => {
  if (item.type === "youtube") {
    return item.youtubeData?.youtubeId
      ? `youtube.com/watch?v=${item.youtubeData.youtubeId}`
      : "YouTube";
  }

  return item.nativePath ?? item.fileData?.nativePath ?? item.name;
};

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
  const { t } = useTranslation();
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
      <div className="flex flex-col items-center justify-center py-6 px-4 text-center">
        <Folder className="w-8 h-8 text-gray-300 dark:text-gray-600 mb-2" />
        <p className="text-xs text-gray-400 dark:text-gray-500 mb-3">
          {t("sidebar.noFolders", "No folders added yet.")}
        </p>
        <button
          onClick={addFolder}
          className="text-xs font-medium text-primary-600 dark:text-primary-400 hover:underline focus:outline-none focus-visible:ring-1 focus-visible:ring-primary-500 rounded px-1"
        >
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

    return (
      <li key={item.id} className="mb-0.5 last:mb-0">
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
          icon={
            item.mediaKind === "youtube" ? (
              <Youtube className="w-3.5 h-3.5 text-error-400 dark:text-error-500" />
            ) : item.mediaKind === "video" ? (
              <FileVideo className="w-3.5 h-3.5 text-accent-400 dark:text-accent-500" />
            ) : (
              <Music className="w-3.5 h-3.5 text-primary-400 dark:text-primary-500" />
            )
          }
          primaryText={item.name}
          secondaryText={
            item.historyItem ? getHistorySubtext(item.historyItem) : item.path ?? item.sourceLabel
          }
          className="h-auto py-1.5"
          actions={
            <>
              <span className="text-[10px] text-gray-400 dark:text-gray-500 tabular-nums group-hover:hidden group-focus-within:hidden mr-1">
                {item.kind === "recent"
                  ? t("sidebar.sourceRecent", "Recent")
                  : item.sourceLabel}
              </span>
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
      <li key={node.path} className="mb-0.5 last:mb-0">
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
          secondaryText={isDirectory ? node.path : undefined}
          className={isDirectory ? "h-auto py-1.5" : undefined}
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
      <li key={sourcePath} className="mb-1 last:mb-0">
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
          className="h-auto py-1.5"
          contentClassName="text-gray-800 dark:text-gray-100"
          primaryTextClassName="font-semibold"
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

  return (
    <div className="py-1" aria-label={t("folderBrowser.title", "Source Folders")}>
      {sourceFoldersVisible && hasFolders && (
        <div className="mb-2">
          <div className="px-3 py-1 text-[10px] font-semibold uppercase text-gray-400 dark:text-gray-500">
            {t("sidebar.sources", "Sources")}
          </div>
          {sourceFolders.map((folderPath) => {
            const loading = sourceTrees[folderPath]?.loading ?? true;
            return (
              <SidebarRow
                key={folderPath}
                onClick={() => void revealInFileManager(folderPath)}
                title={folderPath}
                icon={<Folder className="w-4 h-4 text-accent-500 dark:text-accent-400" />}
                primaryText={getPathBaseName(folderPath)}
                secondaryText={folderPath}
                className="h-auto py-1.5"
                contentClassName="text-gray-800 dark:text-gray-100"
                primaryTextClassName="font-semibold"
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
            );
          })}
        </div>
      )}

      {isLoading && (
        <div className="flex items-center gap-2 px-3 h-[28px]">
          <Loader2 className="w-3 h-3 text-gray-400 animate-spin" />
          <span className="text-xs text-gray-400">{t("folderBrowser.loading", "Loading...")}</span>
        </div>
      )}

      <div className="px-3 py-1 text-[10px] font-semibold uppercase text-gray-400 dark:text-gray-500">
        {scope === "folders"
          ? t("sidebar.scopeFolders", "Folders")
          : scope === "recent"
          ? t("sidebar.recent", "Recent")
          : t("sidebar.libraryItems", "Files")}
      </div>

      {isFolderTreeVisible ? (
        hasFolderTreeItems ? (
          <ul>{folderTrees.map(({ sourcePath, tree }) => renderSourceTree(sourcePath, tree))}</ul>
        ) : (
          <p className="px-3 py-3 text-xs text-gray-400 dark:text-gray-500">
            {query.trim()
              ? t("sidebar.noSearchResults", "No matching files.")
              : t("folderBrowser.noFiles", "No media files found.")}
          </p>
        )
      ) : libraryItems.length === 0 ? (
        <p className="px-3 py-3 text-xs text-gray-400 dark:text-gray-500">
          {query.trim()
            ? t("sidebar.noSearchResults", "No matching files.")
            : t("folderBrowser.noFiles", "No media files found.")}
        </p>
      ) : (
        <ul>{libraryItems.map(renderLibraryItem)}</ul>
      )}
    </div>
  );
};
