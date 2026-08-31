import { describe, expect, it } from "vitest";
import { advancedHref, defaultRoute, parseHashRoute, settingsHref } from "./router";

describe("hash routing", () => {
  it("routes the overlay window", () => {
    expect(parseHashRoute("#/overlay")).toEqual({ view: "overlay" });
  });

  it("routes Ready Room, Advanced sections, and History", () => {
    expect(parseHashRoute(settingsHref("overview"))).toEqual({ view: "settings", tab: "overview" });
    expect(parseHashRoute(advancedHref("audio"))).toEqual({ view: "settings", tab: "advanced", advancedSection: "audio" });
    expect(parseHashRoute(advancedHref("ai"))).toEqual({ view: "settings", tab: "advanced", advancedSection: "ai" });
    expect(parseHashRoute(advancedHref("controls"))).toEqual({ view: "settings", tab: "advanced", advancedSection: "controls" });
    expect(parseHashRoute(settingsHref("history"))).toEqual({ view: "settings", tab: "history" });
  });

  it("keeps legacy settings routes working", () => {
    expect(parseHashRoute("#/settings/audio")).toEqual({ view: "settings", tab: "advanced", advancedSection: "audio" });
    expect(parseHashRoute("#/settings/ai")).toEqual({ view: "settings", tab: "advanced", advancedSection: "ai" });
    expect(parseHashRoute("#/settings/controls")).toEqual({ view: "settings", tab: "advanced", advancedSection: "controls" });
  });

  it("falls back to overview for unknown routes", () => {
    expect(parseHashRoute("#/unknown")).toEqual({ view: "settings", tab: "overview" });
    expect(defaultRoute).toBe("#/settings/overview");
  });
});
