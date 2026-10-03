export const scenarios = [
  {
    id: "game",
    label: "ในเกม",
    source: "GAME VOICE",
    person: "TEAMMATE",
    english: "Stay together. I'll cover you.",
    thai: "อยู่ด้วยกันไว้ เดี๋ยวฉันคุ้มกันให้",
    reply: "โอเค ฉันจะตามไป",
    translatedReply: "Okay, I'll follow you.",
  },
  {
    id: "discord",
    label: "ใน Discord",
    source: "DISCORD",
    person: "YOUR FRIEND",
    english: "Want to play one more round?",
    thai: "เล่นด้วยกันอีกสักตาไหม?",
    reply: "ได้เลย ขอเวลาสักครู่",
    translatedReply: "Sure, give me a moment.",
  },
  {
    id: "video",
    label: "ในวิดีโอ",
    source: "BROWSER",
    person: "VIDEO AUDIO",
    english: "Let's take it one step at a time.",
    thai: "เรามาค่อย ๆ ทำไปทีละขั้นตอนกัน",
    reply: "ช่วยอธิบายขั้นตอนนี้อีกครั้งได้ไหม",
    translatedReply: "Could you explain this step again?",
  },
] as const;

export const faqs = [
  {
    question: "WANGAI ใช้ทำอะไรได้บ้าง?",
    answer:
      "ใช้ได้ทั้งเกมและแอปอื่น ๆ เช่น Discord หรือเบราว์เซอร์ ว่าไงรับเสียงจากแอปที่คุณเลือก แล้วแสดงคำแปลเป็นข้อความบนจอ ฟังอังกฤษแล้วอ่านไทย หรือพูดไทยเพื่อดูประโยคอังกฤษที่ใช้ตอบกลับ",
  },
  {
    question: "รองรับระบบอะไร และใช้กับเกมแบบไหนได้?",
    answer:
      "สำหรับ Windows 10/11 แบบ x64 ใช้ overlay กับเกมในโหมด Borderless หรือ Windowed ไม่รองรับ Exclusive Fullscreen และควรตรวจสอบข้อกำหนดของเกมที่คุณใช้งาน",
  },
  {
    question: "ต้องต่ออินเทอร์เน็ตไหม?",
    answer:
      "ต้องต่ออินเทอร์เน็ต เพราะว่าไงใช้บริการ AI ออนไลน์เพื่อแปลงเสียงเป็นข้อความและแปลภาษา",
  },
  {
    question: "ฟังเกมกับ Discord พร้อมกันได้ไหม?",
    answer:
      "โหมดปกติเลือกฟังได้ครั้งละหนึ่งแอป หากเลือกเบราว์เซอร์อาจรวมเสียงจากหลายแท็บ ส่วนโหมด System Output เป็นเสียงรวมของเครื่อง ซึ่งอาจมีเสียงแจ้งเตือนหรือแอปอื่นเข้ามาด้วย",
  },
  {
    question: "รองรับภาษาอะไรบ้าง?",
    answer:
      "ตอนนี้รองรับเสียงอังกฤษ → คำแปลไทย และเสียงไทย → คำแปลอังกฤษ โดยจะแสดงคำแปลเป็นข้อความ และจะเพิ่มภาษาอื่น ๆ ในอนาคต",
  },
  {
    question: "เสียงและบทสนทนาถูกจัดการอย่างไร?",
    answer:
      "เสียงจะส่งผ่านเซิร์ฟเวอร์ WANGAI ไปยังบริการ AI เพื่อถอดเสียงและแปล แอปไม่บันทึกไฟล์เสียง และประวัติข้อความในแอปจะหายเมื่อออกจากโปรแกรม เซิร์ฟเวอร์เก็บสถิติการใช้งานแยกจากบทสนทนา ส่วนบริการ AI มีนโยบายจัดการข้อมูลของตัวเอง อ่านรายละเอียดได้ในนโยบายความเป็นส่วนตัวด้านล่าง",
  },
] as const;
