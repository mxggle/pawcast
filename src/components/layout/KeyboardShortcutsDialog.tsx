import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useShallow } from "zustand/react/shallow";
import * as Dialog from "@radix-ui/react-dialog";
import { Info } from "lucide-react";
import { usePlayerStore } from "../../stores/playerStore";
import { ScrollLock } from "../../hooks/useScrollLock";

interface KeyboardShortcutsDialogProps {
  /** className applied to the Info trigger button */
  triggerClassName?: string;
}

/**
 * Keyboard shortcuts / help dialog with a self-contained Info trigger.
 * Shared by the header (web) and the Electron icon rail.
 */
export const KeyboardShortcutsDialog = ({
  triggerClassName,
}: KeyboardShortcutsDialogProps) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  const { seekStepSeconds, seekSmallStepSeconds } = usePlayerStore(
    useShallow((state) => ({
      seekStepSeconds: state.seekStepSeconds,
      seekSmallStepSeconds: state.seekSmallStepSeconds,
    }))
  );

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <button
          className={
            triggerClassName ??
            "p-1.5 sm:p-2 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-300 transition-colors"
          }
          aria-label={t("layout.showKeyboardShortcuts")}
        >
          <Info className="h-4 w-4 sm:h-5 sm:w-5" />
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 backdrop-blur-sm" />
        <Dialog.Content className="fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-white dark:bg-gray-800 p-6 rounded-xl shadow-xl max-w-md w-full border border-gray-100 dark:border-gray-700">
          <ScrollLock />
          <Dialog.Title className="text-xl font-bold mb-4 text-gray-900 dark:text-white">
            {t("layout.keyboardShortcuts")}
          </Dialog.Title>
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="font-medium text-gray-800 dark:text-gray-200">Spacebar</div>
              <div className="text-gray-600 dark:text-gray-400">{t("layout.playPause")}</div>
              <div className="font-medium text-gray-800 dark:text-gray-200">A</div>
              <div className="text-gray-600 dark:text-gray-400">{t("layout.setAPoint")}</div>
              <div className="font-medium text-gray-800 dark:text-gray-200">B</div>
              <div className="text-gray-600 dark:text-gray-400">{t("layout.setBPoint")}</div>
              <div className="font-medium text-gray-800 dark:text-gray-200">L</div>
              <div className="text-gray-600 dark:text-gray-400">{t("layout.toggleLoop")}</div>
              <div className="font-medium text-gray-800 dark:text-gray-200">C</div>
              <div className="text-gray-600 dark:text-gray-400">{t("layout.clearLoopPoints")}</div>
              <div className="font-medium text-gray-800 dark:text-gray-200">←/→</div>
              <div className="text-gray-600 dark:text-gray-400">
                {t("layout.seekBackwardForward", { seconds: seekStepSeconds })}
              </div>
              <div className="font-medium text-gray-800 dark:text-gray-200">Shift + ←/→</div>
              <div className="text-gray-600 dark:text-gray-400">
                {t("layout.seekBackwardForwardSmall", { seconds: seekSmallStepSeconds })}
              </div>
              <div className="font-medium text-gray-800 dark:text-gray-200">↑/↓</div>
              <div className="text-gray-600 dark:text-gray-400">{t("layout.volumeUpDown")}</div>
              <div className="font-medium text-gray-800 dark:text-gray-200">0-9</div>
              <div className="text-gray-600 dark:text-gray-400">{t("layout.jumpToPercent")}</div>
            </div>
          </div>
          <Dialog.Close asChild>
            <button className="mt-6 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 w-full font-medium shadow-sm transition-colors">
              {t("common.close")}
            </button>
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
};
