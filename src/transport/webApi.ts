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

import type { AppApi } from "./contract";
import { webJson, webCommand } from "./webClient";

function unavailableOnWeb(feature: string): Promise<never> {
  return Promise.reject(new Error(`${feature} ใช้งานได้จาก Desktop เท่านั้น`));
}

export const webApi: AppApi = {
  openSettingsWindow: () => unavailableOnWeb("การเปิดหน้าตั้งค่า Desktop"),
  quitApp: () => unavailableOnWeb("การออกจากโปรแกรม Desktop"),
  listRunningApps: () => webJson<RunningApp[]>("/api/v1/apps"),
  snapshot: () => webJson<AppSnapshot>("/api/v1/snapshot"),
  listOutputDevices: () => webJson<AudioOutputDevice[]>("/api/v1/output-devices"),
  listMicrophoneDevices: () => webJson<AudioOutputDevice[]>("/api/v1/microphones"),
  updateMicrophoneDevice: (deviceId?: string) => webCommand<AppSettings>("update_microphone_device", { device_id: deviceId ?? null }),
  selectListeningSource: (source: CaptureSource) => webCommand<AppSettings>("select_listening_source", { source }),
  clearListeningSource: () => webCommand<AppSettings>("clear_listening_source"),
  toggleListening: () => webCommand<boolean>("toggle_listening"),
  startSession: () => webCommand<boolean>("start_session"),
  probeRecentAudio: () => webCommand<void>("probe_recent_audio"),
  updateHotkeys: (hotkeys: HotkeySettings) => webCommand<AppSettings>("update_hotkeys", { hotkeys }),
  setHotkeyCaptureMode: (_enabled: boolean) => Promise.resolve(),
  updateOverlay: (overlay: OverlaySettings) => webCommand<AppSettings>("update_overlay_settings", { overlay }),
  updateVad: (vad: VadSettings) => webCommand<AppSettings>("update_vad_settings", { vad }),
  updateCaptureMode: (mode: CaptureMode) => webCommand<AppSettings>("update_capture_mode", { mode }),
  updateOutputDevice: (deviceId?: string) => webCommand<AppSettings>("update_output_device", { device_id: deviceId ?? null }),
  updateRescueScan: (enabled: boolean) => webCommand<AppSettings>("update_rescue_scan", { enabled }),
  updateGlossary: (glossary: GlossaryTerm[]) => webCommand<AppSettings>("update_glossary", { glossary }),
  setOverlayEditMode: (enabled: boolean) => webCommand<boolean>("set_overlay_edit_mode", { enabled }),
  saveOverlayBounds: () => unavailableOnWeb("การบันทึกตำแหน่งหน้าต่าง Overlay"),
  startOverlayDrag: () => unavailableOnWeb("การลากหน้าต่าง Overlay"),
  copyLatestReply: () => webCommand<boolean>("copy_latest_reply"),
  restartWorker: () => webCommand<void>("restart_worker"),
  getWebCompanionInfo: () => Promise.resolve({ origin: window.location.origin, running: true }),
  openWebCompanion: () => Promise.resolve(),
};
