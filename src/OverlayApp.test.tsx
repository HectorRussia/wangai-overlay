import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AppSnapshot } from "./types";
import { snapshotFixture } from "./test/fixtures";

const mocks = vi.hoisted(() => ({
  snapshot: undefined as AppSnapshot | undefined,
  setOverlayPresentation: vi.fn(async () => undefined),
  copyLatestReply: vi.fn(async () => true),
}));

vi.mock("./useSnapshot", () => ({
  useSnapshot: () => ({ snapshot: mocks.snapshot }),
}));

vi.mock("./api", () => ({
  api: {
    setOverlayPresentation: mocks.setOverlayPresentation,
    copyLatestReply: mocks.copyLatestReply,
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
    await waitFor(() => expect(mocks.setOverlayPresentation).toHaveBeenCalledWith("expanded"));
  });

  it("collapses to a listening capsule after visible messages expire", async () => {
    const snapshot = snapshotFixture();
    snapshot.history = [];
    snapshot.runtime.listening = false;
    snapshot.runtime.attachedProcess = undefined;
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
      stream: "game",
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
});
