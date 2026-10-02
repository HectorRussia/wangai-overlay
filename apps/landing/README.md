# WANGAI landing page

เว็บไซต์แนะนำ WANGAI ภาษาไทย ใช้ Next.js App Router, React, TypeScript และ Tailwind CSS แยกจาก desktop ไม่เรียก Tauri, ไมโครโฟน หรือบริการ AI จากเว็บไซต์

## Run

ใช้ Node.js 22 ขึ้นไป รันจาก `apps/landing`:

```sh
npm ci
npm run dev
```

เปิด http://127.0.0.1:3000 หรือใช้ `npm run dev -- --port 3100`
ใช้ npm และ package-lock.json แยกจาก root pnpm project

## Check and build

```sh
npm run lint
npm run typecheck
npm run build
npm run start
```

หน้าแรก prerender เป็น static HTML ใช้ Client Components สำหรับเดโมและหน้าต่างเข้าสู่ระบบ FAQ ใช้ native details

## Design

- Dark graphite กับสีมิ้นต์–ฟ้าและครีมจากโลโก้ WANGAI พาดหัวบอกตรง ๆ ว่า AI แปลเสียงพูดระหว่างเล่นเกม
- Hero และฉากเกมพร้อมตัวอย่างซับ → ฟังอังกฤษอ่านไทย → เตรียมข้อความอังกฤษตอบกลับ → เริ่มใช้งาน → FAQ → ดาวน์โหลด
- มุมขวาบนมีเฉพาะดาวน์โหลดและเข้าสู่ระบบ หน้าต่าง Google login เป็น mock ยังไม่มี authentication
- สื่อสารประโยชน์โดยไม่ระบุปุ่มลัด เพราะผู้ใช้ตั้งเองได้
- เดโมระบุว่าเป็นข้อความจำลอง เล่น/หยุดแอนิเมชัน 6 ขั้น เลือกขั้นตอนและคัดลอกข้อความอังกฤษได้ ไม่ขอสิทธิ์ไมโครโฟน
- CTA ดาวน์โหลดไป GitHub Releases ไม่ hardcode เวอร์ชันหรืออ้างราคา/จำนวนผู้ใช้
- ภาพเกมต้นฉบับสร้างด้วย AI และใช้ WebP ดูงานรีเสิช แนวทาง และ prompt ใน [DESIGN.md](DESIGN.md)

## Edit

| Path                                        | Purpose                                               |
| ------------------------------------------- | ----------------------------------------------------- |
| src/app/page.tsx                            | เนื้อหาและ sections                                   |
| src/content/home.ts                         | ตัวอย่างบทสนทนาและ FAQ                                |
| src/config/site.ts                          | Metadata และลิงก์                                     |
| src/styles/globals.css                      | Layout สี responsive และ motion                       |
| src/components/sections/TranslationDemo.tsx | เดโมการฟังและตอบกลับ                                  |
| src/components/ui/LoginButton.tsx           | หน้าต่างเข้าสู่ระบบตัวอย่าง                           |
| public/fonts                                | Kanit, Noto Sans Thai จาก repo พร้อม SIL OFL licenses |
| public/images                               | โลโก้เดิมและภาพเกมประกอบ                              |

Metadata ยังไม่กำหนด canonical URL จนกว่าจะมี production domain จริง

## Deployment

Vercel: Root Directory `apps/landing`, Framework Preset `Next.js`, Install `npm ci`, Build `npm run build` ไม่ต้องใช้ Rust, Python, desktop tooling หรือ environment secrets

## Browser acceptance checks

1. Desktop 1280px และ mobile 390px / 320px: ไม่มี horizontal overflow หัวข้ออ่านครบ
2. เล่นเดโมครบ 6 ขั้น: รับเสียง → ถอดเสียงและแปล → ซับไทย → พูดไทย → ข้อความอังกฤษ → คัดลอกไปตอบ
3. หยุด/เล่นซ้ำและเลือกขั้นตอนด้วยตนเองได้ คัดลอกข้อความตัวอย่างและมี feedback
4. Login เปิด dialog ได้ ปุ่ม Google ยัง disabled; Escape/ปุ่มปิดคืน focus
5. FAQ เปิด/ปิดได้ พร้อมข้อจำกัดที่ตรงกับผลิตภัณฑ์
6. CTA ใช้ Releases ใน config และ anchor มีปลายทาง
7. Console ไม่มี error และไม่มีชื่อปุ่มลัดบนหน้า

Desktop engine ระบบแปลจริง และ Google authentication อยู่นอกขอบเขตการทดสอบ landing นี้
