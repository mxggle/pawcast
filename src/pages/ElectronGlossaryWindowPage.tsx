import { useTranslation } from "react-i18next";
import { GlossaryWindowShell } from "../components/electron/GlossaryWindowShell";
import { GlossaryContent } from "../components/glossary/GlossaryContent";

export function ElectronGlossaryWindowPage() {
  const { t } = useTranslation();

  return (
    <GlossaryWindowShell title={t("glossary.title")}>
      <GlossaryContent />
    </GlossaryWindowShell>
  );
}
