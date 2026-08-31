import type { AppSnapshot, AudioOutputDevice, CaptureSource } from "./types";

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

export const previewOutputDevices: AudioOutputDevice[] = [
  { id: "Speakers (PRO)", name: "Speakers (PRO)", isDefault: true, sampleRate: 48_000, channels: 2 },
  { id: "Speakers (Realtek(R) Audio)", name: "Speakers (Realtek(R) Audio)", isDefault: false, sampleRate: 48_000, channels: 2 },
  { id: "Dell AW2720HF (NVIDIA High Definition Audio)", name: "Dell AW2720HF (NVIDIA High Definition Audio)", isDefault: false, sampleRate: 48_000, channels: 2 },
];

export function previewSnapshot(): AppSnapshot {
  const now = Date.now();
  const previewState = new URLSearchParams(window.location.search).get("state");
  const snapshot: AppSnapshot = {
    settings: {
      schemaVersion: 11,
      selectedProcess: {
        executablePath: previewProcesses[0].executablePath,
        executableName: previewProcesses[0].name,
        displayName: previewProcesses[0].displayName,
        lastPid: previewProcesses[0].pid,
      },
      gameCaptureMode: "process_tree",
      gameOutputDeviceId: "Speakers (PRO)",
      systemOutputCloudScan: false,
      voiceChat: {
        enabled: true,
        autoDetect: true,
        selectedProcess: {
          executablePath: previewProcesses[1].executablePath,
          executableName: previewProcesses[1].name,
          displayName: previewProcesses[1].displayName,
          lastPid: previewProcesses[1].pid,
        },
        rescueScan: true,
        vad: { vadThreshold: 0.35, gainDb: 6 },
      },
      autoAttach: true,
      hotkeys: { toggleListening: "F8", pushToTalk: "F9", copyLatest: "F10", editOverlay: "F7" },
      overlay: { opacity: 0.94, fontScale: 1, fadeSeconds: 30, maxItems: 4, width: 420, height: 236 },
      vad: {
        processTree: { vadThreshold: 0.5, gainDb: 0 },
        systemOutput: { vadThreshold: 0.35, gainDb: 9 },
        silenceMs: 500,
        preRollMs: 200,
        maxUtteranceMs: 12000,
      },
      groq: {
        configured: true,
        gameSttModel: "whisper-large-v3",
        microphoneSttModel: "whisper-large-v3-turbo",
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
      effectiveCapturePid: 4100,
      effectiveCaptureName: "MistfallHunter.exe",
      effectiveOutputDeviceId: undefined,
      effectiveOutputDeviceName: undefined,
      effectiveOutputDeviceIsDefault: false,
      gameAudioRmsDbfs: -31.5,
      gameAudioPeakDbfs: -12.2,
      gameAudioLastSeenAtMs: now,
      gameVadActive: false,
      effectiveVadThreshold: 0.5,
      effectiveVadGainDb: 0,
      effectiveVadAutoGainDb: 0,
      droppedAudioChunks: 0,
      voiceChatAttachedProcess: previewProcesses[1],
      voiceChatEffectiveCapturePid: 7100,
      voiceChatEffectiveCaptureName: "Discord.exe",
      voiceChatAudioRmsDbfs: -32,
      voiceChatAudioPeakDbfs: -14,
      voiceChatAudioLastSeenAtMs: now,
      voiceChatVadActive: false,
      voiceChatVadThreshold: 0.35,
      voiceChatVadGainDb: 6,
      voiceChatDroppedAudioChunks: 0,
      statusMessage: "กำลังฟัง Mistfall Hunter",
    },
    history: [
      {
        segmentId: "game-preview",
        stream: "game",
        sourceDisplayName: "Mistfall Hunter",
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

  if (previewState === "ready") {
    snapshot.runtime.listening = false;
    snapshot.runtime.statusMessage = "พร้อมเริ่มฟังเสียงในเกม";
  }

  if (previewState === "idle") {
    snapshot.runtime.listening = false;
    snapshot.runtime.groqSttBusy = false;
    snapshot.runtime.attachedProcess = undefined;
    snapshot.runtime.effectiveCapturePid = undefined;
    snapshot.runtime.effectiveCaptureName = undefined;
    snapshot.runtime.gameAudioRmsDbfs = undefined;
    snapshot.runtime.gameAudioPeakDbfs = undefined;
    snapshot.runtime.gameAudioLastSeenAtMs = undefined;
    snapshot.runtime.voiceChatAttachedProcess = undefined;
    snapshot.runtime.voiceChatEffectiveCapturePid = undefined;
    snapshot.runtime.voiceChatEffectiveCaptureName = undefined;
    snapshot.runtime.voiceChatAudioRmsDbfs = undefined;
    snapshot.runtime.voiceChatAudioPeakDbfs = undefined;
    snapshot.runtime.voiceChatAudioLastSeenAtMs = undefined;
    snapshot.runtime.statusMessage = "พร้อมเริ่มฟังเสียงในเกม";
    snapshot.history = [];
  }

  if (previewState === "warning") {
    snapshot.runtime.captureWarning = "ได้รับเสียงเกมไม่ต่อเนื่อง กรุณาตรวจ process ที่เลือก";
    snapshot.runtime.voiceChatCaptureWarning = "ยังไม่ได้รับเสียงจาก Discord";
    snapshot.runtime.gameAudioPeakDbfs = undefined;
    snapshot.runtime.voiceChatAudioPeakDbfs = undefined;
  }

  if (previewState === "setup") {
    snapshot.settings.selectedProcess = undefined;
    snapshot.settings.voiceChat.enabled = false;
    snapshot.settings.voiceChat.autoDetect = false;
    snapshot.settings.voiceChat.selectedProcess = undefined;
    snapshot.settings.groq.configured = false;
    snapshot.runtime.listening = false;
    snapshot.runtime.attachedProcess = undefined;
    snapshot.runtime.voiceChatAttachedProcess = undefined;
    snapshot.runtime.gameAudioPeakDbfs = undefined;
    snapshot.runtime.voiceChatAudioPeakDbfs = undefined;
    snapshot.runtime.statusMessage = "ตั้งค่าอีกนิดก่อนเริ่มฟัง";
    snapshot.history = [];
  }

  return snapshot;
}
