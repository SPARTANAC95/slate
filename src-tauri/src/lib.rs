mod metadata;
mod google;

use metadata::{Cache, Details, Episode, KeyCheck, Keys, SearchResult};
use serde::Serialize;
use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager, State};

/// history keeps the newest HISTORY_KEEP snapshots…
const HISTORY_KEEP: usize = 20;
/// …plus the first snapshot of each of the HISTORY_DAYS most recent days that
/// have one. Twenty snapshots alone is forty seconds of typing a day note —
/// every save rotates a copy — and then no restore point older than a minute
/// is left. The daily tier survives a burst.
const HISTORY_DAYS: usize = 7;
/// How long the webview gets, after Quit is chosen, to commit whatever it
/// still holds: a verdict typed half a second ago, a disk mirror waiting on
/// its debounce. Quit used to end the process on the spot, and nothing in
/// the page ever heard about it.
const QUIT_GRACE: std::time::Duration = std::time::Duration::from_millis(600);

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
fn set_api_keys(
    app: AppHandle,
    ctx: State<'_, Ctx>,
    tmdb: String,
    igdb_id: String,
    igdb_secret: String,
) -> Result<(), String> {
    let dir = config_dir(&app).ok_or("no config dir")?;
    let keys = Keys { tmdb, igdb_id, igdb_secret };
    let json = serde_json::to_string_pretty(&keys).map_err(|e| e.to_string())?;
    fs::write(dir.join("keys.json"), json).map_err(|e| e.to_string())?;
    // results cached under the old key would keep a fixed key looking broken
    ctx.cache.clear();
    Ok(())
}

/// per-provider verdict on the stored keys: ok / missing / rejected /
/// unreachable — so a provider that never returns anything can be explained
#[tauri::command]
async fn check_api_keys(app: AppHandle, ctx: State<'_, Ctx>) -> Result<KeyCheck, String> {
    Ok(metadata::check_keys(&load_keys(&app), &ctx.cache).await)
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

/// Is this snapshot the same data as the last one? `exportedAt` moves every
/// time, so comparing the raw text would call every write a change — and then
/// simply opening the app, which takes one snapshot before anything is edited,
/// would rotate a copy into history and push the oldest real backup a step
/// closer to deletion. Twenty launches would leave nothing but twenty copies of
/// the same state. `server/index.js` makes exactly this comparison.
fn same_data(previous: &str, next: &str) -> bool {
    let without_stamp = |s: &str| {
        serde_json::from_str::<serde_json::Value>(s).ok().map(|mut v| {
            if let Some(obj) = v.as_object_mut() {
                obj.remove("exportedAt");
            }
            v
        })
    };
    match (without_stamp(previous), without_stamp(next)) {
        (Some(a), Some(b)) => a == b,
        // an unreadable previous file only feeds this check — treat it as
        // changed so the write itself is never blocked by it
        _ => false,
    }
}

/// Does this snapshot hold anything at all? Unparseable counts as empty.
fn snapshot_has_data(json: &str) -> bool {
    serde_json::from_str::<serde_json::Value>(json)
        .ok()
        .map(|v| {
            let len = |k: &str| v.get(k).and_then(|a| a.as_array()).map_or(0, |a| a.len());
            len("entries") + len("dayNotes") > 0
        })
        .unwrap_or(false)
}

/// the day part of `slate-backup-YYYY-MM-DDTHH-MM-SS.json`
fn day_of(name: &str) -> Option<&str> {
    name.strip_prefix("slate-backup-").and_then(|rest| rest.get(0..10))
}

/// Which history files to drop. `names` is sorted ascending — the stamp in
/// the name sorts chronologically. Keep the newest `keep`; also keep the
/// earliest snapshot of each of the `days` most recent days present, so a
/// burst of edits cannot push every older restore point out of the window.
fn prune_plan(names: &[String], keep: usize, days: usize) -> Vec<String> {
    let mut kept: HashSet<&str> = names.iter().rev().take(keep).map(String::as_str).collect();
    let mut recent_days: Vec<&str> = Vec::new();
    for name in names.iter().rev() {
        if let Some(day) = day_of(name) {
            if !recent_days.contains(&day) {
                recent_days.push(day);
            }
        }
    }
    for day in recent_days.into_iter().take(days) {
        if let Some(first) = names.iter().find(|n| day_of(n) == Some(day)) {
            kept.insert(first);
        }
    }
    names
        .iter()
        .filter(|n| !kept.contains(n.as_str()))
        .cloned()
        .collect()
}

/// history file names in `dir`, oldest first
fn history_names(dir: &Path) -> Vec<String> {
    let mut names: Vec<String> = fs::read_dir(dir)
        .map(|rd| {
            rd.flatten()
                .filter_map(|e| e.file_name().to_str().map(String::from))
                .filter(|n| n.ends_with(".json"))
                .collect()
        })
        .unwrap_or_default();
    names.sort();
    names
}

/// write-then-rename, so a crash mid-write leaves the old file whole
fn write_atomic(dest: &Path, contents: &str) -> Result<(), String> {
    let tmp = dest.with_extension("json.tmp");
    fs::write(&tmp, contents).map_err(|e| e.to_string())?;
    fs::rename(&tmp, dest).map_err(|e| e.to_string())
}

/// Mirror of the database, written atomically. The previous copy rotates
/// into history/ first so an empty database can never destroy the only
/// good backup — and an empty snapshot never even replaces one that has
/// data: the only way the database is empty while the backup is not is a
/// wiped webview profile, and that is the moment the backup is for.
#[tauri::command]
fn write_backup(app: AppHandle, json: String) -> Result<(), String> {
    let dir = data_dir(&app).ok_or("no data dir")?;
    let dest = dir.join("slate-backup.json");

    let previous = fs::read_to_string(&dest).ok();
    if let Some(prev) = previous.as_deref() {
        if !snapshot_has_data(&json) && snapshot_has_data(prev) {
            log::warn!("empty snapshot kept away from a backup that has data");
            return Ok(());
        }
    }
    let unchanged = previous.as_deref().is_some_and(|prev| same_data(prev, &json));

    if previous.is_some() && !unchanged {
        let hist = dir.join("history");
        if fs::create_dir_all(&hist).is_ok() {
            let stamp = chrono::Local::now().format("%Y-%m-%dT%H-%M-%S");
            let _ = fs::copy(&dest, hist.join(format!("slate-backup-{stamp}.json")));
            for name in prune_plan(&history_names(&hist), HISTORY_KEEP, HISTORY_DAYS) {
                let _ = fs::remove_file(hist.join(name));
            }
        }
    }

    write_atomic(&dest, &json)
}

/// The best snapshot on disk: the current mirror if it holds anything,
/// otherwise the newest history copy that does. What the empty-database
/// restore offer is built from.
#[tauri::command]
fn read_backup(app: AppHandle) -> Option<String> {
    let dir = data_dir(&app)?;
    let current = fs::read_to_string(dir.join("slate-backup.json")).ok();
    if current.as_deref().is_some_and(snapshot_has_data) {
        return current;
    }
    let hist = dir.join("history");
    history_names(&hist)
        .into_iter()
        .rev()
        .filter_map(|name| fs::read_to_string(hist.join(name)).ok())
        .find(|s| snapshot_has_data(s))
}

/// Export goes to Downloads by our own hand. The webview's download handling
/// is not something to lean on for the one file that gets everything back.
#[tauri::command]
fn save_export(app: AppHandle, json: String) -> Result<String, String> {
    let dir = app
        .path()
        .download_dir()
        .ok()
        .filter(|d| d.is_dir())
        .or_else(|| data_dir(&app))
        .ok_or("no folder to export into")?;
    let day = chrono::Local::now().format("%Y-%m-%d");
    let mut dest = dir.join(format!("slate-export-{day}.json"));
    if dest.exists() {
        // a second export the same day must not silently replace the first
        let time = chrono::Local::now().format("%H%M%S");
        dest = dir.join(format!("slate-export-{day}-{time}.json"));
    }
    write_atomic(&dest, &json)?;
    Ok(dest.to_string_lossy().to_string())
}

#[tauri::command]
fn backup_location(app: AppHandle) -> String {
    data_dir(&app)
        .map(|d| d.join("slate-backup.json").to_string_lossy().to_string())
        .unwrap_or_default()
}

/// Tell the page the process is about to end, give it a moment, then go.
fn quit_after_flush(app: &AppHandle) {
    let _ = app.emit("slate:quit", ());
    let handle = app.clone();
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(QUIT_GRACE).await;
        handle.exit(0);
    });
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
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_log::Builder::default().build())
        .manage(Ctx { cache: Cache::new() })
        .manage(google::GoogleState::default())
        .invoke_handler(tauri::generate_handler![
            google::google_status,
            google::google_configure,
            google::google_connect,
            google::google_calendars,
            google::google_select,
            google::google_events,
            google::google_event,
            google::google_disconnect,
            search_metadata,
            current_date,
            season_episodes,
            write_backup,
            read_backup,
            save_export,
            backup_location,
            get_api_keys,
            set_api_keys,
            check_api_keys,
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
                    "quit" => quit_after_flush(app),
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

#[cfg(test)]
mod tests {
    use super::{prune_plan, same_data, snapshot_has_data};

    fn name(day: &str, time: &str) -> String {
        format!("slate-backup-{day}T{time}.json")
    }

    #[test]
    fn a_burst_of_edits_keeps_the_days_first_snapshot() {
        // thirty saves in one sitting: the newest twenty stay, and so does the
        // first of the day — the state before the sitting began
        let names: Vec<String> = (0..30).map(|i| name("2026-09-02", &format!("10-00-{i:02}"))).collect();
        let gone = prune_plan(&names, 20, 7);
        assert_eq!(gone.len(), 9);
        assert!(!gone.contains(&names[0]), "the day's first snapshot survives");
        assert!(gone.contains(&names[1]));
        assert!(gone.contains(&names[9]));
        assert!(!gone.contains(&names[10]));
    }

    #[test]
    fn older_days_keep_one_snapshot_each_up_to_the_limit() {
        let mut names = Vec::new();
        for d in 1..=10 {
            for t in ["08-00-00", "12-00-00", "20-00-00"] {
                names.push(name(&format!("2026-09-{d:02}"), t));
            }
        }
        let gone = prune_plan(&names, 20, 7);
        // the newest twenty reach back to day 4's midday copy; day 4's morning
        // copy is outside that window and survives only as the day's first
        for d in 4..=10 {
            assert!(!gone.contains(&name(&format!("2026-09-{d:02}"), "08-00-00")), "day {d}");
        }
        // days 1..3 fall outside both tiers entirely
        for d in 1..=3 {
            for t in ["08-00-00", "12-00-00", "20-00-00"] {
                assert!(gone.contains(&name(&format!("2026-09-{d:02}"), t)));
            }
        }
        assert_eq!(gone.len(), 9);
    }

    #[test]
    fn nothing_to_prune_under_the_cap() {
        let names: Vec<String> = (0..5).map(|i| name("2026-09-02", &format!("10-00-{i:02}"))).collect();
        assert!(prune_plan(&names, 20, 7).is_empty());
    }

    #[test]
    fn an_empty_snapshot_is_recognised() {
        assert!(!snapshot_has_data(r#"{"entries":[],"dayNotes":[]}"#));
        assert!(snapshot_has_data(r#"{"entries":[{"id":"x"}],"dayNotes":[]}"#));
        assert!(snapshot_has_data(r#"{"entries":[],"dayNotes":[{"date":"2026-09-02"}]}"#));
        assert!(!snapshot_has_data("garbage"));
    }

    #[test]
    fn a_fresh_stamp_alone_is_not_a_change() {
        let a = r#"{"version":1,"exportedAt":1,"entries":[{"id":"x"}],"dayNotes":[]}"#;
        let b = r#"{"version":1,"exportedAt":999,"entries":[{"id":"x"}],"dayNotes":[]}"#;
        assert!(same_data(a, b));
    }

    #[test]
    fn real_edits_are_a_change() {
        let a = r#"{"exportedAt":1,"entries":[{"id":"x"}],"dayNotes":[]}"#;
        let b = r#"{"exportedAt":1,"entries":[{"id":"y"}],"dayNotes":[]}"#;
        assert!(!same_data(a, b));
    }

    #[test]
    fn key_order_does_not_count_as_a_change() {
        let a = r#"{"exportedAt":1,"entries":[],"dayNotes":[]}"#;
        let b = r#"{"dayNotes":[],"entries":[],"exportedAt":2}"#;
        assert!(same_data(a, b));
    }

    #[test]
    fn an_unreadable_previous_file_never_blocks_a_rotation() {
        assert!(!same_data("not json at all", r#"{"exportedAt":1}"#));
    }
}
