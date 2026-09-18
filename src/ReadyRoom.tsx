import { AudioLines, Check, ChevronRight, Headphones, Info, LoaderCircle, MessageSquareText, ShieldCheck, Square, TriangleAlert } from "lucide-react";
import { advancedHref, settingsHref } from "./router";
import type { AppSettings, RuntimeState, SubtitleItem } from "./types";
import { useEffect, type ReactNode } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { GlassSurface } from "./GlassSurface";

type Props = {
  settings: AppSettings; runtime: RuntimeState; history: SubtitleItem[]; busy?: string;
  previewMode: boolean; onToggleListening: () => void; onOpenSourcePicker: () => void;
  onOpenWebCompanion?: () => void; webCompanionOrigin?: string; webRuntime: boolean; notification?: ReactNode;
};
type Readiness = { label: string; detail: string; tone: "ready" | "waiting" | "warning" | "setup" };

export function ReadyRoom({ settings, runtime, history, busy, previewMode, onToggleListening, onOpenSourcePicker, webRuntime, notification }: Props) {
  useEffect(() => {
    if (webRuntime || previewMode || !isTauri()) return;
    const frame = requestAnimationFrame(() => { void invoke("portable_frontend_ready").catch(() => {}); });
    return () => cancelAnimationFrame(frame);
  }, [webRuntime, previewMode]);
  const incoming = incomingReadiness(settings, runtime);
  const ai = aiReadiness(runtime);
  const configured = Boolean(settings.listeningSource) && runtime.workerReady && ["connected", "ready"].includes(runtime.aiService.state);
  const recent = history.find(item => item.status === "success") ?? history[0];
  const mixed = settings.captureMode === "system_output";
  const name = mixed ? "System Output" : settings.listeningSource?.displayName ?? "ยังไม่ได้เลือกแอป";
  const percent = runtime.listening ? levelPercent(runtime.audioPeakDbfs) : 0;
  return <div className="studio-ready" data-ready-room>
    <header className="studio-heading"><p className="eyebrow">READY ROOM</p><h1 id="ready-room-title">{configured ? "พร้อมฟัง พร้อมเข้าใจ" : "ตั้งค่าอีกนิด แล้วเริ่มฟังได้เลย"}</h1><p>ฟังเสียงที่เลือก แล้วอ่านคำแปลได้ทันที</p></header>
    {notification && <div className="studio-notice">{notification}</div>}
    <section aria-label="แหล่งเสียงที่ฟัง">
      <GlassSurface className="studio-controls">
        <span className="studio-source-icon"><Headphones /></span>
        <div className="studio-source"><strong title={name}>{name}</strong><span>{mixed ? "MIXED · เสียงรวมจากเครื่อง" : "Process Tree · ฟังเฉพาะแอปที่เลือก"}</span></div>
        <button className="glass-button source-change" onClick={onOpenSourcePicker}>เปลี่ยน</button>
        <div className="studio-meter" role="meter" aria-label="ระดับเสียงขาเข้า" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(percent)}>{Array.from({ length: 20 }, (_, i) => <span className={i < Math.round(percent / 5) ? "is-active" : ""} key={i} />)}</div>
        <button className="studio-listen" disabled={busy === "listen" || (!runtime.listening && !configured)} onClick={onToggleListening}>
          {busy === "listen" ? <LoaderCircle className="animate-spin" /> : runtime.listening ? <Square fill="currentColor" /> : <Headphones />}<span>{runtime.listening ? "หยุดฟัง" : "เริ่มฟัง"} · {settings.hotkeys.toggleListening}</span>
        </button>
      </GlassSurface>
      {(incoming.tone !== "ready" || !runtime.listening) && <div className={`studio-capture-status tone-${incoming.tone}`}><span>{incoming.label}</span><small>{incoming.detail}</small>{incoming.tone === "warning" && <a href={advancedHref("audio")}>ตรวจสอบเสียง <ChevronRight /></a>}</div>}
    </section>
    <div className={`studio-service tone-${ai.tone}`}>
      <span className="studio-status-icon">{ai.tone === "warning" ? <TriangleAlert /> : ai.tone === "waiting" ? <LoaderCircle className="animate-spin" /> : <Check />}</span>
      <div><span className="sr-only">การแปล</span><strong>{ai.tone === "ready" && !runtime.aiSttBusy ? "บริการ AI พร้อมใช้งาน" : ai.label}</strong><small>{ai.detail}</small></div>
      {!configured && <span className="studio-attention">ต้องตรวจสอบ</span>}
      {ai.tone === "warning" && <a href={advancedHref("ai")}>ข้อมูล <ChevronRight /></a>}
    </div>
    <section className="studio-translation" aria-labelledby="recent-title">
      <div className="studio-translation-heading"><h2 id="recent-title">คำแปลล่าสุด</h2><a href={settingsHref("history")}>ดูประวัติ <ChevronRight /></a></div>
      {recent ? <article className="studio-latest"><strong lang={recent.stream === "microphone" ? "en" : "th"}>{recent.translatedText ?? (recent.status === "pending" ? "กำลังแปล…" : "แปลไม่สำเร็จ")}</strong><p lang={recent.stream === "microphone" ? "th" : "en"}>{recent.originalText}</p><span className="studio-source-badge"><AudioLines />{recent.stream === "microphone" ? "F9 REPLY" : recent.sourceDisplayName ?? "INCOMING"}</span></article>
        : <div className="studio-empty"><MessageSquareText /><h3>ยังไม่มีบทสนทนา</h3><p>เมื่อเริ่มฟัง คำแปลล่าสุดจะปรากฏที่นี่</p></div>}
    </section>
    <footer className="studio-footer"><p><Info />ประวัติเก็บเฉพาะรอบที่เปิดโปรแกรม</p><details><summary><ShieldCheck />ความเป็นส่วนตัว</summary><p>ส่งเฉพาะช่วงคำพูดและข้อความผ่านเซิร์ฟเวอร์ WANGAI ไปยัง AI provider ไม่บันทึกเนื้อหาบนเซิร์ฟเวอร์ เก็บสถิติการใช้งานด้วยรหัสติดตั้งแบบสุ่ม</p></details>{webRuntime && <small>Web Companion · เชื่อมต่อ Desktop</small>}{previewMode && <small>Preview · ข้อมูลจำลอง ไม่ส่งเสียงไปยัง AI</small>}</footer>
  </div>;
}

function incomingReadiness(settings: AppSettings, runtime: RuntimeState): Readiness {
  if (!settings.listeningSource) return { label: "ต้องตั้งค่า", detail: "เลือกเกม Discord หรือ browser", tone: "setup" };
  if (!runtime.workerReady) return { label: "ตัวตรวจคำพูดยังไม่พร้อม", detail: runtime.lastError ? "พบข้อผิดพลาด กรุณาตรวจข้อความแจ้งเตือน" : "กำลังเตรียม Silero VAD", tone: runtime.lastError ? "warning" : "waiting" };
  if (!runtime.listening) return { label: "พร้อม", detail: "รอเริ่มฟัง", tone: "ready" };
  if (runtime.captureWarning) return { label: "ไม่ได้ยินเสียง", detail: runtime.captureWarning, tone: "warning" };
  if (!runtime.attachedSource && settings.captureMode !== "system_output") return { label: "หาแอปไม่พบ", detail: `ตรวจว่า ${settings.listeningSource.displayName} ยังเปิดอยู่`, tone: "warning" };
  if (runtime.audioLastSeenAtMs == null) return { label: "ยังไม่มี audio frame", detail: "กำลังเชื่อมต่อแหล่งเสียง", tone: "waiting" };
  if ((runtime.audioPeakDbfs ?? -96) <= -90) return { label: "Digital silence", detail: "ยังไม่มีเสียงออกจากแหล่งที่เลือก", tone: "warning" };
  if (!runtime.vadActive) return { label: "กำลังฟัง", detail: "VAD ยังไม่พบคำพูด", tone: "waiting" };
  return { label: "กำลังตรวจพบคำพูด", detail: "รับเสียงจากแหล่งที่เลือก", tone: "ready" };
}
function aiReadiness(runtime: RuntimeState): Readiness {
  const service = runtime.aiService;
  if (service.state === "offline") return { label: "เชื่อมต่อไม่ได้", detail: service.message, tone: "warning" };
  if (service.state === "degraded") return { label: service.retryAfterMs ? "กำลังพัก" : "บริการขัดข้อง", detail: service.message, tone: "warning" };
  if (service.state === "connecting") return { label: "กำลังเชื่อมต่อ", detail: service.message, tone: "waiting" };
  if (runtime.aiSttBusy) return { label: "กำลังแปล", detail: "กำลังประมวลผลวลีล่าสุด", tone: "ready" };
  return { label: service.state === "ready" ? "พร้อม" : "เชื่อมต่อแล้ว", detail: service.message === "บริการ AI พร้อมใช้งาน" ? "" : service.message, tone: "ready" };
}
function levelPercent(dbfs?: number | null): number { return dbfs == null ? 0 : Math.max(0, Math.min(100, ((dbfs + 60) / 60) * 100)); }
