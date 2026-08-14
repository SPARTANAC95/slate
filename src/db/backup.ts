import { liveQuery } from 'dexie';
import { db } from './index';
import type { DayNote, Entry } from '../types';

/** same shape the M6 export/import will use */
export type BackupFile = {
  version: 1;
  exportedAt: number;
  entries: Entry[];
  dayNotes: DayNote[];
};

export async function dumpAll(): Promise<BackupFile> {
  const [entries, dayNotes] = await Promise.all([
    db.entries.toArray(),
    db.dayNotes.toArray(),
  ]);
  return { version: 1, exportedAt: Date.now(), entries, dayNotes };
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
 * Mirror the database to data/slate-backup.json on disk via the local
 * proxy: once on start, debounced after every change, and a final beacon
 * when the tab closes. A dead proxy never blocks the app.
 */
export function startBackups(): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let latest: string | null = null;

  const write = async () => {
    timer = null;
    latest = JSON.stringify(await dumpAll());
    try {
      await fetch('/api/backup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: latest,
      });
    } catch {
      // proxy not running — skip silently, IndexedDB is still the source of truth
    }
  };

  const sub = liveQuery(() =>
    Promise.all([db.entries.toArray(), db.dayNotes.toArray()]),
  ).subscribe({
    next: () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(write, 2000);
    },
    error: () => {},
  });

  const onPageHide = () => {
    // flush anything still debounced without waiting for fetch
    if (timer && latest !== null) {
      navigator.sendBeacon('/api/backup', new Blob([latest], { type: 'application/json' }));
    }
  };
  addEventListener('pagehide', onPageHide);

  return () => {
    sub.unsubscribe();
    removeEventListener('pagehide', onPageHide);
    if (timer) clearTimeout(timer);
  };
}
