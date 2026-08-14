//! TMDB (films, series) + RAWG (games) lookups, mirroring server/metadata.js
//! so the packaged app needs no node proxy. Keys live in the app config dir
//! and never reach the webview.

use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
use std::sync::Mutex;
use std::time::{Duration, Instant};

const TMDB: &str = "https://api.themoviedb.org/3";
const RAWG: &str = "https://api.rawg.io/api";
const IMG: &str = "https://image.tmdb.org/t/p/w185";
const TTL: Duration = Duration::from_secs(60 * 60);
const TIMEOUT: Duration = Duration::from_secs(8);

#[derive(Default, Serialize, Deserialize, Clone)]
pub struct Keys {
    #[serde(default)]
    pub tmdb: String,
    #[serde(default)]
    pub rawg: String,
}

impl Keys {
    fn tmdb(&self) -> Option<&str> {
        let k = self.tmdb.trim();
        (!k.is_empty()).then_some(k)
    }
    fn rawg(&self) -> Option<&str> {
        let k = self.rawg.trim();
        (!k.is_empty()).then_some(k)
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

/// small TTL cache so repeated typing stays well inside RAWG's monthly quota
pub struct Cache {
    entries: Mutex<HashMap<String, (Instant, Value)>>,
}

impl Cache {
    pub fn new() -> Self {
        Self { entries: Mutex::new(HashMap::new()) }
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

async fn rawg_get(key: &str, path: &str, query: &[(&str, String)]) -> Option<Value> {
    let mut url = reqwest::Url::parse(&format!("{RAWG}{path}")).ok()?;
    url.query_pairs_mut().append_pair("key", key);
    for (k, v) in query {
        url.query_pairs_mut().append_pair(k, v);
    }
    let res = client().get(url).send().await.ok()?;
    if !res.status().is_success() {
        return None;
    }
    res.json::<Value>().await.ok()
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
    let mut lists: Vec<Vec<SearchResult>> = Vec::new();

    if let (Some(key), true) = (keys.tmdb(), want("film")) {
        if let Some(d) = tmdb_get(key, "/search/movie", &[("query", q.into())]).await {
            lists.push(map_tmdb(&d, "film", "title", "release_date"));
        }
    }
    if let (Some(key), true) = (keys.tmdb(), want("series")) {
        if let Some(d) = tmdb_get(key, "/search/tv", &[("query", q.into())]).await {
            lists.push(map_tmdb(&d, "series", "name", "first_air_date"));
        }
    }
    if let (Some(key), true) = (keys.rawg(), want("game")) {
        let params = [("search", q.to_string()), ("page_size", "5".into())];
        if let Some(d) = rawg_get(key, "/games", &params).await {
            lists.push(map_rawg(&d));
        }
    }

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
    if let Ok(v) = serde_json::to_value(&merged) {
        cache.put(cache_key, v);
    }
    merged
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

fn map_rawg(d: &Value) -> Vec<SearchResult> {
    d.get("results")
        .and_then(|r| r.as_array())
        .map(|rows| {
            rows.iter()
                .take(5)
                .map(|r| {
                    let date = non_empty(r.get("released"));
                    SearchResult {
                        source: "rawg".into(),
                        kind: "game".into(),
                        id: r.get("id").and_then(|i| i.as_i64()).unwrap_or(0).to_string(),
                        title: non_empty(r.get("name")).unwrap_or_default(),
                        year: year_of(&date),
                        date,
                        poster_url: non_empty(r.get("background_image")),
                    }
                })
                .collect()
        })
        .unwrap_or_default()
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

    let out = if source == "rawg" {
        let key = keys.rawg()?;
        let d = rawg_get(key, &format!("/games/{id}"), &[]).await?;
        Details {
            ok: true,
            date: non_empty(d.get("released")),
            title: non_empty(d.get("name")).unwrap_or_default(),
            // rawg playtime is in hours
            runtime_min: mins(d.get("playtime")).map(|h| h * 60),
        }
    } else {
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
