# WANGAI landing page

เว็บไซต์แนะนำ WANGAI ภาษาไทย ใช้ Next.js App Router, React, TypeScript และ Tailwind CSS แยกจาก desktop ไม่เรียก Tauri, ไมโครโฟน หรือบริการ AI จากเว็บไซต์

## Run

ใช้ Node.js 22 ขึ้นไป และ pnpm 10.32.1 รันจาก `apps/landing`:

```sh
pnpm install --frozen-lockfile
pnpm dev
```

เปิด http://127.0.0.1:3000 หรือใช้ `pnpm dev --port 3101`
ใช้ pnpm รุ่นเดียวกับ Desktop แต่เก็บ `pnpm-lock.yaml` และติดตั้ง dependencies แยกภายในแต่ละแอป ไม่มี workspace หรือ lockfile กลางที่ root

## Check and build

```sh
pnpm lint
pnpm typecheck
pnpm build
pnpm start
```

หน้าแรก prerender เป็น static HTML ใช้ Client Components สำหรับเดโมและหน้าต่างเข้าสู่ระบบ FAQ ใช้ native details

## Design

- Dark graphite กับสีมิ้นต์–ฟ้าและครีมจากโลโก้ WANGAI พาดหัวบอกตรง ๆ ว่า AI แปลเสียงพูดระหว่างเล่นเกม
- Hero → เดโม FPS รับเสียง/แปล/เตรียมคำตอบ → บทสนทนาลอยที่คลิกแปลได้ → เลือกแหล่งเสียง → FAQ → ดาวน์โหลด
- มุมขวาบนมีเฉพาะดาวน์โหลดและเข้าสู่ระบบ หน้าต่าง Google login เป็น mock ยังไม่มี authentication
- สื่อสารประโยชน์โดยไม่ระบุปุ่มลัด เพราะผู้ใช้ตั้งเองได้
- เดโมเป็นข้อความจำลอง เล่นอัตโนมัติ 6 ขั้นเมื่ออยู่ในจอ หยุดเมื่อแท็บซ่อนหรือโฟกัสอยู่ในเดโม เลือกขั้นตอนและคัดลอกข้อความอังกฤษได้ ไม่ขอสิทธิ์ไมโครโฟน
- ชื่อแอป WANGAI เปลี่ยนเป็นคลื่นเสียงแล้วเป็น “ว่าไง” ครั้งเดียวต่อการโหลดหน้า ค้างชื่อไทยเมื่อกลับจากหน้าอื่น และเริ่มใหม่เมื่อรีเฟรช
- ลิงก์นโยบายความเป็นส่วนตัวและเงื่อนไขการใช้งานอยู่ที่ footer ข้อมูลติดต่อและรายละเอียดผู้ให้บริการ AI ยังต้องให้เจ้าของอัปเดตก่อนเปิดบริการจริง
- CTA ดาวน์โหลดไป GitHub Releases ไม่ hardcode เวอร์ชันหรืออ้างราคา/จำนวนผู้ใช้
- ภาพเกมต้นฉบับสร้างด้วย AI และใช้ WebP ดูงานรีเสิช แนวทาง และ prompt ใน [DESIGN.md](DESIGN.md)

## Edit

| Path                                        | Purpose                                               |
| ------------------------------------------- | ----------------------------------------------------- |
| src/app/page.tsx                            | เนื้อหาและ sections                                   |
| src/content/home.ts                         | FAQ                                                   |
| src/content/conversations.ts                | บทสนทนาภาษาอังกฤษและคำแปลไทยสำหรับการ์ดลอย            |
| src/content/translationSteps.ts             | ข้อความขั้นตอนเดโม                                    |
| src/content/gameScenes.ts                   | ภาพประกอบและบทสนทนาในฉากเกม                          |
| src/config/site.ts                          | Metadata และลิงก์                                     |
| src/styles/globals.css                      | Layout สี responsive และ motion                       |
| src/components/sections/TranslationDemo.tsx | เดโมการฟังและตอบกลับ                                  |
| src/components/ui/LoginButton.tsx           | หน้าต่างเข้าสู่ระบบตัวอย่าง                           |
| public/fonts                                | Kanit, Noto Sans Thai จาก repo พร้อม SIL OFL licenses |
| public/images                               | โลโก้เดิมและภาพเกมประกอบ                              |

Metadata ใช้ `https://wangai.app` เป็น canonical domain ของหน้าแรก `/privacy` และ `/terms`

## Deployment

Vercel: Root Directory `apps/landing`, Framework Preset `Next.js`, Install `pnpm install --frozen-lockfile`, Build `pnpm build` โดยใช้ pnpm 10.32.1 ตาม `packageManager` ไม่ต้องใช้ Rust, Python, desktop tooling หรือ environment secrets

## Browser acceptance checks

1. Desktop 1280px และ mobile 390px / 320px: ไม่มี horizontal overflow หัวข้ออ่านครบ
2. เล่นเดโมครบ 6 ขั้น: รับเสียง → ถอดเสียงและแปล → ซับไทย → พูดไทย → ข้อความอังกฤษ → คัดลอกไปตอบ
3. เดโมเริ่มอัตโนมัติและวนครบ 6 ขั้น หยุดเมื่อหลุดจอ/ซ่อนแท็บ/โฟกัสภายใน เลือกขั้นตอนเองได้ และการคัดลอกมี feedback
4. Login เปิด dialog ได้ ปุ่ม Google ยัง disabled; Escape/ปุ่มปิดคืน focus
5. FAQ เปิด/ปิดได้ พร้อมข้อจำกัดที่ตรงกับผลิตภัณฑ์
6. CTA ใช้ Releases ใน config และ anchor มีปลายทาง
7. Console ไม่มี error และไม่มีชื่อปุ่มลัดบนหน้า
8. ชื่ออังกฤษและไทยมีขนาดเท่ากัน ไม่ซ้อนข้อความข้าง ๆ และย่อความกว้างอย่างนุ่มนวลโดยหัวข้ออยู่กึ่งกลาง
9. การ์ดบทสนทนาคลิกเพื่อดูคำแปลและต้นฉบับได้ ความเร็วระบุว่าเป็นเดโม
10. /privacy และ /terms เปิดได้ทั้ง desktop/mobile ลิงก์ footer และการกลับหน้าแรกใช้งานได้

Desktop engine ระบบแปลจริง และ Google authentication อยู่นอกขอบเขตการทดสอบ landing นี้

## ข้อกำหนดจากโครงสร้างเดิมบน dev

- ใช้ static rendering เป็นค่าเริ่มต้น และ Client Components เฉพาะเดโม แอนิเมชัน และ dialog ที่ต้องใช้ browser APIs
- Landing แยกจาก desktop ไม่ import Tauri, Local Web Companion API หรือโค้ดควบคุม desktop engine
- เก็บข้อมูล FAQ บทสนทนา และขั้นตอนเดโมไว้ใน `src/content` และ metadata/ลิงก์ส่วนกลางใน `src/config`
- ใช้ dependencies และ lockfile ภายในแอปนี้ แยกจาก Desktop โดยไม่มี pnpm workspace ที่ root
- นำ `.gitkeep` ออกจากโฟลเดอร์ที่มีไฟล์จริงแล้ว
- Build ของ landing ไม่ต้องพึ่ง Rust, Python หรือ Windows desktop tooling

ขณะนี้ใช้ local preview ตามคำขอเจ้าของ ไม่มีการเผยแพร่การแก้ไขล่าสุดขึ้นเว็บไซต์ออนไลน์

## ผลตรวจการย้ายเป็น pnpm — 4 ตุลาคม 2569

- ใช้ `pnpm import` จาก npm lockfile เดิม โดย package/version ทั้ง 434 รายการและ integrity hashes ตรงกันทั้งหมด
- ติดตั้งด้วย `pnpm install --frozen-lockfile` ในโฟลเดอร์ทดสอบสะอาดบน Windows ซึ่งไม่มี `node_modules` เดิม และยืนยันว่า lockfile ไม่เปลี่ยน
- ผ่าน `pnpm lint`, `pnpm typecheck`, `pnpm build` และ `pnpm check:seo` บน production preview ที่เปิดด้วย `pnpm start --port 3101`
- คง dependency versions, scripts, Node.js requirement และ UI เดิม รอบนี้ไม่ได้ deploy หรือเปลี่ยนค่าบน Vercel จริง

## ผลตรวจเดิมก่อนย้ายเป็น pnpm — 3 ตุลาคม 2569

เทียบข้อกำหนดกับ `HectorRussia/wangai-overlay` branch `dev` ที่ commit `4cd4694` แล้ว branch `ponkritwo/ove-4-landingpage` มี commit นี้เป็นบรรพบุรุษ และการเปลี่ยนแปลงทั้งหมดอยู่ใน `apps/landing`

- ผ่าน `npm run lint`, `npm run typecheck`, `npm run build` และ `git diff --check`
- `npm audit --omit=dev --audit-level=high` รายงาน 0 vulnerabilities
- Production preview ที่ `127.0.0.1:3101`: desktop 1280px และ mobile 390/320px ไม่มี horizontal overflow
- ตรวจเดโมครบ 6 ขั้น การวนอัตโนมัติ การคัดลอก การแปลการ์ดทั้ง 5 ใบ และ login dialog/Escape/focus return แล้ว
- หน้า privacy/terms เปิดได้บน mobile 320px กลับผ่านลิงก์ภายในแล้วชื่อแอปยังค้างไทย และ console ไม่มี error ในรอบตรวจนี้
- ข้อมูลติดต่อ ผู้ให้บริการ AI ประเทศที่ประมวลผล และรายละเอียดการเก็บข้อมูลภายนอกยังต้องยืนยันก่อนใช้เป็นนโยบายของบริการจริง

ผลนี้เป็นการตรวจ landing เท่านั้น ไม่ใช่การรับรอง Desktop engine การแปลจริง หรือการอนุญาตจากผู้ให้บริการเกม

## SEO และข้อมูลสำหรับ AI

- Title/description, canonical รายหน้า, Open Graph/Twitter และภาพแชร์ 1200×630 ใช้โดเมน `https://wangai.app`
- JSON-LD อธิบาย WebSite, SoftwareApplication และ FAQ ที่ตรงกับข้อมูลบนหน้าจริง ไม่ระบุราคา คะแนนรีวิว หรือการรับรองที่ยังไม่มี
- `/robots.txt` อนุญาต crawl ใน production รวม OAI-SearchBot; `/sitemap.xml` ระบุหน้าแรก privacy และ terms
- `/llms.txt` เป็นสรุปข้อมูลพร้อมลิงก์สำหรับ AI ตามข้อเสนอ llms.txt ส่วน `/index.md` สร้างจาก FAQ ชุดเดียวกับหน้าเว็บ
- ใช้ `rel="describedby"` และ `rel="alternate" type="text/markdown"` ให้เครื่องมือค้นพบข้อมูลประกอบ
- Development, Vercel Preview หรือ `SITE_INDEXABLE=false` ใช้ noindex/nofollow และ disallow crawl ต้อง rebuild หลังเปลี่ยนค่า
- เปลี่ยนโดเมนได้ผ่าน `SITE_URL` (ต้องเป็น HTTPS origin ไม่มี path) ดู `.env.example`

หลัง `pnpm build` และเปิด `pnpm start --port 3101` ตรวจด้วย `pnpm check:seo` หากทดสอบ preview ให้ส่ง `SITE_INDEXABLE=false` ให้ทั้ง build และคำสั่งตรวจ

SEO และ structured data ช่วยให้เครื่องอ่านข้อมูล แต่ไม่รับประกันอันดับ การถูกอ้างอิงโดย AI หรือ rich results. llms.txt เป็นข้อเสนอเสริม ไม่ใช่ข้อกำหนดหรือสัญญาณจัดอันดับที่ทุกระบบรองรับ การอนุญาต OAI-SearchBot สำหรับการค้นหาแยกจาก GPTBot สำหรับ training; กฎ wildcard ปัจจุบันไม่ได้จำกัด training crawlers

ก่อนเปิดโดเมนจริง ต้องตั้ง DNS/HTTPS ให้ชี้ไปยัง deployment นี้ ตรวจ production robots แล้วส่ง sitemap ใน Google Search Console และ Bing Webmaster Tools ยังไม่ได้ดำเนินการในงาน local นี้

อ้างอิง: [Google AI features](https://developers.google.com/search/docs/appearance/ai-features), [OpenAI crawlers](https://developers.openai.com/api/docs/bots), [llms.txt proposal](https://llmstxt.org/)
