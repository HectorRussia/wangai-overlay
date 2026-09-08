# WANGAI Realtime Translator Overlay

WANGAI เป็น Windows overlay สำหรับแปลเสียงพูดแบบ realtime ผู้ใช้เลือกแอปที่จะฟังครั้งละหนึ่งโปรแกรม เช่น Mistfall, Discord หรือ Chrome ผ่าน WASAPI Application Loopback โดยไม่ inject DLL และไม่แตะ memory/renderer พร้อม Local Web Companion ที่ควบคุม Desktop engine จาก browser บนเครื่องเดียวกัน

- เสียงเกมอังกฤษ: แสดงสถานะกำลังฟัง แล้วแสดง English final + คำแปลไทยเมื่อจบวลี
- กด `F9` ค้างแล้วพูดไทย: ถอดเสียงและแปลเป็นอังกฤษ พร้อมปุ่ม Copy / `F10`
- ระบบมี audio stream จริงเพียง `INCOMING` และ `MICROPHONE`; F9 ใช้จังหวะกด/ปล่อยเป็นขอบเขตวลี แล้วส่งเฉพาะวลีที่จบแล้วไป Groq Whisper
- Overlay ติดป้ายตามแอปที่เลือก เช่น `MISTFALL`, `DISCORD`, `CHROME` หรือ `MIXED`; Rescue Scan ใช้ PCM ต้นฉบับและกรอง activity/confidence ก่อนยอมรับผล
- ส่งเฉพาะ final transcript ไป Groq Chat Completions เพื่อแปลภาษา และไม่บันทึกไฟล์เสียง
- รองรับ Borderless และ Windowed; ไม่รองรับ Exclusive Fullscreen

## โครงสร้าง

```text
React/TypeScript UI
       ↕ Tauri commands หรือ loopback REST/WebSocket
Axum Local Web Companion · 127.0.0.1 · session cookie
       ↕
Rust: process picker · WASAPI · hotkeys · secrets · Groq Whisper/translation · budget
       ↕ framed binary stdin / JSONL stdout
Python 3.12: Silero VAD only
```

Rust downmix/resample เป็น PCM mono 16 kHz และส่งเสียงพร้อม sample cursor ให้ Python ผ่าน stdin เมื่อ VAD จบวลี Rust จะตัดช่วงเสียงตาม cursor แล้วสร้าง WAV ในหน่วยความจำเพื่อส่งไป Groq ผ่าน HTTPS ส่วน Groq key อยู่ใน Windows Credential Manager และไม่เข้าสู่ React/Python/REST/WebSocket

Local Web Companion bind เฉพาะ `127.0.0.1`; production ขอ port ว่างจาก Windows ทุกครั้งและคืน port เมื่อ Desktop ปิด ปุ่ม **เปิด Web App** แลก token ใน URL fragment เป็น `HttpOnly`/`SameSite=Strict` cookie หน้าเว็บตั้งหรือลบ Groq API key ไม่ได้และใช้งานไม่ได้เมื่อ Desktop engine ปิด

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
4. เลือก Whisper สำหรับเสียงขาเข้า, Whisper สำหรับ F9 และ translation model แยกกันได้ โดยมีผลกับคำขอถัดไปทันที ค่าแนะนำคือ Large V3 สำหรับเสียงขาเข้าและ Turbo สำหรับ F9

แอปมี hard limit ภายใน `$2/เดือน` ครอบคลุมทั้ง Whisper STT และ token การแปล โดยคิดตามโมเดลที่ใช้และขั้นต่ำเสียง 10 วินาทีต่อคำขอ แอปจะหยุดส่งเสียงและข้อความใหม่เมื่อถึงเพดาน ไม่มี local Whisper fallback ยอดใน Groq Billing เป็นยอดจริงและอาจต่างจากค่าประมาณหากราคาเปลี่ยน

## วิธีใช้กับ Mistfall Hunter

เปิด WANGAI แล้วจะเห็น Ready Room ก่อน โดย Overlay ยังซ่อนอยู่ เมื่อกด **เริ่มฟัง / F8** สำเร็จ จะแสดง Overlay เพิ่มขึ้นโดยหน้าตั้งค่ายังเปิดอยู่ ผู้ใช้ย่อหรือปิดหน้าตั้งค่าเองได้ ส่วน Overlay จะย่อหรือขยายตามกิจกรรมเสียง กด F8 หยุดฟังเพื่อกลับหน้าตั้งค่า หรือกดเฟืองบน Overlay เพื่อเปิดหน้าตั้งค่าโดยยังฟังต่อได้ ปุ่ม X ขณะกำลังฟังจะซ่อนเฉพาะหน้าตั้งค่าและแสดง Overlay; หากไม่ได้ฟังอยู่จะปิดโปรแกรม ปุ่ม **ออกจากโปรแกรม** ปิด WANGAI ทั้งหมดได้ทุกเมื่อ เมื่อ Overlay ขยายและล็อกคลิกทะลุ ให้กด hotkey แก้ไข Overlay (เริ่มต้น F7) ก่อนคลิกเฟือง

1. ตั้งเกมเป็น Borderless หรือ Windowed
2. เปิดเกม แล้วกดรีเฟรชใน **แหล่งเสียงที่ฟัง**
3. เลือก `Mistfall Hunter` ซึ่งรวม process root/Shipping เป็นแอปเดียว แล้วระบบจะจับจาก root ของเกม
4. กด `F8` เริ่มฟัง หน้า Audio จะแสดง PID ที่เลือก, process root ที่จับจริง และระดับเสียง dBFS
5. หาก Process Tree ไม่ได้รับ voice chat ภายในเกม ให้เปิด **System Output fallback** หลังอ่านคำเตือนว่าอาจรวมเสียง Discord/browser/การแจ้งเตือน และติดป้ายผลเป็น `MIXED`
6. ใน **Output endpoint** เลือก Speakers, หูฟัง หรือจอที่ได้ยินเสียงแอปอยู่จริง หรือเลือก `Windows default` เพื่อให้ตามอุปกรณ์หลักของ Windows
7. หน้า Incoming audio diagnostics จะแสดงชื่อ endpoint ที่จับจริง หากไม่มี frame ภายใน 3 วินาทีให้ลอง endpoint อื่น ถ้าอุปกรณ์ที่บันทึกไว้ถูกถอด แอปจะหยุด capture และไม่ fallback ไปอุปกรณ์อื่นเอง
   หาก meter ขึ้นแต่ Silero ไม่พบคำพูด ให้กด **ตรวจเสียง 6 วิล่าสุดด้วย Groq** ทันทีหลังเพื่อนพูด เพื่อแยกว่า endpoint มีเสียงเพื่อนจริงหรือมีเพียงเสียงเกม การทดสอบนี้ข้าม VAD และถูกคิดขั้นต่ำ 10 วินาทีหนึ่งครั้ง
8. Process Tree และ System Output จำค่า VAD แยกกัน ทั้ง manual gain และ auto-level เปลี่ยนเฉพาะสำเนาที่ส่ง Silero ไม่เปลี่ยน PCM ต้นฉบับที่ส่ง Groq
9. แอปที่เลือกปิดแล้ว WANGAI จะหยุดฟังและรอ auto-attach เมื่อ process เดิมเปิดใหม่ กด `F7` เพื่อย้าย/ปรับขนาด overlay

## Browser Media และ Web Companion

ตัวเลือกแอปตรวจ process ที่กำลังรันจริงร่วมกับข้อมูลหน้าต่างและชื่อผลิตภัณฑ์จาก Windows ไม่จำกัดรายชื่อแอป รวม process ลูกเป็นหนึ่งแถวต่อ executable และแยกโปรแกรมที่ติดตั้งคนละตำแหน่ง หากแอปเดียวมีหลาย instance อิสระ ให้ขยายเลือก instance ที่ต้องการ รายการรีเฟรชเมื่อเปิด picker และทุก 5 วินาทีระหว่างเปิดอยู่ ค้นหาได้จากชื่อผลิตภัณฑ์, ชื่อ `.exe` และ path; PID/path ดูได้ในรายละเอียด ส่วน Browser Preview ใช้ข้อมูลจำลองเท่านั้น

Desktop ใช้คำสั่ง `list_running_apps`; Local Web Companion ใช้ `GET /api/v1/apps` ที่ต้องมี session ทั้งสองทางคืน `RunningApp` ชุดเดียวกัน การพบแอปในรายการไม่ได้หมายความว่าแอปนั้นกำลังส่งเสียง

1. ใน Ready Room แถว **แหล่งเสียงที่ฟัง** กด **เปลี่ยน** แล้วเลือก Chrome, Edge, Firefox หรือ Brave
2. WANGAI จับ process family ของ browser ที่เลือก แต่ browser เดียวกันอาจรวมเสียงจากทุกแท็บ ไม่รับประกันการแยกเฉพาะ YouTube tab และจะไม่ฟังเกมหรือ Discord พร้อมกัน
3. ใน Desktop กด **เปิด Web App** เพื่อเปิด UI ชุดเดียวกัน เว็บควบคุม listening, sources, models, VAD, glossary, hotkeys และ Overlay ได้ แต่การตั้ง/ลบ API key ต้องทำใน Desktop
4. Development ใช้ Axum ที่ `127.0.0.1:1431` และ Vite proxy `/api`; production ใช้ loopback port แบบ dynamic จึงไม่ค้างชน port เดิม

Hotkeys เริ่มต้น:

| ปุ่ม | การทำงาน |
| --- | --- |
| `F8` | เปิด/ปิดการฟังแอปที่เลือก |
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

WANGAI ฟังแอปขาเข้าได้ครั้งละหนึ่งโปรแกรม เสียงเพื่อน/NPC/SFX ภายใน process tree เดียวกันและหลายแท็บใน browser เดียวกันยังแยกไม่ได้ ส่วน System Output fallback เป็นเสียงรวมและไม่พยายามเดาต้นทางด้วย AI แอปไม่ auto-type เข้าเกม ไม่มี TTS/virtual mic, speaker identification, updater หรือ public cloud deployment
