import { ArrowUpRight, MonitorDown } from "lucide-react";
import { site } from "@/config/site";

export function DownloadLink({ compact = false }: { compact?: boolean }) {
  return (
    <a
      className={`button ${compact ? "button-small" : "button-primary"}`}
      href={site.releases}
    >
      <MonitorDown size={18} aria-hidden="true" />
      <span>{compact ? "ดาวน์โหลด" : "ดาวน์โหลดสำหรับ Windows"}</span>
      <ArrowUpRight size={16} aria-hidden="true" />
    </a>
  );
}
