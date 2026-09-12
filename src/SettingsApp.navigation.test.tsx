import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";
import { SettingsApp } from "./SettingsApp";
import { snapshotFixture } from "./test/fixtures";
import { useSnapshot } from "./useSnapshot";

vi.mock("./useSnapshot", () => ({
  useSnapshot: vi.fn(),
  errorText: (error: unknown) => String(error),
}));
vi.mock("./api", () => ({
  api: {
    listRunningApps: vi.fn().mockResolvedValue([]),
    listOutputDevices: vi.fn().mockResolvedValue([]),
  },
}));

describe("settings with nullable desktop audio diagnostics", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "/#/settings/overview");
    const snapshot = snapshotFixture();
    // Rust serializes Option::None as JSON null, rather than omitting these fields.
    Object.assign(snapshot.runtime, {
      audioPeakDbfs: null,
      audioRmsDbfs: null,
      audioLastSeenAtMs: null,
      effectiveCapturePid: null,
    });
    vi.mocked(useSnapshot).mockReturnValue({ snapshot, setSnapshot: vi.fn(), refresh: vi.fn(), loadingError: undefined });
  });
  afterEach(() => {
    cleanup();
    window.history.replaceState(null, "", "/");
  });

  it("opens Advanced from Ready Room before any audio frames arrive", async () => {
    render(<App />);
    expect(screen.getByRole("meter", { name: "ระดับเสียงขาเข้า" })).toHaveAttribute("aria-valuenow", "0");
    expect(screen.getByText("ยังไม่มี audio frame")).toBeInTheDocument();
    const link = screen.getByRole("link", { name: "การตั้งค่าขั้นสูง" });
    fireEvent.click(link);
    await act(async () => {
      window.location.hash = link.getAttribute("href")!;
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    });
    expect(await screen.findByRole("heading", { name: "Incoming audio diagnostics" })).toBeInTheDocument();
    expect(screen.getByText("ยังไม่มี audio frame")).toBeInTheDocument();
    expect(screen.getByRole("slider", { name: /VAD threshold/ })).toHaveValue("0.5");
    expect(screen.getByRole("link", { name: "กลับ Ready Room" })).toBeInTheDocument();
  });

  it.each([null, undefined, -31.25, 0])("renders Advanced with peak %s", async (peak) => {
    const snapshot = vi.mocked(useSnapshot)().snapshot!;
    Object.assign(snapshot.runtime, { audioPeakDbfs: peak });
    render(<SettingsApp activeTab="advanced" />);
    expect(await screen.findByText(peak == null ? "ยังไม่มี audio frame" : `${peak.toFixed(1)} dBFS`)).toBeInTheDocument();
  });

  it("shows a worker protocol failure on Ready Room and Advanced instead of only a success notice", async () => {
    const snapshot = vi.mocked(useSnapshot)().snapshot!;
    const message = "ข้อมูลจากตัวตรวจคำพูดไม่ตรงกับแอป กรุณาเปิด WANGAI จากชุด Portable เดียวกัน";
    Object.assign(snapshot.runtime, { workerReady: false, lastError: message });
    const view = render(<SettingsApp activeTab="overview" />);
    expect(await screen.findByRole("alert")).toHaveTextContent(message);
    expect(screen.getByText("ตัวตรวจคำพูดยังไม่พร้อม")).toBeInTheDocument();
    expect(screen.getByText("ต้องตรวจสอบ")).toBeInTheDocument();
    view.rerender(<SettingsApp activeTab="advanced" advancedSection="audio" />);
    expect(screen.getByRole("alert")).toHaveTextContent(message);
    Object.assign(snapshot.runtime, { workerReady: true, lastError: undefined });
    view.rerender(<SettingsApp activeTab="overview" />);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByText("ตัวตรวจคำพูดยังไม่พร้อม")).not.toBeInTheDocument();
  });

  it("keeps success feedback and F8 separate and preserves feedback through navigation", async () => {
    window.history.replaceState(null, "", "/?preview=1&ui=success#/settings/overview");
    const view = render(<SettingsApp activeTab="overview" />);
    expect(await screen.findByRole("status")).toHaveTextContent("เริ่มฟังแล้ว");
    const stop = screen.getByRole("button", { name: /หยุดฟัง · F8/ });
    expect(stop).not.toContainElement(screen.getByRole("status"));
    view.rerender(<SettingsApp activeTab="advanced" advancedSection="ai" />);
    expect(screen.getByText("เริ่มฟังแล้ว")).toBeInTheDocument();
    expect(screen.getByRole("status", { name: "สถานะบริการ AI" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Groq API key")).not.toBeInTheDocument();
    expect(screen.getByText("ใช้บริการกลาง ไม่ต้องใส่ API key หรือเลือกโมเดลเอง")).toBeInTheDocument();
    expect(screen.getByText("server-configured-model")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "AI & Terms" })).toHaveAttribute("aria-current", "page");
  });
});
