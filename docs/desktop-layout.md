# การย้าย Desktop เข้า apps/desktop

วันที่ 2026-10-02 ย้ายแอป Desktop จาก repository root เข้า `apps/desktop/` โดยคง source, dependencies, API และ package format เดิม โค้ดและไฟล์ใน `apps/landing/` ไม่เปลี่ยน

## โครงสร้างและคำสั่งใหม่

`apps/desktop/` มี React `src`, `src-tauri`, `portable`, `worker`, `assets`, icons, Desktop scripts, package/lockfile และ frontend configs ของตัวเอง Generated dependencies/cache/artifacts อยู่ภายในแอปเช่นกัน

`server/`, `ai-protocol/`, `docs/`, `.github/` และ `scripts/test-server-container.py` อยู่ที่ root ต่อไป ไม่มีการเพิ่ม pnpm/Cargo workspace หรือรวม dependency ของ landing

จาก repository root:

```powershell
cd apps/desktop
pnpm install --frozen-lockfile
pnpm tauri dev
```

ถ้าต้องการสั่งจาก root โดยไม่เปลี่ยน directory ใช้ `pnpm --dir apps/desktop test` หรือ `pnpm --dir apps/desktop build` ดู [คู่มือ Desktop](../apps/desktop/README.md) สำหรับ bootstrap และ packaging

## Git และ generated files

แยก `.gitignore` เป็น commit `e1a82fa` ก่อน commit ย้ายแอป ตามคำขอ โดยครอบคลุม dependency folders, Cargo targets, Python caches, test reports, release config และ Tauri generated schemas ทั้งตำแหน่งก่อนและหลังย้าย

ไฟล์ Desktop เดิมจับคู่ได้เป็น **231 renames** อีก 4 ไฟล์คือ Tauri schemas ที่เลิก track เพราะสร้างใหม่ตอน build แต่ยังคงไฟล์ในเครื่องไว้ ไม่ได้ ignore source, tests, capability definitions, assets หรือ application lockfiles ส่วน `ai-protocol/Cargo.lock` ของ library ที่มีอยู่ในเครื่องก่อนงานนี้ยังคงอยู่และถูก ignore

ตัวเลข 484 ที่เคยแสดงใน Source Control มีทั้งรายการลบจากตำแหน่งเดิมและเพิ่มที่ตำแหน่งใหม่ เมื่อ stage แล้ว Git จับคู่ renames จึงลดจำนวนรายการได้ โดยไม่ตัดไฟล์ที่ต้องใช้ build

## สิ่งที่ปรับตามตำแหน่ง

- Desktop Cargo dependency ชี้ไป shared `../../../ai-protocol` จาก `src-tauri`
- Release packaging อ่าน notes/notices จาก repo `docs/` และยังบรรจุชื่อไฟล์เดิมใน payload
- Packaging tests ใช้ fixture ที่จำลอง `apps/desktop` และ repo docs แยกกัน
- Windows jobs ใน CI ใช้ `apps/desktop` เป็น working directory; pnpm อ่าน package manifest ที่ใหม่ และ artifact upload/download ใช้ path จาก repo root อย่างถูกต้อง
- Server CI และ Docker build context ยังใช้ root โดยกัน `apps/desktop` ออกจาก context
- README, architecture และคู่มือ build ระบุ working directory ใหม่ รายงาน refactor เดิมเก็บเป็นประวัติพร้อมหมายเหตุเรื่อง path

## ผลตรวจหลังย้าย

- Frontend: 121 tests + 4 Node PE tests ผ่าน, format และ TypeScript/Vite build ผ่าน
- Desktop Rust: 94 tests ผ่าน, 3 opt-in ข้ามในชุดปกติ
- Portable Rust: 14 tests ผ่าน รวม signing, package และ rollback transaction
- Server: 13 tests ผ่าน และไม่มี source change
- Python worker: 11 tests และ protocol self-test ผ่าน
- สร้าง packaged worker จาก path ใหม่สำเร็จ; real ONNX, offline startup, Unicode path, frame/reset smoke และ Rust packaged-worker contract ผ่าน
- Packaging/provenance: 12 tests ผ่าน และ release version checks ผ่าน
- `pnpm tauri build --debug --ci --no-bundle` สร้าง native executable จาก path ใหม่สำเร็จ
- ตรวจ YAML ของทั้ง 5 workflows รวม working directories และ artifact paths ผ่าน
- Original Desktop inputs ยังอยู่ครบที่ใหม่; application lockfiles มีเนื้อหาเดิม; `apps/landing`, server และ shared protocol source ไม่มี diff

การย้าย build cache ทำให้ Tauri permission metadata และ Portable test binary บางตัวอ้าง absolute path เก่า จึงล้าง cache ของ packages ที่เกี่ยวข้องแล้วสร้างใหม่จน tests ผ่าน นี่เป็นปัญหา local cache ไม่ใช่การแก้ application behavior สำหรับเครื่องอื่นที่มี cache ก่อนย้าย สามารถ `cargo clean --manifest-path src-tauri/Cargo.toml` แล้ว build ใหม่ได้

Generated files และหลักฐานรอบนี้อยู่ใน `apps/desktop/output/desktop-layout-*` โดยไม่ commit ยังไม่ได้รัน remote CI, Windows GUI smoke หรือ real Portable upgrade/rollback ซ้ำหลังย้าย; ผล acceptance ก่อนย้ายอยู่ใน [รายงาน refactor](refactor-verification.md)
