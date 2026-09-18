import { ExternalLink, Headphones, History, PanelLeftClose, PanelLeftOpen, Power, Settings } from "lucide-react";
import { GlassSurface } from "./GlassSurface";
import { advancedHref, settingsHref, type SettingsTab } from "./router";
import { version } from "../package.json";

type Props = { activeTab: SettingsTab; collapsed: boolean; onCollapse: () => void; onWeb?: () => void; onQuit?: () => void; webRuntime: boolean };
export function AppSidebar({ activeTab, collapsed, onCollapse, onWeb, onQuit, webRuntime }: Props) {
  return <aside className={`app-sidebar ${collapsed ? "is-collapsed" : ""}`} aria-label="แถบด้านข้าง">
    <GlassSurface className="sidebar-surface">
      <a className="sidebar-brand" href={settingsHref("overview")} aria-label="WANGAI Ready Room"><span>WANGAI</span><Headphones className="sidebar-brand-icon" /></a>
      <nav aria-label="เมนูหลัก">
        <a href={settingsHref("overview")} aria-label="Ready Room" aria-current={activeTab === "overview" ? "page" : undefined} title="Ready Room"><Headphones /><span>Ready Room</span></a>
        <a href={settingsHref("history")} aria-label="ประวัติ" aria-current={activeTab === "history" ? "page" : undefined} title="ประวัติ"><History /><span>ประวัติ</span></a>
        <a href={advancedHref("audio")} aria-label="การตั้งค่าขั้นสูง" aria-current={activeTab === "advanced" ? "page" : undefined} title="การตั้งค่า"><Settings /><span>การตั้งค่า</span></a>
      </nav>
      <div className="sidebar-bottom">
        {onWeb && <button onClick={onWeb} aria-label="เปิด Web App" title="เปิด Web App"><ExternalLink /><span>เปิด Web App</span></button>}
        {webRuntime && <p className="sidebar-web-label">Web Companion</p>}
        {onQuit && <button onClick={onQuit} aria-label="ออกจากโปรแกรม" title="ออกจากโปรแกรม"><Power /><span>ออกจากโปรแกรม</span></button>}
        <div className="sidebar-version"><small>{version} Preview</small><button className="sidebar-collapse" aria-label={collapsed ? "ขยาย Sidebar" : "ย่อ Sidebar"} aria-expanded={!collapsed} onClick={onCollapse}>{collapsed ? <PanelLeftOpen /> : <PanelLeftClose />}</button></div>
      </div>
    </GlassSurface>
  </aside>;
}
