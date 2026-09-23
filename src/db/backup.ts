import { liveQuery } from 'dexie';
import { db } from './index';
import { isTauri, writeBackup } from '../lib/platform';
import { onWindowGoingAway } from '../lib/lifecycle';
import type { DayNote, Entry } from '../types';

/** same shape the export/import uses — a backup file is a valid import */
export type BackupFile = {
  version: 1;
  exportedAt: number;
  entries: Entry[];
  dayNotes: DayNote[];
};

export type BackupStatus =
  | { state: 'idle' }
  | { state: 'saving' }
  | { state: 'saved'; at: number }
  | { state: 'unavailable' };

const pack = (entries: Entry[], dayNotes: DayNote[]): BackupFile => ({
  version: 1,
  exportedAt: Date.now(),
  entries,
  dayNotes,
});

export async function dumpAll(): Promise<BackupFile> {
  const [entries, dayNotes] = await Promise.all([db.entries.toArray(), db.dayNotes.toArray()]);
  return pack(entries, dayNotes);
}

/** ask the browser to never evict this origin's IndexedDB */
export async function requestPersistentStorage(): Promise<void> {
  try {
    await navigator.storage?.persist?.();
  } catch {
    // not fatal — the on-disk backup still covers us
  }
}

/**
 * Mirror the database to disk: once on start, debounced after every change,
 * and a final flush when the window goes away. Reports status so a silently
 * missing safety net is visible in the UI instead of invisible.
 */
export function startBackups(onStatus: (s: BackupStatus) => void): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let disposed = false;
  /** the newest snapshot the live query has handed us, saved or not */
  let pending: string | null = null;

  const write = async () => {
    timer = null;
    const snapshot = pending;
    if (snapshot === null) return;
    onStatus({ state: 'saving' });
    const ok = await writeBackup(snapshot);
    if (disposed) return;
    onStatus(ok ? { state: 'saved', at: Date.now() } : { state: 'unavailable' });
  };

  const sub = liveQuery(() =>
    Promise.all([db.entries.toArray(), db.dayNotes.toArray()]),
  ).subscribe({
    next: ([entries, dayNotes]) => {
      // serialize eagerly so a sudden close always has the current data
      pending = JSON.stringify(pack(entries, dayNotes));
      if (timer) clearTimeout(timer);
      timer = setTimeout(write, 2000);
    },
    error: () => onStatus({ state: 'unavailable' }),
  });

  const onGoingAway = () => {
    // a debounce is still waiting — get the current snapshot out now
    if (!timer || pending === null) return;
    clearTimeout(timer);
    timer = null;
    if (isTauri()) {
      void writeBackup(pending);
    } else {
      navigator.sendBeacon?.('/api/backup', new Blob([pending], { type: 'application/json' }));
    }
  };
  const stopListening = onWindowGoingAway(onGoingAway);

  return () => {
    disposed = true;
    sub.unsubscribe();
    stopListening();
    if (timer) clearTimeout(timer);
  };
}
