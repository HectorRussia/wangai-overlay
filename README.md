# GameLingo Realtime Translator Overlay

GameLingo เป็น Windows overlay สำหรับแปลเสียงพูดในเกมแบบ realtime โดยจับเสียงเฉพาะ process เกมด้วย WASAPI Application Loopback ไม่ inject DLL และไม่แตะ memory/renderer ของเกม

- เสียงเกมอังกฤษ: แสดง English partial ระหว่างพูด แล้วแสดง English final + คำแปลไทย
- กด `F9` ค้างแล้วพูดไทย: ถอดเสียงและแปลเป็นอังกฤษ พร้อมปุ่ม Copy / `F10`
- Silero VAD ตรวจจับคำพูดในเครื่อง แล้วส่งเฉพาะช่วงคำพูดไป xAI Streaming STT
- ส่งเฉพาะ final transcript ไป Grok เพื่อแปลภาษา และไม่บันทึกไฟล์เสียง
- รองรับ Borderless และ Windowed; ไม่รองรับ Exclusive Fullscreen

## โครงสร้าง

```text
React/TypeScript UI
       ↕ typed Tauri events/commands
Rust: process picker · WASAPI · hotkeys · secrets · xAI STT · Grok · budget
       ↕ framed binary stdin / JSONL stdout
Python 3.12: Silero VAD only
```

Rust downmix/resample เป็น PCM mono 16 kHz และส่งให้ Python ผ่าน stdin โดยไม่มี local TCP port เมื่อ VAD พบคำพูด Rust จะแปลงเป็น PCM16 และส่งไป xAI ผ่าน WebSocket ส่วน xAI key อยู่ใน Windows Credential Manager และไม่เข้าสู่ React/Python

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

## ตั้งค่า xAI / Grok

1. สร้าง API key และเติมเครดิตที่ [xAI Console](https://console.x.ai/)
2. เปิด GameLingo แล้วใส่ xAI API key ในหน้า **xAI Streaming STT + Grok**
3. กด **ทดสอบคำแปล** ก่อนเริ่มฟังเกม

แอปมี hard limit ภายใน `$2/เดือน` ครอบคลุมทั้ง Streaming STT และ token การแปล โดยใช้อัตราที่กำหนดในโค้ดเพื่อประมาณค่าใช้จ่าย แอปจะหยุดส่งเสียงและข้อความใหม่เมื่อถึงเพดาน ไม่มี local Whisper fallback ยอดใน xAI Billing เป็นยอดจริงและอาจต่างจากค่าประมาณเล็กน้อยหาก xAI เปลี่ยนราคา

## วิธีใช้กับ Mistfall Hunter

1. ตั้งเกมเป็น Borderless หรือ Windowed
2. เปิดเกม แล้วกดรีเฟรชใน **เลือกเกมที่จะฟัง**
3. เลือก `Mistfall Hunter` (`MistfallHunter-Win64-Shipping.exe`) ซึ่งจะถูกเรียงเป็นอันดับแรก
4. กด `F8` เริ่มฟัง เกมปิดแล้วแอปจะรอและ auto-attach เมื่อ process เดิมเปิดใหม่
5. กด `F7` เพื่อย้าย/ปรับขนาด overlay จากนั้นกดบันทึกตำแหน่ง

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

เสียงเอฟเฟกต์และ voice chat ที่ออกจาก process เดียวกันอาจเข้ามาพร้อมกัน; MVP ใช้ Silero VAD และ xAI STT รับมือแต่ยังไม่มี source separation แอปไม่ auto-type เข้าเกม ไม่มี TTS/virtual mic, speaker identification, updater หรือ installerสำหรับแจกสาธารณะ
