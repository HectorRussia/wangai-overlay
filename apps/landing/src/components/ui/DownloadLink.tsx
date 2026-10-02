import { ArrowDownToLine, ArrowUpRight } from "lucide-react";
import { site } from "@/config/site";
export function DownloadLink({ compact = false }: { compact?: boolean }) {
  return (
    <a
      className={`button ${compact ? "button-small" : "button-primary"}`}
      href={site.releases}
    >
      <ArrowDownToLine size={17} aria-hidden="true" />
      <span>{compact ? "ดาวน์โหลด" : "ดาวน์โหลดสำหรับ Windows"}</span>
      {!compact && <ArrowUpRight size={17} aria-hidden="true" />}
    </a>
  );
}
