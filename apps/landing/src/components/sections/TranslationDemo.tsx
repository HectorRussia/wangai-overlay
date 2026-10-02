"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import {
  ArrowRight,
  AudioLines,
  Check,
  Copy,
  Headphones,
  Mic,
  Pause,
  Play,
  RotateCcw,
} from "lucide-react";

const steps = [
  {
    title: "รับเสียง",
    detail: "เพื่อนพูดอังกฤษจากเกมหรือแอปที่คุณเลือก",
    quote: "Stay together. I'll cover you.",
    lang: "en",
    label: "เสียงเพื่อนร่วมทีม",
    icon: Headphones,
  },
  {
    title: "ถอดเสียงและแปล",
    detail: "เมื่อจบวลี AI ถอดเสียงเป็นข้อความ แล้วแปลเป็นไทย",
    quote: "Stay together. I'll cover you.",
    lang: "en",
    label: "WANGAI กำลังแปลเป็นไทย",
    icon: AudioLines,
  },
  {
    title: "อ่านซับไทย",
    detail: "คำแปลปรากฏบน overlay ระหว่างเล่นเกม",
    quote: "อยู่ด้วยกันไว้ เดี๋ยวฉันคุ้มกันให้",
    lang: "th",
    label: "คำแปลบนหน้าจอ",
    icon: Check,
  },
  {
    title: "พูดไทย",
    detail: "พูดสิ่งที่อยากตอบผ่านไมโครโฟนของคุณ",
    quote: "โอเค ฉันจะตามไป",
    lang: "th",
    label: "เสียงของคุณ",
    icon: Mic,
  },
  {
    title: "แปลเป็นข้อความ",
    detail: "ว่าไงเตรียมข้อความอังกฤษจากสิ่งที่คุณพูด",
    quote: "Okay, I'll follow you.",
    lang: "en",
    label: "ข้อความอังกฤษพร้อมใช้",
    icon: AudioLines,
  },
  {
    title: "คัดลอกไปตอบ",
    detail: "คุณคัดลอกคำแปล ไปวางและกดส่งในแชตเอง",
    quote: "Okay, I'll follow you.",
    lang: "en",
    label: "พร้อมให้คุณนำไปวางในแชต",
    icon: Copy,
  },
];

export function TranslationDemo() {
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [copied, setCopied] = useState<"idle" | "done" | "error">("idle");
  const current = steps[step];
  const replying = step >= 3;
  const Icon = current.icon;

  useEffect(() => {
    if (!playing) return;
    const timer = window.setTimeout(() => {
      if (step === steps.length - 1) setPlaying(false);
      else setStep(step + 1);
    }, 2600);
    return () => window.clearTimeout(timer);
  }, [step, playing]);

  function selectStep(index: number) {
    setStep(index);
    setPlaying(false);
    setCopied("idle");
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(steps[5].quote);
      setCopied("done");
    } catch {
      setCopied("error");
    }
  }

  return (
    <section
      className="demo-section flow-demo"
      id="demo"
      aria-label="ตัวอย่างลำดับการแปลเสียงและตอบกลับ"
    >
      <div className="flow-header">
        <div>
          <p className="eyebrow">WANGAI ทำงานอย่างไร</p>
          <h2>
            จากเสียงที่ได้ยิน
            <br className="flow-mobile-break" /> สู่บทสนทนาที่เข้าใจ
          </h2>
        </div>
        <button
          className="flow-play"
          onClick={() => {
            if (step === 5 && !playing) {
              setStep(0);
              setCopied("idle");
            }
            setPlaying(!playing);
          }}
        >
          {playing ? (
            <Pause size={17} />
          ) : step === 5 ? (
            <RotateCcw size={17} />
          ) : (
            <Play size={17} />
          )}
          {playing ? "หยุดชั่วคราว" : step === 5 ? "ดูอีกครั้ง" : "เล่นให้ดู"}
        </button>
      </div>
      <div className="flow-modes" role="group" aria-label="เลือกฝั่งการสนทนา">
        <button aria-pressed={!replying} onClick={() => selectStep(0)}>
          <Headphones size={17} />
          ฟังเพื่อนพูด
        </button>
        <ArrowRight size={16} aria-hidden="true" />
        <button aria-pressed={replying} onClick={() => selectStep(3)}>
          <Mic size={17} />
          เราพูดตอบ
        </button>
      </div>
      <div className="flow-scene">
        <Image
          src="/images/wangai-game-scene.webp"
          alt=""
          fill
          sizes="(max-width: 768px) 100vw, 1200px"
          className="game-scene"
          preload
        />
        <div className="flow-scrim" />
        <span className="flow-scene-label">
          {replying ? "คุณ → ข้อความตอบกลับ" : "เพื่อนร่วมทีม → ซับไทยบนจอ"}
        </span>
        <div className="flow-message" key={step}>
          <div className="flow-message-label">
            <Icon size={20} aria-hidden="true" />
            {current.label}
          </div>
          <div
            className={`flow-wave ${step === 0 || step === 3 ? "has-voice" : ""} ${playing && (step === 0 || step === 3) ? "is-speaking" : ""}`}
            aria-hidden="true"
          >
            {Array.from({ length: 19 }, (_, i) => (
              <i
                key={i}
                style={{
                  height: `${8 + ((i * 17) % 28)}px`,
                  animationDelay: `${i * 55}ms`,
                }}
              />
            ))}
          </div>
          <p className="flow-quote" lang={current.lang}>
            {current.quote}
          </p>
          {step === 1 && (
            <div
              className={`flow-processing ${playing ? "is-processing" : ""}`}
              aria-hidden="true"
            >
              <span />
              <span />
              <span />
            </div>
          )}
          {step === 2 && (
            <p className="flow-original" lang="en">
              Stay together. I’ll cover you.
            </p>
          )}
          {step === 5 && (
            <button className="flow-copy" onClick={copy}>
              {copied === "done" ? <Check size={16} /> : <Copy size={16} />}
              {copied === "done" ? "คัดลอกแล้ว" : "คัดลอกตัวอย่าง"}
            </button>
          )}
        </div>
        <p className="flow-explanation" aria-live="polite" aria-atomic="true">
          {current.detail}
        </p>
      </div>
      <ol
        className="flow-steps"
        aria-label={replying ? "ขั้นตอนตอบกลับ" : "ขั้นตอนฟังคำแปล"}
      >
        {steps.slice(replying ? 3 : 0, replying ? 6 : 3).map((item, i) => {
          const index = i + (replying ? 3 : 0);
          return (
            <li key={index}>
              <button
                aria-current={step === index ? "step" : undefined}
                onClick={() => selectStep(index)}
              >
                <span className="flow-number">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span>{item.title}</span>
                <span className="flow-track" aria-hidden="true">
                  <i
                    className={
                      step === index && playing ? "is-progressing" : ""
                    }
                  />
                </span>
              </button>
            </li>
          );
        })}
      </ol>
      <p className="flow-feedback" role="status">
        {copied === "error"
          ? "คัดลอกไม่สำเร็จ เลือกข้อความอังกฤษด้านบนเพื่อคัดลอกได้"
          : ""}
      </p>
      <p className="demo-caption">
        ตัวอย่างจำลอง · ไม่เปิดไมโครโฟน · คำตอบเป็นข้อความสำหรับนำไปส่งเอง
      </p>
    </section>
  );
}
