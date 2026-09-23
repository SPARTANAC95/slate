import { liveQuery } from 'dexie';
import { db } from './index';
import { isTauri } from '../lib/platform';
import { eventId, eventPatch, ownsEvent, sameGoogleEvent, toGoogleEvent, type GoogleEvent, type GoogleStatus } from '../lib/googleCalendar';

export type SyncProgress = { state: 'off' | 'idle' | 'syncing' | 'error'; message: string; lastSync?: number; count?: number };
let progress: SyncProgress = { state: 'off', message: 'Google Calendar is not connected' };
const listeners = new Set<(p: SyncProgress) => void>();
export const getGoogleProgress = () => progress;
export function watchGoogleProgress(listener: (p: SyncProgress) => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }
const report = (p: SyncProgress) => { progress = p; listeners.forEach((fn) => fn(p)); };

export async function googleCall<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  if (!isTauri()) throw new Error('Connect Google Calendar in the Slate Windows app.');
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<T>(command, args);
}
export const googleError = (error: unknown) => error instanceof Error ? error.message : String(error);

// Serialize settings changes with sync. A destination cannot change halfway
// through a batch and send events into the wrong calendar.
let queue: Promise<unknown> = Promise.resolve();
export function googleExclusive<T>(task: () => Promise<T>): Promise<T> {
  const next = queue.then(task, task); queue = next.catch(() => {}); return next;
}
let running: Promise<void> | null = null;

export interface PushStore {
  entries: typeof db.entries;
  googleLinks: typeof db.googleLinks;
}
export type GoogleTransport = <T>(command: string, args?: Record<string, unknown>) => Promise<T>;

/** Network calls never sit inside IndexedDB transactions. The manifest is saved
 * before insertion, making retries safe even when Google's response is lost. */
export async function pushGoogleEntries(calendarId: string, store: PushStore = db, call: GoogleTransport = googleCall): Promise<number> {
  const snapshot = await call<GoogleEvent[]>('google_events');
  const remoteByEntry = new Map<string, GoogleEvent>();
  for (const event of snapshot) {
    const id = event.extendedProperties?.private?.slateEntryId;
    if (id && ownsEvent(event, id)) remoteByEntry.set(id, event);
  }
  const entries = await store.entries.toArray();
  let count = 0;
  for (const original of entries) {
    // Re-read immediately before each write so a long first sync sees edits.
    const entry = await store.entries.get(original.id);
    if (!entry) continue; // Missing local data is never interpreted as deletion.
    const key = `${calendarId}\n${entry.id}`;
    let link = await store.googleLinks.get(key);
    let remote = remoteByEntry.get(entry.id);
    const desired = toGoogleEvent(entry);
    if (!desired && !link && !remote) continue;
    if (!link) link = { key, calendarId, entryId: entry.id, eventId: remote?.id ?? await eventId(entry.id), generation: 0, deleted: false };
    if (remote?.id) link.eventId = remote.id;
    if (!remote && !link.deleted) remote = await call<GoogleEvent>('google_event', { action: 'get', eventId: link.eventId });
    if (remote && remote.status !== 'cancelled' && !ownsEvent(remote, entry.id)) {
      throw new Error('A Google event does not belong to Slate. Sync stopped to protect your calendar.');
    }
    if (!desired) {
      if (remote?.status !== 'cancelled' && remote?.id) {
        await call('google_event', { action: 'delete', eventId: remote.id, etag: remote.etag });
      }
      await store.googleLinks.put({ ...link, deleted: true });
      continue;
    }
    if (remote?.id && remote.status !== 'cancelled') {
      if (!sameGoogleEvent(remote, desired)) {
        const result = await call<GoogleEvent>('google_event', { action: 'patch', eventId: remote.id, body: eventPatch(desired), etag: remote.etag });
        if (result.status === 'cancelled') throw new Error('A Google event was removed during sync. Slate will retry.');
      }
    } else {
      let inserted = false;
      for (let attempt = 0; attempt < 4; attempt++) {
        if (link.deleted || (remote?.id && remote.status === 'cancelled')) {
          link.generation++; link.eventId = await eventId(entry.id, link.generation);
        }
        link.deleted = false;
        await store.googleLinks.put(link);
        try {
          const result = await call<GoogleEvent>('google_event', { action: 'insert', eventId: link.eventId, body: { ...desired, id: link.eventId } });
          if (!result.id) throw new Error('Google did not confirm the new event. Your entry is still saved locally.');
          inserted = true; break;
        } catch (error) {
          if (!googleError(error).includes('GOOGLE_DUPLICATE')) throw error;
          remote = await call<GoogleEvent>('google_event', { action: 'get', eventId: link.eventId });
          if (remote.status !== 'cancelled') {
            if (!ownsEvent(remote, entry.id)) throw new Error('A Google event ID is already in use by another event.');
            await call('google_event', { action: 'patch', eventId: link.eventId, body: eventPatch(desired), etag: remote.etag });
            inserted = true; break;
          }
          link.deleted = true;
        }
      }
      if (!inserted) throw new Error('Google is still retaining a deleted event. Please try Sync now again.');
    }
    await store.googleLinks.put({ ...link, deleted: false });
    count++;
  }
  return count;
}

export function syncGoogleNow(): Promise<void> {
  if (running) return running;
  running = googleExclusive(async () => {
    if (!isTauri()) return;
    try {
      const status = await googleCall<GoogleStatus>('google_status');
      if (!status.connected || !status.enabled || !status.calendarId) {
        report({ state: 'off', message: status.connected ? 'Google sync is paused' : 'Google Calendar is not connected' }); return;
      }
      report({ ...progress, state: 'syncing', message: 'Syncing to Google Calendar…' });
      const count = await pushGoogleEntries(status.calendarId);
      const lastSync = Date.now();
      report({ state: 'idle', message: `${count} ${count === 1 ? 'entry' : 'entries'} synced to ${status.calendarName}`, count, lastSync });
    } catch (error) { report({ ...progress, state: 'error', message: googleError(error) }); }
  }).finally(() => { running = null; });
  return running;
}

export function startGoogleSync(): () => void {
  if (!isTauri()) return () => {};
  let timer: ReturnType<typeof setTimeout> | undefined;
  const schedule = () => { clearTimeout(timer); timer = setTimeout(() => { void syncGoogleNow(); }, 5000); };
  const subscription = liveQuery(() => db.entries.toArray()).subscribe({ next: schedule, error: () => report({ state: 'error', message: 'Could not read entries for Google sync.' }) });
  const interval = setInterval(() => { void syncGoogleNow(); }, 120_000);
  const online = () => { void syncGoogleNow(); };
  window.addEventListener('online', online);
  void syncGoogleNow();
  return () => { subscription.unsubscribe(); clearTimeout(timer); clearInterval(interval); window.removeEventListener('online', online); };
}
