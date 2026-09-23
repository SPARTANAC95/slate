import { describe, expect, it } from 'vitest';
import { fitsBudget, formatRuntime, runtimeOf } from './runtime';
import type { Entry, EntryKind } from '../types';

let n = 0;
const entry = (kind: EntryKind, runtimeMin: number | null): Entry => ({
  id: `e${n++}`,
  title: 't',
  kind,
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
  runtimeMin,
  series: null,
  deletedAt: null,
  createdAt: 0,
  updatedAt: 0,
});

describe('formatRuntime', () => {
  it('formats minutes, hours, and both', () => {
    expect(formatRuntime(45)).toBe('45m');
    expect(formatRuntime(60)).toBe('1h');
    expect(formatRuntime(130)).toBe('2h 10m');
  });

  it('drops minutes once it is a long haul', () => {
    expect(formatRuntime(900)).toBe('15h');
  });

  it('has nothing to say about unknown or nonsense lengths', () => {
    expect(formatRuntime(null)).toBeNull();
    expect(formatRuntime(0)).toBeNull();
    expect(formatRuntime(-5)).toBeNull();
  });
});

describe('runtimeOf', () => {
  it('prefers the real value', () => {
    expect(runtimeOf(entry('film', 97))).toBe(97);
  });

  it('falls back to a per-kind assumption', () => {
    expect(runtimeOf(entry('film', null))).toBe(120);
    expect(runtimeOf(entry('series', null))).toBe(45);
    expect(runtimeOf(entry('game', null))).toBe(900);
  });
});

describe('fitsBudget', () => {
  it('any accepts everything', () => {
    expect(fitsBudget(entry('game', 6000), 'any')).toBe(true);
  });

  it('quick takes short things regardless of kind', () => {
    expect(fitsBudget(entry('series', 22), 'quick')).toBe(true);
    expect(fitsBudget(entry('game', 30), 'quick')).toBe(true); // a short game qualifies
    expect(fitsBudget(entry('film', 120), 'quick')).toBe(false);
  });

  it('evening takes anything up to four hours', () => {
    expect(fitsBudget(entry('film', 180), 'evening')).toBe(true);
    expect(fitsBudget(entry('game', 900), 'evening')).toBe(false);
  });

  it('long takes only what exceeds an evening', () => {
    expect(fitsBudget(entry('game', 900), 'long')).toBe(true);
    expect(fitsBudget(entry('film', 120), 'long')).toBe(false);
  });

  it('uses the assumption when runtime is unknown', () => {
    expect(fitsBudget(entry('series', null), 'quick')).toBe(true); // assumed 45m
    expect(fitsBudget(entry('game', null), 'long')).toBe(true); // assumed 15h
  });
});
