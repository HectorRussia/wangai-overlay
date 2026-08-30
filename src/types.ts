export type StreamKind = "game" | "microphone" | "voice_chat";
export type TranscriptKind = "partial" | "final";
export type TranslationStatus = "pending" | "success" | "error" | "quota" | "source_only";
export type GameCaptureMode = "process_tree" | "system_output";

export interface CaptureSource {
  pid: number;
  name: string;
  executablePath: string;
  displayName: string;
  isMistfall: boolean;
}

export interface SavedProcess {
  executablePath: string;
  executableName: string;
  displayName: string;
  lastPid?: number;
}

export interface AudioOutputDevice {
  id: string;
  name: string;
  isDefault: boolean;
  sampleRate: number;
  channels: number;
}

export interface TranscriptEvent {
  segmentId: string;
  stream: StreamKind;
  sourceDisplayName?: string;
  language: "en" | "th";
  text: string;
  kind: TranscriptKind;
  startedAtMs: number;
  endedAtMs: number;
}

export interface TranslationResult {
  segmentId: string;
  from: "en" | "th";
  to: "en" | "th";
  sourceText: string;
  translatedText?: string;
  status: TranslationStatus;
  message?: string;
}

export interface SubtitleItem {
  segmentId: string;
  stream: StreamKind;
  sourceDisplayName?: string;
  originalLanguage: "en" | "th";
  originalText: string;
  translatedText?: string;
  status: TranslationStatus;
  createdAtMs: number;
}

export interface GlossaryTerm {
  source: string;
  target: string;
}

export interface HotkeySettings {
  toggleListening: string;
  pushToTalk: string;
  copyLatest: string;
  editOverlay: string;
}

export interface OverlaySettings {
  opacity: number;
  fontScale: number;
  fadeSeconds: number;
  maxItems: number;
  x?: number;
  y?: number;
  width: number;
  height: number;
}

export interface GameVadProfile {
  vadThreshold: number;
  gainDb: number;
}

export interface VadSettings {
  processTree: GameVadProfile;
  systemOutput: GameVadProfile;
  silenceMs: number;
  preRollMs: number;
  maxUtteranceMs: number;
}

export interface VoiceChatSettings {
  enabled: boolean;
  autoDetect: boolean;
  selectedProcess?: SavedProcess;
  rescueScan: boolean;
  vad: GameVadProfile;
}

export interface GroqSettings {
  configured: boolean;
  gameSttModel: string;
  microphoneSttModel: string;
  translationModel: string;
  monthlyBudgetMicrousd: number;
  usageMonth: string;
  actualAudioMillis: number;
  billedAudioMillis: number;
  promptTokens: number;
  completionTokens: number;
  estimatedSpendMicrousd: number;
}

export type GroqModelKind = "speech_to_text" | "translation";

export interface GroqModelOption {
  id: string;
  label: string;
  description: string;
  kind: GroqModelKind;
  inputMicrousdPerMillion: number;
  outputMicrousdPerMillion: number;
  audioMicrousdPerHour: number;
}

export interface AppSettings {
  schemaVersion: number;
  selectedProcess?: SavedProcess;
  gameCaptureMode: GameCaptureMode;
  gameOutputDeviceId?: string;
  systemOutputCloudScan: boolean;
  voiceChat: VoiceChatSettings;
  autoAttach: boolean;
  hotkeys: HotkeySettings;
  overlay: OverlaySettings;
  vad: VadSettings;
  groq: GroqSettings;
  glossary: GlossaryTerm[];
}

export interface RuntimeState {
  listening: boolean;
  microphoneActive: boolean;
  overlayEditMode: boolean;
  workerReady: boolean;
  workerModel?: string;
  groqSttBusy: boolean;
  groqStatus: string;
  budgetExhausted: boolean;
  attachedProcess?: CaptureSource;
  effectiveCapturePid?: number;
  effectiveCaptureName?: string;
  effectiveOutputDeviceId?: string;
  effectiveOutputDeviceName?: string;
  effectiveOutputDeviceIsDefault: boolean;
  gameAudioRmsDbfs?: number;
  gameAudioPeakDbfs?: number;
  gameAudioLastSeenAtMs?: number;
  gameVadActive: boolean;
  effectiveVadThreshold: number;
  effectiveVadGainDb: number;
  effectiveVadAutoGainDb: number;
  droppedAudioChunks: number;
  captureWarning?: string;
  voiceChatAttachedProcess?: CaptureSource;
  voiceChatEffectiveCapturePid?: number;
  voiceChatEffectiveCaptureName?: string;
  voiceChatAudioRmsDbfs?: number;
  voiceChatAudioPeakDbfs?: number;
  voiceChatAudioLastSeenAtMs?: number;
  voiceChatVadActive: boolean;
  voiceChatVadThreshold: number;
  voiceChatVadGainDb: number;
  voiceChatDroppedAudioChunks: number;
  voiceChatCaptureWarning?: string;
  statusMessage: string;
  lastError?: string;
}

export interface AppSnapshot {
  settings: AppSettings;
  runtime: RuntimeState;
  history: SubtitleItem[];
  partial?: TranscriptEvent;
}

export interface WorkerStatusEvent {
  state: "starting" | "ready" | "error" | "stopped";
  message: string;
  model?: string;
}
