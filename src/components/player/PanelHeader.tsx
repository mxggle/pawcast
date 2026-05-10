import {
  PanelLeftClose,
  PanelRightClose,
  PanelBottomClose,
  PanelLeft,
  PanelRight,
  PanelTop,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "../../utils/cn";

interface PanelHeaderProps {
  title: string;
  onCollapse?: () => void;
  className?: string;
  collapseIcon?: "left" | "right" | "bottom";
}

export const PanelHeader = ({
  title,
  onCollapse,
  className,
  collapseIcon = "bottom",
}: PanelHeaderProps) => {
  const { t } = useTranslation();
  const CollapseIcon =
    collapseIcon === "left"
      ? PanelLeftClose
      : collapseIcon === "right"
        ? PanelRightClose
        : PanelBottomClose;

  return (
    <div
      className={cn(
        "flex items-center justify-between px-3 h-9 bg-white dark:bg-gray-950/40 select-none min-w-0 shrink-0",
        className
      )}
    >
      <span className="text-[11px] font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider truncate min-w-0 mr-2">
        {title}
      </span>
      <div className="flex items-center gap-0.5 flex-shrink-0">
        <button
          onClick={onCollapse}
          className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
          title={t("common.collapse")}
        >
          <CollapseIcon size={14} />
        </button>
      </div>
    </div>
  );
};

/** Horizontal strip shown when a top/bottom panel collapses (e.g. timeline). */
export const CollapsedHorizontalStrip = ({
  title,
  onExpand,
  className,
  expandIcon = "top",
}: {
  title: string;
  onExpand: () => void;
  className?: string;
  expandIcon?: "top" | "bottom";
}) => {
  const { t } = useTranslation();
  const ExpandIcon = expandIcon === "top" ? PanelTop : PanelBottomClose;
  return (
    <div
      className={cn(
        "flex items-center h-9 px-2 gap-1 bg-white dark:bg-gray-950/40 select-none shrink-0",
        className
      )}
    >
      <button
        onClick={onExpand}
        className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors shrink-0"
        title={t("common.expand")}
      >
        <ExpandIcon size={14} />
      </button>
      <span className="text-[11px] font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider flex-1 truncate px-1">
        {title}
      </span>
    </div>
  );
};

/** Vertical strip shown when a left/right panel collapses (transcript or video). */
export const CollapsedVerticalStrip = ({
  title,
  onExpand,
  className,
  expandIcon = "left",
}: {
  title: string;
  onExpand: () => void;
  className?: string;
  expandIcon?: "left" | "right";
}) => {
  const { t } = useTranslation();
  const ExpandIcon = expandIcon === "left" ? PanelLeft : PanelRight;
  return (
    <div
      className={cn(
        "flex flex-col items-center h-full w-12 py-2 gap-1 bg-white dark:bg-gray-950/40 select-none shrink-0",
        className
      )}
    >
      {/* Top controls: expand + hide — fixed position, never moves */}
      <div className="flex flex-col items-center gap-1 shrink-0">
        <button
          onClick={onExpand}
          className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors shrink-0"
          title={t("common.expand")}
        >
          <ExpandIcon size={14} />
        </button>
      </div>
      {/* Title occupies remaining space, clickable to expand */}
      <button
        onClick={onExpand}
        className="flex-1 flex items-center justify-center w-full hover:bg-gray-50 dark:hover:bg-gray-900/40 rounded transition-colors min-h-0"
        title={`${t("common.expand")} ${title}`}
      >
        <span className="text-[10px] font-medium text-gray-400 dark:text-gray-500 uppercase tracking-widest [writing-mode:vertical-rl] rotate-180 select-none">
          {title}
        </span>
      </button>
    </div>
  );
};
