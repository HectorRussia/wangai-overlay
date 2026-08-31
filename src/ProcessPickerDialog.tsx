import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Gamepad2, LoaderCircle, RefreshCw, Search, Wifi, X, Zap } from "lucide-react";
import type { CaptureSource, SavedProcess } from "./types";

type ProcessPickerDialogProps = {
  kind: "game" | "voice";
  processes: CaptureSource[];
  selected?: SavedProcess;
  loading: boolean;
  previewMode: boolean;
  onClose: () => void;
  onRefresh: () => void;
  onSelect: (source: CaptureSource) => Promise<void>;
};

export function ProcessPickerDialog({
  kind,
  processes,
  selected,
  loading,
  previewMode,
  onClose,
  onRefresh,
  onSelect,
}: ProcessPickerDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const [query, setQuery] = useState("");
  const [selecting, setSelecting] = useState<number>();

  useEffect(() => {
    returnFocusRef.current = document.activeElement as HTMLElement | null;
    searchRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = [...dialogRef.current.querySelectorAll<HTMLElement>(
        "button:not([disabled]), input:not([disabled]), a[href]",
      )];
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      returnFocusRef.current?.focus();
    };
  }, [onClose]);

  const choices = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    const filtered = processes.filter((process) =>
      !normalized
      || process.displayName.toLowerCase().includes(normalized)
      || process.name.toLowerCase().includes(normalized)
      || process.executablePath.toLowerCase().includes(normalized),
    );
    return kind === "voice"
      ? filtered.sort((left, right) => Number(!left.name.toLowerCase().startsWith("discord")) - Number(!right.name.toLowerCase().startsWith("discord")))
      : filtered.sort((left, right) => Number(!left.isMistfall) - Number(!right.isMistfall));
  }, [kind, processes, query]);

  return (
    <div className="process-dialog-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div aria-labelledby="process-dialog-title" aria-modal="true" className="process-dialog" ref={dialogRef} role="dialog">
        <header>
          <div>
            <span>{kind === "game" ? <Gamepad2 /> : <Wifi />}</span>
            <div><p>แหล่งเสียง</p><h2 id="process-dialog-title">{kind === "game" ? "เลือกเกมที่จะฟัง" : "เลือกแอป Voice Chat"}</h2></div>
          </div>
          <button aria-label="ปิดหน้าต่างเลือกแอป" onClick={onClose}><X /></button>
        </header>

        <div className="process-dialog-search">
          <Search />
          <input
            aria-label={kind === "game" ? "ค้นหาเกม" : "ค้นหา Voice Chat"}
            placeholder={kind === "game" ? "Mistfall หรือชื่อเกม" : "Discord หรือแอปเสียงอื่น"}
            ref={searchRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <button aria-label="รีเฟรชรายการแอป" disabled={loading} onClick={onRefresh}>
            <RefreshCw className={loading ? "animate-spin" : ""} />
          </button>
        </div>

        <div className="process-dialog-list">
          {choices.slice(0, 40).map((process) => {
            const isSelected = selected?.lastPid === process.pid
              || (selected?.lastPid === undefined
                && selected?.executablePath.toLowerCase() === process.executablePath.toLowerCase());
            const recommended = kind === "game" ? process.isMistfall : process.name.toLowerCase().startsWith("discord");
            return (
              <button
                aria-pressed={isSelected}
                className={isSelected ? "is-selected" : ""}
                disabled={previewMode || selecting !== undefined}
                key={`${process.pid}-${process.executablePath}`}
                onClick={async () => {
                  setSelecting(process.pid);
                  try { await onSelect(process); } finally { setSelecting(undefined); }
                }}
              >
                <span className="process-choice-icon">{kind === "game" ? (process.isMistfall ? <Zap /> : <Gamepad2 />) : <Wifi />}</span>
                <span><strong>{process.displayName}</strong><small>{process.name}</small></span>
                {recommended && <em>แนะนำ</em>}
                {selecting === process.pid ? <LoaderCircle className="animate-spin" /> : isSelected ? <Check /> : null}
              </button>
            );
          })}
          {!loading && choices.length === 0 && <p className="process-dialog-empty">ไม่พบแอปที่ตรงกัน ลองเปิดแอปแล้วกดรีเฟรช</p>}
        </div>

        {previewMode && <p className="process-dialog-preview">Browser Preview แสดงรายการจำลองและไม่สามารถเปลี่ยน process จริงได้</p>}
      </div>
    </div>
  );
}
