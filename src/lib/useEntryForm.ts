import { useRef, useState } from 'react';
import type { Entry, EntryKind } from '../types';
import { addEntry, updateEntry } from '../db';
import type { Details, LookupResult } from './lookup';

const parseLinks = (text: string): string[] =>
  text
    .split(/\s+/)
    .filter(Boolean)
    .map((u) => (/^https?:\/\//i.test(u) ? u : `https://${u}`));

/** a season or episode number the provider and the row can both use: a whole number from 1 */
export const cleanCount = (n: number): number => (Number.isInteger(n) && n >= 1 ? n : 1);

const parseTags = (text: string): string[] =>
  text
    .split(/[\s,]+/)
    .map((t) => t.replace(/^#/, '').toLowerCase())
    .filter(Boolean);

/** form state for creating or editing one entry */
export function useEntryForm(entry: Entry | undefined, date: string | undefined) {
  const [title, setTitle] = useState(entry?.title ?? '');
  const [kind, setKind] = useState<EntryKind>(entry?.kind ?? 'note');
  const [dateVal, setDateVal] = useState(entry ? (entry.date ?? '') : (date ?? ''));
  const [time, setTime] = useState(entry?.time ?? '');
  const [annual, setAnnual] = useState(entry?.annual ?? false);
  const [season, setSeason] = useState(entry?.series?.season ?? 1);
  const [episode, setEpisode] = useState(entry?.series?.episode ?? 1);
  const [linksText, setLinksText] = useState(entry?.links.join(' ') ?? '');
  const [tagsText, setTagsText] = useState(entry?.tags.join(' ') ?? '');
  const [notes, setNotes] = useState(entry?.notes ?? '');
  const [external, setExternal] = useState<Entry['external']>(entry?.external ?? null);
  const [runtimeMin, setRuntimeMin] = useState<number | null>(entry?.runtimeMin ?? null);
  // a date put here by hand is mine by default — only an existing entry
  // carries a pin decision worth restoring
  const [datePinned, setDatePinned] = useState(entry?.datePinned ?? true);
  /**
   * What the provider says this comes out on, once a search result has been
   * picked. Held separately from the date field so the two can disagree —
   * that disagreement is the whole point of offering the choice.
   */
  const [providerDate, setProviderDate] = useState<string | null>(null);

  /** what the form opened with, so we can tell what the user actually touched */
  const initial = useRef({
    title: entry?.title ?? '',
    kind: entry?.kind ?? 'note',
    dateVal: entry ? (entry.date ?? '') : (date ?? ''),
    time: entry?.time ?? '',
    annual: entry?.annual ?? false,
    season: entry?.series?.season ?? 1,
    episode: entry?.series?.episode ?? 1,
    linksText: entry?.links.join(' ') ?? '',
    tagsText: entry?.tags.join(' ') ?? '',
    notes: entry?.notes ?? '',
    posterUrl: entry?.external?.posterUrl ?? null,
    runtimeMin: entry?.runtimeMin ?? null,
    datePinned: entry?.datePinned ?? true,
  });

  /**
   * Moving the date by hand claims it: the provider refresh must not undo
   * what I just typed. Unticking "keep my date" is the way back.
   */
  const changeDate = (next: string) => {
    setDateVal(next);
    if (next !== initial.current.dateVal) setDatePinned(true);
  };

  /**
   * Take a picked search result into the form: its proper title, its cover,
   * its runtime — and its release date as an *offer* rather than an overwrite.
   * A date already sitting in the field was put there on purpose (the day you
   * clicked, or one you typed), so it stands until you take the release date
   * deliberately. Only an empty field gets filled in for you.
   */
  const applyResult = (r: LookupResult, details: Details | null) => {
    // the result's title, never the details' — for a series with a season and
    // episode the provider answers with the *episode* name, and the entry is
    // the show. `addFromResult` in quickAddActions takes r.title for the same
    // reason, and puts the episode name in notes.
    setTitle(r.title);
    setExternal({ source: r.source, id: r.id, posterUrl: r.posterUrl });
    if (details?.runtimeMin != null) setRuntimeMin(details.runtimeMin);
    const release = details?.date ?? r.date;
    setProviderDate(release);
    if (dateVal === '' && release) {
      setDateVal(release);
      // it is the provider's date, so let the daily refresh keep following it
      setDatePinned(false);
    }
  };

  /** take the release date after all — the provider owns it from here */
  const takeProviderDate = () => {
    if (!providerDate) return;
    setDateVal(providerDate);
    setDatePinned(false);
  };

  const submit = async (): Promise<boolean> => {
    if (!title.trim()) return false;
    // an emptied number box is NaN until it is typed into again
    const series = kind === 'series' ? { season: cleanCount(season), episode: cleanCount(episode) } : null;
    const dateOrNull = dateVal === '' ? null : dateVal;
    // an hour with no day has nothing to hang on
    const timeOrNull = dateOrNull && time !== '' ? time : null;

    if (!entry) {
      await addEntry({
        title: title.trim(),
        kind,
        date: dateOrNull,
        time: timeOrNull,
        annual,
        series,
        links: parseLinks(linksText),
        tags: parseTags(tagsText),
        notes,
        external,
        runtimeMin,
        datePinned,
      });
      return true;
    }

    // send only what changed in this form — the entry may have moved
    // underneath us (a daily refresh can rewrite dates while it is open)
    const was = initial.current;
    const patch: Partial<Entry> = {};
    if (title.trim() !== was.title) patch.title = title.trim();
    if (kind !== was.kind) patch.kind = kind;
    if (dateVal !== was.dateVal) patch.date = dateOrNull;
    if (timeOrNull !== (was.time || null)) patch.time = timeOrNull;
    if (annual !== was.annual) patch.annual = annual;
    if (datePinned !== was.datePinned) patch.datePinned = datePinned;
    if ((external?.posterUrl ?? null) !== was.posterUrl) patch.external = external;
    if (runtimeMin !== was.runtimeMin) patch.runtimeMin = runtimeMin;
    if (kind !== was.kind || season !== was.season || episode !== was.episode) {
      patch.series = series;
    }
    if (linksText !== was.linksText) patch.links = parseLinks(linksText);
    if (tagsText !== was.tagsText) patch.tags = parseTags(tagsText);
    if (notes !== was.notes) patch.notes = notes;

    if (Object.keys(patch).length > 0) await updateEntry(entry.id, patch);
    return true;
  };

  return {
    title, setTitle,
    kind, setKind,
    dateVal, setDateVal: changeDate,
    time, setTime,
    annual, setAnnual,
    season, setSeason,
    episode, setEpisode,
    linksText, setLinksText,
    tagsText, setTagsText,
    notes, setNotes,
    external, setExternal,
    runtimeMin,
    datePinned, setDatePinned,
    providerDate,
    applyResult,
    takeProviderDate,
    submit,
  };
}
