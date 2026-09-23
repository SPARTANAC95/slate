import type { DateChange, DayNote, Entry } from '../types';

const isISODate = (v: unknown): v is string =>
  typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
const isTime = (v: unknown): v is string =>
  typeof v === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(v);
const num = (v: unknown, fallback: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? v : fallback;
const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const arr = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);

const KINDS = new Set(['game', 'film', 'series', 'event', 'note', 'task']);
// 'rawg' is retired, but an import carrying it must keep its poster rather
// than have the whole external link thrown away
const SOURCES = new Set(['tmdb', 'igdb', 'steam', 'rawg']);

const cleanHistory = (v: unknown, fallbackDate: string | null): DateChange[] => {
  const rows = arr<Partial<DateChange>>(v)
    .filter((h) => h && typeof h === 'object' && (h.date === null || isISODate(h.date)))
    .map((h) => ({
      date: (h.date ?? null) as string | null,
      changedAt: num(h.changedAt, 0),
      source: h.source === 'api' ? ('api' as const) : ('manual' as const),
    }));
  // an entry must always carry at least the state it is in
  return rows.length > 0 ? rows : [{ date: fallbackDate, changedAt: 0, source: 'manual' }];
};

/**
 * Coerce anything the file claims is an entry into a valid one. Every field
 * the app reads must come out well-formed — a malformed row that reached
 * IndexedDB would crash the calendar on every load, with no way back.
 */
export function normalizeEntry(raw: unknown): Entry | null {
  const e = raw as Partial<Entry> & Record<string, unknown>;
  if (!e || typeof e !== 'object') return null;
  if (typeof e.id !== 'string' || e.id === '') return null;
  if (typeof e.title !== 'string') return null;

  const date = isISODate(e.date) ? e.date : null;
  const dateHistory = cleanHistory(e.dateHistory, date);
  const rawSeries = e.series as Entry['series'];
  const series =
    rawSeries && typeof rawSeries === 'object'
      ? { season: num(rawSeries.season, 1), episode: num(rawSeries.episode, 1) }
      : null;
  const ext = e.external as Entry['external'];
  const external =
    ext && typeof ext === 'object' && SOURCES.has(ext.source)
      ? {
          source: ext.source,
          id: str(ext.id),
          posterUrl: typeof ext.posterUrl === 'string' ? ext.posterUrl : null,
        }
      : null;

  return {
    id: e.id,
    // a blank title is a row with nothing to click on
    title: e.title.trim() === '' ? 'untitled' : e.title,
    kind: KINDS.has(e.kind as string) ? (e.kind as Entry['kind']) : 'note',
    date,
    // an hour without a day has nothing to hang on
    time: date !== null && isTime(e.time) ? e.time : null,
    annual: e.annual === true,
    // an older export has no pin flag — infer it the way the v4 upgrade does
    datePinned:
      typeof e.datePinned === 'boolean'
        ? e.datePinned
        : date !== null && dateHistory[dateHistory.length - 1].source === 'manual',
    dateHistory,
    done: e.done === true,
    // the five squares can only show 1–5; anything else would draw as nothing
    rating:
      typeof e.rating === 'number' && Number.isInteger(e.rating) && e.rating >= 1 && e.rating <= 5
        ? e.rating
        : null,
    verdict: str(e.verdict),
    notes: str(e.notes),
    links: arr<string>(e.links).filter((l) => typeof l === 'string'),
    tags: arr<string>(e.tags).filter((t) => typeof t === 'string'),
    external,
    runtimeMin: typeof e.runtimeMin === 'number' && e.runtimeMin > 0 ? e.runtimeMin : null,
    series,
    deletedAt: typeof e.deletedAt === 'number' ? e.deletedAt : null,
    createdAt: num(e.createdAt, 0),
    updatedAt: num(e.updatedAt, 0),
  };
}

export function normalizeNote(raw: unknown): DayNote | null {
  const n = raw as Partial<DayNote>;
  if (!n || typeof n !== 'object') return null;
  if (!isISODate(n.date) || typeof n.body !== 'string') return null;
  return { date: n.date, body: n.body, updatedAt: num(n.updatedAt, 0) };
}

/**
 * Union of two date trails, oldest first. Import must never shorten a
 * history — the delay record is the one thing here that can't be rebuilt.
 */
export function mergeHistory(mine: DateChange[], theirs: DateChange[]): DateChange[] {
  const seen = new Map<string, DateChange>();
  for (const h of [...mine, ...theirs]) seen.set(`${h.changedAt}:${h.date}`, h);
  return [...seen.values()].sort((a, b) => a.changedAt - b.changedAt);
}
