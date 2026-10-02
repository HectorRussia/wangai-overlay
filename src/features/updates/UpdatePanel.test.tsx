import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { UpdatePanel } from "./UpdatePanel";
import { desktopUpdates, type UpdateStatus } from "./updates";
vi.mock("./updates", () => ({ desktopUpdates: { available: vi.fn(), get: vi.fn(), check: vi.fn(), install: vi.fn(), subscribe: vi.fn() } }));
let event: (s: UpdateStatus) => void;
const ready: UpdateStatus = { revision: 1, phase: "available", currentVersion: "0.2.0", newVersion: "0.2.1", notes: "<script>alert(1)</script>", downloadedBytes: 0, canInstall: true, message: "มีเวอร์ชันใหม่" };
beforeEach(() => {
  sessionStorage.clear();
  vi.clearAllMocks();
  vi.mocked(desktopUpdates.available).mockReturnValue(true);
  vi.mocked(desktopUpdates.get).mockResolvedValue(ready);
  vi.mocked(desktopUpdates.subscribe).mockImplementation(async fn => { event = fn; return () => {}; });
  vi.mocked(desktopUpdates.install).mockResolvedValue({ ...ready, revision: 2, phase: "downloading", canInstall: false });
});
afterEach(cleanup);
it("never downloads without confirmation and renders notes as text", async () => {
  const { container } = render(<UpdatePanel />);
  fireEvent.click(await screen.findByRole("button", { name: "อัปเดตเวอร์ชันใหม่" }));
  expect(desktopUpdates.install).not.toHaveBeenCalled();
  expect(container.querySelector("script")).toBeNull();
  expect(screen.getByRole("button", { name: "ยืนยันดาวน์โหลดและติดตั้ง" })).toHaveFocus();
  fireEvent.click(screen.getByRole("button", { name: "ยืนยันดาวน์โหลดและติดตั้ง" }));
  expect(desktopUpdates.install).toHaveBeenCalledOnce();
});
it("Later dismisses only the banner, not manual update access", async () => {
  const view = render(<UpdatePanel compact />);
  fireEvent.click(await screen.findByRole("button", { name: "ไว้ภายหลัง" }));
  expect(screen.queryByRole("region", { name: "อัปเดต WANGAI" })).toBeNull();
  view.unmount();
  const reopened = render(<UpdatePanel compact />);
  await act(async () => {});
  expect(screen.queryByRole("region", { name: "อัปเดต WANGAI" })).toBeNull();
  reopened.unmount();
  render(<UpdatePanel />);
  expect(await screen.findByRole("button", { name: "อัปเดตเวอร์ชันใหม่" })).toBeInTheDocument();
});
it("Escape cancels confirmation without downloading", async () => {
  render(<UpdatePanel />);
  fireEvent.click(await screen.findByRole("button", { name: "อัปเดตเวอร์ชันใหม่" }));
  fireEvent.keyDown(screen.getByRole("button", { name: "ยืนยันดาวน์โหลดและติดตั้ง" }), { key: "Escape" });
  expect(screen.queryByRole("group", { name: "ยืนยันอัปเดต" })).toBeNull();
  expect(desktopUpdates.install).not.toHaveBeenCalled();
});
it("has no native update calls or controls in Web Companion", () => {
  vi.mocked(desktopUpdates.available).mockReturnValue(false);
  render(<UpdatePanel />);
  expect(screen.getByText(/Desktop เท่านั้น/)).toBeInTheDocument();
  expect(screen.queryByRole("button")).toBeNull();
  expect(desktopUpdates.subscribe).not.toHaveBeenCalled();
});
it("displays progress and ignores older snapshots", async () => {
  render(<UpdatePanel />);
  await screen.findByText("มีเวอร์ชันใหม่");
  act(() => event({ ...ready, revision: 3, phase: "downloading", downloadedBytes: 40, totalBytes: 100, canInstall: false }));
  act(() => event(ready));
  expect(screen.getByRole("progressbar")).toHaveAttribute("value", "40");
  expect(screen.getByRole("button", { name: "ตรวจอัปเดต" })).toBeDisabled();
});
it.each(["unpublished", "up_to_date", "error", "disabled"] as const)("shows %s independently of AI", async phase => {
  vi.mocked(desktopUpdates.get).mockResolvedValue({ ...ready, phase, newVersion: null, canInstall: false, message: `update-${phase}` });
  render(<UpdatePanel />);
  expect(await screen.findByText(`update-${phase}`)).toBeInTheDocument();
});
