import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SettingsApp } from "./SettingsApp";
import { api } from "./api";
import { useSnapshot } from "./useSnapshot";
import { snapshotFixture } from "./test/fixtures";
import { previewRunningApps } from "./preview";

vi.mock("./useSnapshot", () => ({ useSnapshot: vi.fn(), errorText: (error: unknown) => String(error) }));
vi.mock("./updates", () => ({ desktopUpdates: { available: () => false } }));
vi.mock("@tauri-apps/api/core", () => ({ isTauri: () => false }));
vi.mock("./api", () => ({ api: {
  listOutputDevices: vi.fn(async () => []),
  listRunningApps: vi.fn(),
  getWebCompanionInfo: vi.fn(async () => ({ origin: "http://127.0.0.1:1431", running: true })),
  toggleListening: vi.fn(async () => true),
  selectListeningSource: vi.fn(),
  updateHotkeys: vi.fn(), updateOverlay: vi.fn(), updateVad: vi.fn(), updateGlossary: vi.fn(),
  quitApp: vi.fn(async () => undefined), openWebCompanion: vi.fn(async () => undefined),
} }));

describe.each(["desktop", "web"] as const)("Mat UI preserves %s command bindings", (runtime) => {
  let snapshot: ReturnType<typeof snapshotFixture>;
  const refresh = vi.fn(async () => undefined);

  beforeEach(() => {
    vi.clearAllMocks();
    window.history.replaceState(null, "", "/#/settings/overview");
    if (runtime === "desktop") Object.defineProperty(window, "__TAURI_INTERNALS__", { configurable: true, value: {} });
    else Reflect.deleteProperty(window, "__TAURI_INTERNALS__");
    snapshot = snapshotFixture();
    vi.mocked(api.listRunningApps).mockResolvedValue(previewRunningApps);
    vi.mocked(useSnapshot).mockReturnValue({ snapshot, setSnapshot: vi.fn(), refresh, loadingError: undefined });
  });
  afterEach(() => { cleanup(); Reflect.deleteProperty(window, "__TAURI_INTERNALS__"); });

  it("starts and stops with the original toggle command, without changing window mode", async () => {
    snapshot.runtime.listening = false;
    const view = render(<SettingsApp activeTab="overview" />);
    fireEvent.click(screen.getByRole("button", { name: /เริ่มฟัง · F8/ }));
    await waitFor(() => expect(refresh).toHaveBeenCalledOnce());
    expect(api.toggleListening).toHaveBeenCalledWith();
    snapshot.runtime.listening = true;
    view.rerender(<SettingsApp activeTab="overview" />);
    fireEvent.click(screen.getByRole("button", { name: /หยุดฟัง · F8/ }));
    await waitFor(() => expect(api.toggleListening).toHaveBeenCalledTimes(2));
    expect(api.quitApp).not.toHaveBeenCalled();
  });

  it("selects an app through the original picker and refreshes the snapshot", async () => {
    render(<SettingsApp activeTab="overview" />);
    fireEvent.click(screen.getByRole("button", { name: "เปลี่ยน" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(await within(dialog).findByRole("button", { name: /Discord\.exe/i }));
    await waitFor(() => expect(api.selectListeningSource).toHaveBeenCalledWith(previewRunningApps[1].roots[0]));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(refresh).toHaveBeenCalledOnce();
    expect(screen.getByRole("status")).toHaveTextContent("เลือก Discord แล้ว");
  });

  it("keeps hotkey and overlay edits local until their Save buttons are pressed", async () => {
    render(<SettingsApp activeTab="advanced" advancedSection="controls" />);
    fireEvent.change(screen.getByRole("textbox", { name: "toggleListening" }), { target: { value: "F6" } });
    fireEvent.change(screen.getByRole("slider", { name: /Opacity/ }), { target: { value: "0.7" } });
    expect(api.updateHotkeys).not.toHaveBeenCalled();
    expect(api.updateOverlay).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "บันทึก Hotkeys" }));
    await waitFor(() => expect(api.updateHotkeys).toHaveBeenCalledWith({ ...snapshot.settings.hotkeys, toggleListening: "F6" }));
    fireEvent.click(screen.getByRole("button", { name: "บันทึก Overlay" }));
    await waitFor(() => expect(api.updateOverlay).toHaveBeenCalledWith({ ...snapshot.settings.overlay, opacity: 0.7 }));
    expect(screen.queryByRole("button", { name: "เปลี่ยนไมโครโฟน" })).not.toBeInTheDocument();
  });

  it("retains explicit VAD and glossary saves and all advanced routes", async () => {
    const view = render(<SettingsApp activeTab="advanced" advancedSection="audio" />);
    fireEvent.change(screen.getByRole("slider", { name: /VAD threshold/ }), { target: { value: "0.6" } });
    expect(api.updateVad).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "บันทึกและ Restart" }));
    await waitFor(() => expect(api.updateVad).toHaveBeenCalledWith({ ...snapshot.settings.vad, processTree: { ...snapshot.settings.vad.processTree, vadThreshold: 0.6 } }));
    view.rerender(<SettingsApp activeTab="advanced" advancedSection="ai" />);
    const terms = screen.getByRole("heading", { name: "คำศัพท์เกม" }).closest("section")!;
    fireEvent.change(within(terms).getAllByRole("textbox")[1], { target: { value: "มิสต์ฟอลล์" } });
    expect(api.updateGlossary).not.toHaveBeenCalled();
    fireEvent.click(within(terms).getByRole("button", { name: "บันทึก" }));
    await waitFor(() => expect(api.updateGlossary).toHaveBeenCalledWith([{ source: "Mistfall", target: "มิสต์ฟอลล์" }]));
    expect(screen.getByRole("link", { name: "AI & Terms" })).toHaveAttribute("href", "#/settings/advanced/ai");
    expect(screen.getByRole("link", { name: "Controls & Overlay" })).toHaveAttribute("href", "#/settings/advanced/controls");
  });

  it("shows command errors and leaves Stop available for retry", async () => {
    vi.mocked(api.toggleListening).mockRejectedValueOnce(new Error("capture unavailable"));
    render(<SettingsApp activeTab="overview" />);
    fireEvent.click(screen.getByRole("button", { name: /หยุดฟัง · F8/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent("capture unavailable");
    expect(screen.getByRole("button", { name: /หยุดฟัง · F8/ })).toBeEnabled();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("exposes desktop exit and Web App actions only on Desktop", async () => {
    render(<SettingsApp activeTab="overview" />);
    if (runtime === "desktop") {
      fireEvent.click(screen.getByRole("button", { name: "เปิด Web App" }));
      await waitFor(() => expect(api.openWebCompanion).toHaveBeenCalledOnce());
      fireEvent.click(screen.getByRole("button", { name: "ออกจากโปรแกรม" }));
      expect(api.quitApp).toHaveBeenCalledOnce();
    } else {
      expect(screen.queryByRole("button", { name: "เปิด Web App" })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "ออกจากโปรแกรม" })).not.toBeInTheDocument();
      expect(screen.getByText(/Web Companion · เชื่อมต่อ Desktop/)).toBeInTheDocument();
    }
  });
});
