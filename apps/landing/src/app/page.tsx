import {
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  AudioLines,
  Headphones,
  Layers2,
  Mic,
  Plus,
  Sparkles,
  Gamepad2,
  MessageCircle,
  Monitor,
  Check,
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
          <div className="hero-eyebrow">
            <AudioLines size={14} aria-hidden="true" />
            <span>เพื่อนร่วมทีมคนใหม่ ที่ช่วยให้เข้าใจกันมากขึ้น</span>
          </div>
          <h1 id="hero-title">
            ต่างภาษา
            <span className="hero-line">
              ก็<span className="accent">ทีมเดียวกัน</span>ได้
              <span className="hero-period">.</span>
            </span>
          </h1>
          <p className="hero-copy">
            ฟังอังกฤษเป็นซับไทย พูดไทยตอบเป็นอังกฤษ
            <br />
            ให้ WANGAI ช่วยแปล แล้วคุณโฟกัสกับสิ่งตรงหน้า
          </p>
          <div className="hero-actions">
            <DownloadLink />
            <a href="#demo" className="text-link">
              ดูการทำงาน <ArrowDown size={16} aria-hidden="true" />
            </a>
          </div>
          <p className="platform-note">
            สำหรับ Windows 10 / 11 · เลือกรุ่นดาวน์โหลดบน GitHub
          </p>
        </section>
        <TranslationDemo />
        <section
          id="features"
          className="features section-wrap"
          aria-labelledby="features-title"
        >
          <div className="section-heading">
            <p className="eyebrow">LESS TRANSLATING. MORE CONNECTING.</p>
            <h2 id="features-title">
              กำแพงภาษาเล็กลง
              <br />
              <span className="muted-heading">โลกของคุณก็ใหญ่ขึ้น</span>
            </h2>
            <p>
              เล่นเกม คุยกับเพื่อน หรือเรียนรู้เรื่องใหม่
              <br />
              ไม่ต้องหยุดทุกครั้งที่เจอคำที่ไม่เข้าใจ
            </p>
          </div>
          <div className="feature-columns">
            <article>
              <Headphones aria-hidden="true" />
              <span className="feature-index">01 / LISTEN</span>
              <h3>เขาพูด คุณเข้าใจ</h3>
              <p>
                แปลเสียงอังกฤษเป็นข้อความไทย
                <br />
                จากแอปที่เลือก เมื่อพูดจบวลี
              </p>
              <span className="feature-detail">
                อังกฤษ <ArrowRight size={14} /> ไทย
              </span>
            </article>
            <article>
              <Mic aria-hidden="true" />
              <span className="feature-index">02 / REPLY</span>
              <h3>คิดเป็นไทย ตอบเป็นอังกฤษ</h3>
              <p>
                พูดสิ่งที่อยากบอกเป็นภาษาไทย
                <br />
                ได้ข้อความอังกฤษ พร้อมคัดลอกไปใช้
              </p>
              <span className="feature-detail">
                ไทย <ArrowRight size={14} /> อังกฤษ
              </span>
            </article>
            <article>
              <Layers2 aria-hidden="true" />
              <span className="feature-index">03 / STAY IN THE FLOW</span>
              <h3>อยู่ตรงนั้น ไม่ขัดจังหวะ</h3>
              <p>
                ซับอยู่บนหน้าจอที่คุณกำลังใช้
                <br />
                ย้ายและปรับขนาด overlay ได้ตามถนัด
              </p>
              <span className="feature-detail">Borderless / Windowed</span>
            </article>
          </div>
        </section>
        <section
          id="how-it-works"
          className="workflow section-wrap"
          aria-labelledby="workflow-title"
        >
          <div className="workflow-copy">
            <p className="eyebrow">READY WHEN YOU ARE</p>
            <h2 id="workflow-title">
              ตั้งค่านิดเดียว
              <br />
              <span className="muted-heading">แล้วคุยกันต่อเลย</span>
            </h2>
            <ol className="steps">
              <li>
                <span>01</span>
                <div>
                  <h3>เปิดแอปที่อยากเข้าใจ</h3>
                  <p>
                    เลือกเกม Discord หรือเบราว์เซอร์
                    <br />
                    เป็นแหล่งเสียงที่ให้ WANGAI ฟัง
                  </p>
                </div>
              </li>
              <li>
                <span>02</span>
                <div>
                  <h3>เริ่มฟัง พร้อมอ่านซับไทย</h3>
                  <p>
                    ข้อความต้นฉบับและคำแปลไทย
                    <br />
                    จะปรากฏบน overlay เมื่อจบวลี
                  </p>
                </div>
              </li>
              <li>
                <span>03</span>
                <div>
                  <h3>ถึงตาคุณ ก็พูดได้เลย</h3>
                  <p>
                    พูดไทยให้เป็นข้อความอังกฤษ
                    <br />
                    แล้วคัดลอกคำตอบไปวางในแชต
                  </p>
                </div>
              </li>
            </ol>
            <a className="text-link" href={site.guide}>
              อ่านคู่มือการใช้งาน <ArrowUpRight size={16} aria-hidden="true" />
            </a>
          </div>
          <div className="product-visual">
            <div className="product-visual-header">
              <Brand />
              <span>YOUR LITTLE LANGUAGE COMPANION</span>
            </div>
            <div className="source-window">
              <div className="source-window-top">
                <span>แหล่งเสียงของคุณ</span>
                <Headphones size={17} aria-hidden="true" />
              </div>
              <p>อยากเข้าใจบทสนทนาไหน?</p>
              <ul className="source-options">
                <li className="source-selected">
                  <Gamepad2 size={23} aria-hidden="true" />
                  <div>
                    <strong>เกมที่กำลังเล่น</strong>
                    <span>ฟังเพื่อนร่วมทีม เข้าใจแผนไปด้วยกัน</span>
                  </div>
                  <Check size={17} aria-hidden="true" />
                </li>
                <li>
                  <MessageCircle size={23} aria-hidden="true" />
                  <div>
                    <strong>Discord</strong>
                    <span>คุยกับเพื่อนได้มากกว่าเดิม</span>
                  </div>
                </li>
                <li>
                  <Monitor size={23} aria-hidden="true" />
                  <div>
                    <strong>เบราว์เซอร์</strong>
                    <span>ตามทันเรื่องที่คุณสนใจ</span>
                  </div>
                </li>
              </ul>
              <div className="source-window-footer">
                <span className="status-dot" /> เลือกฟังทีละแอป ในแบบของคุณ
              </div>
            </div>
            <p className="source-caption">ภาพจำลองการเลือกแหล่งเสียง</p>
          </div>
        </section>
        <section
          id="faq"
          className="faq section-wrap"
          aria-labelledby="faq-title"
        >
          <div>
            <p className="eyebrow">A FEW THINGS TO KNOW</p>
            <h2 id="faq-title">
              ก่อนเริ่ม
              <br />
              <span className="muted-heading">คุยกัน</span>
              <span className="accent">.</span>
            </h2>
            <a className="text-link" href={`${site.repository}/issues`}>
              มีคำถามอื่น? คุยกับเรา{" "}
              <ArrowUpRight size={16} aria-hidden="true" />
            </a>
          </div>
          <div className="faq-list">
            {faqs.map((faq) => (
              <details key={faq.question}>
                <summary>
                  {faq.question}
                  <Plus size={18} aria-hidden="true" />
                </summary>
                <p>{faq.answer}</p>
              </details>
            ))}
          </div>
        </section>
        <section className="final-cta" id="download">
          <span className="cta-icon">
            <Sparkles size={26} aria-hidden="true" />
          </span>
          <p className="eyebrow">SAME TEAM. ANY LANGUAGE.</p>
          <h2>
            บทสนทนาดี ๆ<br />
            เริ่มที่ความเข้าใจ<span className="accent">.</span>
          </h2>
          <p>ให้ภาษาเป็นเรื่องของ WANGAI</p>
          <DownloadLink />
          <span className="platform-note">
            Windows 10 / 11 x64 · ต้องเชื่อมต่ออินเทอร์เน็ตเพื่อแปล
          </span>
        </section>
      </main>
      <footer className="site-footer section-wrap">
        <div>
          <a href="#" aria-label="กลับด้านบน">
            <Brand />
          </a>
          <p>เข้าใจกันมากขึ้น ทีละบทสนทนา</p>
        </div>
        <nav aria-label="ลิงก์เพิ่มเติม">
          <a href={site.guide}>คู่มือการใช้งาน</a>
          <a href={site.releases}>รุ่นดาวน์โหลด</a>
          <a href={site.repository}>
            GitHub <ArrowUpRight size={14} aria-hidden="true" />
          </a>
        </nav>
        <span className="footer-note">Made for conversations.</span>
      </footer>
    </>
  );
}
