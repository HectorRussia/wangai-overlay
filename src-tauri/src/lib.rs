mod audio;
mod cloud_stt;
mod commands;
mod hotkeys;
mod models;
mod pipeline;
mod processes;
mod settings;
mod state;
mod translator;
mod worker;

use tauri::{Manager, RunEvent};

use state::AppState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(hotkeys::handle_shortcut)
                .build(),
        )
        .setup(|app| {
            let settings_path = app.path().app_config_dir()?.join("settings.json");
            let state = AppState::new(settings_path)?;
            let settings = state.settings.snapshot();
            app.manage(state);

            commands::restore_overlay_bounds(app.handle(), &settings)
                .map_err(anyhow::Error::msg)?;
            hotkeys::register_hotkeys(app.handle(), &settings.hotkeys)?;

            let state = app.state::<AppState>();
            if let Err(error) = state.worker.start(app.handle().clone(), &settings) {
                state.update_runtime(|runtime| {
                    runtime.worker_ready = false;
                    runtime.last_error = Some(error.to_string());
                    runtime.status_message = "ยังเปิด speech worker ไม่ได้".into();
                });
                worker::emit_status(app.handle(), "error", &error.to_string(), None);
            }
            pipeline::start_auto_attach_monitor(app.handle().clone());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_snapshot,
            commands::list_capture_sources,
            commands::select_capture_source,
            commands::toggle_listening,
            commands::set_listening,
            commands::configure_groq,
            commands::clear_groq_credentials,
            commands::test_groq_configuration,
            commands::get_groq_model_catalog,
            commands::update_groq_models,
            commands::update_hotkeys,
            commands::update_overlay_settings,
            commands::update_vad_settings,
            commands::update_glossary,
            commands::set_overlay_edit_mode,
            commands::set_overlay_presentation,
            commands::save_overlay_bounds,
            commands::start_overlay_drag,
            commands::copy_latest_reply,
            commands::restart_worker,
            commands::inject_demo_transcript,
        ])
        .build(tauri::generate_context!())
        .expect("error while building GameLingo");

    app.run(|app, event| {
        if matches!(event, RunEvent::ExitRequested { .. } | RunEvent::Exit) {
            let state = app.state::<AppState>();
            state.audio.stop_all(&state.worker);
            state.groq_stt.reset_stream(models::StreamKind::Game);
            state.groq_stt.reset_stream(models::StreamKind::Microphone);
            let _ = state.settings.save();
            state.worker.stop();
        }
    });
}
