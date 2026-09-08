import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ReadyRoom } from "./ReadyRoom";
import { snapshotFixture } from "./test/fixtures";

describe("single-source Ready Room", () => {
  afterEach(cleanup);
  it.each(["offline", "degraded", "connecting"] as const)("shows AI %s while keeping stop available", (state) => {
    const snapshot = snapshotFixture();
    snapshot.runtime.aiService = { ...snapshot.runtime.aiService, state, message: "สถานะจาก gateway", retryAfterMs: state === "degraded" ? 5000 : null };
    const props = { settings: snapshot.settings, runtime: snapshot.runtime, history: [], previewMode: false, onToggleListening: vi.fn(), onOpenSourcePicker: vi.fn(), webRuntime: false };
    const view = render(<ReadyRoom {...props} />);
    expect(screen.getByText("สถานะจาก gateway")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /หยุดฟัง · F8/ })).toBeEnabled();
    view.rerender(<ReadyRoom {...props} runtime={{ ...snapshot.runtime, listening: false }} />);
    expect(screen.getByRole("button", { name: /เริ่มฟัง · F8/ })).toBeDisabled();
    expect(screen.queryByText(/งบ Groq/)).not.toBeInTheDocument();
  });

  it("recovers from offline without asking for user credentials", () => {
    const snapshot = snapshotFixture();
    const props = { settings: snapshot.settings, runtime: { ...snapshot.runtime, listening: false }, history: [], previewMode: false, onToggleListening: vi.fn(), onOpenSourcePicker: vi.fn(), webRuntime: true };
    const view = render(<ReadyRoom {...props} runtime={{ ...props.runtime, aiService: { ...props.runtime.aiService, state: "offline" } }} />);
    expect(screen.getByRole("button", { name: /เริ่มฟัง · F8/ })).toBeDisabled();
    view.rerender(<ReadyRoom {...props} />);
    expect(screen.getByRole("button", { name: /เริ่มฟัง · F8/ })).toBeEnabled();
    expect(screen.queryByRole("textbox", { name: /key/i })).not.toBeInTheDocument();
  });
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

  it("displays the selected application dynamically even before listening starts", () => {
    const snapshot = snapshotFixture();
    const props = { settings: snapshot.settings, runtime: { ...snapshot.runtime, listening: false }, history: [], previewMode: false, onToggleListening: vi.fn(), onOpenSourcePicker: vi.fn(), webRuntime: false };
    const view = render(<ReadyRoom {...props} />);
    for (const displayName of ["Discord", "Google Chrome", "My Custom App"]) {
      view.rerender(<ReadyRoom {...props} settings={{ ...snapshot.settings, listeningSource: { ...snapshot.settings.listeningSource!, displayName } }} />);
      expect(screen.getByText(displayName, { exact: true })).toBeInTheDocument();
      expect(screen.queryByText("Mistfall Hunter", { exact: true })).not.toBeInTheDocument();
    }
    view.rerender(<ReadyRoom {...props} settings={{ ...snapshot.settings, listeningSource: undefined }} />);
    expect(screen.getByText("ยังไม่ได้เลือกแอป")).toBeInTheDocument();
    expect(screen.queryByText("My Custom App", { exact: true })).not.toBeInTheDocument();
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
