import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AppSnapshot } from "./types";
import { snapshotFixture } from "./test/fixtures";

const mocks = vi.hoisted(() => ({
  snapshot: undefined as AppSnapshot | undefined,
  copyLatestReply: vi.fn(async () => true),
  openSettingsWindow: vi.fn(async () => undefined),
  startOverlayDrag: vi.fn(async () => undefined),
  setOverlayEditMode: vi.fn(async () => true),
}));

vi.mock("./useSnapshot", () => ({
  useSnapshot: () => ({ snapshot: mocks.snapshot }),
}));

vi.mock("./api", () => ({
  api: {
    copyLatestReply: mocks.copyLatestReply,
    openSettingsWindow: mocks.openSettingsWindow,
    startOverlayDrag: mocks.startOverlayDrag,
    setOverlayEditMode: mocks.setOverlayEditMode,
  },
}));

import { OverlayApp } from "./OverlayApp";

describe("WANGAI overlay", () => {
  beforeEach(() => {
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      configurable: true,
      value: {},
    });
    mocks.snapshot = snapshotFixture();
    mocks.openSettingsWindow.mockReset();
    mocks.startOverlayDrag.mockReset();
    mocks.setOverlayEditMode.mockClear();
  });

  afterEach(() => {
    cleanup();
    Reflect.deleteProperty(window, "__TAURI_INTERNALS__");
  });

  it("shows translation first and original second for both sides", async () => {
    render(<OverlayApp />);

    expect(screen.getByText("ไปรวมกันที่ประตูเหนือ").tagName).toBe("STRONG");
    expect(screen.getByText("Join us at the north gate.").tagName).toBe("SPAN");
    expect(screen.getByText("On my way.").tagName).toBe("STRONG");
    expect(screen.getByText("กำลังไป").tagName).toBe("SPAN");
    expect(screen.getByText("Mistfall Hunter")).toBeInTheDocument();
  });

  it("applies the three appearance layers independently in the real overlay", () => {
    const snapshot = snapshotFixture();
    snapshot.settings.overlay.opacity = 0.2;
    snapshot.settings.overlay.bubbleOpacity = 0.85;
    snapshot.settings.overlay.textOpacity = 0.9;
    mocks.snapshot = snapshot;
    const view = render(<OverlayApp />);
    const overlay = view.container.querySelector<HTMLElement>(".overlay-card")!;
    expect(overlay.style.getPropertyValue("--overlay-opacity")).toBe("0.2");
    expect(overlay.style.getPropertyValue("--overlay-bubble-opacity")).toBe("0.85");
    expect(overlay.style.getPropertyValue("--overlay-text-opacity")).toBe("0.9");
  });

  it("uses the saved text sizes for each side and text role", () => {
    const snapshot = snapshotFixture();
    snapshot.settings.overlay.incomingTranslationScale = 1.4;
    snapshot.settings.overlay.incomingOriginalScale = 0.8;
    snapshot.settings.overlay.outgoingTranslationScale = 1.3;
    snapshot.settings.overlay.outgoingOriginalScale = 1.1;
    mocks.snapshot = snapshot;
    const view = render(<OverlayApp />);
    const overlay = view.container.querySelector<HTMLElement>(".overlay-card")!;
    expect(overlay.style.getPropertyValue("--overlay-incoming-translation-scale")).toBe("1.4");
    expect(overlay.style.getPropertyValue("--overlay-incoming-original-scale")).toBe("0.8");
    expect(overlay.style.getPropertyValue("--overlay-outgoing-translation-scale")).toBe("1.3");
    expect(overlay.style.getPropertyValue("--overlay-outgoing-original-scale")).toBe("1.1");
  });

  it("keeps copy controls quiet and only shows the icon while the overlay is editable", async () => {
    const snapshot = snapshotFixture();
    mocks.snapshot = snapshot;
    const view = render(<OverlayApp />);
    expect(screen.queryByText(/F10 Copy|Copied|Copy/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "คัดลอกคำตอบล่าสุด" })).not.toBeInTheDocument();
    mocks.snapshot = { ...snapshot, runtime: { ...snapshot.runtime, overlayEditMode: true } };
    view.rerender(<OverlayApp />);
    const button = screen.getByRole("button", { name: "คัดลอกคำตอบล่าสุด" });
    expect(button).toHaveTextContent("");
    fireEvent.click(button);
    await waitFor(() => expect(mocks.copyLatestReply).toHaveBeenCalled());
  });

  it("names an offline AI service instead of claiming it is listening", () => {
    const snapshot = snapshotFixture();
    snapshot.runtime.aiService = { ...snapshot.runtime.aiService, state: "offline", message: "เชื่อมต่อบริการ AI ไม่สำเร็จ" };
    mocks.snapshot = snapshot;
    render(<OverlayApp />);
    expect(screen.getByRole("alert")).toHaveTextContent("เชื่อมต่อบริการ AI ไม่สำเร็จ");
    expect(screen.getByText("บริการแปลเชื่อมต่อไม่ได้")).toBeInTheDocument();
    expect(screen.queryByText("กำลังฟัง Mistfall Hunter")).not.toBeInTheDocument();
  });

  it("replaces incoming silence warnings with a live audio meter", () => {
    const snapshot = snapshotFixture();
    snapshot.runtime.captureWarning = "ยังไม่ได้รับเสียงจากแอปที่เลือก";
    snapshot.runtime.audioRmsDbfs = -96;
    snapshot.runtime.audioPeakDbfs = -96;
    mocks.snapshot = snapshot;
    render(<OverlayApp />);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByText("ยังไม่ได้รับเสียงจากแอปที่เลือก")).not.toBeInTheDocument();
    expect(screen.getByRole("meter", { name: "ระดับเสียงจากแอป" })).toHaveAttribute("aria-valuenow", "0");
  });

  it("shows captured app audio in the overlay meter", () => {
    render(<OverlayApp />);
    const meter = screen.getByRole("meter", { name: "ระดับเสียงจากแอป" });
    expect(Number(meter.getAttribute("aria-valuenow"))).toBeGreaterThan(0);
    expect(meter.querySelector("svg path")).toHaveAttribute("d", "M2 3 L8 17 L15 5 L22 17 L28 3");
    expect(document.querySelector(".overlay-audio-sensor")).not.toBeInTheDocument();
  });

  it("offers a full-text reading mode for long subtitles", () => {
    const snapshot = snapshotFixture();
    snapshot.history[0].translatedText = "ข้อความแปลยาวมาก".repeat(40);
    mocks.snapshot = snapshot;
    const view = render(<OverlayApp />);
    expect(screen.getByText("F9")).toBeInTheDocument();
    expect(view.container.querySelectorAll(".overlay-bubble")).toHaveLength(1);
    mocks.snapshot = { ...snapshot, runtime: { ...snapshot.runtime, overlayEditMode: true } };
    view.rerender(<OverlayApp />);
    expect(view.container.querySelector(".overlay-messages.is-readable")).toBeInTheDocument();
    expect(view.container.querySelectorAll(".overlay-bubble")).toHaveLength(2);
    expect(screen.getByText("ข้อความแปลยาวมาก".repeat(40))).toBeInTheDocument();
  });

  it("labels voice chat and mixed subtitles by source", () => {
    const snapshot = snapshotFixture();
    snapshot.history = [
      {
        segmentId: "voice-1",
        stream: "incoming",
        sourceDisplayName: "Discord",
        originalLanguage: "en",
        originalText: "Push now",
        translatedText: "บุกตอนนี้",
        status: "success",
        createdAtMs: Date.now(),
      },
      {
        segmentId: "mixed-1",
        stream: "incoming",
        sourceDisplayName: "MIXED",
        originalLanguage: "en",
        originalText: "Fallback audio",
        translatedText: "เสียงรวม",
        status: "success",
        createdAtMs: Date.now() - 1,
      },
    ];
    mocks.snapshot = snapshot;

    render(<OverlayApp />);

    expect(screen.getByText("Discord")).toBeInTheDocument();
    expect(screen.getByText("MIXED")).toBeInTheDocument();
  });

  it("keeps the same overlay when no captions are visible", () => {
    const snapshot = snapshotFixture();
    snapshot.history = [];
    snapshot.runtime.listening = false;
    snapshot.runtime.attachedSource = undefined;
    snapshot.runtime.statusMessage = "พร้อมใช้งาน";
    mocks.snapshot = snapshot;

    render(<OverlayApp />);

    expect(screen.getByText("พร้อมใช้งาน")).toBeInTheDocument();
    expect(document.querySelector(".overlay-card")).toBeInTheDocument();
  });

  it("renders an English partial as a live row", () => {
    const snapshot = snapshotFixture();
    snapshot.history = [];
    snapshot.partial = {
      segmentId: "game-live",
      stream: "incoming",
      language: "en",
      text: "Enemy behind us",
      kind: "partial",
      startedAtMs: Date.now() - 500,
      endedAtMs: Date.now(),
    };
    mocks.snapshot = snapshot;

    render(<OverlayApp />);

    expect(screen.getByText("LIVE")).toBeInTheDocument();
    expect(screen.getByText("Enemy behind us")).toHaveAttribute("lang", "en");
  });

  it("requires edit mode to click settings over expanded subtitles", () => {
    const view = render(<OverlayApp />);
    expect(screen.getByText("F9")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "เปิดหน้าตั้งค่า WANGAI" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "เปิดหน้าตั้งค่า WANGAI" })).toHaveAttribute("title", "กด F7 เพื่อคลิกตั้งค่า");
    mocks.snapshot = { ...mocks.snapshot!, runtime: { ...mocks.snapshot!.runtime, overlayEditMode: true } };
    view.rerender(<OverlayApp />);
    expect(screen.getByText("F9")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "เปิดหน้าตั้งค่า WANGAI" }));
    expect(mocks.openSettingsWindow).toHaveBeenCalledOnce();
  });

  it("drags the expanded titlebar in placement mode, excluding controls and right clicks", () => {
    const view = render(<OverlayApp />);
    const header = view.container.querySelector("header")!;
    fireEvent.mouseDown(header, { button: 0 });
    expect(mocks.startOverlayDrag).not.toHaveBeenCalled();
    mocks.snapshot = { ...mocks.snapshot!, runtime: { ...mocks.snapshot!.runtime, overlayEditMode: true } };
    view.rerender(<OverlayApp />);
    fireEvent.mouseDown(header, { button: 2 });
    fireEvent.mouseDown(screen.getByRole("button", { name: "เปิดหน้าตั้งค่า WANGAI" }), { button: 0 });
    expect(mocks.startOverlayDrag).not.toHaveBeenCalled();
    fireEvent.mouseDown(header.querySelector("span")!, { button: 0 });
    expect(mocks.startOverlayDrag).toHaveBeenCalledTimes(1);
    fireEvent.mouseDown(screen.getByRole("button", { name: "ล็อกตำแหน่ง Overlay" }), { button: 0 });
    expect(mocks.startOverlayDrag).toHaveBeenCalledTimes(1);
  });

  it("keeps the full overlay while listening even after captions expire", () => {
    const snapshot = snapshotFixture();
    snapshot.history = [];
    mocks.snapshot = snapshot;
    render(<OverlayApp />);
    expect(document.querySelector(".overlay-card")).toBeInTheDocument();
  });

  it("keeps the full overlay without a capture warning banner", () => {
    const snapshot = snapshotFixture();
    snapshot.history = [];
    snapshot.runtime.listening = false;
    snapshot.runtime.captureWarning = "แอปที่เลือกยังไม่มีเสียง";
    mocks.snapshot = snapshot;
    render(<OverlayApp />);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("meter", { name: "ระดับเสียงจากแอป" })).toHaveAttribute("aria-valuenow", "0");
    expect(document.querySelector(".overlay-card")).toBeInTheDocument();
  });

  it("finishes placement with one visible button", async () => {
    mocks.snapshot = { ...mocks.snapshot!, runtime: { ...mocks.snapshot!.runtime, overlayEditMode: true } };
    render(<OverlayApp />);
    fireEvent.click(screen.getByRole("button", { name: "ล็อกตำแหน่ง Overlay" }));
    await waitFor(() => expect(mocks.setOverlayEditMode).toHaveBeenCalledWith(false));
  });

  it("uses the configured movement shortcut in the visible hint", () => {
    mocks.snapshot!.settings.hotkeys.editOverlay = "F6";
    const view = render(<OverlayApp />);
    expect(screen.getByRole("button", { name: "เปิดหน้าตั้งค่า WANGAI" })).toHaveAttribute("title", "กด F6 เพื่อคลิกตั้งค่า");
    expect(view.container.querySelector("header")).toHaveAttribute("title", "กด F6 เพื่ออ่านเต็มหรือย้าย Overlay");
  });
});
