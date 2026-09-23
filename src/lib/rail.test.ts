import { describe, expect, it } from 'vitest';
import { allCountdowns, countdownLabel, railItems } from './rail';
import { nextAnnualOccurrence } from './dates';
import type { Entry } from '../types';

const NOW = new Date(2026, 7, 14); // Friday, 14 August 2026

let counter = 0;
const entry = (patch: Partial<Entry>): Entry => ({
  id: `e${counter++}`,
  title: 't',
  kind: 'note',
  date: null,
  time: null,
  annual: false,
  datePinned: false,
  dateHistory: [],
  done: false,
  rating: null,
  verdict: '',
  notes: '',
  links: [],
  tags: [],
  external: null,
  runtimeMin: null,
  series: null,
  deletedAt: null,
  createdAt: 0,
  updatedAt: 0,
  ...patch,
});

describe('nextAnnualOccurrence', () => {
  it('rolls forward to this year or next', () => {
    expect(nextAnnualOccurrence('1960-07-04', NOW)).toBe('2027-07-04'); // passed
    expect(nextAnnualOccurrence('1990-12-01', NOW)).toBe('2026-12-01'); // ahead
    expect(nextAnnualOccurrence('2000-08-14', NOW)).toBe('2026-08-14'); // today counts
  });

  it('feb 29 lands on the next leap year', () => {
    expect(nextAnnualOccurrence('2024-02-29', NOW)).toBe('2028-02-29');
  });
});

describe('railItems', () => {
  it('sorts closest first and caps at the limit', () => {
    const es = [
      entry({ title: 'far', date: '2026-12-01' }),
      entry({ title: 'near', date: '2026-08-15' }),
      entry({ title: 'mid', date: '2026-09-01' }),
    ];
    const rail = railItems(es, NOW, 2);
    expect(rail.map((r) => r.entry.title)).toEqual(['near', 'mid']);
    expect(rail[0].days).toBe(1);
  });

  it('puts past-but-not-done at the front, oldest first', () => {
    const es = [
      entry({ title: 'up', date: '2026-08-20' }),
      entry({ title: 'recent-past', date: '2026-08-12' }),
      entry({ title: 'old-past', date: '2026-07-01' }),
    ];
    expect(railItems(es, NOW).map((r) => r.entry.title)).toEqual([
      'old-past',
      'recent-past',
      'up',
    ]);
  });

  it('skips done, deleted, and undated entries', () => {
    const es = [
      entry({ title: 'done', date: '2026-08-20', done: true }),
      entry({ title: 'deleted', date: '2026-08-20', deletedAt: 1 }),
      entry({ title: 'backlog', date: null }),
      entry({ title: 'real', date: '2026-08-20' }),
    ];
    expect(railItems(es, NOW).map((r) => r.entry.title)).toEqual(['real']);
  });

  it('annual entries count down to their next occurrence, never overdue', () => {
    const es = [entry({ title: 'bday', date: '1960-07-04', annual: true })];
    const rail = railItems(es, NOW);
    expect(rail[0].date).toBe('2027-07-04');
    expect(rail[0].days).toBeGreaterThan(0);
  });
});

describe('countdownLabel', () => {
  it('says the near days in words', () => {
    expect(countdownLabel(0)).toBe('today');
    expect(countdownLabel(1)).toBe('tomorrow');
  });

  it('counts the rest, and counts backwards for overdue', () => {
    expect(countdownLabel(2)).toBe('2');
    expect(countdownLabel(123)).toBe('123');
    expect(countdownLabel(-3)).toBe('−3');
  });
});

describe('allCountdowns', () => {
  // the upcoming view and the rail must never disagree about what is next;
  // the rail is simply the first six of this
  it('is the rail without the cap, in the same order', () => {
    const es = [
      entry({ title: 'far', date: '2026-12-01' }),
      entry({ title: 'near', date: '2026-08-15' }),
      entry({ title: 'mid', date: '2026-09-01' }),
      entry({ title: 'past', date: '2026-07-01' }),
      entry({ title: 'backlog', date: null }),
    ];
    const all = allCountdowns(es, NOW);
    expect(all.map((r) => r.entry.title)).toEqual(['past', 'near', 'mid', 'far']);
    expect(railItems(es, NOW, 2)).toEqual(all.slice(0, 2));
  });

  it('holds more than the rail ever shows', () => {
    const es = Array.from({ length: 20 }, (_, i) =>
      entry({ title: `e${i}`, date: `2026-09-${String(i + 1).padStart(2, '0')}` }),
    );
    expect(allCountdowns(es, NOW)).toHaveLength(20);
    expect(railItems(es, NOW)).toHaveLength(6);
  });
});
