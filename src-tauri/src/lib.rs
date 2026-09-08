mod app_metadata;
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
mod web_companion;
mod worker;

use tauri::{Manager, RunEvent};

use state::AppState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_opener::init())
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

            let web = web_companion::WebCompanionManager::start(app.handle().clone())?;
            app.manage(web);

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
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                if window.label() == "main" {
                    api.prevent_close();
                    let state = window.state::<AppState>();
                    let running = {
                        let runtime = state.runtime.read().expect("runtime lock poisoned");
                        runtime.listening || runtime.microphone_active
                    };
                    if running {
                        if commands::show_listening_overlay(window.app_handle()).is_ok() {
                            let _ = window.hide();
                        }
                    } else {
                        window.app_handle().exit(0);
                    }
                } else if window.label() == "overlay" {
                    window.app_handle().exit(0);
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_snapshot,
            commands::list_capture_sources,
            commands::list_running_apps,
            commands::list_output_devices,
            commands::get_web_companion_info,
            commands::open_web_companion,
            commands::open_settings_window,
            commands::quit_app,
            commands::select_listening_source,
            commands::update_capture_mode,
            commands::update_output_device,
            commands::update_rescue_scan,
            commands::toggle_listening,
            commands::set_listening,
            commands::probe_recent_audio,
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
            app.state::<web_companion::WebCompanionManager>().shutdown();
            state.audio.stop_all();
            state.groq_stt.reset_stream(models::StreamKind::Incoming);
            state.groq_stt.reset_stream(models::StreamKind::Microphone);
            let _ = state.settings.save();
            state.worker.stop();
        }
    });
}
