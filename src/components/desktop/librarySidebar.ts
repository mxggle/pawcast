import type { MediaHistoryItem } from "../../stores/historyStore";
import type { FolderTreeNode } from "../../types/desktop";

export type LibraryScope = "all" | "folders" | "recent";
export type LibrarySortBy = "recent" | "name" | "type" | "source";
export type LibrarySortOrder = "asc" | "desc";
export type LibraryItemKind = "folder-file" | "recent";
export type LibraryMediaKind = "audio" | "video" | "youtube";

const VIDEO_EXTS = new Set(["mp4", "mkv", "avi", "mov", "webm", "m4v"]);

export interface SourceTree {
  sourcePath: string;
  tree: FolderTreeNode[];
}

export interface LibraryItem {
  id: string;
  kind: LibraryItemKind;
  name: string;
  path?: string;
  sourcePath?: string;
  sourceLabel: string;
  mediaKind: LibraryMediaKind;
  accessedAt: number;
  historyItem?: MediaHistoryItem;
  treeNode?: FolderTreeNode;
}

export interface BuildLibraryItemsInput {
  sourceTrees: SourceTree[];
  history: MediaHistoryItem[];
}

export interface FilterLibraryItemsOptions {
  query: string;
  scope: LibraryScope;
}

export interface SortLibraryItemsOptions {
  sortBy: LibrarySortBy;
  sortOrder: LibrarySortOrder;
}

export const getPathBaseName = (path: string): string => {
  return path.split(/[\\/]/).filter(Boolean).pop() ?? path;
};

export const getParentPath = (path: string): string => {
  const parts = path.split(/[\\/]/).filter(Boolean);
  return parts.length > 1 ? parts.slice(0, -1).join("/") : path;
};

export const getMediaKindFromName = (name: string): LibraryMediaKind => {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  return VIDEO_EXTS.has(ext) ? "video" : "audio";
};

const normalize = (value: string): string => value.trim().toLowerCase();

const compareStrings = (a: string, b: string): number =>
  a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });

const compareFolderTreeNodes = (
  a: FolderTreeNode,
  b: FolderTreeNode,
  { sortBy, sortOrder }: SortLibraryItemsOptions
): number => {
  const direction = sortBy === "recent" || sortOrder === "asc" ? 1 : -1;
  const aIsDirectory = a.type === "directory";
  const bIsDirectory = b.type === "directory";

  if (aIsDirectory !== bIsDirectory) {
    return aIsDirectory ? -1 : 1;
  }

  if (sortBy === "type") {
    const typeResult = compareStrings(a.type, b.type);
    if (typeResult) return typeResult * direction;
  }

  return compareStrings(a.name, b.name) * direction;
};

export const sortFolderTree = (
  tree: FolderTreeNode[],
  options: SortLibraryItemsOptions
): FolderTreeNode[] =>
  [...tree]
    .sort((a, b) => compareFolderTreeNodes(a, b, options))
    .map((node) =>
      node.type === "directory" && node.children
        ? { ...node, children: sortFolderTree(node.children, options) }
        : node
    );

export const filterFolderTree = (
  tree: FolderTreeNode[],
  query: string
): FolderTreeNode[] => {
  const normalizedQuery = normalize(query);
  if (!normalizedQuery) return tree;

  return tree.flatMap((node) => {
    const matchesNode = [node.name, node.path]
      .filter(Boolean)
      .some((value) => normalize(value).includes(normalizedQuery));

    if (node.type === "file") {
      return matchesNode ? [node] : [];
    }

    const filteredChildren = node.children
      ? filterFolderTree(node.children, query)
      : [];

    if (!matchesNode && filteredChildren.length === 0) {
      return [];
    }

    return [
      {
        ...node,
        children: matchesNode ? node.children : filteredChildren,
      },
    ];
  });
};

export const flattenFolderTree = (
  tree: FolderTreeNode[],
  sourcePath: string
): LibraryItem[] => {
  const sourceLabel = getPathBaseName(sourcePath);
  const items: LibraryItem[] = [];

  const visit = (nodes: FolderTreeNode[]) => {
    nodes.forEach((node) => {
      if (node.type === "file") {
        items.push({
          id: `folder-file:${node.path}`,
          kind: "folder-file",
          name: node.name,
          path: node.path,
          sourcePath,
          sourceLabel,
          mediaKind: getMediaKindFromName(node.name),
          accessedAt: 0,
          treeNode: node,
        });
        return;
      }

      if (node.children?.length) {
        visit(node.children);
      }
    });
  };

  visit(tree);
  return items;
};

export const buildLibraryItems = ({
  sourceTrees,
  history,
}: BuildLibraryItemsInput): LibraryItem[] => {
  const folderItems = sourceTrees.flatMap(({ sourcePath, tree }) =>
    flattenFolderTree(tree, sourcePath)
  );

  const recentItems = history.map((item) => {
    const nativePath = item.nativePath ?? item.fileData?.nativePath;
    const mediaKind: LibraryMediaKind =
      item.type === "youtube" ? "youtube" : getMediaKindFromName(item.name);

    const sourcePath = nativePath ? getParentPath(nativePath) : undefined;

    return {
      id: `recent:${item.id}`,
      kind: "recent" as const,
      name: item.name,
      path: nativePath,
      sourcePath,
      sourceLabel: item.type === "youtube" ? "YouTube" : getPathBaseName(sourcePath ?? item.name),
      mediaKind,
      accessedAt: item.accessedAt,
      historyItem: item,
    };
  });

  return [...folderItems, ...recentItems];
};

export const filterLibraryItems = (
  items: LibraryItem[],
  { query, scope }: FilterLibraryItemsOptions
): LibraryItem[] => {
  const normalizedQuery = normalize(query);

  return items.filter((item) => {
    if (scope === "folders" && item.kind !== "folder-file") return false;
    if (scope === "recent" && item.kind !== "recent") return false;
    if (!normalizedQuery) return true;

    return [item.name, item.path, item.sourcePath, item.sourceLabel]
      .filter(Boolean)
      .some((value) => normalize(value ?? "").includes(normalizedQuery));
  });
};

export const sortLibraryItems = (
  items: LibraryItem[],
  { sortBy, sortOrder }: SortLibraryItemsOptions
): LibraryItem[] => {
  const direction = sortOrder === "asc" ? 1 : -1;

  return [...items].sort((a, b) => {
    let result = 0;

    if (sortBy === "recent") {
      result = a.accessedAt - b.accessedAt;
    } else if (sortBy === "name") {
      result = compareStrings(a.name, b.name);
    } else if (sortBy === "type") {
      result = compareStrings(a.mediaKind, b.mediaKind) || compareStrings(a.name, b.name);
    } else {
      result =
        compareStrings(a.sourceLabel, b.sourceLabel) ||
        compareStrings(a.name, b.name);
    }

    return result * direction;
  });
};
