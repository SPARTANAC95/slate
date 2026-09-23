import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { beforeEach, describe, expect, it } from 'vitest';
import { addEntry, db, purgeExpiredDeleted, restoreEntry, softDeleteEntry, updateEntry } from './index';
import { pushGoogleEntries, type GoogleTransport } from './googleSync';
import { eventId, eventPatch, ownsEvent, sameGoogleEvent, toGoogleEvent, type GoogleEvent } from '../lib/googleCalendar';

beforeEach(async () => { await db.entries.clear(); await db.googleLinks.clear(); await db.dayNotes.clear(); });
const makeEntry = () => addEntry({ title: 'Release day', kind: 'game', date: '2026-11-19', notes: 'Remember the trailer', links: ['https://example.com/trailer'] });

function fakeGoogle() {
  const events = new Map<string, GoogleEvent>();
  const writes: string[] = [];
  let loseInsert = false;
  let failDelete = false;
  let failList = false;
  const call: GoogleTransport = async <T>(command: string, args?: Record<string, unknown>): Promise<T> => {
    if (command === 'google_events') {
      if (failList) throw new Error('Offline');
      return [...events.values()].filter((event) => event.status !== 'cancelled' && event.extendedProperties?.private?.slateApp === 'slate-v1').map((e) => structuredClone(e)) as T;
    }
    const id = args!.eventId as string;
    const current = events.get(id);
    if (args!.action === 'get') return structuredClone(current ?? { status: 'cancelled' }) as T;
    if (args!.action === 'insert') {
      if (current) throw new Error('GOOGLE_DUPLICATE');
      const value = { ...structuredClone(args!.body as GoogleEvent), id, etag: 'v1' };
      events.set(id, value); writes.push('insert');
      if (loseInsert) { loseInsert = false; throw new Error('Connection lost after insert'); }
      return structuredClone(value) as T;
    }
    if (args!.action === 'delete') {
      if (failDelete) throw new Error('Offline');
      events.set(id, { ...current, id, status: 'cancelled' }); writes.push('delete');
      return { status: 'cancelled' } as T;
    }
    if (args!.action === 'patch') {
      const value = { ...current, ...structuredClone(args!.body as GoogleEvent), id, etag: 'v2' };
      events.set(id, value); writes.push('patch'); return structuredClone(value) as T;
    }
    throw new Error('Unexpected request');
  };
  return { events, writes, call, loseNextInsert: () => { loseInsert = true; }, failDeletion: () => { failDelete = true; }, failSnapshot: () => { failList = true; } };
}

describe('Google event conversion', () => {
  it('exports an all-day entry with an exclusive end date and notes/links', async () => {
    const entry = await makeEntry(); const event = toGoogleEvent(entry)!;
    expect(event.start).toEqual({ date: '2026-11-19' }); expect(event.end).toEqual({ date: '2026-11-20' });
    expect(event.description).toContain('Remember the trailer'); expect(event.description).toContain('https://example.com/trailer');
    expect(ownsEvent(event, entry.id)).toBe(true);
  });
  it('handles year boundaries, timed events across midnight, and annual recurrence', async () => {
    const entry = await makeEntry();
    const annual = toGoogleEvent({ ...entry, date: '2026-12-31', annual: true })!;
    expect(annual.end?.date).toBe('2027-01-01'); expect(annual.recurrence).toEqual(['RRULE:FREQ=YEARLY']);
    const timed = toGoogleEvent({ ...entry, date: '2026-12-31', time: '23:30' })!;
    expect(Date.parse(timed.end!.dateTime!) - Date.parse(timed.start!.dateTime!)).toBe(3600_000);
    expect(timed.start?.timeZone).toBeTruthy();
  });
  it('does not export backlog or deleted entries', async () => {
    const entry = await makeEntry(); expect(toGoogleEvent({ ...entry, date: null })).toBeNull(); expect(toGoogleEvent({ ...entry, deletedAt: 10 })).toBeNull();
  });
  it('clears timed fields when becoming all-day and ignores equivalent UTC offsets', async () => {
    const entry = await makeEntry(); expect(eventPatch(toGoogleEvent(entry)!).start).toEqual({ date: entry.date, dateTime: null, timeZone: null });
    expect(sameGoogleEvent({ start: { dateTime: '2026-11-19T12:00:00+01:00' } }, { start: { dateTime: '2026-11-19T11:00:00Z' } })).toBe(true);
  });
  it('uses stable valid IDs, and distinct generations for restored events', async () => {
    const first = await eventId('my-entry'); expect(first).toMatch(/^[0-9a-v]{5,1024}$/); expect(await eventId('my-entry')).toBe(first); expect(await eventId('my-entry', 1)).not.toBe(first);
  });
});

describe('one-way Google sync', () => {
  it('upgrades a version-4 database without changing entries or journal notes', async () => {
    const entry = await makeEntry();
    await db.delete();
    const previous = new Dexie('slate');
    previous.version(4).stores({ entries: 'id, date, kind, updatedAt', dayNotes: 'date' });
    await previous.table('entries').put(entry);
    await previous.table('dayNotes').put({ date: '2026-11-19', body: 'Keep my journal', updatedAt: 123 });
    previous.close(); await db.open();
    expect(await db.entries.get(entry.id)).toEqual(entry);
    expect((await db.dayNotes.get('2026-11-19'))?.body).toBe('Keep my journal');
    expect(await db.googleLinks.count()).toBe(0);
  });
  it('creates once, skips an unchanged copy, and propagates edits', async () => {
    const entry = await makeEntry(); const google = fakeGoogle();
    expect(await pushGoogleEntries('calendar', db, google.call)).toBe(1);
    await pushGoogleEntries('calendar', db, google.call); expect(google.writes).toEqual(['insert']);
    await updateEntry(entry.id, { title: 'New release', date: '2026-11-20', time: '18:30' });
    await pushGoogleEntries('calendar', db, google.call); expect(google.writes).toEqual(['insert', 'patch']);
    expect([...google.events.values()][0].summary).toBe('New release');
  });
  it('retries a lost insert response without duplicating an event', async () => {
    await makeEntry(); const google = fakeGoogle(); google.loseNextInsert();
    await expect(pushGoogleEntries('calendar', db, google.call)).rejects.toThrow('Connection lost');
    await pushGoogleEntries('calendar', db, google.call); expect(google.events.size).toBe(1); expect(google.writes).toEqual(['insert']);
  });
  it('keeps unrelated Google events untouched and does not import them', async () => {
    await makeEntry(); const google = fakeGoogle(); google.events.set('personal', { id: 'personal', summary: 'Private meeting' });
    await pushGoogleEntries('calendar', db, google.call);
    expect(google.events.get('personal')).toEqual({ id: 'personal', summary: 'Private meeting' }); expect(await db.entries.count()).toBe(1);
  });
  it('removes Slate copies when unscheduled, then restores without reusing a tombstone', async () => {
    const entry = await makeEntry(); const google = fakeGoogle(); await pushGoogleEntries('calendar', db, google.call);
    await updateEntry(entry.id, { date: null }); await pushGoogleEntries('calendar', db, google.call);
    expect([...google.events.values()][0].status).toBe('cancelled');
    await updateEntry(entry.id, { date: '2026-12-01' }); await pushGoogleEntries('calendar', db, google.call);
    expect([...google.events.values()].filter((e) => e.status !== 'cancelled')).toHaveLength(1);
    expect(google.writes).toEqual(['insert', 'delete', 'insert']);
  });
  it('propagates soft deletes and undo', async () => {
    const entry = await makeEntry(); const google = fakeGoogle(); await pushGoogleEntries('calendar', db, google.call);
    await softDeleteEntry(entry.id); await pushGoogleEntries('calendar', db, google.call);
    await restoreEntry(entry.id); await pushGoogleEntries('calendar', db, google.call);
    expect(google.writes).toEqual(['insert', 'delete', 'insert']);
  });
  it('retains pending deletions after 30 days offline, purging only after acknowledgement', async () => {
    const entry = await makeEntry(); const google = fakeGoogle(); await pushGoogleEntries('calendar', db, google.call);
    await db.entries.update(entry.id, { deletedAt: Date.now() - 40 * 86400_000 }); google.failDeletion();
    await expect(pushGoogleEntries('calendar', db, google.call)).rejects.toThrow('Offline');
    await purgeExpiredDeleted(); expect(await db.entries.get(entry.id)).toBeDefined();
    await db.googleLinks.toCollection().modify({ deleted: true }); await purgeExpiredDeleted(); expect(await db.entries.get(entry.id)).toBeUndefined();
  });
  it('never deletes Google data when the local database is empty', async () => {
    await makeEntry(); const google = fakeGoogle(); await pushGoogleEntries('calendar', db, google.call);
    await db.entries.clear(); await pushGoogleEntries('calendar', db, google.call);
    expect(google.writes).toEqual(['insert']);
  });
  it('reconstructs links after restoring a local backup without duplicating', async () => {
    await makeEntry(); const google = fakeGoogle(); await pushGoogleEntries('calendar', db, google.call);
    await db.googleLinks.clear(); await pushGoogleEntries('calendar', db, google.call);
    expect(google.writes).toEqual(['insert']); expect(await db.googleLinks.count()).toBe(1);
  });
  it('does not write anything after a failed remote snapshot', async () => {
    await makeEntry(); const google = fakeGoogle(); google.failSnapshot();
    await expect(pushGoogleEntries('calendar', db, google.call)).rejects.toThrow('Offline'); expect(google.writes).toEqual([]);
  });
  it('refuses an ID collision with an event it does not own', async () => {
    const entry = await makeEntry(); const google = fakeGoogle(); const id = await eventId(entry.id);
    google.events.set(id, { id, summary: 'Other app' }); await expect(pushGoogleEntries('calendar', db, google.call)).rejects.toThrow('does not belong'); expect(google.writes).toEqual([]);
  });
  it('recreates a copy deleted in Google and restores source edits in one-way mode', async () => {
    const entry = await makeEntry(); const google = fakeGoogle(); await pushGoogleEntries('calendar', db, google.call);
    const id = await eventId(entry.id); google.events.set(id, { ...google.events.get(id), status: 'cancelled' });
    await pushGoogleEntries('calendar', db, google.call); expect(google.writes).toEqual(['insert', 'insert']);
    const current = [...google.events.values()].find((e) => e.status !== 'cancelled')!; current.summary = 'Changed in Google';
    await pushGoogleEntries('calendar', db, google.call); expect(google.events.get(current.id!)?.summary).toBe(entry.title);
  });
});
