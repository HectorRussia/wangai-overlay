"use client";

import Image from "next/image";
import { useState } from "react";
import {
  ArrowRight,
  AudioLines,
  Check,
  Copy,
  Gamepad2,
  Headphones,
  MessageCircle,
  Mic,
  Play,
} from "lucide-react";
import { scenarios } from "@/content/home";

const icons = [Gamepad2, MessageCircle, Play];

export function TranslationDemo() {
  const [selected, setSelected] = useState(0);
  const [reply, setReply] = useState(false);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "error">(
    "idle",
  );
  const example = scenarios[selected];

  async function copyReply() {
    try {
      await navigator.clipboard.writeText(example.translatedReply);
      setCopyState("copied");
    } catch {
      setCopyState("error");
    }
  }

  return (
    <div
      className="demo-section"
      id="demo"
      role="region"
      aria-label="ตัวอย่างการแปลด้วยข้อความจำลอง"
    >
      <div className="demo-toolbar">
        <span className="demo-label">
          <AudioLines size={17} aria-hidden="true" /> ดูว่าไงทำงาน
        </span>
        <div
          className="scenario-picker"
          role="group"
          aria-label="เลือกสถานการณ์"
        >
          {scenarios.map((scenario, index) => {
            const Icon = icons[index];
            return (
              <button
                key={scenario.id}
                aria-pressed={selected === index}
                onClick={() => {
                  setSelected(index);
                  setReply(false);
                  setCopyState("idle");
                }}
              >
                <Icon size={15} aria-hidden="true" />
                {scenario.label}
              </button>
            );
          })}
        </div>
      </div>
      <div className={`demo-stage ${reply ? "is-reply" : ""}`}>
        <Image
          className="game-scene"
          src="/images/wangai-game-scene.webp"
          alt="ฉากเกมจำลอง นักสำรวจในโรงเก็บยานมืดที่เปิดออกสู่ภูเขา"
          fill
          sizes="(max-width: 768px) 100vw, (max-width: 1400px) 90vw, 1240px"
          preload
        />
        <div className="scene-shade" />
        <div className="stage-topline">
          <span>
            <span className="status-dot" /> WANGAI OVERLAY
          </span>
          <span>ภาพประกอบการใช้งาน</span>
        </div>
        <div
          className="demo-content"
          aria-live="polite"
          aria-atomic="true"
          key={`${example.id}-${reply}`}
        >
          <div className="source-voice">
            <span className="voice-avatar">
              {reply ? (
                <Mic size={20} aria-hidden="true" />
              ) : (
                <Headphones size={20} aria-hidden="true" />
              )}
            </span>
            <div>
              <p className="micro-label">
                {reply ? "เสียงของคุณ · ภาษาไทย" : example.person}
              </p>
              <p className="source-quote" lang={reply ? "th" : "en"}>
                {reply ? example.reply : example.english}
              </p>
            </div>
            <div className="waveform" aria-hidden="true">
              {Array.from({ length: 11 }, (_, i) => (
                <i
                  key={i}
                  style={{
                    height: `${9 + ((i * 13 + 7) % 22)}px`,
                    animationDelay: `${i * 60}ms`,
                  }}
                />
              ))}
            </div>
          </div>
          <div className="overlay-preview">
            <div className="overlay-top">
              <span>
                <AudioLines size={16} aria-hidden="true" /> ว่าไง
              </span>
              <span>
                {reply ? "ไทย" : "อังกฤษ"}{" "}
                <ArrowRight size={12} aria-hidden="true" />{" "}
                {reply ? "อังกฤษ" : "ไทย"}
              </span>
            </div>
            <p className="translated-quote" lang={reply ? "en" : "th"}>
              {reply ? example.translatedReply : example.thai}
            </p>
            <div className="overlay-bottom">
              <span>
                <span className="status-dot" />{" "}
                {reply ? "ข้อความอังกฤษสำหรับตอบกลับ" : "แสดงคำแปลเมื่อจบวลี"}
              </span>
              {reply && (
                <button onClick={copyReply}>
                  {copyState === "copied" ? (
                    <Check size={14} aria-hidden="true" />
                  ) : (
                    <Copy size={14} aria-hidden="true" />
                  )}
                  {copyState === "copied" ? "คัดลอกแล้ว" : "คัดลอกตัวอย่าง"}
                </button>
              )}
            </div>
            {copyState === "error" && reply && (
              <p className="copy-error" role="status">
                คัดลอกไม่สำเร็จ เลือกข้อความด้านบนเพื่อคัดลอกได้
              </p>
            )}
          </div>
        </div>
        <div className="stage-bottomline">
          <span>
            {reply
              ? "คัดลอกข้อความ แล้ววางในแชตด้วยตัวเอง"
              : "อ่านคำแปลบนจอ ระหว่างที่เล่นเกม"}
          </span>
          <span>{example.source}</span>
        </div>
      </div>
      <div className="demo-controls">
        <p>
          ลองสลับดูทั้งสองฝั่ง <ArrowRight size={15} aria-hidden="true" />
        </p>
        <div role="group" aria-label="โหมดตัวอย่างการแปล">
          <button
            aria-pressed={!reply}
            onClick={() => {
              setReply(false);
              setCopyState("idle");
            }}
          >
            <Headphones size={16} aria-hidden="true" />
            ฟังอังกฤษ → อ่านไทย
          </button>
          <button
            aria-pressed={reply}
            onClick={() => {
              setReply(true);
              setCopyState("idle");
            }}
          >
            <Mic size={16} aria-hidden="true" />
            พูดไทย → ข้อความอังกฤษ
          </button>
        </div>
      </div>
      <p className="demo-caption">
        ตัวอย่างด้วยข้อความจำลอง · ภาพเกมประกอบ
        ไม่ได้บันทึกเสียงจากเบราว์เซอร์ของคุณ
      </p>
    </div>
  );
}
