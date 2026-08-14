/**
 * One seam between the two ways slate runs:
 *  - browser + `npm run dev` → the Express proxy on /api
 *  - packaged windows app     → rust commands over tauri's invoke
 * Everything above this file is identical in both.
 */

export const isTauri = (): boolean =>
  typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

type Params = Record<string, string | number | undefined>;

const toQuery = (params: Params): string => {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined) q.set(k, String(v));
  return q.toString();
};

/** snake_case the keys rust expects, without touching the web query names */
const toRustArgs = (params: Params): Record<string, unknown> => {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined) out[k.replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = v;
  }
  return out;
};

const COMMANDS = {
  search: 'search_metadata',
  'current-date': 'current_date',
  season: 'season_episodes',
} as const;

export type ApiRoute = keyof typeof COMMANDS;

/**
 * Read from the metadata layer. Returns null on any failure — callers
 * degrade to manual entry rather than surfacing an error.
 */
export async function apiGet<T>(route: ApiRoute, params: Params): Promise<T | null> {
  try {
    if (isTauri()) {
      const { invoke } = await import('@tauri-apps/api/core');
      return (await invoke(COMMANDS[route], toRustArgs(params))) as T;
    }
    const res = await fetch(`/api/${route}?${toQuery(params)}`);
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

/** Mirror the database to disk. Returns true only if it actually landed. */
export async function writeBackup(json: string): Promise<boolean> {
  try {
    if (isTauri()) {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('write_backup', { json });
      return true;
    }
    const res = await fetch('/api/backup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: json,
    });
    return res.ok;
  } catch {
    return false;
  }
}
