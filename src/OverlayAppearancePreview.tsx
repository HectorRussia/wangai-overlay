import type { CSSProperties } from "react";
import type { OverlaySettings } from "./types";

const examples = [
  { side: "incoming", translated: "ทางซ้ายปลอดภัย", original: "Left side is clear." },
  { side: "outgoing", translated: "Got it.", original: "รับทราบ" },
  { side: "incoming", translated: "เจอกันที่ประตูเหนือ", original: "Meet me at the north gate." },
  { side: "incoming", translated: "รอที่ฐาน", original: "Wait at base." },
  { side: "outgoing", translated: "On my way.", original: "กำลังไป" },
] as const;

export function OverlayAppearancePreview({ settings }: { settings: OverlaySettings }) {
  const style = {
    "--overlay-opacity": settings.opacity,
    "--overlay-bubble-opacity": settings.bubbleOpacity,
    "--overlay-text-opacity": settings.textOpacity,
    "--overlay-scale": settings.fontScale,
    "--overlay-incoming-translation-scale": settings.incomingTranslationScale,
    "--overlay-incoming-original-scale": settings.incomingOriginalScale,
    "--overlay-outgoing-translation-scale": settings.outgoingTranslationScale,
    "--overlay-outgoing-original-scale": settings.outgoingOriginalScale,
  } as CSSProperties;

  return <div className="settings-appearance-preview" aria-label="ตัวอย่าง Overlay ข้อความจากแอปและคำตอบของเรา">
    <span className="settings-appearance-preview-label">ตัวอย่าง</span>
    <div className="settings-appearance-stage">
      <div className="overlay-card settings-appearance-overlay" style={style}>
        <div className="settings-appearance-title"><span className="overlay-w-sensor" aria-hidden="true"><svg viewBox="0 0 30 20"><path d="M2 3 L8 17 L15 5 L22 17 L28 3" /></svg></span><span>กำลังฟังแอป</span></div>
        <div className="settings-appearance-messages" aria-label={`แสดง ${settings.maxItems} ข้อความล่าสุด`}>
          {examples.slice(-settings.maxItems).map((example) => <div className={`overlay-bubble is-${example.side}`} key={example.translated}>
            {example.side === "incoming" && <small className="overlay-source-badge">เสียงจากแอป</small>}
            <strong>{example.translated}</strong><span>{example.original}</span>
          </div>)}
        </div>
      </div>
    </div>
  </div>;
}
