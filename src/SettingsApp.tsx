import { useCallback, useEffect, useState } from "react";
import { AudioLines, Cloud, Cpu, Globe2, KeyRound, Languages, LoaderCircle, Plus, Power, RefreshCw, Save, SlidersHorizontal, Trash2, TriangleAlert, Volume2 } from "lucide-react";
import { api, type WebCompanionInfo } from "./api";
import { ProcessPickerDialog } from "./ProcessPickerDialog";
import { ReadyRoom } from "./ReadyRoom";
import { advancedHref, settingsHref, type AdvancedSection, type SettingsTab } from "./router";
import { isPreviewMode, previewOutputDevices } from "./preview";
import { useRunningApps } from "./useRunningApps";
import type { AudioOutputDevice, CaptureSource, GlossaryTerm, GroqModelOption, HotkeySettings, OverlaySettings, SubtitleItem, VadSettings } from "./types";
import { errorText, useSnapshot } from "./useSnapshot";

const button = "inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-white/10 bg-[#252731] px-4 text-xs font-bold text-white hover:border-white/20 disabled:opacity-40";
const primary = "inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-white px-4 text-xs font-bold text-[#17181d] disabled:opacity-40";
const input = "min-h-11 w-full rounded-xl border border-white/10 bg-[#202229] px-3 text-sm text-white outline-none focus:border-[#63c48b]/60";
const isDesktop = () => "__TAURI_INTERNALS__" in window;
const isWeb = () => !isDesktop() && !isPreviewMode();
type Toast = { kind: "ok" | "error"; text: string };

export function SettingsApp({ activeTab, advancedSection = "audio" }: { activeTab: SettingsTab; advancedSection?: AdvancedSection }) {
  const { snapshot, refresh, loadingError } = useSnapshot();
  const [devices, setDevices] = useState<AudioOutputDevice[]>([]);
  const [models, setModels] = useState<GroqModelOption[]>([]);
  const [picker, setPicker] = useState(false);
  const runningApps = useRunningApps(picker);
  const [busy, setBusy] = useState<string>();
  const [toast, setToast] = useState<Toast>();
  const [groqKey, setGroqKey] = useState("");
  const [vad, setVad] = useState<VadSettings>();
  const [hotkeys, setHotkeys] = useState<HotkeySettings>();
  const [overlay, setOverlay] = useState<OverlaySettings>();
  const [glossary, setGlossary] = useState<GlossaryTerm[]>([]);
  const [incomingModel, setIncomingModel] = useState("");
  const [microphoneModel, setMicrophoneModel] = useState("");
  const [translationModel, setTranslationModel] = useState("");
  const [webInfo, setWebInfo] = useState<WebCompanionInfo>();

  useEffect(() => {
    if (!snapshot) return;
    setVad(snapshot.settings.vad);
    setHotkeys(snapshot.settings.hotkeys);
    setOverlay(snapshot.settings.overlay);
    setGlossary(snapshot.settings.glossary);
    setIncomingModel(snapshot.settings.groq.incomingSttModel);
    setMicrophoneModel(snapshot.settings.groq.microphoneSttModel);
    setTranslationModel(snapshot.settings.groq.translationModel);
  }, [snapshot?.settings]);

  const loadDevices = useCallback(async () => {
    try { setDevices(isPreviewMode() ? previewOutputDevices : await api.listOutputDevices()); }
    catch (error) { setToast({ kind: "error", text: errorText(error) }); }
  }, []);
  useEffect(() => { void loadDevices(); }, [loadDevices]);
  useEffect(() => {
    if (activeTab === "advanced" && advancedSection === "ai") void api.getGroqModelCatalog().then(setModels).catch(() => undefined);
  }, [activeTab, advancedSection]);
  useEffect(() => { if (isDesktop()) void api.getWebCompanionInfo().then(setWebInfo).catch(() => undefined); }, []);

  const run = async (key: string, task: () => Promise<unknown>, ok: string) => {
    setBusy(key); setToast(undefined);
    try { await task(); await refresh(); setToast({ kind: "ok", text: ok }); }
    catch (error) { setToast({ kind: "error", text: errorText(error) }); }
    finally { setBusy(undefined); }
  };

  if (!snapshot || !vad || !hotkeys || !overlay) return <main className="grid min-h-screen place-content-center gap-3 bg-[#15161a] text-white"><LoaderCircle className="animate-spin" /><p>{loadingError ?? "กำลังเปิด WANGAI"}</p></main>;
  const { settings, runtime } = snapshot;
  const profileKey = settings.captureMode === "process_tree" ? "processTree" : "systemOutput";
  const profile = vad[profileKey];

  return <main className="min-h-screen bg-[#15161a] px-6 py-5 text-[#eceef2]">
    <header className="mb-5 flex min-h-14 items-center gap-4 border-b border-white/8 pb-4">
      <strong className="text-3xl font-black tracking-tight text-white">WANGAI</strong>
      <span className="h-8 w-px bg-white/15" />
      <span className="text-sm font-bold text-[#70d99b]">{activeTab === "overview" ? "Ready Room" : activeTab === "history" ? "History" : "Advanced"}</span>
    </header>
    {isDesktop() && <div className="mb-4 flex items-center justify-end gap-3 text-xs text-[#a9afb8]"><span>{runtime.listening || runtime.microphoneActive ? "ปิดหน้าต่างนี้เพื่อกลับไปใช้ Overlay" : "กดเริ่มฟัง · F8 เพื่อเปิด Overlay"}</span><button className={button} onClick={() => void api.quitApp().catch((error) => setToast({ kind: "error", text: errorText(error) }))}><Power className="size-4" />ออกจากโปรแกรม</button></div>}
    {toast && <div className={`mb-4 rounded-xl border px-4 py-3 text-sm ${toast.kind === "error" ? "border-red-400/30 bg-red-400/10 text-red-200" : "border-[#63c48b]/30 bg-[#63c48b]/10 text-[#8bf0b1]"}`}>{toast.text}</div>}
    {activeTab === "overview" && <ReadyRoom settings={settings} runtime={runtime} history={snapshot.history} busy={busy} previewMode={isPreviewMode()} onToggleListening={() => void run("listen", api.toggleListening, runtime.listening ? "หยุดฟังแล้ว" : "เริ่มฟังแล้ว")} onOpenSourcePicker={() => setPicker(true)} onOpenWebCompanion={!isWeb() ? () => void run("web", api.openWebCompanion, "เปิด Web App แล้ว") : undefined} webCompanionOrigin={webInfo?.origin} webRuntime={isWeb()} />}
    {activeTab === "history" && <HistoryView history={snapshot.history} />}
    {activeTab === "advanced" && <>
      <nav className="mb-5 flex gap-2 rounded-2xl border border-white/10 bg-[#1d1f25] p-2"><a className={button} href={advancedHref("audio")}><AudioLines />Audio</a><a className={button} href={advancedHref("ai")}><Cloud />AI & Terms</a><a className={button} href={advancedHref("controls")}><SlidersHorizontal />Controls & Overlay</a><a className={`${button} ml-auto`} href={settingsHref("overview")}>กลับ Ready Room</a></nav>
      {advancedSection === "audio" && <section className="space-y-4">
        <Card title="Incoming audio diagnostics" icon={<Volume2 />} subtitle="มี capture, ring, cursor, VAD และ Groq queue เพียงชุดเดียว">
          <div className="grid gap-3 md:grid-cols-2"><Info label="แอปที่เลือก" value={settings.listeningSource?.displayName ?? "ยังไม่ได้เลือก"} /><Info label="สถานะ" value={runtime.statusMessage} /><Info label="PID ที่จับจริง" value={runtime.effectiveCapturePid?.toString() ?? "—"} /><Info label="Peak" value={runtime.audioPeakDbfs == null ? "ยังไม่มี audio frame" : `${runtime.audioPeakDbfs.toFixed(1)} dBFS`} /><Info label="VAD" value={runtime.vadActive ? "กำลังตรวจพบคำพูด" : "ยังไม่พบคำพูด"} /><Info label="Source badge" value={settings.captureMode === "system_output" ? "MIXED" : settings.listeningSource?.displayName?.toUpperCase() ?? "INCOMING"} /></div>
          {runtime.captureWarning && <p className="mt-3 rounded-xl border border-amber-400/30 bg-amber-400/10 p-3 text-sm text-amber-100"><TriangleAlert className="mr-2 inline size-4" />{runtime.captureWarning}</p>}
          <div className="mt-4 flex flex-wrap gap-2"><button className={button} onClick={() => setPicker(true)}>เปลี่ยนแอป</button><button className={button} disabled={busy === "probe"} onClick={() => void run("probe", api.probeRecentAudio, "ส่งเสียง 6 วินาทีล่าสุดไปตรวจแล้ว")}>ตรวจเสียง 6 วินาที</button><button className={button} onClick={() => void run("worker", api.restartWorker, "Restart worker แล้ว")}><RefreshCw />Restart worker</button></div>
        </Card>
        <Card title="Capture mode" icon={<Cpu />} subtitle="Process Tree จับเฉพาะแอป; System Output เป็น fallback และแสดง MIXED">
          <div className="grid gap-3 md:grid-cols-2"><button className={settings.captureMode === "process_tree" ? primary : button} onClick={() => void run("mode", () => api.updateCaptureMode("process_tree"), "ใช้ Process Tree แล้ว")}>Process Tree</button><button className={settings.captureMode === "system_output" ? primary : button} onClick={() => void run("mode", () => api.updateCaptureMode("system_output"), "ใช้ System Output แล้ว")}>System Output fallback</button></div>
          {settings.captureMode === "system_output" && <label className="mt-4 block text-sm">Output endpoint<select className={`${input} mt-2`} value={settings.outputDeviceId ?? ""} onChange={(event) => void run("device", () => api.updateOutputDevice(event.target.value || undefined), "เปลี่ยน output endpoint แล้ว")}><option value="">Windows default</option>{devices.map((device) => <option key={device.id} value={device.id}>{device.name}{device.isDefault ? " (default)" : ""}</option>)}</select></label>}
          <label className="mt-4 flex items-center gap-3 text-sm"><input checked={settings.rescueScanEnabled} type="checkbox" onChange={(event) => void run("rescue", () => api.updateRescueScan(event.target.checked), event.target.checked ? "เปิด Rescue Scan แล้ว" : "ปิด Rescue Scan แล้ว")} />Rescue Scan (ปิดเป็นค่าเริ่มต้น)</label>
        </Card>
        <Card title="Local Silero VAD" icon={<Cpu />} subtitle={`โปรไฟล์ ${settings.captureMode === "process_tree" ? "Process Tree" : "System Output"} จำค่าแยกกัน`}>
          <div className="grid gap-5 md:grid-cols-2"><Slider label="VAD threshold" min={0.05} max={0.9} step={0.05} value={profile.vadThreshold} display={profile.vadThreshold.toFixed(2)} onChange={(value) => setVad({ ...vad, [profileKey]: { ...profile, vadThreshold: value } })} /><Slider label="VAD gain" min={0} max={18} step={1} value={profile.gainDb} display={`+${profile.gainDb} dB`} onChange={(value) => setVad({ ...vad, [profileKey]: { ...profile, gainDb: value } })} /><Slider label="จบเมื่อเงียบ" min={200} max={1500} step={100} value={vad.silenceMs} display={`${vad.silenceMs} ms`} onChange={(value) => setVad({ ...vad, silenceMs: value })} /><Slider label="Pre-roll" min={0} max={1000} step={50} value={vad.preRollMs} display={`${vad.preRollMs} ms`} onChange={(value) => setVad({ ...vad, preRollMs: value })} /></div><button className={`${primary} mt-5`} onClick={() => void run("vad", () => api.updateVad(vad), "บันทึก VAD แล้ว")}><Save />บันทึกและ Restart</button>
        </Card>
      </section>}
      {advancedSection === "ai" && <section className="space-y-4">
        <Card title="Groq Key & Models" icon={<KeyRound />} subtitle={isWeb() ? "ตั้งหรือลบ API key ได้จาก Desktop เท่านั้น" : "Key อยู่ใน Windows Credential Manager"}>
          {!isWeb() && <div className="flex gap-2"><input className={input} type="password" placeholder="gsk_..." value={groqKey} onChange={(event) => setGroqKey(event.target.value)} /><button className={primary} onClick={() => void run("key", () => api.configureGroq(groqKey), "บันทึก Groq key แล้ว")}>บันทึก Key</button><button className={button} onClick={() => void run("key", api.clearGroq, "ลบ Groq key แล้ว")}>ลบ</button></div>}
          <div className="mt-4 grid gap-3 md:grid-cols-3"><ModelSelect label="Incoming STT" value={incomingModel} models={models.filter((m) => m.kind === "speech_to_text")} onChange={setIncomingModel} /><ModelSelect label="F9 microphone STT" value={microphoneModel} models={models.filter((m) => m.kind === "speech_to_text")} onChange={setMicrophoneModel} /><ModelSelect label="Translation" value={translationModel} models={models.filter((m) => m.kind === "translation")} onChange={setTranslationModel} /></div><button className={`${primary} mt-4`} onClick={() => void run("models", () => api.updateGroqModels(incomingModel, microphoneModel, translationModel), "บันทึกโมเดลแล้ว")}>บันทึกโมเดล</button>
          <p className="mt-4 text-sm text-[#aaaeba]">ใช้ไป ${(settings.groq.estimatedSpendMicrousd / 1_000_000).toFixed(4)} / ${(settings.groq.monthlyBudgetMicrousd / 1_000_000).toFixed(2)} USD เดือนนี้</p>
        </Card>
        <Card title="คำศัพท์เกม" icon={<Languages />} subtitle="ใช้เฉพาะ prompt แปลภาษา ไม่ส่งเป็น Whisper prompt">{glossary.map((term, index) => <div className="mb-2 flex gap-2" key={index}><input className={input} value={term.source} onChange={(e) => setGlossary(glossary.map((v, i) => i === index ? { ...v, source: e.target.value } : v))} /><input className={input} value={term.target} onChange={(e) => setGlossary(glossary.map((v, i) => i === index ? { ...v, target: e.target.value } : v))} /><button className={button} onClick={() => setGlossary(glossary.filter((_, i) => i !== index))}><Trash2 /></button></div>)}<div className="flex gap-2"><button className={button} onClick={() => setGlossary([...glossary, { source: "", target: "" }])}><Plus />เพิ่มคำ</button><button className={primary} onClick={() => void run("glossary", () => api.updateGlossary(glossary), "บันทึกคำศัพท์แล้ว")}>บันทึก</button></div></Card>
      </section>}
      {advancedSection === "controls" && <section className="space-y-4"><Card title="Hotkeys" icon={<KeyRound />} subtitle="F8 ฟังแอปที่เลือก · F9 ตอบกลับด้วยไมค์"><div className="grid gap-3 md:grid-cols-2">{Object.entries(hotkeys).map(([key, value]) => <label className="text-sm" key={key}>{key}<input className={`${input} mt-1`} value={value} onChange={(event) => setHotkeys({ ...hotkeys, [key]: event.target.value })} /></label>)}</div><button className={`${primary} mt-4`} onClick={() => void run("hotkeys", () => api.updateHotkeys(hotkeys), "บันทึก hotkeys แล้ว")}>บันทึก Hotkeys</button></Card><Card title="Overlay" icon={<SlidersHorizontal />} subtitle="รูปแบบหน้าต่างคำแปล"><div className="grid gap-5 md:grid-cols-2"><Slider label="Opacity" min={0.2} max={1} step={0.05} value={overlay.opacity} display={`${Math.round(overlay.opacity * 100)}%`} onChange={(value) => setOverlay({ ...overlay, opacity: value })} /><Slider label="จำนวนข้อความ" min={1} max={5} step={1} value={overlay.maxItems} display={`${overlay.maxItems}`} onChange={(value) => setOverlay({ ...overlay, maxItems: value })} /></div><button className={`${primary} mt-4`} onClick={() => void run("overlay", () => api.updateOverlay(overlay), "บันทึก Overlay แล้ว")}>บันทึก Overlay</button></Card></section>}
    </>}
    {picker && <ProcessPickerDialog apps={runningApps.apps} loading={runningApps.loading} error={runningApps.error} previewMode={isPreviewMode()} selected={settings.listeningSource} onClose={() => setPicker(false)} onRefresh={runningApps.refresh} onSelect={async (source) => { await api.selectListeningSource(source); await refresh(); setToast({ kind: "ok", text: `เลือก ${source.displayName} แล้ว` }); setPicker(false); }} />}
  </main>;
}

function Card({ title, subtitle, icon, children }: { title: string; subtitle: string; icon: React.ReactNode; children: React.ReactNode }) { return <section className="rounded-2xl border border-white/10 bg-[#1d1f25] p-5"><header className="mb-5 flex gap-3"><span className="grid size-10 place-items-center rounded-xl bg-[#63c48b]/10 text-[#72dda0]">{icon}</span><div><h2 className="font-bold text-white">{title}</h2><p className="text-xs text-[#9296a1]">{subtitle}</p></div></header>{children}</section>; }
function Info({ label, value }: { label: string; value: string }) { return <div className="rounded-xl border border-white/8 bg-black/10 p-3"><small className="text-[#898d98]">{label}</small><p className="mt-1 text-sm font-semibold text-white">{value}</p></div>; }
function Slider({ label, min, max, step, value, display, onChange }: { label: string; min: number; max: number; step: number; value: number; display: string; onChange: (value: number) => void }) { return <label className="text-sm"><span className="flex justify-between"><span>{label}</span><strong className="text-[#76dda0]">{display}</strong></span><input className="mt-3 w-full accent-[#63c48b]" min={min} max={max} step={step} type="range" value={value} onChange={(event) => onChange(Number(event.target.value))} /></label>; }
function ModelSelect({ label, value, models, onChange }: { label: string; value: string; models: GroqModelOption[]; onChange: (value: string) => void }) { return <label className="text-sm">{label}<select className={`${input} mt-1`} value={value} onChange={(event) => onChange(event.target.value)}>{models.length === 0 && <option value={value}>{value}</option>}{models.map((model) => <option key={model.id} value={model.id}>{model.label}</option>)}</select></label>; }
function HistoryView({ history }: { history: SubtitleItem[] }) { return <section className="mx-auto max-w-5xl"><div className="mb-5 flex items-center justify-between"><div><p className="text-xs tracking-[.25em] text-[#70d99b]">HISTORY</p><h1 className="text-2xl font-bold">ประวัติคำแปล</h1></div><a className={button} href={settingsHref("overview")}>กลับ Ready Room</a></div><div className="space-y-3">{history.map((item) => <article className="rounded-xl border border-white/10 bg-[#1d1f25] p-4" key={item.segmentId}><span className="text-[10px] font-bold tracking-wider text-[#70d99b]">{item.stream === "microphone" ? "F9 REPLY" : item.sourceDisplayName ?? "INCOMING"}</span><p className="mt-2 text-sm text-[#aaaeba]">{item.originalText}</p><p className="mt-1 font-semibold text-white">{item.translatedText ?? "กำลังแปล…"}</p></article>)}{history.length === 0 && <p className="rounded-xl border border-dashed border-white/10 p-8 text-center text-[#9296a1]">ยังไม่มีประวัติคำแปล</p>}</div></section>; }
