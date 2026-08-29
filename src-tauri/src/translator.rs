use std::time::Duration;

use anyhow::{anyhow, Context};
use async_trait::async_trait;
use regex::RegexBuilder;
use reqwest::StatusCode;
use serde::{Deserialize, Serialize};

use crate::{
    models::{AppSettings, GlossaryTerm, TranslationResult, TranslationStatus},
    settings::{xai_key, SettingsManager},
};

const CHAT_COMPLETIONS_ENDPOINT: &str = "https://api.x.ai/v1/chat/completions";
const MAX_COMPLETION_TOKENS: u64 = 256;

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
pub struct GrokTranslator {
    client: reqwest::Client,
    endpoint: String,
}

impl Default for GrokTranslator {
    fn default() -> Self {
        let client = reqwest::Client::builder()
            .timeout(Duration::from_secs(3))
            .build()
            .expect("valid reqwest client");
        Self {
            client,
            endpoint: CHAT_COMPLETIONS_ENDPOINT.into(),
        }
    }
}

#[derive(Serialize)]
struct GrokRequest<'a> {
    model: &'a str,
    messages: Vec<GrokMessage<'a>>,
    temperature: f32,
    max_tokens: u64,
}

#[derive(Serialize)]
struct GrokMessage<'a> {
    role: &'a str,
    content: &'a str,
}

#[derive(Debug, Deserialize)]
struct GrokResponse {
    choices: Vec<GrokChoice>,
    #[serde(default)]
    usage: GrokUsage,
}

#[derive(Debug, Deserialize)]
struct GrokChoice {
    message: GrokResponseMessage,
}

#[derive(Debug, Deserialize)]
struct GrokResponseMessage {
    content: String,
}

#[derive(Debug, Default, Deserialize)]
struct GrokUsage {
    #[serde(default)]
    prompt_tokens: u64,
    #[serde(default)]
    completion_tokens: u64,
}

struct GrokSuccess {
    text: String,
    prompt_tokens: u64,
    completion_tokens: u64,
}

#[async_trait]
impl Translator for GrokTranslator {
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

impl GrokTranslator {
    async fn translate_inner(
        &self,
        settings_manager: &SettingsManager,
        text: &str,
        from: &str,
        to: &str,
    ) -> std::result::Result<String, TranslateFailure> {
        let key = xai_key().map_err(TranslateFailure::Other)?;
        let settings = settings_manager.snapshot();
        if !settings.xai.configured || key.trim().is_empty() {
            return Err(TranslateFailure::Other(anyhow!("ยังไม่ได้ตั้ง xAI API key")));
        }

        let protected = protect_glossary(text, from, &settings);
        let system_prompt = translation_prompt(from, to);
        let estimated_prompt_tokens = (protected.text.chars().count() as u64)
            .saturating_mul(2)
            .saturating_add(500);
        let reservation = settings_manager
            .reserve_translation(estimated_prompt_tokens, MAX_COMPLETION_TOKENS)
            .map_err(|error| TranslateFailure::Quota(error.to_string()))?;

        let result = self
            .request_translation(&key, &settings.xai.model, &system_prompt, &protected.text)
            .await;

        match result {
            Ok(success) => {
                settings_manager
                    .complete_translation(
                        reservation,
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
    ) -> anyhow::Result<GrokSuccess> {
        let body = GrokRequest {
            model,
            messages: vec![
                GrokMessage {
                    role: "system",
                    content: system_prompt,
                },
                GrokMessage {
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
                        .json::<GrokResponse>()
                        .await
                        .context("อ่านคำตอบ Grok ไม่สำเร็จ")?;
                    let translated = response
                        .choices
                        .first()
                        .map(|choice| choice.message.content.trim().to_string())
                        .filter(|value| !value.is_empty())
                        .ok_or_else(|| anyhow!("Grok ส่งคำแปลว่าง"))?;
                    return Ok(GrokSuccess {
                        text: translated,
                        prompt_tokens: response.usage.prompt_tokens,
                        completion_tokens: response.usage.completion_tokens,
                    });
                }
                Ok(response) => {
                    let status = response.status();
                    let body = response.text().await.unwrap_or_default();
                    let message = if status == StatusCode::UNAUTHORIZED {
                        "xAI API key ไม่ถูกต้อง กรุณาตรวจใน console.x.ai".into()
                    } else if status == StatusCode::PAYMENT_REQUIRED {
                        "บัญชี xAI ไม่มีเครดิตเพียงพอ".into()
                    } else {
                        format!("Grok ตอบ {status}: {}", truncate(&body, 180))
                    };
                    let error = anyhow!(message);
                    if attempt == 0 && retryable(status) {
                        last_error = Some(error);
                        tokio::time::sleep(Duration::from_millis(250)).await;
                        continue;
                    }
                    return Err(error);
                }
                Err(error) => {
                    let error = anyhow!("เชื่อมต่อ Grok ไม่สำเร็จ: {error}");
                    if attempt == 0 {
                        last_error = Some(error);
                        tokio::time::sleep(Duration::from_millis(250)).await;
                        continue;
                    }
                    return Err(error);
                }
            }
        }
        Err(last_error.unwrap_or_else(|| anyhow!("Grok ไม่ตอบสนอง")))
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
            protected = regex.replace_all(&protected, token.as_str()).to_string();
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

fn retryable(status: StatusCode) -> bool {
    status == StatusCode::TOO_MANY_REQUESTS || status.is_server_error()
}

fn truncate(value: &str, max: usize) -> String {
    value.chars().take(max).collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use tokio::io::{AsyncReadExt, AsyncWriteExt};

    #[test]
    fn glossary_is_protected_and_restored() {
        let settings = AppSettings::default();
        let protected = protect_glossary("Revive at the extract", "en", &settings);
        assert!(!protected.text.to_ascii_lowercase().contains("revive"));
        let translated = protected.restore(&protected.text);
        assert!(translated.contains("ชุบเพื่อน"));
        assert!(translated.contains("จุดถอนตัว"));
    }

    #[test]
    fn reverse_glossary_uses_thai_as_source() {
        let settings = AppSettings::default();
        let protected = protect_glossary("ไปจุดถอนตัว", "th", &settings);
        assert_eq!(protected.restore(&protected.text), "ไปextract");
    }

    #[test]
    fn translation_prompt_is_direction_aware() {
        assert!(translation_prompt("en", "th").contains("English"));
        assert!(translation_prompt("en", "th").contains("Thai"));
    }

    #[test]
    fn truncates_unicode_safely() {
        assert_eq!(truncate("ภาษาไทย", 4), "ภาษา");
    }

    #[test]
    fn only_transient_http_errors_are_retried() {
        assert!(retryable(StatusCode::TOO_MANY_REQUESTS));
        assert!(retryable(StatusCode::SERVICE_UNAVAILABLE));
        assert!(!retryable(StatusCode::UNAUTHORIZED));
        assert!(!retryable(StatusCode::BAD_REQUEST));
    }

    #[tokio::test]
    async fn parses_mock_grok_chat_completion_and_usage() {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0")
            .await
            .expect("bind mock server");
        let address = listener.local_addr().unwrap();
        let server = tokio::spawn(async move {
            let (mut socket, _) = listener.accept().await.unwrap();
            let mut request = Vec::new();
            loop {
                let mut chunk = [0_u8; 2_048];
                let read = socket.read(&mut chunk).await.unwrap();
                if read == 0 {
                    break;
                }
                request.extend_from_slice(&chunk[..read]);
                let Some(header_end) = request.windows(4).position(|part| part == b"\r\n\r\n")
                else {
                    continue;
                };
                let headers = String::from_utf8_lossy(&request[..header_end]);
                let content_length = headers
                    .lines()
                    .find_map(|line| {
                        line.to_ascii_lowercase()
                            .strip_prefix("content-length: ")
                            .and_then(|value| value.parse::<usize>().ok())
                    })
                    .unwrap_or(0);
                if request.len() >= header_end + 4 + content_length {
                    break;
                }
            }
            let request = String::from_utf8_lossy(&request);
            assert!(request
                .to_ascii_lowercase()
                .contains("authorization: bearer test-key"));
            assert!(request.contains("grok-test-model"));
            let body = r#"{"choices":[{"message":{"content":"ศัตรูอยู่ทางซ้าย"}}],"usage":{"prompt_tokens":42,"completion_tokens":7}}"#;
            let response = format!(
                "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                body.len(),
                body
            );
            socket.write_all(response.as_bytes()).await.unwrap();
        });

        let translator = GrokTranslator {
            client: reqwest::Client::builder()
                .timeout(Duration::from_secs(1))
                .build()
                .unwrap(),
            endpoint: format!("http://{address}"),
        };
        let result = translator
            .request_translation(
                "test-key",
                "grok-test-model",
                "Translate into Thai",
                "Enemy on the left",
            )
            .await
            .expect("mock translation");
        assert_eq!(result.text, "ศัตรูอยู่ทางซ้าย");
        assert_eq!(result.prompt_tokens, 42);
        assert_eq!(result.completion_tokens, 7);
        server.await.unwrap();
    }
}
