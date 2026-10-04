# WANGAI: Linear → GitHub → Discord

Automation สำหรับ `HectorRussia/wangai-overlay` ดัดแปลงจาก
[Book_fantasy snapshot f6dcfb2](https://github.com/HectorRussia/beastscribe/tree/f6dcfb2153e828a9b50307b1262b01a2f7a2cd93)
ตามแนวทางที่เจ้าของโปรเจกต์ให้มา โดยเปลี่ยนทีมเป็น OVE และ Discord เป็นห้องข้อความปกติ

## ค่าที่ใช้

| รายการ | ค่า |
| --- | --- |
| Linear workspace / team | `foro` / `Overlay_wangnai` (`OVE`) |
| Development / production branch | `dev` / `main` |
| สถานะ | `In Progress` → `In Review` → `QA` → `Prod` |
| Linear repository secret | `OVERLAY_WANGAI` → env `LINEAR_API_KEY` |
| Discord repository secret | `DISCORD_WEBHOOK_URL` |
| Discord text channel | [1555581629072670781](https://discord.com/channels/1547404099291447380/1555581629072670781) |
| ชื่อผู้ส่ง / เขตเวลา | `WANGAI Bot` / `Asia/Bangkok` |

ค่าลับอยู่ใน GitHub Actions secrets เท่านั้น ไม่ใส่ API key หรือ URL webhook จริงในเอกสาร/โค้ด/log
Linear personal API key ต้องอ่านและเขียนทีม OVE ได้ ไม่เติม `Bearer` หน้า key
Discord webhook ต้องอยู่ในห้องด้านบนและไม่มี `thread_id`; สคริปต์อ่าน metadata ของ webhook
เพื่อตรวจ channel ก่อนเขียน Linear แล้วตรวจ channel และ message ID หลังส่งด้วย `wait=true`

## Flow

| เหตุการณ์ | ผล |
| --- | --- |
| สร้าง/copy/push branch โดยไม่มี PR | ไม่เปลี่ยนสถานะ |
| เปิด Draft PR | ไม่เปลี่ยนสถานะ |
| เปิด/เปิดใหม่/แก้ไข/push PR พร้อมตรวจเข้า dev หรือ Ready for review | เฉพาะ In Progress → In Review |
| Merge feature เข้า dev | เฉพาะ In Progress หรือ In Review → QA; ไม่ส่ง Discord |
| Merge dev เข้า main ด้วย **Create a merge commit** | เฉพาะ QA → Prod แล้วส่งสรุป Discord |
| Merge feature เข้า main โดยตรง | ส่ง Discord แต่ไม่เปลี่ยนสถานะ Linear |
| ปิด PR โดยไม่ merge หรือ PR จาก fork | ไม่เปลี่ยนสถานะและไม่ส่ง Discord |

`Prod` หมายถึง merge เข้า production branch แล้ว ไม่ได้ยืนยันว่า build/deploy/ออกเวอร์ชันสำเร็จ
release pipeline เดิมยังทำงานจาก tag ตามเดิม Automation นี้ไม่สร้าง tag และไม่ปล่อยแอป

ผู้ใช้ลากเข้า In Progress เอง ใช้ชื่อ branch จาก Linear เช่น
`ponkritwo/ove-6-flow-noti-on-discord` รองรับตัวพิมพ์เล็ก/ใหญ่ หนึ่ง issue ต่อ branch
ไม่อ่านรหัสจาก title, description หรือ commit message; รหัสบางส่วน เช่น `XOVE-6` หรือ `OVE-6abc` ใช้ไม่ได้
หลายรหัสใน feature → dev จะถูกข้ามพร้อมเหตุผล; หลายรหัสใน release จะ fail ก่อนเปลี่ยน Prod หรือส่งข้อความ
งานที่เป็น Prod, Done, Canceled, reject, Todo หรือสถานะอื่น และงาน archived จะไม่ถูกเขียนทับ
การลากสถานะใน Linear อย่างเดียวไม่เรียก GitHub Actions

release ใช้สอง parent SHA ของ merge commit และจับคู่ merge SHA ของ PR ย่อยที่เข้า dev
อ่านทุกหน้าและตัด issue ซ้ำ จึงไม่ปนงานก่อนรอบ release หรือหลัง snapshot นั้น
ต้องใช้ merge commit สำหรับ dev → main; squash/rebase release จะ fail แทนการเดารายการงาน

## ติดตั้งและตรวจรับ

1. ตรวจว่า OVE มีชื่อสถานะครบและ secrets ข้างต้นพร้อมใช้งาน
2. ตรวจ Linear Settings ของทีม OVE → GitHub automation แล้วปิดการเปลี่ยนสถานะที่ซ้ำกับ flow นี้
   รวมการเริ่มงานเมื่อ copy branch name โดยตรวจผลต่อ repository อื่นของทีมด้วย
   PR attachment integration ใช้ร่วมกันได้; ไม่จำเป็นต้องปิด integration ทั้งตัว
3. เปิด PR ติดตั้งเข้า dev ก่อน Job sync โหลดสคริปต์จาก dev ที่ผ่าน merge แล้ว
   ถ้ายังไม่มีสคริปต์จะรายงาน **Bootstrap skipped** และไม่ใช้ secret ไม่ถือว่าได้ทดสอบ Linear แล้ว
4. ให้ Verify ผ่านก่อน merge เข้า dev; การ merge PR ติดตั้งอาจอัปเดต OVE-6 → QA
   ส่วน In Review ต้องตรวจด้วย PR ทดสอบหลังติดตั้ง ไม่อ้างว่า bootstrap ยืนยัน flow นี้
5. สร้าง issue ทดสอบใหม่ใน OVE สถานะ In Progress และ feature branch จาก dev
   ทดสอบ Draft → Ready → In Review แล้ว merge เข้า dev → QA โดยรอ sync สำเร็จก่อน release
6. เจ้าของเปิด/merge PR dev → main ด้วย **Create a merge commit** ตาม branch rules เดิม
   `windows` และ `server` ยังเป็น required checks เดิม อย่าใช้ job แจ้ง Discord หลัง merge เป็น required check ก่อน merge
7. ตรวจ Actions ว่าอัปเดต QA → Prod จริง และตรวจข้อความในห้องที่ระบุ
   เก็บ PR URL, Actions run URL, channel ID และ message ID เป็นหลักฐาน

GitHub default branch เป็น dev แต่ Discord โหลดสคริปต์จาก main โดยระบุ ref ชัดเจน
workflows ไม่รันโค้ด feature branch ในขั้นตอนที่ใช้ secret และตั้ง `persist-credentials: false`
GitHub token ใช้ `contents: read` และ `pull-requests: read`; Actions ปักหมุดด้วย commit SHA
ผู้มีสิทธิ์แก้ workflow ใน repo ยังเข้าถึง secrets ผ่าน workflow ได้ ต้องรักษาสิทธิ์ผู้ร่วมงานตามเดิม

## ตรวจโค้ดโดยไม่เรียกบริการจริง

ใช้ Node.js 24 จาก root ของ repo:

```sh
node --check .github/scripts/linear-status-sync.mjs
node --check .github/scripts/discord-main-merge.mjs
node --test .github/scripts/linear-status-sync.test.mjs .github/scripts/discord-main-merge.test.mjs
actionlint -shellcheck= .github/workflows/linear-status-sync.yml .github/workflows/discord-main-merge.yml .github/workflows/verify.yml
```

Verify มี job `automation` รัน syntax checks และ tests แบบ mock แยกจาก Windows/server
ครอบคลุม transitions, stale events, rerun, archived/manual states, fork, identifiers,
pagination/release snapshots, webhook preflight, ข้อจำกัดข้อความ และ API failures ที่ไม่เผยค่าลับ
Mock tests ผ่านไม่ได้หมายความว่า key, Linear automation หรือ webhook จริงได้รับการตรวจแล้ว

## เมื่อ workflow ล้มเหลว

- ดูข้อความที่ควบคุมแล้วใน Actions summary ห้ามเพิ่ม log ของ token, webhook URL, headers หรือ raw response
- ถ้า workspace/team/สถานะหรือปลายทางผิด ให้แก้การตั้งค่าก่อน rerun
- ถ้า Linear อัปเดตสำเร็จบางงานแล้ว job จะ fail และไม่ส่งข้อความสำเร็จ เมื่อ rerun จะข้ามงานที่เป็น Prod แล้ว
- ถ้า Discord ล้มเหลวหลังเปลี่ยน Prod จะไม่ย้อนเป็น QA; summary แสดงจำนวนข้อความที่ยืนยันได้
- timeout หรือ rerun อาจทำให้ข้อความซ้ำ ระบบนี้ไม่มีฐานข้อมูลกันส่งซ้ำ ให้ตรวจห้องก่อน rerun
- Linear ไม่มี atomic conditional update จึงยังมีช่วงสั้น ๆ ที่การลากด้วยมืออาจชนกับ API update
- ถ้าหลาย PR อ้าง issue เดียวกัน การ merge PR แรกเข้า dev ก็อาจทำให้งานเป็น QA ไม่รอทุก PR
- หยุด automation ได้โดย disable workflows `Linear status sync` และ `Discord main merge` ใน Actions
  การหยุด workflow ไม่ย้อนสถานะหรือข้อความที่สร้างไปแล้ว
