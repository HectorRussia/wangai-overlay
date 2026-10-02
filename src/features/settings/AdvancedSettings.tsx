import { button, primary } from "./advancedStyles";
import { AdvancedAi } from "./AdvancedAi";
import { AdvancedAudio } from "./AdvancedAudio";
import { useCommandTask } from "../../shared/useCommandTask";
import { useCallback, useEffect, useState } from "react";
import {
  AudioLines,
  Cloud,
  Globe2,
  LoaderCircle,
  RefreshCw,
  SlidersHorizontal,
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
            <AdvancedAudio
              settings={settings}
              runtime={runtime}
              vad={vad}
              setVad={setVad}
              devices={devices}
              busy={busy}
              run={run}
              onPick={() => setPicker(true)}
            />
          )}
          {advancedSection === "ai" && (
            <AdvancedAi
              runtime={runtime}
              glossary={glossary}
              setGlossary={setGlossary}
              run={run}
            />
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
