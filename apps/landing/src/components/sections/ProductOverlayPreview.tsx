import {
  Check,
  Clipboard,
  GripHorizontal,
  LockKeyhole,
  Mic,
  Settings,
} from "lucide-react";
import "./ProductOverlayPreview.css";

// Presentation mirrors src/OverlayApp.tsx. No desktop APIs run on the website.
export function ProductOverlayPreview({
  step,
  copied,
  onCopy,
}: {
  step: number;
  copied: boolean;
  onCopy: () => void;
}) {
  const editing = step === 5;
  return (
    <div
      className="product-overlay-preview"
      aria-label="ตัวอย่างหน้าตา overlay จากโปรแกรม WANGAI"
    >
      <div className={`overlay-card ${editing ? "is-editing" : ""}`}>
        <div className="product-titlebar">
          <div className="product-status">
            <span className="overlay-w-sensor" aria-hidden="true">
              <svg viewBox="0 0 30 20">
                <path d="M2 3 L8 17 L15 5 L22 17 L28 3" />
              </svg>
            </span>
            <span>{step === 3 ? "กำลังฟังภาษาไทย" : "กำลังฟัง Game"}</span>
          </div>
          <div className="overlay-header-actions" aria-hidden="true">
            <span className="overlay-key">
              <Mic />
            </span>
            {editing && (
              <>
                <span className="overlay-drag-handle">
                  <GripHorizontal />
                </span>
                <span className="overlay-lock-button">
                  <LockKeyhole />
                </span>
              </>
            )}
            <span className="overlay-settings-button">
              <Settings />
            </span>
          </div>
        </div>
        <div
          className={`overlay-messages product-messages ${editing ? "is-readable" : ""}`}
        >
          {step >= 1 && (
            <article
              className="overlay-bubble is-incoming"
              key={step === 1 ? "pending" : "translated"}
            >
              <small className="overlay-source-badge">GAME</small>
              <strong lang="th">
                {step === 1
                  ? "กำลังแปล…"
                  : "อยู่ด้วยกันไว้ เดี๋ยวฉันคุ้มกันให้"}
              </strong>
              <span lang="en">Stay together. I’ll cover you.</span>
            </article>
          )}
          {step >= 4 && (
            <article className="overlay-bubble is-outgoing">
              <strong lang="en">Okay, I’ll follow you.</strong>
              <span lang="th">โอเค ฉันจะตามไป</span>
              {editing && (
                <button
                  className="overlay-copy"
                  onClick={onCopy}
                  aria-label={copied ? "คัดลอกแล้ว" : "คัดลอกตัวอย่าง"}
                >
                  {copied ? <Check /> : <Clipboard />}
                </button>
              )}
            </article>
          )}
        </div>
      </div>
    </div>
  );
}
