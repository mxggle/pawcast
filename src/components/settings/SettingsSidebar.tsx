import type { LucideIcon } from "lucide-react";
import { cn } from "../../utils/cn";

export type SettingsTab = "general" | "ai" | "data";

export interface SettingsSidebarItem {
  id: SettingsTab;
  label: string;
  Icon: LucideIcon;
}

interface SettingsSidebarProps {
  activeTab: SettingsTab;
  items: SettingsSidebarItem[];
  onTabChange: (tab: SettingsTab) => void;
  variant?: "page" | "standalone";
  className?: string;
}

export function SettingsSidebar({
  activeTab,
  items,
  onTabChange,
  variant = "page",
  className,
}: SettingsSidebarProps) {
  return (
    <nav
      className={cn(
        "flex flex-col gap-1",
        variant === "page" && "w-[200px] shrink-0",
        className
      )}
      aria-label="Settings navigation"
    >
      {items.map(({ id, label, Icon }) => {
        const isActive = activeTab === id;

        return (
          <button
            key={id}
            type="button"
            onClick={() => onTabChange(id)}
            aria-current={isActive ? "true" : undefined}
            className={cn(
              "flex items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40",
              isActive
                ? "bg-primary-500/10 font-semibold text-primary-600 dark:text-primary-300"
                : "font-medium text-gray-600 hover:bg-black/[0.04] hover:text-gray-900 dark:text-gray-400 dark:hover:bg-white/[0.06] dark:hover:text-gray-100"
            )}
          >
            <Icon
              className={cn(
                "h-4 w-4 shrink-0",
                isActive
                  ? "text-primary-600 dark:text-primary-300"
                  : "text-gray-400 dark:text-gray-500"
              )}
            />
            <span className="truncate">{label}</span>
          </button>
        );
      })}
    </nav>
  );
}
