import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

export const alt = "ว่าไง WANGAI — AI แปลเสียงพูดจากเกมและแอปอื่น สำหรับ Windows";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OpenGraphImage() {
  const [font, icon] = await Promise.all([
    readFile(join(process.cwd(), "src/assets/Kanit-Bold.ttf")),
    readFile(join(process.cwd(), "public/images/wangai-icon.png")),
  ]);
  return new ImageResponse(
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", padding: "64px 76px", background: "#0b0c0f", color: "#fbebcf", fontFamily: "Kanit", justifyContent: "space-between" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 22, fontSize: 38 }}>
        {/* ImageResponse requires a native img, not next/image. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`data:image/png;base64,${icon.toString("base64")}`} width={72} height={72} alt="" />
        WANGAI
      </div>
      <div style={{ display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", fontSize: 94, color: "#5ff0bd" }}>ว่าไง</div>
        <div style={{ display: "flex", fontSize: 60 }}>AI แปลเสียงพูด</div>
        <div style={{ display: "flex", fontSize: 36, color: "#b7c0c4", marginTop: 12 }}>จากเกม Discord และแอปอื่น ๆ</div>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 25, color: "#b7c0c4" }}><span>Windows 10 / 11</span><span>wangai.app</span></div>
    </div>,
    { ...size, fonts: [{ name: "Kanit", data: font, weight: 700, style: "normal" }] },
  );
}
