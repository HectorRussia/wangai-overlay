import { act, cleanup, render, screen, fireEvent } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GlassSurface } from "./GlassSurface";
import { AppSidebar } from "./AppSidebar";

vi.mock("liquid-glass-react", () => ({ default: () => <div data-testid="liquid-effect" /> }));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); window.history.replaceState(null, "", "/"); });
describe("glass as a non-critical enhancement", () => {
  it("keeps controls usable without browser effect support", () => {
    const click = vi.fn();
    const { container } = render(<GlassSurface><button onClick={click}>เปลี่ยน</button></GlassSurface>);
    expect(container.firstChild).toHaveAttribute("data-glass", "css");
    fireEvent.click(screen.getByRole("button"));
    expect(click).toHaveBeenCalledOnce();
    expect(screen.queryByTestId("liquid-effect")).not.toBeInTheDocument();
  });
  it.each(["motion", "contrast", "hidden"])("unmounts experimental effects for %s without remounting controls", async (reason) => {
    window.history.replaceState(null, "", "/?preview=1&glass=liquid");
    let observer: (entries: { isIntersecting: boolean }[]) => void = () => {};
    let listener: () => void = () => {};
    const motion = { matches: false, addEventListener: (_: string, fn: () => void) => { listener = fn; }, removeEventListener: vi.fn() };
    const contrast = { ...motion };
    vi.stubGlobal("matchMedia", vi.fn((q: string) => q.includes("motion") ? motion : contrast));
    vi.stubGlobal("CSS", { supports: () => true });
    vi.stubGlobal("IntersectionObserver", class { constructor(cb: typeof observer) { observer = cb; } observe() {} disconnect() {} });
    Object.defineProperty(document, "hidden", { configurable: true, value: false });
    render(<GlassSurface><button>Always here</button></GlassSurface>);
    const button = screen.getByRole("button");
    await act(async () => observer([{ isIntersecting: true }]));
    expect(await screen.findByTestId("liquid-effect")).toBeInTheDocument();
    act(() => {
      if (reason === "motion") motion.matches = true;
      if (reason === "contrast") contrast.matches = true;
      if (reason === "hidden") Object.defineProperty(document, "hidden", { configurable: true, value: true });
      listener(); document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(screen.queryByTestId("liquid-effect")).not.toBeInTheDocument();
    expect(screen.getByRole("button")).toBe(button);
    Reflect.deleteProperty(document, "hidden");
  });
  it("keeps routes and accessible labels when sidebar collapses", () => {
    const collapse = vi.fn();
    const props = { activeTab: "history" as const, collapsed: false, onCollapse: collapse, webRuntime: false };
    const view = render(<AppSidebar {...props} />);
    expect(screen.getByRole("link", { name: "ประวัติ" })).toHaveAttribute("aria-current", "page");
    fireEvent.click(screen.getByRole("button", { name: "ย่อ Sidebar" })); expect(collapse).toHaveBeenCalledOnce();
    view.rerender(<AppSidebar {...props} collapsed />);
    expect(screen.getByRole("button", { name: "ขยาย Sidebar" })).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByRole("link", { name: "การตั้งค่าขั้นสูง" })).toHaveAttribute("href", "#/settings/advanced/audio");
  });
});
