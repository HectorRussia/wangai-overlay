import { KeyRound, Save } from "lucide-react";
import type { HotkeySettings } from "../../types";
import { displayShortcut } from "./hotkeyCapture";
import { button } from "./styles";
const hotkeyLabels: Record<keyof HotkeySettings, string> = {
  toggleListening: "เริ่มหรือหยุดฟัง",
  pushToTalk: "กดพูดเพื่อแปลตอบ",
  copyLatest: "คัดลอกคำตอบล่าสุด",
  editOverlay: "จัดตำแหน่ง Overlay",
};

export function HotkeySettingsCard({
  hotkeys,
  recordingHotkey,
  hotkeyError,
  busy,
  beginHotkeyCapture,
  onSave,
}: {
  hotkeys: HotkeySettings;
  recordingHotkey: keyof HotkeySettings | null;
  hotkeyError?: string;
  busy?: string;
  beginHotkeyCapture: (key: keyof HotkeySettings) => Promise<void>;
  onSave: () => void;
}) {
  return (
    <section
      className="settings-direct-card settings-hotkey-card"
      aria-labelledby="settings-hotkey-title"
    >
      <header>
        <KeyRound aria-hidden="true" />
        <div>
          <h2 id="settings-hotkey-title">ปุ่มลัด</h2>
          <p>ใช้ควบคุมระหว่างเล่นเกม</p>
        </div>
      </header>
      <div className="settings-hotkey-grid">
        {Object.entries(hotkeys).map(([key, value]) => (
          <div className="settings-hotkey-label" key={key}>
            <span>{hotkeyLabels[key as keyof HotkeySettings]}</span>
            <button
              type="button"
              className="settings-hotkey-capture"
              aria-label={`เปลี่ยนปุ่มลัด ${hotkeyLabels[key as keyof HotkeySettings]}`}
              aria-pressed={recordingHotkey === key}
              disabled={Boolean(recordingHotkey && recordingHotkey !== key)}
              onClick={() =>
                void beginHotkeyCapture(key as keyof HotkeySettings)
              }
            >
              {recordingHotkey === key
                ? "กดปุ่มที่ต้องการ…"
                : value
                  ? displayShortcut(value)
                  : "ไม่ได้ตั้ง"}
            </button>
          </div>
        ))}
      </div>
      <p className="settings-direct-hint">
        {"คลิกช่องเพื่อเปลี่ยนปุ่มลัด · Esc เพื่อยกเลิก"}
      </p>
      {hotkeyError && (
        <p className="settings-field-error" role="alert">
          {hotkeyError}
        </p>
      )}
      <button
        className={button}
        disabled={busy === "hotkeys" || Boolean(recordingHotkey)}
        onClick={onSave}
      >
        <Save />
        บันทึกปุ่มลัด
      </button>
    </section>
  );
}
