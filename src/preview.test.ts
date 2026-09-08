import { beforeEach, describe, expect, it } from "vitest";
import { previewSnapshot, previewNotification, previewListeningBusy } from "./preview";

describe("v14 preview fixtures", () => {
  beforeEach(() => window.history.replaceState(null, "", "/?preview=1&state=ready"));
  it("contains one manually selected source", () => {
    const snapshot = previewSnapshot();
    expect(snapshot.settings.schemaVersion).toBe(14);
    expect(snapshot.settings.listeningSource?.displayName).toBe("Mistfall Hunter");
    expect(snapshot.history[0].stream).toBe("incoming");
  });
  it("exposes visual stress states only in explicit preview mode", () => {
    window.history.replaceState(null, "", "/?ui=long-error");
    expect(previewNotification()).toBeUndefined();
    window.history.replaceState(null, "", "/?ui=busy");
    expect(previewListeningBusy()).toBe(false);
    window.history.replaceState(null, "", "/?preview=1&ui=long-error&state=long-text");
    expect(previewNotification()?.kind).toBe("error");
    expect(previewSnapshot().settings.listeningSource?.displayName.length).toBeGreaterThan(100);
    window.history.replaceState(null, "", "/?preview=1&ui=busy");
    expect(previewListeningBusy()).toBe(true);
  });
});
