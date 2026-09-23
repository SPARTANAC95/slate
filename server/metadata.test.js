import { describe, expect, it } from 'vitest';
import { engagedFirst, isRelease, parseSteamDate } from './metadata.js';

/**
 * The real case this exists for: IGDB answers "silksong" with a placeholder
 * dated 2021 ranked above the actual 2025 release. Taking the top row would
 * write the wrong date onto the calendar.
 */
describe('engagedFirst', () => {
  const names = (rows) => engagedFirst(rows).map((r) => r.title);

  it('demotes a row nobody has ever engaged with', () => {
    expect(
      names([
        { title: 'Hollow Knight Silksong', popularity: 0 },
        { title: 'Hollow Knight: Silksong', popularity: 715 },
        { title: 'Sea of Sorrow', popularity: 6 },
      ]),
    ).toEqual(['Hollow Knight: Silksong', 'Sea of Sorrow', 'Hollow Knight Silksong']);
  });

  it("keeps the provider's own order within each group", () => {
    // not a popularity sort: 6 stays ahead of 715 because igdb ranked it there
    expect(
      names([
        { title: 'less popular but more relevant', popularity: 6 },
        { title: 'more popular', popularity: 715 },
      ]),
    ).toEqual(['less popular but more relevant', 'more popular']);
  });

  it('treats a missing popularity as no engagement', () => {
    expect(names([{ title: 'unknown' }, { title: 'known', popularity: 1 }])).toEqual([
      'known',
      'unknown',
    ]);
  });
});

/**
 * Steam has one `type: 'app'` for a game, its demo and its soundtrack, and the
 * search lane cannot afford a request per row to tell them apart. Same cases as
 * `is_release` in src-tauri/src/metadata.rs.
 */
describe('isRelease', () => {
  it('keeps actual releases, dlc included', () => {
    expect(isRelease('Hollow Knight: Silksong')).toBe(true);
    expect(isRelease('ELDEN RING Shadow of the Erdtree')).toBe(true);
  });

  it('drops the merchandise', () => {
    expect(isRelease('Hollow Knight: Silksong - Official Soundtrack')).toBe(false);
    expect(isRelease('Subnautica Original Soundtrack')).toBe(false);
    expect(isRelease('Hades II OST')).toBe(false);
    expect(isRelease('Some Game Demo')).toBe(false);
    expect(isRelease('Some Game Playtest')).toBe(false);
  });

  it('matches whole words, so a title is not judged by a substring', () => {
    // 'ghost' contains ost; 'demolition' contains demo
    expect(isRelease('Ghost of Tsushima')).toBe(true);
    expect(isRelease('Demolition Company')).toBe(true);
  });
});

/**
 * Steam has no structured release date — it hands over whatever the store page
 * displays. These are the shapes seen in the wild. The rule under test: a full
 * date only when the day is really known, but keep the year regardless, since
 * the search dropdown shows it.
 *
 * `src-tauri/src/metadata.rs` carries the same parser for the packaged app and
 * the same cases in its test module; the two must not drift.
 */
describe('parseSteamDate', () => {
  it('reads the european display form', () => {
    expect(parseSteamDate('4 Sep, 2025')).toEqual({ date: '2025-09-04', year: 2025 });
    expect(parseSteamDate('31 December 2026')).toEqual({ date: '2026-12-31', year: 2026 });
  });

  it('reads the american display form', () => {
    expect(parseSteamDate('Sep 4, 2025')).toEqual({ date: '2025-09-04', year: 2025 });
    expect(parseSteamDate('March 1, 2027')).toEqual({ date: '2027-03-01', year: 2027 });
  });

  it('keeps the year when only a quarter is announced', () => {
    expect(parseSteamDate('Q1 2027')).toEqual({ date: null, year: 2027 });
    expect(parseSteamDate('Q4 2026')).toEqual({ date: null, year: 2026 });
  });

  it('keeps the year when only a month is announced', () => {
    expect(parseSteamDate('March 2027')).toEqual({ date: null, year: 2027 });
    expect(parseSteamDate('May 2026')).toEqual({ date: null, year: 2026 });
  });

  it('gives nothing for the unannounced', () => {
    expect(parseSteamDate('Coming soon')).toEqual({ date: null, year: null });
    expect(parseSteamDate('To be announced')).toEqual({ date: null, year: null });
    expect(parseSteamDate('')).toEqual({ date: null, year: null });
    expect(parseSteamDate(undefined)).toEqual({ date: null, year: null });
    expect(parseSteamDate(null)).toEqual({ date: null, year: null });
  });

  it('never reads the year digits as a day', () => {
    // '2025' must not be mined for a 20 or a 25
    expect(parseSteamDate('2025')).toEqual({ date: null, year: 2025 });
    expect(parseSteamDate('Jan 2025')).toEqual({ date: null, year: 2025 });
  });

  it('rejects an impossible day rather than inventing a date', () => {
    expect(parseSteamDate('99 Sep, 2025')).toEqual({ date: null, year: 2025 });
    expect(parseSteamDate('0 Sep, 2025')).toEqual({ date: null, year: 2025 });
  });
});
