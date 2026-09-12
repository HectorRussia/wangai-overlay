# WANGAI Portable 0.3.0

## สำหรับผู้ใช้

ดาวน์โหลด `WANGAI_0.3.0_x64-portable.exe` จาก GitHub Releases หลังเผยแพร่
เปิดไฟล์ เลือกตำแหน่ง (ค่าเริ่มต้น `WANGAI` ข้างไฟล์ดาวน์โหลด) แล้วกดเตรียมและเปิด
หลังจากนั้นใช้ `WANGAI.exe` ในโฟลเดอร์ที่เตรียมไว้ ไฟล์ดาวน์โหลดไม่ใช่ตัวที่ต้องเปิดทุกครั้ง

รองรับ local/USB **NTFS**, Windows 10/11 **x64** ไม่รองรับ UNC/network share
ต้องมีพื้นที่สำหรับชุดไฟล์ปัจจุบัน ชุดใหม่ รุ่นก่อนหน้า และไฟล์ดาวน์โหลดระหว่างอัปเดต
ตัวเปิดจะตรวจพื้นที่และสิทธิ์เขียน ไม่สลับไป AppData โดยอัตโนมัติ

Native DLL ของ ONNX มีข้อจำกัดความยาวพาธ: ตัว worker ใช้ NTFS short name ของ
ไฟล์เดิมเมื่อมีอยู่ โดยตรวจว่าตรงกับ executable เดิม ไม่สร้าง junction หรือย้าย Data
ถ้าไดรฟ์ไม่มี short name และพาธยังยาวเกินไป ให้ย้ายทั้งโฟลเดอร์ไปตำแหน่งสั้นลง
เช่น `C:\WANGAI` ไม่ต้องเปลี่ยน Windows security/registry settings
อ้างอิง [ข้อจำกัดของ GetShortPathNameW](https://learn.microsoft.com/en-us/windows/win32/api/fileapi/nf-fileapi-getshortpathnamew)

```text
WANGAI/
  WANGAI.exe
  Data/settings.json         schema v14 + installation ID
  Data/WebView2/             profile/cache (ไม่อยู่ใน payload)
  App/portable.json          marker ของโฟลเดอร์ที่โปรแกรมเป็นเจ้าของ
  App/active.json            current / previous
  App/versions/0.3.0/        immutable signed program files
  App/.update/<uuid>/        download, staging, nonce acknowledgement, helper
  App/transaction.json       มีเฉพาะระหว่างเปลี่ยนเวอร์ชัน/กู้คืน
```

ย้ายทั้งโฟลเดอร์เมื่อปิดโปรแกรมแล้ว ไม่ย้ายเฉพาะ WANGAI.exe
ลบโฟลเดอร์เท่ากับลบ settings ด้วย สำรอง `Data` ก่อนลบหรือแก้ไขเพื่อกู้คืน
History ยังอยู่ในหน่วยความจำและหายเมื่อปิดแอป ไม่ได้เพิ่มฐานข้อมูล

## ย้ายจากตัวติดตั้ง 0.2.2

ปิดรุ่นติดตั้งก่อน เปิด Portable.exe แล้วเลือกนำ settings เดิมมาใช้หรือเริ่มใหม่
ต้นฉบับอ่านจาก `%APPDATA%/dev.gamelingo.overlay/settings.json` เท่านั้น
นำเข้าได้เมื่อ schema v14 และทุกค่าผ่านการตรวจ โดยไม่มีการ normalize แก้ค่าเงียบ ๆ
รักษา source, VAD, glossary, hotkeys, Overlay และ installation ID
คัดลอกก่อน AppState/Gateway ถูกสร้าง ต้นฉบับและตัวติดตั้งไม่ถูกแก้/ถอน
หาก Portable มี settings แล้ว จะไม่นำเข้าซ้ำ หากต้นฉบับเสีย ต้องตัดสินใจเริ่มใหม่เอง

`latest.json` ใน release ใหม่ประกาศรุ่นติดตั้งเดิม 0.2.2 พร้อม URL/ลายเซ็นเดิม
เพื่อให้ผู้ใช้รุ่นเก่าไม่เปิด Portable ด้วย NSIS updater ส่วน Portable อ่านเฉพาะ
`latest-portable.json` และไม่เรียก Tauri `.install()`

## อัปเดต / กู้คืน

ตรวจเวอร์ชันเมื่อเปิดแอป ดาวน์โหลดเฉพาะเมื่อผู้ใช้ยืนยัน ขณะดาวน์โหลดยังฟังต่อได้
ดาวน์โหลดแบบ streaming (สูงสุด 1 GiB / 20 นาที / connect 15 วินาที)
รับเฉพาะ GitHub repository/tag/file ที่กำหนดและ redirect ไป GitHub asset CDN
ตรวจ minisign ของ archive และ manifest ก่อนแตกไฟล์ staging แยกเวอร์ชัน
จำกัดขนาดขยายรวม 4 GiB และจำนวนไฟล์ 30,000 ป้องกัน traversal, ADS, reserved
Windows names, case collisions, undeclared entries, symlinks และ reparse points

เมื่อพร้อมแล้ว helper เปิด handle ของ process ปัจจุบัน ตรวจ executable path และ
แจ้งพร้อมก่อนแอปบันทึก settings/หยุด worker/เสียง/AI เก่า/ปิด Web Companion
helper ต้องเห็น shutdown acknowledgement และ process เดิมออกจริงก่อนเปลี่ยนไฟล์
ไม่ฆ่า process ด้วยการค้นหาเพียงชื่อ executable

Journal บันทึกก่อนเปลี่ยน launcher และ active pointer ตัวช่วยทำงานจาก transaction
directory เพื่อไม่ล็อก WANGAI.exe รุ่นใหม่เปิดใน Windows job ตั้งแต่ suspended
จึงควบคุมได้เฉพาะ process ที่ตนสร้างและลูกของ process นั้น
ยืนยันเมื่อ main Ready Room และ worker พร้อมด้วย nonce/version/PID ภายใน 90 วินาที
ไม่รอ AI Server หากล้มเหลวคืน binary รุ่นเก่า เปิดซ้ำได้เพียงหนึ่งครั้ง ไม่ย้อน Data
ถ้ารุ่นเก่าก็เปิดไม่ได้ ให้แสดงข้อผิดพลาดกู้คืนและหยุด ไม่วนเปิดไม่สิ้นสุด

หากไฟดับระหว่างเปลี่ยนไฟล์ เปิด WANGAI.exe จะตรวจ journal ก่อนเปิด core
เก็บรุ่นปัจจุบันและก่อนหน้าหนึ่งรุ่น ไม่ลบ directory ที่มีไฟล์ไม่รู้จัก/ลายเซ็นไม่ผ่าน
หากกู้คืนไม่ได้ อย่าลบ Data ให้สำรองไว้และเตรียม Portable ในโฟลเดอร์ใหม่เพื่อวินิจฉัย

## Build และลายเซ็น

ใช้ตัวแปร/Secrets เดิม: `WANGAI_API_BASE_URL`, `WANGAI_UPDATER_PUBLIC_KEY`,
`TAURI_SIGNING_PRIVATE_KEY`, `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`
ห้ามนำ private key, `.env`, หรือ `Data` ใส่ repository/artifact

```powershell
./scripts/package-worker.ps1
node scripts/desktop-licenses.mjs
./scripts/build-portable.ps1 -OutputRoot output/portable-build
node scripts/release-assets.mjs output/portable-build/release
```

ใช้ `CARGO_TARGET_DIR` และ `-OutputRoot` บนไดรฟ์ที่มีพื้นที่พอได้
แพ็กเกจประกอบจาก core, host, dist, frozen worker และ fixed runtime ที่กำหนดเท่านั้น
สร้าง signed manifest → ZIP → signature → append ZIP เดียวกันใน GUI host
ตรวจ subsystem ทุก `.exe` ในรายงาน `windows-subsystems.json`; user entrypoints
ต้องเป็น x64 GUI ส่วน CUI utility/worker เปิดแบบ hidden พร้อม redirected pipes เท่านั้น

WebView2 pin อยู่ที่ `portable/webview2.lock.json` รุ่น **152.0.4191.62 x64**
สคริปต์ build ดาวน์โหลด CAB ด้วย URL ตายตัวและตรวจ SHA256 ก่อนแตก ไม่ดาวน์โหลด runtime
บนเครื่องผู้ใช้ การเปลี่ยน runtime ต้องตรวจเวอร์ชัน/hash/licenses ใหม่และออก release WANGAI
สิทธิ์ Windows10 RX ของ AppContainer SIDs ตั้งเฉพาะ runtime folder ไม่มีสิทธิ์เขียนเพิ่ม
อ้างอิง [Microsoft Fixed Version distribution](https://learn.microsoft.com/en-us/microsoft-edge/webview2/concepts/distribution)

## Release gates

### Preview โดยใช้ Secret เดิมใน GitHub

Workflow `Portable Preview (no publish)` รันเมื่อ push branch
`codex/portable-preview-0.3.0` ของ repository นี้เท่านั้น ผ่าน Verify ก่อน build
และใช้ `TAURI_SIGNING_PRIVATE_KEY` / `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` เดิม
เฉพาะขั้น build/sign โดยไม่แสดงค่าหรือส่งกุญแจออกเป็น artifact
ไม่ต้องจำรหัสกุญแจเพื่อรัน CI และห้ามพยายามดึงรหัสจาก Secret ออกมาใน log

ผลลัพธ์อยู่ใน Actions Artifacts ชื่อ `WANGAI-portable-preview-<run>-<attempt>`
เก็บ 14 วัน เป็นไฟล์ที่ต่อเซิร์ฟเวอร์จริงแต่ยังต้องตรวจบนเครื่องก่อนเผยแพร่
มี `PREVIEW-BUILD.json` ระบุ commit/run และ `PREVIEW.md` บอกข้อจำกัด
workflow นี้มีเพียง `contents: read` และไม่สร้าง tag, Draft หรือ Published Release
ไม่อัปโหลด manifest ไปยัง updater channel และไม่เปลี่ยน Secret/Variables
ดาวน์โหลด artifact แล้วใช้ Portable.exe ในโฟลเดอร์ใหม่ ไม่ทับ `Data` ของชุดเดิม

CI สร้าง Draft เท่านั้น ห้าม publish โดยอาศัยเพียง build ผ่าน
ดู [ผลการตรวจและสิ่งที่ยังต้องทดสอบ](portable-verification.md)
ต้องตรวจ clean Windows standard-user, offline worker/Fixed WebView2, UI keyboard/DPI,
ย้ายโฟลเดอร์/ไดรฟ์, import, update idle/listening, rollback/crash และ legacy channel ก่อนเผยแพร่

ไม่มี Windows Authenticode certificate: updater signatures ตรวจความถูกต้องของแพ็กเกจ
แต่ไม่ทำให้ unknown-publisher/SmartScreen warning หายไป
