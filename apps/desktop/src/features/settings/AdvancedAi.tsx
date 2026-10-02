import { Cloud, Languages, Trash2, Plus } from "lucide-react";
import { api } from "../../api";
import type { RuntimeState, GlossaryTerm } from "../../types";
import type { CommandTask } from "../../shared/useCommandTask";
import { Card, Info } from "./AdvancedControls";
import { button, primary, input } from "./advancedStyles";

export function AdvancedAi({
  runtime,
  glossary,
  setGlossary,
  run,
}: {
  runtime: RuntimeState;
  glossary: GlossaryTerm[];
  setGlossary: (value: GlossaryTerm[]) => void;
  run: CommandTask;
}) {
  return (
    <section className="space-y-4">
      <Card
        title="บริการ AI"
        icon={<Cloud />}
        subtitle="ใช้บริการกลาง ไม่ต้องใส่ API key หรือเลือกโมเดลเอง"
      >
        <p
          role="status"
          aria-label="สถานะบริการ AI"
          className="mb-4 text-sm text-[#76dda0]"
        >
          {runtime.aiService.message}
        </p>
        <div className="grid gap-3 md:grid-cols-3">
          <Info
            label="Incoming STT"
            value={runtime.aiService.incomingModel || "รอเชื่อมต่อ"}
          />
          <Info
            label="F9 microphone STT"
            value={runtime.aiService.microphoneModel || "รอเชื่อมต่อ"}
          />
          <Info
            label="Translation"
            value={runtime.aiService.translationModel || "รอเชื่อมต่อ"}
          />
        </div>
        <p className="mt-4 text-sm text-[#aaaeba]">
          โมเดลและ credentials กำหนดโดยผู้ดูแลเซิร์ฟเวอร์
        </p>
      </Card>
      <Card
        title="คำศัพท์เกม"
        icon={<Languages />}
        subtitle="ใช้เฉพาะ prompt แปลภาษา ไม่ส่งเป็น Whisper prompt"
      >
        {glossary.map((term, index) => (
          <div className="mb-2 flex gap-2" key={index}>
            <input
              className={input}
              value={term.source}
              onChange={(e) =>
                setGlossary(
                  glossary.map((v, i) =>
                    i === index ? { ...v, source: e.target.value } : v,
                  ),
                )
              }
            />
            <input
              className={input}
              value={term.target}
              onChange={(e) =>
                setGlossary(
                  glossary.map((v, i) =>
                    i === index ? { ...v, target: e.target.value } : v,
                  ),
                )
              }
            />
            <button
              className={button}
              onClick={() =>
                setGlossary(glossary.filter((_, i) => i !== index))
              }
            >
              <Trash2 />
            </button>
          </div>
        ))}
        <div className="flex gap-2">
          <button
            className={button}
            onClick={() =>
              setGlossary([...glossary, { source: "", target: "" }])
            }
          >
            <Plus />
            เพิ่มคำ
          </button>
          <button
            className={primary}
            onClick={() =>
              void run(
                "glossary",
                () => api.updateGlossary(glossary),
                "บันทึกคำศัพท์แล้ว",
              )
            }
          >
            บันทึก
          </button>
        </div>
      </Card>
    </section>
  );
}
