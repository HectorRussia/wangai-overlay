import { useEffect, useRef, useState } from "react";
import { desktopUpdates, type UpdateStatus } from "./updates";

const button = "settings-button min-h-10 shrink-0 rounded-xl border border-white/15 px-4 py-2 text-sm font-bold disabled:opacity-40";
export function UpdatePanel({ compact = false }: { compact?: boolean }) {
  const [status, setStatus] = useState<UpdateStatus>();
  const [error, setError] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [pending, setPending] = useState(false);
  const [dismissed, setDismissed] = useState(() => {
    try { return sessionStorage.getItem("wangai-update-dismissed") ?? ""; } catch { return ""; }
  });
  const updateButton = useRef<HTMLButtonElement>(null);
  const confirmButton = useRef<HTMLButtonElement>(null);
  const desktop = desktopUpdates.available();
  const accept = (next: UpdateStatus) => setStatus(previous => !previous || next.revision >= previous.revision ? next : previous);
  useEffect(() => { if (confirm) confirmButton.current?.focus(); }, [confirm]);
  useEffect(() => {
    if (!desktop) return;
    let alive = true;
    let stop: (() => void) | undefined;
    // Subscribe first; revisions reject a stale initial read after an event.
    void desktopUpdates.subscribe(next => { if (alive) accept(next); }).then(unlisten => {
      if (!alive) { unlisten(); return; }
      stop = unlisten;
      return desktopUpdates.get().then(next => { if (alive) accept(next); });
    }).catch(() => { if (alive) setError("อ่านสถานะอัปเดตไม่สำเร็จ กรุณาลองตรวจใหม่"); });
    return () => { alive = false; stop?.(); };
  }, [desktop]);
  const run = async (task: () => Promise<UpdateStatus>) => {
    setPending(true); setError("");
    try { accept(await task()); }
    catch { setError("ดำเนินการอัปเดตไม่สำเร็จ กรุณาลองใหม่"); }
    finally { setPending(false); setConfirm(false); }
  };
  if (!desktop) return compact ? null : <section className="update-panel"><h2>อัปเดต WANGAI</h2><p>ตรวจและติดตั้งอัปเดตจากหน้าตั้งค่า Desktop เท่านั้น</p></section>;
  if (compact && (!status?.newVersion || dismissed === status.newVersion)) return null;
  const working = pending || status?.phase === "checking" || status?.phase === "downloading" || status?.phase === "installing";
  const actions = status?.canInstall && !confirm && <div className="flex flex-wrap gap-3">
    <button ref={updateButton} className={`${button} bg-[#76dda0] text-[#15161a]`} disabled={working} onClick={() => setConfirm(true)}>อัปเดตเวอร์ชันใหม่</button>
    {compact && <button className={button} onClick={() => {
      setDismissed(status.newVersion ?? "");
      try { sessionStorage.setItem("wangai-update-dismissed", status.newVersion ?? ""); } catch { /* Session-only state still works. */ }
    }}>ไว้ภายหลัง</button>}
  </div>;
  const cancel = () => { setConfirm(false); requestAnimationFrame(() => updateButton.current?.focus()); };
  return <section aria-label="อัปเดต WANGAI" className="update-panel">
    <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
      <h2>WANGAI {status?.currentVersion ?? "…"}{status?.newVersion && <> → {status.newVersion}</>}</h2>
      {compact && actions}
      {!compact && <button className={button} disabled={working || status?.phase === "disabled"} onClick={() => void run(desktopUpdates.check)}>ตรวจอัปเดต</button>}
    </div>
    <p role="status">{status?.message ?? "กำลังอ่านสถานะอัปเดต"}</p>
    {error && <p role="alert">{error}</p>}
    {status?.notes && <details><summary>รายละเอียดเวอร์ชันใหม่</summary><p className="update-notes">{status.notes}</p></details>}
    {status?.phase === "downloading" && <>
      <progress aria-label="ความคืบหน้าดาวน์โหลดอัปเดต" max={status.totalBytes ?? 1} value={status.totalBytes ? status.downloadedBytes : undefined} />
      <span>{(status.downloadedBytes / 1048576).toFixed(1)} MB{status.totalBytes ? ` / ${(status.totalBytes / 1048576).toFixed(1)} MB` : ""}</span>
    </>}
    {confirm ? <div role="group" aria-label="ยืนยันอัปเดต" className="space-y-3" onKeyDown={e => { if (e.key === "Escape" && !working) { e.stopPropagation(); cancel(); } }}>
      <p>หลังดาวน์โหลดและตรวจลายเซ็น แอปจะหยุดฟังและปิดเพื่อติดตั้ง การตั้งค่ายังอยู่ แต่ History ในรอบนี้จะหายเมื่อปิดแอป</p>
      <div className="flex flex-wrap gap-3">
        <button ref={confirmButton} className={button} disabled={working} onClick={() => void run(desktopUpdates.install)}>ยืนยันดาวน์โหลดและติดตั้ง</button>
        <button className={button} disabled={working} onClick={cancel}>ยกเลิก</button>
      </div>
    </div> : !compact && actions}
  </section>;
}
