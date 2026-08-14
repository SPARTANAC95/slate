import { db } from './index';
import { dumpAll, type BackupFile } from './backup';
import { todayISO } from '../lib/dates';
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

/** one JSON file of everything — the same shape the on-disk backup uses */
export async function exportToFile(): Promise<void> {
  const blob = new Blob([JSON.stringify(await dumpAll(), null, 2)], {
    type: 'application/json',
  });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `slate-export-${todayISO()}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}
