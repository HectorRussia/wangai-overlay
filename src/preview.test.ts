import { beforeEach, describe, expect, it } from "vitest";
import { previewSnapshot } from "./preview";

describe("v13 preview fixtures", () => {
  beforeEach(() => window.history.replaceState(null, "", "/?preview=1&state=ready"));
  it("contains one manually selected source", () => {
    const snapshot = previewSnapshot();
    expect(snapshot.settings.schemaVersion).toBe(13);
    expect(snapshot.settings.listeningSource?.displayName).toBe("Mistfall Hunter");
    expect(snapshot.history[0].stream).toBe("incoming");
  });
});
