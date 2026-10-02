# WANGAI Landing Page

โครงสร้างเริ่มต้นสำหรับส่งต่อการพัฒนาเว็บไซต์แนะนำ WANGAI ด้วย **Next.js App Router + React + TypeScript + Tailwind CSS**

**สถานะ: มีเฉพาะโฟลเดอร์และเอกสาร ยังรันหรือ deploy ไม่ได้** ยังไม่มี `package.json`, dependencies, Next.js configuration หรือหน้าเว็บที่ใช้งานได้

## โครงสร้างและหน้าที่

```text
apps/landing/
├─ README.md
├─ public/
│  ├─ images/
│  │  └─ .gitkeep
│  └─ fonts/
│     └─ .gitkeep
└─ src/
   ├─ app/
   │  └─ .gitkeep
   ├─ components/
   │  ├─ layout/
   │  │  └─ .gitkeep
   │  ├─ sections/
   │  │  └─ .gitkeep
   │  └─ ui/
   │     └─ .gitkeep
   ├─ content/
   │  └─ .gitkeep
   ├─ config/
   │  └─ .gitkeep
   └─ styles/
      └─ .gitkeep
```

| โฟลเดอร์ | หน้าที่ |
| --- | --- |
| `public/images` | รูปภาพ โลโก้ และภาพตัวอย่างสำหรับเว็บไซต์ |
| `public/fonts` | ไฟล์ฟอนต์ที่เว็บไซต์ให้บริการเอง |
| `src/app` | Routes, root layout, metadata และไฟล์ SEO ตาม convention ของ Next.js |
| `src/components/layout` | Header, Navigation และ Footer ที่ใช้ร่วมระหว่างหน้า |
| `src/components/sections` | ส่วนประกอบหน้า landing เช่น Hero, Features, Demo, FAQ และ Download CTA |
| `src/components/ui` | Component พื้นฐาน เช่น Button และ Container |
| `src/content` | ข้อความหน้าเว็บและข้อมูล FAQ |
| `src/config` | ชื่อสินค้า ลิงก์ดาวน์โหลด และค่ากลางของเว็บไซต์ |
| `src/styles` | Global styles และ theme ของ landing |

`.gitkeep` เป็นไฟล์ว่างเพื่อให้ Git เก็บโฟลเดอร์ที่ยังไม่มีไฟล์จริง ไม่ได้มีผลต่อ Next.js ให้นำออกจากโฟลเดอร์นั้นเมื่อเพิ่มไฟล์ใช้งานจริงแล้ว

## แนวทางการพัฒนา

- ใช้หน้า static เป็นค่าเริ่มต้น และแยก Client Components เฉพาะส่วนที่ต้องโต้ตอบหรือใช้ browser APIs
- Landing เป็นแอปแยกจาก desktop ห้าม import Tauri, Local Web Companion API หรือโค้ดที่ควบคุม desktop engine เข้ามาใน landing
- แยกเนื้อหาที่แก้บ่อยไว้ใน `src/content` และรวมชื่อสินค้า ลิงก์ดาวน์โหลด และค่ากลางไว้ใน `src/config`
- เก็บ component เฉพาะเว็บไซต์ไว้ในแอปนี้ก่อน ค่อยแยก shared package เมื่อมีการใช้ร่วมจริง

## เริ่มงานต่อ

1. เพิ่ม `package.json` สำหรับ landing พร้อม Next.js, React, TypeScript และ Tailwind CSS รวมถึง scripts สำหรับพัฒนา ตรวจสอบ และ build
2. เพิ่ม config ที่จำเป็นสำหรับ Next.js, TypeScript และ Tailwind CSS โดยคงโครงสร้างโฟลเดอร์นี้ไว้
3. ตั้งค่าการจัดการ dependencies และเชื่อม pnpm workspace เป็นงานแยกก่อนใช้ workspace commands ปัจจุบัน repo root ยังไม่มี workspace ที่รวม landing
4. เพิ่ม root layout, หน้าแรก, metadata และ global styles แล้วพัฒนา sections ตามแบบที่ตกลงกัน
5. ตรวจ build ของ landing และการแสดงผลบนจอมือถือกับ desktop ก่อนนำไป deploy

คำสั่ง `pnpm dev` และ `pnpm build` ที่ repo root ปัจจุบันเป็นของ frontend ฝั่ง desktop ไม่ใช่ landing ต้องใช้ scripts ของแอป landing หลังตั้งค่าเสร็จ

## Deployment เป้าหมาย

เมื่อแอปพร้อมใช้งาน ให้สร้าง Vercel project สำหรับ landing โดยตั้งค่า:

- **Root Directory:** `apps/landing`
- **Framework Preset:** `Next.js`
- ใช้ build และ output settings ของ Next.js preset หลังตั้งค่า package และ dependencies แล้ว

Landing ต้อง build ได้แยกจาก Rust, Python และ Windows desktop tooling

## ขอบเขตของโครงสร้างชุดนี้

เพิ่มเฉพาะ README และ `.gitkeep` ภายใน `apps/landing` ไม่มีการติดตั้ง dependencies สร้างหน้าเว็บ แก้ workspace หรือ lockfile ย้ายโค้ด desktop/backend เปลี่ยน public API หรือตั้งค่า deployment จริง
