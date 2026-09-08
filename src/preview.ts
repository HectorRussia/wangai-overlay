import type { AppSnapshot, AudioOutputDevice, CaptureSource, RunningApp } from "./types";

export function isTauriRuntime(): boolean { return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window; }
export function isPreviewMode(): boolean { return typeof window !== "undefined" && new URLSearchParams(window.location.search).get("preview") === "1"; }

export const previewProcesses: CaptureSource[] = [
  { pid: 4242, name: "MistfallHunter-Win64-Shipping.exe", executablePath: "C:\\Games\\Mistfall Hunter\\MistfallHunter-Win64-Shipping.exe", displayName: "Mistfall Hunter", isMistfall: true },
  { pid: 7210, name: "Discord.exe", executablePath: "C:\\Users\\User\\AppData\\Local\\Discord\\Discord.exe", displayName: "Discord", isMistfall: false },
  { pid: 8120, name: "chrome.exe", executablePath: "C:\\Program Files\\Google\\Chrome\\chrome.exe", displayName: "Google Chrome", isMistfall: false },
];
export const previewOutputDevices: AudioOutputDevice[] = [
  { id: "Speakers (PRO)", name: "Speakers (PRO)", isDefault: true, sampleRate: 48_000, channels: 2 },
  { id: "Dell AW2720HF", name: "Dell AW2720HF", isDefault: false, sampleRate: 48_000, channels: 2 },
];

export const previewRunningApps: RunningApp[] = previewProcesses.map((source) => ({
  id: source.executablePath.toLowerCase(), displayName: source.displayName,
  executableName: source.name, executablePath: source.executablePath,
  searchNames: [source.displayName, source.name, source.executablePath],
  processCount: 1, memberPids: [source.pid], hasWindow: true, roots: [source],
}));

export function previewSnapshot(): AppSnapshot {
  const now = Date.now();
  const state = new URLSearchParams(window.location.search).get("state");
  const snapshot: AppSnapshot = {
    settings: {
      schemaVersion: 13,
      listeningSource: { executablePath: previewProcesses[0].executablePath, executableName: previewProcesses[0].name, displayName: previewProcesses[0].displayName, lastPid: previewProcesses[0].pid },
      captureMode: "process_tree",
      outputDeviceId: "Speakers (PRO)",
      rescueScanEnabled: false,
      autoAttach: true,
      hotkeys: { toggleListening: "F8", pushToTalk: "F9", copyLatest: "F10", editOverlay: "F7" },
      overlay: { opacity: 0.94, fontScale: 1, fadeSeconds: 30, maxItems: 4, width: 420, height: 236 },
      vad: { processTree: { vadThreshold: 0.5, gainDb: 0 }, systemOutput: { vadThreshold: 0.35, gainDb: 9 }, silenceMs: 500, preRollMs: 200, maxUtteranceMs: 12_000 },
      groq: { configured: true, incomingSttModel: "whisper-large-v3", microphoneSttModel: "whisper-large-v3-turbo", translationModel: "openai/gpt-oss-20b", monthlyBudgetMicrousd: 2_000_000, usageMonth: "2026-09", actualAudioMillis: 228_000, billedAudioMillis: 240_000, promptTokens: 1_240, completionTokens: 460, estimatedSpendMicrousd: 15_600 },
      glossary: [{ source: "north gate", target: "ประตูเหนือ" }],
    },
    runtime: {
      listening: true, microphoneActive: false, overlayEditMode: false, workerReady: true, workerModel: "silero-vad", groqSttBusy: false, groqStatus: "Groq พร้อมใช้งาน", budgetExhausted: false,
      attachedSource: previewProcesses[0], effectiveCapturePid: 4100, effectiveCaptureName: "MistfallHunter.exe", effectiveOutputDeviceIsDefault: false,
      audioRmsDbfs: -31.5, audioPeakDbfs: -12.2, audioLastSeenAtMs: now, vadActive: false,
      effectiveVadThreshold: 0.5, effectiveVadGainDb: 0, effectiveVadAutoGainDb: 0, droppedAudioChunks: 0,
      statusMessage: "กำลังฟัง Mistfall Hunter",
    },
    history: [
      { segmentId: "incoming-preview", stream: "incoming", sourceDisplayName: "MISTFALL", originalLanguage: "en", originalText: "Join us at the north gate.", translatedText: "ไปรวมกันที่ประตูเหนือ", status: "success", createdAtMs: now - 1_000 },
      { segmentId: "mic-preview", stream: "microphone", sourceDisplayName: "F9 REPLY", originalLanguage: "th", originalText: "กำลังไป", translatedText: "On my way.", status: "success", createdAtMs: now - 2_000 },
    ],
  };
  if (state === "ready") { snapshot.runtime.listening = false; snapshot.runtime.statusMessage = "พร้อมเริ่มฟัง"; }
  if (state === "idle") { snapshot.runtime.listening = false; snapshot.runtime.attachedSource = undefined; snapshot.runtime.audioRmsDbfs = null; snapshot.runtime.audioPeakDbfs = null; snapshot.runtime.audioLastSeenAtMs = null; snapshot.history = []; }
  if (state === "warning") { snapshot.runtime.captureWarning = "ยังไม่ได้รับ audio frame จากแอปที่เลือก"; snapshot.runtime.audioPeakDbfs = null; }
  if (state === "setup") { snapshot.settings.listeningSource = undefined; snapshot.settings.groq.configured = false; snapshot.runtime.listening = false; snapshot.runtime.attachedSource = undefined; snapshot.runtime.audioPeakDbfs = null; snapshot.history = []; }
  return snapshot;
}
