// TMDB (films, series) + RAWG (games) lookups. Keys live in .env and never
// reach the client. Missing keys degrade to empty results, never errors.

const TMDB = 'https://api.themoviedb.org/3';
const RAWG = 'https://api.rawg.io/api';
const IMG = 'https://image.tmdb.org/t/p/w185';

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
const rawgKey = () => process.env.RAWG_API_KEY || null;

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

async function rawg(path, params = {}) {
  const url = new URL(RAWG + path);
  url.searchParams.set('key', rawgKey());
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
  if (!res.ok) throw new Error(`rawg ${res.status}`);
  return res.json();
}

const year = (date) => (date ? Number(date.slice(0, 4)) : null);

/** merged search across providers; kinds ⊆ {film, series, game} */
export async function search(q, kinds) {
  const want = (k) => kinds.length === 0 || kinds.includes(k);
  const cacheKey = `s:${kinds.join(',')}:${q.toLowerCase()}`;
  const hit = cached(cacheKey);
  if (hit) return hit;

  const jobs = [];
  if (tmdbKey() && want('film')) {
    jobs.push(
      tmdb('/search/movie', { query: q }).then((d) =>
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
    );
  }
  if (tmdbKey() && want('series')) {
    jobs.push(
      tmdb('/search/tv', { query: q }).then((d) =>
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
    );
  }
  if (rawgKey() && want('game')) {
    jobs.push(
      rawg('/games', { search: q, page_size: 5 }).then((d) =>
        d.results.slice(0, 5).map((r) => ({
          source: 'rawg',
          kind: 'game',
          id: String(r.id),
          title: r.name,
          date: r.released || null,
          year: year(r.released),
          posterUrl: r.background_image || null,
          popularity: r.added ?? 0,
        })),
      ),
    );
  }

  const settled = await Promise.allSettled(jobs);
  const lists = settled.filter((s) => s.status === 'fulfilled').map((s) => s.value);
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
  return store(cacheKey, merged.map(({ popularity: _p, ...r }) => r));
}

/** the provider's current date for one entry — episode-aware for series */
export async function currentDate({ source, kind, id, season, episode }) {
  const cacheKey = `d:${source}:${kind}:${id}:${season ?? ''}:${episode ?? ''}`;
  const hit = cached(cacheKey);
  if (hit) return hit;

  if (source === 'rawg') {
    if (!rawgKey()) return null;
    const d = await rawg(`/games/${id}`);
    return store(cacheKey, { date: d.released || null, title: d.name });
  }
  if (!tmdbKey()) return null;
  if (kind === 'series' && season && episode) {
    const d = await tmdb(`/tv/${id}/season/${season}/episode/${episode}`);
    return store(cacheKey, { date: d.air_date || null, title: d.name });
  }
  if (kind === 'series') {
    const d = await tmdb(`/tv/${id}`);
    return store(cacheKey, { date: d.first_air_date || null, title: d.name });
  }
  const d = await tmdb(`/movie/${id}`);
  return store(cacheKey, { date: d.release_date || null, title: d.title });
}
