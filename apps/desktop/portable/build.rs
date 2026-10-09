fn main() {
    println!("cargo:rerun-if-env-changed=WANGAI_UPDATER_PUBLIC_KEY");
    println!("cargo:rerun-if-env-changed=WANGAI_TEST_VERSION");
    println!("cargo:rerun-if-changed=../src-tauri/icons/icon.ico");
    if std::env::var_os("CARGO_FEATURE_HOST").is_some()
        && std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("windows")
    {
        let version = if std::env::var_os("CARGO_FEATURE_RELEASE_TEST").is_some() {
            std::env::var("WANGAI_TEST_VERSION")
                .unwrap_or_else(|_| env!("CARGO_PKG_VERSION").into())
        } else {
            env!("CARGO_PKG_VERSION").into()
        };
        let parsed = semver::Version::parse(&version).expect("Valid Portable semantic version");
        let parts = [parsed.major, parsed.minor, parsed.patch]
            .map(|part| u16::try_from(part).expect("Portable version component exceeds 65535"));
        let numeric =
            ((parts[0] as u64) << 48) | ((parts[1] as u64) << 32) | ((parts[2] as u64) << 16);
        winresource::WindowsResource::new()
            .set_icon("../src-tauri/icons/icon.ico")
            .set("ProductName", "WANGAI Portable")
            .set("FileDescription", "WANGAI Portable")
            .set("FileVersion", &version)
            .set("ProductVersion", &version)
            .set_version_info(winresource::VersionInfo::FILEVERSION, numeric)
            .set_version_info(winresource::VersionInfo::PRODUCTVERSION, numeric)
            .set_manifest(include_str!("host.manifest"))
            .compile()
            .expect("Windows GUI resources");
    }
}
