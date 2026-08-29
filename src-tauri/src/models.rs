use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct CaptureSource {
    pub pid: u32,
    pub name: String,
    pub executable_path: String,
    pub display_name: String,
    pub is_mistfall: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SavedProcess {
    pub executable_path: String,
    pub executable_name: String,
    pub display_name: String,
    pub last_pid: Option<u32>,
}

impl From<&CaptureSource> for SavedProcess {
    fn from(source: &CaptureSource) -> Self {
        Self {
            executable_path: source.executable_path.clone(),
            executable_name: source.name.clone(),
            display_name: source.display_name.clone(),
            last_pid: Some(source.pid),
        }
    }
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum StreamKind {
    Game,
    Microphone,
}

impl StreamKind {
    pub fn id(self) -> u8 {
        match self {
            Self::Game => 1,
            Self::Microphone => 2,
        }
    }
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum TranscriptKind {
    Partial,
    Final,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct TranscriptEvent {
    pub segment_id: String,
    pub stream: StreamKind,
    pub language: String,
    pub text: String,
    pub kind: TranscriptKind,
    pub started_at_ms: i64,
    pub ended_at_ms: i64,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum TranslationStatus {
    Pending,
    Success,
    Error,
    Quota,
    SourceOnly,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct TranslationResult {
    pub segment_id: String,
    pub from: String,
    pub to: String,
    pub source_text: String,
    pub translated_text: Option<String>,
    pub status: TranslationStatus,
    pub message: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SubtitleItem {
    pub segment_id: String,
    pub stream: StreamKind,
    pub original_language: String,
    pub original_text: String,
    pub translated_text: Option<String>,
    pub status: TranslationStatus,
    pub created_at_ms: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct GlossaryTerm {
    pub source: String,
    pub target: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct HotkeySettings {
    pub toggle_listening: String,
    pub push_to_talk: String,
    pub copy_latest: String,
    pub edit_overlay: String,
}

impl Default for HotkeySettings {
    fn default() -> Self {
        Self {
            toggle_listening: "F8".into(),
            push_to_talk: "F9".into(),
            copy_latest: "F10".into(),
            edit_overlay: "F7".into(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct OverlaySettings {
    pub opacity: f64,
    pub font_scale: f64,
    pub fade_seconds: u64,
    pub max_items: usize,
    pub x: Option<i32>,
    pub y: Option<i32>,
    pub width: u32,
    pub height: u32,
}

impl Default for OverlaySettings {
    fn default() -> Self {
        Self {
            opacity: 0.92,
            font_scale: 1.0,
            fade_seconds: 8,
            max_items: 3,
            x: None,
            y: None,
            width: 920,
            height: 240,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct VadSettings {
    pub partial_interval_ms: u64,
    pub vad_threshold: f32,
    pub silence_ms: u64,
    pub pre_roll_ms: u64,
    pub max_utterance_ms: u64,
}

impl Default for VadSettings {
    fn default() -> Self {
        Self {
            partial_interval_ms: 1_000,
            vad_threshold: 0.5,
            silence_ms: 500,
            pre_roll_ms: 200,
            max_utterance_ms: 12_000,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct XaiSettings {
    #[serde(default)]
    pub configured: bool,
    pub model: String,
    pub monthly_budget_microusd: u64,
    pub usage_month: String,
    pub audio_millis: u64,
    pub prompt_tokens: u64,
    pub completion_tokens: u64,
    pub estimated_spend_microusd: u64,
}

impl Default for XaiSettings {
    fn default() -> Self {
        Self {
            configured: false,
            model: "grok-4.20-0309-non-reasoning".into(),
            monthly_budget_microusd: 2_000_000,
            usage_month: chrono::Local::now().format("%Y-%m").to_string(),
            audio_millis: 0,
            prompt_tokens: 0,
            completion_tokens: 0,
            estimated_spend_microusd: 0,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(default, rename_all = "camelCase")]
pub struct AppSettings {
    pub schema_version: u32,
    pub selected_process: Option<SavedProcess>,
    pub auto_attach: bool,
    pub hotkeys: HotkeySettings,
    pub overlay: OverlaySettings,
    pub vad: VadSettings,
    pub xai: XaiSettings,
    pub glossary: Vec<GlossaryTerm>,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            schema_version: 2,
            selected_process: None,
            auto_attach: true,
            hotkeys: HotkeySettings::default(),
            overlay: OverlaySettings::default(),
            vad: VadSettings::default(),
            xai: XaiSettings::default(),
            glossary: vec![
                GlossaryTerm {
                    source: "Mistfall".into(),
                    target: "Mistfall".into(),
                },
                GlossaryTerm {
                    source: "extract".into(),
                    target: "จุดถอนตัว".into(),
                },
                GlossaryTerm {
                    source: "revive".into(),
                    target: "ชุบเพื่อน".into(),
                },
                GlossaryTerm {
                    source: "boss".into(),
                    target: "บอส".into(),
                },
            ],
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeState {
    pub listening: bool,
    pub microphone_active: bool,
    pub overlay_edit_mode: bool,
    pub worker_ready: bool,
    pub worker_model: Option<String>,
    pub xai_stt_connected: bool,
    pub xai_status: String,
    pub budget_exhausted: bool,
    pub attached_process: Option<CaptureSource>,
    pub status_message: String,
    pub last_error: Option<String>,
}

impl Default for RuntimeState {
    fn default() -> Self {
        Self {
            listening: false,
            microphone_active: false,
            overlay_edit_mode: false,
            worker_ready: false,
            worker_model: None,
            xai_stt_connected: false,
            xai_status: "ยังไม่ได้ตั้งค่า xAI".into(),
            budget_exhausted: false,
            attached_process: None,
            status_message: "กำลังเตรียมระบบถอดเสียง".into(),
            last_error: None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AppSnapshot {
    pub settings: AppSettings,
    pub runtime: RuntimeState,
    pub history: Vec<SubtitleItem>,
    pub partial: Option<TranscriptEvent>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum WorkerEvent {
    Ready {
        model: String,
        device: String,
    },
    Status {
        message: String,
    },
    SpeechState {
        stream: StreamKind,
        active: bool,
    },
    Error {
        message: String,
        stream: Option<StreamKind>,
    },
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkerStatusEvent {
    pub state: String,
    pub message: String,
    pub model: Option<String>,
}
