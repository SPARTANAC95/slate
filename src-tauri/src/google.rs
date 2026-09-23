//! Google tokens stay in the native process, protected by Windows DPAPI.
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use rand::RngCore;
use reqwest::{Client, Method, Url};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::{fs, time::{Duration, SystemTime, UNIX_EPOCH}};
use tauri::{AppHandle, State};
use tauri_plugin_opener::OpenerExt;
use tokio::{io::{AsyncReadExt, AsyncWriteExt}, net::TcpListener, sync::Mutex};

const SCOPE: &str = "https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.calendarlist.readonly";
const API: &str = "https://www.googleapis.com/calendar/v3/";
#[derive(Default)]
pub struct GoogleState(pub Mutex<()>);

#[derive(Default, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
struct Account {
    client_id: String,
    client_secret: String,
    refresh_token: String,
    access_token: String,
    expires_at: u64,
    calendar_id: String,
    calendar_name: String,
    enabled: bool,
    mode: String,
}

fn now() -> u64 { SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_secs() }
fn client() -> Result<Client, String> {
    Client::builder().timeout(Duration::from_secs(30)).build().map_err(|_| "Could not start the Google connection.".into())
}

#[cfg(windows)]
fn protect(input: &[u8], encrypt: bool) -> Result<Vec<u8>, String> {
    use windows_sys::Win32::{Foundation::LocalFree, Security::Cryptography::{CryptProtectData, CryptUnprotectData, CRYPT_INTEGER_BLOB, CRYPTPROTECT_UI_FORBIDDEN}};
    let data = CRYPT_INTEGER_BLOB { cbData: input.len() as u32, pbData: input.as_ptr() as *mut u8 };
    let mut out = CRYPT_INTEGER_BLOB { cbData: 0, pbData: std::ptr::null_mut() };
    unsafe {
        let ok = if encrypt {
            CryptProtectData(&data, std::ptr::null(), std::ptr::null(), std::ptr::null_mut(), std::ptr::null(), CRYPTPROTECT_UI_FORBIDDEN, &mut out)
        } else {
            CryptUnprotectData(&data, std::ptr::null_mut(), std::ptr::null(), std::ptr::null_mut(), std::ptr::null(), CRYPTPROTECT_UI_FORBIDDEN, &mut out)
        };
        if ok == 0 { return Err("Windows could not unlock the Google credentials for this user.".into()); }
        let bytes = std::slice::from_raw_parts(out.pbData, out.cbData as usize).to_vec();
        LocalFree(out.pbData as *mut _);
        Ok(bytes)
    }
}
#[cfg(not(windows))]
fn protect(_: &[u8], _: bool) -> Result<Vec<u8>, String> { Err("Google sync currently requires Windows.".into()) }

fn account_path(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    Ok(super::config_dir(app).ok_or("Could not open Slate's settings folder.")?.join("google-account.bin"))
}
fn load(app: &AppHandle) -> Result<Account, String> {
    let path = account_path(app)?;
    if !path.exists() { return Ok(Account::default()); }
    let bytes = fs::read(path).map_err(|_| "Could not read Google settings.")?;
    serde_json::from_slice(&protect(&bytes, false)?).map_err(|_| "Google settings are damaged. Reconnect your account.".into())
}
fn save(app: &AppHandle, account: &Account) -> Result<(), String> {
    let path = account_path(app)?;
    let encrypted = protect(&serde_json::to_vec(account).map_err(|_| "Could not encode Google settings.")?, true)?;
    let tmp = path.with_extension("tmp");
    fs::write(&tmp, encrypted).map_err(|_| "Could not save Google settings.")?;
    fs::rename(tmp, path).map_err(|_| "Could not commit Google settings.".into())
}
fn status(a: &Account) -> Value {
    json!({"configured": !a.client_id.is_empty(), "connected": !a.refresh_token.is_empty(), "calendarId": a.calendar_id,
        "calendarName": a.calendar_name, "enabled": a.enabled, "mode": "push"})
}
fn nonce() -> String { let mut bytes = [0u8; 32]; rand::rng().fill_bytes(&mut bytes); URL_SAFE_NO_PAD.encode(bytes) }
fn challenge(verifier: &str) -> String { URL_SAFE_NO_PAD.encode(Sha256::digest(verifier.as_bytes())) }

#[tauri::command]
pub async fn google_status(app: AppHandle, state: State<'_, GoogleState>) -> Result<Value, String> {
    let _guard = state.0.lock().await;
    Ok(status(&load(&app)?))
}

#[tauri::command]
pub async fn google_configure(app: AppHandle, state: State<'_, GoogleState>, credentials: String) -> Result<Value, String> {
    let _guard = state.0.lock().await;
    let value: Value = serde_json::from_str(&credentials).map_err(|_| "Choose the OAuth credentials JSON downloaded from Google Cloud.")?;
    let installed = value.get("installed").ok_or("These credentials must be for a Desktop app, not a Web application.")?;
    let id = installed["client_id"].as_str().filter(|s| s.ends_with(".apps.googleusercontent.com")).ok_or("The Google client ID is missing or invalid.")?;
    let secret = installed["client_secret"].as_str().filter(|s| !s.is_empty()).ok_or("The desktop client secret is missing.")?;
    let mut account = load(&app)?;
    if account.client_id != id && !account.refresh_token.is_empty() { return Err("Disconnect the current account before changing the OAuth client.".into()); }
    account.client_id = id.into(); account.client_secret = secret.into();
    save(&app, &account)?;
    Ok(status(&account))
}

// Only a matching state may complete the authorization. Unrelated localhost
// requests (including favicon requests) never consume the pending login.
fn callback_code(request: &str, expected: &str) -> Result<Option<String>, String> {
    let Some(path) = request.lines().next().and_then(|l| l.strip_prefix("GET ")).and_then(|l| l.split_whitespace().next()) else { return Ok(None); };
    let Ok(url) = Url::parse(&format!("http://127.0.0.1{path}")) else { return Ok(None); };
    if url.path() != "/" { return Ok(None); }
    let params: std::collections::HashMap<_, _> = url.query_pairs().into_owned().collect();
    if params.get("state").map(String::as_str) != Some(expected) { return Ok(None); }
    if params.contains_key("error") { return Err("Google sign-in was cancelled or access was declined.".into()); }
    Ok(params.get("code").cloned())
}

async fn receive_code(listener: TcpListener, expected: &str) -> Result<String, String> {
    loop {
        let (mut socket, _) = listener.accept().await.map_err(|_| "Could not receive Google sign-in.")?;
        let mut request = Vec::new();
        let result = tokio::time::timeout(Duration::from_secs(3), async {
            loop {
                let mut chunk = [0u8; 1024];
                let n = socket.read(&mut chunk).await?;
                if n == 0 { break; }
                request.extend_from_slice(&chunk[..n]);
                if request.windows(4).any(|s| s == b"\r\n\r\n") || request.len() > 16384 { break; }
            }
            Ok::<(), std::io::Error>(())
        }).await;
        if !matches!(result, Ok(Ok(()))) { continue; }
        let code = callback_code(&String::from_utf8_lossy(&request), expected);
        let recognized = !matches!(code, Ok(None));
        let body = if recognized { "<!doctype html><title>Slate</title><h1>Return to Slate</h1><p>Slate is finishing your Google Calendar connection. You can close this tab.</p>" } else { "Not found" };
        let response = format!("HTTP/1.1 {}\r\nContent-Type: text/html; charset=utf-8\r\nCache-Control: no-store\r\nContent-Security-Policy: default-src 'none'\r\nConnection: close\r\nContent-Length: {}\r\n\r\n{}", if recognized { "200 OK" } else { "404 Not Found" }, body.len(), body);
        let _ = socket.write_all(response.as_bytes()).await;
        if let Some(code) = code? { return Ok(code); }
    }
}

async fn token_request(fields: &[(&str, &str)]) -> Result<Value, String> {
    let response = client()?.post("https://oauth2.googleapis.com/token").form(fields).send().await.map_err(|_| "Could not reach Google. Check your internet connection.")?;
    let ok = response.status().is_success();
    let value: Value = response.json().await.map_err(|_| "Google returned an unreadable sign-in response.")?;
    if !ok { return Err(match value["error"].as_str() {
        Some("invalid_grant") => "Google access expired or was revoked. Reconnect your account.",
        Some("invalid_client") => "Google rejected the OAuth client. Import Desktop app credentials again.",
        _ => "Google could not authorize Slate. Check the OAuth app's test users and Calendar API configuration.",
    }.into()); }
    Ok(value)
}

#[tauri::command]
pub async fn google_connect(app: AppHandle, state: State<'_, GoogleState>) -> Result<Value, String> {
    let _guard = state.0.lock().await;
    let mut account = load(&app)?;
    if account.client_id.is_empty() { return Err("Import Google's Desktop app credentials first.".into()); }
    let listener = TcpListener::bind("127.0.0.1:0").await.map_err(|_| "Could not open the local Google sign-in callback.")?;
    let redirect = format!("http://127.0.0.1:{}/", listener.local_addr().map_err(|_| "Could not read callback port.")?.port());
    let verifier = nonce(); let state_token = nonce(); let hash = challenge(&verifier);
    let mut url = Url::parse("https://accounts.google.com/o/oauth2/v2/auth").unwrap();
    url.query_pairs_mut().extend_pairs([
        ("client_id", account.client_id.as_str()), ("redirect_uri", &redirect), ("response_type", "code"),
        ("scope", SCOPE), ("state", &state_token), ("code_challenge", &hash), ("code_challenge_method", "S256"),
        ("access_type", "offline"), ("prompt", "consent select_account"),
    ]);
    app.opener().open_url(url.as_str(), None::<&str>).map_err(|_| "Could not open your browser for Google sign-in.")?;
    let code = tokio::time::timeout(Duration::from_secs(180), receive_code(listener, &state_token)).await.map_err(|_| "Sign-in timed out. Click Connect with Google to try again.")??;
    let token = token_request(&[("client_id", &account.client_id), ("client_secret", &account.client_secret), ("code", &code), ("code_verifier", &verifier), ("redirect_uri", &redirect), ("grant_type", "authorization_code")]).await?;
    account.refresh_token = token["refresh_token"].as_str().ok_or("Google did not grant offline access. Reconnect and allow calendar access.")?.into();
    account.access_token = token["access_token"].as_str().ok_or("Google did not return an access token.")?.into();
    account.expires_at = now() + token["expires_in"].as_u64().unwrap_or(3600);
    // A new sign-in may be a different Google account; selection is explicit.
    account.enabled = false; account.calendar_id.clear(); account.calendar_name.clear();
    save(&app, &account)?;
    Ok(status(&account))
}

async fn access(app: &AppHandle, account: &mut Account, force: bool) -> Result<String, String> {
    if account.refresh_token.is_empty() { return Err("Connect your Google account first.".into()); }
    if force || account.expires_at <= now() + 60 {
        let token = token_request(&[("client_id", &account.client_id), ("client_secret", &account.client_secret), ("refresh_token", &account.refresh_token), ("grant_type", "refresh_token")]).await?;
        account.access_token = token["access_token"].as_str().ok_or("Google did not return an access token.")?.into();
        account.expires_at = now() + token["expires_in"].as_u64().unwrap_or(3600);
        save(app, account)?;
    }
    Ok(account.access_token.clone())
}

// A typed, fixed-host gateway: neither tokens nor arbitrary authenticated URLs
// are exposed to the webview. Every page is fetched before returning a snapshot.
async fn request(app: &AppHandle, account: &mut Account, method: Method, url: Url, body: Option<Value>, etag: Option<&str>) -> Result<Value, String> {
    let http = client()?;
    for attempt in 0..2 {
        let bearer = access(app, account, attempt == 1).await?;
        let mut request = http.request(method.clone(), url.clone()).bearer_auth(bearer);
        if let Some(value) = &body { request = request.json(value); }
        if let Some(tag) = etag { request = request.header("If-Match", tag); }
        let response = request.send().await.map_err(|_| "Google is unreachable. Your changes are saved locally and will retry.")?;
        let code = response.status().as_u16();
        if code == 401 && attempt == 0 { continue; }
        if code == 404 || code == 410 { return Ok(json!({"status":"cancelled", "httpStatus":code})); }
        if code == 409 { return Err("GOOGLE_DUPLICATE".into()); }
        if code == 412 { return Err("An event changed in Google during sync. Sync again to merge the latest version.".into()); }
        if code == 429 || code >= 500 { return Err("Google is temporarily busy. Slate will retry automatically.".into()); }
        if !response.status().is_success() { return Err(format!("Google Calendar returned {code}. Check calendar permissions and that the Calendar API is enabled.")); }
        if code == 204 { return Ok(json!({"status":"cancelled"})); }
        return response.json().await.map_err(|_| "Google returned an unreadable calendar response.".into());
    }
    Err("Reconnect your Google account.".into())
}
fn url(parts: &[&str]) -> Url {
    let mut value = Url::parse(API).unwrap();
    value.path_segments_mut().unwrap().pop_if_empty().extend(parts);
    value
}
async fn pages(app: &AppHandle, account: &mut Account, mut url: Url) -> Result<Vec<Value>, String> {
    let mut items = Vec::new();
    for _ in 0..200 {
        let value = request(app, account, Method::GET, url.clone(), None, None).await?;
        if value["status"] == "cancelled" { return Err("The selected Google calendar is no longer accessible.".into()); }
        if let Some(rows) = value["items"].as_array() { items.extend(rows.iter().cloned()); }
        let Some(next) = value["nextPageToken"].as_str() else { return Ok(items); };
        let pairs: Vec<_> = url.query_pairs().into_owned().filter(|(key, _)| key != "pageToken").collect();
        url.set_query(None); url.query_pairs_mut().extend_pairs(pairs).append_pair("pageToken", next);
    }
    Err("This calendar is too large to sync in one pass. Choose a smaller calendar.".into())
}

#[tauri::command]
pub async fn google_calendars(app: AppHandle, state: State<'_, GoogleState>) -> Result<Value, String> {
    let _guard = state.0.lock().await; let mut account = load(&app)?;
    let mut endpoint = url(&["users", "me", "calendarList"]); endpoint.query_pairs_mut().append_pair("maxResults", "250");
    Ok(Value::Array(pages(&app, &mut account, endpoint).await?.into_iter().filter(|c| c["deleted"] != true).map(|c| json!({"id":c["id"],"summary":c["summary"],"accessRole":c["accessRole"],"primary":c["primary"],"timeZone":c["timeZone"]})).collect()))
}

#[tauri::command]
pub async fn google_select(app: AppHandle, state: State<'_, GoogleState>, calendar_id: String, calendar_name: String, mode: String, enabled: bool) -> Result<Value, String> {
    let _guard = state.0.lock().await; let mut account = load(&app)?;
    if mode != "push" { return Err("Slate supports Slate to Google sync only.".into()); }
    if enabled {
        if calendar_id.is_empty() { return Err("Choose a Google calendar first.".into()); }
        let selected = request(&app, &mut account, Method::GET, url(&["users", "me", "calendarList", &calendar_id]), None, None).await?;
        let role = selected["accessRole"].as_str().unwrap_or("");
        if !(role == "owner" || role == "writer") { return Err("This calendar does not allow Slate to create events.".into()); }
    }
    account.calendar_id = calendar_id; account.calendar_name = calendar_name; account.mode = mode; account.enabled = enabled;
    save(&app, &account)?; Ok(status(&account))
}

#[tauri::command]
pub async fn google_events(app: AppHandle, state: State<'_, GoogleState>) -> Result<Value, String> {
    let _guard = state.0.lock().await; let mut account = load(&app)?;
    if !account.enabled { return Err("Google sync is paused.".into()); }
    let mut endpoint = url(&["calendars", &account.calendar_id, "events"]);
    endpoint.query_pairs_mut().extend_pairs([("maxResults", "2500"), ("singleEvents", "false"), ("showDeleted", "false"), ("privateExtendedProperty", "slateApp=slate-v1")]);
    Ok(Value::Array(pages(&app, &mut account, endpoint).await?))
}

#[tauri::command]
pub async fn google_event(app: AppHandle, state: State<'_, GoogleState>, action: String, event_id: String, body: Option<Value>, etag: Option<String>) -> Result<Value, String> {
    let _guard = state.0.lock().await; let mut account = load(&app)?;
    if !account.enabled { return Err("Google sync is paused.".into()); }
    if action != "get" && account.mode == "pull" { return Err("This connection is read-only.".into()); }
    let method = match action.as_str() { "get" => Method::GET, "insert" => Method::POST, "patch" => Method::PATCH, "delete" => Method::DELETE, _ => return Err("Unknown calendar operation.".into()) };
    if event_id.is_empty() { return Err("Event ID is missing.".into()); }
    let mut endpoint = if action == "insert" { url(&["calendars", &account.calendar_id, "events"]) } else { url(&["calendars", &account.calendar_id, "events", &event_id]) };
    if action != "get" { endpoint.query_pairs_mut().append_pair("sendUpdates", "none"); }
    if let Some(value) = &body {
        let obj = value.as_object().ok_or("Invalid event data.")?;
        if obj.keys().any(|k| !["id", "summary", "description", "start", "end", "recurrence", "extendedProperties"].contains(&k.as_str())) { return Err("Unsupported event field.".into()); }
    }
    request(&app, &mut account, method, endpoint, body, etag.as_deref()).await
}

#[tauri::command]
pub async fn google_disconnect(app: AppHandle, state: State<'_, GoogleState>) -> Result<Value, String> {
    let _guard = state.0.lock().await; let mut account = load(&app)?;
    // Forget this device's tokens even when offline. Existing events stay intact.
    account.refresh_token.clear(); account.access_token.clear(); account.expires_at = 0; account.enabled = false;
    save(&app, &account)?; Ok(status(&account))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test] fn pkce_rfc_vector() { assert_eq!(challenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"), "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM"); }
    #[test] fn callback_requires_matching_state() {
        assert_eq!(callback_code("GET /?code=secret&state=wrong HTTP/1.1\r\n", "expected").unwrap(), None);
        assert_eq!(callback_code("GET /?code=ok%2Bcode&state=expected HTTP/1.1\r\n", "expected").unwrap(), Some("ok+code".into()));
        assert!(callback_code("GET /?error=access_denied&state=expected HTTP/1.1\r\n", "expected").is_err());
        assert_eq!(callback_code("GET /favicon.ico HTTP/1.1\r\n", "expected").unwrap(), None);
    }
    #[test] fn event_ids_are_path_segments() { assert!(url(&["calendars", "a@example.com", "events", "a/b?c"]).as_str().ends_with("/a%2Fb%3Fc")); }
    #[cfg(windows)]
    #[test] fn credentials_roundtrip_without_plaintext() { let raw = b"private-test-refresh-token"; let encrypted = protect(raw, true).unwrap(); assert!(!encrypted.windows(raw.len()).any(|w| w == raw)); assert_eq!(protect(&encrypted, false).unwrap(), raw); }
}
