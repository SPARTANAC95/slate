import { db } from '../db';
import type { Entry } from '../types';
import { isTauri } from './platform';
import { occursOn, toISODate } from './dates';
import { byTimeThenAdded } from './order';

const NOTIFIED_KEY = 'slate:notifiedDay';
const TIMED_KEY = 'slate:notifiedTimed';
const ENABLED_KEY = 'slate:notifications';
/** often enough that the half-hour lead can never slip between two ticks */
const CHECK_EVERY_MS = 5 * 60 * 1000;
/**
 * The morning digest waits for the morning. The tray app is awake at midnight
 * too, and "what's on today" arriving at 00:05 is a wake-up call, not a reminder.
 */
export const DIGEST_FROM_HOUR = 8;
/** how far ahead of a timed entry its nudge goes out */
export const LEAD_MIN = 30;
/** and how long past the hour a late tick may still send one, rather than staying silent */
const GRACE_MIN = 5;

/** one thing on today's list, ready to be read out */
export type Due = { id: string; label: string; time: string | null };

export type NotifyOutcome = 'sent' | 'quiet' | 'blocked';

export const notificationsEnabled = (): boolean => localStorage.getItem(ENABLED_KEY) !== 'off';

export const setNotificationsEnabled = (on: boolean): void => {
  localStorage.setItem(ENABLED_KEY, on ? 'on' : 'off');
};

/** the morning list goes out once a day, and not before people are up */
export function digestDue(now: Date, lastDay: string | null): boolean {
  return lastDay !== toISODate(now) && now.getHours() >= DIGEST_FROM_HOUR;
}

/** minutes from `now` until 'HH:mm' on the same day; negative once it has passed */
const minutesUntil = (time: string, now: Date): number => {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m - (now.getHours() * 60 + now.getMinutes());
};

/**
 * Which timed entries deserve a nudge right now: within LEAD_MIN of starting,
 * not long past, and not nudged before. Pure, so the window is tested rather
 * than argued about.
 */
export function timedReminders(due: Due[], now: Date, already: ReadonlySet<string>): Due[] {
  return due.filter((d) => {
    if (d.time === null || already.has(d.id)) return false;
    const until = minutesUntil(d.time, now);
    return until <= LEAD_MIN && until >= -GRACE_MIN;
  });
}

const line = (d: Due): string => (d.time ? `${d.time}  ${d.label}` : d.label);

/** what the nudge says — "in 20 min" for one thing, a short list for several */
export function reminderText(soon: Due[], now: Date): { title: string; body: string } {
  if (soon.length === 1) {
    const until = minutesUntil(soon[0].time ?? '00:00', now);
    const title = until <= 0 ? 'starting now' : until === 1 ? 'in 1 min' : `in ${until} min`;
    return { title, body: line(soon[0]) };
  }
  return { title: `${soon.length} things coming up`, body: soon.map(line).join('\n') };
}

/** what the morning digest says */
export function digestText(due: Due[]): { title: string; body: string } {
  if (due.length === 0) return { title: 'today on slate', body: 'nothing scheduled today' };
  const title = due.length === 1 ? 'today on slate' : `${due.length} things today`;
  const body =
    due.slice(0, 4).map(line).join('\n') + (due.length > 4 ? `\n+${due.length - 4} more` : '');
  return { title, body };
}

/** ask once, and only when the user actually has something scheduled */
async function ensurePermission(): Promise<boolean> {
  if (isTauri()) {
    try {
      const n = await import('@tauri-apps/plugin-notification');
      if (await n.isPermissionGranted()) return true;
      return (await n.requestPermission()) === 'granted';
    } catch {
      return false;
    }
  }
  if (typeof Notification === 'undefined') return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  try {
    return (await Notification.requestPermission()) === 'granted';
  } catch {
    return false;
  }
}

async function send(title: string, body: string): Promise<void> {
  if (isTauri()) {
    const n = await import('@tauri-apps/plugin-notification');
    n.sendNotification({ title, body });
    return;
  }
  new Notification(title, { body, icon: '/icon.png' });
}

const labelOf = (e: Entry): string =>
  e.series ? `${e.title} s${e.series.season}e${e.series.episode}` : e.title;

/** what's on today that I haven't dealt with, in the order the day reads */
async function dueToday(today: string): Promise<Due[]> {
  const entries = await db.entries
    .filter((e) => e.deletedAt === null && !e.done && occursOn(e.date, e.annual, today))
    .toArray();
  return entries.sort(byTimeThenAdded).map((e) => ({ id: e.id, label: labelOf(e), time: e.time }));
}

/** the timed entries already nudged today — a new day starts the list over */
const readNudged = (today: string): Set<string> => {
  try {
    const raw = JSON.parse(localStorage.getItem(TIMED_KEY) ?? 'null');
    return raw?.day === today && Array.isArray(raw.ids) ? new Set<string>(raw.ids) : new Set();
  } catch {
    return new Set();
  }
};

const writeNudged = (today: string, ids: Set<string>): void => {
  localStorage.setItem(TIMED_KEY, JSON.stringify({ day: today, ids: [...ids] }));
};

/**
 * One tick of the reminder loop. The digest goes out once a day from
 * DIGEST_FROM_HOUR; anything with a time gets its own nudge half an hour
 * before. `force` is the preferences button: send the digest now, whatever
 * the hour, even if it has to say there is nothing on — a test that stays
 * silent proves nothing.
 */
export async function checkAndNotify(force = false): Promise<NotifyOutcome> {
  if (!notificationsEnabled()) return 'quiet';
  const now = new Date();
  const today = toISODate(now);
  const due = await dueToday(today);

  let sent = false;
  if (force || (due.length > 0 && digestDue(now, localStorage.getItem(NOTIFIED_KEY)))) {
    if (!(await ensurePermission())) return 'blocked';
    const { title, body } = digestText(due);
    await send(title, body);
    localStorage.setItem(NOTIFIED_KEY, today);
    sent = true;
  }

  if (!force) {
    const nudged = readNudged(today);
    const soon = timedReminders(due, now, nudged);
    if (soon.length > 0) {
      if (!(await ensurePermission())) return 'blocked';
      const { title, body } = reminderText(soon, now);
      await send(title, body);
      for (const d of soon) nudged.add(d.id);
      writeNudged(today, nudged);
      sent = true;
    }
  }
  return sent ? 'sent' : 'quiet';
}

/**
 * Nudge once a day for whatever is due, and keep checking while the app
 * stays open so a machine left running still gets tomorrow's reminder.
 */
export function startNotifications(): () => void {
  let stopped = false;
  const tick = () => {
    // a failed notification must never surface as an unhandled rejection
    if (!stopped) checkAndNotify().catch(() => {});
  };
  // let the first paint finish before asking for permission
  const first = setTimeout(tick, 3000);
  const interval = setInterval(tick, CHECK_EVERY_MS);
  return () => {
    stopped = true;
    clearTimeout(first);
    clearInterval(interval);
  };
}
