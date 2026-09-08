use rusqlite::{params, Connection};

pub struct Metric {
    pub installation: String,
    pub operation: &'static str,
    pub model: String,
    pub outcome: String,
    pub audio_ms: u64,
    pub latency_ms: u64,
    pub prompt_tokens: u64,
    pub completion_tokens: u64,
}

pub fn open(path: &str) -> rusqlite::Result<Connection> {
    let db = Connection::open(path)?;
    db.execute_batch(
        "PRAGMA journal_mode=WAL;
        CREATE TABLE IF NOT EXISTS daily_usage (
          day TEXT NOT NULL, installation TEXT NOT NULL, operation TEXT NOT NULL,
          model TEXT NOT NULL, outcome TEXT NOT NULL, requests INTEGER NOT NULL,
          audio_ms INTEGER NOT NULL, latency_ms INTEGER NOT NULL,
          prompt_tokens INTEGER NOT NULL, completion_tokens INTEGER NOT NULL,
          PRIMARY KEY(day, installation, operation, model, outcome));",
    )?;
    Ok(db)
}

pub fn record(db: &Connection, event: Metric) -> rusqlite::Result<()> {
    db.execute(
        "INSERT INTO daily_usage VALUES (?1,?2,?3,?4,?5,1,?6,?7,?8,?9)
        ON CONFLICT(day,installation,operation,model,outcome) DO UPDATE SET
        requests=requests+1, audio_ms=audio_ms+excluded.audio_ms,
        latency_ms=latency_ms+excluded.latency_ms,
        prompt_tokens=prompt_tokens+excluded.prompt_tokens,
        completion_tokens=completion_tokens+excluded.completion_tokens",
        params![
            chrono::Utc::now().format("%Y-%m-%d").to_string(),
            event.installation,
            event.operation,
            event.model,
            event.outcome,
            event.audio_ms,
            event.latency_ms,
            event.prompt_tokens,
            event.completion_tokens
        ],
    )?;
    Ok(())
}

pub fn summary(path: &str) -> anyhow::Result<()> {
    let db = Connection::open_with_flags(path, rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY)?;
    let mut query = db.prepare(
        "SELECT day,COUNT(DISTINCT installation),SUM(requests),SUM(audio_ms)/60000.0,
        SUM(CASE WHEN outcome='success' THEN requests ELSE 0 END),
        SUM(latency_ms)*1.0/SUM(requests) FROM daily_usage GROUP BY day ORDER BY day",
    )?;
    let rows = query.query_map([], |r| {
        Ok(serde_json::json!({
            "day": r.get::<_,String>(0)?, "activeInstallations": r.get::<_,u64>(1)?,
            "requests": r.get::<_,u64>(2)?, "audioMinutes": r.get::<_,f64>(3)?,
            "successes": r.get::<_,u64>(4)?, "meanLatencyMs": r.get::<_,f64>(5)?
        }))
    })?;
    for row in rows {
        println!("{}", row?);
    }
    Ok(())
}
