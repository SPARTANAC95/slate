import { describe, expect, it } from 'vitest';
import { byTimeThenAdded } from './order';
import type { Entry } from '../types';

let n = 0;
const entry = (time: string | null, createdAt: number): Entry => ({
  id: `e${n++}`,
  title: time ?? 'all day',
  kind: 'note',
  date: '2026-08-14',
  time,
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
  createdAt,
  updatedAt: 0,
});

describe('byTimeThenAdded', () => {
  it('puts the clock first and untimed entries last', () => {
    const rows = [entry(null, 1), entry('20:45', 2), entry('09:00', 3)];
    expect([...rows].sort(byTimeThenAdded).map((e) => e.title)).toEqual([
      '09:00',
      '20:45',
      'all day',
    ]);
  });

  it('falls back to insertion order within the same slot', () => {
    const rows = [entry(null, 9), entry(null, 4)];
    expect([...rows].sort(byTimeThenAdded).map((e) => e.createdAt)).toEqual([4, 9]);
    const same = [entry('10:00', 9), entry('10:00', 4)];
    expect([...same].sort(byTimeThenAdded).map((e) => e.createdAt)).toEqual([4, 9]);
  });
});
