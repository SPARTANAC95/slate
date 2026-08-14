import { db } from '../db';
import { isTauri } from './platform';
import { occursOn, todayISO } from './dates';

const NOTIFIED_KEY = 'slate:notifiedDay';
const ENABLED_KEY = 'slate:notifications';
const CHECK_EVERY_MS = 15 * 60 * 1000;

export const notificationsEnabled = (): boolean => localStorage.getItem(ENABLED_KEY) !== 'off';

export const setNotificationsEnabled = (on: boolean): void => {
  localStorage.setItem(ENABLED_KEY, on ? 'on' : 'off');
};

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

/** what's on today that I haven't dealt with */
async function dueToday(): Promise<string[]> {
  const today = todayISO();
  const entries = await db.entries
    .filter((e) => e.deletedAt === null && !e.done && occursOn(e.date, e.annual, today))
    .toArray();
  return entries.map((e) =>
    e.series ? `${e.title} s${e.series.season}e${e.series.episode}` : e.title,
  );
}

export async function checkAndNotify(force = false): Promise<boolean> {
  if (!notificationsEnabled()) return false;
  const today = todayISO();
  if (!force && localStorage.getItem(NOTIFIED_KEY) === today) return false;

  const titles = await dueToday();
  if (titles.length === 0) return false;
  if (!(await ensurePermission())) return false;

  const heading = titles.length === 1 ? 'today on slate' : `${titles.length} things today`;
  const body = titles.slice(0, 4).join('\n') + (titles.length > 4 ? `\n+${titles.length - 4} more` : '');
  await send(heading, body);
  localStorage.setItem(NOTIFIED_KEY, today);
  return true;
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
