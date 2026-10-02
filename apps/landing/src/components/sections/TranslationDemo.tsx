"use client";

import { useState } from "react";
import {
  ArrowRight,
  AudioLines,
  Gamepad2,
  Headphones,
  Languages,
  MessageCircle,
  Mic,
  Play,
  RotateCcw,
} from "lucide-react";
import { scenarios } from "@/content/home";

const icons = [Gamepad2, MessageCircle, Play];

export function TranslationDemo() {
  const [selected, setSelected] = useState(0);
  const [reply, setReply] = useState(false);
  const example = scenarios[selected];

  return (
    <section
      className="demo-section"
      id="demo"
      aria-label="ทดลองดูตัวอย่างการแปล"
    >
      <div className="scenario-picker" role="group" aria-label="เลือกสถานการณ์">
        {scenarios.map((scenario, index) => {
          const Icon = icons[index];
          return (
            <button
              key={scenario.id}
              aria-pressed={selected === index}
              onClick={() => {
                setSelected(index);
                setReply(false);
              }}
            >
              <Icon size={16} aria-hidden="true" />
              {scenario.label}
            </button>
          );
        })}
      </div>
      <div className="demo-stage">
        <div className="stage-topline">
          <span>
            <span className="status-dot" /> WANGAI OVERLAY
          </span>
          <span>
            EN <ArrowRight size={12} /> TH
          </span>
        </div>
        <div className="demo-content" aria-live="polite" aria-atomic="true">
          <div className="source-voice" key={`${example.id}-${reply}-source`}>
            <span className="voice-avatar">
              {reply ? <Mic size={26} /> : <Headphones size={26} />}
            </span>
            <p className="micro-label">
              {reply ? "YOUR VOICE · ภาษาไทย" : example.person}
            </p>
            <p className="source-quote" lang={reply ? "th" : "en"}>
              “{reply ? example.reply : example.english}”
            </p>
            <div className="waveform" aria-hidden="true">
              {Array.from({ length: 35 }, (_, i) => (
                <i
                  key={i}
                  style={{
                    height: `${8 + ((i * 17 + 7) % 31)}px`,
                    animationDelay: `${i * 45}ms`,
                  }}
                />
              ))}
            </div>
          </div>
          <div className="translation-path" aria-hidden="true">
            <span />
            <Languages size={20} />
            <span />
          </div>
          <div
            className="overlay-preview"
            key={`${example.id}-${reply}-result`}
          >
            <div className="overlay-top">
              <span className="mini-wordmark">
                w<span>↗</span>
              </span>
              <span>{example.source}</span>
              <AudioLines size={16} />
            </div>
            <p className="micro-label">
              {reply ? "คำตอบของคุณ · TH → EN" : "เพื่อนกำลังบอกว่า"}
            </p>
            <p className="translated-quote" lang={reply ? "en" : "th"}>
              {reply ? example.translatedReply : example.thai}
            </p>
            <div className="overlay-bottom">
              <span>
                <span className="status-dot" />{" "}
                {reply ? "พร้อมคัดลอกไปตอบกลับ" : "แปลเมื่อจบวลี"}
              </span>
              <span>WANGAI</span>
            </div>
          </div>
        </div>
        <div className="stage-bottomline">
          <span>คุยต่อได้ ไม่ต้องสลับหน้าจอ</span>
          <button aria-pressed={reply} onClick={() => setReply(!reply)}>
            {reply ? <RotateCcw size={14} /> : <Mic size={14} />}
            {reply ? "กลับไปฟังเพื่อน" : "ลองดูตอนพูดตอบกลับ"}
            <ArrowRight size={14} />
          </button>
        </div>
      </div>
      <p className="demo-caption">
        <span className="caption-rule" /> ตัวอย่างการทำงานด้วยข้อความจำลอง{" "}
        <span className="caption-rule" />
      </p>
    </section>
  );
}
