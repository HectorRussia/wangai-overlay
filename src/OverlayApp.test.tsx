import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AppSnapshot } from "./types";
import { snapshotFixture } from "./test/fixtures";

const mocks = vi.hoisted(() => ({
  snapshot: undefined as AppSnapshot | undefined,
  setOverlayPresentation: vi.fn(async () => undefined),
  copyLatestReply: vi.fn(async () => true),
  openSettingsWindow: vi.fn(async () => undefined),
}));

vi.mock("./useSnapshot", () => ({
  useSnapshot: () => ({ snapshot: mocks.snapshot }),
}));

vi.mock("./api", () => ({
  api: {
    setOverlayPresentation: mocks.setOverlayPresentation,
    copyLatestReply: mocks.copyLatestReply,
    openSettingsWindow: mocks.openSettingsWindow,
    startOverlayDrag: vi.fn(async () => undefined),
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
    mocks.setOverlayPresentation.mockClear();
    mocks.openSettingsWindow.mockReset();
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
    await waitFor(() => expect(mocks.setOverlayPresentation).toHaveBeenCalledWith("expanded"));
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

  it("collapses to a listening capsule after visible messages expire", async () => {
    const snapshot = snapshotFixture();
    snapshot.history = [];
    snapshot.runtime.listening = false;
    snapshot.runtime.attachedSource = undefined;
    snapshot.runtime.statusMessage = "พร้อมใช้งาน";
    mocks.snapshot = snapshot;

    render(<OverlayApp />);

    expect(screen.getByText("WANGAI พร้อมแล้ว")).toBeInTheDocument();
    await waitFor(() => expect(mocks.setOverlayPresentation).toHaveBeenCalledWith("collapsed"));
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

  it("opens settings from the startup capsule", async () => {
    mocks.snapshot = snapshotFixture();
    mocks.snapshot.history = [];
    mocks.snapshot.runtime.listening = false;
    render(<OverlayApp />);
    const button = screen.getByRole("button", { name: "เปิดหน้าตั้งค่า WANGAI" });
    expect(button).toBeEnabled();
    fireEvent.click(button);
    await waitFor(() => expect(mocks.openSettingsWindow).toHaveBeenCalledOnce());
  });

  it("requires edit mode to click settings over expanded subtitles", () => {
    const view = render(<OverlayApp />);
    expect(screen.getByRole("button", { name: "เปิดหน้าตั้งค่า WANGAI" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "เปิดหน้าตั้งค่า WANGAI" })).toHaveAttribute("title", "กด F7 เพื่อคลิกตั้งค่า");
    mocks.snapshot = { ...mocks.snapshot!, runtime: { ...mocks.snapshot!.runtime, overlayEditMode: true } };
    view.rerender(<OverlayApp />);
    fireEvent.click(screen.getByRole("button", { name: "เปิดหน้าตั้งค่า WANGAI" }));
    expect(mocks.openSettingsWindow).toHaveBeenCalledOnce();
  });
});
