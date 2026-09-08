import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ReadyRoom } from "./ReadyRoom";
import { snapshotFixture } from "./test/fixtures";

describe("single-source Ready Room", () => {
  afterEach(cleanup);
  it("shows only the listening source and translation rows", () => {
    const snapshot = snapshotFixture();
    render(<ReadyRoom settings={snapshot.settings} runtime={snapshot.runtime} history={snapshot.history} previewMode={false} onToggleListening={vi.fn()} onOpenSourcePicker={vi.fn()} webRuntime={false} />);
    expect(screen.getByText("แหล่งเสียงที่ฟัง")).toBeInTheDocument();
    expect(screen.getByText("การแปล")).toBeInTheDocument();
    expect(screen.queryByText("Voice chat")).not.toBeInTheDocument();
    expect(screen.queryByText("Browser media")).not.toBeInTheDocument();
  });

  it("uses one change action for every application", () => {
    const snapshot = snapshotFixture();
    const open = vi.fn();
    render(<ReadyRoom settings={snapshot.settings} runtime={snapshot.runtime} history={snapshot.history} previewMode={false} onToggleListening={vi.fn()} onOpenSourcePicker={open} webRuntime={false} />);
    fireEvent.click(screen.getByRole("button", { name: "เปลี่ยน" }));
    expect(open).toHaveBeenCalledOnce();
  });

  it("keeps the listening action before the card with or without a notification", () => {
    const snapshot = snapshotFixture();
    const toggle = vi.fn();
    const props = { settings: snapshot.settings, runtime: { ...snapshot.runtime, listening: false }, history: [], previewMode: false, onToggleListening: toggle, onOpenSourcePicker: vi.fn(), webRuntime: false };
    const view = render(<ReadyRoom {...props} />);
    const start = screen.getByRole("button", { name: /เริ่มฟัง · F8/ });
    const title = screen.getByRole("heading", { name: /เลือกแอปหนึ่งตัว/ });
    expect(start.compareDocumentPosition(title) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    fireEvent.click(start);
    expect(toggle).toHaveBeenCalledOnce();
    view.rerender(<ReadyRoom {...props} notification={<div role="alert">{"ข้อความยาว".repeat(100)}</div>} />);
    expect(screen.getByRole("alert")).toBeVisible();
    expect(screen.getByRole("button", { name: /เริ่มฟัง · F8/ })).toBe(start);
    expect(start).toBeEnabled();
  });

  it("retains busy and stop states in the toolbar", () => {
    const snapshot = snapshotFixture();
    const toggle = vi.fn();
    const props = { settings: snapshot.settings, runtime: { ...snapshot.runtime, listening: true }, history: [], previewMode: false, onToggleListening: toggle, onOpenSourcePicker: vi.fn(), webRuntime: false };
    const view = render(<ReadyRoom {...props} busy="listen" />);
    expect(screen.getByRole("button", { name: /หยุดฟัง · F8/ })).toBeDisabled();
    view.rerender(<ReadyRoom {...props} />);
    fireEvent.click(screen.getByRole("button", { name: /หยุดฟัง · F8/ }));
    expect(toggle).toHaveBeenCalledOnce();
  });
});
