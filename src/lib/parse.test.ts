import { describe, expect, it } from 'vitest';
import { parseQuickAdd } from './parse';

// fixed clock: Friday, 14 August 2026
const NOW = new Date(2026, 7, 14, 20, 30);
const p = (input: string) => parseQuickAdd(input, NOW);

describe('the spec table', () => {
  it('Silo s3e4 tomorrow → series, tomorrow, season 3 episode 4', () => {
    const r = p('Silo s3e4 tomorrow');
    expect(r).toMatchObject({
      title: 'Silo',
      kind: 'series',
      date: '2026-08-15',
      series: { season: 3, episode: 4 },
    });
  });

  it('GTA 6 19.11. → 19 Nov of the next year that has not passed', () => {
    const r = p('GTA 6 19.11.');
    expect(r.title).toBe('GTA 6');
    expect(r.date).toBe('2026-11-19'); // Nov 19 is still ahead
  });

  it('Dune 3 dec 18 2026 → 2026-12-18, numeric part of the title survives', () => {
    const r = p('Dune 3 dec 18 2026');
    expect(r.title).toBe('Dune 3');
    expect(r.date).toBe('2026-12-18');
  });

  it('dentist in 3 days → task, today + 3', () => {
    const r = p('dentist in 3 days');
    expect(r).toMatchObject({ title: 'dentist', kind: 'task', date: '2026-08-17' });
  });

  it('mama rodjendan 4.7. every year → event, annual, rolls to next July 4', () => {
    const r = p('mama rodjendan 4.7. every year');
    expect(r).toMatchObject({
      title: 'mama rodjendan',
      kind: 'event',
      annual: true,
      date: '2027-07-04', // July 4 2026 already passed
    });
  });

  it('Hollow Knight Silksong → backlog, no date', () => {
    const r = p('Hollow Knight Silksong');
    expect(r).toMatchObject({ title: 'Hollow Knight Silksong', kind: 'note', date: null });
  });

  it('petak / friday → next occurring Friday (strictly after today)', () => {
    // today IS a Friday, so both point a week out
    expect(p('petak').date).toBe('2026-08-21');
    expect(p('friday').date).toBe('2026-08-21');
  });
});

describe('bosnian day words', () => {
  it('sutra / danas / veceras / prekosutra', () => {
    expect(p('x sutra').date).toBe('2026-08-15');
    expect(p('x danas').date).toBe('2026-08-14');
    expect(p('x veceras').date).toBe('2026-08-14');
    expect(p('x prekosutra').date).toBe('2026-08-16');
  });

  it('večeras with diacritics, and diacritic weekdays', () => {
    expect(p('kino večeras').date).toBe('2026-08-14');
    expect(p('utakmica četvrtak').date).toBe('2026-08-20');
  });

  it('za 3 dana → task like the english form', () => {
    expect(p('zubar za 3 dana')).toMatchObject({
      title: 'zubar',
      kind: 'task',
      date: '2026-08-17',
    });
  });

  it('prekosutra is not eaten by the sutra matcher', () => {
    expect(p('x prekosutra').title).toBe('x');
  });
});

describe('date formats', () => {
  it('explicit iso and d.m.yyyy years are taken as-is, even past', () => {
    expect(p('x 2026-12-18').date).toBe('2026-12-18');
    expect(p('x 19.11.2027').date).toBe('2027-11-19');
    expect(p('x 1.1.2020').date).toBe('2020-01-01');
  });

  it('18 dec (day-first month name) and month rollover', () => {
    expect(p('x 18 dec').date).toBe('2026-12-18');
    expect(p('x mar 2').date).toBe('2027-03-02'); // March already passed this year
  });

  it('today itself has not "passed"', () => {
    expect(p('x 14.8.').date).toBe('2026-08-14');
  });

  it('version numbers without a trailing dot are not dates', () => {
    const r = p('Patch 1.5 notes');
    expect(r.date).toBeNull();
    expect(r.title).toBe('Patch 1.5 notes');
  });

  it('impossible dates are left in the title', () => {
    const r = p('x 31.2.');
    expect(r.date).toBeNull();
    expect(r.title).toBe('x 31.2.');
  });

  it('only the first date is consumed', () => {
    const r = p('x 19.11. sutra');
    expect(r.date).toBe('2026-11-19');
    expect(r.title).toBe('x sutra');
  });
});

describe('non-ascii titles keep their characters', () => {
  it('an emoji before the date does not shift the cut', () => {
    const r = p('🎉 party friday');
    expect(r.date).toBe('2026-08-21');
    expect(r.title).toBe('🎉 party');
  });

  it('a turkish dotted I survives lowercasing', () => {
    const r = p('İstanbul trip friday');
    expect(r.date).toBe('2026-08-21');
    expect(r.title).toBe('İstanbul trip');
  });

  it('bosnian diacritics still match and still render', () => {
    const r = p('Šumska šetnja četvrtak');
    expect(r.date).toBe('2026-08-20');
    expect(r.title).toBe('Šumska šetnja');
  });
});

describe('kind and tags', () => {
  it('#game tag wins over everything', () => {
    const r = p('#game Silksong s1e1 sutra');
    expect(r.kind).toBe('game');
    expect(r.kindSource).toBe('tag');
    expect(r.series).toEqual({ season: 1, episode: 1 });
  });

  it('extra #tags land in tags, not the title', () => {
    const r = p('Elden Ring dlc #hype #game');
    expect(r).toMatchObject({ title: 'Elden Ring dlc', kind: 'game', tags: ['hype'] });
  });

  it('kindSource is "default" when nothing implies a kind — M3 may override', () => {
    expect(p('GTA 6 19.11.').kindSource).toBe('default');
    expect(p('Silo s3e4').kindSource).toBe('pattern');
  });

  it('sNeM works with capitals and spacing', () => {
    expect(p('Severance S2 E10 friday').series).toEqual({ season: 2, episode: 10 });
  });
});

describe('whole-season shorthand', () => {
  it('a bare sN means the whole season and implies series', () => {
    const r = p('Silo s3');
    expect(r).toMatchObject({ title: 'Silo', kind: 'series', wholeSeason: 3, series: null });
  });

  it('sNeM still wins and leaves wholeSeason unset', () => {
    const r = p('Silo s3e4');
    expect(r.series).toEqual({ season: 3, episode: 4 });
    expect(r.wholeSeason).toBeNull();
  });

  it('does not eat a season-like fragment inside a word', () => {
    expect(p('S1mple highlights').wholeSeason).toBeNull();
    expect(p('S1mple highlights').title).toBe('S1mple highlights');
  });

  it('a leading sN token is a name, not a season', () => {
    const r = p('S3 bucket policy');
    expect(r.wholeSeason).toBeNull();
    expect(r.title).toBe('S3 bucket policy');
    expect(r.kind).toBe('note');
  });

  it('leaves ordinary numbers in titles alone', () => {
    expect(p('Mass Effect 3').wholeSeason).toBeNull();
    expect(p('Mass Effect 3').title).toBe('Mass Effect 3');
  });

  it('combines with a date', () => {
    const r = p('Silo s3 sutra');
    expect(r).toMatchObject({ title: 'Silo', wholeSeason: 3, date: '2026-08-15' });
  });
});
