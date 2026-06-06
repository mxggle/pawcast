export const SETTINGS_OPEN_INTENT_EVENT = "pawcast:open-settings";

export type SettingsIntentTab = "general" | "ai" | "data";

export interface SettingsOpenIntentDetail {
  tab?: SettingsIntentTab;
  section?: string;
}

export type SettingsOpenIntentEvent = CustomEvent<SettingsOpenIntentDetail>;

const getSettingsOpenIntentDetail = (event: Event): SettingsOpenIntentDetail => {
  return (event as SettingsOpenIntentEvent).detail ?? {};
};

export const requestOpenSettings = (detail: SettingsOpenIntentDetail = {}) => {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(
    new CustomEvent<SettingsOpenIntentDetail>(SETTINGS_OPEN_INTENT_EVENT, {
      detail,
    })
  );
};

export const onSettingsOpenIntent = (
  handler: (detail: SettingsOpenIntentDetail) => void
) => {
  if (typeof window === "undefined") {
    return () => {};
  }

  const listener: EventListener = (event) => {
    handler(getSettingsOpenIntentDetail(event));
  };

  window.addEventListener(SETTINGS_OPEN_INTENT_EVENT, listener);

  return () => {
    window.removeEventListener(SETTINGS_OPEN_INTENT_EVENT, listener);
  };
};

export const buildSettingsSearch = (detail: SettingsOpenIntentDetail = {}) => {
  const params = new URLSearchParams();
  const tab = detail.tab ?? (detail.section ? "ai" : undefined);

  if (tab) {
    params.set("tab", tab);
  }

  if (detail.section) {
    params.set("section", detail.section);
  }

  const search = params.toString();
  return search ? `?${search}` : "";
};
