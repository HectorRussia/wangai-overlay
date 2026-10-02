import type { SubtitleItem } from "../../types";

export function HistoryView({ history }: { history: SubtitleItem[] }) {
  return (
    <section className="settings-history">
      <div className="settings-history-heading">
        <div>
          <p className="eyebrow">บทสนทนา</p>
          <h2>คำแปลในรอบนี้</h2>
        </div>
        <span>{history.length} รายการ</span>
      </div>
      <div className="settings-history-list">
        {history.map((item) => (
          <article className="settings-history-item" key={item.segmentId}>
            <div className="settings-history-meta">
              <span>
                {item.stream === "microphone"
                  ? "F9 ตอบกลับ"
                  : (item.sourceDisplayName ?? "เสียงขาเข้า")}
              </span>
              <time>
                {new Date(item.createdAtMs).toLocaleTimeString("th-TH", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </time>
            </div>
            <div className="settings-history-copy">
              <p lang={item.originalLanguage}>{item.originalText}</p>
              <strong>{item.translatedText ?? "กำลังแปล…"}</strong>
            </div>
          </article>
        ))}
        {history.length === 0 && (
          <p className="settings-history-empty">
            ยังไม่มีคำแปลในรอบนี้ · เริ่มใช้งานแล้วข้อความจะปรากฏที่นี่
          </p>
        )}
      </div>
    </section>
  );
}
