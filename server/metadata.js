// TMDB (films, series) + IGDB with a Steam fallback (games). Keys live in .env
// and never reach the client. Missing keys degrade to empty results, never
// errors. RAWG used to serve games; it went dark, so `rawg` now only survives
// as a source label on entries added back then.

const TMDB = 'https://api.themoviedb.org/3';
const IGDB = 'https://api.igdb.com/v4';
const TWITCH = 'https://id.twitch.tv/oauth2/token';
const STEAM = 'https://store.steampowered.com/api';
const IMG = 'https://image.tmdb.org/t/p/w185';
const IGDB_IMG = 'https://images.igdb.com/igdb/image/upload/t_cover_big';
const STEAM_IMG = 'https://shared.akamai.steamstatic.com/store_item_assets/steam/apps';

const TTL_MS = 60 * 60 * 1000;
const cache = new Map();
const cached = (key) => {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.t < TTL_MS) return hit.data;
  cache.delete(key);
  return null;
};
const store = (key, data) => {
  if (cache.size > 500) cache.clear();
  cache.set(key, { t: Date.now(), data });
  return data;
};

const tmdbKey = () => process.env.TMDB_API_KEY || null;
/** IGDB authenticates as a Twitch app, so it takes two halves, not one key */
const igdbCreds = () => {
  const id = (process.env.IGDB_CLIENT_ID || '').trim();
  const secret = (process.env.IGDB_CLIENT_SECRET || '').trim();
  return id && secret ? { id, secret } : null;
};

async function tmdb(path, params = {}) {
  const key = tmdbKey();
  const url = new URL(TMDB + path);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const headers = {};
  if (key.startsWith('eyJ')) headers.Authorization = `Bearer ${key}`; // read access token
  else url.searchParams.set('api_key', key); // classic v3 key
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(6000) });
  if (!res.ok) throw new Error(`tmdb ${res.status}`);
  return res.json();
}

/** app access token, good for ~60 days — fetching one per search would be rude */
let token = { value: null, expires: 0 };

async function igdbToken() {
  const creds = igdbCreds();
  if (!creds) throw new Error('igdb: no credentials');
  if (token.value && Date.now() < token.expires) return token.value;
  const url = new URL(TWITCH);
  url.searchParams.set('client_id', creds.id);
  url.searchParams.set('client_secret', creds.secret);
  url.searchParams.set('grant_type', 'client_credentials');
  const res = await fetch(url, { method: 'POST', signal: AbortSignal.timeout(6000) });
  if (!res.ok) throw new Error(`twitch ${res.status}`);
  const d = await res.json();
  if (!d.access_token) throw new Error('twitch: no token');
  // retire it a day early rather than discover the expiry as a failed search
  const life = Math.max(60, (d.expires_in ?? 0) - 86400);
  token = { value: d.access_token, expires: Date.now() + life * 1000 };
  return token.value;
}

/**
 * Apicalypse puts the search term in double quotes and ends statements with a
 * semicolon, so a title carrying either would rewrite the query.
 */
const apicalypse = (q) =>
  String(q)
    .replace(/[\\";]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

async function igdb(path, body) {
  const creds = igdbCreds();
  if (!creds) throw new Error('igdb: no credentials');
  const call = async () =>
    fetch(IGDB + path, {
      method: 'POST',
      headers: {
        'Client-ID': creds.id,
        Authorization: `Bearer ${await igdbToken()}`,
        Accept: 'application/json',
      },
      body,
      signal: AbortSignal.timeout(6000),
    });
  let res = await call();
  if (res.status === 401) {
    // a rotated secret or a token revoked early: one fresh try, then give up
    token = { value: null, expires: 0 };
    res = await call();
  }
  if (!res.ok) throw new Error(`igdb ${res.status}`);
  return res.json();
}

async function steam(path, params = {}) {
  const url = new URL(STEAM + path);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
  if (!res.ok) throw new Error(`steam ${res.status}`);
  return res.json();
}

/** how long one provider may hold up a search the others have answered */
const SEARCH_DEADLINE_MS = 3000;
/** and how long IGDB may take before the games lane gives up and asks Steam */
const IGDB_BUDGET_MS = 2000;
/**
 * After a lane misses that deadline, stop calling it for a while —
 * short, because a merely slow answer must not hide a working provider.
 */
const BREAKER_MS = 60 * 1000;
const skipUntil = { tmdb: 0, game: 0 };

const isDown = (name) => Date.now() < skipUntil[name];

/**
 * Race one lane against the deadline. Reports whether it actually answered,
 * not just what it returned: an empty list from a provider that never replied
 * means "unknown", and caching that as "nothing exists" is how a working game
 * becomes unfindable for an hour.
 */
const deadline = (name, promise) =>
  Promise.race([
    promise.then((rows) => {
      skipUntil[name] = 0;
      return { ok: true, rows };
    }),
    new Promise((resolve) =>
      setTimeout(() => {
        // a provider that hangs makes every later keystroke wait too
        skipUntil[name] = Date.now() + BREAKER_MS;
        resolve({ ok: false, rows: [] });
      }, SEARCH_DEADLINE_MS).unref?.(),
    ),
  ]);

/** cap one attempt so a slow provider still leaves room for its fallback */
const within = (ms, promise) =>
  Promise.race([
    promise,
    new Promise((_resolve, reject) =>
      setTimeout(() => reject(new Error('slow')), ms).unref?.(),
    ),
  ]);

const year = (date) => (date ? Number(date.slice(0, 4)) : null);
// providers report 0 for 'unknown', which is not a length
const mins = (v) => (typeof v === 'number' && v > 0 ? v : null);
const pad = (n) => String(n).padStart(2, '0');
/** IGDB dates are unix seconds, UTC */
const fromUnix = (secs) =>
  typeof secs === 'number' && secs > 0 ? new Date(secs * 1000).toISOString().slice(0, 10) : null;

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

/**
 * Steam ships release dates as display text, and for anything unreleased that
 * may be a quarter ('Q1 2027'), a month ('March 2027') or nothing at all
 * ('Coming soon'). Give back a full date only when a day is really known —
 * the year is still worth having on its own, for the search dropdown.
 */
export function parseSteamDate(text) {
  const s = String(text ?? '').toLowerCase();
  const found = s.match(/\b(?:19|20)\d{2}\b/);
  if (!found) return { date: null, year: null };
  const yr = Number(found[0]);
  // cut the year out at the index it matched at, so its digits can't be read
  // as a day — and so this agrees with the rust copy character for character
  const rest = s.slice(0, found.index) + ' ' + s.slice(found.index + 4);
  const month = MONTHS.findIndex((m) => rest.includes(m)) + 1;
  const day = rest.match(/\b([0-3]?\d)\b/);
  if (!month || !day) return { date: null, year: yr };
  const d = Number(day[1]);
  if (d < 1 || d > 31) return { date: null, year: yr };
  return { date: `${yr}-${pad(month)}-${pad(d)}`, year: yr };
}

/**
 * Steam files soundtracks, demos and artbooks as apps right beside the games.
 * `appdetails` would say which is which, but only at a request each, and the
 * search lane cannot afford that — it already spends one per row on dates, and
 * going over budget is what trips the breaker. The names give it away for free.
 */
const NOT_A_RELEASE = /\b(soundtrack|ost|demo|playtest|artbook|art book|wallpaper|trailer)\b/i;

/** how many storesearch hits are worth spending a date lookup on */
const STEAM_CANDIDATES = 5;

/**
 * Just the release date, cached per app. `filters=release_date` answers in
 * ~70 bytes where `basic` costs 11KB, which matters when five of these go out
 * per keystroke — bandwidth is what makes steam start throttling.
 */
async function steamRelease(id) {
  const cacheKey = `sr:${id}`;
  const hit = cached(cacheKey);
  if (hit) return hit;
  const d = await steam('/appdetails', { appids: id, filters: 'release_date', l: 'english' });
  const info = d?.[id];
  if (!info?.success) return { date: null, year: null };
  return store(cacheKey, parseSteamDate(info.data?.release_date?.date));
}

/**
 * Name and release date, for one app we already care about. Only the details
 * path needs the title, and that runs on add and on the daily refresh — rarely
 * enough that the bigger payload is fine.
 */
async function steamApp(id) {
  const cacheKey = `sa:${id}`;
  const hit = cached(cacheKey);
  if (hit) return hit;
  const d = await steam('/appdetails', { appids: id, filters: 'basic,release_date', l: 'english' });
  const info = d?.[id];
  if (!info?.success) return null;
  const when = parseSteamDate(info.data?.release_date?.date);
  return store(cacheKey, { title: info.data?.name ?? '', date: when.date, year: when.year });
}

/**
 * Call every provider once with the configured keys and report what each one
 * did: ok / missing / rejected / down / unreachable. A silent empty dropdown
 * has too many possible causes to guess at.
 */
export async function checkKeys() {
  const verdictOf = (status) => {
    if (status >= 200 && status < 300) return 'ok';
    if (status === 400 || status === 401 || status === 403) return 'rejected';
    if (status >= 500) return 'down';
    return 'error';
  };

  const probe = async (url, init) => {
    try {
      const res = await fetch(url, { ...init, signal: AbortSignal.timeout(6000) });
      return verdictOf(res.status);
    } catch {
      return 'unreachable';
    }
  };

  const tmdbStatus = async () => {
    const key = tmdbKey();
    if (!key) return 'missing';
    const url = new URL(TMDB + '/configuration');
    if (key.startsWith('eyJ')) return probe(url, { headers: { Authorization: `Bearer ${key}` } });
    url.searchParams.set('api_key', key);
    return probe(url);
  };

  // every throw in this module ends in the status it got, so read that back
  // rather than guessing; anything else really was a network failure
  const verdictOfError = (err) => {
    const status = Number(String(err?.message ?? '').match(/\b\d{3}$/)?.[0] ?? 0);
    return status ? verdictOf(status) : 'unreachable';
  };

  // two halves and two hops: a wrong secret fails at twitch, a wrong client id
  // can still fail at igdb, and the two deserve the same plain verdict
  const igdbStatus = async () => {
    if (!igdbCreds()) return 'missing';
    try {
      await igdb('/games', 'fields name; limit 1;');
      return 'ok';
    } catch (err) {
      return verdictOfError(err);
    }
  };

  const steamStatus = () =>
    probe(new URL(`${STEAM}/storesearch/?term=dune&l=english&cc=us`));

  const [tmdb, igdbKey, steamKey] = await Promise.all([
    tmdbStatus(),
    igdbStatus(),
    steamStatus(),
  ]);
  return { tmdb, igdb: igdbKey, steam: steamKey };
}

/**
 * IGDB's fuzzy relevance sometimes ranks a stale placeholder above the real
 * game: searching "silksong" returns a "Hollow Knight Silksong" dated 2021
 * ahead of the actual "Hollow Knight: Silksong" dated 2025, and taking the top
 * row would put a wrong date on the calendar. What gives the placeholder away
 * is that nobody has ever engaged with it — no anticipation, no ratings.
 *
 * So demote only those, and leave IGDB's ordering intact otherwise. Sorting the
 * whole list by popularity instead would bury an obscure game that somebody
 * searched for by its exact name.
 */
export const engagedFirst = (rows) => [
  ...rows.filter((r) => (r.popularity ?? 0) > 0),
  ...rows.filter((r) => (r.popularity ?? 0) === 0),
];

async function igdbGames(q) {
  // version_parent excludes the "… : Ultimate Edition" clones of one release
  const body =
    `search "${apicalypse(q)}"; ` +
    'fields name,first_release_date,cover.image_id,hypes,total_rating_count; ' +
    'where version_parent = null; limit 10;';
  const rows = await igdb('/games', body);
  const mapped = (Array.isArray(rows) ? rows : []).map((r) => {
    const date = fromUnix(r.first_release_date);
    return {
      source: 'igdb',
      kind: 'game',
      id: String(r.id),
      title: r.name ?? '',
      date,
      year: year(date),
      posterUrl: r.cover?.image_id ? `${IGDB_IMG}/${r.cover.image_id}.jpg` : null,
      // stripped before this leaves the proxy, like tmdb's
      popularity: (r.hypes ?? 0) + (r.total_rating_count ?? 0),
    };
  });
  return engagedFirst(mapped).slice(0, 5);
}

/** a game, a demo of it and its soundtrack are all `type: 'app'` to steam */
export const isRelease = (name) => !NOT_A_RELEASE.test(String(name ?? ''));

async function steamGames(q) {
  const d = await steam('/storesearch/', { term: q, l: 'english', cc: 'us' });
  const items = (d?.items ?? [])
    .filter((i) => i.type === 'app' && isRelease(i.name))
    .slice(0, STEAM_CANDIDATES);
  // storesearch carries no dates, so each row costs one small call — a missing
  // date is survivable, an unanswered search is not
  const dates = await Promise.all(
    items.map((i) => steamRelease(String(i.id)).catch(() => ({ date: null, year: null }))),
  );
  return items.map((item, at) => ({
    source: 'steam',
    kind: 'game',
    id: String(item.id),
    title: item.name ?? '',
    date: dates[at].date,
    year: dates[at].year,
    // the portrait capsule; Poster hides itself if a game hasn't got one
    posterUrl: `${STEAM_IMG}/${item.id}/library_600x900_2x.jpg`,
  }));
}

/**
 * IGDB knows about games long before they have a store page, so it leads.
 * Steam takes over whenever IGDB is unconfigured, refused or slow — which is
 * the whole point of having it: games keep working with no key at all, and an
 * outage at one provider no longer costs the kind entirely.
 */
async function games(q) {
  if (igdbCreds()) {
    try {
      const rows = await within(IGDB_BUDGET_MS, igdbGames(q));
      if (rows.length) return rows;
    } catch {
      // unreachable, refused or dawdling — steam still knows games
    }
  }
  return steamGames(q);
}

/** merged search across providers; kinds ⊆ {film, series, game} */
export async function search(q, kinds) {
  const want = (k) => kinds.length === 0 || kinds.includes(k);
  const cacheKey = `s:${kinds.join(',')}:${q.toLowerCase()}`;
  const hit = cached(cacheKey);
  if (hit) return hit;

  const jobs = [];
  if (tmdbKey() && want('film') && !isDown('tmdb')) {
    jobs.push(
      deadline('tmdb', tmdb('/search/movie', { query: q }).then((d) =>
        d.results.slice(0, 5).map((r) => ({
          source: 'tmdb',
          kind: 'film',
          id: String(r.id),
          title: r.title,
          date: r.release_date || null,
          year: year(r.release_date),
          posterUrl: r.poster_path ? IMG + r.poster_path : null,
          popularity: r.popularity ?? 0,
        })),
      ),
    ));
  }
  if (tmdbKey() && want('series') && !isDown('tmdb')) {
    jobs.push(
      deadline('tmdb', tmdb('/search/tv', { query: q }).then((d) =>
        d.results.slice(0, 5).map((r) => ({
          source: 'tmdb',
          kind: 'series',
          id: String(r.id),
          title: r.name,
          date: r.first_air_date || null,
          year: year(r.first_air_date),
          posterUrl: r.poster_path ? IMG + r.poster_path : null,
          popularity: r.popularity ?? 0,
        })),
      ),
    ));
  }
  // a lane skipped by the breaker has not answered either, and must not let
  // this query be remembered as though it had
  let complete = true;
  if (want('game')) {
    if (isDown('game')) complete = false;
    else jobs.push(deadline('game', games(q)));
  }
  if (tmdbKey() && (want('film') || want('series')) && isDown('tmdb')) complete = false;

  const settled = await Promise.allSettled(jobs);
  const lists = [];
  for (const s of settled) {
    if (s.status === 'fulfilled' && s.value.ok) lists.push(s.value.rows);
    else complete = false;
  }
  // interleave providers so one popular source doesn't crowd out the others
  const merged = [];
  for (let i = 0; merged.length < 5; i++) {
    let added = false;
    for (const list of lists) {
      if (list[i] && merged.length < 5) {
        merged.push(list[i]);
        added = true;
      }
    }
    if (!added) break;
  }
  const out = merged.map(({ popularity: _p, ...r }) => r);
  /**
   * Only a complete answer is worth keeping for an hour. An empty result from
   * a provider that timed out, was skipped or threw means "we don't know yet",
   * and storing that is how one bad second makes a game unfindable until the
   * hour is up — with no way for anyone to ask again.
   */
  if (complete && out.length > 0) store(cacheKey, out);
  return out;
}

/** roughly how long a game takes, so `Pick for me` can filter on real lengths */
async function igdbPlaytime(id) {
  try {
    const rows = await igdb('/game_time_to_beats', `fields normally; where game_id = ${id}; limit 1;`);
    const secs = Array.isArray(rows) ? rows[0]?.normally : null;
    return typeof secs === 'number' && secs > 0 ? Math.round(secs / 60) : null;
  } catch {
    return null; // a length nobody has measured is not an error
  }
}

/**
 * The provider's current date for one entry — episode-aware for series.
 * Also returns runtimeMin (minutes) where the provider knows it, which is
 * what "pick something for ~30min" filters on.
 */
export async function currentDate({ source, kind, id, season, episode }) {
  const cacheKey = `d:${source}:${kind}:${id}:${season ?? ''}:${episode ?? ''}`;
  const hit = cached(cacheKey);
  if (hit) return hit;

  // entries linked to rawg predate its shutdown; there is nothing left to ask
  if (source === 'rawg') return null;

  if (source === 'igdb') {
    if (!igdbCreds()) return null;
    const gid = Number(id);
    if (!Number.isInteger(gid) || gid <= 0) return null;
    const rows = await igdb('/games', `fields name,first_release_date; where id = ${gid}; limit 1;`);
    const g = Array.isArray(rows) ? rows[0] : null;
    if (!g) return null;
    return store(cacheKey, {
      date: fromUnix(g.first_release_date),
      title: g.name ?? '',
      runtimeMin: await igdbPlaytime(gid),
    });
  }

  if (source === 'steam') {
    const app = await steamApp(String(id));
    if (!app) return null;
    // steam publishes no playtime figures — a game keeps whatever it had
    return store(cacheKey, { date: app.date, title: app.title, runtimeMin: null });
  }

  if (!tmdbKey()) return null;
  if (kind === 'series' && season && episode) {
    const d = await tmdb(`/tv/${id}/season/${season}/episode/${episode}`);
    return store(cacheKey, { date: d.air_date || null, title: d.name, runtimeMin: mins(d.runtime) });
  }
  if (kind === 'series') {
    const d = await tmdb(`/tv/${id}`);
    return store(cacheKey, {
      date: d.first_air_date || null,
      title: d.name,
      runtimeMin: mins(d.episode_run_time?.[0]),
    });
  }
  const d = await tmdb(`/movie/${id}`);
  return store(cacheKey, {
    date: d.release_date || null,
    title: d.title,
    runtimeMin: mins(d.runtime),
  });
}

/** every episode of one season — the whole-season add */
export async function seasonEpisodes({ id, season }) {
  const cacheKey = `se:${id}:${season}`;
  const hit = cached(cacheKey);
  if (hit) return hit;
  if (!tmdbKey()) return null;
  const d = await tmdb(`/tv/${id}/season/${season}`);
  const episodes = (d.episodes ?? [])
    .filter((e) => e.air_date)
    .map((e) => ({
      episode: e.episode_number,
      title: e.name || `episode ${e.episode_number}`,
      date: e.air_date,
      runtimeMin: mins(e.runtime),
    }));
  return store(cacheKey, episodes);
}
