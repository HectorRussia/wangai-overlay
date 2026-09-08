import { useEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent } from "react";
import { AudioLines, Check, Clipboard, GripHorizontal, Headphones, Mic, Radio, Settings, TriangleAlert } from "lucide-react";
import { api } from "./api";
import { overlayPresentation, visibleOverlayItems, type OverlayPresentation } from "./overlayPresentation";
import { isPreviewMode } from "./preview";
import { useSnapshot } from "./useSnapshot";

export function OverlayApp() {
  const { snapshot } = useSnapshot();
  const [clock, setClock] = useState(Date.now());
  const [copied, setCopied] = useState(false);
  const [settingsError, setSettingsError] = useState<string>();
  const lastPresentation = useRef<OverlayPresentation | undefined>(undefined);

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

  const presentation = snapshot
    ? overlayPresentation({
        hasPartial: Boolean(snapshot.partial) || snapshot.runtime.aiStatus === "กำลังฟัง…",
        visibleItems: visible.length,
        microphoneActive: snapshot.runtime.microphoneActive,
        editMode: snapshot.runtime.overlayEditMode,
      })
    : "collapsed";

  useEffect(() => {
    if (!snapshot || lastPresentation.current === presentation) return;
    lastPresentation.current = presentation;
    if (!isPreviewMode()) void api.setOverlayPresentation(presentation);
  }, [presentation, snapshot]);

  useEffect(() => {
    if (!isPreviewMode()) return;
    document.body.dataset.overlayPresentation = presentation;
    return () => {
      delete document.body.dataset.overlayPresentation;
    };
  }, [presentation]);

  if (!snapshot) return null;

  const { settings, runtime, partial } = snapshot;
  const style = {
    "--overlay-opacity": settings.overlay.opacity,
    "--overlay-scale": settings.overlay.fontScale,
  } as CSSProperties;
  const listening = runtime.listening && Boolean(runtime.attachedSource);
  const setupNeeded = !settings.listeningSource;
  const hearingGameSpeech = runtime.aiStatus === "กำลังฟัง…" && !runtime.microphoneActive;
  const warning = Boolean(runtime.lastError) || ["offline", "degraded"].includes(runtime.aiService.state) || (runtime.listening && !runtime.attachedSource);
  const status = runtime.microphoneActive
    ? "กำลังฟังภาษาไทย"
    : runtime.attachedSource
      ? `กำลังฟัง ${runtime.attachedSource.displayName}`
      : runtime.statusMessage;

  const copy = async () => {
    const ok = await api.copyLatestReply();
    if (!ok) return;
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };

  const openSettings = async () => {
    setSettingsError(undefined);
    try { await api.openSettingsWindow(); }
    catch { setSettingsError("เปิดหน้าตั้งค่าไม่สำเร็จ กรุณาลองอีกครั้ง"); }
  };

  const startDrag = (event: MouseEvent<HTMLElement>) => {
    if (event.button !== 0 || !runtime.overlayEditMode || isPreviewMode()) return;
    event.preventDefault();
    void api.startOverlayDrag().catch(() => setSettingsError("ย้ายหน้าต่างไม่สำเร็จ กรุณาลองลากอีกครั้ง"));
  };

  const settingsButton = (enabled: boolean) => <button
    className="overlay-settings-button"
    aria-label="เปิดหน้าตั้งค่า WANGAI"
    title={enabled ? "เปิดหน้าตั้งค่า WANGAI" : `กด ${settings.hotkeys.editOverlay} เพื่อคลิกตั้งค่า`}
    disabled={!enabled}
    onClick={() => void openSettings()}
  ><Settings />{!enabled && <small>{settings.hotkeys.editOverlay}</small>}</button>;

  if (presentation === "collapsed") {
    return (
      <main className="overlay-capsule" style={style} aria-live="polite">
        <span className={`overlay-signal ${warning ? "is-warning" : listening ? "is-active" : ""}`}>
          {warning ? <TriangleAlert /> : listening ? <Radio /> : <Headphones />}
        </span>
        <div className="min-w-0 flex-1">
          <strong className="block truncate text-[12px] font-bold text-[#f2f3f6]">{warning ? "WANGAI ต้องการตรวจสอบ" : setupNeeded ? "ตั้งค่า WANGAI เพื่อเริ่มฟัง" : listening ? "กำลังฟังเสียงขาเข้า" : "WANGAI พร้อมแล้ว"}</strong>
          <span className="block truncate text-[9px] text-[#858894]">{settingsError ?? (warning ? runtime.lastError ?? status : setupNeeded ? "กดเฟืองเพื่อเลือกแอปและตั้งค่าการแปล" : status)}</span>
        </div>
        <span className="overlay-key"><Mic />{settings.hotkeys.pushToTalk}</span>
        {settingsButton(true)}
      </main>
    );
  }

  return (
    <main className={`overlay-card ${runtime.overlayEditMode ? "is-editing" : ""}`} style={style}>
      <header
        className={`overlay-titlebar flex min-h-8 items-center justify-between gap-3 px-1 ${runtime.overlayEditMode ? "is-draggable" : ""}`}
        title={runtime.overlayEditMode ? `ลากแถบนี้เพื่อย้าย · กด ${settings.hotkeys.editOverlay} เพื่อล็อกตำแหน่ง` : `กด ${settings.hotkeys.editOverlay} เพื่อย้ายหน้าต่าง`}
        onMouseDown={(event) => {
          if ((event.target as Element).closest("button, a, input, select")) return;
          startDrag(event);
        }}
      >
        <div className="flex min-w-0 items-center gap-2">
          <span className={`overlay-dot ${warning ? "is-warning" : listening || runtime.microphoneActive ? "is-active" : ""}`} />
          <span className="truncate text-[9px] font-bold tracking-[0.08em] text-[#858894]">{status}</span>
        </div>
        <div className="overlay-header-actions">{runtime.overlayEditMode ? (
          <button aria-label="ลากเพื่อย้าย Overlay" className="overlay-drag" onMouseDown={startDrag}><GripHorizontal />ลาก · {settings.hotkeys.editOverlay} เพื่อล็อก</button>
        ) : (
          <span className="overlay-key"><GripHorizontal />{settings.hotkeys.editOverlay} เพื่อย้าย · <Mic />{settings.hotkeys.pushToTalk}</span>
        )}{settingsButton(runtime.overlayEditMode)}</div>
      </header>
      {settingsError && <p role="alert" className="text-xs text-red-200">{settingsError}</p>}

      <section className="wangai-scrollbar flex min-h-0 flex-1 flex-col justify-end gap-1.5 overflow-hidden py-1" aria-live="polite">
        {visible.map((item) => {
          const outgoing = item.stream === "microphone";
          const primary = item.translatedText ?? (item.status === "pending" ? "กำลังแปล…" : "แปลไม่สำเร็จ");
          return (
            <article className={`overlay-bubble ${outgoing ? "is-outgoing" : "is-incoming"}`} key={item.segmentId}>
              {!outgoing && <small className="overlay-source-badge">{sourceBadge(item.stream, item.sourceDisplayName)}</small>}
              <strong lang={outgoing ? "en" : "th"}>{primary}</strong>
              <span lang={outgoing ? "th" : "en"}>{item.originalText}</span>
              {outgoing && item.translatedText && (
                runtime.overlayEditMode ? (
                  <button className="overlay-copy" onClick={() => void copy()}>{copied ? <Check /> : <Clipboard />}{copied ? "Copied" : "Copy"}</button>
                ) : (
                  <small className="overlay-copy-hint">{settings.hotkeys.copyLatest} Copy</small>
                )
              )}
            </article>
          );
        })}

        {partial && (
          <article className="overlay-live">
            <span><i />LIVE</span>
            <strong lang="en">{partial.text}</strong>
          </article>
        )}

        {visible.length === 0 && !partial && runtime.microphoneActive && (
          <div className="overlay-listening"><Mic /><strong>กำลังฟังภาษาไทย…</strong><span>ปล่อย {settings.hotkeys.pushToTalk} เพื่อแปลเป็นอังกฤษ</span></div>
        )}

        {visible.length === 0 && !partial && hearingGameSpeech && (
          <div className="overlay-listening"><AudioLines /><strong>กำลังฟังเสียงเพื่อน…</strong><span>จะแสดงข้อความเมื่อจบวลี</span></div>
        )}

        {visible.length === 0 && !partial && runtime.overlayEditMode && (
          <div className="overlay-empty"><GripHorizontal /><strong>วาง Overlay ตรงตำแหน่งที่ต้องการ</strong><span>ลากจากแถบด้านบน แล้วกด F7 เพื่อล็อก</span></div>
        )}
      </section>
    </main>
  );
}

function sourceBadge(stream: "incoming" | "microphone", displayName?: string): string {
  if (displayName?.toUpperCase() === "MIXED") return "MIXED";
  if (stream === "microphone") return "F9 REPLY";
  return displayName || "INCOMING";
}
