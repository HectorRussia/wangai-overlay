import { isPreviewMode, previewOutputDevices, previewRunningApps, previewSnapshot } from "./preview";
import type { AppSnapshot, CaptureSource } from "./types";

let current: AppSnapshot | undefined;
let query = "";
export function getPreviewSnapshot(): AppSnapshot {
  if (!isPreviewMode()) throw new Error("Preview is browser-only");
  if (!current || query !== window.location.search) { query = window.location.search; current = previewSnapshot(); }
  return current;
}
export async function previewCommand(name: string, args: unknown[]): Promise<unknown> {
  const before = getPreviewSnapshot();
  const next = structuredClone(before);
  const value = args[0];
  switch (name) {
    case "snapshot": return before;
    case "listRunningApps": return previewRunningApps;
    case "listProcesses": return previewRunningApps.flatMap(app => app.roots);
    case "listOutputDevices": return previewOutputDevices;
    case "getWebCompanionInfo": return { origin: window.location.origin, running: false };
    case "openSettingsWindow": window.location.hash = "#/settings/overview"; return;
    case "openWebCompanion": return;
    case "toggleListening": next.runtime.listening = !next.runtime.listening; break;
    case "setListening": next.runtime.listening = Boolean(value); break;
    case "selectListeningSource": {
      const source = value as CaptureSource;
      next.settings.listeningSource = { executablePath: source.executablePath, executableName: source.name, displayName: source.displayName, lastPid: source.pid };
      next.runtime.attachedSource = source; break;
    }
    case "updateCaptureMode": next.settings.captureMode = value as AppSnapshot["settings"]["captureMode"]; break;
    case "updateOutputDevice": next.settings.outputDeviceId = value as string | undefined; break;
    case "updateRescueScan": next.settings.rescueScanEnabled = Boolean(value); break;
    case "updateHotkeys": next.settings.hotkeys = value as AppSnapshot["settings"]["hotkeys"]; break;
    case "updateOverlay": next.settings.overlay = value as AppSnapshot["settings"]["overlay"]; break;
    case "updateVad": next.settings.vad = value as AppSnapshot["settings"]["vad"]; break;
    case "updateGlossary": next.settings.glossary = value as AppSnapshot["settings"]["glossary"]; break;
    case "setOverlayEditMode": next.runtime.overlayEditMode = Boolean(value); break;
    case "restartWorker": next.runtime.workerReady = true; next.runtime.lastError = undefined; break;
    case "copyLatestReply": return Boolean(next.history.find(item => item.stream === "microphone" && item.translatedText));
    case "probeRecentAudio": case "setOverlayPresentation": case "saveOverlayBounds": case "startOverlayDrag": return;
    default: throw new Error(`Unavailable in local preview: ${name}`);
  }
  if (["toggleListening", "setListening", "selectListeningSource", "updateCaptureMode"].includes(name)) {
    const mixed = next.settings.captureMode === "system_output";
    next.runtime.statusMessage = next.runtime.listening ? `กำลังฟัง ${mixed ? "System Output · MIXED" : next.runtime.attachedSource?.displayName ?? "แอปที่เลือก"}` : "พร้อมเริ่มฟัง";
    next.runtime.effectiveCapturePid = mixed ? undefined : next.runtime.attachedSource?.pid;
  }
  current = next;
  window.dispatchEvent(new Event("wangai-preview-changed"));
  return next.settings;
}
