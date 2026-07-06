import React from "react";
import { cn } from "../../utils/cn";

interface SidebarRowProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  icon?: React.ReactNode;
  primaryText: React.ReactNode;
  secondaryText?: React.ReactNode;
  isActive?: boolean;
  depth?: number;
  actions?: React.ReactNode;
  containerClassName?: string;
  contentClassName?: string;
  primaryTextClassName?: string;
  secondaryTextClassName?: string;
  actionAreaClassName?: string;
  /** Sizing for the icon wrapper. Defaults to "w-4 h-4" to preserve existing rows. */
  iconClassName?: string;
}

export const SidebarRow = React.forwardRef<HTMLButtonElement, SidebarRowProps>(
  (
    {
      icon,
      primaryText,
      secondaryText,
      isActive,
      depth = 0,
      actions,
      actionAreaClassName,
      className,
      containerClassName,
      contentClassName,
      primaryTextClassName,
      secondaryTextClassName,
      iconClassName,
      children,
      style,
      ...props
    },
    ref
  ) => {
    const INDENT_PX = 20;
    const BASE_PX = 8;
    const ACTION_PADDING_PX = actions ? 72 : 8;

    return (
      <div className={cn("group relative w-full", containerClassName)}>
        <button
          ref={ref}
          className={cn(
            "w-full flex items-center h-[28px] rounded-md text-left transition-all duration-150 outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-primary-500",
            isActive
              ? "bg-primary-500/10 dark:bg-primary-500/15 text-primary-700 dark:text-primary-300 font-semibold"
              : "text-gray-600 dark:text-gray-300 hover:bg-black/5 dark:hover:bg-white/5",
            className
          )}
          style={{
            paddingLeft: BASE_PX + depth * INDENT_PX,
            paddingRight: ACTION_PADDING_PX,
            ...style,
          }}
          {...props}
        >
          {icon && (
            <div
              className={cn(
                "shrink-0 mr-2 flex items-center justify-center",
                iconClassName ?? "w-4 h-4"
              )}
            >
              {icon}
            </div>
          )}
          
          <div className={cn("flex-1 min-w-0 flex flex-col justify-center", contentClassName)}>
            <span className={cn("text-xs truncate leading-tight", primaryTextClassName)}>
              {primaryText}
            </span>
            {secondaryText && (
              <span
                className={cn(
                  "text-[10px] truncate opacity-60 font-mono leading-tight",
                  secondaryTextClassName
                )}
              >
                {secondaryText}
              </span>
            )}
          </div>

          {children}
        </button>
        {actions && (
          <div
            className={cn(
              "absolute inset-y-0 right-1 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity duration-150",
              isActive && "opacity-100",
              actionAreaClassName
            )}
          >
            {actions}
          </div>
        )}
      </div>
    );
  }
);

SidebarRow.displayName = "SidebarRow";
