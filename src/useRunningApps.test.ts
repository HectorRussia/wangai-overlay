import { act, renderHook, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "./api";
import { useRunningApps } from "./useRunningApps";
import { previewRunningApps } from "./preview";
vi.mock("./api", () => ({ api: { listRunningApps: vi.fn() } }));
afterEach(() => { cleanup(); vi.useRealTimers(); vi.resetAllMocks(); });
describe("running apps refresh lifecycle", () => {
  it("loads on each open, polls while open, and cancels polling on close", async () => {
    vi.useFakeTimers();
    vi.mocked(api.listRunningApps).mockResolvedValue(previewRunningApps);
    const view = renderHook(({ open }) => useRunningApps(open), { initialProps: { open: false } });
    expect(api.listRunningApps).not.toHaveBeenCalled();
    await act(async () => view.rerender({ open: true }));
    expect(api.listRunningApps).toHaveBeenCalledTimes(1);
    vi.mocked(api.listRunningApps).mockResolvedValue([...previewRunningApps, { ...previewRunningApps[0], id: "new-app", displayName: "New App" }]);
    await act(async () => { vi.advanceTimersByTime(5000); });
    expect(view.result.current.apps).toHaveLength(4);
    view.rerender({ open: false });
    await act(async () => { vi.advanceTimersByTime(10000); });
    expect(api.listRunningApps).toHaveBeenCalledTimes(2);
    await act(async () => view.rerender({ open: true }));
    expect(api.listRunningApps).toHaveBeenCalledTimes(3);
  });
  it("does not overlap requests or accept a late response after closing", async () => {
    vi.useFakeTimers();
    let resolve!: (apps: typeof previewRunningApps) => void;
    vi.mocked(api.listRunningApps).mockReturnValue(new Promise((done) => { resolve = done; }));
    const view = renderHook(({ open }) => useRunningApps(open), { initialProps: { open: true } });
    await act(async () => { vi.advanceTimersByTime(10000); });
    expect(api.listRunningApps).toHaveBeenCalledTimes(1);
    view.rerender({ open: false });
    await act(async () => resolve(previewRunningApps));
    expect(view.result.current.apps).toEqual([]);
  });
});
