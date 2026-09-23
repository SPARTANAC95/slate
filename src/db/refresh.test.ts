import { describe, expect, it } from 'vitest';
import { dateVerdict } from './refresh';

const entry = (date: string | null, datePinned: boolean) => ({ date, datePinned });

describe('dateVerdict', () => {
  it('follows the provider when the date was never mine', () => {
    expect(dateVerdict(entry('2026-11-19', false), '2027-03-05')).toBe('move');
  });

  it('leaves my own date alone — the bug this exists to prevent', () => {
    // I put it on saturday to watch it; the studio moving the premiere
    // must not drag my plan along with it
    expect(dateVerdict(entry('2026-08-22', true), '2027-03-05')).toBe('keep');
  });

  it('does nothing when the provider agrees or has nothing to say', () => {
    expect(dateVerdict(entry('2026-11-19', false), '2026-11-19')).toBe('none');
    expect(dateVerdict(entry('2026-11-19', false), null)).toBe('none');
    // a TBA provider never clears a date I already have
    expect(dateVerdict(entry('2026-11-19', true), null)).toBe('none');
  });

  it('lets an announced date land on an unpinned backlog entry', () => {
    expect(dateVerdict(entry(null, false), '2027-03-05')).toBe('move');
    // …but not on one I deliberately keep undated
    expect(dateVerdict(entry(null, true), '2027-03-05')).toBe('keep');
  });
});
