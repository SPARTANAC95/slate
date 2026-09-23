//! Read-only native release verification. Never installs or touches Slate data.
//! Run after publishing: cargo run --release --example check_update
use tauri_plugin_updater::UpdaterExt;

fn main() {
    let mut context = tauri::generate_context!();
    context.config_mut().identifier = "com.slate.update-check".into();
    context.config_mut().app.windows.clear();
    tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app| {
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                let result: Result<(), Box<dyn std::error::Error + Send + Sync>> = async {
                    let current = handle.updater()?.check().await?;
                    println!(
                        "Normal version check: {}",
                        if current.is_some() {
                            "newer version available"
                        } else {
                            "up to date"
                        }
                    );
                    // Permit the same version only in this separate diagnostic binary.
                    let updater = handle
                        .updater_builder()
                        .version_comparator(|_, _| true)
                        .build()?;
                    let mut release = updater.check().await?.ok_or("No release returned")?;
                    let bytes = release.download(|_, _| {}, || {}).await?;
                    if bytes.len() < 1024 || !bytes.starts_with(b"MZ") {
                        return Err("Not a Windows installer".into());
                    }
                    println!(
                        "Verified Slate {}: {} installer bytes",
                        release.version,
                        bytes.len()
                    );
                    release.signature = "invalid-signature".into();
                    if release.download(|_, _| {}, || {}).await.is_ok() {
                        return Err("Invalid signature unexpectedly accepted".into());
                    }
                    println!("Invalid signature rejected. No installation attempted.");
                    Ok(())
                }
                .await;
                match result {
                    Ok(()) => handle.exit(0),
                    Err(error) => {
                        eprintln!("Native updater verification failed: {error}");
                        handle.exit(1);
                    }
                }
            });
            Ok(())
        })
        .run(context)
        .expect("Failed to start isolated updater verification");
}
