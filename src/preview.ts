import type { AppSnapshot, CaptureSource } from "./types";

export function isTauriRuntime(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export function isPreviewMode(): boolean {
  if (typeof window === "undefined") return false;
  const requested = new URLSearchParams(window.location.search).get("preview") === "1";
  return requested || !isTauriRuntime();
}

export const previewProcesses: CaptureSource[] = [
  {
    pid: 4242,
    name: "MistfallHunter-Win64-Shipping.exe",
    executablePath: "C:\\Games\\Mistfall Hunter\\MistfallHunter-Win64-Shipping.exe",
    displayName: "Mistfall Hunter",
    isMistfall: true,
  },
  {
    pid: 7210,
    name: "Discord.exe",
    executablePath: "C:\\Users\\User\\AppData\\Local\\Discord\\Discord.exe",
    displayName: "Discord",
    isMistfall: false,
  },
];

export function previewSnapshot(): AppSnapshot {
  const now = Date.now();
  const idle = new URLSearchParams(window.location.search).get("state") === "idle";
  const snapshot: AppSnapshot = {
    settings: {
      schemaVersion: 4,
      selectedProcess: {
        executablePath: previewProcesses[0].executablePath,
        executableName: previewProcesses[0].name,
        displayName: previewProcesses[0].displayName,
        lastPid: previewProcesses[0].pid,
      },
      autoAttach: true,
      hotkeys: { toggleListening: "F8", pushToTalk: "F9", copyLatest: "F10", editOverlay: "F7" },
      overlay: { opacity: 0.94, fontScale: 1, fadeSeconds: 30, maxItems: 3, width: 420, height: 236 },
      vad: { vadThreshold: 0.5, silenceMs: 500, preRollMs: 200, maxUtteranceMs: 12000 },
      groq: {
        configured: true,
        sttModel: "whisper-large-v3-turbo",
        translationModel: "openai/gpt-oss-20b",
        monthlyBudgetMicrousd: 2_000_000,
        usageMonth: "2026-08",
        actualAudioMillis: 228_000,
        billedAudioMillis: 240_000,
        promptTokens: 1240,
        completionTokens: 460,
        estimatedSpendMicrousd: 15_600,
      },
      glossary: [
        { source: "Mistfall", target: "Mistfall" },
        { source: "north gate", target: "ประตูเหนือ" },
      ],
    },
    runtime: {
      listening: true,
      microphoneActive: false,
      overlayEditMode: false,
      workerReady: true,
      workerModel: "silero-vad",
      groqSttBusy: false,
      groqStatus: "Groq พร้อมใช้งาน",
      budgetExhausted: false,
      attachedProcess: previewProcesses[0],
      statusMessage: "กำลังฟัง Mistfall Hunter",
    },
    history: [
      {
        segmentId: "game-preview",
        stream: "game",
        originalLanguage: "en",
        originalText: "Join us at the north gate.",
        translatedText: "ไปรวมกันที่ประตูเหนือ",
        status: "success",
        createdAtMs: now - 1_000,
      },
      {
        segmentId: "mic-preview",
        stream: "microphone",
        originalLanguage: "th",
        originalText: "กำลังไป",
        translatedText: "On my way.",
        status: "success",
        createdAtMs: now - 2_000,
      },
    ],
  };

  if (idle) {
    snapshot.runtime.listening = false;
    snapshot.runtime.groqSttBusy = false;
    snapshot.runtime.attachedProcess = undefined;
    snapshot.runtime.statusMessage = "พร้อมเริ่มฟังเสียงในเกม";
    snapshot.history = [];
  }

  return snapshot;
}
