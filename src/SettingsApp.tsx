import { useCallback, useEffect, useState } from "react";
import appIcon from "../app-icon.png";
import { History, KeyRound, LoaderCircle, RefreshCw, Save, Settings2, SlidersHorizontal, TriangleAlert, Volume2 } from "lucide-react";
import { api } from "./api";
import { ProcessPickerDialog } from "./ProcessPickerDialog";
import { MicrophonePickerDialog } from "./MicrophonePickerDialog";
import { OverlayAppearancePreview } from "./OverlayAppearancePreview";
import { displayShortcut, shortcutFromKeydown } from "./hotkeyCapture";
import { AdvancedSettings } from "./AdvancedSettings";
import { ReadyRoom } from "./ReadyRoom";
import { UpdatePanel } from "./UpdatePanel";
import { type AdvancedSection, type SettingsTab } from "./router";
import { isPreviewMode, previewOutputDevices, previewMicrophoneDevices, previewNotification, previewListeningBusy } from "./preview";
import { useRunningApps } from "./useRunningApps";
import type { AudioOutputDevice, HotkeySettings, OverlaySettings, SubtitleItem } from "./types";
import { errorText, useSnapshot } from "./useSnapshot";

const button = "settings-button settings-button-secondary inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold disabled:opacity-40";
const primary = "settings-button settings-button-primary inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold disabled:opacity-40";
const input = "settings-input min-h-11 min-w-0 w-full rounded-xl px-3 text-sm outline-none";
const hotkeyLabels: Record<keyof HotkeySettings, string> = {
  toggleListening: "เริ่มหรือหยุดฟัง",
  pushToTalk: "กดพูดเพื่อแปลตอบ",
  copyLatest: "คัดลอกคำตอบล่าสุด",
  editOverlay: "จัดตำแหน่ง Overlay",
};
const isDesktop = () => "__TAURI_INTERNALS__" in window;
const isWeb = () => !isDesktop() && !isPreviewMode();
type Toast = { kind: "ok" | "error"; text: string };

export function SettingsApp({ activeTab, advancedSection }: { activeTab: SettingsTab; advancedSection?: AdvancedSection }) {
  const { snapshot, refresh, loadingError } = useSnapshot();
  const [devices, setDevices] = useState<AudioOutputDevice[]>([]);
  const [microphoneName, setMicrophoneName] = useState<string | null>();
  const [microphoneError, setMicrophoneError] = useState(false);
  const [microphones, setMicrophones] = useState<AudioOutputDevice[]>([]);
  const [microphoneLoading, setMicrophoneLoading] = useState(false);
  const [microphonePicker, setMicrophonePicker] = useState(false);
  const [picker, setPicker] = useState(false);
  const runningApps = useRunningApps(picker);
  const [busy, setBusy] = useState<string | undefined>(() => previewListeningBusy() ? "listen" : undefined);
  const [toast, setToast] = useState<Toast | undefined>(previewNotification);
  const [hotkeys, setHotkeys] = useState<HotkeySettings>();
  const [recordingHotkey, setRecordingHotkey] = useState<keyof HotkeySettings | null>(null);
  const [hotkeyError, setHotkeyError] = useState<string>();
  const [advancedOpen, setAdvancedOpen] = useState(Boolean(advancedSection && advancedSection !== "controls"));
  useEffect(() => { setAdvancedOpen(Boolean(advancedSection && advancedSection !== "controls")); }, [advancedSection]);
  const [overlay, setOverlay] = useState<OverlaySettings>();

  useEffect(() => {
    if (toast?.kind !== "ok") return;
    const timeout = window.setTimeout(() => setToast((current) => current === toast ? undefined : current), 3500);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  useEffect(() => {
    if (!snapshot) return;
    setHotkeys(snapshot.settings.hotkeys);
    setOverlay(snapshot.settings.overlay);
  }, [JSON.stringify(snapshot?.settings)]);

  const loadDevices = useCallback(async () => {
    try { setDevices(isPreviewMode() ? previewOutputDevices : await api.listOutputDevices()); }
    catch (error) { setToast({ kind: "error", text: errorText(error) }); }
  }, []);
  useEffect(() => { if (snapshot?.settings.captureMode === "system_output") void loadDevices(); }, [loadDevices, snapshot?.settings.captureMode]);
  const loadMicrophone = useCallback(async () => {
    setMicrophoneError(false);
    setMicrophoneLoading(true);
    try {
      const found = isPreviewMode() ? previewMicrophoneDevices : await api.listMicrophoneDevices();
      setMicrophones(found);
      const selectedId = snapshot?.settings.microphoneDeviceId;
      setMicrophoneName(selectedId ? found.find((device) => device.id === selectedId)?.name ?? null : found.find((device) => device.isDefault)?.name ?? null);
    }
    catch { setMicrophoneError(true); }
    finally { setMicrophoneLoading(false); }
  }, [snapshot?.settings.microphoneDeviceId]);
  useEffect(() => {
    void loadMicrophone();
    const refreshOnFocus = () => { void loadMicrophone(); };
    window.addEventListener("focus", refreshOnFocus);
    return () => window.removeEventListener("focus", refreshOnFocus);
  }, [loadMicrophone]);

  useEffect(() => {
    if (!recordingHotkey || !hotkeys) return;
    const cancel = () => { setRecordingHotkey(null); setHotkeyError(undefined); };
    const record = (shortcut: string) => {
      if (Object.entries(hotkeys).some(([key, value]) => key !== recordingHotkey && value.toLowerCase() === shortcut.toLowerCase())) {
        setHotkeyError("ปุ่มลัดนี้ถูกใช้แล้ว เลือกปุ่มอื่น");
        return;
      }
      setHotkeys({ ...hotkeys, [recordingHotkey]: shortcut });
      setHotkeyError(undefined);
      cancel();
    };
    const capture = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopPropagation();
      if (event.repeat) return;
      if (event.code === "Escape" || event.key === "Escape" || event.key === "Esc") { cancel(); return; }
      if (["ControlLeft", "ControlRight", "AltLeft", "AltRight", "ShiftLeft", "ShiftRight", "MetaLeft", "MetaRight"].includes(event.code) || ["Control", "Alt", "Shift", "Meta"].includes(event.key)) return;
      const shortcut = shortcutFromKeydown(event);
      if (!shortcut) { setHotkeyError("ปุ่มนี้ใช้เป็นปุ่มลัดไม่ได้ ลอง F1–F12 หรือ Ctrl/Alt ร่วมกับปุ่มอื่น"); return; }
      record(shortcut);
    };
    window.addEventListener("keydown", capture, true);
    window.addEventListener("blur", cancel);
    return () => {
      window.removeEventListener("keydown", capture, true);
      window.removeEventListener("blur", cancel);
      void api.setHotkeyCaptureMode(false);
    };
  }, [recordingHotkey, hotkeys]);

  const beginHotkeyCapture = async (key: keyof HotkeySettings) => {
    if (recordingHotkey) { setRecordingHotkey(null); setHotkeyError(undefined); return; }
    setHotkeyError(undefined);
    try {
      await api.setHotkeyCaptureMode(true);
      setRecordingHotkey(key);
    } catch (error) {
      setToast({ kind: "error", text: errorText(error) });
    }
  };

  const run = async (key: string, task: () => Promise<unknown>, ok: string) => {
    setBusy(key); setToast(undefined);
    try { await task(); await refresh(); setToast({ kind: "ok", text: ok }); }
    catch (error) { setToast({ kind: "error", text: errorText(error) }); }
    finally { setBusy(undefined); }
  };

  if (!snapshot || !hotkeys || !overlay) return <main className="settings-app grid min-h-screen place-content-center gap-4 p-6">
    {loadingError ? <section className="w-full max-w-xl space-y-4 rounded-2xl border p-6">
      <p role="alert" className="font-bold">ยังเปิด WANGAI ไม่สำเร็จ</p>
      <p className="text-sm text-[#a9afb8]">ลองโหลดข้อมูลอีกครั้งได้ โดยไม่ต้องปิดโปรแกรมหรือลบการตั้งค่า</p>
      <button autoFocus className={primary} onClick={() => void refresh()}><RefreshCw />ลองใหม่</button>
      <details className="text-sm text-[#a9afb8]"><summary>รายละเอียดข้อผิดพลาด</summary><p className="mt-2 break-words">{loadingError}</p></details>
    </section> : <><LoaderCircle aria-hidden="true" className="animate-spin" /><p role="status">กำลังเปิด WANGAI</p></>}
  </main>;
  const { settings, runtime } = snapshot;
  const validCaptionDuration = Number.isInteger(overlay.fadeSeconds) && overlay.fadeSeconds >= 2 && overlay.fadeSeconds <= 60;
  const showAudioRecovery = settings.captureMode === "system_output" || Boolean(runtime.captureWarning) || !runtime.workerReady;
  const notice = runtime.lastError ? { kind: "error", text: runtime.lastError } : toast;
  const notification = notice && <div role={notice.kind === "error" ? "alert" : "status"} className={`settings-notification rounded-xl border px-4 py-3 text-sm ${notice.kind === "error" ? "border-red-400/30 bg-red-400/10 text-red-200" : "border-[#63c48b]/30 bg-[#63c48b]/10 text-[#8bf0b1]"}`}>{notice.text}</div>;

  const showView = (kind: "history" | "settings") => {
    window.location.hash = kind === "history" ? "#/settings/history" : "#/settings/advanced";
    if (kind === "settings" && isDesktop()) void api.openSettingsWindow().catch((error) => setToast({ kind: "error", text: errorText(error) }));
  };
  const utility = activeTab !== "overview";
  return <main className={`settings-app settings-one-page ${utility ? "settings-utility" : "settings-control"}`}>
    {!utility && <>
      <header className="settings-toolbar">
        <div className="settings-top-brand"><img className="settings-brand-key" src={appIcon} alt="" aria-hidden="true" /><span className="settings-top-wordmark">WANGAI</span><span className="settings-top-slogan">ว่าไง เอไอแปลเสียงสด</span></div>
        <nav className="settings-toolbar-actions" aria-label="เครื่องมือ WANGAI">
          <button aria-label="ประวัติคำแปล" className="settings-top-action" onClick={() => showView("history")}><History />ประวัติ</button>
          <button aria-label="ตั้งค่า" className="settings-top-action" onClick={() => showView("settings")}><Settings2 />ตั้งค่า</button>
        </nav>
      </header>
      <div className="settings-workspace"><div className="settings-content"><UpdatePanel compact /><ReadyRoom notification={notification} settings={settings} runtime={runtime} busy={busy} previewMode={isPreviewMode()} showSecondary={false} showIntro={false} microphoneName={microphoneName} microphoneError={microphoneError} onRefreshMicrophone={() => void loadMicrophone()} onOpenMicrophonePicker={() => { setMicrophonePicker(true); void loadMicrophone(); }} onToggleListening={() => void run("listen", runtime.listening ? api.toggleListening : api.startSession, runtime.listening ? "หยุดใช้งานแล้ว" : "เริ่มใช้งานแล้ว")} onOpenSourcePicker={() => setPicker(true)} onCaptureModeChange={(mode) => void run("mode", () => api.updateCaptureMode(mode), mode === "system_output" ? "เปลี่ยนเป็นฟังเสียงทั้งเครื่องแล้ว" : "กลับไปฟังเฉพาะแอปแล้ว")} webRuntime={isWeb()} /></div></div>
    </>}
    {utility && <><header className="utility-header"><div><span className="settings-toolbar-eyebrow">WANGAI</span><h1>{activeTab === "history" ? "ประวัติคำแปล" : "ตั้งค่า"}</h1></div><div className="utility-header-actions">{runtime.listening && (isDesktop() || isPreviewMode()) && <button className="settings-toolbar-back" onClick={() => { if (isPreviewMode()) { window.location.hash = "#/overlay"; return; } void api.startSession().catch((error) => setToast({ kind: "error", text: errorText(error) })); }}>กลับไป Overlay</button>}<a className="settings-toolbar-back" href="#/settings/overview">กลับหน้าหลัก</a></div></header><div className="utility-content">{notification}
    {activeTab === "history" && <HistoryView history={snapshot.history} />}
    {activeTab === "advanced" && <div className="settings-direct-grid">
      {showAudioRecovery && <section className="settings-direct-card" aria-labelledby="settings-sound-title">
        <header><Volume2 aria-hidden="true" /><div><h2 id="settings-sound-title">เสียง</h2><p>ตรวจสอบการรับเสียง</p></div></header>
        {settings.captureMode === "system_output" && <label className="settings-direct-label" htmlFor="output-device">อุปกรณ์เสียงของ Windows<select className={`${input} mt-2`} id="output-device" value={settings.outputDeviceId ?? ""} onChange={(event) => void run("device", () => api.updateOutputDevice(event.target.value || undefined), "เปลี่ยนอุปกรณ์เสียงแล้ว")}><option value="">อุปกรณ์หลักของ Windows</option>{devices.map((device) => <option key={device.id} value={device.id}>{device.name}{device.isDefault ? " (หลัก)" : ""}</option>)}</select></label>}
        {runtime.captureWarning && <p className="settings-audio-help-warning"><TriangleAlert aria-hidden="true" />{runtime.captureWarning}</p>}
        {!runtime.workerReady && <button className={button} disabled={busy === "worker"} onClick={() => void run("worker", api.restartWorker, "เริ่มตัวตรวจคำพูดใหม่แล้ว")}><RefreshCw />เริ่มตัวตรวจคำพูดใหม่</button>}
      </section>}
      <section className="settings-direct-card" aria-labelledby="settings-overlay-title">
        <header><SlidersHorizontal aria-hidden="true" /><div><h2 id="settings-overlay-title">Overlay</h2><p>ปรับแล้วดูตัวอย่างได้ทันที</p></div></header>
        <div className="settings-overlay-studio">
          <div className="settings-overlay-controls">
            <Slider label="พื้นหลังหน้าต่าง" min={0.2} max={1} step={0.05} value={overlay.opacity} display={`${Math.round(overlay.opacity * 100)}%`} onChange={(value) => setOverlay({ ...overlay, opacity: value })} />
            <Slider label="พื้นกล่องข้อความ" min={0.6} max={1} step={0.05} value={overlay.bubbleOpacity} display={`${Math.round(overlay.bubbleOpacity * 100)}%`} onChange={(value) => setOverlay({ ...overlay, bubbleOpacity: value })} />
            <Slider label="ตัวอักษร" min={0.8} max={1} step={0.05} value={overlay.textOpacity} display={`${Math.round(overlay.textOpacity * 100)}%`} onChange={(value) => setOverlay({ ...overlay, textOpacity: value })} />
            <div className="settings-type-controls" aria-label="ขนาดข้อความใน Overlay">
              <h3>ขนาดข้อความ</h3>
              <fieldset className="settings-type-group"><legend>เสียงจากแอป</legend>
                <Slider label="คำแปลไทย" min={0.8} max={1.6} step={0.05} value={overlay.incomingTranslationScale} display={`${Math.round(overlay.incomingTranslationScale * 100)}%`} onChange={(value) => setOverlay({ ...overlay, incomingTranslationScale: value })} />
                <Slider label="ต้นฉบับอังกฤษ" min={0.8} max={1.6} step={0.05} value={overlay.incomingOriginalScale} display={`${Math.round(overlay.incomingOriginalScale * 100)}%`} onChange={(value) => setOverlay({ ...overlay, incomingOriginalScale: value })} />
              </fieldset>
              <fieldset className="settings-type-group"><legend>คำตอบของเรา</legend>
                <Slider label="คำแปลอังกฤษ" min={0.8} max={1.6} step={0.05} value={overlay.outgoingTranslationScale} display={`${Math.round(overlay.outgoingTranslationScale * 100)}%`} onChange={(value) => setOverlay({ ...overlay, outgoingTranslationScale: value })} />
                <Slider label="ต้นฉบับไทย" min={0.8} max={1.6} step={0.05} value={overlay.outgoingOriginalScale} display={`${Math.round(overlay.outgoingOriginalScale * 100)}%`} onChange={(value) => setOverlay({ ...overlay, outgoingOriginalScale: value })} />
              </fieldset>
            </div>
            <div className="settings-overlay-secondary"><div className="settings-duration-field"><label className="settings-direct-label" htmlFor="caption-duration">คำแปลค้างบนจอ</label><div className="settings-duration-input"><input id="caption-duration" type="number" inputMode="numeric" min="2" max="60" step="1" value={overlay.fadeSeconds} onChange={(event) => setOverlay({ ...overlay, fadeSeconds: Number(event.target.value) })} /><span>วินาที</span></div>{!validCaptionDuration && <p className="settings-field-error" role="alert">ใส่ค่าระหว่าง 2 ถึง 60 วินาที</p>}</div><Slider label="จำนวนคำแปลที่แสดง" min={1} max={5} step={1} value={overlay.maxItems} display={`${overlay.maxItems} ข้อความ`} onChange={(value) => setOverlay({ ...overlay, maxItems: value })} /></div>
          </div>
          <OverlayAppearancePreview settings={overlay} />
        </div>
        <button className={button} disabled={busy === "overlay" || !validCaptionDuration} onClick={() => void run("overlay", () => api.updateOverlay(overlay), "บันทึกการแสดงผลแล้ว")}><Save />บันทึก Overlay</button>
      </section>
      <section className="settings-direct-card settings-hotkey-card" aria-labelledby="settings-hotkey-title">
        <header><KeyRound aria-hidden="true" /><div><h2 id="settings-hotkey-title">ปุ่มลัด</h2><p>ใช้ควบคุมระหว่างเล่นเกม</p></div></header>
        <div className="settings-hotkey-grid">{Object.entries(hotkeys).map(([key, value]) => <div className="settings-hotkey-label" key={key}><span>{hotkeyLabels[key as keyof HotkeySettings]}</span><button type="button" className="settings-hotkey-capture" aria-label={`เปลี่ยนปุ่มลัด ${hotkeyLabels[key as keyof HotkeySettings]}`} aria-pressed={recordingHotkey === key} disabled={Boolean(recordingHotkey && recordingHotkey !== key)} onClick={() => void beginHotkeyCapture(key as keyof HotkeySettings)}>{recordingHotkey === key ? "กดปุ่มที่ต้องการ…" : value ? displayShortcut(value) : "ไม่ได้ตั้ง"}</button></div>)}</div>
        <p className="settings-direct-hint">{"คลิกช่องเพื่อเปลี่ยนปุ่มลัด · Esc เพื่อยกเลิก"}</p>
        {hotkeyError && <p className="settings-field-error" role="alert">{hotkeyError}</p>}
        <button className={button} disabled={busy === "hotkeys" || Boolean(recordingHotkey)} onClick={() => void run("hotkeys", () => api.updateHotkeys(hotkeys), "บันทึกปุ่มลัดแล้ว")}><Save />บันทึกปุ่มลัด</button>
      </section>
      <details className="settings-diagnostics settings-direct-footer" open={advancedOpen} onToggle={(event) => setAdvancedOpen(event.currentTarget.open)}><summary>ขั้นสูง</summary>{advancedOpen && <div className="settings-tuning-content"><AdvancedSettings advancedSection={advancedSection === "controls" ? "audio" : advancedSection} /></div>}</details>
      <details className="settings-diagnostics settings-direct-footer"><summary>ข้อมูลโปรแกรมและความเป็นส่วนตัว</summary><p className="settings-privacy-copy">ส่งเฉพาะช่วงคำพูดและข้อความผ่านเซิร์ฟเวอร์ WANGAI ไปยัง AI provider ไม่บันทึกเนื้อหาบนเซิร์ฟเวอร์ เก็บสถิติการใช้งานด้วยรหัสติดตั้งแบบสุ่ม</p></details>
    </div>}
    </div></>}
    {picker && <ProcessPickerDialog apps={runningApps.apps} loading={runningApps.loading} error={runningApps.error} previewMode={isPreviewMode()} selected={settings.listeningSource} onClose={() => setPicker(false)} onRefresh={runningApps.refresh} onSelect={async (source) => { await api.selectListeningSource(source); await refresh(); setToast({ kind: "ok", text: `เลือก ${source.displayName} แล้ว` }); setPicker(false); }} onClear={async () => { await api.clearListeningSource(); await refresh(); setToast({ kind: "ok", text: "ล้างการเลือกแอปแล้ว" }); setPicker(false); }} />}
    {microphonePicker && <MicrophonePickerDialog devices={microphones} selectedId={settings.microphoneDeviceId} loading={microphoneLoading} error={microphoneError ? "อ่านรายการไมโครโฟนไม่ได้" : undefined} active={runtime.microphoneActive} previewMode={isPreviewMode()} onClose={() => setMicrophonePicker(false)} onRefresh={() => void loadMicrophone()} onSelect={async (id) => { await api.updateMicrophoneDevice(id); await refresh(); setMicrophonePicker(false); setToast({ kind: "ok", text: "เปลี่ยนไมโครโฟนแล้ว" }); }} />}
  </main>;
}

function Slider({ label, min, max, step, value, display, onChange }: { label: string; min: number; max: number; step: number; value: number; display: string; onChange: (value: number) => void }) { return <label className="text-sm"><span className="flex justify-between"><span>{label}</span><strong className="settings-value">{display}</strong></span><input className="mt-3 w-full" min={min} max={max} step={step} type="range" value={value} onChange={(event) => onChange(Number(event.target.value))} /></label>; }
function HistoryView({ history }: { history: SubtitleItem[] }) { return <section className="settings-history"><div className="settings-history-heading"><div><p className="eyebrow">บทสนทนา</p><h2>คำแปลในรอบนี้</h2></div><span>{history.length} รายการ</span></div><div className="settings-history-list">{history.map((item) => <article className="settings-history-item" key={item.segmentId}><div className="settings-history-meta"><span>{item.stream === "microphone" ? "F9 ตอบกลับ" : item.sourceDisplayName ?? "เสียงขาเข้า"}</span><time>{new Date(item.createdAtMs).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })}</time></div><div className="settings-history-copy"><p lang={item.originalLanguage}>{item.originalText}</p><strong>{item.translatedText ?? "กำลังแปล…"}</strong></div></article>)}{history.length === 0 && <p className="settings-history-empty">ยังไม่มีคำแปลในรอบนี้ · เริ่มใช้งานแล้วข้อความจะปรากฏที่นี่</p>}</div></section>; }
