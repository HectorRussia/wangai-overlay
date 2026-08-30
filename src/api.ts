import { invoke } from "@tauri-apps/api/core";
import type { OverlayPresentation } from "./overlayPresentation";
import type {
  AppSettings,
  AppSnapshot,
  AudioOutputDevice,
  CaptureSource,
  GlossaryTerm,
  GroqModelOption,
  GameCaptureMode,
  HotkeySettings,
  OverlaySettings,
  StreamKind,
  VadSettings,
  VoiceChatSettings,
} from "./types";

export const api = {
  snapshot: () => invoke<AppSnapshot>("get_snapshot"),
  listProcesses: () => invoke<CaptureSource[]>("list_capture_sources"),
  listGameOutputDevices: () => invoke<AudioOutputDevice[]>("list_game_output_devices"),
  selectProcess: (source: CaptureSource) => invoke<AppSettings>("select_capture_source", { source }),
  selectVoiceChatProcess: (source: CaptureSource) =>
    invoke<AppSettings>("select_voice_chat_source", { source }),
  updateVoiceChat: (voiceChat: VoiceChatSettings) =>
    invoke<AppSettings>("update_voice_chat", { voiceChat }),
  toggleListening: () => invoke<boolean>("toggle_listening"),
  setListening: (enabled: boolean) => invoke<boolean>("set_listening", { enabled }),
  probeRecentGameAudio: () => invoke<void>("probe_recent_game_audio"),
  probeRecentSourceAudio: (stream: Exclude<StreamKind, "microphone">) =>
    invoke<void>("probe_recent_source_audio", { stream }),
  configureGroq: (key: string) => invoke<AppSettings>("configure_groq", { key }),
  clearGroq: () => invoke<AppSettings>("clear_groq_credentials"),
  testGroq: () => invoke<string>("test_groq_configuration"),
  getGroqModelCatalog: () => invoke<GroqModelOption[]>("get_groq_model_catalog"),
  updateGroqModels: (gameSttModel: string, microphoneSttModel: string, translationModel: string) =>
    invoke<AppSettings>("update_groq_models", { gameSttModel, microphoneSttModel, translationModel }),
  updateHotkeys: (hotkeys: HotkeySettings) => invoke<AppSettings>("update_hotkeys", { hotkeys }),
  updateOverlay: (overlay: OverlaySettings) => invoke<AppSettings>("update_overlay_settings", { overlay }),
  updateVad: (vad: VadSettings) => invoke<AppSettings>("update_vad_settings", { vad }),
  updateGameCaptureMode: (mode: GameCaptureMode, cloudScanEnabled = false) =>
    invoke<AppSettings>("update_game_capture_mode", { mode, cloudScanEnabled }),
  updateGameOutputDevice: (deviceId?: string) =>
    invoke<AppSettings>("update_game_output_device", { deviceId: deviceId ?? null }),
  updateSystemOutputCloudScan: (enabled: boolean) =>
    invoke<AppSettings>("update_system_output_cloud_scan", { enabled }),
  updateGlossary: (glossary: GlossaryTerm[]) => invoke<AppSettings>("update_glossary", { glossary }),
  setOverlayEditMode: (enabled: boolean) => invoke<boolean>("set_overlay_edit_mode", { enabled }),
  setOverlayPresentation: (presentation: OverlayPresentation) =>
    invoke<void>("set_overlay_presentation", { presentation }),
  saveOverlayBounds: () => invoke<void>("save_overlay_bounds"),
  startOverlayDrag: () => invoke<void>("start_overlay_drag"),
  copyLatestReply: () => invoke<boolean>("copy_latest_reply"),
  restartWorker: () => invoke<void>("restart_worker"),
  injectDemo: () => invoke<void>("inject_demo_transcript"),
};
