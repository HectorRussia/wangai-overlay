import { invoke } from "@tauri-apps/api/core";
import type { OverlayPresentation } from "./overlayPresentation";
import type {
  AppSettings,
  AppSnapshot,
  AudioOutputDevice,
  CaptureSource,
  RunningApp,
  GlossaryTerm,
  GroqModelOption,
  CaptureMode,
  HotkeySettings,
  OverlaySettings,
  VadSettings,
} from "./types";

export type WebCompanionInfo = { origin: string; running: boolean };

const tauriRuntime = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
const previewRuntime = typeof window !== "undefined"
  && new URLSearchParams(window.location.search).has("preview");
const initialBootstrapToken = typeof window !== "undefined"
  ? window.location.hash.match(/^#wangai-token=([A-Za-z0-9_-]+)$/)?.[1]
  : undefined;

if (initialBootstrapToken && typeof window !== "undefined") {
  window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}#/settings/overview`);
}

export const isDesktopRuntime = () => tauriRuntime;
export const isWebCompanion = () => !tauriRuntime && !previewRuntime;

let sessionPromise: Promise<void> | undefined;

async function ensureWebSession(): Promise<void> {
  if (!isWebCompanion()) return;
  sessionPromise ??= (async () => {
    if (!initialBootstrapToken) return;
    const response = await fetch("/api/v1/session", {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: initialBootstrapToken }),
    });
    if (!response.ok) throw new Error("Web Companion session ไม่ถูกต้อง กรุณาเปิดใหม่จาก Desktop");
  })();
  return sessionPromise;
}

async function webJson<T>(path: string, init?: RequestInit): Promise<T> {
  await ensureWebSession();
  const response = await fetch(path, { ...init, credentials: "same-origin" });
  const payload = await response.json().catch(() => undefined) as { error?: string } | undefined;
  if (!response.ok) {
    throw new Error(payload?.error ?? (response.status === 401
      ? "Desktop session ขาดการเชื่อมต่อ กรุณาเปิด Web App ใหม่จาก WANGAI"
      : `Web Companion ตอบ ${response.status}`));
  }
  return payload as T;
}

type WebCommandArgs = Record<string, unknown> | undefined;

function webCommand<T>(command: string, args?: WebCommandArgs): Promise<T> {
  return webJson<T>("/api/v1/command", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(args ? { command, args } : { command }),
  });
}

function unavailableOnWeb(feature: string): Promise<never> {
  return Promise.reject(new Error(`${feature} ใช้งานได้จาก Desktop เท่านั้น`));
}

export const api = {
  openSettingsWindow: () => {
    if (tauriRuntime) return invoke<void>("open_settings_window");
    if (previewRuntime) { window.location.hash = "#/settings/overview"; return Promise.resolve(); }
    return unavailableOnWeb("การเปิดหน้าตั้งค่า Desktop");
  },
  quitApp: () => tauriRuntime ? invoke<void>("quit_app") : unavailableOnWeb("การออกจากโปรแกรม Desktop"),
  listRunningApps: () => tauriRuntime
    ? invoke<RunningApp[]>("list_running_apps")
    : webJson<RunningApp[]>("/api/v1/apps"),
  snapshot: () => tauriRuntime
    ? invoke<AppSnapshot>("get_snapshot")
    : webJson<AppSnapshot>("/api/v1/snapshot"),
  listProcesses: () => tauriRuntime
    ? invoke<CaptureSource[]>("list_capture_sources")
    : webJson<CaptureSource[]>("/api/v1/processes"),
  listOutputDevices: () => tauriRuntime
    ? invoke<AudioOutputDevice[]>("list_output_devices")
    : webJson<AudioOutputDevice[]>("/api/v1/output-devices"),
  selectListeningSource: (source: CaptureSource) => tauriRuntime
    ? invoke<AppSettings>("select_listening_source", { source })
    : webCommand<AppSettings>("select_listening_source", { source }),
  toggleListening: () => tauriRuntime
    ? invoke<boolean>("toggle_listening")
    : webCommand<boolean>("toggle_listening"),
  setListening: (enabled: boolean) => tauriRuntime
    ? invoke<boolean>("set_listening", { enabled })
    : webCommand<boolean>("set_listening", { enabled }),
  probeRecentAudio: () => tauriRuntime
    ? invoke<void>("probe_recent_audio")
    : webCommand<void>("probe_recent_audio"),
  configureGroq: (key: string) => tauriRuntime
    ? invoke<AppSettings>("configure_groq", { key })
    : unavailableOnWeb("การตั้งค่า Groq API key"),
  clearGroq: () => tauriRuntime
    ? invoke<AppSettings>("clear_groq_credentials")
    : unavailableOnWeb("การลบ Groq API key"),
  testGroq: () => tauriRuntime
    ? invoke<string>("test_groq_configuration")
    : unavailableOnWeb("การทดสอบ Groq key"),
  getGroqModelCatalog: () => tauriRuntime
    ? invoke<GroqModelOption[]>("get_groq_model_catalog")
    : webJson<GroqModelOption[]>("/api/v1/models"),
  updateGroqModels: (incomingSttModel: string, microphoneSttModel: string, translationModel: string) => tauriRuntime
    ? invoke<AppSettings>("update_groq_models", { incomingSttModel, microphoneSttModel, translationModel })
    : webCommand<AppSettings>("update_groq_models", {
      incoming_stt_model: incomingSttModel,
      microphone_stt_model: microphoneSttModel,
      translation_model: translationModel,
    }),
  updateHotkeys: (hotkeys: HotkeySettings) => tauriRuntime
    ? invoke<AppSettings>("update_hotkeys", { hotkeys })
    : webCommand<AppSettings>("update_hotkeys", { hotkeys }),
  updateOverlay: (overlay: OverlaySettings) => tauriRuntime
    ? invoke<AppSettings>("update_overlay_settings", { overlay })
    : webCommand<AppSettings>("update_overlay_settings", { overlay }),
  updateVad: (vad: VadSettings) => tauriRuntime
    ? invoke<AppSettings>("update_vad_settings", { vad })
    : webCommand<AppSettings>("update_vad_settings", { vad }),
  updateCaptureMode: (mode: CaptureMode) => tauriRuntime
    ? invoke<AppSettings>("update_capture_mode", { mode })
    : webCommand<AppSettings>("update_capture_mode", { mode }),
  updateOutputDevice: (deviceId?: string) => tauriRuntime
    ? invoke<AppSettings>("update_output_device", { deviceId: deviceId ?? null })
    : webCommand<AppSettings>("update_output_device", { device_id: deviceId ?? null }),
  updateRescueScan: (enabled: boolean) => tauriRuntime
    ? invoke<AppSettings>("update_rescue_scan", { enabled })
    : webCommand<AppSettings>("update_rescue_scan", { enabled }),
  updateGlossary: (glossary: GlossaryTerm[]) => tauriRuntime
    ? invoke<AppSettings>("update_glossary", { glossary })
    : webCommand<AppSettings>("update_glossary", { glossary }),
  setOverlayEditMode: (enabled: boolean) => tauriRuntime
    ? invoke<boolean>("set_overlay_edit_mode", { enabled })
    : webCommand<boolean>("set_overlay_edit_mode", { enabled }),
  setOverlayPresentation: (presentation: OverlayPresentation) => tauriRuntime
    ? invoke<void>("set_overlay_presentation", { presentation })
    : Promise.resolve(),
  saveOverlayBounds: () => tauriRuntime ? invoke<void>("save_overlay_bounds") : unavailableOnWeb("การบันทึกตำแหน่งหน้าต่าง Overlay"),
  startOverlayDrag: () => tauriRuntime ? invoke<void>("start_overlay_drag") : unavailableOnWeb("การลากหน้าต่าง Overlay"),
  copyLatestReply: () => tauriRuntime
    ? invoke<boolean>("copy_latest_reply")
    : webCommand<boolean>("copy_latest_reply"),
  restartWorker: () => tauriRuntime
    ? invoke<void>("restart_worker")
    : webCommand<void>("restart_worker"),
  injectDemo: () => tauriRuntime ? invoke<void>("inject_demo_transcript") : unavailableOnWeb("ข้อความทดลอง Overlay"),
  getWebCompanionInfo: () => tauriRuntime
    ? invoke<WebCompanionInfo>("get_web_companion_info")
    : Promise.resolve({ origin: window.location.origin, running: true }),
  openWebCompanion: () => tauriRuntime
    ? invoke<void>("open_web_companion")
    : Promise.resolve(),
};

export async function connectWebSnapshot(
  onSnapshot: (snapshot: AppSnapshot) => void,
  onDisconnected: (message: string) => void,
): Promise<() => void> {
  await ensureWebSession();
  let closed = false;
  let socket: WebSocket | undefined;
  let polling: number | undefined;
  let reconnect: number | undefined;
  let attempts = 0;

  const poll = async () => {
    if (closed) return;
    try {
      onSnapshot(await api.snapshot());
    } catch {
      onDisconnected("Desktop ปิดอยู่หรือ Web Companion ขาดการเชื่อมต่อ");
    }
  };
  const connect = () => {
    if (closed) return;
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    socket = new WebSocket(`${protocol}//${window.location.host}/api/v1/events`);
    socket.onopen = () => {
      attempts = 0;
      if (polling !== undefined) window.clearInterval(polling);
      polling = undefined;
    };
    socket.onmessage = (event) => {
      try { onSnapshot(JSON.parse(String(event.data)) as AppSnapshot); } catch { /* ignore malformed state */ }
    };
    socket.onclose = () => {
      if (closed) return;
      onDisconnected("กำลังเชื่อมต่อ Desktop ใหม่…");
      if (polling === undefined) polling = window.setInterval(() => void poll(), 2_000);
      attempts += 1;
      reconnect = window.setTimeout(connect, Math.min(10_000, 500 * 2 ** attempts));
    };
  };
  connect();
  return () => {
    closed = true;
    socket?.close();
    if (polling !== undefined) window.clearInterval(polling);
    if (reconnect !== undefined) window.clearTimeout(reconnect);
  };
}
