import { button, primary, input } from "./styles";
import { HotkeySettingsCard } from "./HotkeySettingsCard";
import { OverlaySettingsCard } from "./OverlaySettingsCard";
import { HistoryView } from "./HistoryView";
import { useCommandTask } from "../../shared/useCommandTask";
import { useHotkeyRecorder } from "./useHotkeyRecorder";
import { useCallback, useEffect, useState } from "react";
import appIcon from "../../../app-icon.png";
import {
  History,
  LoaderCircle,
  RefreshCw,
  Settings2,
  TriangleAlert,
  Volume2,
} from "lucide-react";
import { api } from "../../api";
import { ProcessPickerDialog } from "../sources/ProcessPickerDialog";
import { MicrophonePickerDialog } from "../sources/MicrophonePickerDialog";
import { AdvancedSettings } from "./AdvancedSettings";
import { ReadyRoom } from "./ReadyRoom";
import { UpdatePanel } from "../updates/UpdatePanel";
import { type AdvancedSection, type SettingsTab } from "../../router";
import {
  isPreviewMode,
  previewOutputDevices,
  previewMicrophoneDevices,
} from "../../preview";
import { useRunningApps } from "../sources/useRunningApps";
import type {
  AudioOutputDevice,
  HotkeySettings,
  OverlaySettings,
} from "../../types";
import { errorText, useSnapshot } from "../../state/useSnapshot";

const isDesktop = () => "__TAURI_INTERNALS__" in window;
const isWeb = () => !isDesktop() && !isPreviewMode();

export function SettingsApp({
  activeTab,
  advancedSection,
}: {
  activeTab: SettingsTab;
  advancedSection?: AdvancedSection;
}) {
  const { snapshot, refresh, loadingError } = useSnapshot();
  const [devices, setDevices] = useState<AudioOutputDevice[]>([]);
  const [microphoneName, setMicrophoneName] = useState<string | null>();
  const [microphoneError, setMicrophoneError] = useState(false);
  const [microphones, setMicrophones] = useState<AudioOutputDevice[]>([]);
  const [microphoneLoading, setMicrophoneLoading] = useState(false);
  const [microphonePicker, setMicrophonePicker] = useState(false);
  const [picker, setPicker] = useState(false);
  const runningApps = useRunningApps(picker);
  const { busy, toast, setToast, run } = useCommandTask(refresh, 3500);
  const [hotkeys, setHotkeys] = useState<HotkeySettings>();
  const { recordingHotkey, hotkeyError, beginHotkeyCapture } =
    useHotkeyRecorder(hotkeys, setHotkeys, (text) =>
      setToast({ kind: "error", text }),
    );
  const [advancedOpen, setAdvancedOpen] = useState(
    Boolean(advancedSection && advancedSection !== "controls"),
  );
  useEffect(() => {
    setAdvancedOpen(Boolean(advancedSection && advancedSection !== "controls"));
  }, [advancedSection]);
  const [overlay, setOverlay] = useState<OverlaySettings>();

  useEffect(() => {
    if (!snapshot) return;
    setHotkeys(snapshot.settings.hotkeys);
    setOverlay(snapshot.settings.overlay);
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
    if (snapshot?.settings.captureMode === "system_output") void loadDevices();
  }, [loadDevices, snapshot?.settings.captureMode]);
  const loadMicrophone = useCallback(async () => {
    setMicrophoneError(false);
    setMicrophoneLoading(true);
    try {
      const found = isPreviewMode()
        ? previewMicrophoneDevices
        : await api.listMicrophoneDevices();
      setMicrophones(found);
      const selectedId = snapshot?.settings.microphoneDeviceId;
      setMicrophoneName(
        selectedId
          ? (found.find((device) => device.id === selectedId)?.name ?? null)
          : (found.find((device) => device.isDefault)?.name ?? null),
      );
    } catch {
      setMicrophoneError(true);
    } finally {
      setMicrophoneLoading(false);
    }
  }, [snapshot?.settings.microphoneDeviceId]);
  useEffect(() => {
    void loadMicrophone();
    const refreshOnFocus = () => {
      void loadMicrophone();
    };
    window.addEventListener("focus", refreshOnFocus);
    return () => window.removeEventListener("focus", refreshOnFocus);
  }, [loadMicrophone]);

  if (!snapshot || !hotkeys || !overlay)
    return (
      <main className="settings-app grid min-h-screen place-content-center gap-4 p-6">
        {loadingError ? (
          <section className="w-full max-w-xl space-y-4 rounded-2xl border p-6">
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
  const showAudioRecovery =
    settings.captureMode === "system_output" ||
    Boolean(runtime.captureWarning) ||
    !runtime.workerReady;
  const notice = runtime.lastError
    ? { kind: "error", text: runtime.lastError }
    : toast;
  const notification = notice && (
    <div
      role={notice.kind === "error" ? "alert" : "status"}
      className={`settings-notification rounded-xl border px-4 py-3 text-sm ${notice.kind === "error" ? "border-red-400/30 bg-red-400/10 text-red-200" : "border-[#63c48b]/30 bg-[#63c48b]/10 text-[#8bf0b1]"}`}
    >
      {notice.text}
    </div>
  );

  const showView = (kind: "history" | "settings") => {
    window.location.hash =
      kind === "history" ? "#/settings/history" : "#/settings/advanced";
    if (kind === "settings" && isDesktop())
      void api
        .openSettingsWindow()
        .catch((error) => setToast({ kind: "error", text: errorText(error) }));
  };
  const utility = activeTab !== "overview";
  return (
    <main
      className={`settings-app settings-one-page ${utility ? "settings-utility" : "settings-control"}`}
    >
      {!utility && (
        <>
          <header className="settings-toolbar">
            <div className="settings-top-brand">
              <img
                className="settings-brand-key"
                src={appIcon}
                alt=""
                aria-hidden="true"
              />
              <span className="settings-top-wordmark">WANGAI</span>
              <span className="settings-top-slogan">ว่าไง เอไอแปลเสียงสด</span>
            </div>
            <nav
              className="settings-toolbar-actions"
              aria-label="เครื่องมือ WANGAI"
            >
              <button
                aria-label="ประวัติคำแปล"
                className="settings-top-action"
                onClick={() => showView("history")}
              >
                <History />
                ประวัติ
              </button>
              <button
                aria-label="ตั้งค่า"
                className="settings-top-action"
                onClick={() => showView("settings")}
              >
                <Settings2 />
                ตั้งค่า
              </button>
            </nav>
          </header>
          <div className="settings-workspace">
            <div className="settings-content">
              <UpdatePanel compact />
              <ReadyRoom
                notification={notification}
                settings={settings}
                runtime={runtime}
                busy={busy}
                previewMode={isPreviewMode()}
                showSecondary={false}
                showIntro={false}
                microphoneName={microphoneName}
                microphoneError={microphoneError}
                onRefreshMicrophone={() => void loadMicrophone()}
                onOpenMicrophonePicker={() => {
                  setMicrophonePicker(true);
                  void loadMicrophone();
                }}
                onToggleListening={() =>
                  void run(
                    "listen",
                    runtime.listening ? api.toggleListening : api.startSession,
                    runtime.listening ? "หยุดใช้งานแล้ว" : "เริ่มใช้งานแล้ว",
                  )
                }
                onOpenSourcePicker={() => setPicker(true)}
                onCaptureModeChange={(mode) =>
                  void run(
                    "mode",
                    () => api.updateCaptureMode(mode),
                    mode === "system_output"
                      ? "เปลี่ยนเป็นฟังเสียงทั้งเครื่องแล้ว"
                      : "กลับไปฟังเฉพาะแอปแล้ว",
                  )
                }
                webRuntime={isWeb()}
              />
            </div>
          </div>
        </>
      )}
      {utility && (
        <>
          <header className="utility-header">
            <div>
              <span className="settings-toolbar-eyebrow">WANGAI</span>
              <h1>{activeTab === "history" ? "ประวัติคำแปล" : "ตั้งค่า"}</h1>
            </div>
            <div className="utility-header-actions">
              {runtime.listening && (isDesktop() || isPreviewMode()) && (
                <button
                  className="settings-toolbar-back"
                  onClick={() => {
                    if (isPreviewMode()) {
                      window.location.hash = "#/overlay";
                      return;
                    }
                    void api
                      .startSession()
                      .catch((error) =>
                        setToast({ kind: "error", text: errorText(error) }),
                      );
                  }}
                >
                  กลับไป Overlay
                </button>
              )}
              <a className="settings-toolbar-back" href="#/settings/overview">
                กลับหน้าหลัก
              </a>
            </div>
          </header>
          <div className="utility-content">
            {notification}
            {activeTab === "history" && (
              <HistoryView history={snapshot.history} />
            )}
            {activeTab === "advanced" && (
              <div className="settings-direct-grid">
                {showAudioRecovery && (
                  <section
                    className="settings-direct-card"
                    aria-labelledby="settings-sound-title"
                  >
                    <header>
                      <Volume2 aria-hidden="true" />
                      <div>
                        <h2 id="settings-sound-title">เสียง</h2>
                        <p>ตรวจสอบการรับเสียง</p>
                      </div>
                    </header>
                    {settings.captureMode === "system_output" && (
                      <label
                        className="settings-direct-label"
                        htmlFor="output-device"
                      >
                        อุปกรณ์เสียงของ Windows
                        <select
                          className={`${input} mt-2`}
                          id="output-device"
                          value={settings.outputDeviceId ?? ""}
                          onChange={(event) =>
                            void run(
                              "device",
                              () =>
                                api.updateOutputDevice(
                                  event.target.value || undefined,
                                ),
                              "เปลี่ยนอุปกรณ์เสียงแล้ว",
                            )
                          }
                        >
                          <option value="">อุปกรณ์หลักของ Windows</option>
                          {devices.map((device) => (
                            <option key={device.id} value={device.id}>
                              {device.name}
                              {device.isDefault ? " (หลัก)" : ""}
                            </option>
                          ))}
                        </select>
                      </label>
                    )}
                    {runtime.captureWarning && (
                      <p className="settings-audio-help-warning">
                        <TriangleAlert aria-hidden="true" />
                        {runtime.captureWarning}
                      </p>
                    )}
                    {!runtime.workerReady && (
                      <button
                        className={button}
                        disabled={busy === "worker"}
                        onClick={() =>
                          void run(
                            "worker",
                            api.restartWorker,
                            "เริ่มตัวตรวจคำพูดใหม่แล้ว",
                          )
                        }
                      >
                        <RefreshCw />
                        เริ่มตัวตรวจคำพูดใหม่
                      </button>
                    )}
                  </section>
                )}
                <OverlaySettingsCard
                  overlay={overlay}
                  setOverlay={setOverlay}
                  busy={busy}
                  onSave={() =>
                    void run(
                      "overlay",
                      () => api.updateOverlay(overlay),
                      "บันทึกการแสดงผลแล้ว",
                    )
                  }
                />
                <HotkeySettingsCard
                  hotkeys={hotkeys}
                  recordingHotkey={recordingHotkey}
                  hotkeyError={hotkeyError}
                  busy={busy}
                  beginHotkeyCapture={beginHotkeyCapture}
                  onSave={() =>
                    void run(
                      "hotkeys",
                      () => api.updateHotkeys(hotkeys),
                      "บันทึกปุ่มลัดแล้ว",
                    )
                  }
                />
                <details
                  className="settings-diagnostics settings-direct-footer"
                  open={advancedOpen}
                  onToggle={(event) =>
                    setAdvancedOpen(event.currentTarget.open)
                  }
                >
                  <summary>ขั้นสูง</summary>
                  {advancedOpen && (
                    <div className="settings-tuning-content">
                      <AdvancedSettings
                        advancedSection={
                          advancedSection === "controls"
                            ? "audio"
                            : advancedSection
                        }
                      />
                    </div>
                  )}
                </details>
                <details className="settings-diagnostics settings-direct-footer">
                  <summary>ข้อมูลโปรแกรมและความเป็นส่วนตัว</summary>
                  <p className="settings-privacy-copy">
                    ส่งเฉพาะช่วงคำพูดและข้อความผ่านเซิร์ฟเวอร์ WANGAI ไปยัง AI
                    provider ไม่บันทึกเนื้อหาบนเซิร์ฟเวอร์
                    เก็บสถิติการใช้งานด้วยรหัสติดตั้งแบบสุ่ม
                  </p>
                </details>
              </div>
            )}
          </div>
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
          onClear={async () => {
            await api.clearListeningSource();
            await refresh();
            setToast({ kind: "ok", text: "ล้างการเลือกแอปแล้ว" });
            setPicker(false);
          }}
        />
      )}
      {microphonePicker && (
        <MicrophonePickerDialog
          devices={microphones}
          selectedId={settings.microphoneDeviceId}
          loading={microphoneLoading}
          error={microphoneError ? "อ่านรายการไมโครโฟนไม่ได้" : undefined}
          active={runtime.microphoneActive}
          previewMode={isPreviewMode()}
          onClose={() => setMicrophonePicker(false)}
          onRefresh={() => void loadMicrophone()}
          onSelect={async (id) => {
            await api.updateMicrophoneDevice(id);
            await refresh();
            setMicrophonePicker(false);
            setToast({ kind: "ok", text: "เปลี่ยนไมโครโฟนแล้ว" });
          }}
        />
      )}
    </main>
  );
}
