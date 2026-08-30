import { afterEach, describe, expect, it } from "vitest";
import { isPreviewMode, isTauriRuntime } from "./preview";

afterEach(() => {
  Reflect.deleteProperty(window, "__TAURI_INTERNALS__");
  window.history.replaceState({}, "", "/");
});

describe("browser preview detection", () => {
  it("uses fixture data automatically when the Tauri bridge is absent", () => {
    expect(isTauriRuntime()).toBe(false);
    expect(isPreviewMode()).toBe(true);
  });

  it("uses the real backend inside Tauri unless preview is explicitly requested", () => {
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      configurable: true,
      value: {},
    });

    expect(isTauriRuntime()).toBe(true);
    expect(isPreviewMode()).toBe(false);

    window.history.replaceState({}, "", "/?preview=1#/settings/overview");
    expect(isPreviewMode()).toBe(true);
  });
});
