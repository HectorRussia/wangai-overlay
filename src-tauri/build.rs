fn main() {
    println!("cargo:rerun-if-env-changed=WANGAI_API_BASE_URL");
    if std::env::var("PROFILE").as_deref() == Ok("release") {
        let base = std::env::var("WANGAI_API_BASE_URL").unwrap_or_default();
        assert!(
            base.starts_with("https://"),
            "Set WANGAI_API_BASE_URL to the HTTPS gateway URL before building a release"
        );
    }
    tauri_build::build()
}
