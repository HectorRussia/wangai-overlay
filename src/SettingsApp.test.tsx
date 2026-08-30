import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AppSnapshot, AudioOutputDevice, CaptureSource } from "./types";
import { snapshotFixture } from "./test/fixtures";

const mocks = vi.hoisted(() => ({
  snapshot: undefined as AppSnapshot | undefined,
  refresh: vi.fn(async () => undefined),
  toggleListening: vi.fn(async () => false),
  listProcesses: vi.fn(async (): Promise<CaptureSource[]> => []),
  listGameOutputDevices: vi.fn(async (): Promise<AudioOutputDevice[]> => []),
  updateGameOutputDevice: vi.fn(async () => undefined),
  updateSystemOutputCloudScan: vi.fn(async () => undefined),
  updateGroqModels: vi.fn(async () => undefined),
  updateGameCaptureMode: vi.fn(async () => undefined),
  updateVad: vi.fn(async () => undefined),
  probeRecentGameAudio: vi.fn(async () => undefined),
  updateVoiceChat: vi.fn(async () => undefined),
  selectVoiceChatProcess: vi.fn(async () => undefined),
  probeRecentSourceAudio: vi.fn(async () => undefined),
}));

vi.mock("./useSnapshot", () => ({
  errorText: (error: unknown) => String(error),
  useSnapshot: () => ({ snapshot: mocks.snapshot, refresh: mocks.refresh, loadingError: undefined }),
}));

vi.mock("./api", () => ({
  api: {
    snapshot: vi.fn(),
    toggleListening: mocks.toggleListening,
    probeRecentGameAudio: mocks.probeRecentGameAudio,
    probeRecentSourceAudio: mocks.probeRecentSourceAudio,
    listProcesses: mocks.listProcesses,
    listGameOutputDevices: mocks.listGameOutputDevices,
    selectProcess: vi.fn(async () => undefined),
    selectVoiceChatProcess: mocks.selectVoiceChatProcess,
    updateVoiceChat: mocks.updateVoiceChat,
    configureGroq: vi.fn(async () => undefined),
    clearGroq: vi.fn(async () => undefined),
    testGroq: vi.fn(async () => "สำเร็จ"),
    getGroqModelCatalog: vi.fn(async () => [
      { id: "whisper-large-v3-turbo", label: "Whisper Large V3 Turbo", description: "เร็ว", kind: "speech_to_text", inputMicrousdPerMillion: 0, outputMicrousdPerMillion: 0, audioMicrousdPerHour: 40_000 },
      { id: "whisper-large-v3", label: "Whisper Large V3", description: "แม่น", kind: "speech_to_text", inputMicrousdPerMillion: 0, outputMicrousdPerMillion: 0, audioMicrousdPerHour: 111_000 },
      { id: "openai/gpt-oss-20b", label: "GPT-OSS 20B", description: "เร็ว", kind: "translation", inputMicrousdPerMillion: 75_000, outputMicrousdPerMillion: 300_000, audioMicrousdPerHour: 0 },
      { id: "openai/gpt-oss-120b", label: "GPT-OSS 120B", description: "แม่น", kind: "translation", inputMicrousdPerMillion: 150_000, outputMicrousdPerMillion: 600_000, audioMicrousdPerHour: 0 },
    ]),
    updateGroqModels: mocks.updateGroqModels,
    updateHotkeys: vi.fn(async () => undefined),
    updateOverlay: vi.fn(async () => undefined),
    updateVad: mocks.updateVad,
    updateGameCaptureMode: mocks.updateGameCaptureMode,
    updateGameOutputDevice: mocks.updateGameOutputDevice,
    updateSystemOutputCloudScan: mocks.updateSystemOutputCloudScan,
    updateGlossary: vi.fn(async () => undefined),
    setOverlayEditMode: vi.fn(async () => false),
    saveOverlayBounds: vi.fn(async () => undefined),
    restartWorker: vi.fn(async () => undefined),
    injectDemo: vi.fn(async () => undefined),
  },
}));

import { SettingsApp } from "./SettingsApp";

describe("WANGAI settings", () => {
  beforeEach(() => {
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      configurable: true,
      value: {},
    });
    mocks.snapshot = snapshotFixture();
    mocks.refresh.mockClear();
    mocks.toggleListening.mockClear();
    mocks.listProcesses.mockClear();
    mocks.listGameOutputDevices.mockReset();
    mocks.listGameOutputDevices.mockResolvedValue([
      { id: "Speakers (PRO)", name: "Speakers (PRO)", isDefault: true, sampleRate: 48_000, channels: 2 },
      { id: "Dell AW2720HF", name: "Dell AW2720HF", isDefault: false, sampleRate: 48_000, channels: 2 },
    ]);
    mocks.updateGameOutputDevice.mockClear();
    mocks.updateSystemOutputCloudScan.mockClear();
    mocks.updateGroqModels.mockClear();
    mocks.updateGameCaptureMode.mockClear();
    mocks.updateVad.mockClear();
    mocks.probeRecentGameAudio.mockClear();
    mocks.updateVoiceChat.mockClear();
    mocks.selectVoiceChatProcess.mockClear();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    Reflect.deleteProperty(window, "__TAURI_INTERNALS__");
  });

  it("exposes five hash-routed tabs and keeps the listening action wired", async () => {
    const user = userEvent.setup();
    render(<SettingsApp activeTab="overview" />);

    expect(screen.getByRole("heading", { name: "WANGAI" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Audio/ })).toHaveAttribute("href", "#/settings/audio");
    expect(screen.getByRole("link", { name: /History/ })).toHaveAttribute("href", "#/settings/history");

    await user.click(screen.getByRole("button", { name: /หยุดฟัง · F8/ }));
    await waitFor(() => expect(mocks.toggleListening).toHaveBeenCalledOnce());
    expect(mocks.refresh).toHaveBeenCalledOnce();
  });

  it("loads process choices only on the audio route", async () => {
    mocks.listProcesses.mockResolvedValueOnce([
      {
        pid: 4242,
        name: "MistfallHunter-Win64-Shipping.exe",
        executablePath: "C:\\Games\\MistfallHunter-Win64-Shipping.exe",
        displayName: "Mistfall Hunter",
        isMistfall: true,
      },
      {
        pid: 4343,
        name: "MistfallHunter-Win64-Shipping.exe",
        executablePath: "C:\\Games\\MistfallHunter-Win64-Shipping.exe",
        displayName: "Mistfall Hunter",
        isMistfall: true,
      },
    ]);
    render(<SettingsApp activeTab="audio" />);

    await waitFor(() => expect(mocks.listProcesses).toHaveBeenCalledOnce());
    expect(await screen.findAllByText("Mistfall Hunter")).toHaveLength(4);
    expect(screen.getAllByRole("button", { name: /PID 4242/ }).map((button) => button.getAttribute("aria-pressed"))).toContain("true");
    expect(screen.getAllByRole("button", { name: /PID 4343/ })).toHaveLength(2);
  });

  it("shows the effective capture root and can opt into system output", async () => {
    const user = userEvent.setup();
    vi.spyOn(window, "confirm").mockReturnValueOnce(true);
    render(<SettingsApp activeTab="audio" />);

    expect(screen.getByText(/จับจริง PID 4000/)).toBeInTheDocument();
    expect(screen.getByRole("meter", { name: "Game audio level" })).toHaveAttribute("aria-valuenow", "-10");
    await user.click(screen.getByRole("button", { name: /System Output fallback/ }));
    await waitFor(() => expect(mocks.updateGameCaptureMode).toHaveBeenCalledWith("system_output", true));
  });

  it("can send the recent game buffer to Groq as an explicit diagnostic probe", async () => {
    const user = userEvent.setup();
    render(<SettingsApp activeTab="audio" />);

    await user.click(screen.getByRole("button", { name: /ตรวจเสียง 6 วิล่าสุดด้วย Groq/ }));
    await waitFor(() => expect(mocks.probeRecentGameAudio).toHaveBeenCalledOnce());
  });

  it("shows an isolated voice-chat meter and persists rescue-scan settings", async () => {
    const user = userEvent.setup();
    render(<SettingsApp activeTab="audio" />);

    expect(screen.getByRole("meter", { name: "Voice chat audio level" })).toHaveAttribute("aria-valuenow", "-12");
    expect(screen.getByText(/จับจริง PID 7000/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Rescue Scan เปิด/ }));

    await waitFor(() => expect(mocks.updateVoiceChat).toHaveBeenCalledWith(expect.objectContaining({
      enabled: true,
      autoDetect: true,
      rescueScan: false,
    })));
  });

  it("applies the low voice preset to the VAD-only path", async () => {
    const user = userEvent.setup();
    render(<SettingsApp activeTab="audio" />);

    await user.click(screen.getByRole("button", { name: /Preset เสียงเพื่อนเบา/ }));
    await waitFor(() => expect(mocks.updateVad).toHaveBeenCalledWith(expect.objectContaining({
      processTree: { vadThreshold: 0.35, gainDb: 9 },
      systemOutput: { vadThreshold: 0.35, gainDb: 9 },
    })));
  });

  it("shows the effective System Output VAD profile and tuning guidance", () => {
    mocks.snapshot = snapshotFixture();
    mocks.snapshot.settings.gameCaptureMode = "system_output";
    mocks.snapshot.runtime.effectiveVadThreshold = 0.35;
    mocks.snapshot.runtime.effectiveVadGainDb = 9;
    mocks.snapshot.runtime.effectiveVadAutoGainDb = 12;
    mocks.snapshot.runtime.gameAudioPeakDbfs = -31;
    render(<SettingsApp activeTab="audio" />);

    expect(screen.getByText(/Silero ใช้ threshold 0.35 · VAD gain \+9 dB · auto \+12 dB · adaptive floor 0.09/)).toBeInTheDocument();
    expect(screen.getByText(/เสียงเข้า Rust แล้วแต่ยังไม่ผ่าน Silero/)).toBeInTheDocument();
  });

  it("lists output endpoints, shows the effective endpoint, and saves a selection", async () => {
    const user = userEvent.setup();
    mocks.snapshot = snapshotFixture();
    mocks.snapshot.settings.gameCaptureMode = "system_output";
    mocks.snapshot.runtime.effectiveOutputDeviceId = "Speakers (PRO)";
    mocks.snapshot.runtime.effectiveOutputDeviceName = "Speakers (PRO)";
    mocks.snapshot.runtime.effectiveOutputDeviceIsDefault = true;
    render(<SettingsApp activeTab="audio" />);

    const selector = await screen.findByRole("combobox", { name: "Mistfall output device" });
    expect(screen.getByText(/Output ที่จับจริง: Speakers \(PRO\) \(Windows default\)/)).toBeInTheDocument();
    await user.selectOptions(selector, "Dell AW2720HF");

    await waitFor(() => expect(mocks.updateGameOutputDevice).toHaveBeenCalledWith("Dell AW2720HF"));
  });

  it("exposes automatic translation in diagnostics and requires confirmation", async () => {
    const user = userEvent.setup();
    vi.spyOn(window, "confirm").mockReturnValueOnce(true);
    mocks.snapshot = snapshotFixture();
    mocks.snapshot.settings.gameCaptureMode = "system_output";
    render(<SettingsApp activeTab="audio" />);

    await user.click(screen.getByRole("button", { name: "เปิดแปลอัตโนมัติ" }));

    expect(window.confirm).toHaveBeenCalledOnce();
    await waitFor(() => expect(mocks.updateSystemOutputCloudScan).toHaveBeenCalledWith(true));
  });

  it("keeps a missing saved endpoint visible instead of silently falling back", async () => {
    mocks.snapshot = snapshotFixture();
    mocks.snapshot.settings.gameCaptureMode = "system_output";
    mocks.snapshot.settings.gameOutputDeviceId = "Disconnected Headset";
    render(<SettingsApp activeTab="audio" />);

    expect(await screen.findByRole("option", { name: /Disconnected Headset.*ไม่พบอุปกรณ์/ })).toBeInTheDocument();
    expect(screen.getByText(/ระบบจะไม่ fallback ไปอุปกรณ์อื่นอัตโนมัติ/)).toBeInTheDocument();
  });

  it("switches curated STT and translation models without restarting VAD", async () => {
    const user = userEvent.setup();
    render(<SettingsApp activeTab="ai" />);

    await waitFor(() => expect(screen.getAllByRole("option", { name: "Whisper Large V3" })).toHaveLength(2));
    await user.selectOptions(screen.getByRole("combobox", { name: "Game STT model" }), "whisper-large-v3");
    await user.selectOptions(screen.getByRole("combobox", { name: "F9 microphone STT model" }), "whisper-large-v3-turbo");
    await user.selectOptions(screen.getByRole("combobox", { name: "Translation model" }), "openai/gpt-oss-120b");
    await user.click(screen.getByRole("button", { name: /บันทึกโมเดล/ }));

    await waitFor(() =>
      expect(mocks.updateGroqModels).toHaveBeenCalledWith(
        "whisper-large-v3",
        "whisper-large-v3-turbo",
        "openai/gpt-oss-120b",
      ),
    );
  });
});
