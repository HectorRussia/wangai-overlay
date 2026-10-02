# WANGAI landing page

เว็บไซต์แนะนำ WANGAI ภาษาไทย ใช้ Next.js App Router, React, TypeScript และ Tailwind CSS เป็นแอปแยกจาก desktop ไม่เรียก Tauri, ไมโครโฟน หรือบริการ AI จากเว็บไซต์

## Run

ใช้ Node.js 22 ขึ้นไป รันจาก `apps/landing`:

```sh
npm ci
npm run dev
```

เปิด http://127.0.0.1:3000 หรือใช้ `npm run dev -- --port 3100`
Landing ใช้ npm และ package-lock.json แยกจาก root pnpm project ยังไม่เปลี่ยน workspace ของ desktop

## Check and build

```sh
npm run lint
npm run typecheck
npm run build
npm run start
```

หน้าแรก prerender เป็น static HTML ใช้ Client Components เฉพาะเดโมและเมนูมือถือ FAQ ใช้ native details จึงเปิดคำตอบได้โดยไม่ใช้ JavaScript

## Design

- พื้นขาวนวล ตัวอักษรไทยใหญ่ สีม่วงหลัก อ้างอิงความโปร่งของ Speaak และการโชว์สินค้าบนพื้นเข้มของ Animos
- Hero → เดโมแปล → ประโยชน์ → เริ่มใช้งาน → FAQ → ดาวน์โหลด
- Hero entrance, เปลี่ยนสถานการณ์, scroll reveal แบบ progressive enhancement และ hover CTA รองรับ prefers-reduced-motion และ waveform หยุดเองภายใน 5 วินาที
- สื่อสารประโยชน์โดยไม่ระบุปุ่มลัด เพราะผู้ใช้ตั้งเองได้
- เดโมและภาพเลือกแหล่งเสียงระบุว่าเป็นภาพ/ข้อความจำลอง ไม่ฟังเสียงจริงและไม่ขอสิทธิ์ไมโครโฟน
- ปุ่มดาวน์โหลดไป GitHub Releases ให้เลือกรุ่น ไม่ hardcode เวอร์ชัน ไม่อ้างราคา/จำนวนผู้ใช้ที่ไม่มีข้อมูล

## Edit

| Path                                        | Purpose                                               |
| ------------------------------------------- | ----------------------------------------------------- |
| src/app/page.tsx                            | เนื้อหาและ sections                                   |
| src/content/home.ts                         | ตัวอย่างบทสนทนาและ FAQ                                |
| src/config/site.ts                          | Metadata และลิงก์                                     |
| src/styles/globals.css                      | Layout สี responsive และ motion                       |
| src/components/sections/TranslationDemo.tsx | เดโมการฟังและตอบกลับ                                  |
| src/components/layout                       | เมนู desktop / mobile                                 |
| public/fonts                                | Kanit, Noto Sans Thai จาก repo พร้อม SIL OFL licenses |
| public/images/wangai-icon.png               | โลโก้เดิมจาก src-tauri/icons/128x128.png (favicon ใช้ 32x32.png)                             |

Metadata ยังไม่กำหนด canonical URL จนกว่าจะมี production domain จริง

## Deployment

Vercel: Root Directory `apps/landing`, Framework Preset `Next.js`, Install `npm ci`, Build `npm run build` ไม่ต้องใช้ Rust, Python, desktop tooling หรือ environment secrets

## Browser acceptance checks

1. Desktop 1280px และ mobile 390px / 320px: ไม่มี horizontal overflow หัวข้ออ่านครบ
2. สลับเกม, Discord, วิดีโอ: ต้นฉบับและคำแปลตรงสถานการณ์
3. พูดตอบกลับ: แสดงไทย → อังกฤษ; เปลี่ยนสถานการณ์แล้วกลับสู่โหมดฟัง
4. เมนูมือถือเปิดด้วย keyboard ได้ เลือก anchor แล้วปิด Escape ปิดและคืน focus
5. FAQ เปิด/ปิดได้ มีข้อมูลอินเทอร์เน็ต, หนึ่งแอปต่อครั้ง, ข้อความตอบกลับ และโหมดหน้าจอที่รองรับ
6. ทุก CTA ใช้ Releases ใน config และ anchor มีปลายทาง
7. Console ไม่มี error และไม่มีชื่อปุ่มลัดบนหน้า

Desktop engine และระบบแปลจริงอยู่นอกขอบเขตการทดสอบของ landing นี้

