import { describe, expect, it } from "vitest";
import { defaultRoute, parseHashRoute, settingsHref } from "./router";

describe("hash routing", () => {
  it("routes the overlay window", () => {
    expect(parseHashRoute("#/overlay")).toEqual({ view: "overlay" });
  });

  it("routes every settings tab", () => {
    expect(parseHashRoute(settingsHref("audio"))).toEqual({ view: "settings", tab: "audio" });
    expect(parseHashRoute(settingsHref("ai"))).toEqual({ view: "settings", tab: "ai" });
    expect(parseHashRoute(settingsHref("controls"))).toEqual({ view: "settings", tab: "controls" });
    expect(parseHashRoute(settingsHref("history"))).toEqual({ view: "settings", tab: "history" });
  });

  it("falls back to overview for unknown routes", () => {
    expect(parseHashRoute("#/unknown")).toEqual({ view: "settings", tab: "overview" });
    expect(defaultRoute).toBe("#/settings/overview");
  });
});
