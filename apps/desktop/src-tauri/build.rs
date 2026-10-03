fn main() {
    use base64::Engine;
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("windows")
        && std::env::var("PROFILE").as_deref() == Ok("debug")
    {
        // Also needed by test binaries that instantiate Tauri's mock application.
        println!("cargo:rustc-link-arg=/MANIFEST:EMBED");
        println!(
            "cargo:rustc-link-arg=/MANIFESTINPUT:{}",
            std::path::Path::new(&std::env::var("CARGO_MANIFEST_DIR").unwrap())
                .join("tests.manifest")
                .display()
        );
    }
    println!("cargo:rerun-if-env-changed=WANGAI_API_BASE_URL");
    println!("cargo:rerun-if-env-changed=WANGAI_UPDATER_PUBLIC_KEY");
    println!("cargo:rerun-if-env-changed=WANGAI_TEST_UPDATE_ENDPOINT");
    println!("cargo:rerun-if-changed=../output/worker/wangai-worker");
    if std::env::var("PROFILE").as_deref() == Ok("release") {
        let base = std::env::var("WANGAI_API_BASE_URL").unwrap_or_default();
        let url = url::Url::parse(&base).expect("Invalid WANGAI_API_BASE_URL");
        assert!(
            url.scheme() == "https"
                && url.host_str().is_some()
                && url.username().is_empty()
                && url.password().is_none()
                && url.query().is_none()
                && url.fragment().is_none()
                && !base.contains("example.")
                && !base.contains("replace-")
                && !base.contains(".invalid"),
            "Set WANGAI_API_BASE_URL to the HTTPS gateway URL before building a release"
        );
        let key =
            std::env::var("WANGAI_UPDATER_PUBLIC_KEY").expect("Missing WANGAI_UPDATER_PUBLIC_KEY");
        let decoded = base64::engine::general_purpose::STANDARD
            .decode(key.trim())
            .expect("Invalid updater public key");
        let decoded = String::from_utf8(decoded).expect("Invalid updater public key");
        let key_line = decoded.lines().nth(1).expect("Invalid updater public key");
        assert_eq!(
            base64::engine::general_purpose::STANDARD
                .decode(key_line)
                .expect("Invalid updater public key")
                .len(),
            42
        );
        let config = std::env::var("TAURI_CONFIG").unwrap_or_default();
        assert!(config.contains("../output/worker/wangai-worker/"), "Use scripts/prepare-release.mjs and the generated release config to include the worker");
        for file in [
            "wangai-worker.exe",
            "_internal/python312.dll",
            "_internal/silero_vad/data/silero_vad.onnx",
            "licenses/DEPENDENCIES.txt",
        ] {
            assert!(
                std::path::Path::new("../output/worker/wangai-worker")
                    .join(file)
                    .is_file(),
                "Incomplete packaged worker: {file}"
            );
        }
        if std::env::var_os("CARGO_FEATURE_RELEASE_TEST").is_some() {
            assert!(
                config.contains("dev.gamelingo.overlay.release-test"),
                "Test build must use isolated identity"
            );
        } else {
            assert!(
                !config.contains("release-test")
                    && !matches!(url.host_str(), Some("localhost" | "127.0.0.1" | "[::1]")),
                "Production must use a deployed HTTPS gateway and production identity"
            );
        }
    }
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("windows")
        && std::env::var("PROFILE").as_deref() == Ok("debug")
    {
        // The linker manifest above covers both unit tests and the debug binary.
        // Avoid embedding a second manifest resource via tauri-build.
        tauri_build::try_build(
            tauri_build::Attributes::new()
                .windows_attributes(tauri_build::WindowsAttributes::new_without_app_manifest()),
        )
        .expect("Tauri debug build metadata");
    } else {
        tauri_build::build()
    }
}
