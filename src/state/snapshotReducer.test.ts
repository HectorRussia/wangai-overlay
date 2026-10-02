import { describe, expect, it } from "vitest";
import { snapshotFixture } from "../test/fixtures";
import { reduceSnapshot } from "./snapshotReducer";

describe("snapshot event projection", () => {
  it("replaces duplicate segments, bounds history and applies late translations by ID", () => {
    const snapshot = snapshotFixture();
    const template = snapshot.history[0];
    snapshot.history = Array.from({ length: 100 }, (_, i) => ({
      ...template,
      segmentId: String(i),
    }));
    const item = { ...template, segmentId: "20", originalText: "replacement" };
    const replaced = reduceSnapshot(snapshot, {
      type: "subtitle-item",
      payload: item,
    })!;
    expect(replaced.history).toHaveLength(100);
    expect(replaced.history[0]).toEqual(item);
    expect(
      replaced.history.filter((entry) => entry.segmentId === "20"),
    ).toHaveLength(1);
    const updated = reduceSnapshot(replaced, {
      type: "translation-result",
      payload: {
        segmentId: "20",
        from: "en",
        to: "th",
        sourceText: "replacement",
        translatedText: "คำแปล",
        status: "success",
      },
    })!;
    expect(updated.history[0].translatedText).toBe("คำแปล");
    expect(snapshot.history[0].segmentId).toBe("0");
    const bounded = reduceSnapshot(updated, {
      type: "subtitle-item",
      payload: { ...item, segmentId: "new" },
    })!;
    expect(bounded.history).toHaveLength(100);
    expect(bounded.history.some((entry) => entry.segmentId === "99")).toBe(
      false,
    );
  });

  it("does not fabricate a snapshot before bootstrap and preserves the worker model when omitted", () => {
    expect(
      reduceSnapshot(undefined, { type: "pipeline-error", payload: "offline" }),
    ).toBeUndefined();
    const snapshot = snapshotFixture();
    snapshot.runtime.workerModel = "silero";
    const updated = reduceSnapshot(snapshot, {
      type: "worker-status",
      payload: { state: "error", message: "restart" },
    })!;
    expect(updated.runtime.workerReady).toBe(false);
    expect(updated.runtime.workerModel).toBe("silero");
    expect(updated.runtime.statusMessage).toBe("restart");
  });
});
