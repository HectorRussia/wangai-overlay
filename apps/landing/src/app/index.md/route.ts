import { site } from "@/config/site";
import { siteOrigin } from "@/config/seo";
import { faqs } from "@/content/home";

export const dynamic = "force-static";

export function GET() {
  const content = `# ${site.title}

${site.description}

## คำถามที่พบบ่อย

${faqs.map((faq) => `### ${faq.question}\n\n${faq.answer}`).join("\n\n")}

## ดาวน์โหลดและข้อมูลเพิ่มเติม

- [ดาวน์โหลดสำหรับ Windows](${site.releases})
- [นโยบายความเป็นส่วนตัว](${siteOrigin}/privacy)
- [เงื่อนไขการใช้งาน](${siteOrigin}/terms)

เดโมบนเว็บไซต์ใช้ภาพและบทสนทนาจำลอง ความเร็วจริงขึ้นอยู่กับเครือข่ายและบริการ AI หน้าเว็บไม่รับเสียงหรือแปลเสียงจริง และปุ่มเข้าสู่ระบบยังเป็นตัวอย่าง
`;
  return new Response(content, { headers: { "Content-Type": "text/markdown; charset=utf-8", "Link": '</llms.txt>; rel="describedby"; type="text/plain"' } });
}
