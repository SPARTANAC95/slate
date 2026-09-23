import { useSyncExternalStore } from 'react';
import appInfo from '../../package.json';
import { isTauri } from './platform';
import { flushBeforeUpdate } from './lifecycle';
import { backupBeforeUpdate } from '../db/backup';
import { createUpdateController } from './updateController';

const SETTING = 'slate:auto-update-check';
const INTERVAL = 6 * 60 * 60 * 1000;
const automatic = () => {
  try { return localStorage.getItem(SETTING) !== 'off'; } catch { return true; }
};

export const updates = createUpdateController({
  currentVersion: appInfo.version,
  automatic: automatic(),
  saveAutomatic: on => localStorage.setItem(SETTING, on ? 'on' : 'off'),
  check: async () => {
    if (!isTauri()) throw new Error('Updates are available in the Windows app.');
    const { check } = await import('@tauri-apps/plugin-updater');
    return check({ timeout: 15_000, headers: { 'Cache-Control': 'no-cache' } });
  },
  prepare: async () => {
    await flushBeforeUpdate();
    // Dexie queues this read behind already-started writes. Snapshot after
    // text saves, never reuse the backup debounce's possibly older snapshot.
    return backupBeforeUpdate();
  },
});

export const useUpdates = () => useSyncExternalStore(updates.subscribe, updates.getSnapshot);

/** Automatic checks only announce a release; installing always needs a click. */
export function startUpdateChecks(): () => void {
  if (!isTauri()) return () => {};
  let lastAttempt = 0;
  const check = () => {
    if (!updates.getSnapshot().automatic || navigator.onLine === false) return;
    if (lastAttempt && Date.now() - lastAttempt < INTERVAL) return;
    lastAttempt = Date.now();
    void updates.check(false);
  };
  const initial = setTimeout(check, 10_000);
  const timer = setInterval(check, INTERVAL);
  window.addEventListener('online', check);
  window.addEventListener('focus', check);
  return () => {
    clearTimeout(initial);
    clearInterval(timer);
    window.removeEventListener('online', check);
    window.removeEventListener('focus', check);
  };
}
