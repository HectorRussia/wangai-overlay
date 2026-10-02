import { ArrowUpRight } from "lucide-react";
import { Brand } from "@/components/ui/Brand";
import { DownloadLink } from "@/components/ui/DownloadLink";
import { site } from "@/config/site";
import { MobileMenu } from "./MobileMenu";

export function Header() {
  return (
    <header className="site-header">
      <a href="#" aria-label="WANGAI หน้าแรก">
        <Brand />
      </a>
      <nav aria-label="เมนูหลัก" className="desktop-nav">
        <a href="#features">ทำอะไรได้บ้าง</a>
        <a href="#how-it-works">เริ่มใช้งาน</a>
        <a href="#faq">คำถามที่พบบ่อย</a>
      </nav>
      <div className="header-actions">
        <a className="github-link" href={site.repository}>
          GitHub <ArrowUpRight size={13} aria-hidden="true" />
        </a>
        <DownloadLink compact />
      </div>
      <MobileMenu />
    </header>
  );
}
