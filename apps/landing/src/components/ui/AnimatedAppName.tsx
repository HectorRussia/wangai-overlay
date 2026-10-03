"use client";

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";

// Module state survives client navigation, but resets on a full page refresh.
let finishedThisPageLoad = false;

export function AnimatedAppName() {
  const [phase, setPhase] = useState<"english" | "erase" | "wave" | "thai" | "done">(() => finishedThisPageLoad ? "done" : "english");
  const nameRef = useRef<HTMLSpanElement>(null);
  const previousWidth = useRef<number | null>(null);
  const english = phase === "english" || phase === "erase" || phase === "wave";

  useLayoutEffect(() => {
    const element = nameRef.current;
    if (!element) return;
    const width = element.getBoundingClientRect().width;
    const oldWidth = previousWidth.current;
    previousWidth.current = width;
    if (oldWidth === null || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    // Animating layout width keeps the whole headline centered as the name shrinks.
    const animation = element.animate([{ width: `${oldWidth}px` }, { width: `${width}px` }], {
      duration: 750,
      easing: "cubic-bezier(.22,1,.36,1)",
    });
    return () => animation.cancel();
  }, [english]);

  useEffect(() => {
    if (finishedThisPageLoad) return;
    const timers: ReturnType<typeof setTimeout>[] = [];
    function schedule(delay: number, action: () => void) {
      timers.push(setTimeout(action, delay));
    }
    function finish() {
      finishedThisPageLoad = true;
      setPhase("done");
    }
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      schedule(0, finish);
    } else {
      schedule(1200, () => setPhase("erase"));
      schedule(1950, () => setPhase("wave"));
      schedule(3100, () => setPhase("thai"));
      schedule(4400, finish);
    }
    return () => timers.forEach(clearTimeout);
  }, []);

  return <span ref={nameRef} className={`hero-app-name animated-app-name name-phase-${phase}`} aria-label="ว่าไง">
    <span className="name-size-guide" aria-hidden="true"><span className={english ? "name-english-guide" : undefined}>{english ? "WANGAI" : "ว่าไง"}</span></span>
    <span className="name-glyphs" aria-hidden="true" key={english ? "english" : "thai"}>
      {(english ? Array.from("WANGAI") : ["ว่", "า", "ไ", "ง"]).map((glyph, index) => <span className="name-glyph" key={index} style={{ "--glyph-index": index, "--erase-index": 5 - index } as CSSProperties}>{glyph}</span>)}
    </span>
    {phase !== "done" && <span className="name-wave" aria-hidden="true">{Array.from({ length: 29 }, (_, index) => <i key={index} style={{
      "--bar-index": index,
      "--bar-height": `${(12 + Math.sin(index / 28 * Math.PI) * (24 + Math.abs(Math.sin(index * 1.7)) * 52)).toFixed(2)}%`,
      "--bar-delay": `${index * -47}ms`,
    } as CSSProperties} />)}</span>}
  </span>;
}
