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
  it("provides complete long mixed-language phrases and bounds visual-only overlay sizes", () => {
    window.history.replaceState(null, "", "/?preview=1&state=transcript-wrap&overlayWidth=99999&overlayHeight=1&fontScale=99");
    const snapshot = previewSnapshot();
    expect(snapshot.history).toHaveLength(4);
    expect(snapshot.history[0].translatedText).toContain("แล้วคนอื่นทำจริงไหม");
    expect(snapshot.settings.overlay).toMatchObject({ width: 1920, height: 190, fontScale: 1.8 });
    expect(snapshot.runtime.overlayEditMode).toBe(true);
    window.history.replaceState(null, "", "/?preview=1&state=transcript-wrap&locked=1");
    expect(previewSnapshot().runtime.overlayEditMode).toBe(false);
  });
});
