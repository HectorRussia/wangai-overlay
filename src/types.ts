export type StreamKind = "incoming" | "microphone";
export type TranscriptKind = "partial" | "final";
export type TranslationStatus = "pending" | "success" | "error" | "quota" | "source_only";
export type CaptureMode = "process_tree" | "system_output";

export interface CaptureSource {
  pid: number;
  name: string;
  executablePath: string;
  displayName: string;
  isMistfall: boolean;
}

export interface RunningApp {
  id: string;
  displayName: string;
  executableName: string;
  executablePath: string;
  searchNames: string[];
  processCount: number;
  memberPids: number[];
  hasWindow: boolean;
  roots: CaptureSource[];
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

export interface VadProfile {
  vadThreshold: number;
  gainDb: number;
}

export interface VadSettings {
  processTree: VadProfile;
  systemOutput: VadProfile;
  silenceMs: number;
  preRollMs: number;
  maxUtteranceMs: number;
}

export interface AiServiceStatus {
  state: "connecting" | "connected" | "ready" | "degraded" | "offline";
  message: string;
  incomingModel: string;
  microphoneModel: string;
  translationModel: string;
  retryAfterMs?: number | null;
}

export interface AppSettings {
  schemaVersion: number;
  listeningSource?: SavedProcess;
  captureMode: CaptureMode;
  outputDeviceId?: string;
  rescueScanEnabled: boolean;
  autoAttach: boolean;
  hotkeys: HotkeySettings;
  overlay: OverlaySettings;
  vad: VadSettings;
  installationId: string;
  glossary: GlossaryTerm[];
}

export interface RuntimeState {
  listening: boolean;
  microphoneActive: boolean;
  overlayEditMode: boolean;
  workerReady: boolean;
  workerModel?: string;
  aiSttBusy: boolean;
  aiStatus: string;
  aiService: AiServiceStatus;
  attachedSource?: CaptureSource;
  effectiveCapturePid?: number;
  effectiveCaptureName?: string;
  effectiveOutputDeviceId?: string;
  effectiveOutputDeviceName?: string;
  effectiveOutputDeviceIsDefault: boolean;
  audioRmsDbfs?: number | null;
  audioPeakDbfs?: number | null;
  audioLastSeenAtMs?: number | null;
  vadActive: boolean;
  effectiveVadThreshold: number;
  effectiveVadGainDb: number;
  effectiveVadAutoGainDb: number;
  droppedAudioChunks: number;
  captureWarning?: string;
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
