import { useEffect } from "react";
import { OverlayApp } from "./OverlayApp";
import { isPreviewMode } from "./preview";
import { SettingsApp } from "./SettingsApp";
import { useHashRoute } from "./router";

export function App() {
  const route = useHashRoute();

  useEffect(() => {
    document.body.className = `${route.view === "overlay" ? "overlay-body" : "settings-body"}${isPreviewMode() ? " preview-body" : ""}`;
  }, [route.view]);

  return route.view === "overlay" ? <OverlayApp /> : <SettingsApp activeTab={route.tab} />;
}
