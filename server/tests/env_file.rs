use std::{fs, process::Command};

#[test]
fn explicit_env_file_isolated_from_cloud_dotenv_and_inherited_credentials() {
    let directory = tempfile::tempdir().unwrap();
    fs::write(directory.path().join(".env"), "STT_MODE=cloud\n").unwrap();
    let selected = directory.path().join(".env.local-stt");
    fs::write(&selected, "STT_MODE=local\nTRANSLATION_BASE_URL=https://api.x.ai/v1\nTRANSLATION_API_KEY=\nTRANSLATION_MODEL=grok-4.20-0309-non-reasoning\n").unwrap();
    let output = Command::new(env!("CARGO_BIN_EXE_wangai-server"))
        .current_dir(directory.path())
        .env("WANGAI_SERVER_ENV_FILE", selected)
        .env("STT_MODE", "cloud")
        .env("TRANSLATION_API_KEY", "inherited-key-must-not-be-used")
        .output()
        .unwrap();
    assert!(!output.status.success());
    let error = String::from_utf8_lossy(&output.stderr);
    assert!(error.contains("TRANSLATION_API_KEY"), "{error}");
    assert!(!error.contains("inherited-key-must-not-be-used"));
}

#[test]
fn missing_explicit_env_file_never_falls_back_to_default_dotenv() {
    let directory = tempfile::tempdir().unwrap();
    fs::write(
        directory.path().join(".env"),
        "STT_MODE=invalid-fallback-mode\n",
    )
    .unwrap();
    let output = Command::new(env!("CARGO_BIN_EXE_wangai-server"))
        .current_dir(directory.path())
        .env(
            "WANGAI_SERVER_ENV_FILE",
            directory.path().join("missing.env"),
        )
        .output()
        .unwrap();
    assert!(!output.status.success());
    assert!(!String::from_utf8_lossy(&output.stderr).contains("STT_MODE"));
}
