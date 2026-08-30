import { describe, expect, it } from "vitest";
import { overlayPresentation } from "./overlayPresentation";

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
});
