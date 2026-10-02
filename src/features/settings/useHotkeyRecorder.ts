import { useEffect, useState } from "react";
import { api } from "../../api";
import type { HotkeySettings } from "../../types";
import { errorText } from "../../shared/errors";
import { shortcutFromKeydown } from "./hotkeyCapture";

export function useHotkeyRecorder(
  hotkeys: HotkeySettings | undefined,
  setHotkeys: (value: HotkeySettings) => void,
  onError: (message: string) => void,
) {
  const [recordingHotkey, setRecordingHotkey] = useState<keyof HotkeySettings | null>(null);
  const [hotkeyError, setHotkeyError] = useState<string>();
  useEffect(() => {
    if (!recordingHotkey || !hotkeys) return;
    const cancel = () => { setRecordingHotkey(null); setHotkeyError(undefined); };
    const record = (shortcut: string) => {
      if (Object.entries(hotkeys).some(([key, value]) => key !== recordingHotkey && value.toLowerCase() === shortcut.toLowerCase())) {
        setHotkeyError("ปุ่มลัดนี้ถูกใช้แล้ว เลือกปุ่มอื่น");
        return;
      }
      setHotkeys({ ...hotkeys, [recordingHotkey]: shortcut });
      setHotkeyError(undefined);
      cancel();
    };
    const capture = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopPropagation();
      if (event.repeat) return;
      if (event.code === "Escape" || event.key === "Escape" || event.key === "Esc") { cancel(); return; }
      if (["ControlLeft", "ControlRight", "AltLeft", "AltRight", "ShiftLeft", "ShiftRight", "MetaLeft", "MetaRight"].includes(event.code) || ["Control", "Alt", "Shift", "Meta"].includes(event.key)) return;
      const shortcut = shortcutFromKeydown(event);
      if (!shortcut) { setHotkeyError("ปุ่มนี้ใช้เป็นปุ่มลัดไม่ได้ ลอง F1–F12 หรือ Ctrl/Alt ร่วมกับปุ่มอื่น"); return; }
      record(shortcut);
    };
    window.addEventListener("keydown", capture, true);
    window.addEventListener("blur", cancel);
    return () => {
      window.removeEventListener("keydown", capture, true);
      window.removeEventListener("blur", cancel);
      void api.setHotkeyCaptureMode(false);
    };
  }, [recordingHotkey, hotkeys]);

  const beginHotkeyCapture = async (key: keyof HotkeySettings) => {
    if (recordingHotkey) { setRecordingHotkey(null); setHotkeyError(undefined); return; }
    setHotkeyError(undefined);
    try {
      await api.setHotkeyCaptureMode(true);
      setRecordingHotkey(key);
    } catch (error) {
      onError(errorText(error));
    }
  };

  return { recordingHotkey, hotkeyError, beginHotkeyCapture };
}
