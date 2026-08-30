import type { AppSnapshot } from "../types";

export function snapshotFixture(now = Date.now()): AppSnapshot {
  return {
    settings: {
      schemaVersion: 4,
      selectedProcess: {
        executablePath: "C:\\Games\\MistfallHunter-Win64-Shipping.exe",
        executableName: "MistfallHunter-Win64-Shipping.exe",
        displayName: "Mistfall Hunter",
        lastPid: 4242,
      },
      autoAttach: true,
      hotkeys: {
        toggleListening: "F8",
        pushToTalk: "F9",
        copyLatest: "F10",
        editOverlay: "F7",
      },
      overlay: {
        opacity: 0.94,
        fontScale: 1,
        fadeSeconds: 8,
        maxItems: 3,
        width: 420,
        height: 236,
      },
      vad: {
        vadThreshold: 0.5,
        silenceMs: 500,
        preRollMs: 200,
        maxUtteranceMs: 12000,
      },
      groq: {
        configured: true,
        sttModel: "whisper-large-v3-turbo",
        translationModel: "openai/gpt-oss-20b",
        monthlyBudgetMicrousd: 2_000_000,
        usageMonth: "2026-08",
        actualAudioMillis: 60_000,
        billedAudioMillis: 70_000,
        promptTokens: 120,
        completionTokens: 40,
        estimatedSpendMicrousd: 5_000,
      },
      glossary: [{ source: "Mistfall", target: "Mistfall" }],
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
      attachedProcess: {
        pid: 4242,
        name: "MistfallHunter-Win64-Shipping.exe",
        executablePath: "C:\\Games\\MistfallHunter-Win64-Shipping.exe",
        displayName: "Mistfall Hunter",
        isMistfall: true,
      },
      statusMessage: "กำลังฟัง Mistfall Hunter",
    },
    history: [
      {
        segmentId: "game-1",
        stream: "game",
        originalLanguage: "en",
        originalText: "Join us at the north gate.",
        translatedText: "ไปรวมกันที่ประตูเหนือ",
        status: "success",
        createdAtMs: now - 500,
      },
      {
        segmentId: "mic-1",
        stream: "microphone",
        originalLanguage: "th",
        originalText: "กำลังไป",
        translatedText: "On my way.",
        status: "success",
        createdAtMs: now - 1_000,
      },
    ],
  };
}
