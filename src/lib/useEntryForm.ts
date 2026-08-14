import { useRef, useState } from 'react';
import type { Entry, EntryKind } from '../types';
import { addEntry, updateEntry } from '../db';

const parseLinks = (text: string): string[] =>
  text
    .split(/\s+/)
    .filter(Boolean)
    .map((u) => (/^https?:\/\//i.test(u) ? u : `https://${u}`));

/** form state for creating or editing one entry */
export function useEntryForm(entry: Entry | undefined, date: string | undefined) {
  const [title, setTitle] = useState(entry?.title ?? '');
  const [kind, setKind] = useState<EntryKind>(entry?.kind ?? 'note');
  const [dateVal, setDateVal] = useState(entry ? (entry.date ?? '') : (date ?? ''));
  const [annual, setAnnual] = useState(entry?.annual ?? false);
  const [season, setSeason] = useState(entry?.series?.season ?? 1);
  const [episode, setEpisode] = useState(entry?.series?.episode ?? 1);
  const [linksText, setLinksText] = useState(entry?.links.join(' ') ?? '');
  const [notes, setNotes] = useState(entry?.notes ?? '');

  /** what the form opened with, so we can tell what the user actually touched */
  const initial = useRef({
    title: entry?.title ?? '',
    kind: entry?.kind ?? 'note',
    dateVal: entry ? (entry.date ?? '') : (date ?? ''),
    annual: entry?.annual ?? false,
    season: entry?.series?.season ?? 1,
    episode: entry?.series?.episode ?? 1,
    linksText: entry?.links.join(' ') ?? '',
    notes: entry?.notes ?? '',
  });

  const submit = async (): Promise<boolean> => {
    if (!title.trim()) return false;
    const series = kind === 'series' ? { season, episode } : null;
    const dateOrNull = dateVal === '' ? null : dateVal;

    if (!entry) {
      await addEntry({
        title: title.trim(),
        kind,
        date: dateOrNull,
        annual,
        series,
        links: parseLinks(linksText),
        notes,
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
    if (annual !== was.annual) patch.annual = annual;
    if (kind !== was.kind || season !== was.season || episode !== was.episode) {
      patch.series = series;
    }
    if (linksText !== was.linksText) patch.links = parseLinks(linksText);
    if (notes !== was.notes) patch.notes = notes;

    if (Object.keys(patch).length > 0) await updateEntry(entry.id, patch);
    return true;
  };

  return {
    title, setTitle,
    kind, setKind,
    dateVal, setDateVal,
    annual, setAnnual,
    season, setSeason,
    episode, setEpisode,
    linksText, setLinksText,
    notes, setNotes,
    submit,
  };
}
