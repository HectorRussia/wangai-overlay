import { describe, expect, it } from "vitest";
import { overlayPresentation, visibleOverlayItems } from "./overlayPresentation";
import type { SubtitleItem } from "./types";

describe("overlay presentation", () => {
  const idle = { hasPartial: false, visibleItems: 0, microphoneActive: false, editMode: false };

  it("collapses while idle", () => {
    expect(overlayPresentation(idle)).toBe("collapsed");
  });

  it.each([
    ["partial transcript", { ...idle, hasPartial: true }],
    ["recent final", { ...idle, visibleItems: 1 }],
    ["push to talk", { ...idle, microphoneActive: true }],
    ["edit mode", { ...idle, editMode: true }],
  ])("expands for %s", (_label, state) => {
    expect(overlayPresentation(state)).toBe("expanded");
  });

  it("keeps the latest four messages until the conversation becomes idle", () => {
    const now = 1_000_000;
    const item = (segmentId: string, createdAtMs: number): SubtitleItem => ({
      segmentId,
      stream: "game",
      originalLanguage: "en",
      originalText: segmentId,
      translatedText: segmentId,
      status: "success",
      createdAtMs,
    });
    const history = [
      item("message-5", now),
      item("message-4", now - 10_000),
      item("message-3", now - 20_000),
      item("message-2", now - 30_000),
      item("message-1", now - 40_000),
    ];

    expect(visibleOverlayItems(history, 4, 8, now).map((entry) => entry.segmentId)).toEqual([
      "message-2",
      "message-3",
      "message-4",
      "message-5",
    ]);
    expect(visibleOverlayItems(history, 4, 8, now + 8_000)).toEqual([]);
  });
});
