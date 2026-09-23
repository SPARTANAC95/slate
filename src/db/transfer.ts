import { db } from './index';
import { dumpAll, type BackupFile } from './backup';
import { todayISO } from '../lib/dates';
import { isTauri, readBackup } from '../lib/platform';
import { revealPath, saveExport } from '../lib/desktop';
import type { DayNote, Entry } from '../types';
import { mergeHistory, normalizeEntry, normalizeNote } from './normalize';

export type ImportPlan = {
  addEntries: Entry[];
  updateEntries: Entry[];
  skipEntries: number;
  addNotes: DayNote[];
  updateNotes: DayNote[];
  skipNotes: number;
};

export const planCounts = (p: ImportPlan) => ({
  entries: { add: p.addEntries.length, update: p.updateEntries.length, skip: p.skipEntries },
  notes: { add: p.addNotes.length, update: p.updateNotes.length, skip: p.skipNotes },
});

/** merge by id, newest updatedAt wins; returns null if the file isn't a slate export */
export async function planImport(data: unknown): Promise<ImportPlan | null> {
  const d = data as Partial<BackupFile>;
  if (!d || !Array.isArray(d.entries) || !Array.isArray(d.dayNotes)) return null;

  const [curEntries, curNotes] = await Promise.all([db.entries.toArray(), db.dayNotes.toArray()]);
  const entryById = new Map(curEntries.map((e) => [e.id, e]));
  const noteByDate = new Map(curNotes.map((n) => [n.date, n]));

  const plan: ImportPlan = {
    addEntries: [],
    updateEntries: [],
    skipEntries: 0,
    addNotes: [],
    updateNotes: [],
    skipNotes: 0,
  };

  for (const raw of d.entries) {
    const e = normalizeEntry(raw);
    if (!e) {
      plan.skipEntries++;
      continue;
    }
    const cur = entryById.get(e.id);
    if (!cur) plan.addEntries.push(e);
    else if (e.updatedAt > cur.updatedAt) {
      plan.updateEntries.push({ ...e, dateHistory: mergeHistory(cur.dateHistory, e.dateHistory) });
    } else plan.skipEntries++;
  }
  for (const raw of d.dayNotes) {
    const n = normalizeNote(raw);
    if (!n) {
      plan.skipNotes++;
      continue;
    }
    const cur = noteByDate.get(n.date);
    if (!cur) plan.addNotes.push(n);
    else if (n.updatedAt > cur.updatedAt) plan.updateNotes.push(n);
    else plan.skipNotes++;
  }
  return plan;
}

export async function applyImport(plan: ImportPlan): Promise<void> {
  await db.transaction('rw', db.entries, db.dayNotes, async () => {
    await db.entries.bulkPut([...plan.addEntries, ...plan.updateEntries]);
    await db.dayNotes.bulkPut([...plan.addNotes, ...plan.updateNotes]);
  });
}

/**
 * An empty database next to a disk backup that is not: a wiped webview
 * profile, a fresh machine with the data folder copied over. The mirror was
 * written for exactly this moment, so offer it back rather than leaving the
 * calendar blank until someone remembers where the file lives. Null means
 * there is nothing to offer — the database has rows, or the disk has none.
 */
export async function planRestoreFromDisk(): Promise<ImportPlan | null> {
  const [entries, notes] = await Promise.all([db.entries.count(), db.dayNotes.count()]);
  if (entries + notes > 0) return null;
  const raw = await readBackup();
  if (!raw) return null;
  try {
    const plan = await planImport(JSON.parse(raw));
    return plan && plan.addEntries.length + plan.addNotes.length > 0 ? plan : null;
  } catch {
    return null;
  }
}

/**
 * One JSON file of everything — the same shape the on-disk backup uses. In
 * the desktop app it is written into Downloads by the rust side and shown in
 * Explorer, and the path comes back; the browser downloads it itself and
 * returns null.
 */
export async function exportToFile(): Promise<string | null> {
  const json = JSON.stringify(await dumpAll(), null, 2);
  if (isTauri()) {
    const path = await saveExport(json);
    if (!path) throw new Error('export was not written');
    void revealPath(path);
    return path;
  }
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `slate-export-${todayISO()}.json`;
  // in the document so the click counts, and revoked a beat later: a click
  // only *queues* the download, so tearing the url down in the same tick can
  // cancel it — and an export that never lands reports no error at all
  a.style.display = 'none';
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return null;
}
