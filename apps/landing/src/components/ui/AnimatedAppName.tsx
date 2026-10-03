"use client";

import { useEffect, useState, type CSSProperties } from "react";

// Module state survives client navigation, but resets on a full page refresh.
let finishedThisPageLoad = false;

export function AnimatedAppName() {
  const [phase, setPhase] = useState<"english" | "erase" | "thai" | "done">(() => finishedThisPageLoad ? "done" : "english");

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
      schedule(2200, () => setPhase("thai"));
      schedule(3400, finish);
    }
    return () => timers.forEach(clearTimeout);
  }, []);

  const english = phase === "english" || phase === "erase";
  return <span className={`hero-app-name animated-app-name name-phase-${phase}`} aria-label="ว่าไง">
    <span className="name-glyphs" aria-hidden="true" key={english ? "english" : "thai"}>
      {(english ? Array.from("WANGAI") : ["ว่", "า", "ไ", "ง"]).map((glyph, index) => <span className="name-glyph" key={index} style={{ "--glyph-index": index, "--erase-index": 5 - index } as CSSProperties}>{glyph}</span>)}
    </span>
    {phase !== "done" && <><span className="name-light-sweep" aria-hidden="true" /><span className="name-orbit" aria-hidden="true">{Array.from({ length: 6 }, (_, index) => <i key={index} style={{ "--spark-index": index } as CSSProperties} />)}</span></>}
  </span>;
}
