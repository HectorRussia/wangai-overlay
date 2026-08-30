# WANGAI Realtime Translator Overlay

WANGAI เป็น Windows overlay สำหรับแปลเสียงพูดในเกมแบบ realtime โดยจับ process tree ของเกมและ Discord/แอป voice chat เป็นคนละ WASAPI Application Loopback ไม่ inject DLL และไม่แตะ memory/renderer ของเกม พร้อม System Output fallback แบบ `MIXED` สำหรับเกมที่แยก voice chat ไว้นอก process tree

- เสียงเกมอังกฤษ: แสดงสถานะกำลังฟัง แล้วแสดง English final + คำแปลไทยเมื่อจบวลี
- กด `F9` ค้างแล้วพูดไทย: ถอดเสียงและแปลเป็นอังกฤษ พร้อมปุ่ม Copy / `F10`
- Silero VAD แยก state/cursor สำหรับ GAME และ VOICE CHAT ส่วน F9 ใช้จังหวะกด/ปล่อยเป็นขอบเขตวลี แล้วส่งเฉพาะวลีที่จบแล้วไป Groq Whisper
- Overlay รวมข้อความตามเวลาและติดป้าย `GAME`, `DISCORD` หรือ `MIXED`; Rescue Scan ใช้ PCM ต้นฉบับและกรอง activity/confidence ก่อนยอมรับผล
- ส่งเฉพาะ final transcript ไป Groq Chat Completions เพื่อแปลภาษา และไม่บันทึกไฟล์เสียง
- รองรับ Borderless และ Windowed; ไม่รองรับ Exclusive Fullscreen

## โครงสร้าง

```text
React/TypeScript UI
       ↕ typed Tauri events/commands
Rust: process picker · WASAPI · hotkeys · secrets · Groq Whisper/translation · budget
       ↕ framed binary stdin / JSONL stdout
Python 3.12: Silero VAD only
```

Rust downmix/resample เป็น PCM mono 16 kHz และส่งเสียงเกมพร้อม sample cursor ให้ Python ผ่าน stdin โดยไม่มี local TCP port เมื่อ VAD จบวลี Rust จะตัดช่วงเสียงตาม cursor แล้วสร้าง WAV ในหน่วยความจำเพื่อส่งไป Groq ผ่าน HTTPS ส่วน Groq key อยู่ใน Windows Credential Manager และไม่เข้าสู่ React/Python

## ติดตั้งสำหรับพัฒนา

ต้องมี Windows 11, Node.js, pnpm, Rust MSVC toolchain และ Visual Studio C++ Build Tools

```powershell
pnpm install
powershell -ExecutionPolicy Bypass -File .\scripts\bootstrap.ps1
pnpm tauri dev
```

สคริปต์ bootstrap ใช้ `uv` ดาวน์โหลด Python 3.12 ให้โดยอัตโนมัติถ้ามี uv; ถ้าไม่มี uv ต้องติดตั้ง Python 3.12 ให้ `py -3.12` เรียกได้ Silero VAD จะเตรียมโมเดล ONNX เมื่อเปิด worker ครั้งแรก

สำหรับเช็ก UI/IPC โดยไม่โหลด Silero:

```powershell
$env:GAMELINGO_MOCK_VAD = "1"
pnpm tauri dev
```

หากต้องการชี้ Python เอง ให้ตั้ง `GAMELINGO_PYTHON` เป็น absolute path ของ `python.exe`

## ตั้งค่า Groq

1. สร้าง API key และตรวจสิทธิ์ใช้งานที่ [Groq Console](https://console.groq.com/keys)
2. เปิด WANGAI แล้วใส่ Groq API key ในหน้า **Groq Whisper + Translation**
3. กด **ทดสอบคำแปล** ก่อนเริ่มฟังเกม
4. เลือก Whisper สำหรับเกม, Whisper สำหรับ F9 และ translation model แยกกันได้ โดยมีผลกับคำขอถัดไปทันที ค่าแนะนำคือ Large V3 สำหรับเกมและ Turbo สำหรับ F9

แอปมี hard limit ภายใน `$2/เดือน` ครอบคลุมทั้ง Whisper STT และ token การแปล โดยคิดตามโมเดลที่ใช้และขั้นต่ำเสียง 10 วินาทีต่อคำขอ แอปจะหยุดส่งเสียงและข้อความใหม่เมื่อถึงเพดาน ไม่มี local Whisper fallback ยอดใน Groq Billing เป็นยอดจริงและอาจต่างจากค่าประมาณหากราคาเปลี่ยน

## วิธีใช้กับ Mistfall Hunter

1. ตั้งเกมเป็น Borderless หรือ Windowed
2. เปิดเกม แล้วกดรีเฟรชใน **เลือกเกมที่จะฟัง**
3. เลือก `Mistfall Hunter` (`MistfallHunter-Win64-Shipping.exe`) ซึ่งจะถูกเรียงเป็นอันดับแรก
4. กด `F8` เริ่มฟัง หน้า Audio จะแสดง PID ที่เลือก, process root ที่จับจริง และระดับเสียง dBFS
5. ใน **Voice chat diagnostics** ให้เปิด Auto-detect เพื่อหา Discord Stable/PTB/Canary หรือเลือก process อื่นเอง GAME และ DISCORD จะมี meter, PID, VAD และ queue แยกกัน
6. หาก Process Tree ไม่ได้รับ voice chat ภายในเกม ให้เปิด **System Output fallback** หลังอ่านคำเตือนว่าอาจรวมเสียง Discord/browser/การแจ้งเตือน โหมดนี้หยุดสาย Discord แยกเพื่อป้องกันข้อความซ้ำ และติดป้ายผลเป็น `MIXED`
7. ใน **Mistfall output device** เลือก Speakers, หูฟัง หรือจอที่ได้ยินเสียง Mistfall อยู่จริง หรือเลือก `Windows default` เพื่อให้ตามอุปกรณ์หลักของ Windows การเปลี่ยน endpoint จะ restart เฉพาะ game capture
8. หน้า Game audio diagnostics จะแสดงชื่อ endpoint ที่จับจริง หากไม่มี frame ภายใน 3 วินาทีให้ลอง endpoint อื่น ถ้าอุปกรณ์ที่บันทึกไว้ถูกถอด แอปจะหยุด capture และไม่ fallback ไปอุปกรณ์อื่นเอง
   หาก meter ขึ้นแต่ Silero ไม่พบคำพูด ให้กด **ตรวจเสียง 6 วิล่าสุดด้วย Groq** ทันทีหลังเพื่อนพูด เพื่อแยกว่า endpoint มีเสียงเพื่อนจริงหรือมีเพียงเสียงเกม การทดสอบนี้ข้าม VAD และถูกคิดขั้นต่ำ 10 วินาทีหนึ่งครั้ง
9. Process Tree, System Output และ Voice Chat จำค่า VAD แยกกัน ทั้ง manual gain และ auto-level เปลี่ยนเฉพาะสำเนาที่ส่ง Silero ไม่เปลี่ยน PCM ต้นฉบับที่ส่ง Groq
10. เกมปิดแล้วแอปจะรอและ auto-attach เมื่อ process เดิมเปิดใหม่ ส่วน Discord ปิดจะหยุดเฉพาะสาย Discord กด `F7` เพื่อย้าย/ปรับขนาด overlay

Hotkeys เริ่มต้น:

| ปุ่ม | การทำงาน |
| --- | --- |
| `F8` | เปิด/ปิดการฟังเกม |
| `F9` ค้าง | พูดภาษาไทย |
| `F10` | Copy คำตอบอังกฤษล่าสุด |
| `F7` | ลาก/ปรับ overlay |

## การทดสอบ

```powershell
pnpm build
cargo test --manifest-path .\src-tauri\Cargo.toml
python .\worker\main.py --self-test
$env:PYTHONPATH = "worker"
python -m unittest worker\test_worker.py worker\test_integration.py
```

ไฟล์ settings อยู่ใน `%APPDATA%\dev.gamelingo.overlay\settings.json` แต่ key ไม่อยู่ในไฟล์นี้ Transcript เก็บใน RAM ไม่เกิน 100 รายการและหายเมื่อปิดแอป

## ขอบเขต MVP

GAME และ Discord แยกกันได้เมื่อทั้งคู่มี Windows process audio session ของตนเอง แต่เสียงเพื่อน/NPC/SFX ภายใน process tree เกมเดียวกันยังแยกผู้พูดไม่ได้ ส่วน System Output fallback เป็นเสียงรวมและไม่พยายามเดาต้นทางด้วย AI แอปไม่ auto-type เข้าเกม ไม่มี TTS/virtual mic, speaker identification, updater หรือ installerสำหรับแจกสาธารณะ
