import { useEffect, useRef, useState } from 'react';
import type { EntryKind } from '../types';
import { apiGet } from './platform';

export type LookupResult = {
  source: 'tmdb' | 'rawg';
  kind: 'film' | 'series' | 'game';
  id: string;
  title: string;
  date: string | null;
  year: number | null;
  posterUrl: string | null;
};

export type Details = {
  date: string | null;
  title: string;
  runtimeMin: number | null;
};

export type SeasonEpisode = {
  episode: number;
  title: string;
  date: string;
  runtimeMin: number | null;
};

export async function searchMetadata(q: string, kinds: EntryKind[]): Promise<LookupResult[]> {
  const external = kinds.filter((k) => k === 'film' || k === 'series' || k === 'game');
  const data = await apiGet<{ results: LookupResult[] }>('search', {
    q,
    kinds: external.length ? external.join(',') : undefined,
  });
  return data?.results ?? [];
}

/** current date + runtime for one linked entry */
export async function fetchDetails(args: {
  source: 'tmdb' | 'rawg';
  kind: EntryKind;
  id: string;
  season?: number;
  episode?: number;
}): Promise<Details | null> {
  const data = await apiGet<{ ok: boolean } & Details>('current-date', {
    source: args.source,
    kind: args.kind,
    id: args.id,
    season: args.season,
    episode: args.episode,
  });
  if (!data || data.ok === false) return null;
  return { date: data.date ?? null, title: data.title, runtimeMin: data.runtimeMin ?? null };
}

export async function fetchSeason(id: string, season: number): Promise<SeasonEpisode[]> {
  const data = await apiGet<{ ok: boolean; episodes: SeasonEpisode[] }>('season', { id, season });
  return data?.episodes ?? [];
}

/** debounced (300ms) metadata search; stale results are discarded */
export function useMetadataSearch(query: string, kinds: EntryKind[], enabled: boolean) {
  const [results, setResults] = useState<LookupResult[]>([]);
  const runId = useRef(0);
  const kindsKey = kinds.join(',');

  useEffect(() => {
    const id = ++runId.current;
    if (!enabled || query.trim().length < 2) {
      setResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      const found = await searchMetadata(
        query.trim(),
        kindsKey ? (kindsKey.split(',') as EntryKind[]) : [],
      );
      if (id === runId.current) setResults(found);
    }, 300);
    return () => clearTimeout(timer);
  }, [query, kindsKey, enabled]);

  return { results, clear: () => setResults([]) };
}
