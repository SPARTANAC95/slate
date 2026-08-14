import { describe, expect, it } from 'vitest';
import { matchEntries } from './search';
import type { Entry } from '../types';

let n = 0;
const entry = (title: string, tags: string[] = []): Entry => ({
  id: `e${n++}`,
  title,
  kind: 'note',
  date: null,
  annual: false,
  dateHistory: [],
  done: false,
  rating: null,
  verdict: '',
  notes: '',
  links: [],
  tags,
  external: null,
  runtimeMin: null,
  series: null,
  deletedAt: null,
  createdAt: 0,
  updatedAt: 0,
});

const DB = [
  entry('Elden Ring dlc', ['hype', 'soulslike']),
  entry('Silo', ['scifi']),
  entry('Dune 3', ['scifi', 'hype']),
];

describe('matchEntries', () => {
  it('returns nothing for an empty query', () => {
    expect(matchEntries(DB, '')).toEqual([]);
    expect(matchEntries(DB, '   ')).toEqual([]);
  });

  it('matches titles case-insensitively on substrings', () => {
    expect(matchEntries(DB, 'elden').map((e) => e.title)).toEqual(['Elden Ring dlc']);
    expect(matchEntries(DB, 'DUNE').map((e) => e.title)).toEqual(['Dune 3']);
    expect(matchEntries(DB, 'ring').map((e) => e.title)).toEqual(['Elden Ring dlc']);
  });

  it('matches tags with a # term', () => {
    expect(matchEntries(DB, '#scifi').map((e) => e.title)).toEqual(['Silo', 'Dune 3']);
    expect(matchEntries(DB, '#hype').map((e) => e.title)).toEqual(['Elden Ring dlc', 'Dune 3']);
  });

  it('a bare # matches nothing rather than everything', () => {
    expect(matchEntries(DB, '#')).toEqual([]);
  });

  it('matches tags from bare words too', () => {
    expect(matchEntries(DB, 'soulslike').map((e) => e.title)).toEqual(['Elden Ring dlc']);
  });

  it('requires every term (tag + title narrows)', () => {
    expect(matchEntries(DB, '#scifi dune').map((e) => e.title)).toEqual(['Dune 3']);
    expect(matchEntries(DB, '#scifi elden')).toEqual([]);
  });

  it('respects the limit', () => {
    expect(matchEntries(DB, '#scifi', 1)).toHaveLength(1);
  });
});
