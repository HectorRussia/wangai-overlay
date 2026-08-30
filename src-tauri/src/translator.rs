use std::time::Duration;

use anyhow::{anyhow, Context};
use async_trait::async_trait;
use regex::RegexBuilder;
use reqwest::StatusCode;
use serde::{Deserialize, Serialize};

use crate::{
    models::{AppSettings, GlossaryTerm, TranslationResult, TranslationStatus},
    settings::{groq_key, SettingsManager},
};

const CHAT_COMPLETIONS_ENDPOINT: &str = "https://api.groq.com/openai/v1/chat/completions";
const MAX_COMPLETION_TOKENS: u64 = 128;

#[async_trait]
pub trait Translator: Send + Sync {
    async fn translate(
        &self,
        settings: &SettingsManager,
        segment_id: &str,
        text: &str,
        from: &str,
        to: &str,
    ) -> TranslationResult;
}

#[derive(Clone)]
pub struct GroqTranslator {
    client: reqwest::Client,
    endpoint: String,
}

impl Default for GroqTranslator {
    fn default() -> Self {
        Self::with_endpoint(CHAT_COMPLETIONS_ENDPOINT)
    }
}

impl GroqTranslator {
    fn with_endpoint(endpoint: impl Into<String>) -> Self {
        let client = reqwest::Client::builder()
            .timeout(Duration::from_secs(3))
            .build()
            .expect("valid reqwest client");
        Self {
            client,
            endpoint: endpoint.into(),
        }
    }
}

#[derive(Serialize)]
struct GroqRequest<'a> {
    model: &'a str,
    messages: Vec<GroqMessage<'a>>,
    temperature: f32,
    max_tokens: u64,
}

#[derive(Serialize)]
struct GroqMessage<'a> {
    role: &'a str,
    content: &'a str,
}

#[derive(Debug, Deserialize)]
struct GroqResponse {
    choices: Vec<GroqChoice>,
    #[serde(default)]
    usage: GroqUsage,
}

#[derive(Debug, Deserialize)]
struct GroqChoice {
    message: GroqResponseMessage,
}

#[derive(Debug, Deserialize)]
struct GroqResponseMessage {
    content: String,
}

#[derive(Debug, Default, Deserialize)]
struct GroqUsage {
    #[serde(default)]
    prompt_tokens: u64,
    #[serde(default)]
    completion_tokens: u64,
}

struct GroqSuccess {
    text: String,
    prompt_tokens: u64,
    completion_tokens: u64,
}

#[async_trait]
impl Translator for GroqTranslator {
    async fn translate(
        &self,
        settings: &SettingsManager,
        segment_id: &str,
        text: &str,
        from: &str,
        to: &str,
    ) -> TranslationResult {
        match self.translate_inner(settings, text, from, to).await {
            Ok(translated) => TranslationResult {
                segment_id: segment_id.into(),
                from: from.into(),
                to: to.into(),
                source_text: text.into(),
                translated_text: Some(translated),
                status: TranslationStatus::Success,
                message: None,
            },
            Err(TranslateFailure::Quota(message)) => TranslationResult {
                segment_id: segment_id.into(),
                from: from.into(),
                to: to.into(),
                source_text: text.into(),
                translated_text: None,
                status: TranslationStatus::Quota,
                message: Some(message),
            },
            Err(TranslateFailure::Other(error)) => TranslationResult {
                segment_id: segment_id.into(),
                from: from.into(),
                to: to.into(),
                source_text: text.into(),
                translated_text: None,
                status: TranslationStatus::Error,
                message: Some(error.to_string()),
            },
        }
    }
}

impl GroqTranslator {
    async fn translate_inner(
        &self,
        settings_manager: &SettingsManager,
        text: &str,
        from: &str,
        to: &str,
    ) -> std::result::Result<String, TranslateFailure> {
        let key = groq_key().map_err(TranslateFailure::Other)?;
        let settings = settings_manager.snapshot();
        if !settings.groq.configured || key.trim().is_empty() {
            return Err(TranslateFailure::Other(anyhow!("ยังไม่ได้ตั้ง Groq API key")));
        }

        let model = settings.groq.translation_model.clone();
        let protected = protect_glossary(text, from, &settings);
        let system_prompt = translation_prompt(from, to);
        let estimated_prompt_tokens = (system_prompt.chars().count() as u64)
            .saturating_add(protected.text.chars().count() as u64)
            .saturating_mul(2)
            .saturating_add(512);
        let reservation = settings_manager
            .reserve_translation(&model, estimated_prompt_tokens, MAX_COMPLETION_TOKENS)
            .map_err(|error| TranslateFailure::Quota(error.to_string()))?;

        let result = self
            .request_translation(&key, &model, &system_prompt, &protected.text)
            .await;

        match result {
            Ok(success) => {
                settings_manager
                    .complete_translation(
                        reservation,
                        &model,
                        success.prompt_tokens,
                        success.completion_tokens,
                    )
                    .map_err(TranslateFailure::Other)?;
                Ok(protected.restore(&success.text))
            }
            Err(error) => {
                settings_manager.cancel_translation(reservation);
                Err(TranslateFailure::Other(error))
            }
        }
    }

    async fn request_translation(
        &self,
        key: &str,
        model: &str,
        system_prompt: &str,
        text: &str,
    ) -> anyhow::Result<GroqSuccess> {
        let body = GroqRequest {
            model,
            messages: vec![
                GroqMessage {
                    role: "system",
                    content: system_prompt,
                },
                GroqMessage {
                    role: "user",
                    content: text,
                },
            ],
            temperature: 0.0,
            max_tokens: MAX_COMPLETION_TOKENS,
        };
        let mut last_error = None;
        for attempt in 0..2 {
            match self
                .client
                .post(&self.endpoint)
                .bearer_auth(key)
                .json(&body)
                .send()
                .await
            {
                Ok(response) if response.status().is_success() => {
                    let response = response
                        .json::<GroqResponse>()
                        .await
                        .context("อ่านคำตอบ Groq ไม่สำเร็จ")?;
                    let translated = response
                        .choices
                        .first()
                        .map(|choice| choice.message.content.trim().to_string())
                        .filter(|value| !value.is_empty())
                        .ok_or_else(|| anyhow!("Groq ส่งคำแปลว่าง"))?;
                    return Ok(GroqSuccess {
                        text: translated,
                        prompt_tokens: response.usage.prompt_tokens,
                        completion_tokens: response.usage.completion_tokens,
                    });
                }
                Ok(response) => {
                    let status = response.status();
                    let retry_after = retry_after(&response);
                    let body = response.text().await.unwrap_or_default();
                    let error = anyhow!(friendly_api_error(status, &body));
                    if attempt == 0 && retryable(status) {
                        last_error = Some(error);
                        tokio::time::sleep(retry_after).await;
                        continue;
                    }
                    return Err(error);
                }
                Err(error) => {
                    let error = anyhow!("เชื่อมต่อ Groq ไม่สำเร็จ: {error}");
                    if attempt == 0 {
                        last_error = Some(error);
                        tokio::time::sleep(Duration::from_millis(250)).await;
                        continue;
                    }
                    return Err(error);
                }
            }
        }
        Err(last_error.unwrap_or_else(|| anyhow!("Groq ไม่ตอบสนอง")))
    }
}

fn translation_prompt(from: &str, to: &str) -> String {
    let source = if from == "th" { "Thai" } else { "English" };
    let target = if to == "th" { "Thai" } else { "English" };
    format!(
        "Translate the user's {source} game voice-chat message into natural, concise {target}. Return only the translation with no explanation. Preserve placeholder tokens matching ZXQGLOSS<number>QXZ exactly. Keep tactical callouts short and clear."
    )
}

enum TranslateFailure {
    Quota(String),
    Other(anyhow::Error),
}

struct ProtectedText {
    text: String,
    replacements: Vec<(String, String)>,
}

impl ProtectedText {
    fn restore(&self, translated: &str) -> String {
        self.replacements
            .iter()
            .fold(translated.to_string(), |value, (token, replacement)| {
                value
                    .replace(token, replacement)
                    .replace(&token.to_ascii_lowercase(), replacement)
            })
    }
}

fn protect_glossary(text: &str, from: &str, settings: &AppSettings) -> ProtectedText {
    let mut protected = text.to_string();
    let mut replacements = Vec::new();
    for (index, term) in settings.glossary.iter().enumerate() {
        let (source, target) = glossary_direction(term, from);
        if source.trim().is_empty() {
            continue;
        }
        let token = format!("ZXQGLOSS{index}QXZ");
        let regex = RegexBuilder::new(&regex::escape(source))
            .case_insensitive(from == "en")
            .build()
            .expect("escaped glossary regex");
        if regex.is_match(&protected) {
            protected = regex.replace_all(&protected, token.as_str()).into_owned();
            replacements.push((token, target.to_string()));
        }
    }
    ProtectedText {
        text: protected,
        replacements,
    }
}

fn glossary_direction<'a>(term: &'a GlossaryTerm, from: &str) -> (&'a str, &'a str) {
    if from == "th" {
        (&term.target, &term.source)
    } else {
        (&term.source, &term.target)
    }
}

fn friendly_api_error(status: StatusCode, body: &str) -> String {
    match status {
        StatusCode::UNAUTHORIZED => "Groq API key ไม่ถูกต้อง กรุณาตรวจ key ที่ console.groq.com".into(),
        StatusCode::FORBIDDEN => {
            "Groq ปฏิเสธสิทธิ์ กรุณาตรวจสิทธิ์ของ key และ model ใน Groq Console".into()
        }
        StatusCode::PAYMENT_REQUIRED => "บัญชี Groq ไม่มีเครดิตเพียงพอ".into(),
        StatusCode::TOO_MANY_REQUESTS => "Groq จำกัดคำขอชั่วคราว (429)".into(),
        _ => format!("Groq ตอบ {status}: {}", truncate(body, 180)),
    }
}

fn retry_after(response: &reqwest::Response) -> Duration {
    response
        .headers()
        .get(reqwest::header::RETRY_AFTER)
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.parse::<u64>().ok())
        .map(|seconds| Duration::from_secs(seconds.min(3)))
        .unwrap_or_else(|| Duration::from_millis(250))
}

fn retryable(status: StatusCode) -> bool {
    status == StatusCode::TOO_MANY_REQUESTS || status.is_server_error()
}

fn truncate(value: &str, max_chars: usize) -> String {
    value.chars().take(max_chars).collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{
        io::{Read, Write},
        net::TcpListener,
        sync::mpsc,
        thread,
    };

    #[test]
    fn glossary_is_protected_in_both_directions() {
        let settings = AppSettings::default();
        let english = protect_glossary("Extract at Mistfall", "en", &settings);
        assert!(english.text.contains("ZXQGLOSS"));
        assert_eq!(english.restore("ไป ZXQGLOSS1QXZ"), "ไป จุดถอนตัว");

        let thai = protect_glossary("ไปจุดถอนตัว", "th", &settings);
        assert!(thai.text.contains("ZXQGLOSS"));
        assert_eq!(thai.restore("Go to ZXQGLOSS1QXZ"), "Go to extract");
    }

    #[test]
    fn api_errors_are_actionable() {
        assert!(friendly_api_error(StatusCode::UNAUTHORIZED, "").contains("key"));
        assert!(friendly_api_error(StatusCode::FORBIDDEN, "").contains("model"));
        assert!(friendly_api_error(StatusCode::TOO_MANY_REQUESTS, "").contains("429"));
    }

    #[tokio::test]
    async fn sends_chat_completion_with_selected_model_and_reads_usage() {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let address = listener.local_addr().unwrap();
        let (sender, receiver) = mpsc::channel();
        thread::spawn(move || {
            let (mut stream, _) = listener.accept().unwrap();
            stream
                .set_read_timeout(Some(Duration::from_secs(2)))
                .unwrap();
            let request = read_http_request(&mut stream);
            sender
                .send(String::from_utf8_lossy(&request).into_owned())
                .unwrap();
            let body = r#"{"choices":[{"message":{"content":"ศัตรูอยู่ทางซ้าย"}}],"usage":{"prompt_tokens":31,"completion_tokens":8}}"#;
            write!(
                stream,
                "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                body.len(),
                body
            )
            .unwrap();
        });

        let translator = GroqTranslator::with_endpoint(format!("http://{address}/chat"));
        let success = translator
            .request_translation(
                "secret-test-key",
                "openai/gpt-oss-20b",
                "Return only Thai",
                "Enemy on the left",
            )
            .await
            .unwrap();
        assert_eq!(success.text, "ศัตรูอยู่ทางซ้าย");
        assert_eq!(success.prompt_tokens, 31);
        assert_eq!(success.completion_tokens, 8);
        let request = receiver.recv_timeout(Duration::from_secs(2)).unwrap();
        assert!(request.contains("openai/gpt-oss-20b"));
        assert!(request.contains("Enemy on the left"));
    }

    fn read_http_request(stream: &mut std::net::TcpStream) -> Vec<u8> {
        let mut request = Vec::new();
        let mut buffer = [0_u8; 4096];
        loop {
            let read = stream.read(&mut buffer).unwrap_or(0);
            if read == 0 {
                break;
            }
            request.extend_from_slice(&buffer[..read]);
            if let Some(header_end) = request.windows(4).position(|part| part == b"\r\n\r\n") {
                let headers = String::from_utf8_lossy(&request[..header_end]);
                let content_length = headers
                    .lines()
                    .find_map(|line| {
                        line.to_ascii_lowercase()
                            .strip_prefix("content-length:")
                            .and_then(|value| value.trim().parse::<usize>().ok())
                    })
                    .unwrap_or(0);
                if request.len() >= header_end + 4 + content_length {
                    break;
                }
            }
        }
        request
    }
}
