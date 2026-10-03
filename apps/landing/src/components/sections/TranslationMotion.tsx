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
    <div className={`translation-motion ${playing ? "is-running" : ""} ${listening ? "is-listening" : ""} ${processing ? "is-processing" : ""}`}>
      <div className="motion-input">
        <span className="motion-label">{reply ? "คุณพูดไทย" : "เสียงเพื่อนในเกม"}</span>
        <div className="motion-audio" aria-hidden="true">
          <span className="motion-audio-icon">{reply ? <Mic size={24} /> : <Headphones size={24} />}</span>
          <div className="motion-wave">
            {Array.from({ length: 13 }, (_, i) => <i key={i} style={{ "--bar": `${10 + (i * 17 % 27)}px`, "--delay": `${i * -0.09}s` } as CSSProperties} />)}
          </div>
        </div>
        <p lang={reply ? "th" : "en"}>{reply ? dialogue.replyThai : dialogue.english}</p>
      </div>
      <div className="motion-transfer" aria-hidden="true"><i /><i /><i /></div>
      <div className="motion-engine">
        <div className="motion-logo"><Image src="/images/wangai-icon.png" alt="WANGAI" width={48} height={48} /><span /></div>
        <span>{listening ? "รับเสียง" : processing ? "แปลภาษา" : "แปลแล้ว"}</span>
      </div>
      <div className="motion-transfer" aria-hidden="true"><i /><i /><i /></div>
      <div className={`motion-output ${ready ? "is-ready" : ""}`} aria-live="polite" aria-atomic="true">
        <span className="motion-label">{reply ? "ประโยคอังกฤษที่ใช้ตอบ" : "คำแปลไทยบนจอ"}{ready ? <Check size={15} /> : <MessageSquare size={15} />}</span>
        {ready ? <p key={reply ? "reply" : "incoming"} lang={reply ? "en" : "th"}>
          {text.split(" ").map((word, i) => <span key={i} style={{ "--word-delay": `${i * 85}ms` } as CSSProperties}>{word}{" "}</span>)}
        </p> : <div className="motion-placeholder" aria-label={listening ? "รอรับเสียง" : "กำลังแปล"}><span /><span /></div>}
      </div>
    </div>
  );
}
