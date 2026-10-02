# WANGAI Desktop

โค้ดและเครื่องมือของแอป Windows อยู่ในโฟลเดอร์นี้ทั้งหมด ส่วน `../landing` เป็นเว็บไซต์แยกกัน ไม่มี workspace หรือ dependency installation ร่วมกัน

```text
src/             React UI, state และ transport adapters
src-tauri/       Tauri commands, audio capture และ application operations
worker/          Python VAD worker และ protocol
portable/        Native launcher, package verification และ update transactions
assets/          Fonts และไฟล์ static ของ Desktop
scripts/         Bootstrap, packaging, release และ acceptance checks
```

`dist/`, `output/`, `node_modules/`, `.venv/`, `.packaging-venv/` และ Cargo targets เป็น generated files ที่อยู่ใต้ Desktop และไม่ commit

## เริ่มพัฒนา

จาก repository root:

```powershell
cd apps/desktop
pnpm install --frozen-lockfile
./scripts/bootstrap.ps1
pnpm tauri dev
```

หรือใช้ `pnpm --dir apps/desktop dev` จาก root เพื่อเปิดเฉพาะ frontend preview คำสั่งอื่นในหน้านี้รันจาก `apps/desktop`

## ตรวจและแพ็ก

```powershell
pnpm test
pnpm format:check
pnpm build
cargo test --locked --manifest-path src-tauri/Cargo.toml
cargo test --locked --manifest-path portable/Cargo.toml --features host
.packaging-venv/Scripts/python.exe -m unittest discover -s worker -v
.packaging-venv/Scripts/python.exe scripts/test-package-portable.py
.packaging-venv/Scripts/python.exe scripts/test-portable-preview.py
./scripts/package-worker.ps1
```

Packaging scripts ใช้ Desktop root เป็น working directory จึงวาง artifacts ใต้ `apps/desktop/output/` โดยชื่อ binary, CLI arguments และรูปแบบ package คงเดิม Release notes และ third-party notices อ่านจาก `../../docs/`; สัญญา AI ใช้ crate `../../ai-protocol/`

เครื่องที่มี checkout ก่อนย้ายอาจมี Cargo cache เก็บ absolute path เดิม หากพบ Tauri permission path ที่ชี้เข้า root เก่า ให้รัน `cargo clean --manifest-path src-tauri/Cargo.toml` แล้ว build ใหม่ สำหรับ Node ให้ติดตั้ง dependencies จาก directory ใหม่นี้อีกครั้ง; Python virtual environment สามารถสร้างใหม่ด้วย bootstrap/package-worker ตามคำสั่งข้างต้น

ดู [แผนผังโมดูล](../../docs/architecture.md), [Portable guide](../../docs/windows-portable.md) และ [ผลตรวจการย้าย](../../docs/desktop-layout.md)
