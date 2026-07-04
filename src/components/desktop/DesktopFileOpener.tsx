import { useCallback, useEffect } from "react";
import { useDropzone } from "react-dropzone";
import { useTranslation } from "react-i18next";
import { openFile } from "../../stores/playerActions";
import { UploadCloud } from "lucide-react";
import { nativePathToUrl } from "../../utils/platform";
import { cn } from "../../utils/cn";
import { desktopApi } from "../../platform/runtime";

const VIDEO_EXTS = new Set(["mp4", "mkv", "avi", "mov", "webm", "m4v"]);

const getMimeType = (fileName: string): string => {
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
  return VIDEO_EXTS.has(ext) ? `video/${ext}` : `audio/${ext}`;
};

/**
 * Desktop-only file opener. A single unified surface: click opens the native
 * file dialog (desktopApi.openFile), drag-and-drop accepts files from
 * Finder / Explorer. One affordance, no nested boxes.
 */
export const DesktopFileOpener = () => {
  const { t } = useTranslation();

  const openNativePath = useCallback((filePath: string) => {
    const fileName = filePath.split(/[\\/]/).pop() ?? filePath;
    void openFile({
      name: fileName,
      type: getMimeType(fileName),
      size: 0,
      url: nativePathToUrl(filePath),
      nativePath: filePath,
    });
  }, []);

  const handleOpenFile = useCallback(async () => {
    const filePath = await desktopApi?.openFile();
    if (filePath) openNativePath(filePath);
  }, [openNativePath]);

  useEffect(() => {
    return desktopApi?.onFileDrop((paths) => {
      const firstPath = paths[0];
      if (firstPath) openNativePath(firstPath);
    });
  }, [openNativePath]);

  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      if (acceptedFiles.length === 0) return;
      const file = acceptedFiles[0];
      void openFile({
        name: file.name,
        type: file.type,
        size: file.size,
        url: URL.createObjectURL(file),
      });
    },
    []
  );

  // noClick: we trigger the native dialog ourselves on click instead of the
  // browser file picker, so paths resolve correctly inside desktop app.
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "audio/*": [".mp3", ".wav", ".ogg", ".flac", ".aac"],
      "video/*": [".mp4", ".webm", ".ogv", ".mkv", ".avi", ".mov", ".m4v"],
    },
    maxFiles: 1,
    noClick: desktopApi !== null,
    noKeyboard: desktopApi !== null,
  });

  const rootProps = getRootProps({
    onClick: () => {
      if (desktopApi) void handleOpenFile();
    },
    onKeyDown: (event) => {
      if (desktopApi && (event.key === "Enter" || event.key === " ")) {
        event.preventDefault();
        void handleOpenFile();
      }
    },
  });

  return (
    <div
      {...rootProps}
      role="button"
      tabIndex={0}
      className={cn(
        "group flex w-full cursor-pointer flex-col items-center justify-center gap-4 rounded-2xl border-2 border-dashed px-6 py-10 text-center outline-none transition-colors",
        "focus-visible:ring-2 focus-visible:ring-primary-400/50",
        isDragActive
          ? "border-primary-400 bg-primary-50/60 dark:border-primary-500/60 dark:bg-primary-900/15"
          : "border-gray-200 hover:border-primary-300 hover:bg-primary-50/40 dark:border-white/10 dark:hover:border-primary-700/60 dark:hover:bg-white/[0.03]"
      )}
    >
      <input {...getInputProps()} />
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-50 text-primary-500 transition-transform group-hover:scale-105 dark:bg-primary-900/25 dark:text-primary-400">
        <UploadCloud className="h-7 w-7" />
      </div>
      <div className="space-y-1">
        <p className="text-base font-semibold text-gray-800 dark:text-gray-100">
          {isDragActive ? t("upload.dropToUpload") : t("upload.dragDrop")}
        </p>
        <p className="text-xs text-gray-400 dark:text-gray-500">
          {t("upload.browseFiles")}
        </p>
      </div>
      <p className="text-[11px] font-medium tracking-wide text-gray-300 dark:text-gray-600">
        {t("upload.supportedFormats")}
      </p>
    </div>
  );
};
