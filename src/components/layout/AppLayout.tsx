/**
 * AppLayout – public facade used by all pages.
 *
 * Electron-only app — always renders ElectronAppLayout.
 */
import { Dispatch, SetStateAction } from "react";
import { ElectronAppLayout } from "../electron/ElectronAppLayout";

import { LayoutSettings } from "../../stores/layoutStore";

interface AppLayoutProps {
  children: React.ReactNode;
  layoutSettings?: LayoutSettings;
  setLayoutSettings?: Dispatch<SetStateAction<LayoutSettings>>;
  bottomPaddingClassName?: string;
}

export const AppLayout = (props: AppLayoutProps) => {
  return <ElectronAppLayout {...props} />;
};
