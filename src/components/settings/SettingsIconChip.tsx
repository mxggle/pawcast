import type { ReactNode } from "react";
import { cn } from "../../utils/cn";

interface SettingsIconChipProps {
  children: ReactNode;
  /** When true the chip takes the accent (coral) tint to signal an active/selected state. */
  active?: boolean;
  className?: string;
}

/**
 * Aurora icon chip — a neutral 36px rounded tile that holds a line icon and
 * turns accent-tinted when active. Reused across the settings panels so every
 * row/card shares one consistent icon treatment.
 */
export function SettingsIconChip({
  children,
  active = false,
  className,
}: SettingsIconChipProps) {
  return (
    <span
      className={cn(
        "flex h-9 w-9 shrink-0 items-center justify-center rounded-[11px] transition-colors duration-200",
        active
          ? "bg-primary/10 text-primary-500"
          : "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-300",
        className
      )}
    >
      {children}
    </span>
  );
}
