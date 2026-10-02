import {
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  AudioLines,
  Check,
  Gamepad2,
  Headphones,
  MessageCircle,
  Mic,
  Monitor,
  Plus,
} from "lucide-react";
import { Header } from "@/components/layout/Header";
import { Brand } from "@/components/ui/Brand";
import { DownloadLink } from "@/components/ui/DownloadLink";
import { TranslationDemo } from "@/components/sections/TranslationDemo";
import { faqs } from "@/content/home";
import { site } from "@/config/site";

export default function Home() {
  return (
    <>
      <a href="#main" className="skip-link">
        ข้ามไปเนื้อหา
      </a>
      <Header />
      <main id="main">
        <section className="hero" aria-labelledby="hero-title">
          <div className="hero-intro">
            <h1 id="hero-title">
              AI แปลเสียงพูด
              <br />
              <span>ระหว่างเล่นเกม</span>
            </h1>
            <div className="hero-actions">
              <DownloadLink />
              <a href="#demo" className="text-link">
                ดูตัวอย่างการแปล <ArrowDown size={16} aria-hidden="true" />
              </a>
            </div>
            <p className="platform-note">Windows 10 / 11</p>
          </div>
          <TranslationDemo />
        </section>
        <section
          className="product-intro section-wrap"
          aria-labelledby="product-title"
        >
          <p className="eyebrow">เสียงของเขา ความเข้าใจของคุณ</p>
          <h2 id="product-title">
            เล่นต่อได้
            <br />
            <span className="muted-heading">แม้คุยกันคนละภาษา</span>
          </h2>
          <p>
            จากเสียงเพื่อนร่วมทีม สู่คำแปลที่อ่านได้บนหน้าจอ
            <br />
            ให้คุณรู้ว่าเขาพูดอะไร และเตรียมข้อความตอบกลับได้
          </p>
        </section>
        <section
          className="feature-story section-wrap"
          aria-labelledby="listen-title"
        >
          <div className="story-copy">
            <p className="eyebrow">
              <span>01</span> ฟังแล้วเข้าใจ
            </p>
            <h2 id="listen-title">
              เขาพูดอังกฤษ
              <br />
              <span className="accent">คุณอ่านไทย</span>
            </h2>
            <p>
              เลือกแอปที่ต้องการฟัง ว่าไงจะแสดงต้นฉบับและคำแปลไทยบน overlay
              เมื่อพูดจบวลี
            </p>
            <div className="story-detail">
              <Headphones size={18} aria-hidden="true" />
              <span>เลือกฟังเกม Discord หรือเบราว์เซอร์</span>
            </div>
            <div className="story-detail">
              <Monitor size={18} aria-hidden="true" />
              <span>ย้ายและปรับขนาด overlay ได้ตามถนัด</span>
            </div>
          </div>
          <div className="source-visual">
            <div className="visual-topline">
              <AudioLines size={18} aria-hidden="true" />
              <span>เลือกแหล่งเสียง</span>
              <span className="visual-tag">ตัวอย่าง</span>
            </div>
            <div className="source-list">
              <div className="source-selected">
                <Gamepad2 size={25} aria-hidden="true" />
                <div>
                  <strong>เกมที่กำลังเล่น</strong>
                  <span>เสียงสนทนาในเกม</span>
                </div>
                <Check size={18} aria-hidden="true" />
              </div>
              <div>
                <MessageCircle size={25} aria-hidden="true" />
                <div>
                  <strong>Discord</strong>
                  <span>เสียงจากห้องสนทนา</span>
                </div>
              </div>
              <div>
                <Monitor size={25} aria-hidden="true" />
                <div>
                  <strong>เบราว์เซอร์</strong>
                  <span>เสียงวิดีโอและบทสนทนา</span>
                </div>
              </div>
            </div>
            <div className="source-result">
              <span className="status-dot" />
              <span>เลือกฟังครั้งละหนึ่งแอป</span>
              <ArrowRight size={16} aria-hidden="true" />
              <span>ซับไทยบนจอ</span>
            </div>
          </div>
        </section>
        <section
          className="feature-story reply-story section-wrap"
          aria-labelledby="reply-title"
        >
          <div className="reply-visual">
            <div className="visual-topline">
              <Mic size={18} aria-hidden="true" />
              <span>คำตอบของคุณ</span>
              <span className="visual-tag">ตัวอย่าง</span>
            </div>
            <p className="reply-thai">“รอด้วย กำลังตามไป”</p>
            <div className="reply-flow" aria-hidden="true">
              <span />
              TH <ArrowRight size={15} /> EN
              <span />
            </div>
            <p className="reply-english" lang="en">
              Wait for me.
              <br />
              I’m on my way.
            </p>
            <div className="reply-caption">
              <span>ข้อความอังกฤษพร้อมใช้</span>
              <span>คัดลอก → วางในแชต</span>
            </div>
          </div>
          <div className="story-copy">
            <p className="eyebrow">
              <span>02</span> พูดแล้วตอบ
            </p>
            <h2 id="reply-title">
              คิดเป็นไทย
              <br />
              <span className="accent">ตอบเป็นอังกฤษ</span>
            </h2>
            <p>
              พูดสิ่งที่อยากบอกเป็นภาษาไทย
              แล้วรับข้อความอังกฤษสำหรับคัดลอกไปวางในแชตด้วยตัวเอง
            </p>
            <p className="story-note">
              คุณเป็นคนส่งข้อความ ว่าไงช่วยเตรียมคำแปล
            </p>
            <a className="text-link" href="#demo">
              ดูตัวอย่างการแปล <ArrowUpRight size={17} aria-hidden="true" />
            </a>
          </div>
        </section>
        <section className="setup section-wrap" aria-labelledby="setup-title">
          <div className="setup-heading">
            <p className="eyebrow">เริ่มใช้งาน</p>
            <h2 id="setup-title">พร้อมก่อนเข้าเกม</h2>
            <a className="text-link" href={site.guide}>
              อ่านคู่มือ <ArrowUpRight size={16} aria-hidden="true" />
            </a>
          </div>
          <ol className="steps">
            <li>
              <span>01</span>
              <h3>ดาวน์โหลดและตั้งค่า</h3>
              <p>ติดตั้งว่าไงบน Windows แล้วตั้งค่าบริการแปลตามคู่มือ</p>
            </li>
            <li>
              <span>02</span>
              <h3>เลือกแอปที่จะฟัง</h3>
              <p>เลือกเกมหรือแอปที่ใช้คุย แล้วเปิดการฟังเสียง</p>
            </li>
            <li>
              <span>03</span>
              <h3>เปิด overlay แล้วเล่นเลย</h3>
              <p>ใช้เกมในโหมด Borderless หรือ Windowed เพื่ออ่านซับบนจอ</p>
            </li>
          </ol>
        </section>
        <section className="faq section-wrap" aria-labelledby="faq-title">
          <div>
            <p className="eyebrow">คำถามที่พบบ่อย</p>
            <h2 id="faq-title">
              ก่อนกด
              <br />
              <span className="muted-heading">เข้าเกม</span>
            </h2>
            <a className="text-link" href={`${site.repository}/issues`}>
              สอบถามเพิ่มเติม <ArrowUpRight size={16} aria-hidden="true" />
            </a>
          </div>
          <div className="faq-list">
            {faqs.map((faq) => (
              <details key={faq.question}>
                <summary>
                  {faq.question}
                  <Plus size={19} aria-hidden="true" />
                </summary>
                <p>{faq.answer}</p>
              </details>
            ))}
          </div>
        </section>
        <section className="final-cta" id="download">
          <AudioLines className="cta-wave" size={42} aria-hidden="true" />
          <p className="eyebrow">WANGAI FOR WINDOWS</p>
          <h2>
            เกมต่อไป
            <br />
            <span className="accent">เข้าใจกันมากขึ้น</span>
          </h2>
          <p>เริ่มฟังเสียงอังกฤษเป็นซับไทย กับว่าไง</p>
          <DownloadLink />
          <span className="platform-note">
            Windows 10 / 11 x64 · ต้องเชื่อมต่ออินเทอร์เน็ตเพื่อแปล
          </span>
        </section>
      </main>
      <footer className="site-footer section-wrap">
        <a href="#" aria-label="กลับด้านบน">
          <Brand />
        </a>
        <p>AI แปลเสียงพูดระหว่างเล่นเกม</p>
        <nav aria-label="ลิงก์เพิ่มเติม">
          <a href={site.guide}>คู่มือ</a>
          <a href={site.repository}>
            GitHub <ArrowUpRight size={14} aria-hidden="true" />
          </a>
        </nav>
      </footer>
    </>
  );
}
