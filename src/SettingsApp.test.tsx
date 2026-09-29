import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ReadyRoom } from "./ReadyRoom";
import { snapshotFixture } from "./test/fixtures";

describe("single-source Ready Room", () => {
  afterEach(cleanup);
  it.each(["offline", "degraded", "connecting"] as const)("shows AI %s while keeping stop available", (state) => {
    const snapshot = snapshotFixture();
    snapshot.runtime.aiService = { ...snapshot.runtime.aiService, state, message: "สถานะจาก gateway", retryAfterMs: state === "degraded" ? 5000 : null };
    const props = { settings: snapshot.settings, runtime: snapshot.runtime, previewMode: false, onToggleListening: vi.fn(), onOpenSourcePicker: vi.fn(), webRuntime: false };
    const view = render(<ReadyRoom {...props} />);
    expect(screen.getByText("สถานะจาก gateway")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /หยุดใช้งาน/ })).toBeEnabled();
    view.rerender(<ReadyRoom {...props} runtime={{ ...snapshot.runtime, listening: false }} />);
    expect(screen.getByRole("button", { name: /เริ่มใช้งาน/ })).toBeDisabled();
    expect(screen.queryByText(/งบ Groq/)).not.toBeInTheDocument();
  });

  it("recovers from offline without asking for user credentials", () => {
    const snapshot = snapshotFixture();
    const props = { settings: snapshot.settings, runtime: { ...snapshot.runtime, listening: false }, previewMode: false, onToggleListening: vi.fn(), onOpenSourcePicker: vi.fn(), webRuntime: true };
    const view = render(<ReadyRoom {...props} runtime={{ ...props.runtime, aiService: { ...props.runtime.aiService, state: "offline" } }} />);
    expect(screen.getByRole("button", { name: /เริ่มใช้งาน/ })).toBeDisabled();
    view.rerender(<ReadyRoom {...props} />);
    expect(screen.getByRole("button", { name: /เริ่มใช้งาน/ })).toBeEnabled();
    expect(screen.queryByRole("textbox", { name: /key/i })).not.toBeInTheDocument();
  });
  it("shows incoming audio, our microphone, and translation directions", () => {
    const snapshot = snapshotFixture();
    render(<ReadyRoom settings={snapshot.settings} runtime={snapshot.runtime} previewMode={false} onToggleListening={vi.fn()} onOpenSourcePicker={vi.fn()} webRuntime={false} />);
    expect(screen.getByText("แหล่งเสียงที่ฟัง")).toBeInTheDocument();
    expect(screen.getByText("ไมโครโฟนของเรา")).toBeInTheDocument();
    expect(screen.getByText("การแปล")).toBeInTheDocument();
    expect(screen.queryByText("Voice chat")).not.toBeInTheDocument();
    expect(screen.queryByText("Browser media")).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "บทสนทนาล่าสุด" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "ข้อมูล" })).not.toBeInTheDocument();
    expect(screen.getByText("อังกฤษ → ไทย")).toBeInTheDocument();
    expect(screen.queryByText("บริการ AI กลาง")).not.toBeInTheDocument();
  });

  it("shows the Windows default microphone and the configured reply shortcut, including when no app is selected", () => {
    const snapshot = snapshotFixture();
    snapshot.settings.listeningSource = undefined;
    snapshot.runtime.listening = false;
    snapshot.settings.hotkeys.pushToTalk = "Mouse4";
    const view = render(<ReadyRoom settings={snapshot.settings} runtime={snapshot.runtime} microphoneName="Microphone (USB)" previewMode={false} onToggleListening={vi.fn()} onOpenSourcePicker={vi.fn()} webRuntime={false} />);
    expect(screen.getByText("Microphone (USB)")).toBeInTheDocument();
    expect(screen.getByText("กด Mouse4 ค้างเพื่อพูด")).toBeInTheDocument();
    view.rerender(<ReadyRoom settings={snapshot.settings} runtime={{ ...snapshot.runtime, microphoneActive: true }} microphoneName="Microphone (USB)" previewMode={false} onToggleListening={vi.fn()} onOpenSourcePicker={vi.fn()} webRuntime={false} />);
    expect(screen.getByText("กำลังรับเสียง")).toBeInTheDocument();
  });

  it("warns when Windows has no default microphone and offers a rescan", () => {
    const snapshot = snapshotFixture();
    const refresh = vi.fn();
    render(<ReadyRoom settings={snapshot.settings} runtime={snapshot.runtime} microphoneName={null} onRefreshMicrophone={refresh} previewMode={false} onToggleListening={vi.fn()} onOpenSourcePicker={vi.fn()} webRuntime={false} />);
    expect(screen.getAllByText("ไม่พบไมโครโฟน").length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: "ตรวจใหม่" }));
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("offers system audio only when selected app audio fails, with a way back", () => {
    const snapshot = snapshotFixture();
    const onCaptureModeChange = vi.fn();
    const props = { settings: snapshot.settings, runtime: { ...snapshot.runtime, captureWarning: "ไม่ได้ยินเสียง" }, previewMode: false, onToggleListening: vi.fn(), onOpenSourcePicker: vi.fn(), onCaptureModeChange, webRuntime: false };
    const view = render(<ReadyRoom {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "ลองฟังเสียงทั้งเครื่อง" }));
    expect(onCaptureModeChange).toHaveBeenCalledWith("system_output");
    view.rerender(<ReadyRoom {...props} settings={{ ...snapshot.settings, captureMode: "system_output" }} />);
    expect(screen.getByText(/รวมเสียงจากแอปอื่น/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "กลับไปฟังเฉพาะแอป" }));
    expect(onCaptureModeChange).toHaveBeenCalledWith("process_tree");
  });

  it("uses one change action for every application", () => {
    const snapshot = snapshotFixture();
    const open = vi.fn();
    render(<ReadyRoom settings={snapshot.settings} runtime={snapshot.runtime} previewMode={false} onToggleListening={vi.fn()} onOpenSourcePicker={open} webRuntime={false} />);
    fireEvent.click(screen.getByRole("button", { name: "เปลี่ยนแอปที่ฟัง" }));
    expect(open).toHaveBeenCalledOnce();
  });

  it("makes choosing an app the single primary setup action", () => {
    const snapshot = snapshotFixture();
    const open = vi.fn();
    render(<ReadyRoom settings={{ ...snapshot.settings, listeningSource: undefined }} runtime={{ ...snapshot.runtime, listening: false }} previewMode={false} onToggleListening={vi.fn()} onOpenSourcePicker={open} webRuntime={false} />);
    expect(screen.getByRole("heading", { name: "เลือกแอปเพื่อเริ่ม" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /เริ่มใช้งาน/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "เลือกแอปที่จะฟัง" }));
    expect(open).toHaveBeenCalledOnce();
  });

  it("displays the selected application dynamically even before listening starts", () => {
    const snapshot = snapshotFixture();
    const props = { settings: snapshot.settings, runtime: { ...snapshot.runtime, listening: false }, previewMode: false, onToggleListening: vi.fn(), onOpenSourcePicker: vi.fn(), webRuntime: false };
    const view = render(<ReadyRoom {...props} />);
    for (const displayName of ["Discord", "Google Chrome", "My Custom App"]) {
      view.rerender(<ReadyRoom {...props} settings={{ ...snapshot.settings, listeningSource: { ...snapshot.settings.listeningSource!, displayName } }} />);
      expect(screen.getAllByText(displayName, { exact: true })).toHaveLength(2);
      expect(screen.queryByText("Mistfall Hunter", { exact: true })).not.toBeInTheDocument();
    }
    view.rerender(<ReadyRoom {...props} settings={{ ...snapshot.settings, listeningSource: undefined }} />);
    expect(screen.getByRole("heading", { name: "เลือกแอปเพื่อเริ่ม" })).toBeInTheDocument();
    expect(screen.queryByText("My Custom App", { exact: true })).not.toBeInTheDocument();
  });

  it("keeps the listening action prominent after the heading with or without a notification", () => {
    const snapshot = snapshotFixture();
    const toggle = vi.fn();
    const props = { settings: snapshot.settings, runtime: { ...snapshot.runtime, listening: false }, previewMode: false, onToggleListening: toggle, onOpenSourcePicker: vi.fn(), webRuntime: false };
    const view = render(<ReadyRoom {...props} />);
    const start = screen.getByRole("button", { name: /เริ่มใช้งาน/ });
    const title = screen.getByRole("heading", { name: "แปลเสียงสด" });
    expect(title.compareDocumentPosition(start) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    fireEvent.click(start);
    expect(toggle).toHaveBeenCalledOnce();
    view.rerender(<ReadyRoom {...props} notification={<div role="alert">{"ข้อความยาว".repeat(100)}</div>} />);
    expect(screen.getByRole("alert")).toBeVisible();
    expect(screen.getByRole("button", { name: /เริ่มใช้งาน/ })).toBe(start);
    expect(start).toBeEnabled();
  });

  it("retains busy and stop states in the toolbar", () => {
    const snapshot = snapshotFixture();
    const toggle = vi.fn();
    const props = { settings: snapshot.settings, runtime: { ...snapshot.runtime, listening: true }, previewMode: false, onToggleListening: toggle, onOpenSourcePicker: vi.fn(), webRuntime: false };
    const view = render(<ReadyRoom {...props} busy="listen" />);
    expect(screen.getByRole("button", { name: /หยุดใช้งาน/ })).toBeDisabled();
    view.rerender(<ReadyRoom {...props} />);
    fireEvent.click(screen.getByRole("button", { name: /หยุดใช้งาน/ }));
    expect(toggle).toHaveBeenCalledOnce();
  });
});
