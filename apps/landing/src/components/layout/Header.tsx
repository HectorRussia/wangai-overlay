import { Brand } from "@/components/ui/Brand";
import { DownloadLink } from "@/components/ui/DownloadLink";
import { LoginButton } from "@/components/ui/LoginButton";
export function Header() {
  return (
    <header className="site-header">
      <a href="#" aria-label="ว่าไง หน้าแรก">
        <Brand />
      </a>
      <nav aria-label="เมนูหลัก" className="header-actions">
        <DownloadLink compact />
        <LoginButton />
      </nav>
    </header>
  );
}
