import { AudioLines, Check, ChevronRight, Cloud, Globe2, Headphones, History, LoaderCircle, LockKeyhole, MessageSquareText, Radio, Settings, ShieldCheck, TriangleAlert } from "lucide-react";
import { advancedHref, settingsHref } from "./router";
import type { AppSettings, RuntimeState, SubtitleItem } from "./types";

type Props = {
  settings: AppSettings;
  runtime: RuntimeState;
  history: SubtitleItem[];
  busy?: string;
  previewMode: boolean;
  onToggleListening: () => void;
  onOpenSourcePicker: () => void;
  onOpenWebCompanion?: () => void;
  webCompanionOrigin?: string;
  webRuntime: boolean;
};
type Tone = "ready" | "waiting" | "warning" | "setup";
type Readiness = { label: string; detail: string; tone: Tone };

export function ReadyRoom({ settings, runtime, history, busy, previewMode, onToggleListening, onOpenSourcePicker, onOpenWebCompanion, webCompanionOrigin, webRuntime }: Props) {
  const incoming = incomingReadiness(settings, runtime);
  const groq = groqReadiness(settings, runtime);
  const configured = Boolean(settings.listeningSource) && settings.groq.configured && !runtime.budgetExhausted;
  const recent = history.find((item) => item.status === "success") ?? history[0];
  const quotaPercent = Math.min(100, settings.groq.monthlyBudgetMicrousd > 0 ? (settings.groq.estimatedSpendMicrousd / settings.groq.monthlyBudgetMicrousd) * 100 : 0);
  return <div className="ready-room-grid">
    <section className="ready-room-panel" aria-labelledby="ready-room-title">
      <div className="ready-room-intro"><div><p className="eyebrow">READY ROOM</p><h2 id="ready-room-title">{configured ? "พร้อมแล้ว — เลือกแอปหนึ่งตัวแล้วเริ่มฟัง" : "ตั้งค่าอีกนิด แล้วเริ่มฟังได้เลย"}</h2><p>WANGAI ฟังแอปที่คุณเลือกครั้งละหนึ่งโปรแกรม ไม่มีเสียงซ้ำจากแหล่งอื่น</p></div><span className={`ready-summary ${configured ? "is-ready" : "is-warning"}`}>{configured ? <Check /> : <TriangleAlert />}{configured ? "พร้อมใช้งาน" : "ต้องตรวจสอบ"}</span></div>
      <div className="ready-source-list">
        <Row action="เปลี่ยน" icon={<Radio />} index={1} meterLabel="ระดับเสียงขาเข้า" meterValue={runtime.audioPeakDbfs} name={settings.listeningSource?.displayName ?? "ยังไม่ได้เลือกแอป"} onAction={onOpenSourcePicker} readiness={incoming} title="แหล่งเสียงที่ฟัง" />
        <Row action="ตั้งค่า" actionHref={advancedHref("ai")} icon={<Cloud />} index={2} meterLabel="งบ Groq ที่ใช้ไป" meterPercent={quotaPercent} name={settings.groq.configured ? "Groq Whisper + Translation" : "ยังไม่ได้ใส่ API key"} readiness={groq} title="การแปล" />
      </div>
      <div className="ready-privacy"><ShieldCheck /><div><strong>วางใจเรื่องความเป็นส่วนตัว</strong><span>เสียงอยู่ในเครื่องจนกว่าจะพบคำพูด และ WANGAI ไม่สร้างไฟล์เสียงบนดิสก์</span></div><LockKeyhole /></div>
      <section className="ready-recent" aria-labelledby="recent-title"><div className="ready-section-heading"><div><p className="eyebrow">LIVE MEMORY</p><h2 id="recent-title">บทสนทนาล่าสุด</h2></div><a href={settingsHref("history")}>ดูทั้งหมด <ChevronRight /></a></div>{recent ? <Recent item={recent} /> : <div className="ready-empty"><MessageSquareText /><div><strong>ยังไม่มีบทสนทนา</strong><span>ข้อความแรกจะปรากฏที่นี่เมื่อเริ่มฟัง</span></div></div>}</section>
    </section>
    <div className="ready-footer-actions"><a href={settingsHref("history")}><History />ประวัติ</a><a href={advancedHref("audio")}><Settings />การตั้งค่าขั้นสูง</a>{!webRuntime && onOpenWebCompanion && <button title={webCompanionOrigin} onClick={onOpenWebCompanion}><Globe2 />เปิด Web App</button>}{webRuntime && <span><Globe2 />Web Companion · เชื่อมต่อ Desktop</span>}{previewMode && <span>ข้อมูลจำลองสำหรับ Browser Preview</span>}</div>
    <button className={`ready-listen-button ${runtime.listening ? "is-listening" : ""}`} disabled={busy === "listen" || previewMode || !configured} onClick={onToggleListening}>{busy === "listen" ? <LoaderCircle className="animate-spin" /> : runtime.listening ? <AudioLines /> : <Headphones />}<span>{runtime.listening ? "หยุดฟัง · F8" : "เริ่มฟัง · F8"}</span><small>{runtime.listening ? `กำลังฟัง ${settings.captureMode === "system_output" ? "MIXED" : settings.listeningSource?.displayName ?? "แอปที่เลือก"}` : "พร้อมแปลเสียงขาเข้า"}</small></button>
  </div>;
}

function Row({ index, icon, title, name, readiness, meterLabel, meterValue, meterPercent, action, actionHref, onAction }: { index: number; icon: React.ReactNode; title: string; name: string; readiness: Readiness; meterLabel: string; meterValue?: number | null; meterPercent?: number; action: string; actionHref?: string; onAction?: () => void }) {
  const percent = meterPercent ?? levelPercent(meterValue);
  return <article className={`ready-source-row tone-${readiness.tone}`}><span className="ready-step">{index}</span><span className="ready-source-icon">{icon}</span><div className="ready-source-name"><strong>{title}</strong><span title={name}>{name}</span></div><div className="ready-source-status"><span className="ready-status-icon">{readiness.tone === "ready" || readiness.tone === "waiting" ? <Check /> : <TriangleAlert />}</span><span><strong>{readiness.label}</strong><small>{readiness.detail}</small></span></div><div className="ready-meter-wrap"><span>{meterLabel}</span><div aria-label={meterLabel} aria-valuemax={100} aria-valuemin={0} aria-valuenow={Math.round(percent)} className="ready-meter" role="meter">{Array.from({ length: 18 }, (_, i) => <span className={i < Math.round((percent / 100) * 18) ? "is-active" : ""} key={i} />)}</div></div>{actionHref ? <a className="ready-change-button" href={actionHref}>{action}</a> : <button className="ready-change-button" onClick={onAction}>{action}</button>}</article>;
}

function Recent({ item }: { item: SubtitleItem }) {
  const source = item.stream === "microphone" ? "F9 REPLY" : item.sourceDisplayName ?? "INCOMING";
  return <article className="ready-conversation-row"><span className="ready-conversation-icon"><MessageSquareText /></span><time>{new Date(item.createdAtMs).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })}</time><div><strong>{source}</strong><span>{item.originalText}</span></div><ChevronRight /><p>{item.translatedText ?? (item.status === "pending" ? "กำลังแปล…" : "แปลไม่สำเร็จ")}</p></article>;
}

function incomingReadiness(settings: AppSettings, runtime: RuntimeState): Readiness {
  if (!settings.listeningSource) return { label: "ต้องตั้งค่า", detail: "เลือกเกม Discord หรือ browser", tone: "setup" };
  if (!runtime.listening) return { label: "พร้อม", detail: "รอเริ่มฟัง", tone: "ready" };
  if (runtime.captureWarning) return { label: "ไม่ได้ยินเสียง", detail: "เปิดวิธีแก้ปัญหาเสียง", tone: "warning" };
  if (!runtime.attachedSource) return { label: "หาแอปไม่พบ", detail: `ตรวจว่า ${settings.listeningSource.displayName} ยังเปิดอยู่`, tone: "warning" };
  if (runtime.audioLastSeenAtMs == null) return { label: "ยังไม่มี audio frame", detail: "กำลังเชื่อมต่อแหล่งเสียง", tone: "waiting" };
  if ((runtime.audioPeakDbfs ?? -96) <= -90) return { label: "Digital silence", detail: "แอปยังไม่มีเสียงออก", tone: "warning" };
  if (!runtime.vadActive) return { label: "กำลังฟัง", detail: settings.captureMode === "system_output" ? "รับเสียง MIXED · VAD ยังไม่พบคำพูด" : "VAD ยังไม่พบคำพูด", tone: "waiting" };
  return { label: "กำลังตรวจพบคำพูด", detail: settings.captureMode === "system_output" ? "แหล่งข้อความจะแสดง MIXED" : `รับเสียงจาก ${settings.listeningSource.displayName}`, tone: "ready" };
}
function groqReadiness(settings: AppSettings, runtime: RuntimeState): Readiness {
  if (!settings.groq.configured) return { label: "ต้องตั้งค่า", detail: "เพิ่ม Groq API key ใน Desktop", tone: "setup" };
  if (runtime.budgetExhausted) return { label: "งบเดือนนี้เต็ม", detail: "ตรวจงบก่อนเริ่มแปล", tone: "warning" };
  if (runtime.groqSttBusy) return { label: "กำลังแปล", detail: "กำลังประมวลผลวลีล่าสุด", tone: "ready" };
  return { label: "พร้อม", detail: "Whisper และคำแปลพร้อมทำงาน", tone: "ready" };
}
function levelPercent(dbfs?: number | null): number { return dbfs == null ? 0 : Math.max(0, Math.min(100, ((dbfs + 60) / 60) * 100)); }
