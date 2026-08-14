import { isTauri } from './platform';

export type ApiKeys = { tmdb: string; rawg: string };

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

export async function revealBackup(): Promise<void> {
  const path = await backupLocation();
  if (!path) return;
  try {
    const { revealItemInDir } = await import('@tauri-apps/plugin-opener');
    await revealItemInDir(path);
  } catch {
    // nothing to open — the browser build has no folder to show
  }
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
