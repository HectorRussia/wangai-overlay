import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Globe2, Info, LoaderCircle, Monitor, RefreshCw, Search, X } from "lucide-react";
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
  onClear?: () => Promise<void>;
};
const normalizedPath = (path: string) => path.replaceAll("/", "\\").toLowerCase();
function isSelectedApp(app: RunningApp, selected?: SavedProcess): boolean {
  if (!selected) return false;
  const path = normalizedPath(selected.executablePath);
  if (path) return app.searchNames.some((name) => normalizedPath(name) === path);
  return selected.lastPid != null && app.memberPids.includes(selected.lastPid)
    && app.searchNames.some((name) => name.toLowerCase() === selected.executableName.toLowerCase());
}

export function ProcessPickerDialog({ apps, selected, loading, error, previewMode, onClose, onRefresh, onSelect, onClear }: Props) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const [query, setQuery] = useState("");
  const [selecting, setSelecting] = useState<number>();
  const [clearing, setClearing] = useState(false);
  const [selectionError, setSelectionError] = useState<string>();
  const [expanded, setExpanded] = useState<string>();
  useLayoutEffect(() => {
    // A new search starts at its first result; periodic refresh must not move it.
    if (listRef.current) listRef.current.scrollTop = 0;
  }, [query]);
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
    return apps.filter((app) => text
      ? [app.displayName, app.executableName, ...app.searchNames].some((name) => name.toLocaleLowerCase().includes(text))
      : app.hasWindow || isSelectedApp(app, selected))
      .sort((a, b) => Number(isSelectedApp(b, selected)) - Number(isSelectedApp(a, selected)) || Number(b.hasWindow) - Number(a.hasWindow) || a.displayName.localeCompare(b.displayName) || a.id.localeCompare(b.id));
  }, [apps, query, selected]);
  const select = async (source: CaptureSource) => {
    setSelecting(source.pid); setSelectionError(undefined);
    try { await onSelect(source); }
    catch (error) { setSelectionError(error instanceof Error ? error.message : String(error)); }
    finally { setSelecting(undefined); }
  };
  const clear = async () => {
    if (!onClear) return;
    setClearing(true); setSelectionError(undefined);
    try { await onClear(); }
    catch (error) { setSelectionError(error instanceof Error ? error.message : String(error)); }
    finally { setClearing(false); }
  };
  return <div className="process-dialog-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <div aria-labelledby="process-dialog-title" aria-modal="true" className="process-dialog" ref={dialogRef} role="dialog">
      <header><div><span><Globe2 /></span><div><p>แอปที่กำลังเปิดอยู่บนเครื่อง</p><h2 id="process-dialog-title">เลือกแอปที่จะฟัง</h2></div></div><button aria-label="ปิดหน้าต่างเลือกแอป" onClick={onClose}><X /></button></header>
      <div className="process-dialog-hint" id="process-dialog-hint"><Info aria-hidden="true" /><div><strong>เลือกเกมหรือแอปที่ต้องการแปลเสียง</strong><p>หากไม่พบ ให้เปิดแอปนั้นก่อนแล้วกดรีเฟรช</p></div></div>
      <div className="process-dialog-search"><Search /><input aria-label="ค้นหาแอปที่จะฟัง" aria-describedby="process-dialog-hint" placeholder="ค้นหาชื่อเกมหรือแอป" ref={searchRef} value={query} onChange={(event) => setQuery(event.target.value)} /><button aria-label="รีเฟรชรายการแอป" disabled={loading} onClick={onRefresh}><RefreshCw className={loading ? "animate-spin" : ""} /></button></div>
      <div className="process-dialog-status-row"><p className="process-dialog-status" role="status">{loading ? "กำลังตรวจหาแอป…" : query.trim() ? `พบ ${choices.length} รายการที่ตรงกับคำค้น` : `แอปหลักที่เปิดอยู่ ${choices.length} รายการ`}</p>
        {!query.trim() && <span className="process-dialog-search-hint">ไม่พบแอป? พิมพ์ชื่อเพื่อค้นหา</span>}</div>
      {(error || selectionError) && <p className="process-dialog-error" role="alert">{selectionError ?? error}</p>}
      <div className="process-dialog-list" aria-busy={loading} ref={listRef}>
        {choices.map((app) => {
          const checked = isSelectedApp(app, selected);
          const multiple = app.roots.length > 1;
          const duplicateName = apps.some((other) => other.id !== app.id && other.displayName === app.displayName);
          const open = expanded === app.id;
          const detailsId = `process-details-${app.id}`;
          return <div className="process-app-group" key={app.id}>
            <button aria-label={multiple ? `เลือกหน้าต่างของ ${app.displayName}` : `เลือก ${app.displayName}`} aria-pressed={multiple ? undefined : checked} aria-expanded={multiple ? open : undefined} aria-controls={multiple && open ? detailsId : undefined} className={checked ? "is-selected" : ""} disabled={clearing || selecting !== undefined || (previewMode && !multiple)} onClick={() => multiple ? setExpanded(open ? undefined : app.id) : app.roots[0] && void select(app.roots[0])}>
              <span className="process-choice-icon"><Monitor /></span><span><strong>{app.displayName}</strong><small>{checked ? "เลือกอยู่ · " : ""}{multiple ? "เลือกหน้าต่างที่จะฟัง" : "เลือกแอปนี้"}{duplicateName ? ` · ${app.executableName}` : ""}</small></span>
              {selecting !== undefined && app.roots.some((root) => root.pid === selecting) ? <LoaderCircle className="animate-spin" /> : checked ? <Check /> : multiple ? <ChevronDown /> : null}
            </button>
            {!multiple && <button className="process-details-toggle" aria-label={`รายละเอียด ${app.displayName}`} aria-expanded={open} aria-controls={open ? detailsId : undefined} onClick={() => setExpanded(open ? undefined : app.id)}>รายละเอียด</button>}
            {open && <div className="process-app-details" id={detailsId}>
              <p>{app.executablePath || "Windows ไม่อนุญาตให้อ่านตำแหน่งไฟล์"}</p>
              {app.roots.map((root, index) => <div key={root.pid}><span>{root.name} · PID {root.pid}</span>{multiple && <button disabled={previewMode || clearing || selecting !== undefined} onClick={() => void select(root)}>{`เลือกหน้าต่าง ${index + 1}`}</button>}</div>)}
            </div>}
          </div>;
        })}
        {!loading && choices.length === 0 && <div className="process-dialog-empty"><strong>{query.trim() ? "ไม่พบแอปที่ตรงกับคำค้น" : "ยังไม่พบแอปที่เปิดอยู่"}</strong><p>เปิดเกมหรือแอปให้ถึงหน้าหลัก แล้วกดรีเฟรชรายการด้านบน</p>{query.trim() && <p>ถ้าเปิดอยู่แล้ว ลองค้นด้วยชื่อสั้น ๆ เช่น Hell หรือ Discord</p>}</div>}
      </div>
      {selected && onClear && <div className="process-dialog-footer"><span>ไม่ต้องการฟังแอปนี้แล้ว?</span><button disabled={previewMode || clearing || selecting !== undefined} onClick={() => void clear()}>{clearing ? "กำลังล้าง…" : "ล้างการเลือก"}</button></div>}
      {previewMode && <p className="process-dialog-preview">Browser Preview แสดงรายการจำลองและไม่สามารถเปลี่ยน process จริงได้</p>}
    </div>
  </div>;
}
