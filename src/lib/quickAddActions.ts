import { addEntries, addEntry } from '../db';
import type { ParsedEntry } from './parse';
import { fetchDetails, fetchSeason, type LookupResult } from './lookup';

/** add exactly what was typed, with no metadata behind it */
export async function addParsed(parsed: ParsedEntry): Promise<string | null> {
  await addEntry({
    title: parsed.title,
    kind: parsed.kind,
    date: parsed.date,
    annual: parsed.annual,
    series: parsed.series,
    tags: parsed.tags,
  });
  return parsed.date;
}

/** `Silo s3` + a series result → every dated episode of that season at once */
export async function addWholeSeason(
  parsed: ParsedEntry,
  r: LookupResult,
  season: number,
): Promise<{ count: number; date: string } | null> {
  const episodes = await fetchSeason(r.id, season);
  if (episodes.length === 0) return null;
  await addEntries(
    episodes.map((ep) => ({
      title: r.title,
      kind: 'series' as const,
      date: ep.date,
      notes: ep.title,
      tags: parsed.tags,
      series: { season, episode: ep.episode },
      runtimeMin: ep.runtimeMin,
      external: { source: r.source, id: r.id, posterUrl: r.posterUrl },
      dateSource: 'api' as const,
    })),
  );
  return { count: episodes.length, date: episodes[0].date };
}

/** add one picked search result, pulling its runtime and precise air date */
export async function addFromResult(
  parsed: ParsedEntry,
  r: LookupResult,
): Promise<string | null> {
  const details = await fetchDetails({
    source: r.source,
    kind: r.kind,
    id: r.id,
    season: parsed.series?.season,
    episode: parsed.series?.episode,
  });
  // a typed date always wins over the provider's
  const date = parsed.date ?? details?.date ?? r.date;
  await addEntry({
    title: r.title,
    kind: r.kind,
    date,
    annual: parsed.annual,
    series: parsed.series,
    tags: parsed.tags,
    runtimeMin: details?.runtimeMin ?? null,
    external: { source: r.source, id: r.id, posterUrl: r.posterUrl },
    dateSource: date && !parsed.date ? 'api' : 'manual',
  });
  return date;
}
