import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "./api";
import { getPreviewSnapshot, previewCommand } from "./previewStore";
import { isPreviewMode, previewProcesses } from "./preview";
afterEach(() => { window.history.replaceState(null, "", "/"); Reflect.deleteProperty(window, "__TAURI_INTERNALS__"); vi.unstubAllGlobals(); });
describe("isolated interactive preview", () => {
  it("simulates listening, source and settings without network calls or persistence", async () => {
    window.history.replaceState(null, "", "/?preview=1&state=studio");
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    const id = getPreviewSnapshot().settings.installationId;
    await api.toggleListening(); expect(getPreviewSnapshot().runtime.listening).toBe(false);
    await api.selectListeningSource(previewProcesses[1]);
    expect(getPreviewSnapshot().settings.listeningSource?.displayName).toBe("Discord");
    await api.updateCaptureMode("process_tree");
    expect(getPreviewSnapshot().settings.captureMode).toBe("process_tree");
    expect(getPreviewSnapshot().settings.installationId).toBe(id);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("never enables preview in a Tauri window, even with preview query parameters", async () => {
    window.history.replaceState(null, "", "/?preview=1");
    Object.defineProperty(window, "__TAURI_INTERNALS__", { configurable: true, value: {} });
    expect(isPreviewMode()).toBe(false);
    await expect(previewCommand("toggleListening", [])).rejects.toThrow("browser-only");
  });
  it("rejects unknown commands and non-preview pages", async () => {
    await expect(previewCommand("toggleListening", [])).rejects.toThrow("browser-only");
    window.history.replaceState(null, "", "/?preview=1&state=ready");
    await expect(previewCommand("new_public_api", [])).rejects.toThrow("Unavailable");
  });
});
