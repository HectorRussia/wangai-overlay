import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  AudioLines,
  Check,
  ChevronDown,
  Cloud,
  Cpu,
  Gamepad2,
  GripHorizontal,
  Headphones,
  KeyRound,
  Languages,
  LoaderCircle,
  Plus,
  RefreshCw,
  Save,
  Search,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  TriangleAlert,
  Volume2,
  Wifi,
  X,
  Zap,
} from "lucide-react";
import { api } from "./api";
import { ProcessPickerDialog } from "./ProcessPickerDialog";
import { ReadyRoom } from "./ReadyRoom";
import { advancedHref, settingsHref, type AdvancedSection, type SettingsTab } from "./router";
import { isPreviewMode, previewOutputDevices, previewProcesses } from "./preview";
import type {
  AudioOutputDevice,
  CaptureSource,
  GlossaryTerm,
  GroqModelOption,
  HotkeySettings,
  OverlaySettings,
  SubtitleItem,
  VadSettings,
  VoiceChatSettings,
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

const advancedTabs: Array<{ id: AdvancedSection; label: string; icon: ReactNode }> = [
  { id: "audio", label: "Audio", icon: <AudioLines /> },
  { id: "ai", label: "AI & Terms", icon: <Sparkles /> },
  { id: "controls", label: "Controls & Overlay", icon: <SlidersHorizontal /> },
];

const previewGroqModelCatalog: GroqModelOption[] = [
  { id: "whisper-large-v3-turbo", label: "Whisper Large V3 Turbo", description: "เร็วและประหยัด", kind: "speech_to_text", inputMicrousdPerMillion: 0, outputMicrousdPerMillion: 0, audioMicrousdPerHour: 40_000 },
  { id: "whisper-large-v3", label: "Whisper Large V3", description: "เน้นความแม่น", kind: "speech_to_text", inputMicrousdPerMillion: 0, outputMicrousdPerMillion: 0, audioMicrousdPerHour: 111_000 },
  { id: "openai/gpt-oss-20b", label: "GPT-OSS 20B", description: "เร็วและประหยัด", kind: "translation", inputMicrousdPerMillion: 75_000, outputMicrousdPerMillion: 300_000, audioMicrousdPerHour: 0 },
  { id: "openai/gpt-oss-120b", label: "GPT-OSS 120B", description: "เน้นคุณภาพภาษาไทย", kind: "translation", inputMicrousdPerMillion: 150_000, outputMicrousdPerMillion: 600_000, audioMicrousdPerHour: 0 },
];

export function SettingsApp({ activeTab, advancedSection = "audio" }: { activeTab: SettingsTab; advancedSection?: AdvancedSection }) {
  const { snapshot, refresh, loadingError } = useSnapshot();
  const [processes, setProcesses] = useState<CaptureSource[]>([]);
  const [outputDevices, setOutputDevices] = useState<AudioOutputDevice[]>([]);
  const [processSearch, setProcessSearch] = useState("");
  const [voiceProcessSearch, setVoiceProcessSearch] = useState("");
  const [processLoading, setProcessLoading] = useState(false);
  const [outputDevicesLoading, setOutputDevicesLoading] = useState(false);
  const [busy, setBusy] = useState<string>();
  const [toast, setToast] = useState<Toast>();
  const [groqKey, setGroqKey] = useState("");
  const [modelCatalog, setModelCatalog] = useState<GroqModelOption[]>([]);
  const [gameSttModel, setGameSttModel] = useState("");
  const [microphoneSttModel, setMicrophoneSttModel] = useState("");
  const [translationModel, setTranslationModel] = useState("");
  const [hotkeys, setHotkeys] = useState<HotkeySettings>();
  const [overlay, setOverlay] = useState<OverlaySettings>();
  const [vad, setVad] = useState<VadSettings>();
  const [voiceChat, setVoiceChat] = useState<VoiceChatSettings>();
  const [glossary, setGlossary] = useState<GlossaryTerm[]>([]);
  const [processPicker, setProcessPicker] = useState<"game" | "voice">();
  const closeProcessPicker = useCallback(() => setProcessPicker(undefined), []);

  useEffect(() => {
    if (!snapshot) return;
    setHotkeys(snapshot.settings.hotkeys);
    setOverlay(snapshot.settings.overlay);
    setVad(snapshot.settings.vad);
    setVoiceChat(snapshot.settings.voiceChat);
    setGlossary(snapshot.settings.glossary);
    setGameSttModel(snapshot.settings.groq.gameSttModel);
    setMicrophoneSttModel(snapshot.settings.groq.microphoneSttModel);
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

  const loadOutputDevices = useCallback(async () => {
    setOutputDevicesLoading(true);
    try {
      setOutputDevices(isPreviewMode() ? previewOutputDevices : await api.listGameOutputDevices());
    } catch (error) {
      setToast({ kind: "error", text: errorText(error) });
    } finally {
      setOutputDevicesLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === "overview" || (activeTab === "advanced" && advancedSection === "audio")) {
      void loadProcesses();
      void loadOutputDevices();
    }
  }, [activeTab, advancedSection, loadOutputDevices, loadProcesses]);

  useEffect(() => {
    if (activeTab !== "advanced" || advancedSection !== "ai") return;
    if (isPreviewMode()) {
      setModelCatalog(previewGroqModelCatalog);
      return;
    }
    void api.getGroqModelCatalog().then(setModelCatalog).catch((error) => {
      setToast({ kind: "error", text: errorText(error) });
    });
  }, [activeTab, advancedSection]);

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

  const filteredVoiceProcesses = useMemo(() => {
    const query = voiceProcessSearch.trim().toLowerCase();
    return [...processes]
      .filter(
        (process) =>
          !query
          || process.displayName.toLowerCase().includes(query)
          || process.executablePath.toLowerCase().includes(query),
      )
      .sort((left, right) => {
        const leftDiscord = left.name.toLowerCase().startsWith("discord") ? 0 : 1;
        const rightDiscord = right.name.toLowerCase().startsWith("discord") ? 0 : 1;
        return leftDiscord - rightDiscord || left.displayName.localeCompare(right.displayName);
      });
  }, [processes, voiceProcessSearch]);

  if (!snapshot || !hotkeys || !overlay || !vad || !voiceChat) {
    return (
      <main className="grid min-h-screen place-content-center justify-items-center gap-3 bg-[#15161a] text-[#a9acb5]">
        <LoaderCircle className="size-8 animate-spin text-[#70d99b]" />
        <strong className="text-sm text-white">กำลังเปิด WANGAI</strong>
        {(loadingError || toast?.text) && <p className="max-w-lg text-center text-xs text-red-300">{loadingError || toast?.text}</p>}
      </main>
    );
  }

  const { settings, runtime } = snapshot;
  const previewMode = isPreviewMode();
  const quotaPercent = Math.min(
    100,
    (settings.groq.estimatedSpendMicrousd / settings.groq.monthlyBudgetMicrousd) * 100,
  );
  const spendUsd = settings.groq.estimatedSpendMicrousd / 1_000_000;
  const budgetUsd = settings.groq.monthlyBudgetMicrousd / 1_000_000;
  const sttModels = modelCatalog.filter((model) => model.kind === "speech_to_text");
  const translationModels = modelCatalog.filter((model) => model.kind === "translation");
  const audioPeakDbfs = runtime.gameAudioPeakDbfs ?? -96;
  const audioLevelPercent = Math.max(0, Math.min(100, ((audioPeakDbfs + 60) / 60) * 100));
  const activeVadKey = settings.gameCaptureMode === "process_tree" ? "processTree" : "systemOutput";
  const activeVadProfile = vad[activeVadKey];
  const defaultOutputDevice = outputDevices.find((device) => device.isDefault);
  const selectedOutputDeviceMissing = Boolean(
    settings.gameOutputDeviceId
      && !outputDevices.some((device) => device.id === settings.gameOutputDeviceId),
  );
  const audioNeedsVadTuning = !runtime.gameVadActive
    && runtime.gameAudioPeakDbfs !== undefined
    && runtime.gameAudioPeakDbfs > -60;
  const updateActiveVadProfile = (profile: Partial<typeof activeVadProfile>) => {
    setVad({
      ...vad,
      [activeVadKey]: { ...activeVadProfile, ...profile },
    });
  };
  const audioDiagnostic = runtime.gameVadActive
    ? "Silero กำลังตรวจพบคำพูด"
    : runtime.gameAudioPeakDbfs === undefined
      ? "ยังไม่ได้รับ audio frame จากแหล่งเสียง"
      : runtime.gameAudioPeakDbfs <= -80
        ? "ได้รับ audio frame แต่เป็น digital silence"
        : "ได้รับเสียงแล้ว แต่ Silero ยังไม่พบคำพูด";
  const voicePeakDbfs = runtime.voiceChatAudioPeakDbfs ?? -96;
  const voiceLevelPercent = Math.max(0, Math.min(100, ((voicePeakDbfs + 60) / 60) * 100));
  const voiceDiagnostic = runtime.voiceChatVadActive
    ? "Silero กำลังตรวจพบเสียงพูดจาก Voice Chat"
    : !settings.voiceChat.enabled
      ? "ปิดการจับ Voice Chat อยู่"
      : runtime.voiceChatAudioPeakDbfs === undefined
        ? "ยังไม่ได้รับ audio frame จาก Voice Chat"
        : runtime.voiceChatAudioPeakDbfs <= -80
          ? "Voice Chat ส่ง digital silence"
          : "ได้รับเสียง Voice Chat แล้ว แต่ Silero ยังไม่พบคำพูด";

  const toggleListening = () => void run(
    "listen",
    () => api.toggleListening(),
    runtime.listening ? "หยุดฟังเสียงแล้ว" : "เริ่มฟังเสียงแล้ว",
  );
  const pageTitle = activeTab === "overview" ? "Ready Room" : activeTab === "history" ? "History" : "Advanced";

  return (
    <main className="settings-app min-h-screen bg-[#15161a] px-5 pt-6 pb-3 text-[#f6f6f8] selection:bg-[#63c48b]/30 lg:px-7 lg:pt-7 lg:pb-3">
      <div className="mx-auto w-full max-w-[1180px]">
        <header className="wangai-header">
          <div className="wangai-brand-lockup">
            <a aria-label="ไป Ready Room" href={settingsHref("overview")}><h1>WANGAI</h1></a>
            <span />
            <strong>{pageTitle}</strong>
          </div>
          {activeTab !== "overview" && (
            <div className="wangai-header-actions">
              <nav aria-label="เมนูหลัก">
                <a href={settingsHref("overview")}>Ready Room</a>
                <a aria-current={activeTab === "history" ? "page" : undefined} href={settingsHref("history")}>History</a>
                <a aria-current={activeTab === "advanced" ? "page" : undefined} href={advancedHref(advancedSection)}>Advanced</a>
              </nav>
              <button
                className={`header-listen-button ${runtime.listening ? "is-listening" : ""}`}
                disabled={busy === "listen" || previewMode}
                onClick={toggleListening}
              >
                {busy === "listen" ? <LoaderCircle className="animate-spin" /> : <Headphones />}
                {runtime.listening ? "หยุดฟัง · F8" : "เริ่มฟัง · F8"}
              </button>
            </div>
          )}
        </header>

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
          <ReadyRoom
            busy={busy}
            history={snapshot.history}
            onOpenGamePicker={() => setProcessPicker("game")}
            onOpenVoicePicker={() => setProcessPicker("voice")}
            onToggleListening={toggleListening}
            previewMode={previewMode}
            runtime={runtime}
            settings={settings}
          />
        )}

        {activeTab === "advanced" && (
          <section className="advanced-heading">
            <div><p className="eyebrow">การตั้งค่าขั้นสูง</p><h2>ตั้งค่า WANGAI</h2><span>เครื่องมือปรับแต่งและแก้ปัญหา</span></div>
            <nav aria-label="Advanced settings">
              {advancedTabs.map((tab) => (
                <a aria-current={advancedSection === tab.id ? "page" : undefined} href={advancedHref(tab.id)} key={tab.id}>
                  {tab.icon}{tab.label}
                </a>
              ))}
            </nav>
            {previewMode && <p className="advanced-preview-note">Browser Preview ใช้ข้อมูลจำลอง การบันทึกและตรวจเสียงจริงถูกปิดไว้</p>}
          </section>
        )}

        {activeTab === "advanced" && advancedSection === "audio" && (
          <div className="advanced-stack">
            <section className="advanced-source-overview">
              <div><span><Gamepad2 /></span><div><small>GAME</small><strong>{settings.selectedProcess?.displayName ?? "ยังไม่ได้เลือกเกม"}</strong><p>{runtime.captureWarning ?? "แหล่งเสียงหลักสำหรับบทสนทนาในเกม"}</p></div><button onClick={() => setProcessPicker("game")}>เปลี่ยนเกม</button></div>
              <div><span><Wifi /></span><div><small>VOICE CHAT</small><strong>{settings.voiceChat.selectedProcess?.displayName ?? "ค้นหา Discord อัตโนมัติ"}</strong><p>{runtime.voiceChatCaptureWarning ?? "แยกเสียงเพื่อนออกจาก GAME"}</p></div><button onClick={() => setProcessPicker("voice")}>เปลี่ยนแอป</button></div>
            </section>
            <details className="advanced-diagnostics">
              <summary><span><SlidersHorizontal /></span><div><strong>แก้ปัญหาเสียงและปรับความไว</strong><small>PID, VAD, Rescue Scan, output device และเครื่องมือทดสอบอยู่ที่นี่</small></div><ChevronDown /></summary>
              <div className="grid gap-4 advanced-diagnostics-body">
            <SettingsCard icon={<Volume2 />} title="Game audio diagnostics" subtitle="วัดระดับใน Rust เท่านั้น ไม่มี PCM หรือเสียงดิบถูกส่งเข้า React">
              <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
                <div>
                  <div className="mb-2 flex items-center justify-between gap-3 text-xs">
                    <strong className={runtime.gameVadActive ? "text-[#7dddA4]" : "text-[#d9dbe1]"}>{audioDiagnostic}</strong>
                    <span className="font-mono text-[10px] text-[#8b8e99]">Peak {audioPeakDbfs.toFixed(1)} dBFS</span>
                  </div>
                  <div aria-label="Game audio level" aria-valuemax={0} aria-valuemin={-96} aria-valuenow={audioPeakDbfs} className="h-2 overflow-hidden rounded-full bg-black/30" role="meter">
                    <span className={`block h-full rounded-full transition-[width,background-color] ${runtime.gameVadActive ? "bg-[#70d99b]" : "bg-[#7f8492]"}`} style={{ width: `${audioLevelPercent}%` }} />
                  </div>
                  <p className="mt-2 text-[10px] leading-5 text-[#858894]">
                    เลือก PID {runtime.attachedProcess?.pid ?? "—"} · จับจริง PID {runtime.effectiveCapturePid ?? "—"} {runtime.effectiveCaptureName ? `(${runtime.effectiveCaptureName})` : ""}
                  </p>
                  <p className="text-[10px] leading-5 text-[#858894]">
                    Silero ใช้ threshold {runtime.effectiveVadThreshold.toFixed(2)} · VAD gain +{runtime.effectiveVadGainDb.toFixed(0)} dB
                    {settings.gameCaptureMode === "system_output" ? ` · auto +${runtime.effectiveVadAutoGainDb.toFixed(0)} dB · adaptive floor ${Math.max(0.05, Math.min(0.12, runtime.effectiveVadThreshold * 0.25)).toFixed(2)}` : ""}
                  </p>
                  {settings.gameCaptureMode === "system_output" && (
                    <p className="text-[10px] leading-5 text-[#858894]">
                      Output ที่จับจริง: {runtime.effectiveOutputDeviceName ?? "—"}{runtime.effectiveOutputDeviceIsDefault ? " (Windows default)" : ""}
                    </p>
                  )}
                </div>
                <span className={`rounded-full border px-3 py-2 text-[10px] font-bold ${runtime.gameVadActive ? "border-[#63c48b]/30 bg-[#63c48b]/10 text-[#8de5b0]" : "border-white/10 bg-white/4 text-[#9a9da8]"}`}>
                  {settings.gameCaptureMode === "process_tree"
                    ? "Process tree"
                    : settings.systemOutputCloudScan
                      ? "System Output · Auto scan"
                      : "System Output"}
                </span>
              </div>
              {runtime.captureWarning && <p className="mt-4 flex items-center gap-2 rounded-xl border border-amber-300/20 bg-amber-300/8 px-3 py-2 text-[10px] leading-5 text-amber-100"><TriangleAlert className="size-4 shrink-0" />{runtime.captureWarning}</p>}
              {audioNeedsVadTuning && !runtime.captureWarning && (
                <p className="mt-4 flex items-center gap-2 rounded-xl border border-amber-300/20 bg-amber-300/8 px-3 py-2 text-[10px] leading-5 text-amber-100">
                  <TriangleAlert className="size-4 shrink-0" />เสียงเข้า Rust แล้วแต่ยังไม่ผ่าน Silero หากเป็นเสียงพูดให้ลองลด threshold หรือเพิ่ม VAD gain ของโปรไฟล์นี้
                </p>
              )}
              <div className="mt-4 flex flex-wrap items-center gap-3">
                {settings.gameCaptureMode === "system_output" && !settings.systemOutputCloudScan && (
                  <button
                    className={primaryButton}
                    disabled={busy === "cloud-scan" || runtime.budgetExhausted || previewMode}
                    onClick={() => {
                      if (window.confirm("เปิด Rescue Scan: ระบบจะตรวจหน้าต่าง System Output ในเครื่องและส่ง Groq เฉพาะเมื่อพบช่วงเสียงที่เด่นจาก noise floor อาจยังรวม Discord, browser, เพลง และการแจ้งเตือน ต้องการเปิดหรือไม่?")) {
                        void run("cloud-scan", () => api.updateSystemOutputCloudScan(true), "เปิดแปลอัตโนมัติแล้ว");
                      }
                    }}
                  >
                    {busy === "cloud-scan" ? <LoaderCircle className="animate-spin" /> : <Cloud />}
                    เปิดแปลอัตโนมัติ
                  </button>
                )}
                {settings.gameCaptureMode === "system_output" && settings.systemOutputCloudScan && (
                  <span className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-[#63c48b]/30 bg-[#63c48b]/10 px-4 text-xs font-bold text-[#8de5b0]">
                    <Check className="size-4" />Auto Cloud Scan ทำงานอยู่
                  </span>
                )}
                <button
                  className={secondaryButton}
                  disabled={!runtime.listening || runtime.groqSttBusy || busy === "audio-probe" || previewMode}
                  onClick={() => void run("audio-probe", () => api.probeRecentGameAudio(), "ส่งเสียงเกม 6 วินาทีล่าสุดไปตรวจแล้ว")}
                >
                  {busy === "audio-probe" ? <LoaderCircle className="animate-spin" /> : <AudioLines />}
                  ตรวจเสียง 6 วิล่าสุดด้วย Groq
                </button>
                <p className="max-w-xl text-[10px] leading-5 text-[#858894]">กดทันทีหลังเพื่อนพูด ปุ่มนี้ข้าม Silero ชั่วคราวและมีการคิดค่าเสียงขั้นต่ำ 10 วินาทีหนึ่งครั้ง</p>
              </div>
            </SettingsCard>

            <SettingsCard icon={<Wifi />} title="Voice chat diagnostics" subtitle="จับ Discord หรือแอป voice chat ผ่าน process loopback แยกจาก GAME">
              {settings.gameCaptureMode === "system_output" && (
                <p className="mb-4 flex items-center gap-2 rounded-xl border border-amber-300/20 bg-amber-300/8 px-3 py-2 text-[10px] leading-5 text-amber-100">
                  <TriangleAlert className="size-4 shrink-0" />System Output เป็นเสียงรวม จึงหยุดสาย Discord แยกเพื่อป้องกันข้อความซ้ำ และจะแสดงผลเป็น MIXED
                </p>
              )}
              <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
                <div>
                  <div className="mb-2 flex items-center justify-between gap-3 text-xs">
                    <strong className={runtime.voiceChatVadActive ? "text-[#7dddA4]" : "text-[#d9dbe1]"}>{voiceDiagnostic}</strong>
                    <span className="font-mono text-[10px] text-[#8b8e99]">Peak {voicePeakDbfs.toFixed(1)} dBFS</span>
                  </div>
                  <div aria-label="Voice chat audio level" aria-valuemax={0} aria-valuemin={-96} aria-valuenow={voicePeakDbfs} className="h-2 overflow-hidden rounded-full bg-black/30" role="meter">
                    <span className={`block h-full rounded-full transition-[width,background-color] ${runtime.voiceChatVadActive ? "bg-[#70d99b]" : "bg-[#7f8492]"}`} style={{ width: `${voiceLevelPercent}%` }} />
                  </div>
                  <p className="mt-2 text-[10px] leading-5 text-[#858894]">
                    เลือก PID {runtime.voiceChatAttachedProcess?.pid ?? "—"} · จับจริง PID {runtime.voiceChatEffectiveCapturePid ?? "—"} {runtime.voiceChatEffectiveCaptureName ? `(${runtime.voiceChatEffectiveCaptureName})` : ""}
                  </p>
                  <p className="text-[10px] leading-5 text-[#858894]">Silero threshold {runtime.voiceChatVadThreshold.toFixed(2)} · VAD gain +{runtime.voiceChatVadGainDb.toFixed(0)} dB · Rescue Scan {settings.voiceChat.rescueScan ? "เปิด" : "ปิด"}</p>
                </div>
                <span className={`rounded-full border px-3 py-2 text-[10px] font-bold ${runtime.voiceChatVadActive ? "border-[#63c48b]/30 bg-[#63c48b]/10 text-[#8de5b0]" : "border-white/10 bg-white/4 text-[#9a9da8]"}`}>
                  {settings.gameCaptureMode === "system_output" ? "MIXED · แยกไม่ได้" : settings.voiceChat.enabled ? (runtime.voiceChatAttachedProcess?.displayName ?? "รอ Voice Chat") : "ปิดอยู่"}
                </span>
              </div>
              {runtime.voiceChatCaptureWarning && settings.gameCaptureMode === "process_tree" && (
                <p className="mt-4 flex items-center gap-2 rounded-xl border border-amber-300/20 bg-amber-300/8 px-3 py-2 text-[10px] leading-5 text-amber-100"><TriangleAlert className="size-4 shrink-0" />{runtime.voiceChatCaptureWarning}</p>
              )}
              <button
                className={`${secondaryButton} mt-4`}
                disabled={!runtime.listening || !runtime.voiceChatAttachedProcess || runtime.groqSttBusy || busy === "voice-audio-probe" || previewMode}
                onClick={() => void run("voice-audio-probe", () => api.probeRecentSourceAudio("voice_chat"), "ส่งเสียง Voice Chat 6 วินาทีล่าสุดไปตรวจแล้ว")}
              >
                {busy === "voice-audio-probe" ? <LoaderCircle className="animate-spin" /> : <AudioLines />}ตรวจ Voice Chat 6 วิล่าสุด
              </button>

              <div className="mt-5 grid gap-3 rounded-2xl border border-white/8 bg-[#202229] p-4">
                <div className="flex flex-wrap gap-2">
                  <button
                    aria-pressed={voiceChat.enabled}
                    className={voiceChat.enabled ? primaryButton : secondaryButton}
                    disabled={busy === "voice-chat" || previewMode}
                    onClick={() => {
                      const next = { ...voiceChat, enabled: !voiceChat.enabled };
                      setVoiceChat(next);
                      void run("voice-chat", () => api.updateVoiceChat(next), next.enabled ? "เปิด Voice Chat แล้ว" : "ปิด Voice Chat แล้ว");
                    }}
                  >
                    <Wifi />{voiceChat.enabled ? "Voice Chat เปิดอยู่" : "เปิด Voice Chat"}
                  </button>
                  <button
                    aria-pressed={voiceChat.autoDetect}
                    className={voiceChat.autoDetect ? primaryButton : secondaryButton}
                    disabled={busy === "voice-chat" || previewMode}
                    onClick={() => {
                      const next = { ...voiceChat, autoDetect: !voiceChat.autoDetect };
                      setVoiceChat(next);
                      void run("voice-chat", () => api.updateVoiceChat(next), next.autoDetect ? "เปิดค้นหา Discord อัตโนมัติแล้ว" : "ปิดค้นหาอัตโนมัติแล้ว");
                    }}
                  >
                    <RefreshCw />Auto-detect {voiceChat.autoDetect ? "เปิด" : "ปิด"}
                  </button>
                  <button
                    aria-pressed={voiceChat.rescueScan}
                    className={voiceChat.rescueScan ? primaryButton : secondaryButton}
                    disabled={busy === "voice-chat" || runtime.budgetExhausted || previewMode}
                    onClick={() => {
                      const next = { ...voiceChat, rescueScan: !voiceChat.rescueScan };
                      setVoiceChat(next);
                      void run("voice-chat", () => api.updateVoiceChat(next), next.rescueScan ? "เปิด Voice Rescue Scan แล้ว" : "ปิด Voice Rescue Scan แล้ว");
                    }}
                  >
                    <Cloud />Rescue Scan {voiceChat.rescueScan ? "เปิด" : "ปิด"}
                  </button>
                </div>
                <p className="text-[10px] leading-5 text-[#858894]">Rescue Scan ใช้ PCM ต้นฉบับและส่งเฉพาะช่วงที่เด่นจาก noise floor อย่างน้อย 300 ms ไม่เร่งเสียงก่อนส่ง Whisper</p>
                <div className="grid gap-5 md:grid-cols-2">
                  <Slider label="Voice VAD threshold" value={voiceChat.vad.vadThreshold} min={0.2} max={0.9} step={0.05} suffix={voiceChat.vad.vadThreshold.toFixed(2)} onChange={(value) => setVoiceChat({ ...voiceChat, vad: { ...voiceChat.vad, vadThreshold: value } })} />
                  <Slider label="Voice VAD gain" value={voiceChat.vad.gainDb} min={0} max={18} step={1} suffix={`+${voiceChat.vad.gainDb.toFixed(0)} dB`} onChange={(value) => setVoiceChat({ ...voiceChat, vad: { ...voiceChat.vad, gainDb: value } })} />
                </div>
                <button className={primaryButton} disabled={busy === "voice-chat" || previewMode} onClick={() => void run("voice-chat", () => api.updateVoiceChat(voiceChat), "บันทึก Voice Chat และ restart Silero แล้ว")}><Save />บันทึก Voice Chat</button>
              </div>

              <div className="mt-5 mb-3 flex gap-2">
                <label className="relative flex-1">
                  <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#777a85]" />
                  <input aria-label="ค้นหา voice chat process" className={`${inputClass} pl-10`} value={voiceProcessSearch} onChange={(event) => setVoiceProcessSearch(event.target.value)} placeholder="Discord, Discord PTB, Discord Canary หรือแอปอื่น" />
                </label>
                <button className={secondaryButton} onClick={() => void loadProcesses()} disabled={processLoading}><RefreshCw className={processLoading ? "animate-spin" : ""} />รีเฟรช</button>
              </div>
              <div className="grid max-h-[260px] gap-2 overflow-y-auto pr-1 wangai-scrollbar">
                {filteredVoiceProcesses.slice(0, 30).map((process) => {
                  const selected = settings.voiceChat.selectedProcess?.lastPid === process.pid
                    || (settings.voiceChat.selectedProcess?.lastPid === undefined
                      && settings.voiceChat.selectedProcess?.executablePath.toLowerCase() === process.executablePath.toLowerCase());
                  const recommended = process.name.toLowerCase().startsWith("discord");
                  return (
                    <button
                      aria-pressed={selected}
                      className={`grid grid-cols-[42px_minmax(0,1fr)_auto] items-center gap-3 rounded-2xl border p-3 text-left transition ${selected ? "border-[#63c48b]/45 bg-[#63c48b]/9" : "border-white/7 bg-[#202229] hover:border-white/15 hover:bg-[#24262e]"}`}
                      disabled={previewMode}
                      key={`voice-${process.pid}-${process.executablePath}`}
                      onClick={() => void run("voice-process", () => api.selectVoiceChatProcess(process), `เลือก ${process.displayName} เป็น Voice Chat แล้ว`)}
                    >
                      <span className={`grid size-10 place-items-center rounded-xl ${selected ? "bg-[#63c48b]/15 text-[#75d99d]" : "bg-white/5 text-[#858894]"}`}><Wifi className="size-5" /></span>
                      <span className="min-w-0"><strong className="block text-sm">{process.displayName}</strong><small className="block truncate text-[10px] leading-5 text-[#7e818d]">{process.name} · PID {process.pid}<br />{process.executablePath}</small></span>
                      <span className="flex items-center gap-2">{recommended && <em className="rounded-full bg-[#63c48b]/10 px-2 py-1 text-[9px] not-italic text-[#7dddA4]">Discord</em>}{selected && <Check className="size-4 text-[#70d99b]" />}</span>
                    </button>
                  );
                })}
              </div>
            </SettingsCard>

            <SettingsCard icon={<Gamepad2 />} title="เลือกเกมที่จะฟัง" subtitle="WASAPI จะจับเฉพาะ process ที่เลือก รวม child process โดยไม่แตะ renderer ของเกม">
              <p className="mb-4 rounded-xl border border-amber-300/15 bg-amber-300/6 px-3 py-2 text-[10px] leading-5 text-amber-100/80">Process capture จะได้เสียงทั้งหมดจากเกมเดียวกัน รวมเสียงเพื่อน, NPC, เพลง และเอฟเฟกต์ จึงไม่สามารถแยกเฉพาะ voice chat ได้ 100%</p>
              <div className="mb-4 grid gap-2 rounded-2xl border border-white/8 bg-[#202229] p-3 sm:grid-cols-2">
                <button
                  aria-pressed={settings.gameCaptureMode === "process_tree"}
                  disabled={previewMode}
                  className={`rounded-xl border px-3 py-3 text-left transition ${settings.gameCaptureMode === "process_tree" ? "border-[#63c48b]/40 bg-[#63c48b]/10" : "border-white/8 hover:border-white/15"}`}
                  onClick={() => void run("capture-mode", () => api.updateGameCaptureMode("process_tree", false), "เปลี่ยนเป็น Process tree แล้ว")}
                >
                  <strong className="block text-xs">Process tree</strong><span className="mt-1 block text-[10px] leading-5 text-[#8d909b]">จับเฉพาะเกมและ process ลูก เป็นโหมดแนะนำ</span>
                </button>
                <button
                  aria-pressed={settings.gameCaptureMode === "system_output"}
                  disabled={previewMode}
                  className={`rounded-xl border px-3 py-3 text-left transition ${settings.gameCaptureMode === "system_output" ? "border-amber-300/35 bg-amber-300/8" : "border-white/8 hover:border-white/15"}`}
                  onClick={() => {
                    if (settings.gameCaptureMode === "system_output" && settings.systemOutputCloudScan) return;
                    if (window.confirm("System Output เป็นเสียง MIXED จากทั้ง endpoint และ Rescue Scan อาจรวม Discord, browser, เพลง และการแจ้งเตือน ต้องการเปิดใช้งานหรือไม่?")) {
                      void run("capture-mode", () => api.updateGameCaptureMode("system_output", true), "เปิด System Output และการแปลอัตโนมัติแล้ว");
                    }
                  }}
                >
                  <strong className="block text-xs">System Output fallback</strong><span className="mt-1 block text-[10px] leading-5 text-amber-100/70">ใช้เมื่อ voice chat อยู่นอก process tree และอาจรวมเสียงโปรแกรมอื่น</span>
                </button>
              </div>
              {settings.gameCaptureMode === "system_output" && (
                <div className="mb-4 grid gap-3 rounded-2xl border border-amber-300/18 bg-amber-300/6 p-3">
                  <p className="text-[10px] leading-5 text-amber-100/80">โหมดนี้ฟังเสียงทั้งหมดบน endpoint ที่เลือก แต่จะทำงานเฉพาะขณะเกมที่เลือกยังเปิดอยู่</p>
                  <div className={`grid gap-3 rounded-xl border p-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center ${settings.systemOutputCloudScan ? "border-[#63c48b]/35 bg-[#63c48b]/9" : "border-white/10 bg-black/10"}`}>
                    <div>
                      <strong className="flex items-center gap-2 text-xs"><Cloud className="size-4 text-[#70d99b]" />Auto Cloud Scan</strong>
                      <p className="mt-1 text-[10px] leading-5 text-[#a8abb5]">ตรวจเสียงย้อนหลัง 8 วินาทีในเครื่อง และส่ง Groq เฉพาะเมื่อมี activity เด่นจาก noise floor อย่างน้อย 300 ms พร้อมกรอง confidence/ข้อความซ้ำ</p>
                      <p className="mt-1 text-[10px] leading-5 text-amber-100/75">PCM อัตโนมัติไม่ถูกเร่งเสียง แต่ยังอาจรวม Discord, browser, เพลง และการแจ้งเตือนบน endpoint เดียวกัน · หยุดเมื่อถึงงบ $2</p>
                    </div>
                    <button
                      aria-pressed={settings.systemOutputCloudScan}
                      className={settings.systemOutputCloudScan ? primaryButton : secondaryButton}
                      disabled={busy === "cloud-scan" || runtime.budgetExhausted || previewMode}
                      onClick={() => {
                        const enabled = !settings.systemOutputCloudScan;
                        if (!enabled || window.confirm("Rescue Scan จะตรวจ System Output และส่ง Groq เฉพาะหน้าต่างที่ผ่าน activity gate แต่ยังอาจรวม Discord, browser, เพลง และการแจ้งเตือน ต้องการเปิดใช้งานหรือไม่?")) {
                          void run(
                            "cloud-scan",
                            () => api.updateSystemOutputCloudScan(enabled),
                            enabled ? "เปิด Auto Cloud Scan แล้ว" : "ปิด Auto Cloud Scan แล้ว",
                          );
                        }
                      }}
                    >
                      {busy === "cloud-scan" ? <LoaderCircle className="animate-spin" /> : <Cloud />}
                      {settings.systemOutputCloudScan ? "เปิดอยู่ · กดเพื่อปิด" : "เปิด Auto Cloud Scan"}
                    </button>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
                    <Field label="Mistfall output device">
                      <select
                        aria-label="Mistfall output device"
                        className={inputClass}
                        disabled={isPreviewMode() || outputDevicesLoading}
                        value={settings.gameOutputDeviceId ?? ""}
                        onChange={(event) => {
                          const value = event.target.value || undefined;
                          void run(
                            "output-device",
                            () => api.updateGameOutputDevice(value),
                            value ? "เปลี่ยนอุปกรณ์เสียง Mistfall แล้ว" : "เปลี่ยนเป็น Windows default แล้ว",
                          );
                        }}
                      >
                        <option value="">Windows default — {defaultOutputDevice?.name ?? "ไม่พบอุปกรณ์หลัก"}</option>
                        {selectedOutputDeviceMissing && settings.gameOutputDeviceId && (
                          <option value={settings.gameOutputDeviceId}>{settings.gameOutputDeviceId} — ไม่พบอุปกรณ์</option>
                        )}
                        {outputDevices.map((device) => (
                          <option key={device.id} value={device.id}>
                            {device.name}{device.isDefault ? " — ค่าเริ่มต้น" : ""} · {device.channels}ch/{Math.round(device.sampleRate / 1000)}kHz
                          </option>
                        ))}
                      </select>
                    </Field>
                    <button className={secondaryButton} disabled={outputDevicesLoading} onClick={() => void loadOutputDevices()}>
                      <RefreshCw className={outputDevicesLoading ? "animate-spin" : ""} /> รีเฟรชอุปกรณ์
                    </button>
                  </div>
                  <p className="text-[10px] leading-5 text-[#8f929d]">เลือก Speakers, หูฟัง หรือจอที่คุณได้ยินเสียง Mistfall อยู่จริง การเปลี่ยนค่านี้จะ restart เฉพาะ game capture</p>
                  {selectedOutputDeviceMissing && (
                    <p className="flex items-center gap-2 rounded-xl border border-red-300/20 bg-red-300/8 px-3 py-2 text-[10px] leading-5 text-red-100">
                      <TriangleAlert className="size-4 shrink-0" />ไม่พบอุปกรณ์ที่บันทึกไว้ กรุณาเลือก output endpoint ใหม่ ระบบจะไม่ fallback ไปอุปกรณ์อื่นอัตโนมัติ
                    </p>
                  )}
                </div>
              )}
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
                  const selected = settings.selectedProcess?.lastPid === process.pid
                    || (settings.selectedProcess?.lastPid === undefined
                      && settings.selectedProcess?.executablePath.toLowerCase() === process.executablePath.toLowerCase());
                  return (
                    <button
                      aria-pressed={selected}
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

            <SettingsCard icon={<Cpu />} title="Local Silero VAD" subtitle={`กำลังแก้โปรไฟล์ ${settings.gameCaptureMode === "process_tree" ? "Process tree" : "System Output"} · แต่ละโหมดจำค่าแยกกัน`}>
              <div className="grid gap-5 md:grid-cols-2">
                <Slider label="จบเมื่อเงียบ" value={vad.silenceMs} min={300} max={1500} step={100} suffix={`${vad.silenceMs} ms`} onChange={(value) => setVad({ ...vad, silenceMs: value })} />
                <Slider label="VAD threshold" value={activeVadProfile.vadThreshold} min={0.2} max={0.9} step={0.05} suffix={activeVadProfile.vadThreshold.toFixed(2)} onChange={(value) => updateActiveVadProfile({ vadThreshold: value })} />
                <Slider label="Game VAD gain" value={activeVadProfile.gainDb} min={0} max={18} step={1} suffix={`+${activeVadProfile.gainDb.toFixed(0)} dB`} onChange={(value) => updateActiveVadProfile({ gainDb: value })} />
                <Slider label="Game pre-roll" value={vad.preRollMs} min={0} max={1000} step={50} suffix={`${vad.preRollMs} ms`} onChange={(value) => setVad({ ...vad, preRollMs: value })} />
                <Slider label="วลียาวสุด" value={vad.maxUtteranceMs} min={5000} max={20000} step={1000} suffix={`${vad.maxUtteranceMs / 1000}s`} onChange={(value) => setVad({ ...vad, maxUtteranceMs: value })} />
              </div>
              <div className="mt-6 flex flex-wrap gap-2">
                <button className={primaryButton} onClick={() => void run("vad", () => api.updateVad(vad), "บันทึกและ restart Silero VAD แล้ว")}><RefreshCw />บันทึกและ Restart</button>
                <button className={secondaryButton} onClick={() => {
                  const preset = {
                    ...vad,
                    [activeVadKey]: { vadThreshold: 0.35, gainDb: 9 },
                  };
                  setVad(preset);
                  void run("vad-preset", () => api.updateVad(preset), "ใช้ preset เสียงเพื่อนเบาแล้ว");
                }}><Volume2 />Preset เสียงเพื่อนเบา</button>
                <button className={secondaryButton} onClick={() => void run("worker", () => api.restartWorker(), "กำลัง restart VAD worker")}><Cpu />Restart worker</button>
              </div>
            </SettingsCard>
              </div>
            </details>
          </div>
        )}

        {activeTab === "advanced" && advancedSection === "ai" && (
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
                <Field label="Game STT model">
                  <select aria-label="Game STT model" className={inputClass} value={gameSttModel} onChange={(event) => setGameSttModel(event.target.value)}>
                    {sttModels.length === 0 && <option value={gameSttModel}>{gameSttModel}</option>}
                    {sttModels.map((model) => <option key={model.id} value={model.id}>{model.label}</option>)}
                  </select>
                </Field>
                <Field label="F9 microphone STT model">
                  <select aria-label="F9 microphone STT model" className={inputClass} value={microphoneSttModel} onChange={(event) => setMicrophoneSttModel(event.target.value)}>
                    {sttModels.length === 0 && <option value={microphoneSttModel}>{microphoneSttModel}</option>}
                    {sttModels.map((model) => <option key={model.id} value={model.id}>{model.label}</option>)}
                  </select>
                </Field>
                <Field label="Translation model">
                  <select aria-label="Translation model" className={inputClass} value={translationModel} onChange={(event) => setTranslationModel(event.target.value)}>
                    {translationModels.length === 0 && <option value={translationModel}>{translationModel}</option>}
                    {translationModels.map((model) => <option key={model.id} value={model.id}>{model.label}</option>)}
                  </select>
                </Field>
                <p className="md:col-span-2 text-[10px] leading-5 text-[#8f929d]">ค่าแนะนำคือ <strong className="text-[#c8cad1]">Whisper Large V3 สำหรับเกม</strong> เพื่อรับมือเสียงรบกวน และ <strong className="text-[#c8cad1]">Turbo สำหรับ F9</strong> เพื่อให้ตอบเร็วและประหยัด</p>
              </div>
              <div className="mt-5 flex flex-wrap gap-2">
                <button className={primaryButton} disabled={!groqKey.trim() || busy === "groq"} onClick={() => void run("groq", async () => { await api.configureGroq(groqKey); setGroqKey(""); }, "บันทึก Groq key แล้ว")}><Save />บันทึก Groq key</button>
                <button className={secondaryButton} disabled={!gameSttModel || !microphoneSttModel || !translationModel || busy === "groq-models"} onClick={() => void run("groq-models", () => api.updateGroqModels(gameSttModel, microphoneSttModel, translationModel), "เปลี่ยนโมเดล Groq แล้ว")}><SlidersHorizontal />บันทึกโมเดล</button>
                <button className={secondaryButton} disabled={!settings.groq.configured || busy === "groq-test"} onClick={() => void run("groq-test", () => api.testGroq(), "ทดสอบ Groq สำเร็จ")}><Zap />ทดสอบคำแปล</button>
                <button className={dangerButton} disabled={!settings.groq.configured} onClick={() => void run("groq-clear", () => api.clearGroq(), "ลบ Groq key แล้ว")}><Trash2 />ลบ key</button>
              </div>
              <p className="mt-4 text-[10px] leading-5 text-[#7f828e]">เปลี่ยนโมเดลแล้วมีผลกับคำขอถัดไปทันที ไม่ต้อง restart VAD · เพดานนี้เป็นตัวป้องกันภายในแอป ยอดเงินจริงให้ตรวจใน Groq Console</p>
            </SettingsCard>

            <SettingsCard icon={<Languages />} title="คำศัพท์เกม" subtitle="ใช้รักษาศัพท์ตอนแปลเท่านั้น และจะไม่ส่งเป็น prompt ให้ Whisper">
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

        {activeTab === "advanced" && advancedSection === "controls" && (
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
                <Slider label="หายหลังไม่มีข้อความใหม่" value={overlay.fadeSeconds} min={3} max={20} step={1} suffix={`${overlay.fadeSeconds} วินาที`} onChange={(value) => setOverlay({ ...overlay, fadeSeconds: value })} />
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

        {processPicker && (
          <ProcessPickerDialog
            kind={processPicker}
            loading={processLoading}
            onClose={closeProcessPicker}
            onRefresh={() => void loadProcesses()}
            onSelect={async (source) => {
              await run(
                processPicker === "game" ? "process" : "voice-process",
                () => processPicker === "game" ? api.selectProcess(source) : api.selectVoiceChatProcess(source),
                processPicker === "game" ? `เลือก ${source.displayName} แล้ว` : `เลือก ${source.displayName} เป็น Voice Chat แล้ว`,
              );
              closeProcessPicker();
            }}
            previewMode={previewMode}
            processes={processes}
            selected={processPicker === "game" ? settings.selectedProcess : settings.voiceChat.selectedProcess}
          />
        )}

        {activeTab !== "overview" && (
          <footer className="mt-5 flex flex-wrap items-center justify-between gap-2 px-2 text-[9px] text-[#646773]">
            <span>WANGAI · Borderless / Windowed · ไม่ inject DLL</span>
            <span>schema v{settings.schemaVersion}</span>
          </footer>
        )}
      </div>
    </main>
  );
}

function SettingsCard({ icon, title, subtitle, children }: { icon: ReactNode; title: string; subtitle: string; children: ReactNode }) {
  return <section className="rounded-[24px] border border-white/8 bg-[#1c1d24] p-5 shadow-[0_20px_60px_rgba(0,0,0,.18)] sm:p-6"><header className="mb-5 flex items-start gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-xl bg-white/5 text-[#70d99b] [&>svg]:size-5">{icon}</span><div><h2 className="text-base font-bold">{title}</h2><p className="mt-1 text-[11px] leading-5 text-[#888b96]">{subtitle}</p></div></header>{children}</section>;
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
  const source = item.stream === "microphone"
    ? "MIC · TH"
    : item.sourceDisplayName?.toUpperCase() === "MIXED"
      ? "MIXED · EN"
      : item.stream === "voice_chat"
        ? `${item.sourceDisplayName ?? "VOICE"} · EN`
        : "GAME · EN";
  return <article className={`grid grid-cols-[90px_minmax(0,1fr)_auto] gap-3 rounded-2xl border p-3 ${item.stream === "microphone" ? "border-[#63c48b]/12 bg-[#63c48b]/6" : "border-white/7 bg-[#202229]"}`}><span className={`h-fit w-fit max-w-[90px] truncate rounded-md px-2 py-1 font-mono text-[8px] font-bold ${item.stream === "microphone" ? "bg-[#63c48b]/10 text-[#7dddA4]" : "bg-white/5 text-[#9ea1ac]"}`}>{source}</span><div className="min-w-0"><small className="block truncate text-[10px] text-[#888b96]">{item.originalText}</small><strong className="mt-1 block text-sm leading-6">{item.translatedText ?? (item.status === "pending" ? "กำลังแปล…" : "แปลไม่สำเร็จ")}</strong></div><time className="text-[9px] text-[#676a75]">{new Date(item.createdAtMs).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</time></article>;
}

function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="mx-1 rounded-md border border-white/12 bg-black/20 px-2 py-1 font-mono text-[10px] font-bold text-[#7dddA4]">{children}</kbd>;
}
