// Fallback shell for running the app in a plain browser (`npm run dev` without
// Tauri). Pawcast ships desktop-only; this exists for development convenience.
import type { Dispatch, SetStateAction } from "react";

import type { LayoutSettings } from "../../stores/layoutStore";
import { AppLayoutBase } from "../layout/AppLayoutBase";

interface WebAppLayoutProps {
  children: React.ReactNode;
  layoutSettings?: LayoutSettings;
  setLayoutSettings?: Dispatch<SetStateAction<LayoutSettings>>;
  bottomPaddingClassName?: string;
}

export const WebAppLayout = (props: WebAppLayoutProps) => (
  <AppLayoutBase containerClassName="max-w-5xl mx-auto" {...props} />
);
