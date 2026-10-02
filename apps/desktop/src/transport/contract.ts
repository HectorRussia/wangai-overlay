import type {
  AppSettings,
  AppSnapshot,
  AudioOutputDevice,
  CaptureSource,
  RunningApp,
  GlossaryTerm,
  CaptureMode,
  HotkeySettings,
  OverlaySettings,
  VadSettings,
} from "../types";

export type WebCompanionInfo = { origin: string; running: boolean };

export interface AppApi {
  openSettingsWindow(): Promise<void>;
  quitApp(): Promise<void>;
  listRunningApps(): Promise<RunningApp[]>;
  snapshot(): Promise<AppSnapshot>;
  listOutputDevices(): Promise<AudioOutputDevice[]>;
  listMicrophoneDevices(): Promise<AudioOutputDevice[]>;
  updateMicrophoneDevice(deviceId?: string): Promise<AppSettings>;
  selectListeningSource(source: CaptureSource): Promise<AppSettings>;
  clearListeningSource(): Promise<AppSettings>;
  toggleListening(): Promise<boolean>;
  startSession(): Promise<boolean>;
  probeRecentAudio(): Promise<void>;
  updateHotkeys(hotkeys: HotkeySettings): Promise<AppSettings>;
  setHotkeyCaptureMode(enabled: boolean): Promise<void>;
  updateOverlay(overlay: OverlaySettings): Promise<AppSettings>;
  updateVad(vad: VadSettings): Promise<AppSettings>;
  updateCaptureMode(mode: CaptureMode): Promise<AppSettings>;
  updateOutputDevice(deviceId?: string): Promise<AppSettings>;
  updateRescueScan(enabled: boolean): Promise<AppSettings>;
  updateGlossary(glossary: GlossaryTerm[]): Promise<AppSettings>;
  setOverlayEditMode(enabled: boolean): Promise<boolean>;
  saveOverlayBounds(): Promise<void>;
  startOverlayDrag(): Promise<void>;
  copyLatestReply(): Promise<boolean>;
  restartWorker(): Promise<void>;
  getWebCompanionInfo(): Promise<WebCompanionInfo>;
  openWebCompanion(): Promise<void>;
}
