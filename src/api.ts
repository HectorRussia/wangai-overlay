import { invoke } from "@tauri-apps/api/core";
import type { OverlayPresentation } from "./overlayPresentation";
import type {
  AppSettings,
  AppSnapshot,
  CaptureSource,
  GlossaryTerm,
  GroqModelOption,
  HotkeySettings,
  OverlaySettings,
  VadSettings,
} from "./types";

export const api = {
  snapshot: () => invoke<AppSnapshot>("get_snapshot"),
  listProcesses: () => invoke<CaptureSource[]>("list_capture_sources"),
  selectProcess: (source: CaptureSource) => invoke<AppSettings>("select_capture_source", { source }),
  toggleListening: () => invoke<boolean>("toggle_listening"),
  setListening: (enabled: boolean) => invoke<boolean>("set_listening", { enabled }),
  configureGroq: (key: string) => invoke<AppSettings>("configure_groq", { key }),
  clearGroq: () => invoke<AppSettings>("clear_groq_credentials"),
  testGroq: () => invoke<string>("test_groq_configuration"),
  getGroqModelCatalog: () => invoke<GroqModelOption[]>("get_groq_model_catalog"),
  updateGroqModels: (sttModel: string, translationModel: string) =>
    invoke<AppSettings>("update_groq_models", { sttModel, translationModel }),
  updateHotkeys: (hotkeys: HotkeySettings) => invoke<AppSettings>("update_hotkeys", { hotkeys }),
  updateOverlay: (overlay: OverlaySettings) => invoke<AppSettings>("update_overlay_settings", { overlay }),
  updateVad: (vad: VadSettings) => invoke<AppSettings>("update_vad_settings", { vad }),
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
