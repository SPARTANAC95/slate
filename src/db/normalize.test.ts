import { describe, expect, it } from 'vitest';
import { mergeHistory, normalizeEntry, normalizeNote } from './normalize';

describe('normalizeEntry', () => {
  it('rejects rows with no usable identity', () => {
    expect(normalizeEntry(null)).toBeNull();
    expect(normalizeEntry({})).toBeNull();
    expect(normalizeEntry({ id: 'a' })).toBeNull();
    expect(normalizeEntry({ id: '', title: 't' })).toBeNull();
    expect(normalizeEntry({ id: 7, title: 't' })).toBeNull();
  });

  it('always produces a dateHistory, even from a bare row', () => {
    const e = normalizeEntry({ id: 'a', title: 'x' })!;
    // this is the crash the calendar used to take on every load
    expect(e.dateHistory).toEqual([{ date: null, changedAt: 0, source: 'manual' }]);
    expect(e.links).toEqual([]);
    expect(e.tags).toEqual([]);
    expect(e.date).toBeNull();
  });

  it('seeds history with the entry date when the file omits it', () => {
    const e = normalizeEntry({ id: 'a', title: 'x', date: '2026-08-14' })!;
    expect(e.dateHistory).toEqual([{ date: '2026-08-14', changedAt: 0, source: 'manual' }]);
  });

  it('drops dates that are not YYYY-MM-DD', () => {
    expect(normalizeEntry({ id: 'a', title: 'x', date: 'tomorrow' })!.date).toBeNull();
    expect(normalizeEntry({ id: 'a', title: 'x', date: 12345 })!.date).toBeNull();
  });

  it('falls back to note for an unknown kind', () => {
    expect(normalizeEntry({ id: 'a', title: 'x', kind: 'sandwich' })!.kind).toBe('note');
    expect(normalizeEntry({ id: 'a', title: 'x', kind: 'game' })!.kind).toBe('game');
  });

  it('treats zero runtime as unknown', () => {
    expect(normalizeEntry({ id: 'a', title: 'x', runtimeMin: 0 })!.runtimeMin).toBeNull();
    expect(normalizeEntry({ id: 'a', title: 'x', runtimeMin: 97 })!.runtimeMin).toBe(97);
  });

  it('keeps only well-formed external links', () => {
    expect(normalizeEntry({ id: 'a', title: 'x', external: { source: 'nope', id: '1' } })!.external)
      .toBeNull();
    expect(
      normalizeEntry({ id: 'a', title: 'x', external: { source: 'tmdb', id: '1' } })!.external,
    ).toEqual({ source: 'tmdb', id: '1', posterUrl: null });
  });

  it('discards junk history rows but keeps valid ones', () => {
    const e = normalizeEntry({
      id: 'a',
      title: 'x',
      date: '2026-08-14',
      dateHistory: [
        { date: '2026-01-01', changedAt: 5, source: 'api' },
        { date: 'garbage', changedAt: 6, source: 'manual' },
      ],
    })!;
    expect(e.dateHistory).toEqual([{ date: '2026-01-01', changedAt: 5, source: 'api' }]);
  });

  it('coerces non-array links and tags', () => {
    const e = normalizeEntry({ id: 'a', title: 'x', links: 'http://x', tags: 3 })!;
    expect(e.links).toEqual([]);
    expect(e.tags).toEqual([]);
  });
});

describe('normalizeNote', () => {
  it('requires a real date and a string body', () => {
    expect(normalizeNote({ date: '2026-08-14', body: 'hi' })).toEqual({
      date: '2026-08-14',
      body: 'hi',
      updatedAt: 0,
    });
    expect(normalizeNote({ date: 'nope', body: 'hi' })).toBeNull();
    expect(normalizeNote({ date: '2026-08-14' })).toBeNull();
  });
});

describe('mergeHistory', () => {
  const a = { date: '2026-01-01', changedAt: 1, source: 'manual' as const };
  const b = { date: '2026-02-01', changedAt: 2, source: 'api' as const };
  const c = { date: '2026-03-01', changedAt: 3, source: 'manual' as const };

  it('keeps every hop from both sides, oldest first', () => {
    expect(mergeHistory([a, c], [a, b])).toEqual([a, b, c]);
  });

  it('never shortens a local history when the incoming one is shorter', () => {
    expect(mergeHistory([a, b, c], [a])).toHaveLength(3);
  });

  it('deduplicates identical hops', () => {
    expect(mergeHistory([a, b], [a, b])).toEqual([a, b]);
  });
});
