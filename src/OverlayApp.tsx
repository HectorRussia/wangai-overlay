import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { AudioLines, Check, Clipboard, GripHorizontal, Headphones, Mic, Radio, TriangleAlert } from "lucide-react";
import { api } from "./api";
import { overlayPresentation, visibleOverlayItems, type OverlayPresentation } from "./overlayPresentation";
import { isPreviewMode } from "./preview";
import { useSnapshot } from "./useSnapshot";

export function OverlayApp() {
  const { snapshot } = useSnapshot();
  const [clock, setClock] = useState(Date.now());
  const [copied, setCopied] = useState(false);
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
        hasPartial: Boolean(snapshot.partial) || snapshot.runtime.groqStatus === "กำลังฟัง…",
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
  const listening = runtime.listening && Boolean(runtime.attachedProcess);
  const hearingGameSpeech = runtime.groqStatus === "กำลังฟัง…" && !runtime.microphoneActive;
  const warning = Boolean(runtime.lastError) || runtime.budgetExhausted || (runtime.listening && !runtime.attachedProcess);
  const status = runtime.microphoneActive
    ? "กำลังฟังภาษาไทย"
    : runtime.attachedProcess
      ? `กำลังฟัง ${runtime.attachedProcess.displayName}`
      : runtime.statusMessage;

  const copy = async () => {
    const ok = await api.copyLatestReply();
    if (!ok) return;
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };

  if (presentation === "collapsed") {
    return (
      <main className="overlay-capsule" style={style} aria-live="polite">
        <span className={`overlay-signal ${warning ? "is-warning" : listening ? "is-active" : ""}`}>
          {warning ? <TriangleAlert /> : listening ? <Radio /> : <Headphones />}
        </span>
        <div className="min-w-0 flex-1">
          <strong className="block truncate text-[12px] font-bold text-[#f2f3f6]">{warning ? "WANGAI ต้องการตรวจสอบ" : listening ? "กำลังฟังเสียงในเกม" : "WANGAI พร้อมแล้ว"}</strong>
          <span className="block truncate text-[9px] text-[#858894]">{warning ? runtime.lastError ?? status : status}</span>
        </div>
        <span className="overlay-key"><Mic />{settings.hotkeys.pushToTalk}</span>
      </main>
    );
  }

  return (
    <main className={`overlay-card ${runtime.overlayEditMode ? "is-editing" : ""}`} style={style}>
      <header className="flex min-h-8 items-center justify-between gap-3 px-1">
        <div className="flex min-w-0 items-center gap-2">
          <span className={`overlay-dot ${warning ? "is-warning" : listening || runtime.microphoneActive ? "is-active" : ""}`} />
          <span className="truncate text-[9px] font-bold tracking-[0.08em] text-[#858894]">{status}</span>
        </div>
        {runtime.overlayEditMode ? (
          <button className="overlay-drag" onMouseDown={() => void api.startOverlayDrag()}><GripHorizontal />ลาก · F7 เพื่อล็อก</button>
        ) : (
          <span className="overlay-key"><Mic />Hold {settings.hotkeys.pushToTalk}</span>
        )}
      </header>

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

function sourceBadge(stream: "game" | "voice_chat" | "microphone", displayName?: string): string {
  if (displayName?.toUpperCase() === "MIXED") return "MIXED";
  if (stream === "voice_chat") return displayName || "VOICE CHAT";
  return "GAME";
}
