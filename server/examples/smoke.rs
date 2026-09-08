// Explicit, paid opt-in only. Never invoked by cargo test.
#[tokio::main]
async fn main() -> anyhow::Result<()> {
    anyhow::ensure!(
        std::env::var("ALLOW_PAID_SMOKE").as_deref() == Ok("1"),
        "Set ALLOW_PAID_SMOKE=1 to authorize real provider requests"
    );
    let base = std::env::var("WANGAI_API_BASE_URL")?;
    let client = reqwest::Client::new();
    let id = uuid::Uuid::new_v4().to_string();
    let response = client
        .post(format!("{}/v1/translations", base.trim_end_matches('/')))
        .header("x-installation-id", &id)
        .json(&serde_json::json!({"text":"Go left.","from":"en","to":"th"}))
        .send()
        .await?;
    anyhow::ensure!(
        response.status().is_success(),
        "Translation smoke failed: {}",
        response.status()
    );
    let value: wangai_ai_protocol::TranslationResponse = response.json().await?;
    anyhow::ensure!(!value.text.trim().is_empty(), "Empty translation");
    if let Ok(path) = std::env::var("SMOKE_WAV_PATH") {
        let bytes = std::fs::read(path)?;
        wangai_server::validate_wav(&bytes)
            .map_err(|_| anyhow::anyhow!("Invalid mono 16kHz PCM16 WAV"))?;
        let form = reqwest::multipart::Form::new()
            .text("stream", "incoming")
            .part(
                "file",
                reqwest::multipart::Part::bytes(bytes)
                    .file_name("speech.wav")
                    .mime_str("audio/wav")?,
            );
        let response = client
            .post(format!("{}/v1/transcriptions", base.trim_end_matches('/')))
            .header("x-installation-id", id)
            .multipart(form)
            .send()
            .await?;
        anyhow::ensure!(
            response.status().is_success(),
            "STT smoke failed: {}",
            response.status()
        );
        let _: wangai_ai_protocol::TranscriptionResponse = response.json().await?;
    }
    println!("Smoke passed (no audio or transcript printed)");
    Ok(())
}
