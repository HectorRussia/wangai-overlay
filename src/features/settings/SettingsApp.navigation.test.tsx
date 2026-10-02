import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../../App";
import { SettingsApp } from "./SettingsApp";
import { snapshotFixture } from "../../test/fixtures";
import { useSnapshot } from "../../state/useSnapshot";
import { api } from "../../api";

vi.mock("../../state/useSnapshot", () => ({
  useSnapshot: vi.fn(),
  errorText: (error: unknown) => String(error),
}));
vi.mock("../../api", () => ({
  api: {
    listRunningApps: vi.fn().mockResolvedValue([]),
    listOutputDevices: vi.fn().mockResolvedValue([]),
    listMicrophoneDevices: vi.fn().mockResolvedValue([
      {
        id: "mic-default",
        name: "Microphone (Default)",
        isDefault: true,
        sampleRate: 48000,
        channels: 1,
      },
    ]),
    updateMicrophoneDevice: vi.fn().mockResolvedValue(undefined),
    defaultMicrophoneName: vi.fn().mockResolvedValue("Microphone (Default)"),
    startSession: vi.fn().mockResolvedValue(true),
    toggleListening: vi.fn().mockResolvedValue(false),
    clearListeningSource: vi.fn().mockResolvedValue(undefined),
    restartWorker: vi.fn().mockResolvedValue(undefined),
    updateVad: vi.fn().mockResolvedValue(undefined),
    updateOverlay: vi.fn().mockResolvedValue(undefined),
    updateHotkeys: vi.fn().mockResolvedValue(undefined),
    setHotkeyCaptureMode: vi.fn().mockResolvedValue(undefined),
  },
}));

describe("settings with nullable desktop audio diagnostics", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.history.replaceState(null, "", "/#/settings/overview");
    const snapshot = snapshotFixture();
    // Rust serializes Option::None as JSON null, rather than omitting these fields.
    Object.assign(snapshot.runtime, {
      audioPeakDbfs: null,
      audioRmsDbfs: null,
      audioLastSeenAtMs: null,
      effectiveCapturePid: null,
    });
    vi.mocked(useSnapshot).mockReturnValue({
      snapshot,
      setSnapshot: vi.fn(),
      refresh: vi.fn(),
      loadingError: undefined,
    });
  });
  afterEach(() => {
    cleanup();
    window.history.replaceState(null, "", "/");
  });

  it("replaces the control view with settings in the same window", async () => {
    render(<App />);
    expect(
      screen.getByRole("meter", { name: "ระดับเสียงจากแอป" }),
    ).toHaveAttribute("aria-valuenow", "0");
    expect(
      screen.getByRole("meter", { name: "ระดับเสียงไมโครโฟน" }),
    ).toHaveAttribute("aria-valuenow", "0");
    expect(screen.getByText("รอเสียงจากแอป")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "ตั้งค่า" }));
    expect(window.location.hash).toBe("#/settings/advanced");
    expect(
      screen.queryByRole("dialog", { name: "ตั้งค่า" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("region", { name: "กำลังแปลเสียง" }),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole("heading", { name: "ตั้งค่า" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "เสียง" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Overlay" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "ปุ่มลัด" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("spinbutton", { name: "จบประโยคเมื่อเงียบ" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("combobox", { name: "รับเสียงจาก" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("แก้ปัญหาเสียง")).not.toBeInTheDocument();
    expect(screen.queryByText("ตัวเลือกเสียงขั้นสูง")).not.toBeInTheDocument();
    expect(screen.queryByText("VAD threshold")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("region", { name: "กำลังแปลเสียง" }),
    ).not.toBeInTheDocument();
  });

  it("starts the desktop session from the single-line primary action", async () => {
    const snapshot = vi.mocked(useSnapshot)().snapshot!;
    snapshot.runtime.listening = false;
    render(<SettingsApp activeTab="overview" />);
    fireEvent.click(screen.getByRole("button", { name: "เริ่มใช้งาน" }));
    expect(api.startSession).toHaveBeenCalledOnce();
    expect(await screen.findByText("เริ่มใช้งานแล้ว")).toBeInTheDocument();
  });

  it("shows history in the same window without a covering dialog", async () => {
    render(<App />);
    const history = screen.getByRole("button", { name: "ประวัติคำแปล" });
    history.focus();
    fireEvent.click(history);
    expect(window.location.hash).toBe("#/settings/history");
    expect(
      screen.queryByRole("dialog", { name: "ประวัติคำแปล" }),
    ).not.toBeInTheDocument();
    expect(
      await screen.findByRole("heading", { name: "คำแปลในรอบนี้" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("region", { name: "กำลังแปลเสียง" }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("link", { name: "กลับหน้าหลัก" }));
    expect(
      await screen.findByRole("region", { name: "กำลังแปลเสียง" }),
    ).toBeInTheDocument();
  });

  it("keeps speech endpoint timing out of normal settings", () => {
    render(<SettingsApp activeTab="advanced" />);
    expect(
      screen.queryByRole("spinbutton", { name: "จบประโยคเมื่อเงียบ" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "บันทึกเวลา" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("spinbutton", { name: "คำแปลค้างบนจอ" }),
    ).toBeInTheDocument();
  });

  it("shows caption duration and saves seconds", () => {
    render(<SettingsApp activeTab="advanced" />);
    const duration = screen.getByRole("spinbutton", { name: "คำแปลค้างบนจอ" });
    expect(duration).toHaveValue(30);
    fireEvent.change(duration, { target: { value: "61" } });
    expect(
      screen.getByRole("button", { name: "บันทึก Overlay" }),
    ).toBeDisabled();
    fireEvent.change(duration, { target: { value: "45" } });
    fireEvent.click(screen.getByRole("button", { name: "บันทึก Overlay" }));
    expect(api.updateOverlay).toHaveBeenCalledWith(
      expect.objectContaining({ fadeSeconds: 45 }),
    );
  });

  it("previews background, bubble and text opacity while dragging before save", () => {
    const view = render(<SettingsApp activeTab="advanced" />);
    const preview = view.container.querySelector<HTMLElement>(
      ".settings-appearance-overlay",
    )!;
    expect(preview.style.getPropertyValue("--overlay-opacity")).toBe("0.94");
    expect(preview.style.getPropertyValue("--overlay-bubble-opacity")).toBe(
      "1",
    );
    fireEvent.change(screen.getByRole("slider", { name: /พื้นหลังหน้าต่าง/ }), {
      target: { value: "0.2" },
    });
    fireEvent.change(screen.getByRole("slider", { name: /พื้นกล่องข้อความ/ }), {
      target: { value: "0.6" },
    });
    fireEvent.change(screen.getByRole("slider", { name: /ตัวอักษร/ }), {
      target: { value: "0.8" },
    });
    expect(preview.style.getPropertyValue("--overlay-opacity")).toBe("0.2");
    expect(preview.style.getPropertyValue("--overlay-bubble-opacity")).toBe(
      "0.6",
    );
    expect(preview.style.getPropertyValue("--overlay-text-opacity")).toBe(
      "0.8",
    );
    expect(screen.getByText("เจอกันที่ประตูเหนือ")).toBeInTheDocument();
    expect(screen.getByText("On my way.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "บันทึก Overlay" }));
    expect(api.updateOverlay).toHaveBeenCalledWith(
      expect.objectContaining({
        opacity: 0.2,
        bubbleOpacity: 0.6,
        textOpacity: 0.8,
      }),
    );
  });

  it("keeps an unsaved Overlay draft across repeated WebSocket settings snapshots", () => {
    const view = render(<SettingsApp activeTab="advanced" />);
    fireEvent.change(screen.getByRole("slider", { name: /พื้นหลังหน้าต่าง/ }), {
      target: { value: "0.5" },
    });
    const current = vi.mocked(useSnapshot)();
    vi.mocked(useSnapshot).mockReturnValue({
      ...current,
      snapshot: JSON.parse(JSON.stringify(current.snapshot)),
    });
    view.rerender(<SettingsApp activeTab="advanced" />);
    expect(
      screen.getByRole("slider", { name: /พื้นหลังหน้าต่าง/ }),
    ).toHaveValue("0.5");
    expect(api.updateOverlay).not.toHaveBeenCalled();
  });

  it("keeps the main screen and exposes a failed start for retry", async () => {
    const snapshot = vi.mocked(useSnapshot)().snapshot!;
    snapshot.runtime.listening = false;
    vi.mocked(api.startSession).mockRejectedValueOnce(
      new Error("capture unavailable"),
    );
    render(<SettingsApp activeTab="overview" />);
    fireEvent.click(screen.getByRole("button", { name: "เริ่มใช้งาน" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "capture unavailable",
    );
    expect(window.location.hash).toBe("#/settings/overview");
    expect(screen.getByRole("button", { name: "เริ่มใช้งาน" })).toBeEnabled();
  });

  it("previews the selected number of recent translations immediately", () => {
    const view = render(<SettingsApp activeTab="advanced" />);
    const bubbles = () =>
      view.container.querySelectorAll(
        ".settings-appearance-messages .overlay-bubble",
      );
    const count = screen.getByRole("slider", { name: /จำนวนคำแปลที่แสดง/ });
    expect(bubbles()).toHaveLength(4);
    fireEvent.change(count, { target: { value: "1" } });
    expect(bubbles()).toHaveLength(1);
    expect(screen.getByText("On my way.")).toBeInTheDocument();
    fireEvent.change(count, { target: { value: "5" } });
    expect(bubbles()).toHaveLength(5);
    expect(screen.getByText("ทางซ้ายปลอดภัย")).toBeInTheDocument();
  });

  it("adjusts and saves all four text sizes independently", () => {
    const view = render(<SettingsApp activeTab="advanced" />);
    const preview = view.container.querySelector<HTMLElement>(
      ".settings-appearance-overlay",
    )!;
    const changes = [
      ["คำแปลไทย", "1.4", "--overlay-incoming-translation-scale"],
      ["ต้นฉบับอังกฤษ", "0.8", "--overlay-incoming-original-scale"],
      ["คำแปลอังกฤษ", "1.3", "--overlay-outgoing-translation-scale"],
      ["ต้นฉบับไทย", "1.1", "--overlay-outgoing-original-scale"],
    ] as const;
    for (const [label, value, variable] of changes) {
      fireEvent.change(
        screen.getByRole("slider", { name: new RegExp(label) }),
        { target: { value } },
      );
      expect(preview.style.getPropertyValue(variable)).toBe(value);
    }
    fireEvent.click(screen.getByRole("button", { name: "บันทึก Overlay" }));
    expect(api.updateOverlay).toHaveBeenCalledWith(
      expect.objectContaining({
        incomingTranslationScale: 1.4,
        incomingOriginalScale: 0.8,
        outgoingTranslationScale: 1.3,
        outgoingOriginalScale: 1.1,
      }),
    );
  });

  it("records a pressed shortcut and prevents duplicates before saving", async () => {
    render(<SettingsApp activeTab="advanced" />);
    const button = screen.getByRole("button", {
      name: "เปลี่ยนปุ่มลัด เริ่มหรือหยุดฟัง",
    });
    fireEvent.click(button);
    expect(await screen.findByText("กดปุ่มที่ต้องการ…")).toBeInTheDocument();
    expect(api.setHotkeyCaptureMode).toHaveBeenCalledWith(true);
    fireEvent.keyDown(window, { key: "F9", code: "F9" });
    expect(screen.getByRole("alert")).toHaveTextContent("ปุ่มลัดนี้ถูกใช้แล้ว");
    expect(
      screen.getByRole("button", { name: "บันทึกปุ่มลัด" }),
    ).toBeDisabled();
    fireEvent.keyDown(window, {
      key: "k",
      code: "KeyK",
      ctrlKey: true,
      altKey: true,
    });
    expect(button).toHaveTextContent("Ctrl + Alt + K");
    fireEvent.click(screen.getByRole("button", { name: "บันทึกปุ่มลัด" }));
    expect(api.updateHotkeys).toHaveBeenCalledWith(
      expect.objectContaining({ toggleListening: "Ctrl+Alt+KeyK" }),
    );
    expect(api.setHotkeyCaptureMode).toHaveBeenCalledWith(false);
  });

  it("preserves F10 and allows rebinding copy to a keyboard shortcut", async () => {
    render(<SettingsApp activeTab="advanced" />);
    const copy = screen.getByRole("button", {
      name: "เปลี่ยนปุ่มลัด คัดลอกคำตอบล่าสุด",
    });
    expect(copy).toHaveTextContent("F10");
    fireEvent.click(copy);
    await screen.findByText("กดปุ่มที่ต้องการ…");
    fireEvent.keyDown(window, { key: "F6", code: "F6" });
    fireEvent.click(screen.getByRole("button", { name: "บันทึกปุ่มลัด" }));
    expect(api.updateHotkeys).toHaveBeenCalledWith(
      expect.objectContaining({ copyLatest: "F6" }),
    );
  });

  it("cancels shortcut recording with Escape without changing the saved key", async () => {
    render(<SettingsApp activeTab="advanced" />);
    const button = screen.getByRole("button", {
      name: "เปลี่ยนปุ่มลัด กดพูดเพื่อแปลตอบ",
    });
    fireEvent.click(button);
    expect(await screen.findByText("กดปุ่มที่ต้องการ…")).toBeInTheDocument();
    await act(async () => undefined);
    fireEvent.keyDown(window, { key: "Escape", code: "Escape" });
    expect(button).toHaveTextContent("F9");
    expect(api.setHotkeyCaptureMode).toHaveBeenCalledWith(false);
  });

  it("clears a shortcut error when recording is cancelled", async () => {
    render(<SettingsApp activeTab="advanced" />);
    const button = screen.getByRole("button", {
      name: "เปลี่ยนปุ่มลัด เริ่มหรือหยุดฟัง",
    });
    fireEvent.click(button);
    expect(await screen.findByText("กดปุ่มที่ต้องการ…")).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "F9", code: "F9" });
    expect(screen.getByRole("alert")).toHaveTextContent("ปุ่มลัดนี้ถูกใช้แล้ว");
    fireEvent.keyDown(window, { key: "Escape", code: "Escape" });
    expect(button).toHaveTextContent("F8");
    expect(
      screen.queryByText("ปุ่มลัดนี้ถูกใช้แล้ว เลือกปุ่มอื่น"),
    ).not.toBeInTheDocument();
  });

  it("recognizes Escape without a physical code in the shortcut chooser", async () => {
    render(<SettingsApp activeTab="advanced" />);
    const button = screen.getByRole("button", {
      name: "เปลี่ยนปุ่มลัด เริ่มหรือหยุดฟัง",
    });
    fireEvent.click(button);
    expect(await screen.findByText("กดปุ่มที่ต้องการ…")).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "Escape", code: "Unidentified" });
    expect(button).toHaveTextContent("F8");
    expect(screen.queryByText("กดปุ่มที่ต้องการ…")).not.toBeInTheDocument();
  });

  it("ignores side mouse buttons while recording keyboard shortcuts", async () => {
    render(<SettingsApp activeTab="advanced" />);
    fireEvent.click(
      screen.getByRole("button", { name: "เปลี่ยนปุ่มลัด กดพูดเพื่อแปลตอบ" }),
    );
    await screen.findByText("กดปุ่มที่ต้องการ…");
    fireEvent.mouseUp(window, { button: 3 });
    expect(screen.getByText("กดปุ่มที่ต้องการ…")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "บันทึกปุ่มลัด" }),
    ).toBeDisabled();
    fireEvent.keyDown(window, { key: "Escape", code: "Escape" });
    expect(api.updateHotkeys).not.toHaveBeenCalled();
  });

  it("returns from settings to the overlay without another settings section", () => {
    window.history.replaceState(null, "", "/?preview=1#/settings/advanced");
    render(<SettingsApp activeTab="advanced" />);
    fireEvent.click(screen.getByRole("button", { name: "กลับไป Overlay" }));
    expect(window.location.hash).toBe("#/overlay");
  });

  it("keeps app selection on the main view and clearing inside its picker", () => {
    const snapshot = vi.mocked(useSnapshot)().snapshot!;
    const view = render(
      <SettingsApp activeTab="advanced" advancedSection="audio" />,
    );
    expect(
      screen.getByRole("button", { name: "เปลี่ยนแอป" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "ล้างการเลือก" }),
    ).not.toBeInTheDocument();
    view.rerender(<SettingsApp activeTab="overview" />);
    fireEvent.click(screen.getByRole("button", { name: "เปลี่ยนแอปที่ฟัง" }));
    expect(
      screen.getByRole("button", { name: "ล้างการเลือก" }),
    ).toBeInTheDocument();
    snapshot.settings.listeningSource = undefined;
    view.rerender(<SettingsApp activeTab="overview" />);
    expect(
      screen.queryByRole("button", { name: "ล้างการเลือก" }),
    ).not.toBeInTheDocument();
  });

  it("selects an actual microphone from the main view while keeping Windows default available", async () => {
    vi.mocked(api.listMicrophoneDevices).mockResolvedValue([
      {
        id: "mic-default",
        name: "Microphone (Default)",
        isDefault: true,
        sampleRate: 48000,
        channels: 1,
      },
      {
        id: "mic-usb",
        name: "USB Microphone",
        isDefault: false,
        sampleRate: 48000,
        channels: 1,
      },
    ]);
    render(<SettingsApp activeTab="overview" />);
    fireEvent.click(screen.getByRole("button", { name: "เปลี่ยนไมโครโฟน" }));
    expect(
      await screen.findByRole("dialog", { name: "เลือกไมโครโฟน" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /ใช้ไมค์เริ่มต้นของ Windows/ }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /USB Microphone/ }));
    expect(vi.mocked(api.updateMicrophoneDevice)).toHaveBeenCalledWith(
      "mic-usb",
    );
  });

  it("offers a worker restart only when speech detection is unavailable", () => {
    const snapshot = vi.mocked(useSnapshot)().snapshot!;
    const view = render(<SettingsApp activeTab="advanced" />);
    expect(
      screen.queryByRole("button", { name: "เริ่มตัวตรวจคำพูดใหม่" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "ตรวจเสียง 6 วินาที" }),
    ).not.toBeInTheDocument();
    snapshot.runtime.workerReady = false;
    view.rerender(<SettingsApp activeTab="advanced" />);
    fireEvent.click(
      screen.getByRole("button", { name: "เริ่มตัวตรวจคำพูดใหม่" }),
    );
    expect(api.restartWorker).toHaveBeenCalledOnce();
  });

  it("shows a worker protocol failure on Ready Room and Advanced instead of only a success notice", async () => {
    const snapshot = vi.mocked(useSnapshot)().snapshot!;
    const message =
      "ข้อมูลจากตัวตรวจคำพูดไม่ตรงกับแอป กรุณาเปิด WANGAI จากชุด Portable เดียวกัน";
    Object.assign(snapshot.runtime, { workerReady: false, lastError: message });
    const view = render(<SettingsApp activeTab="overview" />);
    expect(await screen.findByRole("alert")).toHaveTextContent(message);
    expect(screen.getByText("ตัวตรวจคำพูดยังไม่พร้อม")).toBeInTheDocument();
    expect(screen.queryByText("ต้องตรวจสอบ")).not.toBeInTheDocument();
    view.rerender(<SettingsApp activeTab="advanced" advancedSection="audio" />);
    expect(screen.getByRole("alert")).toHaveTextContent(message);
    expect(
      screen.queryByRole("region", { name: "กำลังแปลเสียง" }),
    ).not.toBeInTheDocument();
    Object.assign(snapshot.runtime, {
      workerReady: true,
      lastError: undefined,
    });
    view.rerender(<SettingsApp activeTab="overview" />);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(
      screen.queryByText("ตัวตรวจคำพูดยังไม่พร้อม"),
    ).not.toBeInTheDocument();
  });

  it("names an offline translation service in the session status", () => {
    const snapshot = vi.mocked(useSnapshot)().snapshot!;
    snapshot.runtime.aiService.state = "offline";
    snapshot.runtime.aiService.message = "เชื่อมต่อบริการ AI ไม่สำเร็จ";
    snapshot.runtime.listening = false;
    render(<SettingsApp activeTab="overview" />);
    expect(screen.getByText("เชื่อมต่อไม่ได้")).toBeInTheDocument();
    expect(screen.getByText("กำลังลองเชื่อมต่อใหม่")).toBeVisible();
    expect(screen.getByRole("button", { name: "เริ่มใช้งาน" })).toHaveAttribute(
      "aria-describedby",
      "ready-ai-status",
    );
    expect(screen.getByText("ว่าไง เอไอแปลเสียงสด")).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "แปลเสียงสด" }),
    ).not.toBeInTheDocument();
  });

  it("keeps success feedback and F8 separate while opening settings", async () => {
    window.history.replaceState(
      null,
      "",
      "/?preview=1&ui=success#/settings/overview",
    );
    render(<SettingsApp activeTab="overview" />);
    expect(await screen.findByRole("status")).toHaveTextContent(
      "เริ่มใช้งานแล้ว",
    );
    const stop = screen.getByRole("button", { name: /หยุดใช้งาน/ });
    expect(stop).not.toContainElement(screen.getByRole("status"));
    fireEvent.click(screen.getByRole("button", { name: "ตั้งค่า" }));
    expect(screen.getByText("เริ่มใช้งานแล้ว")).toBeInTheDocument();
    expect(window.location.hash).toBe("#/settings/advanced");
    cleanup();
    render(<SettingsApp activeTab="advanced" />);
    expect(
      screen.getByRole("heading", { name: "ปุ่มลัด" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "AI และคำศัพท์" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("dialog", { name: "ตั้งค่า" }),
    ).not.toBeInTheDocument();
  });

  it("clears a success notice after a short delay", () => {
    window.history.replaceState(
      null,
      "",
      "/?preview=1&ui=success#/settings/overview",
    );
    vi.useFakeTimers();
    try {
      render(<SettingsApp activeTab="overview" />);
      expect(screen.getByRole("status")).toHaveTextContent("เริ่มใช้งานแล้ว");
      act(() => vi.advanceTimersByTime(3500));
      expect(screen.queryByText("เริ่มใช้งานแล้ว")).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });
});
