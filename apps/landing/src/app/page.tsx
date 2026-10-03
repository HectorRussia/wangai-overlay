import {
  ArrowRight,
  AudioLines,
  Check,
  Gamepad2,
  Headphones,
  MessageCircle,
  Monitor,
  Plus,
} from "lucide-react";
import { Header } from "@/components/layout/Header";
import { Brand } from "@/components/ui/Brand";
import { DownloadLink } from "@/components/ui/DownloadLink";
import { TranslationDemo } from "@/components/sections/TranslationDemo";
import { faqs } from "@/content/home";
import Link from "next/link";
import { FloatingConversations } from "@/components/sections/FloatingConversations";
import { AnimatedAppName } from "@/components/ui/AnimatedAppName";
import { ProductStructuredData } from "@/components/sections/ProductStructuredData";
import { pageMetadata } from "@/config/seo";
import { site } from "@/config/site";

const homeMetadata = pageMetadata("/", site.title, site.description);
export const metadata = { ...homeMetadata, alternates: { ...homeMetadata.alternates, types: { "text/markdown": "/index.md" } } };

export default function Home() {
  return (
    <>
      <ProductStructuredData />
      <a href="#main" className="skip-link">
        ข้ามไปเนื้อหา
      </a>
      <Header />
      <main id="main">
        <section className="hero" aria-labelledby="hero-title">
          <div className="hero-intro">
            <h1 id="hero-title">
              <AnimatedAppName /> AI แปลเสียงพูด
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
        <FloatingConversations />
        <section
          className="feature-story section-wrap"
          aria-labelledby="listen-title"
        >
          <div className="story-copy">
            <p className="eyebrow">
              เลือกแหล่งเสียง
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
        <section className="faq section-wrap" aria-labelledby="faq-title">
          <div>
            <h2 id="faq-title">
              คำถาม
              <br />
              <span className="muted-heading">ที่พบบ่อย</span>
            </h2>
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
          <div className="closing-copy">
            <h2>ลองใช้<span className="accent">ว่าไง</span></h2>
            <p>ให้ว่าไงช่วยแปล ตอนเล่นเกมกับเพื่อน</p>
          </div>
          <div className="closing-action">
            <DownloadLink />
            <span className="platform-note">Windows 10 / 11 x64</span>
          </div>
        </section>
      </main>
      <footer className="site-footer section-wrap">
        <a href="#" aria-label="กลับด้านบน">
          <Brand />
        </a>
        <nav aria-label="ข้อมูลทางกฎหมาย">
          <Link href="/privacy">นโยบายความเป็นส่วนตัว</Link>
          <Link href="/terms">เงื่อนไขการใช้งาน</Link>
        </nav>
      </footer>
    </>
  );
}
