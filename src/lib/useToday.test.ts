import { describe, expect, it } from 'vitest';
import { msUntilNextDay } from './useToday';

describe('msUntilNextDay', () => {
  it('aims one second past the coming midnight', () => {
    expect(msUntilNextDay(new Date(2026, 7, 14, 23, 59, 30))).toBe(31_000);
    expect(msUntilNextDay(new Date(2026, 7, 14, 0, 0, 0))).toBe(86_401_000);
  });

  it('never fires immediately, even right on the stroke', () => {
    // a check that lands exactly at 00:00:00.000 must not spin
    expect(msUntilNextDay(new Date(2026, 7, 15, 0, 0, 0, 0))).toBeGreaterThanOrEqual(1000);
  });
});
