import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Activity,
  AudioLines,
  Check,
  Cloud,
  Cpu,
  Gamepad2,
  GripHorizontal,
  Headphones,
  KeyRound,
  Languages,
  LoaderCircle,
  Mic,
  Plus,
  RefreshCw,
  Save,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  TriangleAlert,
  Wifi,
  X,
  Zap,
} from "lucide-react";
import { api } from "./api";
import { settingsHref, type SettingsTab } from "./router";
import { isPreviewMode, previewProcesses } from "./preview";
import type {
  AppSettings,
  CaptureSource,
  GlossaryTerm,
  GroqModelOption,
  HotkeySettings,
  OverlaySettings,
  RuntimeState,
  SubtitleItem,
  VadSettings,
} from "./types";
import { errorText, useSnapshot } from "./useSnapshot";

type Toast = { kind: "ok" | "error"; text: string } | undefined;

const primaryButton =
  "inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-white px-4 text-xs font-bold text-[#17181d] shadow-sm transition hover:-translate-y-0.5 hover:bg-[#f7f7f8] disabled:pointer-events-none disabled:bg-[#2b2d35] disabled:text-[#737682] disabled:opacity-100 disabled:shadow-none";
const secondaryButton =
  "inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-white/10 bg-[#252731] px-4 text-xs font-bold text-[#f0f1f4] transition hover:-translate-y-0.5 hover:border-white/20 hover:bg-[#2d303a] disabled:pointer-events-none disabled:opacity-45";
const dangerButton =
  "inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-red-400/15 bg-red-400/5 px-4 text-xs font-bold text-red-200 transition hover:bg-red-400/10 disabled:pointer-events-none disabled:opacity-45";
const inputClass =
  "min-h-11 w-full rounded-xl border border-white/10 bg-[#202229] px-3 text-sm text-[#f0f1f4] outline-none transition placeholder:text-[#666975] focus:border-[#63c48b]/60 focus:ring-4 focus:ring-[#63c48b]/10 disabled:text-[#7f828d]";

const tabs: Array<{ id: SettingsTab; label: string; icon: ReactNode }> = [
  { id: "overview", label: "Overview", icon: <Activity /> },
  { id: "audio", label: "Audio", icon: <AudioLines /> },
  { id: "ai", label: "AI & Terms", icon: <Sparkles /> },
  { id: "controls", label: "Controls", icon: <SlidersHorizontal /> },
  { id: "history", label: "History", icon: <Languages /> },
];

const previewGroqModelCatalog: GroqModelOption[] = [
  { id: "whisper-large-v3-turbo", label: "Whisper Large V3 Turbo", description: "เร็วและประหยัด", kind: "speech_to_text", inputMicrousdPerMillion: 0, outputMicrousdPerMillion: 0, audioMicrousdPerHour: 40_000 },
  { id: "whisper-large-v3", label: "Whisper Large V3", description: "เน้นความแม่น", kind: "speech_to_text", inputMicrousdPerMillion: 0, outputMicrousdPerMillion: 0, audioMicrousdPerHour: 111_000 },
  { id: "openai/gpt-oss-20b", label: "GPT-OSS 20B", description: "เร็วและประหยัด", kind: "translation", inputMicrousdPerMillion: 75_000, outputMicrousdPerMillion: 300_000, audioMicrousdPerHour: 0 },
  { id: "openai/gpt-oss-120b", label: "GPT-OSS 120B", description: "เน้นคุณภาพภาษาไทย", kind: "translation", inputMicrousdPerMillion: 150_000, outputMicrousdPerMillion: 600_000, audioMicrousdPerHour: 0 },
];

export function SettingsApp({ activeTab }: { activeTab: SettingsTab }) {
  const { snapshot, refresh, loadingError } = useSnapshot();
  const [processes, setProcesses] = useState<CaptureSource[]>([]);
  const [processSearch, setProcessSearch] = useState("");
  const [processLoading, setProcessLoading] = useState(false);
  const [busy, setBusy] = useState<string>();
  const [toast, setToast] = useState<Toast>();
  const [groqKey, setGroqKey] = useState("");
  const [modelCatalog, setModelCatalog] = useState<GroqModelOption[]>([]);
  const [sttModel, setSttModel] = useState("");
  const [translationModel, setTranslationModel] = useState("");
  const [hotkeys, setHotkeys] = useState<HotkeySettings>();
  const [overlay, setOverlay] = useState<OverlaySettings>();
  const [vad, setVad] = useState<VadSettings>();
  const [glossary, setGlossary] = useState<GlossaryTerm[]>([]);

  useEffect(() => {
    if (!snapshot) return;
    setHotkeys(snapshot.settings.hotkeys);
    setOverlay(snapshot.settings.overlay);
    setVad(snapshot.settings.vad);
    setGlossary(snapshot.settings.glossary);
    setSttModel(snapshot.settings.groq.sttModel);
    setTranslationModel(snapshot.settings.groq.translationModel);
  }, [snapshot?.settings]);

  const loadProcesses = useCallback(async () => {
    setProcessLoading(true);
    try {
      setProcesses(isPreviewMode() ? previewProcesses : await api.listProcesses());
    } catch (error) {
      setToast({ kind: "error", text: errorText(error) });
    } finally {
      setProcessLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === "audio") void loadProcesses();
  }, [activeTab, loadProcesses]);

  useEffect(() => {
    if (activeTab !== "ai") return;
    if (isPreviewMode()) {
      setModelCatalog(previewGroqModelCatalog);
      return;
    }
    void api.getGroqModelCatalog().then(setModelCatalog).catch((error) => {
      setToast({ kind: "error", text: errorText(error) });
    });
  }, [activeTab]);

  const run = async (key: string, task: () => Promise<unknown>, ok: string) => {
    setBusy(key);
    setToast(undefined);
    try {
      await task();
      await refresh();
      setToast({ kind: "ok", text: ok });
    } catch (error) {
      setToast({ kind: "error", text: errorText(error) });
    } finally {
      setBusy(undefined);
    }
  };

  const filteredProcesses = useMemo(() => {
    const query = processSearch.trim().toLowerCase();
    return processes.filter(
      (process) =>
        !query ||
        process.displayName.toLowerCase().includes(query) ||
        process.executablePath.toLowerCase().includes(query),
    );
  }, [processSearch, processes]);

  if (!snapshot || !hotkeys || !overlay || !vad) {
    return (
      <main className="grid min-h-screen place-content-center justify-items-center gap-3 bg-[#15161a] text-[#a9acb5]">
        <LoaderCircle className="size-8 animate-spin text-[#70d99b]" />
        <strong className="text-sm text-white">กำลังเปิด WANGAI</strong>
        {(loadingError || toast?.text) && <p className="max-w-lg text-center text-xs text-red-300">{loadingError || toast?.text}</p>}
      </main>
    );
  }

  const { settings, runtime } = snapshot;
  const quotaPercent = Math.min(
    100,
    (settings.groq.estimatedSpendMicrousd / settings.groq.monthlyBudgetMicrousd) * 100,
  );
  const spendUsd = settings.groq.estimatedSpendMicrousd / 1_000_000;
  const budgetUsd = settings.groq.monthlyBudgetMicrousd / 1_000_000;
  const sttModels = modelCatalog.filter((model) => model.kind === "speech_to_text");
  const translationModels = modelCatalog.filter((model) => model.kind === "translation");

  return (
    <main className="min-h-screen bg-[#15161a] px-5 py-8 text-[#f6f6f8] selection:bg-[#63c48b]/30 lg:px-8 lg:py-10">
      <div className="mx-auto w-full max-w-[1080px]">
        <header className="mb-7 flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="mb-3 font-mono text-[10px] font-bold tracking-[0.2em] text-[#858894]">LIVE TRANSLATION · WINDOWS</p>
            <div className="flex items-end gap-3">
              <h1 className="text-4xl font-extrabold tracking-[-0.065em] text-white sm:text-5xl">WANGAI</h1>
              <span className="pb-1 text-base font-bold text-[#b9becc]">ว่าไง</span>
            </div>
            <p className="mt-3 max-w-xl text-sm leading-6 text-[#989ba7]">ฟังทีมต่างชาติแบบเรียลไทม์ แล้วตอบกลับเป็นอังกฤษโดยไม่ต้องออกจากเกม</p>
          </div>
          <button
            className={`${primaryButton} min-w-40 ${runtime.listening ? "!border !border-[#63c48b]/35 !bg-[#63c48b]/15 !text-[#7dddA4]" : ""}`}
            disabled={busy === "listen"}
            onClick={() =>
              void run(
                "listen",
                () => api.toggleListening(),
                runtime.listening ? "หยุดฟังเสียงเกมแล้ว" : "เริ่มฟังเสียงเกมแล้ว",
              )
            }
          >
            {busy === "listen" ? <LoaderCircle className="animate-spin" /> : <Headphones />}
            {runtime.listening ? "หยุดฟัง · F8" : "เริ่มฟัง · F8"}
          </button>
        </header>

        <nav aria-label="Settings" className="mb-5 flex gap-1 overflow-x-auto rounded-2xl border border-white/8 bg-[#1c1d24]/90 p-1.5 shadow-[0_18px_60px_rgba(0,0,0,.2)]">
          {tabs.map((tab) => (
            <a
              aria-current={activeTab === tab.id ? "page" : undefined}
              className={`flex min-w-max flex-1 items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-xs font-bold transition ${
                activeTab === tab.id
                  ? "bg-[#30323b] text-white shadow-sm"
                  : "text-[#898c98] hover:bg-white/4 hover:text-[#d7d9df]"
              }`}
              href={settingsHref(tab.id)}
              key={tab.id}
            >
              <span className="[&>svg]:size-4">{tab.icon}</span>
              {tab.label}
            </a>
          ))}
        </nav>

        <div aria-live="polite">
          {toast && (
            <div className={`mb-4 flex items-center gap-3 rounded-xl border px-4 py-3 text-xs ${toast.kind === "ok" ? "border-[#63c48b]/25 bg-[#63c48b]/10 text-[#9ce9ba]" : "border-red-400/20 bg-red-400/8 text-red-200"}`}>
              {toast.kind === "ok" ? <Check className="size-4" /> : <TriangleAlert className="size-4" />}
              <span>{toast.text}</span>
              <button aria-label="ปิดข้อความ" className="ml-auto" onClick={() => setToast(undefined)}><X className="size-4" /></button>
            </div>
          )}
          {runtime.lastError && (
            <div className="mb-4 flex items-center gap-3 rounded-xl border border-amber-300/20 bg-amber-300/8 px-4 py-3 text-xs text-amber-100">
              <TriangleAlert className="size-4" />
              {runtime.lastError}
            </div>
          )}
        </div>

        {activeTab === "overview" && (
          <OverviewTab
            hotkeys={hotkeys}
            runtime={runtime}
            settings={settings}
            onDemo={() => void api.injectDemo()}
            onEdit={() => void run("overlay-edit", () => api.setOverlayEditMode(!runtime.overlayEditMode), runtime.overlayEditMode ? "ล็อก overlay แล้ว" : "ลาก overlay ได้แล้ว")}
          />
        )}

        {activeTab === "audio" && (
          <div className="grid gap-4">
            <SettingsCard icon={<Gamepad2 />} title="เลือกเกมที่จะฟัง" subtitle="WASAPI จะจับเฉพาะ process ที่เลือก รวม child process โดยไม่แตะ renderer ของเกม">
              <div className="mb-3 flex gap-2">
                <label className="relative flex-1">
                  <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#777a85]" />
                  <input className={`${inputClass} pl-10`} value={processSearch} onChange={(event) => setProcessSearch(event.target.value)} placeholder="ค้นหา process หรือ executable path" />
                </label>
                <button className={secondaryButton} onClick={() => void loadProcesses()} disabled={processLoading}>
                  <RefreshCw className={processLoading ? "animate-spin" : ""} /> รีเฟรช
                </button>
              </div>
              <div className="grid max-h-[330px] gap-2 overflow-y-auto pr-1 wangai-scrollbar">
                {filteredProcesses.slice(0, 40).map((process) => {
                  const selected = settings.selectedProcess?.executablePath.toLowerCase() === process.executablePath.toLowerCase();
                  return (
                    <button
                      className={`grid grid-cols-[42px_minmax(0,1fr)_auto] items-center gap-3 rounded-2xl border p-3 text-left transition ${selected ? "border-[#63c48b]/45 bg-[#63c48b]/9" : "border-white/7 bg-[#202229] hover:border-white/15 hover:bg-[#24262e]"}`}
                      key={`${process.pid}-${process.executablePath}`}
                      onClick={() => void run("process", () => api.selectProcess(process), `เลือก ${process.displayName} แล้ว`)}
                    >
                      <span className={`grid size-10 place-items-center rounded-xl ${selected ? "bg-[#63c48b]/15 text-[#75d99d]" : "bg-white/5 text-[#858894]"}`}>{process.isMistfall ? <Zap className="size-5" /> : <Gamepad2 className="size-5" />}</span>
                      <span className="min-w-0"><strong className="block text-sm">{process.displayName}</strong><small className="block truncate text-[10px] leading-5 text-[#7e818d]">{process.name} · PID {process.pid}<br />{process.executablePath}</small></span>
                      <span className="flex items-center gap-2">{process.isMistfall && <em className="rounded-full bg-[#63c48b]/10 px-2 py-1 text-[9px] not-italic text-[#7dddA4]">แนะนำ</em>}{selected && <Check className="size-4 text-[#70d99b]" />}</span>
                    </button>
                  );
                })}
                {!processLoading && filteredProcesses.length === 0 && <EmptyState>ไม่พบ process ที่ตรงกัน ลองเปิดเกมแล้วกดรีเฟรช</EmptyState>}
              </div>
            </SettingsCard>

            <SettingsCard icon={<Cpu />} title="Local Silero VAD" subtitle="ตรวจจับคำพูดในเครื่องและส่งขึ้น cloud เฉพาะช่วงที่มีเสียงพูด">
              <div className="grid gap-5 md:grid-cols-2">
                <Slider label="จบเมื่อเงียบ" value={vad.silenceMs} min={300} max={1500} step={100} suffix={`${vad.silenceMs} ms`} onChange={(value) => setVad({ ...vad, silenceMs: value })} />
                <Slider label="VAD threshold" value={vad.vadThreshold} min={0.2} max={0.9} step={0.05} suffix={vad.vadThreshold.toFixed(2)} onChange={(value) => setVad({ ...vad, vadThreshold: value })} />
                <Slider label="Pre-roll" value={vad.preRollMs} min={0} max={1000} step={50} suffix={`${vad.preRollMs} ms`} onChange={(value) => setVad({ ...vad, preRollMs: value })} />
                <Slider label="วลียาวสุด" value={vad.maxUtteranceMs} min={5000} max={20000} step={1000} suffix={`${vad.maxUtteranceMs / 1000}s`} onChange={(value) => setVad({ ...vad, maxUtteranceMs: value })} />
              </div>
              <div className="mt-6 flex flex-wrap gap-2">
                <button className={primaryButton} onClick={() => void run("vad", () => api.updateVad(vad), "บันทึกและ restart Silero VAD แล้ว")}><RefreshCw />บันทึกและ Restart</button>
                <button className={secondaryButton} onClick={() => void run("worker", () => api.restartWorker(), "กำลัง restart VAD worker")}><Cpu />Restart worker</button>
              </div>
            </SettingsCard>
          </div>
        )}

        {activeTab === "ai" && (
          <div className="grid gap-4">
            <SettingsCard icon={<Cloud />} title="Groq Whisper + Translation" subtitle="API key อยู่ใน Windows Credential Manager และไม่ถูกส่งเข้า React หรือ Python">
              <div className="mb-5 rounded-2xl border border-white/7 bg-[#202229] p-4">
                <div className="flex items-end justify-between gap-4"><div><span className="text-[10px] text-[#888b96]">ประมาณการเดือน {settings.groq.usageMonth}</span><strong className="mt-1 block text-lg">${spendUsd.toFixed(4)} <span className="text-xs font-medium text-[#777a85]">/ ${budgetUsd.toFixed(2)}</span></strong></div><span className="text-sm font-bold text-[#70d99b]">{quotaPercent.toFixed(1)}%</span></div>
                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-black/25"><span className="block h-full rounded-full bg-[#63c48b] transition-[width]" style={{ width: `${quotaPercent}%` }} /></div>
                <div className="mt-4 grid gap-2 text-[10px] text-[#9295a0] sm:grid-cols-3">
                  <span>เสียงจริง {(settings.groq.actualAudioMillis / 60_000).toFixed(2)} นาที</span>
                  <span>คิดเงิน {(settings.groq.billedAudioMillis / 60_000).toFixed(2)} นาที</span>
                  <span>{(settings.groq.promptTokens + settings.groq.completionTokens).toLocaleString()} tokens</span>
                </div>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <Field className="md:col-span-2" label="Groq API key"><input type="password" className={inputClass} value={groqKey} onChange={(event) => setGroqKey(event.target.value)} placeholder={settings.groq.configured ? "•••••••• (ตั้งค่าแล้ว ใส่ใหม่เมื่อต้องการเปลี่ยน)" : "วาง Groq API key จาก console.groq.com"} /></Field>
                <Field label="Speech-to-text model">
                  <select aria-label="Speech-to-text model" className={inputClass} value={sttModel} onChange={(event) => setSttModel(event.target.value)}>
                    {sttModels.length === 0 && <option value={sttModel}>{sttModel}</option>}
                    {sttModels.map((model) => <option key={model.id} value={model.id}>{model.label}</option>)}
                  </select>
                </Field>
                <Field label="Translation model">
                  <select aria-label="Translation model" className={inputClass} value={translationModel} onChange={(event) => setTranslationModel(event.target.value)}>
                    {translationModels.length === 0 && <option value={translationModel}>{translationModel}</option>}
                    {translationModels.map((model) => <option key={model.id} value={model.id}>{model.label}</option>)}
                  </select>
                </Field>
              </div>
              <div className="mt-5 flex flex-wrap gap-2">
                <button className={primaryButton} disabled={!groqKey.trim() || busy === "groq"} onClick={() => void run("groq", async () => { await api.configureGroq(groqKey); setGroqKey(""); }, "บันทึก Groq key แล้ว")}><Save />บันทึก Groq key</button>
                <button className={secondaryButton} disabled={!sttModel || !translationModel || busy === "groq-models"} onClick={() => void run("groq-models", () => api.updateGroqModels(sttModel, translationModel), "เปลี่ยนโมเดล Groq แล้ว")}><SlidersHorizontal />บันทึกโมเดล</button>
                <button className={secondaryButton} disabled={!settings.groq.configured || busy === "groq-test"} onClick={() => void run("groq-test", () => api.testGroq(), "ทดสอบ Groq สำเร็จ")}><Zap />ทดสอบคำแปล</button>
                <button className={dangerButton} disabled={!settings.groq.configured} onClick={() => void run("groq-clear", () => api.clearGroq(), "ลบ Groq key แล้ว")}><Trash2 />ลบ key</button>
              </div>
              <p className="mt-4 text-[10px] leading-5 text-[#7f828e]">เปลี่ยนโมเดลแล้วมีผลกับคำขอถัดไปทันที ไม่ต้อง restart VAD · เพดานนี้เป็นตัวป้องกันภายในแอป ยอดเงินจริงให้ตรวจใน Groq Console</p>
            </SettingsCard>

            <SettingsCard icon={<Languages />} title="คำศัพท์เกม" subtitle="รักษาชื่อไอเทม สถานที่ คลาส และ callout ให้ตรงความหมาย">
              <div className="grid gap-2">
                <div className="grid grid-cols-[1fr_1fr_40px] gap-2 px-1 text-[9px] font-bold uppercase tracking-wider text-[#777a85]"><span>English</span><span>ไทย / คำที่ต้องการ</span><span /></div>
                {glossary.map((term, index) => (
                  <div className="grid grid-cols-[1fr_1fr_40px] gap-2" key={index}>
                    <input className={inputClass} value={term.source} onChange={(event) => setGlossary(glossary.map((old, oldIndex) => oldIndex === index ? { ...old, source: event.target.value } : old))} />
                    <input className={inputClass} value={term.target} onChange={(event) => setGlossary(glossary.map((old, oldIndex) => oldIndex === index ? { ...old, target: event.target.value } : old))} />
                    <button aria-label={`ลบคำที่ ${index + 1}`} className="grid size-11 place-items-center rounded-xl border border-red-400/10 bg-red-400/5 text-red-200 transition hover:bg-red-400/10" onClick={() => setGlossary(glossary.filter((_, oldIndex) => oldIndex !== index))}><Trash2 className="size-4" /></button>
                  </div>
                ))}
              </div>
              <div className="mt-5 flex flex-wrap gap-2"><button className={secondaryButton} onClick={() => setGlossary([...glossary, { source: "", target: "" }])}><Plus />เพิ่มคำ</button><button className={primaryButton} onClick={() => void run("glossary", () => api.updateGlossary(glossary.filter((term) => term.source.trim() && term.target.trim())), "บันทึกคำศัพท์แล้ว")}><Save />บันทึกคำศัพท์</button></div>
            </SettingsCard>
          </div>
        )}

        {activeTab === "controls" && (
          <div className="grid gap-4">
            <SettingsCard icon={<KeyRound />} title="Global hotkeys" subtitle="ทำงานได้แม้เกมเป็นหน้าต่างที่กำลังใช้งาน">
              <div className="grid gap-3 sm:grid-cols-2">
                <HotkeyInput label="เปิด/ปิดฟังเกม" value={hotkeys.toggleListening} onChange={(value) => setHotkeys({ ...hotkeys, toggleListening: value })} />
                <HotkeyInput label="กดค้างพูดไทย" value={hotkeys.pushToTalk} onChange={(value) => setHotkeys({ ...hotkeys, pushToTalk: value })} />
                <HotkeyInput label="Copy อังกฤษล่าสุด" value={hotkeys.copyLatest} onChange={(value) => setHotkeys({ ...hotkeys, copyLatest: value })} />
                <HotkeyInput label="ลาก/ปรับ overlay" value={hotkeys.editOverlay} onChange={(value) => setHotkeys({ ...hotkeys, editOverlay: value })} />
              </div>
              <div className="mt-5 flex flex-col gap-4 rounded-2xl border border-[#63c48b]/15 bg-[#63c48b]/7 p-4 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs leading-6 text-[#b5b8c2]">กด <Kbd>{hotkeys.pushToTalk}</Kbd> ค้างเพื่อพูดไทย แล้วกด <Kbd>{hotkeys.copyLatest}</Kbd> เพื่อ Copy อังกฤษล่าสุด</p>
                <button className={primaryButton} onClick={() => void run("hotkeys", () => api.updateHotkeys(hotkeys), "เปลี่ยน hotkeys แล้ว")}><Save />บันทึก hotkeys</button>
              </div>
            </SettingsCard>

            <SettingsCard icon={<GripHorizontal />} title="Conversation overlay" subtitle="ตอนว่างจะยุบเป็น capsule และขยายอัตโนมัติเมื่อมีคำพูด">
              <div className="grid gap-5 md:grid-cols-2">
                <Slider label="ความทึบ" value={overlay.opacity} min={0.25} max={1} step={0.05} suffix={`${Math.round(overlay.opacity * 100)}%`} onChange={(value) => setOverlay({ ...overlay, opacity: value })} />
                <Slider label="ขนาดตัวอักษร" value={overlay.fontScale} min={0.7} max={1.6} step={0.05} suffix={`${Math.round(overlay.fontScale * 100)}%`} onChange={(value) => setOverlay({ ...overlay, fontScale: value })} />
                <Slider label="หายหลัง" value={overlay.fadeSeconds} min={3} max={20} step={1} suffix={`${overlay.fadeSeconds} วินาที`} onChange={(value) => setOverlay({ ...overlay, fadeSeconds: value })} />
                <Slider label="จำนวนวลี" value={overlay.maxItems} min={1} max={5} step={1} suffix={`${overlay.maxItems} แถว`} onChange={(value) => setOverlay({ ...overlay, maxItems: value })} />
              </div>
              <div className="mt-6 flex flex-wrap gap-2">
                <button className={primaryButton} onClick={() => void run("overlay-save", () => api.updateOverlay(overlay), "บันทึกรูปแบบ overlay แล้ว")}><Save />บันทึกรูปแบบ</button>
                <button className={secondaryButton} onClick={() => void run("overlay-edit", () => api.setOverlayEditMode(!runtime.overlayEditMode), runtime.overlayEditMode ? "ล็อก overlay แล้ว" : "ลาก overlay ได้แล้ว")}><GripHorizontal />{runtime.overlayEditMode ? "ล็อก Overlay" : "จัดตำแหน่ง"}</button>
                <button className={secondaryButton} onClick={() => void run("overlay-position", () => api.saveOverlayBounds(), "บันทึกตำแหน่งแล้ว")}><Save />บันทึกตำแหน่ง</button>
                <button className="inline-flex min-h-10 items-center gap-2 rounded-xl px-3 text-xs font-bold text-[#7dddA4] hover:bg-[#63c48b]/8" onClick={() => void api.injectDemo()}><Zap />ลองข้อความ</button>
              </div>
            </SettingsCard>
          </div>
        )}

        {activeTab === "history" && (
          <SettingsCard icon={<AudioLines />} title="Transcript ในหน่วยความจำ" subtitle="เก็บล่าสุดไม่เกิน 100 รายการ ปิดแอปแล้วหาย และไม่มีไฟล์เสียงถูกสร้าง">
            <div className="grid max-h-[520px] gap-2 overflow-y-auto pr-1 wangai-scrollbar">
              {snapshot.history.length === 0 && <EmptyState>ข้อความ final จะปรากฏที่นี่เมื่อเริ่มฟัง</EmptyState>}
              {snapshot.history.map((item) => <HistoryRow key={item.segmentId} item={item} />)}
            </div>
          </SettingsCard>
        )}

        <footer className="mt-5 flex flex-wrap items-center justify-between gap-2 px-2 text-[9px] text-[#646773]">
          <span>WANGAI · Borderless / Windowed · ไม่ inject DLL</span>
          <span>schema v{settings.schemaVersion}</span>
        </footer>
      </div>
    </main>
  );
}

function OverviewTab({ runtime, settings, hotkeys, onDemo, onEdit }: {
  runtime: RuntimeState;
  settings: AppSettings;
  hotkeys: HotkeySettings;
  onDemo: () => void;
  onEdit: () => void;
}) {
  const statuses = [
    { icon: <Gamepad2 />, label: "Game audio", value: runtime.attachedProcess?.displayName ?? "ยังไม่ attach", active: Boolean(runtime.attachedProcess) },
    { icon: <Cpu />, label: "Local VAD", value: runtime.workerModel ?? "กำลัง warm up", active: runtime.workerReady },
    { icon: <Mic />, label: "Thai reply", value: runtime.microphoneActive ? "กำลังฟังภาษาไทย" : `Hold ${hotkeys.pushToTalk}`, active: runtime.microphoneActive },
    { icon: <Wifi />, label: "Groq", value: runtime.groqStatus, active: runtime.groqSttBusy || settings.groq.configured },
  ];
  return (
    <div className="grid gap-4">
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {statuses.map((status) => <StatusCard {...status} key={status.label} />)}
      </section>
      <section className="grid gap-4 lg:grid-cols-[1.45fr_1fr]">
        <div className="rounded-[24px] border border-white/8 bg-[#1c1d24] p-5 shadow-[0_20px_60px_rgba(0,0,0,.22)] sm:p-6">
          <div className="flex items-start justify-between gap-4"><div><p className="text-[9px] font-bold tracking-[0.16em] text-[#7f828e]">YOUR LIVE SPACE</p><h2 className="mt-2 text-xl font-bold tracking-tight">{runtime.listening ? "กำลังฟังทีมของคุณ" : "พร้อมเมื่อคุณพร้อม"}</h2><p className="mt-2 text-xs leading-6 text-[#9497a3]">{runtime.statusMessage}</p></div><span className={`inline-flex items-center gap-2 rounded-full px-3 py-2 text-[10px] font-bold ${runtime.listening ? "bg-[#63c48b]/14 text-[#7dddA4]" : "bg-white/5 text-[#888b96]"}`}><StatusDot active={runtime.listening} />{runtime.listening ? "Listening" : "Ready"}</span></div>
          <div className="mt-6 grid gap-3">
            <ConversationPreview side="incoming" original="Join us at the north gate." translation="ไปรวมกันที่ประตูเหนือ" />
            <ConversationPreview side="outgoing" original="กำลังไป" translation="On my way." />
          </div>
          <div className="mt-6 flex flex-wrap gap-2"><button className={secondaryButton} onClick={onEdit}><GripHorizontal />จัดตำแหน่ง Overlay</button><button className="inline-flex min-h-10 items-center gap-2 rounded-xl px-3 text-xs font-bold text-[#7dddA4] hover:bg-[#63c48b]/8" onClick={onDemo}><Zap />ลองข้อความตัวอย่าง</button></div>
        </div>
        <div className="grid content-start gap-4">
          <div className="rounded-[22px] border border-[#63c48b]/14 bg-[#63c48b]/7 p-5"><ShieldCheck className="mb-4 size-5 text-[#70d99b]" /><h3 className="text-sm font-bold">เสียงอยู่ในเครื่องจนกว่าจะพบคำพูด</h3><p className="mt-2 text-xs leading-6 text-[#9ea1ac]">Silero VAD ส่งเฉพาะวลีที่จบแล้วไปยัง Groq Whisper และ WANGAI ไม่สร้างไฟล์เสียงหรือ transcript บนดิสก์</p></div>
          <div className="rounded-[22px] border border-white/8 bg-[#1c1d24] p-5"><p className="text-[9px] font-bold tracking-[0.16em] text-[#7f828e]">SHORTCUT FLOW</p><div className="mt-4 grid gap-3 text-xs text-[#b6b9c3]"><ShortcutRow keys={hotkeys.toggleListening} text="เปิดหรือหยุดฟังเกม" /><ShortcutRow keys={hotkeys.pushToTalk} text="กดค้างเพื่อพูดไทย" /><ShortcutRow keys={hotkeys.copyLatest} text="Copy อังกฤษล่าสุด" /></div></div>
        </div>
      </section>
    </div>
  );
}

function SettingsCard({ icon, title, subtitle, children }: { icon: ReactNode; title: string; subtitle: string; children: ReactNode }) {
  return <section className="rounded-[24px] border border-white/8 bg-[#1c1d24] p-5 shadow-[0_20px_60px_rgba(0,0,0,.18)] sm:p-6"><header className="mb-5 flex items-start gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-xl bg-white/5 text-[#70d99b] [&>svg]:size-5">{icon}</span><div><h2 className="text-base font-bold">{title}</h2><p className="mt-1 text-[11px] leading-5 text-[#888b96]">{subtitle}</p></div></header>{children}</section>;
}

function StatusDot({ active, warning = false }: { active: boolean; warning?: boolean }) {
  return <span className={`inline-block size-1.5 rounded-full ${warning ? "bg-amber-300" : active ? "bg-[#70d99b] shadow-[0_0_0_3px_rgba(112,217,155,.12)]" : "bg-[#626570]"}`} />;
}

function StatusCard({ icon, label, value, active }: { icon: ReactNode; label: string; value: string; active: boolean }) {
  return <article className="flex min-w-0 gap-3 rounded-[18px] border border-white/8 bg-[#1c1d24] p-4"><span className={`grid size-10 shrink-0 place-items-center rounded-xl [&>svg]:size-5 ${active ? "bg-[#63c48b]/12 text-[#70d99b]" : "bg-white/5 text-[#7d808b]"}`}>{icon}</span><div className="min-w-0"><small className="flex items-center gap-2 text-[9px] font-bold uppercase tracking-wider text-[#7f828e]"><StatusDot active={active} />{label}</small><strong className="mt-1.5 block truncate text-xs" title={value}>{value}</strong></div></article>;
}

function Field({ label, children, className = "" }: { label: string; children: ReactNode; className?: string }) {
  return <label className={`grid gap-1.5 ${className}`}><span className="text-[10px] font-medium text-[#8c8f9b]">{label}</span>{children}</label>;
}

function HotkeyInput({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <Field label={label}><input className={`${inputClass} font-mono font-bold tracking-wider text-[#7dddA4]`} value={value} onChange={(event) => onChange(event.target.value.toUpperCase())} /></Field>;
}

function Slider({ label, value, min, max, step, suffix, onChange }: { label: string; value: number; min: number; max: number; step: number; suffix: string; onChange: (value: number) => void }) {
  return <label className="grid gap-2"><span className="flex justify-between text-[10px] text-[#8c8f9b]"><b className="font-medium text-[#d0d2d8]">{label}</b><em className="not-italic text-[#7dddA4]">{suffix}</em></span><input className="wangai-range" type="range" value={value} min={min} max={max} step={step} onChange={(event) => onChange(Number(event.target.value))} /></label>;
}

function EmptyState({ children }: { children: ReactNode }) {
  return <div className="rounded-2xl border border-dashed border-white/10 px-5 py-10 text-center text-xs text-[#7f828e]">{children}</div>;
}

function HistoryRow({ item }: { item: SubtitleItem }) {
  return <article className={`grid grid-cols-[70px_minmax(0,1fr)_auto] gap-3 rounded-2xl border p-3 ${item.stream === "microphone" ? "border-[#63c48b]/12 bg-[#63c48b]/6" : "border-white/7 bg-[#202229]"}`}><span className={`h-fit w-fit rounded-md px-2 py-1 font-mono text-[8px] font-bold ${item.stream === "microphone" ? "bg-[#63c48b]/10 text-[#7dddA4]" : "bg-white/5 text-[#9ea1ac]"}`}>{item.stream === "game" ? "GAME · EN" : "MIC · TH"}</span><div className="min-w-0"><small className="block truncate text-[10px] text-[#888b96]">{item.originalText}</small><strong className="mt-1 block text-sm leading-6">{item.translatedText ?? (item.status === "pending" ? "กำลังแปล…" : "แปลไม่สำเร็จ")}</strong></div><time className="text-[9px] text-[#676a75]">{new Date(item.createdAtMs).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</time></article>;
}

function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="mx-1 rounded-md border border-white/12 bg-black/20 px-2 py-1 font-mono text-[10px] font-bold text-[#7dddA4]">{children}</kbd>;
}

function ShortcutRow({ keys, text }: { keys: string; text: string }) {
  return <div className="flex items-center justify-between gap-4"><span>{text}</span><Kbd>{keys}</Kbd></div>;
}

function ConversationPreview({ side, original, translation }: { side: "incoming" | "outgoing"; original: string; translation: string }) {
  return <div className={`grid max-w-[82%] gap-1 rounded-2xl px-4 py-3 ${side === "outgoing" ? "justify-self-end bg-[#63c48b] text-[#102118]" : "justify-self-start bg-[#25272f] text-[#f2f3f6]"}`}><strong className="text-sm">{translation}</strong><span className={`text-[11px] ${side === "outgoing" ? "text-[#183323]/70" : "text-[#9699a4]"}`}>{original}</span></div>;
}
