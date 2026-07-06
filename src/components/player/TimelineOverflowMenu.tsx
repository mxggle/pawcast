import { ReactNode } from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { MoreHorizontal } from "lucide-react";
import { cn } from "../../utils/cn";

export interface OverflowItem {
  id: string;
  label: string;
  icon?: ReactNode;
  onSelect: () => void;
  /** Optional class controlling visibility of the menu item itself.
   * Pair with the inline button's @container query so each control is
   * shown either inline OR in the menu, never both. */
  hideAtClass?: string;
  destructive?: boolean;
  shortcut?: string;
  disabled?: boolean;
}

interface Props {
  items: OverflowItem[];
  className?: string;
  triggerClassName?: string;
  ariaLabel?: string;
  side?: "top" | "bottom";
}

export const TimelineOverflowMenu = ({
  items,
  className,
  triggerClassName,
  ariaLabel = "More controls",
  side = "top",
}: Props) => {
  if (items.length === 0) return null;

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          className={cn(
            "timeline-secondary-action p-1.5 rounded-full transition-colors active:scale-90 text-gray-700 dark:text-gray-400 hover:bg-black/5 dark:hover:bg-white/5",
            triggerClassName
          )}
          aria-label={ariaLabel}
        >
          <MoreHorizontal size={16} />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          side={side}
          align="end"
          sideOffset={8}
          className={cn(
            "min-w-[180px] rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-gray-900 shadow-xl py-1 z-50",
            className
          )}
        >
          {items.map((item) => (
            <DropdownMenu.Item
              key={item.id}
              onSelect={item.onSelect}
              disabled={item.disabled}
              className={cn(
                "flex items-center gap-2 px-3 py-1.5 text-xs cursor-pointer outline-none",
                "text-gray-700 dark:text-gray-200",
                "data-[highlighted]:bg-gray-100 dark:data-[highlighted]:bg-white/5",
                "data-[disabled]:opacity-40 data-[disabled]:pointer-events-none",
                item.destructive && "text-error-600 dark:text-error-400",
                item.hideAtClass
              )}
            >
              {item.icon && <span className="flex-shrink-0">{item.icon}</span>}
              <span className="flex-1 truncate">{item.label}</span>
              {item.shortcut && (
                <span className="text-[10px] text-gray-400 font-mono">{item.shortcut}</span>
              )}
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
};
