import Image from "next/image";
import { Headphones, Mic, Check, MessageSquare } from "lucide-react";
import type { CSSProperties } from "react";

export function TranslationMotion({ step, playing, dialogue }: {
  step: number;
  playing: boolean;
  dialogue: { english: string; thai: string; replyThai: string; replyEnglish: string };
}) {
  const reply = step >= 3;
  const listening = step === 0 || step === 3;
  const processing = step === 1;
  const ready = reply ? step >= 4 : step >= 2;
  const text = reply ? dialogue.replyEnglish : dialogue.thai;
  return (
    <div className={`translation-motion ${playing ? "is-running" : ""} ${listening ? "is-listening" : ""} ${processing ? "is-processing" : ""} ${ready ? "has-result" : ""}`}>
      <div className="motion-input" key={reply ? "mic" : "game"}>
        <span className="motion-label">{reply ? "คุณพูดไทย" : "เสียงเพื่อนในเกม"}<b>{reply ? "TH" : "EN"}</b></span>
        <div className="motion-audio" aria-hidden="true">
          <span className="motion-audio-icon">{reply ? <Mic size={24} /> : <Headphones size={24} />}</span>
          <div className="motion-wave">
            {Array.from({ length: 19 }, (_, i) => <i key={i} style={{ "--bar": `${12 + (i * 17 % 32)}px`, "--delay": `${i * -0.09}s` } as CSSProperties} />)}
          </div>
        </div>
        <p lang={reply ? "th" : "en"}>{reply ? dialogue.replyThai : dialogue.english}</p>
      </div>
      <div className="motion-transfer motion-transfer-in" aria-hidden="true"><i /></div>
      <div className="motion-engine">
        <div className="motion-logo"><Image src="/images/wangai-icon.png" alt="WANGAI" width={48} height={48} /><span /></div>
        <span key={step}>{listening ? "กำลังฟัง" : processing ? "กำลังแปล" : "แปลแล้ว"}</span>
      </div>
      <div className="motion-transfer motion-transfer-out" aria-hidden="true"><i /></div>
      <div className={`motion-output ${ready ? "is-ready" : ""}`} aria-live="polite" aria-atomic="true">
        <span className="motion-label">{reply ? "ประโยคอังกฤษที่ใช้ตอบ" : "คำแปลไทยบนจอ"}<b>{reply ? "EN" : "TH"}</b></span>
        {ready ? <p key={reply ? "reply" : "incoming"} lang={reply ? "en" : "th"}>
          {text.split(" ").map((word, i) => <span key={i} style={{ "--word-delay": `${i * 85}ms` } as CSSProperties}>{word}{" "}</span>)}
        </p> : <div className="motion-placeholder" aria-label={listening ? "รอรับเสียง" : "กำลังแปล"}><span /><span /></div>}
        <span className="motion-result-status">{ready ? <><Check size={13} />{reply ? "อ่านแล้วพูดตอบได้" : "อ่านคำแปลได้เลย"}</> : <><MessageSquare size={13} />{listening ? "รอให้พูดจบ" : "กำลังแปลเป็นไทย"}</>}</span>
      </div>
    </div>
  );
}
