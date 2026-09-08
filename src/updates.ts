import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

export type UpdateStatus = {
  revision: number;
  phase: "disabled" | "idle" | "checking" | "up_to_date" | "unpublished" | "available" | "downloading" | "installing" | "error";
  currentVersion: string;
  newVersion?: string | null;
  notes?: string | null;
  downloadedBytes: number;
  totalBytes?: number | null;
  message: string;
  canInstall: boolean;
};
function previewUpdate(): UpdateStatus | undefined {
  const query = new URLSearchParams(window.location.search);
  if (!query.has("preview") || !query.has("updatePreview")) return;
  const phase = query.get("updatePreview") === "downloading" ? "downloading" : "available";
  return { revision: 1, phase, currentVersion: "0.2.0", newVersion: "0.2.1", notes: "ตัวอย่าง Release notes — ปรับปรุงความเสถียร\n<script>แสดงเป็นข้อความเท่านั้น</script>", downloadedBytes: 42 * 1048576, totalBytes: 120 * 1048576, canInstall: phase === "available", message: "ข้อมูลจำลองสำหรับตรวจ UI อัปเดต ไม่มีการดาวน์โหลดหรือติดตั้งจริง" };
}
export const desktopUpdates = {
  available: () => "__TAURI_INTERNALS__" in window || Boolean(previewUpdate()),
  get: () => previewUpdate() ? Promise.resolve(previewUpdate()!) : invoke<UpdateStatus>("get_update_status"),
  check: () => previewUpdate() ? Promise.resolve(previewUpdate()!) : invoke<UpdateStatus>("check_for_updates"),
  install: () => previewUpdate() ? Promise.resolve({ ...previewUpdate()!, revision: 2, phase: "downloading" as const, canInstall: false }) : invoke<UpdateStatus>("download_and_install_update"),
  subscribe: (onStatus: (status: UpdateStatus) => void) => previewUpdate() ? Promise.resolve(() => {}) : listen<UpdateStatus>("update-status", e => onStatus(e.payload)),
};
