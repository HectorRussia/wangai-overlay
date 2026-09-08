use anyhow::{bail, Result};

// Deliberately no Debug: configuration contains credentials.
#[derive(Clone)]
pub struct Config {
    pub stt_url: String,
    pub stt_key: String,
    pub incoming_model: String,
    pub microphone_model: String,
    pub translation_url: String,
    pub translation_key: String,
    pub translation_model: String,
    pub translation_options: serde_json::Map<String, serde_json::Value>,
    pub max_concurrent: usize,
    pub timeout_secs: u64,
    pub database: String,
    pub bind: String,
}

impl Config {
    pub fn from_env() -> Result<Self> {
        Self::load(|key| std::env::var(key).ok())
    }

    pub fn load(get: impl Fn(&str) -> Option<String>) -> Result<Self> {
        let required = |name: &str| -> Result<String> {
            let value = get(name)
                .filter(|v| !v.trim().is_empty())
                .ok_or_else(|| anyhow::anyhow!("Missing {name}"))?;
            let normalized = value.trim().to_ascii_lowercase();
            if normalized.contains("replace-")
                || normalized.contains("example.com")
                || normalized.starts_with('<')
                || normalized == "changeme"
                || normalized == "your-api-key"
                || normalized == "server-secret"
            {
                bail!("Invalid {name}: placeholder");
            }
            Ok(value)
        };
        let credential = |name: &str| -> Result<String> {
            let value = required(name)?;
            reqwest::header::HeaderValue::from_str(&format!("Bearer {}", value.trim()))
                .map_err(|_| anyhow::anyhow!("Invalid {name}"))?;
            Ok(value.trim().into())
        };
        let model = |name: &str| -> Result<String> {
            let value = required(name)?;
            if value.len() > 256 || value.chars().any(char::is_control) {
                bail!("Invalid {name}");
            }
            Ok(value.trim().into())
        };
        let endpoint = |name: &str, path: &str| -> Result<String> {
            let value = required(name)?;
            let url = reqwest::Url::parse(&value).map_err(|_| anyhow::anyhow!("Invalid {name}"))?;
            let local = matches!(url.host_str(), Some("127.0.0.1" | "localhost" | "[::1]"));
            if !(url.scheme() == "https" || (url.scheme() == "http" && local))
                || url.host_str().is_none()
                || !url.username().is_empty()
                || url.password().is_some()
                || url.query().is_some()
                || url.fragment().is_some()
            {
                bail!("Invalid {name}: HTTPS required (HTTP only on loopback), no URL credentials/query/fragment");
            }
            Ok(format!("{}{path}", url.as_str().trim_end_matches('/')))
        };
        let number = |name: &str, default: usize, max: usize| -> Result<usize> {
            let value = get(name)
                .unwrap_or_else(|| default.to_string())
                .parse::<usize>()
                .map_err(|_| anyhow::anyhow!("Invalid {name}"))?;
            if value == 0 || value > max {
                bail!("Invalid {name}");
            }
            Ok(value)
        };
        let options: serde_json::Map<String, serde_json::Value> =
            serde_json::from_str(&get("TRANSLATION_OPTIONS_JSON").unwrap_or_else(|| "{}".into()))
                .map_err(|_| anyhow::anyhow!("Invalid TRANSLATION_OPTIONS_JSON"))?;
        for (name, value) in &options {
            let valid = match name.as_str() {
                "temperature" => value.as_f64().is_some_and(|v| (0.0..=2.0).contains(&v)),
                "max_tokens" | "max_completion_tokens" => {
                    value.as_u64().is_some_and(|v| (1..=4096).contains(&v))
                }
                "reasoning_effort" => value
                    .as_str()
                    .is_some_and(|v| ["none", "minimal", "low", "medium", "high"].contains(&v)),
                "include_reasoning" => value.is_boolean(),
                _ => false,
            };
            if !valid {
                bail!("Invalid TRANSLATION_OPTIONS_JSON field");
            }
        }
        if options.contains_key("max_tokens") && options.contains_key("max_completion_tokens") {
            bail!("TRANSLATION_OPTIONS_JSON must use only one token limit field");
        }
        Ok(Self {
            stt_url: endpoint("STT_BASE_URL", "/audio/transcriptions")?,
            stt_key: credential("STT_API_KEY")?,
            incoming_model: model("STT_INCOMING_MODEL")?,
            microphone_model: model("STT_MICROPHONE_MODEL")?,
            translation_url: endpoint("TRANSLATION_BASE_URL", "/chat/completions")?,
            translation_key: credential("TRANSLATION_API_KEY")?,
            translation_model: model("TRANSLATION_MODEL")?,
            translation_options: options,
            max_concurrent: number("MAX_CONCURRENT_REQUESTS", 32, 1024)?,
            timeout_secs: number("UPSTREAM_TIMEOUT_SECONDS", 15, 120)? as u64,
            database: get("DATABASE_PATH").unwrap_or_else(|| "usage.sqlite3".into()),
            bind: get("BIND_ADDRESS").unwrap_or_else(|| "0.0.0.0:8080".into()),
        })
    }
}
