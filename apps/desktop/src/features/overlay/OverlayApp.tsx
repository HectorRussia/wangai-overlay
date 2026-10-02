import {
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type MouseEvent,
} from "react";
import {
  AudioLines,
  Check,
  Clipboard,
  GripHorizontal,
  LockKeyhole,
  Mic,
  Settings,
  TriangleAlert,
} from "lucide-react";
import { api } from "../../api";
import { audioLevel } from "../../shared/ui/AudioWaveform";
import { visibleOverlayItems } from "./overlayItems";
import { isPreviewMode } from "../../preview";
import { useSnapshot } from "../../state/useSnapshot";

export function OverlayApp() {
  const { snapshot } = useSnapshot();
  const [clock, setClock] = useState(Date.now());
  const [copied, setCopied] = useState(false);
  const [settingsError, setSettingsError] = useState<string>();

  useEffect(() => {
    const timer = window.setInterval(() => setClock(Date.now()), 500);
    return () => window.clearInterval(timer);
  }, []);

  const visible = useMemo(() => {
    if (!snapshot) return [];
    return visibleOverlayItems(
      snapshot.history,
      snapshot.settings.overlay.maxItems,
      snapshot.settings.overlay.fadeSeconds,
      clock,
    );
  }, [clock, snapshot]);

  if (!snapshot) return null;

  const { settings, runtime, partial } = snapshot;
  const style = {
    "--overlay-opacity": settings.overlay.opacity,
    "--overlay-bubble-opacity": settings.overlay.bubbleOpacity,
    "--overlay-text-opacity": settings.overlay.textOpacity,
    "--overlay-scale": settings.overlay.fontScale,
    "--overlay-incoming-translation-scale":
      settings.overlay.incomingTranslationScale,
    "--overlay-incoming-original-scale": settings.overlay.incomingOriginalScale,
    "--overlay-outgoing-translation-scale":
      settings.overlay.outgoingTranslationScale,
    "--overlay-outgoing-original-scale": settings.overlay.outgoingOriginalScale,
  } as CSSProperties;
  const listening = runtime.listening && Boolean(runtime.attachedSource);
  const serviceProblem =
    runtime.aiService.state === "offline" ||
    runtime.aiService.state === "degraded";
  const operationalError =
    runtime.lastError === runtime.captureWarning
      ? undefined
      : runtime.lastError;
  const warningMessage =
    operationalError ??
    (serviceProblem
      ? runtime.aiService.message || "บริการแปลเชื่อมต่อไม่ได้"
      : undefined);
  const recentAudio =
    runtime.audioLastSeenAtMs != null &&
    clock - runtime.audioLastSeenAtMs < 1500;
  const inputLevel =
    listening && recentAudio
      ? audioLevel(runtime.audioRmsDbfs, runtime.audioPeakDbfs)
      : 0;
  const longSubtitle = visible.some(
    (item) =>
      (item.translatedText?.length ?? 0) > 90 || item.originalText.length > 120,
  );
  const shown =
    !runtime.overlayEditMode && longSubtitle ? visible.slice(-1) : visible;
  const status = operationalError
    ? "WANGAI ต้องตรวจสอบ"
    : serviceProblem
      ? runtime.aiService.state === "offline"
        ? "บริการแปลเชื่อมต่อไม่ได้"
        : "บริการแปลมีปัญหา"
      : runtime.captureWarning
        ? (settings.listeningSource?.displayName ?? "WANGAI")
        : runtime.microphoneActive
          ? "กำลังฟังภาษาไทย"
          : listening
            ? `กำลังฟัง ${runtime.attachedSource!.displayName}`
            : runtime.listening
              ? (settings.listeningSource?.displayName ?? "WANGAI")
              : runtime.statusMessage;

  const copy = async () => {
    setSettingsError(undefined);
    try {
      const ok = await api.copyLatestReply();
      if (!ok) return;
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setSettingsError("คัดลอกคำตอบไม่สำเร็จ กรุณาลองอีกครั้ง");
    }
  };

  const openSettings = async () => {
    setSettingsError(undefined);
    try {
      await api.openSettingsWindow();
    } catch {
      setSettingsError("เปิดหน้าตั้งค่าไม่สำเร็จ กรุณาลองอีกครั้ง");
    }
  };

  const lockOverlay = async () => {
    setSettingsError(undefined);
    try {
      await api.setOverlayEditMode(false);
    } catch {
      setSettingsError("ล็อกตำแหน่ง Overlay ไม่สำเร็จ กรุณาลองอีกครั้ง");
    }
  };

  const startDrag = (event: MouseEvent<HTMLElement>) => {
    if (event.button !== 0 || !runtime.overlayEditMode || isPreviewMode())
      return;
    event.preventDefault();
    void api
      .startOverlayDrag()
      .catch(() =>
        setSettingsError("ย้ายหน้าต่างไม่สำเร็จ กรุณาลองลากอีกครั้ง"),
      );
  };

  const settingsButton = (enabled: boolean) => (
    <button
      className="overlay-settings-button"
      aria-label="เปิดหน้าตั้งค่า WANGAI"
      title={
        enabled
          ? "เปิดหน้าตั้งค่า WANGAI"
          : `กด ${settings.hotkeys.editOverlay} เพื่อคลิกตั้งค่า`
      }
      disabled={!enabled}
      onClick={() => void openSettings()}
    >
      <Settings />
      {!enabled && <small>{settings.hotkeys.editOverlay}</small>}
    </button>
  );

  return (
    <main
      className={`overlay-card ${runtime.overlayEditMode ? "is-editing" : ""}`}
      style={style}
    >
      <header
        className={`overlay-titlebar flex min-h-8 items-center justify-between gap-3 px-1 ${runtime.overlayEditMode ? "is-draggable" : ""}`}
        title={
          runtime.overlayEditMode
            ? "ลากแถบนี้เพื่อย้าย Overlay"
            : `กด ${settings.hotkeys.editOverlay} เพื่ออ่านเต็มหรือย้าย Overlay`
        }
        onMouseDown={(event) => {
          if ((event.target as Element).closest("button, a, input, select"))
            return;
          startDrag(event);
        }}
      >
        <div className="flex min-w-0 items-center gap-2">
          <span
            className="overlay-w-sensor"
            role="meter"
            aria-label="ระดับเสียงจากแอป"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(inputLevel * 100)}
            title={`ระดับเสียงจากแอป ${Math.round(inputLevel * 100)}%`}
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 30 20"
              style={{
                opacity: 0.3 + inputLevel * 0.7,
                transform: `scale(${1 + inputLevel * 0.08})`,
              }}
            >
              <path d="M2 3 L8 17 L15 5 L22 17 L28 3" />
            </svg>
          </span>
          <span className="truncate text-[11px] font-bold text-[#c6d3d6]">
            {status}
          </span>
        </div>
        <div className="overlay-header-actions">
          <span
            className="overlay-key"
            title={`กด ${settings.hotkeys.pushToTalk} ค้างเพื่อพูด`}
          >
            <Mic />
            {settings.hotkeys.pushToTalk}
          </span>
          {runtime.overlayEditMode ? (
            <>
              <span className="overlay-drag-handle" aria-hidden="true">
                <GripHorizontal />
              </span>
              <button
                className="overlay-lock-button"
                aria-label="ล็อกตำแหน่ง Overlay"
                title="ล็อกตำแหน่ง Overlay"
                onClick={() => void lockOverlay()}
              >
                <LockKeyhole />
              </button>
            </>
          ) : null}
          {settingsButton(runtime.overlayEditMode)}
        </div>
      </header>
      {settingsError && (
        <p role="alert" className="text-xs text-red-200">
          {settingsError}
        </p>
      )}
      {warningMessage && (
        <p role="alert" className="overlay-warning">
          <TriangleAlert aria-hidden="true" />
          {warningMessage}
        </p>
      )}

      <section
        className={`overlay-messages wangai-scrollbar flex min-h-0 flex-1 flex-col gap-1.5 py-1 ${runtime.overlayEditMode ? "is-readable" : "justify-end overflow-hidden"}`}
        aria-live="polite"
      >
        {shown.map((item) => {
          const outgoing = item.stream === "microphone";
          const primary =
            item.translatedText ??
            (item.status === "pending" ? "กำลังแปล…" : "แปลไม่สำเร็จ");
          return (
            <article
              className={`overlay-bubble ${outgoing ? "is-outgoing" : "is-incoming"}`}
              key={item.segmentId}
            >
              {!outgoing && (
                <small className="overlay-source-badge">
                  {sourceBadge(item.stream, item.sourceDisplayName)}
                </small>
              )}
              <strong lang={outgoing ? "en" : "th"}>{primary}</strong>
              <span lang={outgoing ? "th" : "en"}>{item.originalText}</span>
              {outgoing && item.translatedText && runtime.overlayEditMode && (
                <button
                  className="overlay-copy"
                  type="button"
                  aria-label="คัดลอกคำตอบล่าสุด"
                  title="คัดลอกคำตอบล่าสุด"
                  onClick={() => void copy()}
                >
                  {copied ? (
                    <Check aria-hidden="true" />
                  ) : (
                    <Clipboard aria-hidden="true" />
                  )}
                </button>
              )}
            </article>
          );
        })}

        {partial && (
          <article className="overlay-live">
            <span>
              <i />
              LIVE
            </span>
            <strong lang="en">{partial.text}</strong>
          </article>
        )}

        {visible.length === 0 && !partial && runtime.microphoneActive && (
          <div className="overlay-listening">
            <Mic />
            <strong>กำลังฟังภาษาไทย…</strong>
            <span>ปล่อย {settings.hotkeys.pushToTalk} เพื่อแปลเป็นอังกฤษ</span>
          </div>
        )}

        {visible.length === 0 && !partial && runtime.overlayEditMode && (
          <div className="overlay-empty">
            <AudioLines />
            <strong>ยังไม่มีคำแปล</strong>
          </div>
        )}
      </section>
    </main>
  );
}

function sourceBadge(
  stream: "incoming" | "microphone",
  displayName?: string,
): string {
  if (displayName?.toUpperCase() === "MIXED") return "MIXED";
  if (stream === "microphone") return "F9 REPLY";
  return displayName || "INCOMING";
}
