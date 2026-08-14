import { describe, expect, it } from 'vitest';
import { monthGrid, occursOn, toISODate, fromISODate } from './dates';

describe('monthGrid', () => {
  it('always returns 42 cells', () => {
    expect(monthGrid(2026, 7)).toHaveLength(42); // August 2026
    expect(monthGrid(2027, 1)).toHaveLength(42); // February 2027
  });

  it('starts on a Monday', () => {
    for (const [y, m] of [
      [2026, 7], // Aug 2026 — 1st is a Saturday
      [2026, 0], // Jan 2026 — 1st is a Thursday
      [2027, 1], // Feb 2027 — 1st is a Monday
      [2026, 10], // Nov 2026 — 1st is a Sunday
    ]) {
      const grid = monthGrid(y, m);
      expect(grid[0].getDay()).toBe(1); // JS: 1 = Monday
    }
  });

  it('contains every day of the target month exactly once', () => {
    const grid = monthGrid(2026, 7).map(toISODate);
    for (let day = 1; day <= 31; day++) {
      const iso = `2026-08-${String(day).padStart(2, '0')}`;
      expect(grid.filter((d) => d === iso)).toHaveLength(1);
    }
  });

  it('when the month starts on Monday, the 1st is the first cell', () => {
    const grid = monthGrid(2027, 1); // Feb 2027 starts on Monday
    expect(toISODate(grid[0])).toBe('2027-02-01');
  });

  it('when the month starts on Sunday, six prior days lead in', () => {
    const grid = monthGrid(2026, 10); // Nov 2026 starts on Sunday
    expect(toISODate(grid[6])).toBe('2026-11-01');
  });
});

describe('toISODate / fromISODate', () => {
  it('round-trips a local date', () => {
    expect(toISODate(fromISODate('2026-08-14'))).toBe('2026-08-14');
    expect(toISODate(fromISODate('2026-01-01'))).toBe('2026-01-01');
    expect(toISODate(fromISODate('2026-12-31'))).toBe('2026-12-31');
  });

  it('pads month and day', () => {
    expect(toISODate(new Date(2026, 0, 5))).toBe('2026-01-05');
  });
});

describe('occursOn', () => {
  it('matches exact dates', () => {
    expect(occursOn('2026-08-14', false, '2026-08-14')).toBe(true);
    expect(occursOn('2026-08-14', false, '2026-08-15')).toBe(false);
  });

  it('never matches backlog (null date)', () => {
    expect(occursOn(null, false, '2026-08-14')).toBe(false);
    expect(occursOn(null, true, '2026-08-14')).toBe(false);
  });

  it('annual entries repeat on the same month/day in other years', () => {
    expect(occursOn('1960-07-04', true, '2026-07-04')).toBe(true);
    expect(occursOn('1960-07-04', true, '2027-07-04')).toBe(true);
    expect(occursOn('1960-07-04', true, '2026-07-05')).toBe(false);
    expect(occursOn('1960-07-04', true, '2026-08-04')).toBe(false);
  });

  it('non-annual entries do not repeat across years', () => {
    expect(occursOn('2025-07-04', false, '2026-07-04')).toBe(false);
  });

  it('annual Feb 29 only lands in leap years', () => {
    expect(occursOn('2024-02-29', true, '2028-02-29')).toBe(true);
    expect(occursOn('2024-02-29', true, '2026-03-01')).toBe(false);
  });
});
