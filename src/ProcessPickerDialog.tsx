import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Globe2, LoaderCircle, Monitor, RefreshCw, Search, X } from "lucide-react";
import type { CaptureSource, RunningApp, SavedProcess } from "./types";

type Props = {
  apps: RunningApp[];
  selected?: SavedProcess;
  loading: boolean;
  error?: string;
  previewMode: boolean;
  onClose: () => void;
  onRefresh: () => void;
  onSelect: (source: CaptureSource) => Promise<void>;
};
const normalizedPath = (path: string) => path.replaceAll("/", "\\").toLowerCase();
function isSelectedApp(app: RunningApp, selected?: SavedProcess): boolean {
  if (!selected) return false;
  const path = normalizedPath(selected.executablePath);
  if (path) return app.searchNames.some((name) => normalizedPath(name) === path);
  return selected.lastPid != null && app.memberPids.includes(selected.lastPid)
    && app.searchNames.some((name) => name.toLowerCase() === selected.executableName.toLowerCase());
}

export function ProcessPickerDialog({ apps, selected, loading, error, previewMode, onClose, onRefresh, onSelect }: Props) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const [query, setQuery] = useState("");
  const [selecting, setSelecting] = useState<number>();
  const [selectionError, setSelectionError] = useState<string>();
  const [expanded, setExpanded] = useState<string>();
  useEffect(() => {
    const returnFocus = document.activeElement as HTMLElement | null;
    searchRef.current?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); closeRef.current(); return; }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const elements = [...dialogRef.current.querySelectorAll<HTMLElement>("button:not([disabled]), input:not([disabled]), a[href]")];
      const first = elements[0], last = elements[elements.length - 1];
      if (!first) return;
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", keydown);
    return () => { document.removeEventListener("keydown", keydown); returnFocus?.focus(); };
  }, []);
  const choices = useMemo(() => {
    const text = query.trim().toLocaleLowerCase();
    return apps.filter((app) => !text || [app.displayName, app.executableName, ...app.searchNames].some((name) => name.toLocaleLowerCase().includes(text)))
      .sort((a, b) => Number(isSelectedApp(b, selected)) - Number(isSelectedApp(a, selected)) || Number(b.hasWindow) - Number(a.hasWindow) || a.displayName.localeCompare(b.displayName) || a.id.localeCompare(b.id));
  }, [apps, query, selected]);
  const select = async (source: CaptureSource) => {
    setSelecting(source.pid); setSelectionError(undefined);
    try { await onSelect(source); }
    catch (error) { setSelectionError(error instanceof Error ? error.message : String(error)); }
    finally { setSelecting(undefined); }
  };
  return <div className="process-dialog-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <div aria-labelledby="process-dialog-title" aria-modal="true" className="process-dialog" ref={dialogRef} role="dialog">
      <header><div><span><Globe2 /></span><div><p>แอปที่กำลังเปิดอยู่บนเครื่อง</p><h2 id="process-dialog-title">เลือกแอปที่จะฟัง</h2></div></div><button aria-label="ปิดหน้าต่างเลือกแอป" onClick={onClose}><X /></button></header>
      <div className="process-dialog-search"><Search /><input aria-label="ค้นหาแอปที่จะฟัง" placeholder="ค้นหาชื่อแอป หรือชื่อไฟล์ .exe" ref={searchRef} value={query} onChange={(event) => setQuery(event.target.value)} /><button aria-label="รีเฟรชรายการแอป" disabled={loading} onClick={onRefresh}><RefreshCw className={loading ? "animate-spin" : ""} /></button></div>
      <p className="process-dialog-status" role="status">{loading ? "กำลังตรวจหาแอป…" : choices.length + " แอป · รวม process ย่อยแล้ว"}</p>
      {(error || selectionError) && <p className="process-dialog-error" role="alert">{selectionError ?? error}</p>}
      <div className="process-dialog-list" aria-busy={loading}>
        {choices.map((app) => {
          const checked = isSelectedApp(app, selected);
          const multiple = app.roots.length > 1;
          const duplicateName = apps.some((other) => other.id !== app.id && other.displayName === app.displayName);
          return <div className="process-app-group" key={app.id}>
            <button aria-pressed={checked} aria-expanded={multiple ? expanded === app.id : undefined} className={checked ? "is-selected" : ""} disabled={selecting !== undefined || (previewMode && !multiple)} onClick={() => multiple ? setExpanded(expanded === app.id ? undefined : app.id) : app.roots[0] && void select(app.roots[0])}>
              <span className="process-choice-icon"><Monitor /></span><span><strong>{app.displayName}</strong><small>{app.executableName} · {app.processCount} processes{multiple ? " · " + app.roots.length + " instances" : ""}</small>{duplicateName && <small>{app.executablePath}</small>}</span>
              {selecting !== undefined && app.roots.some((root) => root.pid === selecting) ? <LoaderCircle className="animate-spin" /> : checked ? <Check /> : multiple ? <ChevronDown /> : null}
            </button>
            <button className="process-details-toggle" aria-label={"รายละเอียด " + app.displayName} aria-expanded={expanded === app.id} onClick={() => setExpanded(expanded === app.id ? undefined : app.id)}>รายละเอียด</button>
            {expanded === app.id && <div className="process-app-details"><p>{app.executablePath || "Windows ไม่อนุญาตให้อ่านตำแหน่งไฟล์"}</p>{app.roots.map((root) => <div key={root.pid}><span>{root.name} · PID {root.pid}</span>{multiple && <button disabled={previewMode || selecting !== undefined} onClick={() => void select(root)}>เลือก instance {root.pid}</button>}</div>)}</div>}
          </div>;
        })}
        {!loading && choices.length === 0 && <p className="process-dialog-empty">ไม่พบแอปที่ตรงกัน ลองเปิดแอปแล้วกดรีเฟรช</p>}
      </div>
      {previewMode && <p className="process-dialog-preview">Browser Preview แสดงรายการจำลองและไม่สามารถเปลี่ยน process จริงได้</p>}
    </div>
  </div>;
}
