import { StrictMode } from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AppSnapshot } from "./types";
import { snapshotFixture } from "./test/fixtures";

const mocks = vi.hoisted(() => ({
  snapshot: vi.fn(), web: vi.fn(() => false), connect: vi.fn(),
  unlisten: [] as ReturnType<typeof vi.fn>[],
}));
vi.mock("./api", () => ({
  api: {
    snapshot: mocks.snapshot,
    listOutputDevices: vi.fn(async () => []),
    getWebCompanionInfo: vi.fn(async () => ({ origin: "http://127.0.0.1", running: true })),
  },
  isWebCompanion: mocks.web,
  connectWebSnapshot: mocks.connect,
}));
vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(async () => {
    const stop = vi.fn(); mocks.unlisten.push(stop); return stop;
  }),
}));
vi.mock("./updates", () => ({ desktopUpdates: { available: () => false } }));
import { SettingsApp } from "./SettingsApp";

const notReady = "state not managed for field `state` on command `get_snapshot`";
const readyRoom = () => screen.queryByRole("region", { name: "พร้อมแล้ว — เลือกแอปหนึ่งตัวแล้วเริ่มฟัง" });
const advance = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });

describe("real SettingsApp bootstrap (without mocking useSnapshot)", () => {
  beforeEach(() => {
    vi.useFakeTimers(); mocks.snapshot.mockReset(); mocks.web.mockReturnValue(false);
    mocks.connect.mockReset(); mocks.unlisten.length = 0;
    window.history.replaceState(null, "", "/#/settings/overview");
    Object.defineProperty(window, "__TAURI_INTERNALS__", { configurable: true, value: {} });
  });
  afterEach(() => {
    cleanup(); vi.useRealTimers();
    Reflect.deleteProperty(window, "__TAURI_INTERNALS__");
  });

  it("recovers from early missing state and actually renders Ready Room", async () => {
    mocks.snapshot.mockRejectedValueOnce(notReady).mockRejectedValueOnce(notReady).mockResolvedValue(snapshotFixture());
    render(<SettingsApp activeTab="overview" />);
    expect(screen.getByText("กำลังเปิด WANGAI")).toBeInTheDocument();
    await advance(2_000);
    expect(readyRoom()).toBeInTheDocument();
    expect(mocks.snapshot).toHaveBeenCalledTimes(3);
    expect(screen.queryByText(notReady)).not.toBeInTheDocument();
  });

  it("stops automatic retries and offers a working keyboard-accessible retry button", async () => {
    mocks.snapshot.mockRejectedValue(notReady);
    render(<SettingsApp activeTab="overview" />);
    await advance(20_000);
    expect(mocks.snapshot).toHaveBeenCalledTimes(5);
    expect(screen.getByRole("alert")).toHaveTextContent("ยังเปิด WANGAI ไม่สำเร็จ");
    const retry = screen.getByRole("button", { name: "ลองใหม่" });
    expect(retry).toHaveFocus();
    expect(document.querySelector(".animate-spin")).toBeNull();
    await advance(60_000);
    expect(mocks.snapshot).toHaveBeenCalledTimes(5);
    mocks.snapshot.mockResolvedValue(snapshotFixture());
    fireEvent.click(retry);
    await advance(0);
    expect(readyRoom()).toBeInTheDocument();
  });

  it("bounds hung IPC calls and ignores their late results", async () => {
    let resolveOld!: (value: AppSnapshot) => void;
    mocks.snapshot.mockImplementationOnce(() => new Promise<AppSnapshot>(resolve => { resolveOld = resolve; }))
      .mockImplementation(() => new Promise(() => {}));
    render(<SettingsApp activeTab="overview" />);
    await advance(20_000);
    expect(screen.getByRole("button", { name: "ลองใหม่" })).toBeInTheDocument();
    expect(mocks.snapshot).toHaveBeenCalledTimes(5);
    await act(async () => { resolveOld(snapshotFixture()); });
    expect(readyRoom()).not.toBeInTheDocument();
    mocks.snapshot.mockResolvedValue(snapshotFixture());
    fireEvent.click(screen.getByRole("button", { name: "ลองใหม่" }));
    await advance(0);
    expect(readyRoom()).toBeInTheDocument();
  });

  it("cancels pending requests, timers and subscriptions when unmounted", async () => {
    mocks.snapshot.mockImplementation(() => new Promise(() => {}));
    const view = render(<SettingsApp activeTab="overview" />);
    await advance(0);
    const calls = mocks.snapshot.mock.calls.length;
    view.unmount();
    await advance(20_000);
    expect(mocks.snapshot).toHaveBeenCalledTimes(calls);
    expect(vi.getTimerCount()).toBe(0);
    expect(mocks.unlisten.every(stop => stop.mock.calls.length === 1)).toBe(true);
  });

  it("survives StrictMode cleanup/remount without a stale bootstrap winning", async () => {
    mocks.snapshot.mockRejectedValueOnce(notReady).mockResolvedValue(snapshotFixture());
    const view = render(<StrictMode><SettingsApp activeTab="overview" /></StrictMode>);
    await advance(2_000);
    expect(readyRoom()).toBeInTheDocument();
    view.unmount();
    expect(vi.getTimerCount()).toBe(0);
    expect(mocks.unlisten.every(stop => stop.mock.calls.length === 1)).toBe(true);
  });

  it("cancels the retry delay when the page closes", async () => {
    mocks.snapshot.mockRejectedValue(notReady);
    const view = render(<SettingsApp activeTab="overview" />);
    await advance(0);
    expect(mocks.snapshot).toHaveBeenCalledOnce();
    view.unmount();
    await advance(20_000);
    expect(mocks.snapshot).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("keeps Web Companion recovery and does not let an older HTTP read overwrite it", async () => {
    mocks.web.mockReturnValue(true);
    let resolveOld!: (value: AppSnapshot) => void;
    let connected!: (value: AppSnapshot) => void;
    const stop = vi.fn();
    mocks.snapshot.mockImplementation(() => new Promise<AppSnapshot>(resolve => { resolveOld = resolve; }));
    mocks.connect.mockImplementation(async onSnapshot => { connected = onSnapshot; return stop; });
    const view = render(<SettingsApp activeTab="overview" />);
    await advance(0);
    await act(async () => { connected(snapshotFixture()); });
    expect(readyRoom()).toBeInTheDocument();
    const stale = snapshotFixture(); stale.settings.listeningSource = undefined;
    await act(async () => { resolveOld(stale); });
    expect(readyRoom()).toBeInTheDocument();
    view.unmount();
    expect(stop).toHaveBeenCalledOnce();
  });
});
