import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { snapshotFixture } from "./test/fixtures";
const native = vi.hoisted(() => ({ invoke: vi.fn(async () => undefined) }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: native.invoke, isTauri: () => true }));
import { ReadyRoom } from "./ReadyRoom";

afterEach(() => { cleanup(); vi.useRealTimers(); native.invoke.mockClear(); });
describe("Quiet Studio startup and source contract", () => {
  it("acknowledges a rendered main window without AI connectivity or the glass enhancement", async () => {
    vi.useFakeTimers();
    const snapshot = snapshotFixture();
    snapshot.runtime.aiService = { ...snapshot.runtime.aiService, state: "offline" };
    render(<ReadyRoom {...snapshot} previewMode={false} webRuntime={false} onToggleListening={() => {}} onOpenSourcePicker={() => {}} />);
    await act(async () => { await vi.advanceTimersByTimeAsync(50); });
    expect(native.invoke).toHaveBeenCalledWith("portable_frontend_ready");
    expect(document.querySelector('[data-glass="css"]')).toBeInTheDocument();
  });
  it.each([{ previewMode: true, webRuntime: false }, { previewMode: false, webRuntime: true }])("does not acknowledge from a preview or companion ($webRuntime)", async (props) => {
    vi.useFakeTimers();
    render(<ReadyRoom {...snapshotFixture()} {...props} onToggleListening={() => {}} onOpenSourcePicker={() => {}} />);
    await act(async () => { await vi.advanceTimersByTimeAsync(50); });
    expect(native.invoke).not.toHaveBeenCalled();
  });
  it("labels mixed capture honestly and uses the saved hotkey", () => {
    const snapshot = snapshotFixture();
    snapshot.settings.captureMode = "system_output";
    snapshot.settings.hotkeys.toggleListening = "Control+F8";
    render(<ReadyRoom {...snapshot} previewMode webRuntime={false} onToggleListening={() => {}} onOpenSourcePicker={() => {}} />);
    expect(screen.getByRole("region", { name: "แหล่งเสียงที่ฟัง" })).toHaveTextContent("System Output");
    expect(screen.getByRole("button", { name: /Control\+F8/ })).toBeEnabled();
  });
});
