"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { AudioLines, Check, CornerDownLeft, MousePointer2, Sparkles } from "lucide-react";
import "./FloatingConversations.css";

const conversations = [
  { name: "Alex", initial: "A", en: "Hold on, don't push yet. Let me check the corner first.", th: "เดี๋ยวก่อน อย่าเพิ่งบุก ขอเช็กตรงมุมก่อน" },
  { name: "Jamie", initial: "J", en: "Don't go in yet. Wait until I throw the smoke, then cross together.", th: "อย่าเพิ่งเข้าไป รอฉันโยนควันก่อน แล้วค่อยข้ามไปพร้อมกัน" },
  { name: "Chris", initial: "C", en: "I'm low on ammo. Can you cover me while I reload?", th: "กระสุนใกล้หมดแล้ว ช่วยคุ้มกันตอนฉันรีโหลดหน่อยได้ไหม?" },
  { name: "Sam", initial: "S", en: "There's someone behind us. I'll watch the stairs, you take the left side.", th: "มีคนอยู่ข้างหลังเรา ฉันจะดูตรงบันได นายดูทางซ้ายนะ" },
  { name: "Riley", initial: "R", en: "Let's take the long way around. They're probably watching this entrance.", th: "อ้อมไปอีกทางกันเถอะ พวกนั้นน่าจะเฝ้าทางเข้านี้อยู่" },
] as const;
type Phase = "english" | "translating" | "thai";

export function FloatingConversations() {
  const [phases, setPhases] = useState<Record<number, Phase>>({});
  const [announcement, setAnnouncement] = useState("");
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());
  useEffect(() => {
    const pending = timers.current;
    return () => { pending.forEach(clearTimeout); pending.clear(); };
  }, []);

  function translate(index: number) {
    if (timers.current.has(index)) return;
    if (phases[index] === "thai") {
      setPhases((current) => ({ ...current, [index]: "english" }));
      setAnnouncement("");
      return;
    }
    setPhases((current) => ({ ...current, [index]: "translating" }));
    setAnnouncement("กำลังแปลบทสนทนาตัวอย่าง…");
    timers.current.set(index, setTimeout(() => {
      setPhases((current) => ({ ...current, [index]: "thai" }));
      setAnnouncement(`${conversations[index].th} — เดโมแปลใน 1 วินาที`);
      timers.current.delete(index);
    }, 900));
  }

  return <section className="conversation-section section-wrap" aria-labelledby="product-title">
    <div className="conversation-copy">
      <p className="eyebrow">ฟังและตอบกลับ</p>
      <h2 id="product-title">รู้ว่าเพื่อนพูดอะไร<br /><span className="muted-heading">รู้ว่าจะตอบยังไง</span></h2>
      <p className="conversation-invite">เพื่อนพูดมาแบบนี้ แปลว่าอะไร?</p>
      <div className="conversation-hint"><MousePointer2 size={17} aria-hidden="true" /><span>ลองกดที่คำพูดของเพื่อน</span></div>
      <p className="conversation-disclaimer">บทสนทนาตัวอย่าง · ความเร็วจริงขึ้นอยู่กับเครือข่ายและบริการ AI</p>
      <span className="conversation-announcement" role="status" aria-live="polite">{announcement}</span>
    </div>
    <div className="conversation-stage" aria-label="ลองแปลเสียงเพื่อนในเกม">
      <div className="conversation-ambient" aria-hidden="true" />
      {conversations.map((line, index) => {
        const phase = phases[index] ?? "english";
        return <div key={line.name} className={`conversation-float conversation-float-${index} ${phase !== "english" ? "is-selected" : ""}`} style={{ "--float-delay": `${index * -1.7}s` } as CSSProperties}>
          <button className={`conversation-card phase-${phase}`} type="button" onClick={() => translate(index)} aria-busy={phase === "translating"} aria-label={phase === "thai" ? `${line.name}: ${line.th} คลิกเพื่อดูภาษาอังกฤษอีกครั้ง` : `แปลคำพูดของ ${line.name}: ${line.en}`}>
            <span className="conversation-card-inner">
              <span className="conversation-face conversation-front" aria-hidden="true">
                <span className="conversation-top"><span className="conversation-speaker"><span className="conversation-avatar">{line.initial}</span><span>{line.name}<small>เสียงเพื่อนในเกม</small></span></span><span className="conversation-lang">EN</span></span>
                <span className="conversation-quote">{line.en}</span>
                <span className="conversation-bottom"><span className="conversation-wave">{Array.from({length:9}, (_,i) => <i key={i} style={{"--bar":i} as CSSProperties} />)}</span><span>{phase === "translating" ? <><Sparkles size={12} />กำลังแปล…</> : <>คลิกเพื่อแปล<CornerDownLeft size={12} /></>}</span></span>
                {phase === "translating" && <span className="conversation-scan" />}
              </span>
              <span className="conversation-face conversation-back" aria-hidden="true">
                <span className="conversation-top"><span className="conversation-speaker"><span className="conversation-avatar translated"><AudioLines size={18} /></span><span>ว่าไง<small>คำแปลของ {line.name}</small></span></span><span className="conversation-lang">TH</span></span>
                <span className="conversation-quote">{line.th}</span>
                <span className="conversation-bottom"><span className="conversation-speed"><Check size={12} />เดโม · แปลใน 1 วินาที</span><span>ดูต้นฉบับ<CornerDownLeft size={12} /></span></span>
              </span>
            </span>
          </button>
        </div>;
      })}
    </div>
  </section>;
}
