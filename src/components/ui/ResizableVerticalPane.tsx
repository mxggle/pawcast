import React, { useRef, useState, useCallback, useEffect } from "react";
import { cn } from "../../utils/cn";
import { useTranslation } from "react-i18next";

interface ResizableVerticalPaneProps {
  /** Content for the top pane */
  top: React.ReactNode;
  /** Content for the bottom pane */
  bottom: React.ReactNode;
  /** Initial height of the top pane in pixels (default: 240) */
  initialTopHeight?: number;
  /** Minimum height of the top pane in pixels (default: 140) */
  minTopHeight?: number;
  /** Minimum height of the bottom pane in pixels (default: 160) */
  minBottomHeight?: number;
  /** localStorage key to persist user-adjusted height */
  storageKey?: string;
  /** Additional className on the outer container */
  className?: string;
  /** Whether resizing is enabled (default: true) */
  enabled?: boolean;
}

export const ResizableVerticalPane: React.FC<ResizableVerticalPaneProps> = ({
  top,
  bottom,
  initialTopHeight = 240,
  minTopHeight = 140,
  minBottomHeight = 160,
  storageKey,
  className,
  enabled = true,
}) => {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const [topHeight, setTopHeight] = useState<number>(() => {
    if (typeof window === "undefined" || !storageKey) return initialTopHeight;
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const parsed = parseInt(saved, 10);
        if (!isNaN(parsed) && parsed >= minTopHeight) return parsed;
      }
    } catch {
      // ignore
    }
    return initialTopHeight;
  });
  const [isResizing, setIsResizing] = useState(false);
  const startYRef = useRef(0);
  const startHeightRef = useRef(topHeight);

  const persistHeight = useCallback(
    (height: number) => {
      if (!storageKey || typeof window === "undefined") return;
      try {
        localStorage.setItem(storageKey, String(Math.round(height)));
      } catch {
        // ignore
      }
    },
    [storageKey]
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (!enabled) return;
      e.preventDefault();
      setIsResizing(true);
      startYRef.current = e.clientY;
      startHeightRef.current = topHeight;
    },
    [enabled, topHeight]
  );

  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (!enabled) return;
      const touch = e.touches[0];
      if (!touch) return;
      setIsResizing(true);
      startYRef.current = touch.clientY;
      startHeightRef.current = topHeight;
    },
    [enabled, topHeight]
  );

  useEffect(() => {
    if (!isResizing) return;

    const handleMove = (clientY: number) => {
      const container = containerRef.current;
      if (!container) return;
      const containerHeight = container.clientHeight;
      const deltaY = clientY - startYRef.current;
      const newHeight = Math.max(
        minTopHeight,
        Math.min(containerHeight - minBottomHeight, startHeightRef.current + deltaY)
      );
      setTopHeight(newHeight);
    };

    const onMouseMove = (e: MouseEvent) => handleMove(e.clientY);
    const onTouchMove = (e: TouchEvent) => {
      const touch = e.touches[0];
      if (touch) handleMove(touch.clientY);
    };

    const onUp = () => {
      setIsResizing(false);
      persistHeight(topHeight);
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onUp);
    window.addEventListener("touchmove", onTouchMove, { passive: true });
    window.addEventListener("touchend", onUp);

    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onUp);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onUp);
    };
  }, [isResizing, minTopHeight, minBottomHeight, topHeight, persistHeight]);

  return (
    <div
      ref={containerRef}
      className={cn("flex flex-col h-full min-h-0 overflow-hidden", className)}
    >
      {/* Top pane */}
      <div
        className="shrink-0 overflow-hidden"
        style={{ height: topHeight }}
      >
        {top}
      </div>

      {/* Resize handle */}
      {enabled && (
        <div
          className={cn(
            "shrink-0 h-[5px] flex items-center justify-center cursor-row-resize select-none transition-colors",
            "bg-gray-200/60 dark:bg-gray-700/60 hover:bg-primary-400/60 dark:hover:bg-primary-500/60",
            isResizing && "bg-primary-500/80 dark:bg-primary-400/80"
          )}
          onMouseDown={handleMouseDown}
          onTouchStart={handleTouchStart}
          role="separator"
          aria-orientation="horizontal"
          aria-label={t("layout.resizePanels")}
        >
          <div className="w-8 h-[3px] rounded-full bg-gray-400/40 dark:bg-gray-500/40" />
        </div>
      )}

      {/* Bottom pane */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {bottom}
      </div>
    </div>
  );
};
