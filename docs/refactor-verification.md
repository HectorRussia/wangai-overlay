# ผลตรวจ refactor WANGAI — 2026-10-02

ฐานก่อนแก้คือ `4cd4694` บน branch `ponkritwo/ove-1-refactor-code-and-clean-code` งานนี้คง settings schema 16 และไม่มี migration ใหม่ อ่าน [แผนผังและแนวทางพัฒนาต่อ](architecture.md) สำหรับตำแหน่งโมดูลปัจจุบัน

## ชุด commit และการย้อนกลับ

| Commit | ขอบเขต |
| --- | --- |
| `d9ff2ca` | ลบ prototype และ frontend paths ที่เลิกใช้ |
| `567135c` | แยก frontend features/transport/state, shared snapshot provider และ lifecycle tests |
| `0d15ff2` | Shared Desktop application operations และแยก window/HTTP adapters |
| `5d4dc1a` | Audio/STT policies, typed completion, settings migration/validation/persistence |
| `de36a22` | แยก server services และ Python worker modules |
| `b6e723c` | แยก Portable packaging stages, artifact contract test และ CI checks |
| `f00ea90` | จัดรูปแบบ TypeScript/TSX/Rust เท่านั้น |
| `3a061fe` | แยก settings panels เพิ่มเติมหลังทำโค้ดให้อ่านง่าย |
| `90e43e4` | จัดรูปแบบ Python packaging/worker เท่านั้น |
| `499a6eb` | Native/Web command parity, packaged worker restart และแก้ synchronization ของ hotkey test |

ย้อน commit จากท้ายไปต้น หรือ checkout checkpoint ที่ต้องการตรวจ แต่ละช่วงหลักผ่านชุดตรวจที่เกี่ยวข้องก่อนเดินต่อ การ revert ช่วงต้นขณะที่ยังเก็บช่วงหลังซึ่ง import โมดูลใหม่อาจเกิด conflict จึงไม่ควร cherry-pick revert ข้าม dependency ไม่มี commit ใดตั้งใจแก้ข้อมูล `Data` ของผู้ใช้หรือเปลี่ยนรูปแบบ persistence

## สิ่งที่ลบและสิ่งที่เก็บ

- ลบไฟล์ tracked ใน `prototype/` 78 ไฟล์ ตามที่อนุญาต พร้อม exclude ใน `.dockerignore` และ Vitest
- ลบ `src/overlayPresentation.ts`: ไม่อยู่ใน production import graph และเป็น collapse behavior ที่ไม่ได้ใช้แล้ว
- ย้าย test การเก็บข้อความล่าสุดไป `features/overlay/overlayItems.test.ts` ให้ทดสอบ `visibleOverlayItems` ที่ UI ใช้จริง ลบ 5 tests ของ retired collapse implementation; tests ของหน้าจอ overlay จริงยังอยู่
- ถอด frontend wrappers `setOverlayPresentation`, `listProcesses`, `defaultMicrophoneName`, `setListening`, `injectDemo` ที่ไม่มีผู้เรียก Backend commands เดิมยัง registered สำหรับ compatibility/diagnostics
- ไฟล์ frontend ที่เปลี่ยนตำแหน่งเป็นการย้ายพร้อมแก้ imports และ tests ไม่ใช่การลบฟีเจอร์
- เก็บ `apps/landing` และ untracked `ai-protocol/Cargo.lock` ที่มีอยู่ก่อนงานนี้ไว้ ไม่รวม lockfile ดังกล่าวใน commit
- ตรวจ import graph จาก `src/main.tsx` หลัง refactor ไม่พบ production TypeScript module ที่เข้าไม่ถึง แต่ผลนี้ไม่ใช่ข้อพิสูจน์ว่าไม่มี dead branch ในทุกฟังก์ชัน

## ผล automated checks

| ชุดตรวจ | ผล |
| --- | --- |
| Frontend Vitest | 121 passed |
| Windows GUI PE checks (Node) | 4 passed |
| Desktop Rust ชุดปกติ | 94 passed; 3 opt-in tests ข้ามโดย default |
| Desktop opt-in: live process discovery / default microphone | 2 passed บน Windows เครื่องนี้ |
| Desktop opt-in: packaged worker JSONL ผ่าน Rust decoder | 1 passed |
| Server Rust | 13 passed รวม timeout, rate limit, capacity และ credential redaction |
| Portable Rust `--features host` | 14 passed รวม signature, bounded archive, interrupted swap และ launcher recovery |
| Python worker | 11 passed |
| Portable preview provenance (Python) | 11 passed |
| Packaging artifact contract (Python) | 1 passed |
| `ai-protocol` crate | compile/doc tests ผ่าน; ไม่มี unit test ใน crate โดยตรง |
| Frontend build + TypeScript unused checks | passed |
| Prettier และ Rust formatting ทั้ง 4 crates | passed; local stable เป็น Rust 1.86.0 ตรงกับ CI |
| PyInstaller worker | โหลด ONNX จริง, offline startup, Unicode path และ frame/reset smoke ผ่าน |

เทียบชุดเดิมโดยไม่รวม opt-in และ scripts เพิ่มเติม: 254 → 257 tests (ลบ obsolete 5, เพิ่ม frontend 6 และ Desktop 2) เมื่อรวม opt-in 3 และ Python packaging/provenance 12 เป็น 272 tests ที่ผ่าน นับแยกจากการตรวจภาพและ real Portable acceptance ด้านล่าง

เพิ่ม coverage ของ provider หนึ่งชุดสำหรับ main/advanced, event reducer, WebSocket reconnect/polling/cleanup, transport argument spelling, stream reset และ optional confidence fields ยังรักษา tests เรื่อง late bootstrap, StrictMode/unmount, cursor, Incoming/Microphone isolation, queue เต็ม, source switch ระหว่างรอคำแปล และ settings รุ่นเก่าไว้

ระหว่างตรวจซ้ำพบ test rebinding F10 ส่งคีย์ก่อน effect ลงทะเบียน listener เสร็จ ปรับให้ `act` รอ async capture request แล้วชุด frontend ผ่านครบ ไม่ได้เปลี่ยน production hotkey behavior เพื่อแก้ test

## Native Portable acceptance

สร้าง signed fixtures ใหม่ด้วย `build-test-portables.ps1` จากโค้ดรอบนี้ มี disposable test key และ updater บน loopback ใช้ package signatures, WebView2 Fixed Version และ worker ที่แพ็กจริง ไม่ใช้ provider จริง และไม่เลือก capture แอป/ไมโครโฟนของผู้ใช้

- **Upgrade 0.3.0 → 0.3.1: passed.** เปิด Ready Room จริง, worker ready, launcher เปลี่ยน, settings และ installation ID ตรงเดิม, ไม่มีดาวน์โหลดก่อนยืนยันตาม test protocol และ child processes ปิดครบ
- **Rollback หลัง readiness timeout: passed.** คืน active version และ launcher เป็น 0.3.0 หลังรุ่น 0.3.1 ไม่ acknowledge readiness, settings/installation ID ตรงเดิม และ native UI/worker ของรุ่นที่คืนกลับพร้อมใช้งาน
- ใน release-test product เท่านั้น เพิ่มการเปรียบเทียบ return values/errors ของ Tauri command functions กับ Web Companion dispatcher สำหรับ overlay, glossary, microphone/default/busy rejection, rescue scan, stop และ clear source รวมทั้ง restart packaged worker ผ่านทั้งสอง adapter และตรวจ PID/ready ใหม่
- Parity test คืน fixture settings เดิมแม้เปรียบเทียบไม่ผ่าน เพื่อให้การตรวจ preservation แยกจากการตรวจคำสั่งได้ นี่เป็น adapter integration ภายใน native process ไม่ใช่การกด UI ผ่าน HTTP session จริงครบทุกคำสั่ง

หลักฐานใน `output/refactor-portable-build.log`, `output/refactor-portable-upgrade.log`, `output/refactor-portable-rollback.log` และ `output/refactor-portable/ทดสอบ Portable */Data/acceptance-report.json` เป็นไฟล์ local ที่ไม่ commit และไม่เผยแพร่ test artifacts/key

## ตรวจภาพก่อน–หลัง

ใช้ frontend จาก `4cd4694` แยกไว้ใน `output/refactor-baseline` เทียบกับโค้ดใหม่ด้วย Chromium/Playwright ใช้ dependency installation เดียวกัน, `Date.now` คงที่และปิด animations ตอน screenshot

ทั้ง **11 กรณีมี RGB pixels ตรงกัน**: overview, main settings/controls, advanced audio, advanced AI, history ว่าง/มีคำแปล, hotkeys หลัง scroll, narrow 390×640 และ overlay ว่าง/คำแปลปกติ/ข้อความยาวที่ 420×236 หน้าตั้งค่าใช้ 820×480 หลักฐานอยู่ `output/playwright/{baseline,current}-*.png` และ `refactor-comparison.json` ไฟล์ CSS และลำดับนำเข้าไม่เปลี่ยน

ภาพนี้ยืนยัน browser preview ตาม fixtures ไม่ใช่การเทียบ native WebView ทุก DPI/monitor

## ข้อจำกัดและสิ่งที่ยังต้องตรวจ

- ยังไม่ได้ทำ manual smoke ครบวงจรกับเสียงเกมจริง: เลือก source, F8/F9/F10/F7, ถอด/สลับอุปกรณ์ระหว่าง capture และใช้งาน Web Companion ผ่าน browser session จริง การค้นหาอุปกรณ์และ native packaged startup/exit ผ่านแล้ว แต่ไม่เท่ากับการตรวจเสียง end-to-end
- Docker CLI มีในเครื่อง แต่ daemon ไม่ทำงาน จึงไม่ได้รัน container smoke locally; `verify.yml` ยังคงรัน `test-server-container.py` บน Linux CI
- ยังไม่ได้สั่งรัน remote CI หรือ clean Windows VM; real Portable acceptance รอบนี้ทำบนเครื่องพัฒนาและไม่ได้ใช้การกดยืนยันด้วยมือ
- Test artifacts ถูกเก็บไว้ใน `output/refactor-portable` การลบ build scratch ที่สร้างในรอบนี้ถูก automatic approval review ปฏิเสธด้วยข้อความ `blocked by policy` ไม่มีรายละเอียดเหตุผลเพิ่มเติม จึงไม่ได้ลบ

## ข้อสังเกตเดิมที่ไม่เปลี่ยนในรอบนี้

1. `webSnapshots` อาจส่งผล HTTP poll ที่ค้างกลับมาหลัง WebSocket reconnect; provider ป้องกันผลหลัง unmount และ stale bootstrap แต่ poll ไม่มี revision/version สำหรับจัดลำดับกับ WS เป็นข้อสังเกตจาก code path ยังไม่ได้เปลี่ยน behavior ใน refactor
2. การเลือก transport ตรวจว่ามี query `preview` ส่วน fixture mode ตรวจ `preview=1` โดยตรง เก็บเงื่อนไขเดิมไว้
3. Web มี settings events ซ้ำในบาง commands และ hotkey/restart-worker behavior ต่างจาก native ตามที่อธิบายใน architecture เป็น compatibility เดิมที่ควรพิจารณาแยกงาน หากต้องการเปลี่ยน
4. Chromium preview มี favicon 404 ทั้งฐานเดิมและโค้ดใหม่ ไม่มีผลต่อภาพที่เทียบ
