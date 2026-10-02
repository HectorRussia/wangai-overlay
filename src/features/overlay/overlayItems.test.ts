import { describe, expect, it } from "vitest";
import { visibleOverlayItems } from "./overlayItems";
import type { SubtitleItem } from "../../types";

describe("visible overlay items", () => {
  it("keeps the latest four messages until the conversation becomes idle", () => {
    const now = 1_000_000;
    const item = (segmentId: string, createdAtMs: number): SubtitleItem => ({
      segmentId,
      stream: "incoming",
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
