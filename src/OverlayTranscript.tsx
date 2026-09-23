import { useLayoutEffect, useRef, useState, type ReactNode } from "react";

type Props = {
  children: ReactNode;
  contentKey: string;
  fontScale: number;
  editMode: boolean;
  editShortcut: string;
};

/** Follow complete recent phrases, without clipping their first line. Unlocking
 * the existing edit mode also makes long transcripts keyboard/scroll accessible. */
export function OverlayTranscript({ children, contentKey, fontScale, editMode, editShortcut }: Props) {
  const viewport = useRef<HTMLElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const followLatest = useRef(true);
  const programmaticTop = useRef(0);
  const [overflowing, setOverflowing] = useState(false);

  useLayoutEffect(() => {
    const scrollport = viewport.current;
    const messages = content.current;
    if (!scrollport || !messages) return;
    if (!editMode) followLatest.current = true;

    const align = () => {
      const maximum = Math.max(0, scrollport.scrollHeight - scrollport.clientHeight);
      setOverflowing(maximum > 1);
      if (!followLatest.current) return;
      const latest = messages.querySelector<HTMLElement>("[data-overlay-message]:last-child");
      // The positioned scrollport is the messages' offset parent. Layout offsets
      // ignore entry-animation transforms, unlike getBoundingClientRect().
      const latestTop = latest ? latest.offsetTop : maximum;
      // Short newest phrase: show it in full at the bottom. Taller than viewport:
      // start at its first line; never auto-position in the middle of that phrase.
      scrollport.scrollTop = Math.max(0, Math.min(maximum, latestTop));
      programmaticTop.current = scrollport.scrollTop;
    };
    align();
    const observer = typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(align);
    observer?.observe(scrollport);
    observer?.observe(messages);
    window.addEventListener("resize", align);
    return () => { observer?.disconnect(); window.removeEventListener("resize", align); };
  }, [contentKey, fontScale, editMode]);

  return <>
    <section
      ref={viewport}
      className="overlay-transcript wangai-scrollbar"
      aria-label="ข้อความคำแปล"
      aria-live="polite"
      tabIndex={editMode ? 0 : undefined}
      onScroll={() => {
        const node = viewport.current;
        if (!node || !editMode || Math.abs(node.scrollTop - programmaticTop.current) <= 1) return;
        followLatest.current = node.scrollHeight - node.clientHeight - node.scrollTop <= 2;
      }}
    ><div ref={content} className="overlay-transcript-content">{children}</div></section>
    {overflowing && <p className="overlay-overflow-hint">{editMode
      ? "เลื่อนเพื่ออ่านข้อความทั้งหมด"
      : `กด ${editShortcut} เพื่อเลื่อนอ่านข้อความทั้งหมด`}</p>}
  </>;
}
