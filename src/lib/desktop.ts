import { isTauri } from './platform';

/** igdb authenticates as a twitch app, so games take two halves, not one key */
export type ApiKeys = { tmdb: string; igdbId: string; igdbSecret: string };

/** what each provider did when called with the stored key */
export type KeyStatus = 'ok' | 'missing' | 'rejected' | 'down' | 'error' | 'unreachable';
export type KeyCheck = { tmdb: KeyStatus; igdb: KeyStatus; steam: KeyStatus };

const invoke = async <T>(cmd: string, args?: Record<string, unknown>): Promise<T | null> => {
  if (!isTauri()) return null;
  try {
    const { invoke: call } = await import('@tauri-apps/api/core');
    return (await call(cmd, args)) as T;
  } catch {
    return null;
  }
};

/** keys live in the app config dir and never travel with the bundle */
export const getApiKeys = (): Promise<ApiKeys | null> => invoke<ApiKeys>('get_api_keys');

export const setApiKeys = (keys: ApiKeys): Promise<unknown> => invoke('set_api_keys', keys);

export const backupLocation = (): Promise<string | null> => invoke<string>('backup_location');

/**
 * Ask every provider whether its key works. The desktop app holds its own
 * keys; in the browser the proxy answers from .env.
 */
export async function checkApiKeys(): Promise<KeyCheck | null> {
  if (isTauri()) return invoke<KeyCheck>('check_api_keys');
  try {
    const res = await fetch('/api/key-check');
    return res.ok ? ((await res.json()) as KeyCheck) : null;
  } catch {
    return null;
  }
}

/**
 * Write an export next to the user's other downloads and hand back the path.
 * Null in the browser, which downloads it itself.
 */
export const saveExport = (json: string): Promise<string | null> =>
  invoke<string>('save_export', { json });

export async function revealPath(path: string): Promise<void> {
  try {
    const { revealItemInDir } = await import('@tauri-apps/plugin-opener');
    await revealItemInDir(path);
  } catch {
    // nothing to open — the browser build has no folder to show
  }
}

export async function revealBackup(): Promise<void> {
  const path = await backupLocation();
  if (path) await revealPath(path);
}

export async function isAutostartEnabled(): Promise<boolean> {
  if (!isTauri()) return false;
  try {
    const { isEnabled } = await import('@tauri-apps/plugin-autostart');
    return await isEnabled();
  } catch {
    return false;
  }
}

export async function setAutostart(on: boolean): Promise<void> {
  if (!isTauri()) return;
  try {
    const { enable, disable } = await import('@tauri-apps/plugin-autostart');
    await (on ? enable() : disable());
  } catch {
    // autostart is a nicety; failing to set it must not break anything
  }
}
