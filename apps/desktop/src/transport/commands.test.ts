import { afterEach, describe, expect, it, vi } from "vitest";
import { snapshotFixture } from "../test/fixtures";
const mocks = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: mocks.invoke }));
import { desktopApi } from "./desktopApi";
import { webApi } from "./webApi";

describe("desktop and web command contracts", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });
  it("preserves settings responses and each transport's device argument spelling", async () => {
    const settings = snapshotFixture().settings;
    mocks.invoke.mockResolvedValue(settings);
    const fetch = vi.fn(async () => new Response(JSON.stringify(settings)));
    vi.stubGlobal("fetch", fetch);
    for (const deviceId of [undefined, "usb-mic"]) {
      expect(await desktopApi.updateMicrophoneDevice(deviceId)).toEqual(
        await webApi.updateMicrophoneDevice(deviceId),
      );
      expect(mocks.invoke).toHaveBeenLastCalledWith(
        "update_microphone_device",
        { deviceId: deviceId ?? null },
      );
      const init = vi.mocked(globalThis.fetch).mock.calls.at(-1)?.[1];
      expect(JSON.parse(String(init?.body))).toEqual({
        command: "update_microphone_device",
        args: { device_id: deviceId ?? null },
      });
    }
  });
  it("keeps web-only restrictions without emitting native commands", async () => {
    await expect(webApi.quitApp()).rejects.toThrow("Desktop");
    await expect(webApi.startOverlayDrag()).rejects.toThrow("Desktop");
    await webApi.setHotkeyCaptureMode(true);
    expect(mocks.invoke).not.toHaveBeenCalled();
  });
});
