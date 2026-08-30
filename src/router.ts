import { useEffect, useState } from "react";

export const settingsTabs = ["overview", "audio", "ai", "controls", "history"] as const;

export type SettingsTab = (typeof settingsTabs)[number];
export type AppRoute = { view: "overlay" } | { view: "settings"; tab: SettingsTab };

export const defaultRoute = "#/settings/overview";

export function parseHashRoute(hash: string): AppRoute {
  const normalized = hash.replace(/^#\/?/, "").replace(/\/$/, "").toLowerCase();
  if (normalized === "overlay") return { view: "overlay" };
  const match = normalized.match(/^settings(?:\/([^/]+))?$/);
  const tab = match?.[1] ?? "overview";
  if (settingsTabs.includes(tab as SettingsTab)) {
    return { view: "settings", tab: tab as SettingsTab };
  }
  return { view: "settings", tab: "overview" };
}

export function settingsHref(tab: SettingsTab): string {
  return `#/settings/${tab}`;
}

function isValidHash(hash: string): boolean {
  const normalized = hash.toLowerCase();
  return normalized === "#/overlay" || settingsTabs.some((tab) => normalized === settingsHref(tab));
}

export function useHashRoute(): AppRoute {
  const [route, setRoute] = useState(() => parseHashRoute(window.location.hash));

  useEffect(() => {
    if (!isValidHash(window.location.hash)) {
      window.history.replaceState(null, "", defaultRoute);
      setRoute(parseHashRoute(defaultRoute));
    }
    const onHashChange = () => {
      if (!isValidHash(window.location.hash)) {
        window.history.replaceState(null, "", defaultRoute);
        setRoute(parseHashRoute(defaultRoute));
        return;
      }
      setRoute(parseHashRoute(window.location.hash));
    };
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  return route;
}
