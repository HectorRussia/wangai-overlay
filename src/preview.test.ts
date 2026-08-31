import { afterEach, describe, expect, it } from "vitest";
import { isPreviewMode, isTauriRuntime, previewSnapshot } from "./preview";

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

  it("exposes deterministic warning and setup fixtures", () => {
    window.history.replaceState({}, "", "/?preview=1&state=warning#/settings/overview");
    const warning = previewSnapshot();
    expect(warning.runtime.captureWarning).toMatch(/เสียงเกม/);
    expect(warning.runtime.voiceChatCaptureWarning).toMatch(/Discord/);

    window.history.replaceState({}, "", "/?preview=1&state=setup#/settings/overview");
    const setup = previewSnapshot();
    expect(setup.settings.selectedProcess).toBeUndefined();
    expect(setup.settings.voiceChat.enabled).toBe(false);
    expect(setup.settings.groq.configured).toBe(false);
  });

  it("keeps the visual target fixture configured but ready to start", () => {
    window.history.replaceState({}, "", "/?preview=1&state=ready#/settings/overview");
    const ready = previewSnapshot();
    expect(ready.runtime.listening).toBe(false);
    expect(ready.settings.selectedProcess?.displayName).toBe("Mistfall Hunter");
    expect(ready.settings.groq.configured).toBe(true);
    expect(ready.history).toHaveLength(2);
  });
});
