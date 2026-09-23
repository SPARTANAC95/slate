// Backup-history retention, mirrored from `prune_plan` in src-tauri/src/lib.rs.
// The packaged app runs the rust one; this is the dev proxy's copy, kept in
// step so the two folders age the same way.

/** the newest snapshots to keep regardless */
export const HISTORY_KEEP = 20;
/** and the first snapshot of each of this many recent days */
export const HISTORY_DAYS = 7;

/** the day part of `slate-backup-YYYY-MM-DDTHH-MM-SS.json` */
const dayOf = (name) => (name.startsWith('slate-backup-') ? name.slice(13, 23) : null);

/**
 * Which history files to drop. `names` sorted ascending — the stamp in the
 * name sorts chronologically. Keep the newest `keep`; also keep the earliest
 * snapshot of each of the `days` most recent days present, so a burst of
 * edits — a note typed over a minute is thirty snapshots — cannot push every
 * older restore point out of the window.
 */
export function prunePlan(names, keep = HISTORY_KEEP, days = HISTORY_DAYS) {
  const kept = new Set(names.slice(Math.max(0, names.length - keep)));
  const recentDays = [];
  for (const name of [...names].reverse()) {
    const day = dayOf(name);
    if (day && !recentDays.includes(day)) recentDays.push(day);
  }
  for (const day of recentDays.slice(0, days)) {
    const first = names.find((n) => dayOf(n) === day);
    if (first) kept.add(first);
  }
  return names.filter((n) => !kept.has(n));
}

/** does this snapshot hold anything at all? unparseable counts as empty */
export function snapshotHasData(value) {
  const v = typeof value === 'string' ? safeParse(value) : value;
  if (!v || typeof v !== 'object') return false;
  const len = (k) => (Array.isArray(v[k]) ? v[k].length : 0);
  return len('entries') + len('dayNotes') > 0;
}

const safeParse = (s) => {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
};
