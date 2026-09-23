import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OverlayTranscript } from "./OverlayTranscript";

describe("readable overlay overflow", () => {
  let totalHeight: number;
  let latestOffset: number;
  let resize: () => void;
  const disconnect = vi.fn();
  const props = { contentKey: "first", fontScale: 1, editMode: true, editShortcut: "F6" };
  const messages = <><article data-overlay-message>ข้อความก่อนหน้า</article><article data-overlay-message>ข้อความแปลยาวที่ต้องอ่านได้ครบ พร้อมต้นฉบับภาษาอังกฤษ</article></>;

  beforeEach(() => {
    totalHeight = 500;
    latestOffset = 420;
    disconnect.mockClear();
    vi.stubGlobal("ResizeObserver", class {
      constructor(callback: () => void) { resize = callback; }
      observe() {}
      disconnect = disconnect;
    });
    vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(160);
    vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockImplementation(function (this: HTMLElement) {
      return this.classList.contains("overlay-transcript") ? totalHeight : 0;
    });
    vi.spyOn(HTMLElement.prototype, "offsetTop", "get").mockImplementation(function (this: HTMLElement) {
      return this.hasAttribute("data-overlay-message") ? latestOffset : 0;
    });
  });
  afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  it("follows the complete latest short phrase and exposes keyboard scrolling", () => {
    render(<OverlayTranscript {...props}>{messages}</OverlayTranscript>);
    expect(screen.getByRole("region", { name: "ข้อความคำแปล" }).scrollTop).toBe(340);
    expect(screen.getByRole("region")).toHaveAttribute("tabindex", "0");
    expect(screen.getByText("เลื่อนเพื่ออ่านข้อความทั้งหมด")).toBeInTheDocument();
    expect(screen.getByText("ข้อความแปลยาวที่ต้องอ่านได้ครบ พร้อมต้นฉบับภาษาอังกฤษ")).toBeInTheDocument();
  });

  it("starts a taller-than-window newest phrase at its first line, not its bottom", () => {
    latestOffset = 240;
    render(<OverlayTranscript {...props}>{messages}</OverlayTranscript>);
    expect(screen.getByRole("region").scrollTop).toBe(240);
    act(() => resize());
    expect(screen.getByRole("region").scrollTop).toBe(240);
  });

  it("keeps the edit-mode reader's position on new text until they return to the end", () => {
    const view = render(<OverlayTranscript {...props}>{messages}</OverlayTranscript>);
    const region = screen.getByRole("region");
    region.scrollTop = 10;
    fireEvent.scroll(region);
    totalHeight = 700;
    latestOffset = 620;
    view.rerender(<OverlayTranscript {...props} contentKey="second">{messages}</OverlayTranscript>);
    expect(region.scrollTop).toBe(10);
    region.scrollTop = 540;
    fireEvent.scroll(region);
    totalHeight = 800;
    latestOffset = 720;
    view.rerender(<OverlayTranscript {...props} contentKey="third">{messages}</OverlayTranscript>);
    expect(region.scrollTop).toBe(640);
  });

  it("uses the saved unlock shortcut and keeps the locked transcript out of tab order", () => {
    render(<OverlayTranscript {...props} editMode={false}>{messages}</OverlayTranscript>);
    expect(screen.getByText("กด F6 เพื่อเลื่อนอ่านข้อความทั้งหมด")).toBeInTheDocument();
    expect(screen.getByRole("region")).not.toHaveAttribute("tabindex");
  });

  it("remeasures after resize, removes unnecessary hints, and disconnects observers", () => {
    const view = render(<OverlayTranscript {...props}>{messages}</OverlayTranscript>);
    totalHeight = 120;
    act(() => resize());
    expect(screen.getByRole("region").scrollTop).toBe(0);
    expect(screen.queryByText("เลื่อนเพื่ออ่านข้อความทั้งหมด")).not.toBeInTheDocument();
    view.unmount();
    expect(disconnect).toHaveBeenCalledOnce();
  });

  it("follows again after locking and recalculates on font-scale changes", () => {
    const view = render(<OverlayTranscript {...props}>{messages}</OverlayTranscript>);
    const region = screen.getByRole("region");
    region.scrollTop = 10;
    fireEvent.scroll(region);
    totalHeight = 900;
    latestOffset = 500;
    view.rerender(<OverlayTranscript {...props} editMode={false} fontScale={1.8}>{messages}</OverlayTranscript>);
    expect(region.scrollTop).toBe(500);
  });
});
