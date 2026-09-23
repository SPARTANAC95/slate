fn main() {
    tauri_build::build();
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("windows") {
        // Tauri embeds this dependency for the app binary, but Cargo examples
        // need it too: Wry imports TaskDialogIndirect from Common Controls v6.
        let manifest = std::path::PathBuf::from(std::env::var("CARGO_MANIFEST_DIR").unwrap())
            .join("examples/windows.manifest");
        println!("cargo:rerun-if-changed={}", manifest.display());
        println!("cargo:rustc-link-arg-examples=/MANIFEST:EMBED");
        println!(
            "cargo:rustc-link-arg-examples=/MANIFESTINPUT:{}",
            manifest.display()
        );
    }
}
