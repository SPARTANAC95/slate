import { describe, expect, it } from 'vitest';
import { prunePlan, snapshotHasData } from './history.js';

// the same cases as the rust tests in src-tauri/src/lib.rs
const name = (day, time) => `slate-backup-${day}T${time}.json`;

describe('prunePlan', () => {
  it('a burst of edits keeps the day’s first snapshot', () => {
    const names = Array.from({ length: 30 }, (_, i) =>
      name('2026-09-02', `10-00-${String(i).padStart(2, '0')}`),
    );
    const gone = prunePlan(names, 20, 7);
    expect(gone).toHaveLength(9);
    expect(gone).not.toContain(names[0]);
    expect(gone).toContain(names[1]);
    expect(gone).toContain(names[9]);
    expect(gone).not.toContain(names[10]);
  });

  it('older days keep one snapshot each, up to the limit', () => {
    const names = [];
    for (let d = 1; d <= 10; d++) {
      for (const t of ['08-00-00', '12-00-00', '20-00-00']) {
        names.push(name(`2026-09-${String(d).padStart(2, '0')}`, t));
      }
    }
    const gone = prunePlan(names, 20, 7);
    for (let d = 4; d <= 10; d++) {
      expect(gone).not.toContain(name(`2026-09-${String(d).padStart(2, '0')}`, '08-00-00'));
    }
    for (let d = 1; d <= 3; d++) {
      for (const t of ['08-00-00', '12-00-00', '20-00-00']) {
        expect(gone).toContain(name(`2026-09-0${d}`, t));
      }
    }
    expect(gone).toHaveLength(9);
  });

  it('prunes nothing under the cap', () => {
    const names = Array.from({ length: 5 }, (_, i) => name('2026-09-02', `10-00-0${i}`));
    expect(prunePlan(names, 20, 7)).toEqual([]);
  });
});

describe('snapshotHasData', () => {
  it('tells an empty mirror from one with anything in it', () => {
    expect(snapshotHasData({ entries: [], dayNotes: [] })).toBe(false);
    expect(snapshotHasData({ entries: [{ id: 'x' }], dayNotes: [] })).toBe(true);
    expect(snapshotHasData('{"entries":[],"dayNotes":[{"date":"2026-09-02"}]}')).toBe(true);
    expect(snapshotHasData('garbage')).toBe(false);
    expect(snapshotHasData(null)).toBe(false);
  });
});
