import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AppSnapshot, CaptureSource } from "./types";
import { snapshotFixture } from "./test/fixtures";

const mocks = vi.hoisted(() => ({
  snapshot: undefined as AppSnapshot | undefined,
  refresh: vi.fn(async () => undefined),
  toggleListening: vi.fn(async () => false),
  listProcesses: vi.fn(async (): Promise<CaptureSource[]> => []),
  updateGroqModels: vi.fn(async () => undefined),
}));

vi.mock("./useSnapshot", () => ({
  errorText: (error: unknown) => String(error),
  useSnapshot: () => ({ snapshot: mocks.snapshot, refresh: mocks.refresh, loadingError: undefined }),
}));

vi.mock("./api", () => ({
  api: {
    snapshot: vi.fn(),
    toggleListening: mocks.toggleListening,
    listProcesses: mocks.listProcesses,
    selectProcess: vi.fn(async () => undefined),
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
    updateVad: vi.fn(async () => undefined),
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
    mocks.updateGroqModels.mockClear();
  });

  afterEach(() => {
    cleanup();
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
    ]);
    render(<SettingsApp activeTab="audio" />);

    await waitFor(() => expect(mocks.listProcesses).toHaveBeenCalledOnce());
    expect(await screen.findByText("Mistfall Hunter")).toBeInTheDocument();
  });

  it("switches curated STT and translation models without restarting VAD", async () => {
    const user = userEvent.setup();
    render(<SettingsApp activeTab="ai" />);

    await screen.findByRole("option", { name: "Whisper Large V3" });
    await user.selectOptions(screen.getByRole("combobox", { name: "Speech-to-text model" }), "whisper-large-v3");
    await user.selectOptions(screen.getByRole("combobox", { name: "Translation model" }), "openai/gpt-oss-120b");
    await user.click(screen.getByRole("button", { name: /บันทึกโมเดล/ }));

    await waitFor(() =>
      expect(mocks.updateGroqModels).toHaveBeenCalledWith(
        "whisper-large-v3",
        "openai/gpt-oss-120b",
      ),
    );
  });
});
