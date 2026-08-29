import { useCallback, useEffect, useMemo, useState } from "react";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import {
  Activity,
  AudioLines,
  Check,
  Clipboard,
  Cloud,
  Cpu,
  Gamepad2,
  GripHorizontal,
  Headphones,
  KeyRound,
  Languages,
  LoaderCircle,
  Mic,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Search,
  Settings2,
  ShieldCheck,
  Trash2,
  TriangleAlert,
  Wifi,
  X,
  Zap,
} from "lucide-react";
import { api } from "./api";
import type {
  AppSnapshot,
  AppSettings,
  CaptureSource,
  GlossaryTerm,
  HotkeySettings,
  OverlaySettings,
  RuntimeState,
  VadSettings,
  SubtitleItem,
  TranscriptEvent,
  TranslationResult,
  WorkerStatusEvent,
} from "./types";

type Toast = { kind: "ok" | "error"; text: string } | undefined;

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function useSnapshot() {
  const [snapshot, setSnapshot] = useState<AppSnapshot>();
  const [loadingError, setLoadingError] = useState<string>();

  const refresh = useCallback(async () => {
    try {
      setSnapshot(await api.snapshot());
      setLoadingError(undefined);
    } catch (error) {
      setLoadingError(errorText(error));
    }
  }, []);

  useEffect(() => {
    void refresh();
    const cleanup: UnlistenFn[] = [];
    let cancelled = false;
    const add = async <T,>(name: string, handler: (payload: T) => void) => {
      const unlisten = await listen<T>(name, (event) => handler(event.payload));
      if (cancelled) unlisten();
      else cleanup.push(unlisten);
    };
    void Promise.all([
      add<RuntimeState>("runtime-state", (runtime) =>
        setSnapshot((value) => (value ? { ...value, runtime } : value)),
      ),
      add<AppSettings>("settings-updated", (settings) =>
        setSnapshot((value) => (value ? { ...value, settings } : value)),
      ),
      add<WorkerStatusEvent>("worker-status", (status) =>
        setSnapshot((value) =>
          value
            ? {
                ...value,
                runtime: {
                  ...value.runtime,
                  workerReady: status.state === "ready",
                  workerModel: status.model ?? value.runtime.workerModel,
                  statusMessage: status.message,
                },
              }
            : value,
        ),
      ),
      add<string>("pipeline-status", (statusMessage) =>
        setSnapshot((value) =>
          value ? { ...value, runtime: { ...value.runtime, statusMessage } } : value,
        ),
      ),
      add<string>("pipeline-error", (lastError) =>
        setSnapshot((value) =>
          value ? { ...value, runtime: { ...value.runtime, lastError } } : value,
        ),
      ),
      add<TranscriptEvent>("transcript", (transcript) =>
        setSnapshot((value) =>
          value
            ? { ...value, partial: transcript.kind === "partial" ? transcript : undefined }
            : value,
        ),
      ),
      add<SubtitleItem>("subtitle-item", (item) =>
        setSnapshot((value) =>
          value
            ? {
                ...value,
                history: [item, ...value.history.filter((old) => old.segmentId !== item.segmentId)].slice(
                  0,
                  100,
                ),
              }
            : value,
        ),
      ),
      add<TranslationResult>("translation-result", (result) =>
        setSnapshot((value) =>
          value
            ? {
                ...value,
                history: value.history.map((item) =>
                  item.segmentId === result.segmentId
                    ? {
                        ...item,
                        translatedText: result.translatedText,
                        status: result.status,
                      }
                    : item,
                ),
              }
            : value,
        ),
      ),
    ]).catch((error) => setLoadingError(errorText(error)));
    return () => {
      cancelled = true;
      cleanup.forEach((unlisten) => unlisten());
    };
  }, [refresh]);

  return { snapshot, setSnapshot, refresh, loadingError };
}

export function App() {
  const view = new URLSearchParams(window.location.search).get("view");
  useEffect(() => {
    document.body.className = view === "overlay" ? "overlay-body" : "settings-body";
  }, [view]);
  return view === "overlay" ? <OverlayApp /> : <SettingsApp />;
}

function StatusDot({ active, warning = false }: { active: boolean; warning?: boolean }) {
  return <span className={`status-dot ${active ? "active" : ""} ${warning ? "warning" : ""}`} />;
}

function SettingsApp() {
  const { snapshot, setSnapshot, refresh, loadingError } = useSnapshot();
  const [processes, setProcesses] = useState<CaptureSource[]>([]);
  const [processSearch, setProcessSearch] = useState("");
  const [processLoading, setProcessLoading] = useState(false);
  const [busy, setBusy] = useState<string>();
  const [toast, setToast] = useState<Toast>();
  const [xaiKey, setXaiKey] = useState("");
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
  }, [snapshot?.settings]);

  const loadProcesses = useCallback(async () => {
    setProcessLoading(true);
    try {
      setProcesses(await api.listProcesses());
    } catch (error) {
      setToast({ kind: "error", text: errorText(error) });
    } finally {
      setProcessLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadProcesses();
  }, [loadProcesses]);

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
      <main className="startup-screen">
        <LoaderCircle className="spin" />
        <strong>กำลังเปิด GameLingo</strong>
        {(loadingError || toast?.text) && <p>{loadingError || toast?.text}</p>}
      </main>
    );
  }

  const { settings, runtime } = snapshot;
  const quotaPercent = Math.min(100, (settings.xai.estimatedSpendMicrousd / settings.xai.monthlyBudgetMicrousd) * 100);
  const spendUsd = settings.xai.estimatedSpendMicrousd / 1_000_000;
  const budgetUsd = settings.xai.monthlyBudgetMicrousd / 1_000_000;

  return (
    <div className="settings-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark"><Languages /></span>
          <div><strong>GameLingo</strong><small>Realtime translator</small></div>
        </div>
        <nav>
          <a href="#status"><Activity /> ภาพรวม</a>
          <a href="#source"><Gamepad2 /> เกมและเสียง</a>
          <a href="#translation"><Cloud /> คำแปล</a>
          <a href="#controls"><KeyRound /> ปุ่มควบคุม</a>
          <a href="#overlay"><Pencil /> Overlay</a>
          <a href="#glossary"><Languages /> คำศัพท์เกม</a>
          <a href="#history"><AudioLines /> Transcript</a>
        </nav>
        <div className="sidebar-note">
          <ShieldCheck />
          <p><strong>ส่งเฉพาะช่วงที่มีคำพูด</strong><br />Silero VAD ทำงานในเครื่อง ก่อนส่งเสียงไป xAI STT</p>
        </div>
      </aside>

      <main className="settings-content">
        <header className="topbar" id="status">
          <div>
            <span className="eyebrow">WINDOWS PERSONAL OVERLAY</span>
            <h1>พร้อมคุยกับทีมต่างชาติ</h1>
            <p>{runtime.statusMessage}</p>
          </div>
          <button
            className={`listen-button ${runtime.listening ? "listening" : ""}`}
            disabled={busy === "listen"}
            onClick={() =>
              void run("listen", () => api.toggleListening(), runtime.listening ? "หยุดฟังแล้ว" : "เริ่มฟังแล้ว")
            }
          >
            {busy === "listen" ? <LoaderCircle className="spin" /> : <Headphones />}
            {runtime.listening ? "หยุดฟัง F8" : "เริ่มฟัง F8"}
          </button>
        </header>

        {toast && (
          <div className={`toast ${toast.kind}`}>
            {toast.kind === "ok" ? <Check /> : <TriangleAlert />}
            <span>{toast.text}</span>
            <button onClick={() => setToast(undefined)}><X /></button>
          </div>
        )}
        {runtime.lastError && <div className="inline-warning"><TriangleAlert /> {runtime.lastError}</div>}

        <section className="status-grid">
          <StatusCard icon={<Gamepad2 />} label="เกม" active={Boolean(runtime.attachedProcess)} value={runtime.attachedProcess?.displayName ?? "ยังไม่ attach"} />
          <StatusCard icon={<Cpu />} label="Local VAD" active={runtime.workerReady} value={runtime.workerModel ?? "กำลัง warm up"} />
          <StatusCard icon={<Mic />} label="ไมโครโฟน" active={runtime.microphoneActive} value={runtime.microphoneActive ? "กำลังฟังภาษาไทย" : `กด ${hotkeys.pushToTalk} ค้าง`} />
          <StatusCard icon={<Wifi />} label="xAI / Grok" active={runtime.xaiSttConnected || settings.xai.configured} value={runtime.xaiStatus} />
        </section>

        <section className="panel" id="source">
          <PanelHeading icon={<Gamepad2 />} title="เลือกเกมที่จะฟัง" subtitle="จับเฉพาะ WASAPI audio session ของ process ที่เลือก รวม child process" />
          <div className="process-toolbar">
            <label className="search-box"><Search /><input value={processSearch} onChange={(event) => setProcessSearch(event.target.value)} placeholder="ค้นหา process หรือ path" /></label>
            <button className="secondary" onClick={() => void loadProcesses()} disabled={processLoading}><RefreshCw className={processLoading ? "spin" : ""} />รีเฟรช</button>
          </div>
          <div className="process-list">
            {filteredProcesses.slice(0, 40).map((process) => {
              const selected = settings.selectedProcess?.executablePath.toLowerCase() === process.executablePath.toLowerCase();
              return (
                <button
                  className={`process-row ${selected ? "selected" : ""}`}
                  key={`${process.pid}-${process.executablePath}`}
                  onClick={() => void run("process", () => api.selectProcess(process), `เลือก ${process.displayName} แล้ว`)}
                >
                  <span className="process-icon">{process.isMistfall ? <Zap /> : <Gamepad2 />}</span>
                  <span><strong>{process.displayName}</strong><small>{process.name} · PID {process.pid}<br />{process.executablePath}</small></span>
                  {process.isMistfall && <em>แนะนำ</em>}
                  {selected && <Check />}
                </button>
              );
            })}
            {!processLoading && filteredProcesses.length === 0 && <div className="empty">ไม่พบ process ที่ตรงกัน ลองเปิดเกมแล้วกดรีเฟรช</div>}
          </div>
        </section>

        <section className="panel" id="translation">
          <PanelHeading icon={<Cloud />} title="xAI Streaming STT + Grok" subtitle="Key เก็บใน Windows Credential Manager และจะไม่ถูกอ่านกลับเข้า React หรือส่งให้ Python" />
          <div className="quota-row">
            <div><span>ค่าใช้จ่ายประมาณการเดือน {settings.xai.usageMonth}</span><strong>${spendUsd.toFixed(4)} / ${budgetUsd.toFixed(2)}</strong></div>
            <span>{quotaPercent.toFixed(1)}%</span>
          </div>
          <div className="progress"><span style={{ width: `${quotaPercent}%` }} /></div>
          <div className="form-grid xai-form">
            <label className="wide"><span>xAI API key</span><input type="password" value={xaiKey} onChange={(event) => setXaiKey(event.target.value)} placeholder={settings.xai.configured ? "•••••••• (ตั้งค่าแล้ว ใส่ใหม่เมื่อต้องการเปลี่ยน)" : "วาง xAI API key จาก console.x.ai"} /></label>
            <label><span>Translation model</span><input value={settings.xai.model} disabled /></label>
            <label><span>Cloud usage</span><input value={`${(settings.xai.audioMillis / 60_000).toFixed(2)} นาทีเสียง · ${(settings.xai.promptTokens + settings.xai.completionTokens).toLocaleString()} tokens`} disabled /></label>
          </div>
          <div className="button-row">
            <button className="primary" disabled={!xaiKey.trim() || busy === "xai"} onClick={() => void run("xai", async () => { await api.configureXai(xaiKey); setXaiKey(""); }, "บันทึก xAI key ใน Credential Manager แล้ว")}><Save />บันทึก xAI</button>
            <button className="secondary" disabled={!settings.xai.configured || busy === "xai-test"} onClick={() => void run("xai-test", async () => { const result = await api.testXai(); setToast({ kind: "ok", text: `ทดสอบสำเร็จ: ${result}` }); }, "ทดสอบ Grok สำเร็จ")}><Zap />ทดสอบคำแปล</button>
            <button className="danger-ghost" disabled={!settings.xai.configured} onClick={() => void run("xai-clear", () => api.clearXai(), "ลบ xAI key จาก Credential Manager แล้ว")}><Trash2 />ลบ key</button>
          </div>
          <p className="helper-text">xAI เป็นบริการแบบชำระเงิน ตัวเลขนี้เป็นเพดานภายในแอป ยอดจริงให้ตรวจใน xAI Console</p>
        </section>

        <section className="panel split-panel" id="controls">
          <div>
            <PanelHeading icon={<KeyRound />} title="Global hotkeys" subtitle="รองรับปุ่มเดี่ยวหรือชุดปุ่ม เช่น Ctrl+Shift+G" />
            <div className="hotkey-grid">
              <HotkeyInput label="เปิด/ปิดฟังเกม" value={hotkeys.toggleListening} onChange={(value) => setHotkeys({ ...hotkeys, toggleListening: value })} />
              <HotkeyInput label="กดค้างพูดไทย" value={hotkeys.pushToTalk} onChange={(value) => setHotkeys({ ...hotkeys, pushToTalk: value })} />
              <HotkeyInput label="Copy อังกฤษล่าสุด" value={hotkeys.copyLatest} onChange={(value) => setHotkeys({ ...hotkeys, copyLatest: value })} />
              <HotkeyInput label="ลาก/ปรับ overlay" value={hotkeys.editOverlay} onChange={(value) => setHotkeys({ ...hotkeys, editOverlay: value })} />
            </div>
            <button className="primary" onClick={() => void run("hotkeys", () => api.updateHotkeys(hotkeys), "เปลี่ยน hotkeys แล้ว")}><Save />บันทึก hotkeys</button>
          </div>
          <div className="ptt-tip">
            <Mic />
            <strong>พูดตอบทีม</strong>
            <p>กด <kbd>{hotkeys.pushToTalk}</kbd> ค้าง → พูดไทย → ปล่อยปุ่ม แล้วกด <kbd>{hotkeys.copyLatest}</kbd> เพื่อ Copy อังกฤษ</p>
            <small>แอปจะไม่พิมพ์เข้าเกมให้อัตโนมัติ</small>
          </div>
        </section>

        <section className="panel" id="overlay">
          <PanelHeading icon={<Pencil />} title="หน้าตา Overlay" subtitle="F7 เปิดโหมดลากและปรับขนาด แล้วกดบันทึกตำแหน่ง" />
          <div className="slider-grid">
            <Slider label="ความทึบ" value={overlay.opacity} min={0.25} max={1} step={0.05} suffix={`${Math.round(overlay.opacity * 100)}%`} onChange={(value) => setOverlay({ ...overlay, opacity: value })} />
            <Slider label="ขนาดตัวอักษร" value={overlay.fontScale} min={0.7} max={1.6} step={0.05} suffix={`${Math.round(overlay.fontScale * 100)}%`} onChange={(value) => setOverlay({ ...overlay, fontScale: value })} />
            <Slider label="หายหลัง" value={overlay.fadeSeconds} min={3} max={20} step={1} suffix={`${overlay.fadeSeconds} วินาที`} onChange={(value) => setOverlay({ ...overlay, fadeSeconds: value })} />
            <Slider label="จำนวนวลี" value={overlay.maxItems} min={1} max={5} step={1} suffix={`${overlay.maxItems} แถว`} onChange={(value) => setOverlay({ ...overlay, maxItems: value })} />
          </div>
          <div className="button-row">
            <button className="primary" onClick={() => void run("overlay-save", () => api.updateOverlay(overlay), "บันทึกรูปแบบ overlay แล้ว")}><Save />บันทึกรูปแบบ</button>
            <button className="secondary" onClick={() => void run("overlay-edit", () => api.setOverlayEditMode(!runtime.overlayEditMode), runtime.overlayEditMode ? "ล็อก overlay แล้ว" : "ลาก overlay ได้แล้ว")}><GripHorizontal />{runtime.overlayEditMode ? "ล็อก Overlay" : "โหมดจัดตำแหน่ง"}</button>
            <button className="secondary" onClick={() => void run("overlay-position", () => api.saveOverlayBounds(), "บันทึกตำแหน่งแล้ว")}><Save />บันทึกตำแหน่ง</button>
            <button className="ghost" onClick={() => void api.injectDemo()}><Zap />ลองข้อความตัวอย่าง</button>
          </div>
        </section>

        <section className="panel" id="speech">
          <PanelHeading icon={<Cpu />} title="Local Silero VAD" subtitle="ตรวจจับช่วงคำพูดในเครื่อง แล้วส่งเฉพาะช่วงนั้นไป xAI Streaming STT" />
          <div className="slider-grid">
            <Slider label="Partial interval" value={vad.partialIntervalMs} min={750} max={3000} step={250} suffix={`${vad.partialIntervalMs} ms`} onChange={(value) => setVad({ ...vad, partialIntervalMs: value })} />
            <Slider label="จบเมื่อเงียบ" value={vad.silenceMs} min={300} max={1500} step={100} suffix={`${vad.silenceMs} ms`} onChange={(value) => setVad({ ...vad, silenceMs: value })} />
            <Slider label="VAD threshold" value={vad.vadThreshold} min={0.2} max={0.9} step={0.05} suffix={vad.vadThreshold.toFixed(2)} onChange={(value) => setVad({ ...vad, vadThreshold: value })} />
            <Slider label="Pre-roll" value={vad.preRollMs} min={0} max={1000} step={50} suffix={`${vad.preRollMs} ms`} onChange={(value) => setVad({ ...vad, preRollMs: value })} />
            <Slider label="วลียาวสุด" value={vad.maxUtteranceMs} min={5000} max={20000} step={1000} suffix={`${vad.maxUtteranceMs / 1000}s`} onChange={(value) => setVad({ ...vad, maxUtteranceMs: value })} />
          </div>
          <div className="button-row"><button className="primary" onClick={() => void run("vad", () => api.updateVad(vad), "บันทึกและ restart Silero VAD แล้ว")}><RefreshCw />บันทึกและ Restart</button><button className="secondary" onClick={() => void run("worker", () => api.restartWorker(), "กำลัง restart VAD worker")}><Cpu />Restart worker</button></div>
        </section>

        <section className="panel" id="glossary">
          <PanelHeading icon={<Languages />} title="คำศัพท์ Mistfall Hunter" subtitle="ป้องกันชื่อไอเทม สถานที่ คลาส และ callout ไม่ให้เปลี่ยนความหมาย" />
          <div className="glossary-table">
            <div className="glossary-head"><span>English</span><span>ไทย / คำที่ต้องการ</span><span /></div>
            {glossary.map((term, index) => (
              <div className="glossary-row" key={index}>
                <input value={term.source} onChange={(event) => setGlossary(glossary.map((old, oldIndex) => oldIndex === index ? { ...old, source: event.target.value } : old))} />
                <input value={term.target} onChange={(event) => setGlossary(glossary.map((old, oldIndex) => oldIndex === index ? { ...old, target: event.target.value } : old))} />
                <button className="icon-button" onClick={() => setGlossary(glossary.filter((_, oldIndex) => oldIndex !== index))}><Trash2 /></button>
              </div>
            ))}
          </div>
          <div className="button-row"><button className="secondary" onClick={() => setGlossary([...glossary, { source: "", target: "" }])}><Plus />เพิ่มคำ</button><button className="primary" onClick={() => void run("glossary", () => api.updateGlossary(glossary.filter((term) => term.source.trim() && term.target.trim())), "บันทึก glossary แล้ว")}><Save />บันทึกคำศัพท์</button></div>
        </section>

        <section className="panel" id="history">
          <PanelHeading icon={<AudioLines />} title="Transcript ในหน่วยความจำ" subtitle="ล่าสุดไม่เกิน 100 รายการ ปิดแอปแล้วหาย และไม่มีไฟล์เสียงถูกสร้าง" />
          <div className="history-list">
            {snapshot.history.length === 0 && <div className="empty">เมื่อเริ่มฟัง ข้อความ final จะปรากฏที่นี่</div>}
            {snapshot.history.map((item) => <HistoryRow key={item.segmentId} item={item} />)}
          </div>
        </section>

        <footer>GameLingo MVP · Borderless / Windowed · ไม่ inject DLL · schema v{settings.schemaVersion}</footer>
      </main>
    </div>
  );
}

function PanelHeading({ icon, title, subtitle }: { icon: React.ReactNode; title: string; subtitle: string }) {
  return <div className="panel-heading"><span>{icon}</span><div><h2>{title}</h2><p>{subtitle}</p></div></div>;
}

function StatusCard({ icon, label, value, active }: { icon: React.ReactNode; label: string; value: string; active: boolean }) {
  return <article className="status-card"><span className="status-icon">{icon}</span><div><small><StatusDot active={active} />{label}</small><strong title={value}>{value}</strong></div></article>;
}

function HotkeyInput({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label><span>{label}</span><input className="hotkey-input" value={value} onChange={(event) => onChange(event.target.value.toUpperCase())} /></label>;
}

function Slider({ label, value, min, max, step, suffix, onChange }: { label: string; value: number; min: number; max: number; step: number; suffix: string; onChange: (value: number) => void }) {
  return <label className="slider"><span><b>{label}</b><em>{suffix}</em></span><input type="range" value={value} min={min} max={max} step={step} onChange={(event) => onChange(Number(event.target.value))} /></label>;
}

function HistoryRow({ item }: { item: SubtitleItem }) {
  return (
    <article className="history-row">
      <span className={`stream-tag ${item.stream}`}>{item.stream === "game" ? "GAME · EN" : "MIC · TH"}</span>
      <div><small>{item.originalText}</small><strong>{item.translatedText ?? (item.status === "pending" ? "กำลังแปล…" : "แปลไม่สำเร็จ")}</strong></div>
      <time>{new Date(item.createdAtMs).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</time>
    </article>
  );
}

function OverlayApp() {
  const { snapshot } = useSnapshot();
  const [, setClock] = useState(Date.now());
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    const timer = window.setInterval(() => setClock(Date.now()), 500);
    return () => window.clearInterval(timer);
  }, []);
  if (!snapshot) return null;
  const { settings, runtime, partial } = snapshot;
  const visible = snapshot.history
    .filter((item) => Date.now() - item.createdAtMs < settings.overlay.fadeSeconds * 1000)
    .slice(0, settings.overlay.maxItems);
  const style = {
    "--overlay-opacity": settings.overlay.opacity,
    "--font-scale": settings.overlay.fontScale,
  } as React.CSSProperties;
  const copy = async () => {
    const ok = await api.copyLatestReply();
    if (ok) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    }
  };
  return (
    <main className={`overlay-shell ${runtime.overlayEditMode ? "editing" : ""}`} style={style}>
      <div className="overlay-top">
        <div className="overlay-state"><StatusDot active={runtime.listening && Boolean(runtime.attachedProcess)} warning={runtime.listening && !runtime.attachedProcess} /><span>{runtime.microphoneActive ? "ฟังไมค์ไทย…" : runtime.attachedProcess ? runtime.attachedProcess.displayName : runtime.statusMessage}</span></div>
        {runtime.overlayEditMode && <button className="drag-handle" onMouseDown={() => void api.startOverlayDrag()}><GripHorizontal />ลาก Overlay · F7 เพื่อล็อก</button>}
      </div>
      {partial && <div className="partial-row"><AudioLines /><span>{partial.text}</span><i>LIVE</i></div>}
      <div className="subtitle-stack">
        {visible.map((item) => (
          <article className={`subtitle-card ${item.stream}`} key={item.segmentId}>
            <div className="subtitle-copy"><small>{item.stream === "game" ? "EN" : "TH"} · {item.originalText}</small><strong>{item.translatedText ?? (item.status === "pending" ? "กำลังแปล…" : "แปลไม่สำเร็จ")}</strong></div>
            {item.stream === "microphone" && item.translatedText && <button title="Copy English" onClick={() => void copy()}>{copied ? <Check /> : <Clipboard />}</button>}
          </article>
        ))}
      </div>
      {visible.length === 0 && !partial && runtime.overlayEditMode && <div className="overlay-empty"><Languages /><span>Overlay พร้อมแล้ว<br /><small>กด “ลองข้อความตัวอย่าง” จาก Settings</small></span></div>}
      <div className="overlay-chips">
        <span><Headphones />{runtime.listening ? "GAME ON" : "GAME OFF"}</span>
        <span className={runtime.workerReady ? "ok" : "warn"}><Cpu />{runtime.workerReady ? "VAD READY" : "WARMING"}</span>
        <span className={settings.xai.configured && !runtime.budgetExhausted ? "ok" : "warn"}><Wifi />{runtime.budgetExhausted ? "BUDGET" : settings.xai.configured ? "XAI READY" : "NO XAI"}</span>
        <span><Mic />{settings.hotkeys.pushToTalk} HOLD</span>
      </div>
    </main>
  );
}
