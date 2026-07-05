import { useRef } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "react-hot-toast";
import { useBookmarkStore } from "../stores/bookmarkStore";
import type { LoopBookmark } from "../types/bookmark";

/** JSON export/import of the current media's bookmarks. */
export const useBookmarkIO = (bookmarks: LoopBookmark[]) => {
  const { t } = useTranslation();
  const importFileInputRef = useRef<HTMLInputElement>(null);

  const handleExportBookmarks = () => {
    if (bookmarks.length === 0) {
      toast.error(t("bookmarks.noBookmarksToExport"));
      return;
    }
    const dataStr = JSON.stringify(bookmarks, null, 2);
    const dataUri = `data:application/json;charset=utf-8,${encodeURIComponent(dataStr)}`;
    const exportFileDefaultName = `abloop-bookmarks-${new Date().toISOString().slice(0, 10)}.json`;
    const linkElement = document.createElement("a");
    linkElement.setAttribute("href", dataUri);
    linkElement.setAttribute("download", exportFileDefaultName);
    linkElement.click();
    toast.success(t("bookmarks.bookmarksExported"));
  };

  const handleImportBookmarks = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const importedBookmarks = JSON.parse(e.target?.result as string);
        if (Array.isArray(importedBookmarks)) {
          useBookmarkStore.getState().importBookmarks(importedBookmarks);
          toast.success(t("bookmarks.bookmarksImported", { count: importedBookmarks.length }));
        } else {
          toast.error(t("bookmarks.invalidFileFormat"));
        }
      } catch (error) {
        console.error("Error importing bookmarks:", error);
        toast.error(t("bookmarks.importError"));
      }
    };
    reader.readAsText(file);
    event.target.value = "";
  };

  return { importFileInputRef, handleExportBookmarks, handleImportBookmarks };
};
