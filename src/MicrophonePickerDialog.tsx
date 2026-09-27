import { useEffect, useRef, useState } from "react";
import { Check, Mic, RefreshCw, X } from "lucide-react";
import type { AudioOutputDevice } from "./types";

type Props = {
  devices: AudioOutputDevice[];
  selectedId?: string | null;
  loading: boolean;
  error?: string;
  active: boolean;
  previewMode: boolean;
  onClose: () => void;
  onRefresh: () => void;
  onSelect: (id?: string) => Promise<void>;
};

export function MicrophonePickerDialog({ devices, selectedId, loading, error, active, previewMode, onClose, onRefresh, onSelect }: Props) {
  const firstRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string>();
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    firstRef.current?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { closeRef.current(); return; }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const items = [...dialogRef.current.querySelectorAll<HTMLButtonElement>("button:not([disabled])")];
      const first = items[0], last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener("keydown", keydown);
    return () => { document.removeEventListener("keydown", keydown); previous?.focus(); };
  }, []);
  const select = async (id?: string) => {
    setSaving(true); setSaveError(undefined);
    try { await onSelect(id); }
    catch (cause) { setSaveError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setSaving(false); }
  };
  return <div className="process-dialog-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <div aria-labelledby="microphone-dialog-title" aria-modal="true" className="process-dialog microphone-dialog" ref={dialogRef} role="dialog">
      <header><div><span><Mic /></span><div><p>เสียงของเรา</p><h2 id="microphone-dialog-title">เลือกไมโครโฟน</h2></div></div><button aria-label="ปิดหน้าต่างเลือกไมโครโฟน" onClick={onClose}><X /></button></header>
      <p className="microphone-dialog-hint">เลือกไมค์ที่ใช้พูดภาษาไทยเพื่อแปลตอบเป็นอังกฤษ</p>
      <div className="microphone-dialog-list">
        <button aria-pressed={!selectedId} disabled={saving || active || previewMode} onClick={() => void select()} ref={firstRef}><span><strong>ใช้ไมค์เริ่มต้นของ Windows</strong><small>{devices.find((device) => device.isDefault)?.name ?? "ยังไม่พบไมค์เริ่มต้น"}</small></span>{!selectedId && <Check />}</button>
        {devices.map((device) => <button aria-pressed={selectedId === device.id} disabled={saving || active || previewMode} key={device.id} onClick={() => void select(device.id)}><span><strong>{device.name}</strong><small>{device.isDefault ? "ไมค์เริ่มต้นใน Windows" : "ไมโครโฟนที่เชื่อมต่อ"}</small></span>{selectedId === device.id && <Check />}</button>)}
      </div>
      {(error || saveError) && <p className="process-dialog-error" role="alert">{saveError ?? error}</p>}
      {!loading && devices.length === 0 && <p className="microphone-dialog-hint">ยังไม่พบไมโครโฟน ตรวจการเชื่อมต่อและสิทธิ์ไมค์ใน Windows</p>}
      {active && <p className="microphone-dialog-hint">ปล่อยปุ่มพูดก่อนเปลี่ยนไมโครโฟน</p>}
      {previewMode && <p className="microphone-dialog-hint">Browser Preview แสดงรายการจำลอง</p>}
      <div className="microphone-dialog-footer"><button disabled={loading} onClick={onRefresh}><RefreshCw className={loading ? "animate-spin" : ""} />ตรวจหาไมค์อีกครั้ง</button></div>
    </div>
  </div>;
}
