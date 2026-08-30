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
pub struct AudioOutputDevice {
    pub id: String,
    pub name: String,
    pub is_default: bool,
    pub sample_rate: u32,
    pub channels: u16,
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
#[serde(rename_all = "snake_case")]
pub enum StreamKind {
    Game,
    Microphone,
    VoiceChat,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "snake_case")]
pub enum GameCaptureMode {
    #[default]
    ProcessTree,
    SystemOutput,
}

impl StreamKind {
    pub fn id(self) -> u8 {
        match self {
            Self::Game => 1,
            Self::Microphone => 2,
            Self::VoiceChat => 3,
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
    #[serde(default)]
    pub source_display_name: Option<String>,
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
    #[serde(default)]
    pub source_display_name: Option<String>,
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
            max_items: 4,
            x: None,
            y: None,
            width: 420,
            height: 236,
        }
    }
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum OverlayPresentation {
    Collapsed,
    Expanded,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(default, rename_all = "camelCase")]
pub struct GameVadProfile {
    pub vad_threshold: f32,
    pub gain_db: f32,
}

impl GameVadProfile {
    pub fn process_tree_default() -> Self {
        Self {
            vad_threshold: 0.5,
            gain_db: 0.0,
        }
    }

    pub fn system_output_default() -> Self {
        Self {
            vad_threshold: 0.35,
            gain_db: 9.0,
        }
    }
}

impl Default for GameVadProfile {
    fn default() -> Self {
        Self::process_tree_default()
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(default, rename_all = "camelCase")]
pub struct VoiceChatSettings {
    pub enabled: bool,
    pub auto_detect: bool,
    pub selected_process: Option<SavedProcess>,
    pub rescue_scan: bool,
    pub vad: GameVadProfile,
}

impl Default for VoiceChatSettings {
    fn default() -> Self {
        Self {
            enabled: true,
            auto_detect: true,
            selected_process: None,
            rescue_scan: true,
            vad: GameVadProfile {
                vad_threshold: 0.35,
                gain_db: 6.0,
            },
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(default, rename_all = "camelCase")]
pub struct VadSettings {
    pub process_tree: GameVadProfile,
    pub system_output: GameVadProfile,
    pub silence_ms: u64,
    pub pre_roll_ms: u64,
    pub max_utterance_ms: u64,
}

impl VadSettings {
    pub fn active_profile(&self, mode: GameCaptureMode) -> &GameVadProfile {
        match mode {
            GameCaptureMode::ProcessTree => &self.process_tree,
            GameCaptureMode::SystemOutput => &self.system_output,
        }
    }
}

impl Default for VadSettings {
    fn default() -> Self {
        Self {
            process_tree: GameVadProfile::process_tree_default(),
            system_output: GameVadProfile::system_output_default(),
            silence_ms: 500,
            pre_roll_ms: 200,
            max_utterance_ms: 12_000,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(default, rename_all = "camelCase")]
pub struct GroqSettings {
    #[serde(default)]
    pub configured: bool,
    pub game_stt_model: String,
    pub microphone_stt_model: String,
    pub translation_model: String,
    pub monthly_budget_microusd: u64,
    pub usage_month: String,
    pub actual_audio_millis: u64,
    pub billed_audio_millis: u64,
    pub prompt_tokens: u64,
    pub completion_tokens: u64,
    pub estimated_spend_microusd: u64,
}

impl Default for GroqSettings {
    fn default() -> Self {
        Self {
            configured: false,
            game_stt_model: "whisper-large-v3".into(),
            microphone_stt_model: "whisper-large-v3-turbo".into(),
            translation_model: "openai/gpt-oss-20b".into(),
            monthly_budget_microusd: 2_000_000,
            usage_month: chrono::Local::now().format("%Y-%m").to_string(),
            actual_audio_millis: 0,
            billed_audio_millis: 0,
            prompt_tokens: 0,
            completion_tokens: 0,
            estimated_spend_microusd: 0,
        }
    }
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum GroqModelKind {
    SpeechToText,
    Translation,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct GroqModelOption {
    pub id: String,
    pub label: String,
    pub description: String,
    pub kind: GroqModelKind,
    pub input_microusd_per_million: u64,
    pub output_microusd_per_million: u64,
    pub audio_microusd_per_hour: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(default, rename_all = "camelCase")]
pub struct AppSettings {
    pub schema_version: u32,
    pub selected_process: Option<SavedProcess>,
    pub game_capture_mode: GameCaptureMode,
    pub game_output_device_id: Option<String>,
    pub system_output_cloud_scan: bool,
    pub voice_chat: VoiceChatSettings,
    pub auto_attach: bool,
    pub hotkeys: HotkeySettings,
    pub overlay: OverlaySettings,
    pub vad: VadSettings,
    pub groq: GroqSettings,
    pub glossary: Vec<GlossaryTerm>,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            schema_version: 11,
            selected_process: None,
            game_capture_mode: GameCaptureMode::default(),
            game_output_device_id: None,
            system_output_cloud_scan: false,
            voice_chat: VoiceChatSettings::default(),
            auto_attach: true,
            hotkeys: HotkeySettings::default(),
            overlay: OverlaySettings::default(),
            vad: VadSettings::default(),
            groq: GroqSettings::default(),
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
    pub groq_stt_busy: bool,
    pub groq_status: String,
    pub budget_exhausted: bool,
    pub attached_process: Option<CaptureSource>,
    pub effective_capture_pid: Option<u32>,
    pub effective_capture_name: Option<String>,
    pub effective_output_device_id: Option<String>,
    pub effective_output_device_name: Option<String>,
    pub effective_output_device_is_default: bool,
    pub game_audio_rms_dbfs: Option<f32>,
    pub game_audio_peak_dbfs: Option<f32>,
    pub game_audio_last_seen_at_ms: Option<i64>,
    pub game_vad_active: bool,
    pub effective_vad_threshold: f32,
    pub effective_vad_gain_db: f32,
    pub effective_vad_auto_gain_db: f32,
    pub dropped_audio_chunks: u64,
    pub capture_warning: Option<String>,
    pub voice_chat_attached_process: Option<CaptureSource>,
    pub voice_chat_effective_capture_pid: Option<u32>,
    pub voice_chat_effective_capture_name: Option<String>,
    pub voice_chat_audio_rms_dbfs: Option<f32>,
    pub voice_chat_audio_peak_dbfs: Option<f32>,
    pub voice_chat_audio_last_seen_at_ms: Option<i64>,
    pub voice_chat_vad_active: bool,
    pub voice_chat_vad_threshold: f32,
    pub voice_chat_vad_gain_db: f32,
    pub voice_chat_dropped_audio_chunks: u64,
    pub voice_chat_capture_warning: Option<String>,
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
            groq_stt_busy: false,
            groq_status: "ยังไม่ได้ตั้งค่า Groq".into(),
            budget_exhausted: false,
            attached_process: None,
            effective_capture_pid: None,
            effective_capture_name: None,
            effective_output_device_id: None,
            effective_output_device_name: None,
            effective_output_device_is_default: false,
            game_audio_rms_dbfs: None,
            game_audio_peak_dbfs: None,
            game_audio_last_seen_at_ms: None,
            game_vad_active: false,
            effective_vad_threshold: 0.5,
            effective_vad_gain_db: 0.0,
            effective_vad_auto_gain_db: 0.0,
            dropped_audio_chunks: 0,
            capture_warning: None,
            voice_chat_attached_process: None,
            voice_chat_effective_capture_pid: None,
            voice_chat_effective_capture_name: None,
            voice_chat_audio_rms_dbfs: None,
            voice_chat_audio_peak_dbfs: None,
            voice_chat_audio_last_seen_at_ms: None,
            voice_chat_vad_active: false,
            voice_chat_vad_threshold: 0.35,
            voice_chat_vad_gain_db: 6.0,
            voice_chat_dropped_audio_chunks: 0,
            voice_chat_capture_warning: None,
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
        utterance_id: u64,
        sample_cursor: u64,
    },
    AudioGap {
        stream: StreamKind,
        expected_sample_cursor: u64,
        actual_sample_cursor: u64,
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
