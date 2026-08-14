import { useEffect, useRef, useState } from 'react';
import type { EntryKind } from '../types';

export type LookupResult = {
  source: 'tmdb' | 'rawg';
  kind: 'film' | 'series' | 'game';
  id: string;
  title: string;
  date: string | null;
  year: number | null;
  posterUrl: string | null;
};

export async function searchMetadata(
  q: string,
  kinds: EntryKind[],
  signal?: AbortSignal,
): Promise<LookupResult[]> {
  try {
    const params = new URLSearchParams({ q });
    const external = kinds.filter((k) => k === 'film' || k === 'series' || k === 'game');
    if (external.length) params.set('kinds', external.join(','));
    const res = await fetch(`/api/search?${params}`, { signal });
    if (!res.ok) return [];
    return (await res.json()).results ?? [];
  } catch {
    return []; // dead network never blocks manual entry
  }
}

export async function fetchCurrentDate(args: {
  source: 'tmdb' | 'rawg';
  kind: EntryKind;
  id: string;
  season?: number;
  episode?: number;
}): Promise<string | null> {
  try {
    const params = new URLSearchParams({ source: args.source, kind: args.kind, id: args.id });
    if (args.season) params.set('season', String(args.season));
    if (args.episode) params.set('episode', String(args.episode));
    const res = await fetch(`/api/current-date?${params}`);
    if (!res.ok) return null;
    return (await res.json()).date ?? null;
  } catch {
    return null;
  }
}

/** debounced (300ms) metadata search; aborts stale requests */
export function useMetadataSearch(query: string, kinds: EntryKind[], enabled: boolean) {
  const [results, setResults] = useState<LookupResult[]>([]);
  const abortRef = useRef<AbortController | null>(null);
  const kindsKey = kinds.join(',');

  useEffect(() => {
    abortRef.current?.abort();
    if (!enabled || query.trim().length < 2) {
      setResults([]);
      return;
    }
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    const timer = setTimeout(async () => {
      const found = await searchMetadata(query.trim(), kindsKey ? (kindsKey.split(',') as EntryKind[]) : [], ctrl.signal);
      if (!ctrl.signal.aborted) setResults(found);
    }, 300);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [query, kindsKey, enabled]);

  return { results, clear: () => setResults([]) };
}
