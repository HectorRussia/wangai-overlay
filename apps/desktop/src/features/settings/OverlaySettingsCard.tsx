import { Save, SlidersHorizontal } from "lucide-react";
import { Slider } from "../../shared/ui/Slider";
import { OverlayAppearancePreview } from "../overlay/OverlayAppearancePreview";
import type { OverlaySettings } from "../../types";
import { button } from "./styles";

export function OverlaySettingsCard({
  overlay,
  setOverlay,
  busy,
  onSave,
}: {
  overlay: OverlaySettings;
  setOverlay: (value: OverlaySettings) => void;
  busy?: string;
  onSave: () => void;
}) {
  const validCaptionDuration =
    Number.isInteger(overlay.fadeSeconds) &&
    overlay.fadeSeconds >= 2 &&
    overlay.fadeSeconds <= 60;
  return (
    <section
      className="settings-direct-card"
      aria-labelledby="settings-overlay-title"
    >
      <header>
        <SlidersHorizontal aria-hidden="true" />
        <div>
          <h2 id="settings-overlay-title">Overlay</h2>
          <p>ปรับแล้วดูตัวอย่างได้ทันที</p>
        </div>
      </header>
      <div className="settings-overlay-studio">
        <div className="settings-overlay-controls">
          <Slider
            label="พื้นหลังหน้าต่าง"
            min={0.2}
            max={1}
            step={0.05}
            value={overlay.opacity}
            display={`${Math.round(overlay.opacity * 100)}%`}
            onChange={(value) => setOverlay({ ...overlay, opacity: value })}
          />
          <Slider
            label="พื้นกล่องข้อความ"
            min={0.6}
            max={1}
            step={0.05}
            value={overlay.bubbleOpacity}
            display={`${Math.round(overlay.bubbleOpacity * 100)}%`}
            onChange={(value) =>
              setOverlay({ ...overlay, bubbleOpacity: value })
            }
          />
          <Slider
            label="ตัวอักษร"
            min={0.8}
            max={1}
            step={0.05}
            value={overlay.textOpacity}
            display={`${Math.round(overlay.textOpacity * 100)}%`}
            onChange={(value) => setOverlay({ ...overlay, textOpacity: value })}
          />
          <div
            className="settings-type-controls"
            aria-label="ขนาดข้อความใน Overlay"
          >
            <h3>ขนาดข้อความ</h3>
            <fieldset className="settings-type-group">
              <legend>เสียงจากแอป</legend>
              <Slider
                label="คำแปลไทย"
                min={0.8}
                max={1.6}
                step={0.05}
                value={overlay.incomingTranslationScale}
                display={`${Math.round(overlay.incomingTranslationScale * 100)}%`}
                onChange={(value) =>
                  setOverlay({
                    ...overlay,
                    incomingTranslationScale: value,
                  })
                }
              />
              <Slider
                label="ต้นฉบับอังกฤษ"
                min={0.8}
                max={1.6}
                step={0.05}
                value={overlay.incomingOriginalScale}
                display={`${Math.round(overlay.incomingOriginalScale * 100)}%`}
                onChange={(value) =>
                  setOverlay({
                    ...overlay,
                    incomingOriginalScale: value,
                  })
                }
              />
            </fieldset>
            <fieldset className="settings-type-group">
              <legend>คำตอบของเรา</legend>
              <Slider
                label="คำแปลอังกฤษ"
                min={0.8}
                max={1.6}
                step={0.05}
                value={overlay.outgoingTranslationScale}
                display={`${Math.round(overlay.outgoingTranslationScale * 100)}%`}
                onChange={(value) =>
                  setOverlay({
                    ...overlay,
                    outgoingTranslationScale: value,
                  })
                }
              />
              <Slider
                label="ต้นฉบับไทย"
                min={0.8}
                max={1.6}
                step={0.05}
                value={overlay.outgoingOriginalScale}
                display={`${Math.round(overlay.outgoingOriginalScale * 100)}%`}
                onChange={(value) =>
                  setOverlay({
                    ...overlay,
                    outgoingOriginalScale: value,
                  })
                }
              />
            </fieldset>
          </div>
          <div className="settings-overlay-secondary">
            <div className="settings-duration-field">
              <label
                className="settings-direct-label"
                htmlFor="caption-duration"
              >
                คำแปลค้างบนจอ
              </label>
              <div className="settings-duration-input">
                <input
                  id="caption-duration"
                  type="number"
                  inputMode="numeric"
                  min="2"
                  max="60"
                  step="1"
                  value={overlay.fadeSeconds}
                  onChange={(event) =>
                    setOverlay({
                      ...overlay,
                      fadeSeconds: Number(event.target.value),
                    })
                  }
                />
                <span>วินาที</span>
              </div>
              {!validCaptionDuration && (
                <p className="settings-field-error" role="alert">
                  ใส่ค่าระหว่าง 2 ถึง 60 วินาที
                </p>
              )}
            </div>
            <Slider
              label="จำนวนคำแปลที่แสดง"
              min={1}
              max={5}
              step={1}
              value={overlay.maxItems}
              display={`${overlay.maxItems} ข้อความ`}
              onChange={(value) => setOverlay({ ...overlay, maxItems: value })}
            />
          </div>
        </div>
        <OverlayAppearancePreview settings={overlay} />
      </div>
      <button
        className={button}
        disabled={busy === "overlay" || !validCaptionDuration}
        onClick={onSave}
      >
        <Save />
        บันทึก Overlay
      </button>
    </section>
  );
}
