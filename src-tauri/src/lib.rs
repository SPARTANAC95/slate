mod metadata;

use metadata::{Cache, Details, Episode, Keys, SearchResult};
use serde::Serialize;
use std::fs;
use std::path::PathBuf;
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Manager, State};

const HISTORY_KEEP: usize = 20;

struct Ctx {
    cache: Cache,
}

#[derive(Serialize)]
struct SearchResponse {
    results: Vec<SearchResult>,
}

#[derive(Serialize)]
struct SeasonResponse {
    ok: bool,
    episodes: Vec<Episode>,
}

fn config_dir(app: &AppHandle) -> Option<PathBuf> {
    let dir = app.path().app_config_dir().ok()?;
    fs::create_dir_all(&dir).ok()?;
    Some(dir)
}

fn data_dir(app: &AppHandle) -> Option<PathBuf> {
    let dir = app.path().app_data_dir().ok()?;
    fs::create_dir_all(&dir).ok()?;
    Some(dir)
}

fn load_keys(app: &AppHandle) -> Keys {
    config_dir(app)
        .map(|d| d.join("keys.json"))
        .and_then(|p| fs::read_to_string(p).ok())
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

#[tauri::command]
fn get_api_keys(app: AppHandle) -> Keys {
    load_keys(&app)
}

#[tauri::command]
fn set_api_keys(app: AppHandle, tmdb: String, rawg: String) -> Result<(), String> {
    let dir = config_dir(&app).ok_or("no config dir")?;
    let keys = Keys { tmdb, rawg };
    let json = serde_json::to_string_pretty(&keys).map_err(|e| e.to_string())?;
    fs::write(dir.join("keys.json"), json).map_err(|e| e.to_string())
}

#[tauri::command]
async fn search_metadata(
    app: AppHandle,
    ctx: State<'_, Ctx>,
    q: String,
    kinds: Option<String>,
) -> Result<SearchResponse, String> {
    let q = q.trim().to_string();
    if q.len() < 2 {
        return Ok(SearchResponse { results: vec![] });
    }
    let keys = load_keys(&app);
    let results = metadata::search(&keys, &ctx.cache, &q, kinds.as_deref().unwrap_or("")).await;
    Ok(SearchResponse { results })
}

#[tauri::command]
async fn current_date(
    app: AppHandle,
    ctx: State<'_, Ctx>,
    source: String,
    kind: String,
    id: String,
    season: Option<i64>,
    episode: Option<i64>,
) -> Result<Details, String> {
    let keys = load_keys(&app);
    metadata::details(&keys, &ctx.cache, &source, &kind, &id, season, episode)
        .await
        .ok_or_else(|| "lookup unavailable".to_string())
}

#[tauri::command]
async fn season_episodes(
    app: AppHandle,
    ctx: State<'_, Ctx>,
    id: String,
    season: i64,
) -> Result<SeasonResponse, String> {
    let keys = load_keys(&app);
    let episodes = metadata::season_episodes(&keys, &ctx.cache, &id, season)
        .await
        .ok_or_else(|| "lookup unavailable".to_string())?;
    Ok(SeasonResponse { ok: true, episodes })
}

/// Mirror of the database, written atomically. The previous copy rotates
/// into history/ first so an empty database can never destroy the only
/// good backup.
#[tauri::command]
fn write_backup(app: AppHandle, json: String) -> Result<(), String> {
    let dir = data_dir(&app).ok_or("no data dir")?;
    let dest = dir.join("slate-backup.json");

    if dest.exists() {
        let hist = dir.join("history");
        if fs::create_dir_all(&hist).is_ok() {
            let stamp = chrono::Local::now().format("%Y-%m-%dT%H-%M-%S");
            let _ = fs::copy(&dest, hist.join(format!("slate-backup-{stamp}.json")));
            if let Ok(entries) = fs::read_dir(&hist) {
                let mut files: Vec<_> = entries.flatten().map(|e| e.path()).collect();
                files.sort();
                let excess = files.len().saturating_sub(HISTORY_KEEP);
                for path in files.into_iter().take(excess) {
                    let _ = fs::remove_file(path);
                }
            }
        }
    }

    let tmp = dir.join("slate-backup.json.tmp");
    fs::write(&tmp, json).map_err(|e| e.to_string())?;
    fs::rename(&tmp, &dest).map_err(|e| e.to_string())
}

#[tauri::command]
fn backup_location(app: AppHandle) -> String {
    data_dir(&app)
        .map(|d| d.join("slate-backup.json").to_string_lossy().to_string())
        .unwrap_or_default()
}

fn show_main(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.show();
        let _ = w.unminimize();
        let _ = w.set_focus();
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default();

    #[cfg(desktop)]
    {
        builder = builder
            .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
                show_main(app);
            }))
            .plugin(tauri_plugin_autostart::init(
                tauri_plugin_autostart::MacosLauncher::LaunchAgent,
                None,
            ));
    }

    builder
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_log::Builder::default().build())
        .manage(Ctx { cache: Cache::new() })
        .invoke_handler(tauri::generate_handler![
            search_metadata,
            current_date,
            season_episodes,
            write_backup,
            backup_location,
            get_api_keys,
            set_api_keys,
        ])
        .setup(|app| {
            let handle = app.handle().clone();
            // tray keeps slate alive after the window closes, which is the
            // only way a reminder can reach you when you are not looking
            let show = MenuItem::with_id(app, "show", "Open Slate", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show, &quit])?;

            TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .tooltip("Slate")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(move |app, event| match event.id().as_ref() {
                    "show" => show_main(app),
                    "quit" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        show_main(tray.app_handle());
                    }
                })
                .build(app)?;

            let _ = handle;
            Ok(())
        })
        .on_window_event(|window, event| {
            // closing hides to the tray instead of quitting
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                let _ = window.hide();
                api.prevent_close();
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running slate");
}
