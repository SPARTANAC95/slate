import { addDays, nextDay, startOfDay, type Day } from 'date-fns';
import { toISODate } from './dates';
import type { EntryKind } from '../types';

export type ParsedEntry = {
  title: string;
  kind: EntryKind;
  /** how the kind was decided — M3's API lookup only overrides 'default' */
  kindSource: 'tag' | 'pattern' | 'default';
  date: string | null;
  /** 'HH:mm' if an hour was typed — `20:00`, `at 8pm` */
  time: string | null;
  annual: boolean;
  series: { season: number; episode: number } | null;
  /** `s3` with no episode — add the whole season at once */
  wholeSeason: number | null;
  tags: string[];
};

const KINDS = new Set(['game', 'film', 'series', 'event', 'note', 'task']);

const MONTHS: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};
const MONTH_RE =
  'jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|' +
  'aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?';

const WEEKDAYS: [RegExp, Day][] = [
  [/\b(?:monday|ponedjeljak|ponedeljak)\b/, 1],
  [/\b(?:tuesday|utorak)\b/, 2],
  [/\b(?:wednesday|srijeda|sreda)\b/, 3],
  [/\b(?:thursday|cetvrtak)\b/, 4],
  [/\b(?:friday|petak)\b/, 5],
  [/\b(?:saturday|subota)\b/, 6],
  [/\b(?:sunday|nedjelja|nedelja)\b/, 0],
];

const DIACRITICS: Record<string, string> = {
  č: 'c', ć: 'c', ž: 'z', š: 's', đ: 'd',
  Č: 'c', Ć: 'c', Ž: 'z', Š: 's', Đ: 'd',
};

/**
 * Lowercase + strip bs diacritics, one UTF-16 unit at a time so the result
 * lines up with the input index for index. Plain `toLowerCase()` is not
 * length-preserving (İ becomes two units), which would shift every cut
 * taken after it and mangle the title.
 */
const normalize = (s: string): string => {
  let out = '';
  for (const ch of Array.from({ length: s.length }, (_, i) => s[i])) {
    const mapped = DIACRITICS[ch] ?? ch.toLowerCase();
    out += mapped.length === 1 ? mapped : ch;
  }
  return out;
};

export function parseQuickAdd(input: string, now: Date = new Date()): ParsedEntry {
  let norm = normalize(input);
  const cuts: [number, number][] = [];
  const today = startOfDay(now);

  /** consume a match: remember its range and blank it so later passes skip it */
  const cut = (index: number, length: number) => {
    cuts.push([index, index + length]);
    norm = norm.slice(0, index) + ' '.repeat(length) + norm.slice(index + length);
  };
  const take = (re: RegExp): RegExpExecArray | null => {
    const m = re.exec(norm);
    if (m) cut(m.index, m[0].length);
    return m;
  };

  // #tags — a kind tag wins, the rest become plain tags
  let kind: EntryKind | null = null;
  const tags: string[] = [];
  for (const m of [...norm.matchAll(/#([a-z0-9_-]+)/g)]) {
    cut(m.index, m[0].length);
    if (kind === null && KINDS.has(m[1])) kind = m[1] as EntryKind;
    else tags.push(m[1]);
  }

  const s = take(/\bs(\d{1,2})\s?e(\d{1,3})\b/);
  const series = s ? { season: Number(s[1]), episode: Number(s[2]) } : null;
  // a bare `s3` means the whole season, but only after the title — a leading
  // token like "S3 bucket policy" is a name, not a season
  const bareMatch = series ? null : /\bs(\d{1,2})\b/.exec(norm);
  const bare = bareMatch && bareMatch.index > 0 ? bareMatch : null;
  if (bare) cut(bare.index, bare[0].length);
  const wholeSeason = bare ? Number(bare[1]) : null;

  const annual = take(/\b(?:every year|svake godine)\b/) !== null;

  /** first valid year >= today for a month/day; explicit years are taken as-is */
  const resolve = (m: number, d: number, year?: number): string | null => {
    const years = year !== undefined
      ? [year]
      : [0, 1, 2, 3, 4].map((i) => now.getFullYear() + i);
    for (const y of years) {
      const dt = new Date(y, m, d);
      const valid = dt.getMonth() === m && dt.getDate() === d;
      if (valid && (year !== undefined || dt >= today)) return toISODate(dt);
    }
    return null;
  };

  let date: string | null = null;
  let impliesTask = false;

  const datePasses: (() => string | null)[] = [
    () => {
      const m = /\b(\d{4})-(\d{1,2})-(\d{1,2})\b/.exec(norm);
      if (!m) return null;
      const r = resolve(Number(m[2]) - 1, Number(m[3]), Number(m[1]));
      if (r) cut(m.index, m[0].length);
      return r;
    },
    () => {
      const m = /\b(\d{1,2})\.(\d{1,2})\.(\d{4})\b/.exec(norm);
      if (!m || Number(m[2]) > 12) return null;
      const r = resolve(Number(m[2]) - 1, Number(m[1]), Number(m[3]));
      if (r) cut(m.index, m[0].length);
      return r;
    },
    () => {
      // '19.11.' — trailing dot required so version numbers like '1.5' survive
      const m = /\b(\d{1,2})\.(\d{1,2})\.(?!\d)/.exec(norm);
      if (!m || Number(m[2]) > 12) return null;
      const r = resolve(Number(m[2]) - 1, Number(m[1]));
      if (r) cut(m.index, m[0].length);
      return r;
    },
    () => {
      const m = new RegExp(`\\b(${MONTH_RE})\\.?\\s+(\\d{1,2})(?:\\s+(\\d{4}))?\\b`).exec(norm);
      if (!m || Number(m[2]) > 31) return null;
      const r = resolve(MONTHS[m[1].slice(0, 3)], Number(m[2]), m[3] ? Number(m[3]) : undefined);
      if (r) cut(m.index, m[0].length);
      return r;
    },
    () => {
      const m = new RegExp(`\\b(\\d{1,2})\\s+(${MONTH_RE})\\.?(?:\\s+(\\d{4}))?\\b`).exec(norm);
      if (!m || Number(m[1]) > 31) return null;
      const r = resolve(MONTHS[m[2].slice(0, 3)], Number(m[1]), m[3] ? Number(m[3]) : undefined);
      if (r) cut(m.index, m[0].length);
      return r;
    },
    () => {
      const m = take(/\bin\s+(\d+)\s+days?\b/) ?? take(/\bza\s+(\d+)\s+dana?\b/);
      if (!m) return null;
      impliesTask = true;
      return toISODate(addDays(today, Number(m[1])));
    },
    () => (take(/\b(?:prekosutra|day after tomorrow)\b/) ? toISODate(addDays(today, 2)) : null),
    () => (take(/\b(?:tomorrow|sutra)\b/) ? toISODate(addDays(today, 1)) : null),
    () => (take(/\b(?:today|danas|veceras|tonight)\b/) ? toISODate(today) : null),
    () => {
      for (const [re, day] of WEEKDAYS) {
        if (take(re)) return toISODate(nextDay(today, day));
      }
      return null;
    },
  ];
  for (const pass of datePasses) {
    date = pass();
    if (date) break;
  }

  // time last: the date passes have already eaten `19.11.` and `2026-08-14`,
  // so what is left of a `\d:\d` or `8pm` shape really is a clock reading
  const time = ((): string | null => {
    const pad = (n: number) => String(n).padStart(2, '0');
    /** 12h suffix → 24h hour, or null if the hour can't carry one */
    const shift = (h: number, suffix?: string): number | null => {
      if (!suffix) return h;
      if (h > 12) return null;
      if (suffix === 'pm') return h === 12 ? 12 : h + 12;
      return h === 12 ? 0 : h;
    };
    const clock = /\b(?:at\s+|u\s+)?([01]?\d|2[0-3]):([0-5]\d)\s*(am|pm)?\b/.exec(norm);
    if (clock) {
      const h = shift(Number(clock[1]), clock[3]);
      if (h !== null) {
        cut(clock.index, clock[0].length);
        return `${pad(h)}:${clock[2]}`;
      }
    }
    const meridiem = /\b(?:at\s+)?(\d{1,2})\s*(am|pm)\b/.exec(norm);
    if (meridiem) {
      const h = shift(Number(meridiem[1]), meridiem[2]);
      if (h !== null) {
        cut(meridiem.index, meridiem[0].length);
        return `${pad(h)}:00`;
      }
    }
    return null;
  })();

  // an hour with no day is today's hour — "kickoff 21:00" is not a backlog item
  if (date === null && time !== null) date = toISODate(today);

  // title = whatever wasn't consumed, tidied up. indexed by utf-16 unit to
  // match the cut ranges, which come from regex offsets on `norm`
  const title = Array.from({ length: input.length }, (_, i) => input[i])
    .filter((_, i) => !cuts.some(([a, b]) => i >= a && i < b))
    .join('')
    .replace(/\s+/g, ' ')
    .replace(/^[\s\-–—,;:.]+|[\s\-–—,;:]+$/g, '')
    .trim();

  const isSeries = series !== null || wholeSeason !== null;
  const resolvedKind: EntryKind =
    kind ?? (isSeries ? 'series' : annual ? 'event' : impliesTask ? 'task' : 'note');
  const kindSource = kind ? 'tag' : isSeries || annual || impliesTask ? 'pattern' : 'default';

  return { title, kind: resolvedKind, kindSource, date, time, annual, series, wholeSeason, tags };
}
