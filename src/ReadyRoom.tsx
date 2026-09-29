import { AudioLines, Check, ChevronRight, Cloud, Globe2, Headphones, LoaderCircle, Mic, Radio, ShieldCheck, TriangleAlert } from "lucide-react";
import type { AppSettings, CaptureMode, RuntimeState } from "./types";
import { useEffect, type ReactNode } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { AudioWaveform } from "./AudioWaveform";

type Props = {
  settings: AppSettings;
  runtime: RuntimeState;
  busy?: string;
  previewMode: boolean;
  onToggleListening: () => void;
  onOpenSourcePicker: () => void;
  onCaptureModeChange?: (mode: CaptureMode) => void;
  onOpenWebCompanion?: () => void;
  webCompanionOrigin?: string;
  webRuntime: boolean;
  notification?: ReactNode;
  showSecondary?: boolean;
  showIntro?: boolean;
  microphoneName?: string | null;
  microphoneError?: boolean;
  onRefreshMicrophone?: () => void;
  onOpenMicrophonePicker?: () => void;
};
type Tone = "ready" | "waiting" | "warning" | "setup";
type Readiness = { label: string; detail: string; tone: Tone };

export function ReadyRoom({ settings, runtime, busy, previewMode, onToggleListening, onOpenSourcePicker, onCaptureModeChange, onOpenWebCompanion, webCompanionOrigin, webRuntime, notification, showSecondary = true, showIntro = true, microphoneName, microphoneError = false, onRefreshMicrophone, onOpenMicrophonePicker }: Props) {
  useEffect(() => {
    if (webRuntime || previewMode || !isTauri()) return;
    const frame = requestAnimationFrame(() => { void invoke("portable_frontend_ready").catch(() => {}); });
    return () => cancelAnimationFrame(frame);
  }, [webRuntime, previewMode]);
  const incoming = incomingReadiness(settings, runtime);
  const ai = aiReadiness(runtime);
  const microphone = microphoneReadiness(settings, runtime, microphoneName, microphoneError);
  const configured = Boolean(settings.listeningSource) && runtime.workerReady && ["connected", "ready"].includes(runtime.aiService.state);
  const needsSource = !settings.listeningSource;
  const readinessTitle = needsSource ? "เลือกแอปเพื่อเริ่ม" : runtime.listening ? "กำลังแปลเสียง" : "แปลเสียงสด";
  return <div className="ready-room-grid">
    {notification && <div className="ready-notification-slot">{notification}</div>}
    <section className="ready-room-panel" aria-labelledby={showIntro ? "ready-room-title" : undefined} aria-label={showIntro ? undefined : readinessTitle}>
      {showIntro && <div className="ready-room-intro"><div><p className="eyebrow">WANGAI LIVE</p><h2 id="ready-room-title">{readinessTitle}</h2><p>{needsSource ? "เลือกแอปที่ต้องการฟังก่อนเริ่มแปลเสียง" : "คำแปลภาษาไทยจะแสดงบน Overlay ระหว่างเล่นเกม"}</p></div></div>}
      <div className={`ready-primary-action ${needsSource ? "is-empty" : ""}`}><span className="ready-game-mark" aria-hidden="true"><Headphones /></span><div className="ready-primary-context"><small>{needsSource ? "แหล่งเสียง" : runtime.listening ? "แอปที่กำลังฟัง" : "แอปที่เลือก"}</small><strong>{settings.listeningSource?.displayName ?? "ยังไม่ได้เลือกแอป"}</strong><span>{runtime.listening ? "ฟังเสียงอยู่ · แปลเป็นไทยแบบสด" : configured ? "กด F8 เพื่อเชื่อมต่อเสียงจากแอป" : needsSource ? "เลือกเกมหรือแอปที่ต้องการฟัง" : "รอระบบเสียงหรือบริการ AI พร้อม"}</span></div>{needsSource ? <button aria-label="เลือกแอปที่จะฟัง" className="ready-listen-button is-select" onClick={onOpenSourcePicker}><Headphones /><span>เลือกแอป</span><small>ขั้นตอนแรก</small></button> : <button aria-describedby={!runtime.listening && !configured ? runtime.workerReady ? "ready-ai-status" : "ready-source-status" : undefined} className={`ready-listen-button ${runtime.listening ? "is-listening" : ""}`} disabled={busy === "listen" || previewMode || (!runtime.listening && !configured)} onClick={onToggleListening}>{busy === "listen" ? <LoaderCircle className="animate-spin" /> : runtime.listening ? <AudioLines /> : <Headphones />}<span>{runtime.listening ? "หยุดใช้งาน" : "เริ่มใช้งาน"}</span></button>}</div>
      <div className="ready-source-list">
        {!needsSource && <Row action="เปลี่ยน" actionAriaLabel="เปลี่ยนแอปที่ฟัง" className="incoming-row" icon={<Radio />} index={1} name={settings.listeningSource?.displayName ?? "แอปที่เลือก"} onAction={onOpenSourcePicker} readiness={incoming} statusId="ready-source-status" title="แหล่งเสียงที่ฟัง" waveform={{ label: "ระดับเสียงจากแอป", active: runtime.listening && Boolean(runtime.attachedSource), rmsDbfs: runtime.audioRmsDbfs, peakDbfs: runtime.audioPeakDbfs, sampleAt: runtime.audioLastSeenAtMs }} />}
        <Row action={onOpenMicrophonePicker ? "เปลี่ยน" : (microphoneError || microphoneName === null) && onRefreshMicrophone ? "ตรวจใหม่" : undefined} actionAriaLabel={onOpenMicrophonePicker ? "เปลี่ยนไมโครโฟน" : undefined} className="microphone-row" icon={<Mic />} index={needsSource ? 1 : 2} name={microphoneName || (microphoneError ? "ตรวจไมโครโฟนไม่ได้" : microphoneName === null ? "ไม่พบไมโครโฟน" : "กำลังตรวจไมโครโฟน")} onAction={onOpenMicrophonePicker ?? onRefreshMicrophone} readiness={microphone} title="ไมโครโฟนของเรา" waveform={{ label: "ระดับเสียงไมโครโฟน", active: runtime.microphoneActive, rmsDbfs: runtime.microphoneRmsDbfs, peakDbfs: runtime.microphonePeakDbfs, sampleAt: runtime.microphoneLastSeenAtMs }} />
        {!needsSource && <Row className="translation-row" icon={<Cloud />} index={3} name="อังกฤษ → ไทย" readiness={ai} statusId="ready-ai-status" title="การแปล" />}
      </div>
      {!needsSource && onCaptureModeChange && (settings.captureMode === "system_output" || (runtime.listening && runtime.captureWarning)) && <div className="ready-capture-recovery"><span>{settings.captureMode === "system_output" ? "กำลังฟังเสียงทั้งเครื่อง รวมเสียงจากแอปอื่น" : "ไม่ได้ยินเสียงจากแอปที่เลือก"}</span><button disabled={busy === "mode" || previewMode} onClick={() => onCaptureModeChange(settings.captureMode === "system_output" ? "process_tree" : "system_output")}>{settings.captureMode === "system_output" ? "กลับไปฟังเฉพาะแอป" : "ลองฟังเสียงทั้งเครื่อง"}</button></div>}
    </section>
    {showSecondary && <><details className="ready-privacy"><summary><ShieldCheck />ความเป็นส่วนตัวและการส่งข้อมูล <ChevronRight /></summary><p>ส่งเฉพาะช่วงคำพูดและข้อความผ่านเซิร์ฟเวอร์ WANGAI ไปยัง AI provider ไม่บันทึกเนื้อหาบนเซิร์ฟเวอร์ เก็บสถิติการใช้งานด้วยรหัสติดตั้งแบบสุ่ม</p></details><div className="ready-footer-actions">{!webRuntime && onOpenWebCompanion && <button title={webCompanionOrigin} onClick={onOpenWebCompanion}><Globe2 />เปิด Web App</button>}{webRuntime && <span><Globe2 />Web Companion · เชื่อมต่อ Desktop</span>}{previewMode && <span>ข้อมูลจำลองสำหรับ Browser Preview</span>}</div></>}
  </div>;
}

type Waveform = { label: string; active: boolean; rmsDbfs?: number | null; peakDbfs?: number | null; sampleAt?: number | null };

function Row({ index, icon, title, name, readiness, action, actionAriaLabel, onAction, statusId, className = "", waveform }: { index: number; icon: React.ReactNode; title: string; name: string; readiness: Readiness; action?: string; actionAriaLabel?: string; onAction?: () => void; statusId?: string; className?: string; waveform?: Waveform }) {
  return <article className={`ready-source-row tone-${readiness.tone} ${className} ${action ? "" : "no-action"} no-meter`}><span className="ready-step">{index}</span><span className="ready-source-icon">{icon}</span><div className={`ready-source-name ${waveform ? "with-wave" : ""}`}><strong>{title}</strong><span title={name}>{name}</span>{waveform && <AudioWaveform {...waveform} />}</div><div className="ready-source-status" id={statusId}><span className="ready-status-icon">{readiness.tone === "ready" || readiness.tone === "waiting" ? <Check /> : <TriangleAlert />}</span><span><strong>{readiness.label}</strong><small title={readiness.detail}>{readiness.detail}</small></span></div>{action && <button aria-label={actionAriaLabel} className="ready-change-button" onClick={onAction}>{action}</button>}</article>;
}

function microphoneReadiness(settings: AppSettings, runtime: RuntimeState, name?: string | null, error = false): Readiness {
  if (error) return { label: "ตรวจไมค์ไม่ได้", detail: "กดตรวจใหม่อีกครั้ง", tone: "warning" };
  if (name === null) return { label: "ไม่พบไมโครโฟน", detail: "กดเปลี่ยนเพื่อเลือกอุปกรณ์", tone: "warning" };
  if (name === undefined) return { label: "กำลังตรวจไมค์", detail: "ตรวจอุปกรณ์รับเสียงหลักของ Windows", tone: "waiting" };
  if (runtime.microphoneActive) return { label: "กำลังรับเสียง", detail: `ปล่อย ${settings.hotkeys.pushToTalk} เพื่อแปลเป็นอังกฤษ`, tone: "ready" };
  if (!["connected", "ready"].includes(runtime.aiService.state)) return { label: "ยังแปลตอบไม่ได้", detail: "รอบริการแปลเชื่อมต่อ", tone: "warning" };
  return { label: `กด ${settings.hotkeys.pushToTalk} ค้างเพื่อพูด`, detail: "เสียงไทย → ข้อความอังกฤษ", tone: "ready" };
}

function incomingReadiness(settings: AppSettings, runtime: RuntimeState): Readiness {
  if (!settings.listeningSource) return { label: "ยังไม่ได้เลือกแอป", detail: "กดเลือกแอปเพื่อเริ่มใช้งาน", tone: "setup" };
  if (!runtime.workerReady) return { label: "ตัวตรวจคำพูดยังไม่พร้อม", detail: runtime.lastError ? "พบข้อผิดพลาด กรุณาตรวจข้อความแจ้งเตือน" : "กำลังเตรียม Silero VAD", tone: runtime.lastError ? "warning" : "waiting" };
  if (!runtime.listening) return { label: "เลือกแล้ว", detail: "กด F8 เพื่อเริ่มใช้งาน", tone: "ready" };
  if (runtime.captureWarning) return { label: "ไม่ได้ยินเสียง", detail: "ตรวจเสียงในแอปและ Volume Mixer", tone: "warning" };
  if (!runtime.attachedSource) return { label: "หาแอปไม่พบ", detail: `ตรวจว่า ${settings.listeningSource.displayName} ยังเปิดอยู่`, tone: "warning" };
  if (runtime.audioLastSeenAtMs == null) return { label: "รอเสียงจากแอป", detail: "กำลังเชื่อมต่อแหล่งเสียง", tone: "waiting" };
  if ((runtime.audioPeakDbfs ?? -96) <= -90) return { label: "ยังไม่ได้ยินเสียง", detail: "ตรวจว่าแอปกำลังเล่นเสียง", tone: "warning" };
  if (!runtime.vadActive) return { label: "กำลังฟัง", detail: settings.captureMode === "system_output" ? "รอคำพูดจากเสียงรวม" : "รอคำพูดจากแอป", tone: "waiting" };
  return { label: "กำลังตรวจพบคำพูด", detail: settings.captureMode === "system_output" ? "แหล่งข้อความจะแสดง MIXED" : `รับเสียงจาก ${settings.listeningSource.displayName}`, tone: "ready" };
}
function aiReadiness(runtime: RuntimeState): Readiness {
  const service = runtime.aiService;
  if (service.state === "offline") return { label: "เชื่อมต่อไม่ได้", detail: service.message === "เชื่อมต่อบริการ AI ไม่สำเร็จ" ? "กำลังลองเชื่อมต่อใหม่" : service.message, tone: "warning" };
  if (service.state === "degraded") return { label: service.retryAfterMs ? "กำลังพัก" : "บริการขัดข้อง", detail: service.message, tone: "warning" };
  if (service.state === "connecting") return { label: "กำลังเชื่อมต่อ", detail: service.message, tone: "waiting" };
  if (runtime.aiSttBusy) return { label: "กำลังแปล", detail: "กำลังประมวลผลวลีล่าสุด", tone: "ready" };
  return { label: "พร้อม", detail: "แปลเสียงจากแอปได้", tone: "ready" };
}
