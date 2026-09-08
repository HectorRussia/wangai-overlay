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
    getGroqModelCatalog: vi.fn().mockResolvedValue([]),
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
});
