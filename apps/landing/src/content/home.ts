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
      "ฟังเสียงภาษาอังกฤษจากแอปที่เลือก แล้วแสดงข้อความต้นฉบับพร้อมคำแปลไทยเมื่อจบวลี และช่วยแปลสิ่งที่คุณพูดเป็นภาษาไทยให้เป็นข้อความอังกฤษสำหรับคัดลอกไปตอบกลับได้",
  },
  {
    question: "รองรับระบบอะไร และใช้กับเกมแบบไหนได้?",
    answer:
      "สำหรับ Windows 10/11 แบบ x64 ใช้ overlay กับเกมในโหมด Borderless หรือ Windowed ไม่รองรับ Exclusive Fullscreen และควรตรวจสอบข้อกำหนดของเกมที่คุณใช้งาน",
  },
  {
    question: "ต้องต่ออินเทอร์เน็ตไหม?",
    answer:
      "ต้องเชื่อมต่ออินเทอร์เน็ตสำหรับบริการ AI ที่ถอดเสียงและแปลภาษา แม้จะเปิดแอปแบบ Portable ได้ การแปลก็ยังต้องใช้บริการออนไลน์",
  },
  {
    question: "ฟังเกมกับ Discord พร้อมกันได้ไหม?",
    answer:
      "โหมดปกติเลือกฟังได้ครั้งละหนึ่งแอป หากเลือกเบราว์เซอร์อาจรวมเสียงจากหลายแท็บ ส่วนโหมด System Output เป็นเสียงรวมของเครื่อง ซึ่งอาจมีเสียงแจ้งเตือนหรือแอปอื่นเข้ามาด้วย",
  },
  {
    question: "พูดไทยแล้วเพื่อนจะได้ยินเป็นอังกฤษเลยไหม?",
    answer:
      "ตอนนี้ WANGAI แปลเป็นข้อความอังกฤษ ให้คุณคัดลอกไปวางในช่องแชตด้วยตัวเอง ยังไม่มีเสียงพูดแทนคุณ (TTS), virtual microphone หรือการพิมพ์เข้าเกมอัตโนมัติ",
  },
  {
    question: "เสียงและบทสนทนาถูกจัดการอย่างไร?",
    answer:
      "แอปส่งช่วงเสียงที่จบวลีไปยังบริการ AI เพื่อถอดเสียงและแปล ไม่บันทึกเป็นไฟล์เสียงในเครื่อง ประวัติข้อความในแอปอยู่ในหน่วยความจำและหายเมื่อปิดแอป",
  },
] as const;
