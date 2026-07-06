import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useShallow } from "zustand/react/shallow";
import * as Dialog from "@radix-ui/react-dialog";
import { Info, Keyboard, X } from "lucide-react";
import { usePlayerStore } from "../../stores/playerStore";
import { ScrollLock } from "../../hooks/useScrollLock";

interface KeyboardShortcutsDialogProps {
  /** className applied to the Info trigger button */
  triggerClassName?: string;
}

interface ShortcutRow {
  keys: string[];
  label: string;
}

interface ShortcutGroup {
  title: string;
  rows: ShortcutRow[];
}

const Keys = ({ keys }: { keys: string[] }) => (
  <span className="flex shrink-0 items-center gap-1">
    {keys.map((key, index) => (
      <kbd key={index} className="kbd">
        {key}
      </kbd>
    ))}
  </span>
);

/**
 * Keyboard shortcuts / help dialog with a self-contained Info trigger.
 * Shared by the header (web) and the desktop icon rail.
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

  const groups: ShortcutGroup[] = [
    {
      title: t("layout.shortcutGroupPlayback", "Playback"),
      rows: [
        { keys: ["Space"], label: t("layout.playPause") },
        {
          keys: ["←", "→"],
          label: t("layout.seekBackwardForward", { seconds: seekStepSeconds }),
        },
        {
          keys: ["Shift", "←", "→"],
          label: t("layout.seekBackwardForwardSmall", {
            seconds: seekSmallStepSeconds,
          }),
        },
        { keys: ["↑", "↓"], label: t("layout.volumeUpDown") },
      ],
    },
    {
      title: t("layout.shortcutGroupLoop", "A-B Loop"),
      rows: [
        { keys: ["A"], label: t("layout.setAPoint") },
        { keys: ["B"], label: t("layout.setBPoint") },
        { keys: ["L"], label: t("layout.toggleLoop") },
        { keys: ["C"], label: t("layout.clearLoopPoints") },
      ],
    },
    {
      title: t("layout.shortcutGroupNavigation", "Navigation"),
      rows: [{ keys: ["0", "-", "9"], label: t("layout.jumpToPercent") }],
    },
  ];

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
        <Dialog.Overlay className="fixed inset-0 z-[80] bg-black/40 backdrop-blur-sm data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <Dialog.Content
          aria-describedby={undefined}
          className="fixed left-1/2 top-1/2 z-[81] w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-black/5 bg-white shadow-2xl outline-none dark:border-white/10 dark:bg-gray-900"
        >
          <ScrollLock />

          <div className="flex items-center justify-between border-b border-black/5 px-5 py-4 dark:border-white/5">
            <div className="flex items-center gap-2.5">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-500/10 text-primary-600 dark:text-primary-400">
                <Keyboard className="h-4 w-4" />
              </span>
              <Dialog.Title className="text-base font-semibold text-gray-900 dark:text-white">
                {t("layout.keyboardShortcuts")}
              </Dialog.Title>
            </div>
            <Dialog.Close asChild>
              <button
                className="flex h-7 w-7 items-center justify-center rounded-md text-gray-400 transition-colors hover:bg-black/5 hover:text-gray-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 dark:hover:bg-white/10 dark:hover:text-gray-200"
                aria-label={t("common.close")}
              >
                <X className="h-4 w-4" />
              </button>
            </Dialog.Close>
          </div>

          <div className="max-h-[65vh] space-y-5 overflow-y-auto px-5 py-4 thin-scrollbar">
            {groups.map((group) => (
              <section key={group.title}>
                <h3 className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.08em] text-gray-400 dark:text-gray-500">
                  {group.title}
                </h3>
                <div className="divide-y divide-black/[0.04] rounded-xl border border-black/5 dark:divide-white/[0.04] dark:border-white/5">
                  {group.rows.map((row) => (
                    <div
                      key={row.label}
                      className="flex items-center justify-between gap-4 px-3.5 py-2.5"
                    >
                      <span className="min-w-0 text-sm text-gray-700 dark:text-gray-300">
                        {row.label}
                      </span>
                      <Keys keys={row.keys} />
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
};
