import Link from "next/link";
import { ArrowLeft, ArrowUpRight } from "lucide-react";
import { Brand } from "@/components/ui/Brand";
import type { ReactNode } from "react";

export function LegalLayout({ title, intro, summary, sections, children, current }: {
  title: string; intro: string; summary: ReactNode; children: ReactNode;
  sections: { id: string; title: string }[]; current: "privacy" | "terms";
}) {
  return <div className="legal-page">
    <a className="skip-link" href="#legal-content">ข้ามไปเนื้อหา</a>
    <header className="legal-header section-wrap">
      <Link href="/" aria-label="WANGAI หน้าหลัก"><Brand /></Link>
      <Link href="/" className="legal-back"><ArrowLeft size={16} />กลับหน้าหลัก</Link>
    </header>
    <main className="legal-shell" id="legal-content">
      <div className="legal-heading"><p className="eyebrow">WANGAI · ว่าไง</p><h1>{title}</h1><p>{intro}</p><span className="legal-date">ปรับปรุงล่าสุด 3 ตุลาคม 2569</span></div>
      <div className="legal-grid">
        <aside className="legal-sidebar"><nav aria-label="สารบัญ"><p>ในหน้านี้</p>{sections.map((section, index) => <a key={section.id} href={`#${section.id}`}><span>{String(index + 1).padStart(2, "0")}</span>{section.title}</a>)}</nav></aside>
        <article className="legal-article"><div className="legal-summary"><span>อ่านก่อนเริ่มใช้งาน</span>{summary}</div>{children}<section id="contact"><h2>ติดต่อผู้พัฒนา</h2><p>ผู้พัฒนา WANGAI ดูแลเว็บไซต์และโปรแกรมว่าไง ช่องทางอีเมลสำหรับสอบถามและส่งคำขอเกี่ยวกับข้อมูลส่วนบุคคลจะอัปเดตในหน้านี้</p><div className="legal-contact">กำลังอัปเดตอีเมลติดต่อ</div></section></article>
      </div>
    </main>
    <footer className="site-footer section-wrap legal-footer"><Link href="/">กลับไปลองว่าไง <ArrowUpRight size={14} /></Link><nav aria-label="ข้อมูลทางกฎหมาย"><Link href="/privacy" aria-current={current === "privacy" ? "page" : undefined}>นโยบายความเป็นส่วนตัว</Link><Link href="/terms" aria-current={current === "terms" ? "page" : undefined}>เงื่อนไขการใช้งาน</Link></nav></footer>
  </div>;
}
