import { Slider } from "../../shared/ui/Slider";
import { useCommandTask } from "../../shared/useCommandTask";
import { useCallback, useEffect, useState } from "react";
import {
  AudioLines,
  Cloud,
  Cpu,
  Globe2,
  Languages,
  LoaderCircle,
  Plus,
  RefreshCw,
  Save,
  SlidersHorizontal,
  Trash2,
  TriangleAlert,
  Volume2,
} from "lucide-react";
import { api, type WebCompanionInfo } from "../../api";
import { ProcessPickerDialog } from "../sources/ProcessPickerDialog";
import {
  advancedHref,
  settingsHref,
  type AdvancedSection,
  type SettingsTab,
} from "../../router";
import { isPreviewMode, previewOutputDevices } from "../../preview";
import { useRunningApps } from "../sources/useRunningApps";
import type { AudioOutputDevice, GlossaryTerm, VadSettings } from "../../types";
import { errorText, useSnapshot } from "../../state/useSnapshot";

const button =
  "settings-button settings-button-secondary inline-flex min-h-10 shrink-0 items-center justify-center gap-2 whitespace-nowrap px-4 text-xs font-bold disabled:opacity-40";
const primary =
  "settings-button settings-button-primary inline-flex min-h-10 shrink-0 items-center justify-center gap-2 whitespace-nowrap px-4 text-xs font-bold disabled:opacity-40";
const input =
  "settings-input min-h-11 min-w-0 w-full rounded-lg px-3 text-sm outline-none";
const isDesktop = () => "__TAURI_INTERNALS__" in window;

export function AdvancedSettings({
  activeTab = "advanced",
  advancedSection = "audio",
}: {
  activeTab?: SettingsTab;
  advancedSection?: AdvancedSection;
}) {
  const { snapshot, refresh, loadingError } = useSnapshot();
  const [devices, setDevices] = useState<AudioOutputDevice[]>([]);
  const [picker, setPicker] = useState(false);
  const runningApps = useRunningApps(picker);
  const { busy, toast, setToast, run } = useCommandTask(refresh, undefined);
  const [vad, setVad] = useState<VadSettings>();
  const [glossary, setGlossary] = useState<GlossaryTerm[]>([]);
  const [webInfo, setWebInfo] = useState<WebCompanionInfo>();

  useEffect(() => {
    if (!snapshot) return;
    setVad(snapshot.settings.vad);
    setGlossary(snapshot.settings.glossary);
  }, [JSON.stringify(snapshot?.settings)]);

  const loadDevices = useCallback(async () => {
    try {
      setDevices(
        isPreviewMode() ? previewOutputDevices : await api.listOutputDevices(),
      );
    } catch (error) {
      setToast({ kind: "error", text: errorText(error) });
    }
  }, []);
  useEffect(() => {
    void loadDevices();
  }, [loadDevices]);
  useEffect(() => {
    if (isDesktop())
      void api
        .getWebCompanionInfo()
        .then(setWebInfo)
        .catch(() => undefined);
  }, []);

  if (!snapshot || !vad)
    return (
      <main className="settings-app grid min-h-screen place-content-center gap-4 p-6">
        {loadingError ? (
          <section className="w-full max-w-xl space-y-4 rounded-2xl border border-white/10 bg-[#1d1f25] p-6">
            <p role="alert" className="font-bold">
              ยังเปิด WANGAI ไม่สำเร็จ
            </p>
            <p className="text-sm text-[#a9afb8]">
              ลองโหลดข้อมูลอีกครั้งได้ โดยไม่ต้องปิดโปรแกรมหรือลบการตั้งค่า
            </p>
            <button
              autoFocus
              className={primary}
              onClick={() => void refresh()}
            >
              <RefreshCw />
              ลองใหม่
            </button>
            <details className="text-sm text-[#a9afb8]">
              <summary>รายละเอียดข้อผิดพลาด</summary>
              <p className="mt-2 break-words">{loadingError}</p>
            </details>
          </section>
        ) : (
          <>
            <LoaderCircle aria-hidden="true" className="animate-spin" />
            <p role="status">กำลังเปิด WANGAI</p>
          </>
        )}
      </main>
    );
  const { settings, runtime } = snapshot;
  const profileKey =
    settings.captureMode === "process_tree" ? "processTree" : "systemOutput";
  const profile = vad[profileKey];
  const notice = toast;
  const notification = notice && (
    <div
      role={notice.kind === "error" ? "alert" : "status"}
      className={`settings-notification rounded-xl border px-4 py-3 text-sm ${notice.kind === "error" ? "border-red-400/30 bg-red-400/10 text-red-200" : "border-[#63c48b]/30 bg-[#63c48b]/10 text-[#8bf0b1]"}`}
    >
      {notice.text}
    </div>
  );

  return (
    <section className="settings-advanced">
      {notification}
      {isDesktop() && (
        <button
          className={`${button} mb-4`}
          title={webInfo?.origin}
          onClick={() =>
            void run("web", api.openWebCompanion, "เปิด Web Companion แล้ว")
          }
        >
          <Globe2 />
          เปิด Web Companion
        </button>
      )}
      {activeTab === "advanced" && (
        <>
          <nav
            aria-label="การตั้งค่าขั้นสูง"
            className="mb-5 flex flex-wrap gap-2 rounded-2xl border border-white/10 bg-[#1d1f25] p-2"
          >
            <a
              aria-current={advancedSection === "audio" ? "page" : undefined}
              className={button}
              href={advancedHref("audio")}
            >
              <AudioLines />
              Audio
            </a>
            <a
              aria-current={advancedSection === "ai" ? "page" : undefined}
              className={button}
              href={advancedHref("ai")}
            >
              <Cloud />
              AI & Terms
            </a>
            <a
              aria-current={advancedSection === "controls" ? "page" : undefined}
              className={button}
              href={advancedHref("controls")}
            >
              <SlidersHorizontal />
              Controls & Overlay
            </a>
            <a className={`${button} ml-auto`} href={settingsHref("overview")}>
              กลับหน้าหลัก
            </a>
          </nav>
          {advancedSection === "audio" && (
            <section className="space-y-4">
              <Card
                title="Incoming audio diagnostics"
                icon={<Volume2 />}
                subtitle="มี capture, ring, cursor, VAD และ AI queue เพียงชุดเดียว"
              >
                <div className="grid gap-3 md:grid-cols-2">
                  <Info
                    label="แอปที่เลือก"
                    value={
                      settings.listeningSource?.displayName ?? "ยังไม่ได้เลือก"
                    }
                  />
                  <Info label="สถานะ" value={runtime.statusMessage} />
                  <Info
                    label="PID ที่จับจริง"
                    value={runtime.effectiveCapturePid?.toString() ?? "—"}
                  />
                  <Info
                    label="Peak"
                    value={
                      runtime.audioPeakDbfs == null
                        ? "ยังไม่มี audio frame"
                        : `${runtime.audioPeakDbfs.toFixed(1)} dBFS`
                    }
                  />
                  <Info
                    label="VAD"
                    value={
                      runtime.vadActive ? "กำลังตรวจพบคำพูด" : "ยังไม่พบคำพูด"
                    }
                  />
                  <Info
                    label="Source badge"
                    value={
                      settings.captureMode === "system_output"
                        ? "MIXED"
                        : (settings.listeningSource?.displayName?.toUpperCase() ??
                          "INCOMING")
                    }
                  />
                </div>
                {runtime.captureWarning && (
                  <p className="mt-3 rounded-xl border border-amber-400/30 bg-amber-400/10 p-3 text-sm text-amber-100">
                    <TriangleAlert className="mr-2 inline size-4" />
                    {runtime.captureWarning}
                  </p>
                )}
                <div className="mt-4 flex flex-wrap gap-2">
                  <button className={button} onClick={() => setPicker(true)}>
                    เปลี่ยนแอป
                  </button>
                  <button
                    className={button}
                    disabled={busy === "probe"}
                    onClick={() =>
                      void run(
                        "probe",
                        api.probeRecentAudio,
                        "ส่งเสียง 6 วินาทีล่าสุดไปตรวจแล้ว",
                      )
                    }
                  >
                    ตรวจเสียง 6 วินาที
                  </button>
                  <button
                    className={button}
                    onClick={() =>
                      void run(
                        "worker",
                        api.restartWorker,
                        "Restart worker แล้ว",
                      )
                    }
                  >
                    <RefreshCw />
                    Restart worker
                  </button>
                </div>
              </Card>
              <Card
                title="Capture mode"
                icon={<Cpu />}
                subtitle="Process Tree จับเฉพาะแอป; System Output เป็น fallback และแสดง MIXED"
              >
                <div className="grid gap-3 md:grid-cols-2">
                  <button
                    className={
                      settings.captureMode === "process_tree" ? primary : button
                    }
                    onClick={() =>
                      void run(
                        "mode",
                        () => api.updateCaptureMode("process_tree"),
                        "ใช้ Process Tree แล้ว",
                      )
                    }
                  >
                    Process Tree
                  </button>
                  <button
                    className={
                      settings.captureMode === "system_output"
                        ? primary
                        : button
                    }
                    onClick={() =>
                      void run(
                        "mode",
                        () => api.updateCaptureMode("system_output"),
                        "ใช้ System Output แล้ว",
                      )
                    }
                  >
                    System Output fallback
                  </button>
                </div>
                {settings.captureMode === "system_output" && (
                  <label className="mt-4 block text-sm">
                    Output endpoint
                    <select
                      className={`${input} mt-2`}
                      value={settings.outputDeviceId ?? ""}
                      onChange={(event) =>
                        void run(
                          "device",
                          () =>
                            api.updateOutputDevice(
                              event.target.value || undefined,
                            ),
                          "เปลี่ยน output endpoint แล้ว",
                        )
                      }
                    >
                      <option value="">Windows default</option>
                      {devices.map((device) => (
                        <option key={device.id} value={device.id}>
                          {device.name}
                          {device.isDefault ? " (default)" : ""}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                <label className="mt-4 flex items-center gap-3 text-sm">
                  <input
                    checked={settings.rescueScanEnabled}
                    type="checkbox"
                    onChange={(event) =>
                      void run(
                        "rescue",
                        () => api.updateRescueScan(event.target.checked),
                        event.target.checked
                          ? "เปิด Rescue Scan แล้ว"
                          : "ปิด Rescue Scan แล้ว",
                      )
                    }
                  />
                  Rescue Scan (ปิดเป็นค่าเริ่มต้น)
                </label>
              </Card>
              <Card
                title="Local Silero VAD"
                icon={<Cpu />}
                subtitle={`โปรไฟล์ ${settings.captureMode === "process_tree" ? "Process Tree" : "System Output"} จำค่าแยกกัน`}
              >
                <div className="grid gap-5 md:grid-cols-2">
                  <Slider
                    inputClassName="mt-3 w-full accent-[#63c48b]"
                    label="VAD threshold"
                    min={0.05}
                    max={0.9}
                    step={0.05}
                    value={profile.vadThreshold}
                    display={profile.vadThreshold.toFixed(2)}
                    onChange={(value) =>
                      setVad({
                        ...vad,
                        [profileKey]: { ...profile, vadThreshold: value },
                      })
                    }
                  />
                  <Slider
                    inputClassName="mt-3 w-full accent-[#63c48b]"
                    label="VAD gain"
                    min={0}
                    max={18}
                    step={1}
                    value={profile.gainDb}
                    display={`+${profile.gainDb} dB`}
                    onChange={(value) =>
                      setVad({
                        ...vad,
                        [profileKey]: { ...profile, gainDb: value },
                      })
                    }
                  />
                  <Slider
                    inputClassName="mt-3 w-full accent-[#63c48b]"
                    label="จบเมื่อเงียบ"
                    min={200}
                    max={1500}
                    step={100}
                    value={vad.silenceMs}
                    display={`${vad.silenceMs} ms`}
                    onChange={(value) => setVad({ ...vad, silenceMs: value })}
                  />
                  <Slider
                    inputClassName="mt-3 w-full accent-[#63c48b]"
                    label="Pre-roll"
                    min={0}
                    max={1000}
                    step={50}
                    value={vad.preRollMs}
                    display={`${vad.preRollMs} ms`}
                    onChange={(value) => setVad({ ...vad, preRollMs: value })}
                  />
                </div>
                <button
                  className={`${primary} mt-5`}
                  onClick={() =>
                    void run("vad", () => api.updateVad(vad), "บันทึก VAD แล้ว")
                  }
                >
                  <Save />
                  บันทึกและ Restart
                </button>
              </Card>
            </section>
          )}
          {advancedSection === "ai" && (
            <section className="space-y-4">
              <Card
                title="บริการ AI"
                icon={<Cloud />}
                subtitle="ใช้บริการกลาง ไม่ต้องใส่ API key หรือเลือกโมเดลเอง"
              >
                <p
                  role="status"
                  aria-label="สถานะบริการ AI"
                  className="mb-4 text-sm text-[#76dda0]"
                >
                  {runtime.aiService.message}
                </p>
                <div className="grid gap-3 md:grid-cols-3">
                  <Info
                    label="Incoming STT"
                    value={runtime.aiService.incomingModel || "รอเชื่อมต่อ"}
                  />
                  <Info
                    label="F9 microphone STT"
                    value={runtime.aiService.microphoneModel || "รอเชื่อมต่อ"}
                  />
                  <Info
                    label="Translation"
                    value={runtime.aiService.translationModel || "รอเชื่อมต่อ"}
                  />
                </div>
                <p className="mt-4 text-sm text-[#aaaeba]">
                  โมเดลและ credentials กำหนดโดยผู้ดูแลเซิร์ฟเวอร์
                </p>
              </Card>
              <Card
                title="คำศัพท์เกม"
                icon={<Languages />}
                subtitle="ใช้เฉพาะ prompt แปลภาษา ไม่ส่งเป็น Whisper prompt"
              >
                {glossary.map((term, index) => (
                  <div className="mb-2 flex gap-2" key={index}>
                    <input
                      className={input}
                      value={term.source}
                      onChange={(e) =>
                        setGlossary(
                          glossary.map((v, i) =>
                            i === index ? { ...v, source: e.target.value } : v,
                          ),
                        )
                      }
                    />
                    <input
                      className={input}
                      value={term.target}
                      onChange={(e) =>
                        setGlossary(
                          glossary.map((v, i) =>
                            i === index ? { ...v, target: e.target.value } : v,
                          ),
                        )
                      }
                    />
                    <button
                      className={button}
                      onClick={() =>
                        setGlossary(glossary.filter((_, i) => i !== index))
                      }
                    >
                      <Trash2 />
                    </button>
                  </div>
                ))}
                <div className="flex gap-2">
                  <button
                    className={button}
                    onClick={() =>
                      setGlossary([...glossary, { source: "", target: "" }])
                    }
                  >
                    <Plus />
                    เพิ่มคำ
                  </button>
                  <button
                    className={primary}
                    onClick={() =>
                      void run(
                        "glossary",
                        () => api.updateGlossary(glossary),
                        "บันทึกคำศัพท์แล้ว",
                      )
                    }
                  >
                    บันทึก
                  </button>
                </div>
              </Card>
            </section>
          )}
        </>
      )}
      {picker && (
        <ProcessPickerDialog
          apps={runningApps.apps}
          loading={runningApps.loading}
          error={runningApps.error}
          previewMode={isPreviewMode()}
          selected={settings.listeningSource}
          onClose={() => setPicker(false)}
          onRefresh={runningApps.refresh}
          onSelect={async (source) => {
            await api.selectListeningSource(source);
            await refresh();
            setToast({ kind: "ok", text: `เลือก ${source.displayName} แล้ว` });
            setPicker(false);
          }}
        />
      )}
    </section>
  );
}

function Card({
  title,
  subtitle,
  icon,
  children,
}: {
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="settings-card p-5">
      <header className="mb-5 flex gap-3">
        <span className="settings-card-icon grid size-10 place-items-center rounded-lg">
          {icon}
        </span>
        <div>
          <h2 className="font-bold text-white">{title}</h2>
          <p className="text-xs text-[#9296a1]">{subtitle}</p>
        </div>
      </header>
      {children}
    </section>
  );
}
function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-xl border border-white/8 bg-black/10 p-3">
      <small className="text-[#898d98]">{label}</small>
      <p className="mt-1 break-all text-sm font-semibold text-white">{value}</p>
    </div>
  );
}
