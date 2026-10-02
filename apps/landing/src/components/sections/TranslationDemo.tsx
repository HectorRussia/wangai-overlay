"use client";

import Image from "next/image";
import { gameScenes } from "@/content/gameScenes";
import { ProductOverlayPreview } from "./ProductOverlayPreview";
import { useEffect, useState } from "react";
import {
  ArrowRight,
  Headphones,
  Mic,
  Pause,
  Play,
  RotateCcw,
  Volume2,
} from "lucide-react";

const steps = [
  {
    title: "รับเสียง",
    detail: "เพื่อนพูดในเกม → WANGAI รับเสียงจากเกม",
    quote: "Stay together. I'll cover you.",
  },
  {
    title: "ถอดเสียงและแปล",
    detail: "เมื่อจบวลี AI ถอดเสียงเป็นข้อความ แล้วแปลเป็นไทย",
    quote: "Stay together. I'll cover you.",
  },
  {
    title: "อ่านซับไทย",
    detail: "เสียงอังกฤษจากเพื่อน → คำแปลไทยใน WANGAI",
    quote: "อยู่ด้วยกันไว้ เดี๋ยวฉันคุ้มกันให้",
  },
  {
    title: "พูดสิ่งที่อยากตอบ",
    detail: "พูดสิ่งที่อยากตอบผ่านไมโครโฟนของคุณ",
    quote: "โอเค ฉันจะตามไป",
  },
  {
    title: "ดูคำตอบอังกฤษ",
    detail: "ดูว่าสิ่งที่คุณอยากบอก ตอบเป็นอังกฤษว่าอะไร",
    quote: "Okay, I'll follow you.",
  },
  {
    title: "คัดลอกไปตอบ",
    detail: "คุณคัดลอกคำแปล ไปวางและกดส่งในแชตเอง",
    quote: "Okay, I'll follow you.",
  },
];

export function TranslationDemo() {
  const scene = gameScenes[0];
  const [step, setStep] = useState(2);
  const [initialPreview, setInitialPreview] = useState(true);
  const [playing, setPlaying] = useState(false);
  const [copied, setCopied] = useState<"idle" | "done" | "error">("idle");
  const current = steps[step];
  const replying = step >= 3;

  useEffect(() => {
    if (!playing) return;
    const timer = window.setTimeout(() => {
      if (step === steps.length - 1) setPlaying(false);
      else setStep(step + 1);
    }, 2600);
    return () => window.clearTimeout(timer);
  }, [step, playing]);

  function selectStep(index: number) {
    setInitialPreview(false);
    setStep(index);
    setPlaying(false);
    setCopied("idle");
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(scene.replyEnglish);
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
            if ((initialPreview || step === 5) && !playing) {
              setInitialPreview(false);
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
        <button aria-pressed={replying} onClick={() => selectStep(4)}>
          <Mic size={17} />
          พูดไทย ดูคำตอบอังกฤษ
        </button>
      </div>
      <div className={`flow-scene scene-${scene.id}`}>
        <Image
          key={scene.id}
          src={`/images/${scene.image}`}
          alt={scene.alt}
          fill
          sizes="(max-width: 768px) 100vw, 1200px"
          className="game-scene"
          preload
        />
        <div className="game-window-label">
          <span /> {scene.label} · Gameplay example
        </div>
        <span className="game-crosshair" aria-hidden="true" />
        <div
          className={`teammate-speech ${playing && step === 0 ? "is-speaking" : ""}`}
        >
          <span className="speech-source">
            <Volume2 size={16} aria-hidden="true" />
            เสียงเพื่อนในเกม <span>EN</span>
          </span>
          <p lang="en">“{scene.english}”</p>
          <span className="speech-bars" aria-hidden="true">
            <i />
            <i />
            <i />
            <i />
            <i />
          </span>
        </div>
        {replying && (
          <div className="player-speech">
            <Mic size={15} aria-hidden="true" />
            <span>คุณพูด: {scene.replyThai}</span>
          </div>
        )}
        <ProductOverlayPreview
          dialogue={scene}
          step={step}
          copied={copied === "done"}
          onCopy={copy}
        />
      </div>
      {replying && step >= 4 ? (
        <div className="reply-answer" aria-live="polite">
          <div>
            <span>คุณอยากบอกว่า</span>
            <p>{scene.replyThai}</p>
          </div>
          <ArrowRight size={20} aria-hidden="true" />
          <div>
            <span>ตอบเป็นอังกฤษว่า</span>
            <p lang="en">{scene.replyEnglish}</p>
          </div>
        </div>
      ) : (
        <p className="flow-explanation" aria-live="polite" aria-atomic="true">
          {current.detail}
        </p>
      )}
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
        หน้าตา overlay อิงจากโปรแกรมจริง · ฉากเกมและบทสนทนาเป็นตัวอย่างประกอบ
      </p>
    </section>
  );
}
