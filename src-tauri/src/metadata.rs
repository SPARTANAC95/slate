//! TMDB (films, series) + IGDB with a Steam fallback (games), mirroring
//! server/metadata.js so the packaged app needs no node proxy. Keys live in
//! the app config dir and never reach the webview.
//!
//! RAWG used to serve games and went dark, so `rawg` survives only as a source
//! label on entries added back then — there is nothing left to ask it.

use futures_util::future::join_all;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
use std::sync::Mutex;
use std::time::{Duration, Instant};

const TMDB: &str = "https://api.themoviedb.org/3";
const IGDB: &str = "https://api.igdb.com/v4";
const TWITCH: &str = "https://id.twitch.tv/oauth2/token";
const STEAM: &str = "https://store.steampowered.com/api";
const IMG: &str = "https://image.tmdb.org/t/p/w185";
const IGDB_IMG: &str = "https://images.igdb.com/igdb/image/upload/t_cover_big";
const STEAM_IMG: &str = "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps";
const TTL: Duration = Duration::from_secs(60 * 60);
const TIMEOUT: Duration = Duration::from_secs(8);
/// how long one provider may hold up a search that others have answered
const SEARCH_DEADLINE: Duration = Duration::from_secs(3);
/// and how long IGDB may take before the games lane gives up and asks Steam
const IGDB_BUDGET: Duration = Duration::from_secs(2);
/// after missing that deadline, a lane is left alone for this long —
/// short, because a merely slow answer must not hide a working provider
const BREAKER: Duration = Duration::from_secs(60);

#[derive(Default, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Keys {
    #[serde(default)]
    pub tmdb: String,
    /// IGDB authenticates as a Twitch app, so it takes two halves, not one key
    #[serde(default)]
    pub igdb_id: String,
    #[serde(default)]
    pub igdb_secret: String,
}

impl Keys {
    fn tmdb(&self) -> Option<&str> {
        let k = self.tmdb.trim();
        (!k.is_empty()).then_some(k)
    }
    fn igdb(&self) -> Option<(&str, &str)> {
        let id = self.igdb_id.trim();
        let secret = self.igdb_secret.trim();
        (!id.is_empty() && !secret.is_empty()).then_some((id, secret))
    }
}

#[derive(Serialize, Deserialize, Clone)]
pub struct SearchResult {
    pub source: String,
    pub kind: String,
    pub id: String,
    pub title: String,
    pub date: Option<String>,
    pub year: Option<i64>,
    #[serde(rename = "posterUrl")]
    pub poster_url: Option<String>,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct Details {
    pub ok: bool,
    pub date: Option<String>,
    pub title: String,
    #[serde(rename = "runtimeMin")]
    pub runtime_min: Option<i64>,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct Episode {
    pub episode: i64,
    pub title: String,
    pub date: String,
    #[serde(rename = "runtimeMin")]
    pub runtime_min: Option<i64>,
}

/// small TTL cache so repeated typing stays polite to every provider
pub struct Cache {
    entries: Mutex<HashMap<String, (Instant, Value)>>,
    /// lane → when it may be tried again after it stopped answering
    down: Mutex<HashMap<&'static str, Instant>>,
    /// IGDB app access token, and when it stops being trustworthy
    token: Mutex<Option<(String, Instant)>>,
}

impl Cache {
    pub fn new() -> Self {
        Self {
            entries: Mutex::new(HashMap::new()),
            down: Mutex::new(HashMap::new()),
            token: Mutex::new(None),
        }
    }

    /// A provider that hangs would otherwise cost every later keystroke the
    /// full deadline. Skip it for a minute instead.
    fn is_down(&self, name: &str) -> bool {
        self.down
            .lock()
            .ok()
            .and_then(|m| m.get(name).map(|until| Instant::now() < *until))
            .unwrap_or(false)
    }

    fn mark_down(&self, name: &'static str) {
        if let Ok(mut m) = self.down.lock() {
            m.insert(name, Instant::now() + BREAKER);
        }
    }

    fn mark_up(&self, name: &'static str) {
        if let Ok(mut m) = self.down.lock() {
            m.remove(name);
        }
    }

    fn get(&self, key: &str) -> Option<Value> {
        let mut map = self.entries.lock().ok()?;
        match map.get(key) {
            Some((at, v)) if at.elapsed() < TTL => Some(v.clone()),
            Some(_) => {
                map.remove(key);
                None
            }
            None => None,
        }
    }

    fn put(&self, key: String, value: Value) {
        if let Ok(mut map) = self.entries.lock() {
            if map.len() > 500 {
                map.clear();
            }
            map.insert(key, (Instant::now(), value));
        }
    }

    /// Drop everything. Called when the keys change: results cached while a
    /// key was missing or wrong would otherwise look like a dead provider
    /// for a full hour after it was fixed.
    pub fn clear(&self) {
        if let Ok(mut map) = self.entries.lock() {
            map.clear();
        }
        // a lane parked by the breaker deserves a fresh try with new keys
        if let Ok(mut map) = self.down.lock() {
            map.clear();
        }
        // and a token minted for the previous credentials is worthless
        if let Ok(mut token) = self.token.lock() {
            *token = None;
        }
    }
}

fn client() -> reqwest::Client {
    reqwest::Client::builder()
        .timeout(TIMEOUT)
        .build()
        .unwrap_or_default()
}

async fn tmdb_get(key: &str, path: &str, query: &[(&str, String)]) -> Option<Value> {
    let mut url = reqwest::Url::parse(&format!("{TMDB}{path}")).ok()?;
    for (k, v) in query {
        url.query_pairs_mut().append_pair(k, v);
    }
    let mut req = client().get(url.clone());
    // a v4 read access token is a JWT; a classic v3 key goes in the query
    if key.starts_with("eyJ") {
        req = req.bearer_auth(key);
    } else {
        let mut u = url;
        u.query_pairs_mut().append_pair("api_key", key);
        req = client().get(u);
    }
    let res = req.send().await.ok()?;
    if !res.status().is_success() {
        return None;
    }
    res.json::<Value>().await.ok()
}

/// An app access token is good for ~60 days; minting one per search would be
/// rude, so it is held until a day before it lapses.
async fn igdb_token(keys: &Keys, cache: &Cache) -> Result<String, String> {
    let (id, secret) = keys.igdb().ok_or("missing")?;
    if let Ok(guard) = cache.token.lock() {
        if let Some((token, until)) = guard.as_ref() {
            if Instant::now() < *until {
                return Ok(token.clone());
            }
        }
    }
    let mut url = reqwest::Url::parse(TWITCH).map_err(|_| "error".to_string())?;
    url.query_pairs_mut()
        .append_pair("client_id", id)
        .append_pair("client_secret", secret)
        .append_pair("grant_type", "client_credentials");
    let res = client()
        .post(url)
        .send()
        .await
        .map_err(|_| "unreachable".to_string())?;
    if !res.status().is_success() {
        return Err(verdict_of(res.status()).to_string());
    }
    let body: Value = res.json().await.map_err(|_| "error".to_string())?;
    let token = body
        .get("access_token")
        .and_then(|t| t.as_str())
        .ok_or("error")?
        .to_string();
    // retire it a day early rather than discover the expiry as a failed search
    let life = body
        .get("expires_in")
        .and_then(|v| v.as_u64())
        .unwrap_or(0)
        .saturating_sub(86_400)
        .max(60);
    if let Ok(mut guard) = cache.token.lock() {
        *guard = Some((token.clone(), Instant::now() + Duration::from_secs(life)));
    }
    Ok(token)
}

async fn igdb_send(
    id: &str,
    token: &str,
    path: &str,
    body: String,
) -> Result<reqwest::Response, String> {
    client()
        .post(format!("{IGDB}{path}"))
        .header("Client-ID", id)
        .bearer_auth(token)
        .header(reqwest::header::ACCEPT, "application/json")
        .body(body)
        .send()
        .await
        .map_err(|_| "unreachable".to_string())
}

/// Errors come back as the same words `check_keys` reports, so a failed lookup
/// and a failed key test can never disagree about whose fault it was.
async fn igdb_post(keys: &Keys, cache: &Cache, path: &str, body: String) -> Result<Value, String> {
    let (id, _) = keys.igdb().ok_or("missing")?;
    let token = igdb_token(keys, cache).await?;
    let mut res = igdb_send(id, &token, path, body.clone()).await?;
    if res.status() == reqwest::StatusCode::UNAUTHORIZED {
        // a rotated secret or a token revoked early: one fresh try, then stop
        if let Ok(mut guard) = cache.token.lock() {
            *guard = None;
        }
        let token = igdb_token(keys, cache).await?;
        res = igdb_send(id, &token, path, body).await?;
    }
    if !res.status().is_success() {
        return Err(verdict_of(res.status()).to_string());
    }
    res.json::<Value>().await.map_err(|_| "error".to_string())
}

async fn steam_get(path: &str, query: &[(&str, String)]) -> Option<Value> {
    let mut url = reqwest::Url::parse(&format!("{STEAM}{path}")).ok()?;
    for (k, v) in query {
        url.query_pairs_mut().append_pair(k, v);
    }
    let res = client().get(url).send().await.ok()?;
    if !res.status().is_success() {
        return None;
    }
    res.json::<Value>().await.ok()
}

/// what each provider did when we actually called it
#[derive(Serialize, Deserialize, Clone)]
pub struct KeyCheck {
    pub tmdb: String,
    pub igdb: String,
    pub steam: String,
}

fn verdict_of(status: reqwest::StatusCode) -> &'static str {
    match status.as_u16() {
        s if (200..300).contains(&s) => "ok",
        // twitch answers 400 'invalid client' for a wrong id or secret
        400 | 401 | 403 => "rejected",
        s if s >= 500 => "down",
        _ => "error",
    }
}

async fn probe(url: reqwest::Url) -> String {
    match client().get(url).send().await {
        Ok(res) => verdict_of(res.status()).to_string(),
        Err(_) => "unreachable".to_string(),
    }
}

/// Call every provider once with the stored keys. A silent empty dropdown can
/// mean a missing key, a rejected key or no network — this says which. Steam
/// needs no key, so its line is really "can this machine reach the store".
pub async fn check_keys(keys: &Keys, cache: &Cache) -> KeyCheck {
    let tmdb = async {
        match keys.tmdb() {
            None => "missing".to_string(),
            Some(key) => {
                let mut url = reqwest::Url::parse(&format!("{TMDB}/configuration")).unwrap();
                if !key.starts_with("eyJ") {
                    url.query_pairs_mut().append_pair("api_key", key);
                    probe(url).await
                } else {
                    match client().get(url).bearer_auth(key).send().await {
                        Ok(res) => verdict_of(res.status()).to_string(),
                        Err(_) => "unreachable".to_string(),
                    }
                }
            }
        }
    };
    // two halves and two hops: a wrong secret fails at twitch, a wrong client
    // id can still fail at igdb, and both deserve the same plain verdict
    let igdb = async {
        if keys.igdb().is_none() {
            return "missing".to_string();
        }
        match igdb_post(keys, cache, "/games", "fields name; limit 1;".to_string()).await {
            Ok(_) => "ok".to_string(),
            Err(verdict) => verdict,
        }
    };
    let steam = async {
        let mut url = reqwest::Url::parse(&format!("{STEAM}/storesearch/")).unwrap();
        url.query_pairs_mut()
            .append_pair("term", "dune")
            .append_pair("l", "english")
            .append_pair("cc", "us");
        probe(url).await
    };
    let (tmdb, igdb, steam) = tokio::join!(tmdb, igdb, steam);
    KeyCheck { tmdb, igdb, steam }
}

/// give up on one lookup early; a timed-out lane is simply absent, and stays
/// absent for a minute so it cannot slow every later keystroke
async fn deadline<T, F: std::future::Future<Output = T>>(
    cache: &Cache,
    name: &'static str,
    fut: F,
) -> Option<T> {
    match tokio::time::timeout(SEARCH_DEADLINE, fut).await {
        Ok(value) => {
            cache.mark_up(name);
            Some(value)
        }
        Err(_) => {
            cache.mark_down(name);
            None
        }
    }
}

fn year_of(date: &Option<String>) -> Option<i64> {
    date.as_ref()?.get(0..4)?.parse().ok()
}

fn non_empty(v: Option<&Value>) -> Option<String> {
    let s = v?.as_str()?;
    (!s.is_empty()).then(|| s.to_string())
}

/// providers report 0 for "we don't know yet", which is not a length
fn mins(v: Option<&Value>) -> Option<i64> {
    v?.as_i64().filter(|n| *n > 0)
}

/// IGDB dates are unix seconds, UTC
fn from_unix(v: Option<&Value>) -> Option<String> {
    let secs = v?.as_i64().filter(|n| *n > 0)?;
    chrono::DateTime::<chrono::Utc>::from_timestamp(secs, 0)
        .map(|d| d.format("%Y-%m-%d").to_string())
}

/// Apicalypse quotes the search term and ends statements with a semicolon, so
/// a title carrying either would rewrite the query.
fn apicalypse(q: &str) -> String {
    q.chars()
        .map(|c| if matches!(c, '"' | '\\' | ';') { ' ' } else { c })
        .collect::<String>()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

const MONTHS: [&str; 12] = [
    "jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec",
];

/// the first standalone 19xx/20xx in the string, and the byte it starts at
fn find_year(s: &str) -> Option<(usize, i64)> {
    let b = s.as_bytes();
    for i in 0..b.len().saturating_sub(3) {
        if i > 0 && b[i - 1].is_ascii_digit() {
            continue;
        }
        if b.get(i + 4).is_some_and(|c| c.is_ascii_digit()) {
            continue;
        }
        if !b[i..i + 4].iter().all(|c| c.is_ascii_digit()) {
            continue;
        }
        if &b[i..i + 2] != b"19" && &b[i..i + 2] != b"20" {
            continue;
        }
        return std::str::from_utf8(&b[i..i + 4]).ok()?.parse().ok().map(|y| (i, y));
    }
    None
}

/// the first standalone run of one or two digits — a day, given a month
fn find_day(s: &str) -> Option<i64> {
    let b = s.as_bytes();
    let mut i = 0;
    while i < b.len() {
        if !b[i].is_ascii_digit() {
            i += 1;
            continue;
        }
        let start = i;
        while i < b.len() && b[i].is_ascii_digit() {
            i += 1;
        }
        if i - start <= 2 {
            return std::str::from_utf8(&b[start..i]).ok()?.parse().ok();
        }
    }
    None
}

/// Steam ships release dates as display text, and for anything unreleased that
/// may be a quarter ('Q1 2027'), a month ('March 2027') or nothing at all
/// ('Coming soon'). Give back a full date only when a day is really known —
/// the year is still worth having on its own, for the search dropdown.
/// Kept in step with `parseSteamDate` in server/metadata.js, case for case.
fn parse_steam_date(text: &str) -> (Option<String>, Option<i64>) {
    let s = text.to_lowercase();
    let Some((at, year)) = find_year(&s) else {
        return (None, None);
    };
    // drop the year first, so its digits cannot be read as a day
    let mut rest = s.clone();
    rest.replace_range(at..at + 4, " ");
    let month = MONTHS.iter().position(|m| rest.contains(m)).map(|i| i as i64 + 1);
    match (month, find_day(&rest)) {
        (Some(m), Some(d)) if (1..=31).contains(&d) => {
            (Some(format!("{year:04}-{m:02}-{d:02}")), Some(year))
        }
        _ => (None, Some(year)),
    }
}

/// how many storesearch hits are worth spending a date lookup on
const STEAM_CANDIDATES: usize = 5;

/// Steam files soundtracks, demos and artbooks as apps right beside the games.
/// `appdetails` would say which is which, but only at a request each, and the
/// search lane cannot afford that — it already spends one per row on dates, and
/// going over budget is what trips the breaker. The names give it away for free.
/// Matched on word boundaries: plenty of real games have "ost" inside a word.
fn is_release(name: &str) -> bool {
    const JUNK: [&str; 7] = [
        "soundtrack",
        "ost",
        "demo",
        "playtest",
        "artbook",
        "wallpaper",
        "trailer",
    ];
    let lower = name.to_lowercase();
    // "art book" is two words to the split below; the js copy matches the phrase
    if lower.contains("art book") {
        return false;
    }
    !lower
        .split(|c: char| !c.is_alphanumeric())
        .any(|word| JUNK.contains(&word))
}

#[derive(Serialize, Deserialize, Clone)]
struct SteamApp {
    title: String,
    date: Option<String>,
    year: Option<i64>,
}

/// Just the release date, cached per app. `filters=release_date` answers in
/// ~70 bytes where `basic` costs 11KB, which matters when five of these go out
/// per keystroke — bandwidth is what makes steam start throttling.
async fn steam_release(cache: &Cache, id: &str) -> (Option<String>, Option<i64>) {
    let cache_key = format!("sr:{id}");
    if let Some(hit) = cache.get(&cache_key) {
        if let Ok(v) = serde_json::from_value(hit) {
            return v;
        }
    }
    let params = [
        ("appids", id.to_string()),
        ("filters", "release_date".into()),
        ("l", "english".into()),
    ];
    let Some(d) = steam_get("/appdetails", &params).await else {
        return (None, None);
    };
    let info = d.get(id);
    if info.and_then(|i| i.get("success")).and_then(|s| s.as_bool()) != Some(true) {
        return (None, None);
    }
    let out = parse_steam_date(
        info.and_then(|i| i.get("data"))
            .and_then(|d| d.get("release_date"))
            .and_then(|r| r.get("date"))
            .and_then(|v| v.as_str())
            .unwrap_or(""),
    );
    if let Ok(v) = serde_json::to_value(&out) {
        cache.put(cache_key, v);
    }
    out
}

/// Name and release date, for one app we already care about. Only the details
/// path needs the title, and that runs on add and on the daily refresh — rarely
/// enough that the bigger payload is fine.
async fn steam_app(cache: &Cache, id: &str) -> Option<SteamApp> {
    let cache_key = format!("sa:{id}");
    if let Some(hit) = cache.get(&cache_key) {
        if let Ok(v) = serde_json::from_value(hit) {
            return Some(v);
        }
    }
    let params = [
        ("appids", id.to_string()),
        ("filters", "basic,release_date".into()),
        ("l", "english".into()),
    ];
    let d = steam_get("/appdetails", &params).await?;
    let info = d.get(id)?;
    if info.get("success").and_then(|s| s.as_bool()) != Some(true) {
        return None;
    }
    let data = info.get("data")?;
    let (date, year) = parse_steam_date(
        data.get("release_date")
            .and_then(|r| r.get("date"))
            .and_then(|v| v.as_str())
            .unwrap_or(""),
    );
    let out = SteamApp {
        title: non_empty(data.get("name")).unwrap_or_default(),
        date,
        year,
    };
    if let Ok(v) = serde_json::to_value(&out) {
        cache.put(cache_key, v);
    }
    Some(out)
}

/// merged search across providers, interleaved so one source can't crowd out
/// the others, capped at 5
pub async fn search(keys: &Keys, cache: &Cache, q: &str, kinds: &str) -> Vec<SearchResult> {
    let cache_key = format!("s:{kinds}:{}", q.to_lowercase());
    if let Some(hit) = cache.get(&cache_key) {
        if let Ok(v) = serde_json::from_value(hit) {
            return v;
        }
    }
    let want = |k: &str| kinds.is_empty() || kinds.split(',').any(|c| c == k);

    // All three go out at once and each gets its own short deadline: one
    // provider having an outage must not hold the dropdown shut while the
    // others already have answers. Each reports whether it actually answered,
    // because an empty list from a lane that never replied means "unknown".
    //
    // A lane parked by the breaker has not answered either. It used to be
    // filed under "nothing was asked of it", which let a games-only result be
    // cached for the hour while tmdb was only resting for a minute — the
    // same blind spot the games lane already had fixed, on the other side.
    let tmdb_lane = |path: &'static str, kind: &'static str, title_key: &'static str, date_key: &'static str, wanted: bool| async move {
        let Some(key) = keys.tmdb() else {
            // nothing was asked of it, so nothing is missing from the answer
            return (true, Vec::new());
        };
        if !wanted {
            return (true, Vec::new());
        }
        if cache.is_down("tmdb") {
            return (false, Vec::new());
        }
        match deadline(cache, "tmdb", tmdb_get(key, path, &[("query", q.into())])).await {
            Some(Some(d)) => (true, map_tmdb(&d, kind, title_key, date_key)),
            _ => (false, Vec::new()),
        }
    };
    let films = tmdb_lane("/search/movie", "film", "title", "release_date", want("film"));
    let series = tmdb_lane("/search/tv", "series", "name", "first_air_date", want("series"));
    let games = async {
        if !want("game") {
            return (true, Vec::new());
        }
        // a lane parked by the breaker has not answered either
        if cache.is_down("game") {
            return (false, Vec::new());
        }
        match deadline(cache, "game", game_results(keys, cache, q)).await {
            Some(rows) => (true, rows),
            None => (false, Vec::new()),
        }
    };
    let (films, series, games) = tokio::join!(films, series, games);
    let complete = films.0 && series.0 && games.0;
    let lists: Vec<Vec<SearchResult>> = [films.1, series.1, games.1]
        .into_iter()
        .filter(|l| !l.is_empty())
        .collect();

    let mut merged: Vec<SearchResult> = Vec::new();
    for i in 0..5 {
        let before = merged.len();
        for list in &lists {
            if merged.len() >= 5 {
                break;
            }
            if let Some(item) = list.get(i) {
                merged.push(item.clone());
            }
        }
        if merged.len() == before {
            break;
        }
    }
    // Only a complete answer is worth keeping for an hour. Caching the empty
    // result of a timed-out or skipped lane is how one bad second makes a real
    // game unfindable until the hour is up, with no way for anyone to ask again.
    if complete && !merged.is_empty() {
        if let Ok(v) = serde_json::to_value(&merged) {
            cache.put(cache_key, v);
        }
    }
    merged
}

/// IGDB knows about games long before they have a store page, so it leads.
/// Steam takes over whenever IGDB is unconfigured, refused or slow — which is
/// the point of keeping it: games still work with no key at all, and one
/// provider's outage no longer costs the whole kind.
async fn game_results(keys: &Keys, cache: &Cache, q: &str) -> Vec<SearchResult> {
    if keys.igdb().is_some() {
        // version_parent excludes the "… : Ultimate Edition" clones of one release
        let body = format!(
            "search \"{}\"; \
             fields name,first_release_date,cover.image_id,hypes,total_rating_count; \
             where version_parent = null; limit 10;",
            apicalypse(q)
        );
        // its own budget, so a dawdling IGDB still leaves room for the fallback
        if let Ok(Ok(d)) =
            tokio::time::timeout(IGDB_BUDGET, igdb_post(keys, cache, "/games", body)).await
        {
            let rows = map_igdb(&d);
            if !rows.is_empty() {
                return rows;
            }
        }
    }
    steam_games(cache, q).await
}

fn map_tmdb(d: &Value, kind: &str, title_key: &str, date_key: &str) -> Vec<SearchResult> {
    d.get("results")
        .and_then(|r| r.as_array())
        .map(|rows| {
            rows.iter()
                .take(5)
                .map(|r| {
                    let date = non_empty(r.get(date_key));
                    SearchResult {
                        source: "tmdb".into(),
                        kind: kind.into(),
                        id: r.get("id").and_then(|i| i.as_i64()).unwrap_or(0).to_string(),
                        title: non_empty(r.get(title_key)).unwrap_or_default(),
                        year: year_of(&date),
                        date,
                        poster_url: non_empty(r.get("poster_path")).map(|p| format!("{IMG}{p}")),
                    }
                })
                .collect()
        })
        .unwrap_or_default()
}

/// IGDB's fuzzy relevance sometimes ranks a stale placeholder above the real
/// game: searching "silksong" returns a "Hollow Knight Silksong" dated 2021
/// ahead of the actual "Hollow Knight: Silksong" dated 2025, and taking the top
/// row would put a wrong date on the calendar. What gives the placeholder away
/// is that nobody has ever engaged with it — no anticipation, no ratings.
///
/// So demote only those, keeping IGDB's order within each group. Sorting the
/// whole list by popularity instead would bury an obscure game that somebody
/// searched for by its exact name.
fn map_igdb(d: &Value) -> Vec<SearchResult> {
    let Some(rows) = d.as_array() else {
        return Vec::new();
    };
    let (engaged, ignored): (Vec<_>, Vec<_>) = rows
        .iter()
        .map(|r| {
            let weight = r.get("hypes").and_then(|v| v.as_i64()).unwrap_or(0)
                + r.get("total_rating_count").and_then(|v| v.as_i64()).unwrap_or(0);
            let date = from_unix(r.get("first_release_date"));
            (
                weight,
                SearchResult {
                    source: "igdb".into(),
                    kind: "game".into(),
                    id: r.get("id").and_then(|i| i.as_i64()).unwrap_or(0).to_string(),
                    title: non_empty(r.get("name")).unwrap_or_default(),
                    year: year_of(&date),
                    date,
                    poster_url: r
                        .get("cover")
                        .and_then(|c| c.get("image_id"))
                        .and_then(|v| v.as_str())
                        .map(|image| format!("{IGDB_IMG}/{image}.jpg")),
                },
            )
        })
        .partition(|(weight, _)| *weight > 0);
    engaged
        .into_iter()
        .chain(ignored)
        .map(|(_, row)| row)
        .take(5)
        .collect()
}

async fn steam_games(cache: &Cache, q: &str) -> Vec<SearchResult> {
    let params = [
        ("term", q.to_string()),
        ("l", "english".into()),
        ("cc", "us".into()),
    ];
    let Some(d) = steam_get("/storesearch/", &params).await else {
        return Vec::new();
    };
    let candidates: Vec<(String, String)> = d
        .get("items")
        .and_then(|i| i.as_array())
        .map(|rows| {
            rows.iter()
                .filter(|r| r.get("type").and_then(|t| t.as_str()) == Some("app"))
                .filter_map(|r| {
                    let id = r.get("id").and_then(|i| i.as_i64())?;
                    let name = non_empty(r.get("name")).unwrap_or_default();
                    is_release(&name).then(|| (id.to_string(), name))
                })
                .take(STEAM_CANDIDATES)
                .collect()
        })
        .unwrap_or_default();

    // storesearch carries no dates, so each row costs one small call — all at
    // once, or five round trips would eat the whole lane deadline
    let dates = join_all(candidates.iter().map(|(id, _)| steam_release(cache, id))).await;
    candidates
        .into_iter()
        .zip(dates)
        .map(|((id, title), (date, year))| SearchResult {
            source: "steam".into(),
            kind: "game".into(),
            // the portrait capsule; Poster hides itself if there isn't one
            poster_url: Some(format!("{STEAM_IMG}/{id}/library_600x900_2x.jpg")),
            id,
            title,
            date,
            year,
        })
        .collect()
}

/// roughly how long a game takes, so `Pick for me` can filter on real lengths
async fn igdb_playtime(keys: &Keys, cache: &Cache, id: i64) -> Option<i64> {
    let body = format!("fields normally; where game_id = {id}; limit 1;");
    // a length nobody has measured is not an error
    let d = igdb_post(keys, cache, "/game_time_to_beats", body).await.ok()?;
    let secs = d.as_array()?.first()?.get("normally")?.as_i64()?;
    (secs > 0).then(|| (secs as f64 / 60.0).round() as i64)
}

/// current date + runtime for one linked entry, episode-aware for series
pub async fn details(
    keys: &Keys,
    cache: &Cache,
    source: &str,
    kind: &str,
    id: &str,
    season: Option<i64>,
    episode: Option<i64>,
) -> Option<Details> {
    let cache_key = format!(
        "d:{source}:{kind}:{id}:{}:{}",
        season.unwrap_or(0),
        episode.unwrap_or(0)
    );
    if let Some(hit) = cache.get(&cache_key) {
        if let Ok(v) = serde_json::from_value(hit) {
            return Some(v);
        }
    }

    let out = match source {
        // entries linked to rawg predate its shutdown; nothing left to ask
        "rawg" => return None,
        "igdb" => {
            let game_id: i64 = id.parse().ok().filter(|n| *n > 0)?;
            let body = format!("fields name,first_release_date; where id = {game_id}; limit 1;");
            let d = igdb_post(keys, cache, "/games", body).await.ok()?;
            let g = d.as_array()?.first()?.clone();
            Details {
                ok: true,
                date: from_unix(g.get("first_release_date")),
                title: non_empty(g.get("name")).unwrap_or_default(),
                runtime_min: igdb_playtime(keys, cache, game_id).await,
            }
        }
        "steam" => {
            let app = steam_app(cache, id).await?;
            Details {
                ok: true,
                date: app.date,
                title: app.title,
                // steam publishes no playtime — a game keeps whatever it had
                runtime_min: None,
            }
        }
        _ => {
            let key = keys.tmdb()?;
            match (kind, season, episode) {
                ("series", Some(s), Some(e)) => {
                    let d = tmdb_get(key, &format!("/tv/{id}/season/{s}/episode/{e}"), &[]).await?;
                    Details {
                        ok: true,
                        date: non_empty(d.get("air_date")),
                        title: non_empty(d.get("name")).unwrap_or_default(),
                        runtime_min: mins(d.get("runtime")),
                    }
                }
                ("series", _, _) => {
                    let d = tmdb_get(key, &format!("/tv/{id}"), &[]).await?;
                    Details {
                        ok: true,
                        date: non_empty(d.get("first_air_date")),
                        title: non_empty(d.get("name")).unwrap_or_default(),
                        runtime_min: d
                            .get("episode_run_time")
                            .and_then(|r| r.as_array())
                            .and_then(|a| a.first())
                            .and_then(|v| mins(Some(v))),
                    }
                }
                _ => {
                    let d = tmdb_get(key, &format!("/movie/{id}"), &[]).await?;
                    Details {
                        ok: true,
                        date: non_empty(d.get("release_date")),
                        title: non_empty(d.get("title")).unwrap_or_default(),
                        runtime_min: mins(d.get("runtime")),
                    }
                }
            }
        }
    };
    if let Ok(v) = serde_json::to_value(&out) {
        cache.put(cache_key, v);
    }
    Some(out)
}

/// every dated episode of one season — the whole-season add
pub async fn season_episodes(
    keys: &Keys,
    cache: &Cache,
    id: &str,
    season: i64,
) -> Option<Vec<Episode>> {
    let cache_key = format!("se:{id}:{season}");
    if let Some(hit) = cache.get(&cache_key) {
        if let Ok(v) = serde_json::from_value(hit) {
            return Some(v);
        }
    }
    let key = keys.tmdb()?;
    let d = tmdb_get(key, &format!("/tv/{id}/season/{season}"), &[]).await?;
    let episodes: Vec<Episode> = d
        .get("episodes")
        .and_then(|e| e.as_array())
        .map(|rows| {
            rows.iter()
                .filter_map(|r| {
                    let date = non_empty(r.get("air_date"))?;
                    let number = r.get("episode_number").and_then(|n| n.as_i64())?;
                    Some(Episode {
                        episode: number,
                        title: non_empty(r.get("name"))
                            .unwrap_or_else(|| format!("episode {number}")),
                        date,
                        runtime_min: mins(r.get("runtime")),
                    })
                })
                .collect()
        })
        .unwrap_or_default();
    if let Ok(v) = serde_json::to_value(&episodes) {
        cache.put(cache_key, v);
    }
    Some(episodes)
}

#[cfg(test)]
mod tests {
    use super::{apicalypse, parse_steam_date};

    /// The same cases as `server/metadata.test.js`. Two implementations of one
    /// parser are only useful while they agree, and the packaged app runs this
    /// one — a drift here would only show up as a wrong date on the calendar.
    #[test]
    fn reads_both_display_forms() {
        assert_eq!(
            parse_steam_date("4 Sep, 2025"),
            (Some("2025-09-04".into()), Some(2025))
        );
        assert_eq!(
            parse_steam_date("31 December 2026"),
            (Some("2026-12-31".into()), Some(2026))
        );
        assert_eq!(
            parse_steam_date("Sep 4, 2025"),
            (Some("2025-09-04".into()), Some(2025))
        );
        assert_eq!(
            parse_steam_date("March 1, 2027"),
            (Some("2027-03-01".into()), Some(2027))
        );
    }

    #[test]
    fn keeps_the_year_when_the_day_is_unannounced() {
        assert_eq!(parse_steam_date("Q1 2027"), (None, Some(2027)));
        assert_eq!(parse_steam_date("Q4 2026"), (None, Some(2026)));
        assert_eq!(parse_steam_date("March 2027"), (None, Some(2027)));
        assert_eq!(parse_steam_date("May 2026"), (None, Some(2026)));
    }

    #[test]
    fn gives_nothing_for_the_unannounced() {
        assert_eq!(parse_steam_date("Coming soon"), (None, None));
        assert_eq!(parse_steam_date("To be announced"), (None, None));
        assert_eq!(parse_steam_date(""), (None, None));
    }

    #[test]
    fn never_reads_the_year_digits_as_a_day() {
        assert_eq!(parse_steam_date("2025"), (None, Some(2025)));
        assert_eq!(parse_steam_date("Jan 2025"), (None, Some(2025)));
    }

    #[test]
    fn rejects_an_impossible_day() {
        assert_eq!(parse_steam_date("99 Sep, 2025"), (None, Some(2025)));
        assert_eq!(parse_steam_date("0 Sep, 2025"), (None, Some(2025)));
    }

    #[test]
    fn keeps_games_and_drops_the_merchandise() {
        assert!(super::is_release("Hollow Knight: Silksong"));
        assert!(super::is_release("ELDEN RING Shadow of the Erdtree"));
        // 'ghost' and 'demolition' must survive a word that contains ost/demo
        assert!(super::is_release("Ghost of Tsushima"));
        assert!(super::is_release("Demolition Company"));
        assert!(!super::is_release("Hollow Knight: Silksong - Official Soundtrack"));
        assert!(!super::is_release("Some Game Art Book"));
        assert!(!super::is_release("Some Game Artbook"));
        assert!(!super::is_release("Subnautica Original Soundtrack"));
        assert!(!super::is_release("Hades II OST"));
        assert!(!super::is_release("Some Game Demo"));
        assert!(!super::is_release("Some Game Playtest"));
    }

    #[test]
    fn a_title_cannot_rewrite_an_apicalypse_query() {
        assert_eq!(apicalypse("half-life 2"), "half-life 2");
        assert_eq!(apicalypse("a\"; fields *; //"), "a fields * //");
        assert_eq!(apicalypse("  spaced   out  "), "spaced out");
    }
}
