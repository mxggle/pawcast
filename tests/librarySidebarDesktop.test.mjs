import assert from "node:assert/strict";
import test from "node:test";

const modulePath = new URL("../src/components/desktop/librarySidebar.ts", import.meta.url).href;

const {
  buildLibraryItems,
  filterLibraryItems,
  flattenFolderTree,
  sortLibraryItems,
} = await import(modulePath);

const tree = [
  {
    name: "Lessons",
    path: "/media/Lessons",
    type: "directory",
    children: [
      {
        name: "b-shadowing.wav",
        path: "/media/Lessons/b-shadowing.wav",
        type: "file",
      },
      {
        name: "Video",
        path: "/media/Lessons/Video",
        type: "directory",
        children: [
          {
            name: "a-dialogue.mp4",
            path: "/media/Lessons/Video/a-dialogue.mp4",
            type: "file",
          },
        ],
      },
    ],
  },
];

const history = [
  {
    id: "history-1",
    type: "file",
    name: "z-recent.mp3",
    accessedAt: 300,
    nativePath: "/recent/z-recent.mp3",
    fileData: {
      name: "z-recent.mp3",
      type: "audio/mp3",
      size: 1,
      url: "file:///recent/z-recent.mp3",
      nativePath: "/recent/z-recent.mp3",
    },
  },
  {
    id: "history-2",
    type: "youtube",
    name: "YouTube lesson",
    accessedAt: 500,
    youtubeData: {
      youtubeId: "abc123",
    },
  },
];

test("flattenFolderTree returns only media file items with source metadata", () => {
  const files = flattenFolderTree(tree, "/media");

  assert.deepEqual(
    files.map((item) => ({
      kind: item.kind,
      name: item.name,
      sourcePath: item.sourcePath,
      mediaKind: item.mediaKind,
    })),
    [
      {
        kind: "folder-file",
        name: "b-shadowing.wav",
        sourcePath: "/media",
        mediaKind: "audio",
      },
      {
        kind: "folder-file",
        name: "a-dialogue.mp4",
        sourcePath: "/media",
        mediaKind: "video",
      },
    ],
  );
});

test("buildLibraryItems combines folder files and recent history", () => {
  const items = buildLibraryItems({
    sourceTrees: [{ sourcePath: "/media", tree }],
    history,
  });

  assert.deepEqual(
    items.map((item) => `${item.kind}:${item.name}`),
    [
      "folder-file:b-shadowing.wav",
      "folder-file:a-dialogue.mp4",
      "recent:z-recent.mp3",
      "recent:YouTube lesson",
    ],
  );
});

test("filterLibraryItems searches names, paths, and source folders", () => {
  const items = buildLibraryItems({
    sourceTrees: [{ sourcePath: "/media", tree }],
    history,
  });

  assert.deepEqual(
    filterLibraryItems(items, { query: "video", scope: "all" }).map((item) => item.name),
    ["a-dialogue.mp4"],
  );

  assert.deepEqual(
    filterLibraryItems(items, { query: "recent", scope: "recent" }).map((item) => item.name),
    ["z-recent.mp3"],
  );
});

test("sortLibraryItems supports name, type, source, and recent order", () => {
  const items = buildLibraryItems({
    sourceTrees: [{ sourcePath: "/media", tree }],
    history,
  });

  assert.deepEqual(
    sortLibraryItems(items, { sortBy: "name", sortOrder: "asc" }).map((item) => item.name),
    ["a-dialogue.mp4", "b-shadowing.wav", "YouTube lesson", "z-recent.mp3"],
  );

  assert.deepEqual(
    sortLibraryItems(items, { sortBy: "recent", sortOrder: "desc" }).map((item) => item.name),
    ["YouTube lesson", "z-recent.mp3", "b-shadowing.wav", "a-dialogue.mp4"],
  );

  assert.deepEqual(
    sortLibraryItems(items, { sortBy: "type", sortOrder: "asc" }).map((item) => item.mediaKind),
    ["audio", "audio", "video", "youtube"],
  );

  assert.equal(
    sortLibraryItems(items, { sortBy: "source", sortOrder: "asc" })[0].sourceLabel,
    "media",
  );
});
