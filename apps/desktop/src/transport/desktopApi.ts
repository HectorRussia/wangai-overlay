import { invoke } from "@tauri-apps/api/core";
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

import type { AppApi, WebCompanionInfo } from "./contract";

export const desktopApi: AppApi = {
  openSettingsWindow: () => invoke<void>("open_settings_window"),
  quitApp: () => invoke<void>("quit_app"),
  listRunningApps: () => invoke<RunningApp[]>("list_running_apps"),
  snapshot: () => invoke<AppSnapshot>("get_snapshot"),
  listOutputDevices: () => invoke<AudioOutputDevice[]>("list_output_devices"),
  listMicrophoneDevices: () =>
    invoke<AudioOutputDevice[]>("list_microphone_devices"),
  updateMicrophoneDevice: (deviceId?: string) =>
    invoke<AppSettings>("update_microphone_device", {
      deviceId: deviceId ?? null,
    }),
  selectListeningSource: (source: CaptureSource) =>
    invoke<AppSettings>("select_listening_source", { source }),
  clearListeningSource: () => invoke<AppSettings>("clear_listening_source"),
  toggleListening: () => invoke<boolean>("toggle_listening"),
  startSession: () => invoke<boolean>("start_session"),
  probeRecentAudio: () => invoke<void>("probe_recent_audio"),
  updateHotkeys: (hotkeys: HotkeySettings) =>
    invoke<AppSettings>("update_hotkeys", { hotkeys }),
  setHotkeyCaptureMode: (enabled: boolean) =>
    invoke<void>("set_hotkey_capture_mode", { enabled }),
  updateOverlay: (overlay: OverlaySettings) =>
    invoke<AppSettings>("update_overlay_settings", { overlay }),
  updateVad: (vad: VadSettings) =>
    invoke<AppSettings>("update_vad_settings", { vad }),
  updateCaptureMode: (mode: CaptureMode) =>
    invoke<AppSettings>("update_capture_mode", { mode }),
  updateOutputDevice: (deviceId?: string) =>
    invoke<AppSettings>("update_output_device", { deviceId: deviceId ?? null }),
  updateRescueScan: (enabled: boolean) =>
    invoke<AppSettings>("update_rescue_scan", { enabled }),
  updateGlossary: (glossary: GlossaryTerm[]) =>
    invoke<AppSettings>("update_glossary", { glossary }),
  setOverlayEditMode: (enabled: boolean) =>
    invoke<boolean>("set_overlay_edit_mode", { enabled }),
  saveOverlayBounds: () => invoke<void>("save_overlay_bounds"),
  startOverlayDrag: () => invoke<void>("start_overlay_drag"),
  copyLatestReply: () => invoke<boolean>("copy_latest_reply"),
  restartWorker: () => invoke<void>("restart_worker"),
  getWebCompanionInfo: () => invoke<WebCompanionInfo>("get_web_companion_info"),
  openWebCompanion: () => invoke<void>("open_web_companion"),
};
