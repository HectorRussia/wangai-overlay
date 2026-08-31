import {
  AudioLines,
  Check,
  ChevronRight,
  Cloud,
  Gamepad2,
  Headphones,
  History,
  LoaderCircle,
  LockKeyhole,
  MessageSquareText,
  Settings,
  ShieldCheck,
  TriangleAlert,
  Wifi,
} from "lucide-react";
import { advancedHref, settingsHref } from "./router";
import type { AppSettings, RuntimeState, SubtitleItem } from "./types";

type ReadyRoomProps = {
  settings: AppSettings;
  runtime: RuntimeState;
  history: SubtitleItem[];
  busy?: string;
  previewMode: boolean;
  onToggleListening: () => void;
  onOpenGamePicker: () => void;
  onOpenVoicePicker: () => void;
};

type ReadinessTone = "ready" | "waiting" | "warning" | "setup";

type Readiness = {
  label: string;
  detail: string;
  tone: ReadinessTone;
};

export function ReadyRoom({
  settings,
  runtime,
  history,
  busy,
  previewMode,
  onToggleListening,
  onOpenGamePicker,
  onOpenVoicePicker,
}: ReadyRoomProps) {
  const game = gameReadiness(settings, runtime);
  const voice = voiceReadiness(settings, runtime);
  const groq = groqReadiness(settings, runtime);
  const configured = Boolean(settings.selectedProcess)
    && settings.voiceChat.enabled
    && Boolean(settings.voiceChat.selectedProcess || settings.voiceChat.autoDetect)
    && settings.groq.configured
    && !runtime.budgetExhausted;
  const recent = history.find((item) => item.status === "success") ?? history[0];
  const quotaPercent = Math.min(
    100,
    settings.groq.monthlyBudgetMicrousd > 0
      ? (settings.groq.estimatedSpendMicrousd / settings.groq.monthlyBudgetMicrousd) * 100
      : 0,
  );

  return (
    <div className="ready-room-grid">
      <section className="ready-room-panel" aria-labelledby="ready-room-title">
        <div className="ready-room-intro">
          <div>
            <p className="eyebrow">READY ROOM</p>
            <h2 id="ready-room-title">
              {configured ? "พร้อม 3 ขั้นตอน — เริ่มฟังได้เลย" : "ตั้งค่าอีกนิด แล้วเริ่มฟังได้เลย"}
            </h2>
            <p>เช็กเกม เสียงเพื่อน และระบบแปลจากหน้าจอเดียว</p>
          </div>
          <span className={`ready-summary ${configured ? "is-ready" : "is-warning"}`}>
            {configured ? <Check /> : <TriangleAlert />}
            {configured ? "พร้อมใช้งาน" : "ต้องตรวจสอบ"}
          </span>
        </div>

        <div className="ready-source-list">
          <SourceReadinessRow
            action="เปลี่ยน"
            icon={<Gamepad2 />}
            index={1}
            meterLabel="ระดับเสียงเกม"
            meterValue={runtime.gameAudioPeakDbfs}
            name={settings.selectedProcess?.displayName ?? "ยังไม่ได้เลือกเกม"}
            onAction={onOpenGamePicker}
            readiness={game}
            title="เกม"
          />
          <SourceReadinessRow
            action="เปลี่ยน"
            icon={<Wifi />}
            index={2}
            meterLabel="ระดับเสียง Voice Chat"
            meterValue={runtime.voiceChatAudioPeakDbfs}
            name={settings.voiceChat.selectedProcess?.displayName ?? (settings.voiceChat.autoDetect ? "ค้นหา Discord อัตโนมัติ" : "ยังไม่ได้เลือก Voice Chat")}
            onAction={onOpenVoicePicker}
            readiness={voice}
            title="Voice chat"
          />
          <SourceReadinessRow
            action="ตั้งค่า"
            actionHref={advancedHref("ai")}
            icon={<Cloud />}
            index={3}
            meterLabel="งบ Groq ที่ใช้ไป"
            meterPercent={quotaPercent}
            name={settings.groq.configured ? "Groq Whisper + Translation" : "ยังไม่ได้ใส่ API key"}
            readiness={groq}
            title="แปลภาษา"
          />
        </div>

        <div className="ready-privacy">
          <ShieldCheck />
          <div>
            <strong>วางใจเรื่องความเป็นส่วนตัว</strong>
            <span>เสียงอยู่ในเครื่องจนกว่าจะพบคำพูด และ WANGAI ไม่สร้างไฟล์เสียงบนดิสก์</span>
          </div>
          <LockKeyhole />
        </div>

        <section className="ready-recent" aria-labelledby="recent-title">
          <div className="ready-section-heading">
            <div>
              <p className="eyebrow">LIVE MEMORY</p>
              <h2 id="recent-title">บทสนทนาล่าสุด</h2>
            </div>
            <a href={settingsHref("history")}>ดูทั้งหมด <ChevronRight /></a>
          </div>
          {recent ? <RecentConversation item={recent} /> : (
            <div className="ready-empty">
              <MessageSquareText />
              <div><strong>ยังไม่มีบทสนทนา</strong><span>ข้อความแรกจะปรากฏที่นี่เมื่อเริ่มฟัง</span></div>
            </div>
          )}
        </section>
      </section>

      <div className="ready-footer-actions">
        <a href={settingsHref("history")}><History />ประวัติ</a>
        <a href={advancedHref("audio")}><Settings />การตั้งค่าขั้นสูง</a>
        {previewMode && <span>ข้อมูลจำลองสำหรับ Browser Preview</span>}
      </div>

      <button
        className={`ready-listen-button ${runtime.listening ? "is-listening" : ""}`}
        disabled={busy === "listen" || previewMode}
        onClick={onToggleListening}
      >
        {busy === "listen" ? <LoaderCircle className="animate-spin" /> : runtime.listening ? <AudioLines /> : <Headphones />}
        <span>{runtime.listening ? "หยุดฟัง · F8" : "เริ่มฟัง · F8"}</span>
        <small>{runtime.listening ? "กำลังแปลแบบเรียลไทม์" : "พร้อมทำงานในเกม"}</small>
      </button>
    </div>
  );
}

function SourceReadinessRow({
  index,
  icon,
  title,
  name,
  readiness,
  meterLabel,
  meterValue,
  meterPercent,
  action,
  actionHref,
  onAction,
}: {
  index: number;
  icon: React.ReactNode;
  title: string;
  name: string;
  readiness: Readiness;
  meterLabel: string;
  meterValue?: number;
  meterPercent?: number;
  action: string;
  actionHref?: string;
  onAction?: () => void;
}) {
  const percent = meterPercent ?? levelPercent(meterValue);
  const actionClass = "ready-change-button";
  return (
    <article className={`ready-source-row tone-${readiness.tone}`}>
      <span className="ready-step">{index}</span>
      <span className="ready-source-icon">{icon}</span>
      <div className="ready-source-name"><strong>{title}</strong><span title={name}>{name}</span></div>
      <div className="ready-source-status">
        <span className="ready-status-icon">{readiness.tone === "ready" || readiness.tone === "waiting" ? <Check /> : <TriangleAlert />}</span>
        <span><strong>{readiness.label}</strong><small>{readiness.detail}</small></span>
      </div>
      <div className="ready-meter-wrap">
        <span>{meterLabel}</span>
        <div aria-label={meterLabel} aria-valuemax={100} aria-valuemin={0} aria-valuenow={Math.round(percent)} className="ready-meter" role="meter">
          {Array.from({ length: 18 }, (_, index) => (
            <span className={index < Math.round((percent / 100) * 18) ? "is-active" : ""} key={index} />
          ))}
        </div>
      </div>
      {actionHref
        ? <a className={actionClass} href={actionHref}>{action}</a>
        : <button className={actionClass} onClick={onAction}>{action}</button>}
    </article>
  );
}

function RecentConversation({ item }: { item: SubtitleItem }) {
  const source = item.stream === "voice_chat"
    ? item.sourceDisplayName ?? "VOICE CHAT"
    : item.stream === "microphone"
      ? "F9 REPLY"
      : item.sourceDisplayName ?? "GAME";
  return (
    <article className="ready-conversation-row">
      <span className="ready-conversation-icon"><MessageSquareText /></span>
      <time>{new Date(item.createdAtMs).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })}</time>
      <div>
        <strong>{source}</strong>
        <span>{item.originalText}</span>
      </div>
      <ChevronRight />
      <p>{item.translatedText ?? (item.status === "pending" ? "กำลังแปล…" : "แปลไม่สำเร็จ")}</p>
    </article>
  );
}

function gameReadiness(settings: AppSettings, runtime: RuntimeState): Readiness {
  if (!settings.selectedProcess) return { label: "ต้องตั้งค่า", detail: "เลือกเกมที่ต้องการฟัง", tone: "setup" };
  if (!runtime.listening) return { label: "พร้อม", detail: "รอเริ่มฟัง", tone: "ready" };
  if (runtime.captureWarning) return { label: "ไม่ได้ยินเสียง", detail: "เปิดวิธีแก้ปัญหาเสียง", tone: "warning" };
  if (!runtime.attachedProcess) return { label: "หาแอปไม่พบ", detail: "ตรวจว่าเกมยังเปิดอยู่", tone: "warning" };
  if (runtime.gameAudioPeakDbfs === undefined) return { label: "รอสัญญาณเสียง", detail: "กำลังเชื่อมต่อเสียงเกม", tone: "waiting" };
  return { label: "พร้อม", detail: runtime.gameVadActive ? "กำลังตรวจพบคำพูด" : "กำลังรับเสียงเกม", tone: "ready" };
}

function voiceReadiness(settings: AppSettings, runtime: RuntimeState): Readiness {
  if (!settings.voiceChat.enabled) return { label: "ต้องตั้งค่า", detail: "เปิดการจับ Voice Chat", tone: "setup" };
  if (!settings.voiceChat.selectedProcess && !settings.voiceChat.autoDetect) return { label: "ต้องตั้งค่า", detail: "เลือก Discord หรือแอปเสียง", tone: "setup" };
  if (!runtime.listening) return { label: "พร้อม", detail: "รอเริ่มฟัง", tone: "ready" };
  if (runtime.voiceChatCaptureWarning) return { label: "ไม่ได้ยินเสียง", detail: "เปิดวิธีแก้ปัญหาเสียง", tone: "warning" };
  if (settings.gameCaptureMode === "process_tree" && !runtime.voiceChatAttachedProcess) return { label: "หาแอปไม่พบ", detail: "ตรวจว่า Discord ยังเปิดอยู่", tone: "warning" };
  if (settings.gameCaptureMode === "process_tree" && runtime.voiceChatAudioPeakDbfs === undefined) return { label: "รอสัญญาณเสียง", detail: "กำลังเชื่อมต่อ Voice Chat", tone: "waiting" };
  return { label: "พร้อม", detail: settings.gameCaptureMode === "system_output" ? "รวมอยู่ในเสียง MIXED" : "กำลังรับเสียงเพื่อน", tone: "ready" };
}

function groqReadiness(settings: AppSettings, runtime: RuntimeState): Readiness {
  if (!settings.groq.configured) return { label: "ต้องตั้งค่า", detail: "เพิ่ม Groq API key", tone: "setup" };
  if (runtime.budgetExhausted) return { label: "งบเดือนนี้เต็ม", detail: "ตรวจงบก่อนเริ่มแปล", tone: "warning" };
  if (runtime.groqSttBusy) return { label: "กำลังแปล", detail: "กำลังประมวลผลวลีล่าสุด", tone: "ready" };
  return { label: "พร้อม", detail: "Whisper และคำแปลพร้อมทำงาน", tone: "ready" };
}

function levelPercent(dbfs?: number): number {
  if (dbfs === undefined) return 0;
  return Math.max(0, Math.min(100, ((dbfs + 60) / 60) * 100));
}
