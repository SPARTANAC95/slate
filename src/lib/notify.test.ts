import { describe, expect, it } from 'vitest';
import {
  DIGEST_FROM_HOUR,
  digestDue,
  digestText,
  reminderText,
  timedReminders,
  type Due,
} from './notify';

const at = (h: number, m = 0) => new Date(2026, 7, 14, h, m); // 14 August 2026

const due = (id: string, time: string | null, label = id): Due => ({ id, label, time });

describe('digestDue', () => {
  it('waits for the morning — a tray app is awake at midnight too', () => {
    expect(digestDue(at(0, 5), '2026-08-13')).toBe(false);
    expect(digestDue(at(DIGEST_FROM_HOUR - 1, 59), '2026-08-13')).toBe(false);
    expect(digestDue(at(DIGEST_FROM_HOUR), '2026-08-13')).toBe(true);
    expect(digestDue(at(21), null)).toBe(true);
  });

  it('goes out once per day', () => {
    expect(digestDue(at(9), '2026-08-14')).toBe(false);
    expect(digestDue(at(9), '2026-08-13')).toBe(true);
  });
});

describe('timedReminders', () => {
  const none = new Set<string>();

  it('nudges inside the half-hour before, and not earlier', () => {
    const list = [due('a', '20:45')];
    expect(timedReminders(list, at(20, 14), none)).toEqual([]);
    expect(timedReminders(list, at(20, 15), none)).toEqual(list);
    expect(timedReminders(list, at(20, 40), none)).toEqual(list);
    expect(timedReminders(list, at(20, 45), none)).toEqual(list);
  });

  it('allows a late tick a few minutes of grace, then stays quiet', () => {
    const list = [due('a', '20:45')];
    expect(timedReminders(list, at(20, 50), none)).toEqual(list);
    // two hours after kickoff a toast would only be noise
    expect(timedReminders(list, at(22, 45), none)).toEqual([]);
  });

  it('skips all-day entries and anything already nudged', () => {
    const list = [due('allday', null), due('a', '20:45'), due('b', '20:50')];
    expect(timedReminders(list, at(20, 30), new Set(['a']))).toEqual([due('b', '20:50')]);
  });
});

describe('reminderText', () => {
  it('counts down for one thing', () => {
    expect(reminderText([due('a', '20:45', 'match')], at(20, 25))).toEqual({
      title: 'in 20 min',
      body: '20:45  match',
    });
    expect(reminderText([due('a', '20:45', 'match')], at(20, 44)).title).toBe('in 1 min');
    expect(reminderText([due('a', '20:45', 'match')], at(20, 47)).title).toBe('starting now');
  });

  it('lists several', () => {
    const text = reminderText([due('a', '20:45', 'match'), due('b', '21:00', 'premiere')], at(20, 30));
    expect(text.title).toBe('2 things coming up');
    expect(text.body).toBe('20:45  match\n21:00  premiere');
  });
});

describe('digestText', () => {
  it('says so when the day is empty — the test button must still show something', () => {
    expect(digestText([]).body).toBe('nothing scheduled today');
  });

  it('caps the list at four and counts the rest', () => {
    const list = ['a', 'b', 'c', 'd', 'e', 'f'].map((id) => due(id, null));
    const text = digestText(list);
    expect(text.title).toBe('6 things today');
    expect(text.body).toBe('a\nb\nc\nd\n+2 more');
  });
});
