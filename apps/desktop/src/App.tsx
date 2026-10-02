import { useEffect } from "react";
import { OverlayApp } from "./features/overlay/OverlayApp";
import { isPreviewMode } from "./preview";
import { SettingsApp } from "./features/settings/SettingsApp";
import { useHashRoute } from "./router";

export function App() {
  const route = useHashRoute();

  useEffect(() => {
    document.body.className = `${route.view === "overlay" ? "overlay-body" : "settings-body"}${isPreviewMode() ? " preview-body" : ""}`;
  }, [route.view]);

  return route.view === "overlay" ? (
    <OverlayApp />
  ) : (
    <SettingsApp
      activeTab={route.tab}
      advancedSection={route.advancedSection}
    />
  );
}
