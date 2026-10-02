import {
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
              <span className="hero-app-name">ว่าไง</span> AI แปลเสียงพูด
              <br />
              ระหว่างเล่นเกม
            </h1>
            <div className="hero-actions">
              <DownloadLink />
            </div>
            <p className="platform-note">Windows 10 / 11</p>
          </div>
          <TranslationDemo />
        </section>
        <section
          className="product-intro section-wrap"
          aria-labelledby="product-title"
        >
          <p className="eyebrow">ฟังและตอบกลับ</p>
          <h2 id="product-title">
            รู้ว่าเพื่อนพูดอะไร
            <br />
            <span className="muted-heading">รู้ว่าจะตอบยังไง</span>
          </h2>
          <p>
            ฟังเพื่อนพูดอังกฤษ อ่านคำแปลไทยบนจอ
            <br />
            พูดไทยเพื่อดูประโยคอังกฤษที่ใช้ตอบกลับ
          </p>
        </section>
        <section
          className="feature-story section-wrap"
          aria-labelledby="listen-title"
        >
          <div className="story-copy">
            <p className="eyebrow">
              <span>01</span> เลือกแหล่งเสียง
            </p>
            <h2 id="listen-title">
              เลือกแอป
              <br />
              <span className="accent">ที่ต้องการแปลเสียง</span>
            </h2>
            <p>
              เลือกเสียงจากเกม Discord หรือเบราว์เซอร์
              ว่าไงจะฟังเฉพาะแอปที่คุณเลือก
            </p>
            <div className="story-detail">
              <Headphones size={18} aria-hidden="true" />
              <span>เลือกฟังได้ครั้งละหนึ่งแอป</span>
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
              <span>เริ่มฟังเสียง</span>
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
              <span>ตอบเป็นอังกฤษว่าอะไร</span>
              <span>อ่านแล้วพูดตามได้</span>
            </div>
          </div>
          <div className="story-copy">
            <p className="eyebrow">
              <span>02</span> แปลคำตอบเป็นอังกฤษ
            </p>
            <h2 id="reply-title">
              อยากตอบอะไร
              <br />
              <span className="accent">ลองพูดเป็นไทย</span>
            </h2>
            <p>พูดสิ่งที่อยากบอกเป็นไทย ว่าไงจะแปลเป็นประโยคอังกฤษให้ดู</p>
            <p className="story-note">อ่านแล้วพูดตอบเอง หรือคัดลอกไปส่งในแชต</p>
            <a className="text-link" href="#demo">
              ดูตัวอย่างการแปล <ArrowUpRight size={17} aria-hidden="true" />
            </a>
          </div>
        </section>
        <section className="setup section-wrap" aria-labelledby="setup-title">
          <div className="setup-heading">
            <p className="eyebrow">เริ่มใช้งาน</p>
            <h2 id="setup-title">ตั้งค่าก่อนเล่น</h2>
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
              <h3>เปิดหน้าต่างคำแปล</h3>
              <p>ใช้เกมในโหมด Borderless หรือ Windowed เพื่ออ่านซับบนจอ</p>
            </li>
          </ol>
        </section>
        <section className="faq section-wrap" aria-labelledby="faq-title">
          <div>
            <h2 id="faq-title">
              คำถาม
              <br />
              <span className="muted-heading">ที่พบบ่อย</span>
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
            แปลเสียงพูด
            <br />
            <span className="accent">ระหว่างเล่นเกม</span>
          </h2>
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
