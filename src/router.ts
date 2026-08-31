import { useEffect, useState } from "react";

export const settingsTabs = ["overview", "advanced", "history"] as const;
export const advancedSections = ["audio", "ai", "controls"] as const;

export type SettingsTab = (typeof settingsTabs)[number];
export type AdvancedSection = (typeof advancedSections)[number];
export type AppRoute =
  | { view: "overlay" }
  | { view: "settings"; tab: SettingsTab; advancedSection?: AdvancedSection };

export const defaultRoute = "#/settings/overview";

export function parseHashRoute(hash: string): AppRoute {
  const normalized = hash.replace(/^#\/?/, "").replace(/\/$/, "").toLowerCase();
  if (normalized === "overlay") return { view: "overlay" };
  const match = normalized.match(/^settings(?:\/([^/]+))?(?:\/([^/]+))?$/);
  const tab = match?.[1] ?? "overview";
  const section = match?.[2];
  if (advancedSections.includes(tab as AdvancedSection)) {
    return { view: "settings", tab: "advanced", advancedSection: tab as AdvancedSection };
  }
  if (tab === "advanced") {
    return {
      view: "settings",
      tab: "advanced",
      advancedSection: advancedSections.includes(section as AdvancedSection)
        ? section as AdvancedSection
        : "audio",
    };
  }
  if (settingsTabs.includes(tab as SettingsTab)) {
    return { view: "settings", tab: tab as SettingsTab };
  }
  return { view: "settings", tab: "overview" };
}

export function settingsHref(tab: SettingsTab): string {
  return `#/settings/${tab}`;
}

export function advancedHref(section: AdvancedSection): string {
  return `#/settings/advanced/${section}`;
}

function isValidHash(hash: string): boolean {
  const normalized = hash.toLowerCase().replace(/\/$/, "");
  return normalized === "#/overlay"
    || settingsTabs.some((tab) => normalized === settingsHref(tab))
    || advancedSections.some((section) =>
      normalized === advancedHref(section) || normalized === `#/settings/${section}`,
    );
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
