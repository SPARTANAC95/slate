import type { Entry } from '../types';

export type GoogleStatus = { configured: boolean; connected: boolean; enabled: boolean; calendarId: string; calendarName: string; mode: 'push' };
export type GoogleCalendar = { id: string; summary: string; accessRole: string; primary?: boolean; timeZone?: string };
export type GoogleEvent = {
  id?: string; etag?: string; status?: string; summary?: string; description?: string;
  start?: { date?: string; dateTime?: string; timeZone?: string };
  end?: { date?: string; dateTime?: string; timeZone?: string };
  recurrence?: string[];
  extendedProperties?: { private?: Record<string, string> };
};
export type GoogleLink = { key: string; calendarId: string; entryId: string; eventId: string; generation: number; deleted: boolean };

export const ownsEvent = (event: GoogleEvent, entryId: string): boolean =>
  event.extendedProperties?.private?.slateApp === 'slate-v1' && event.extendedProperties.private.slateEntryId === entryId;

export async function eventId(entryId: string, generation = 0): Promise<string> {
  const bytes = new TextEncoder().encode(`slate-v1:${entryId}:${generation}`);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  // Hex is a subset of Google's allowed base32hex alphabet.
  return 'slate' + [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Only dated entries are exported. Runtime is media metadata, not a meeting duration. */
export function toGoogleEvent(entry: Entry, timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone): GoogleEvent | null {
  if (!entry.date || entry.deletedAt !== null) return null;
  const startDate = new Date(`${entry.date}T${entry.time ?? '00:00'}:00`);
  if (!Number.isFinite(startDate.getTime())) throw new Error(`“${entry.title}” has an invalid date.`);
  const endDate = new Date(startDate);
  if (entry.time) endDate.setMinutes(endDate.getMinutes() + 60);
  else endDate.setDate(endDate.getDate() + 1);
  const day = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return {
    summary: entry.title,
    description: [entry.notes, entry.links.join('\n'), `Synced from Slate · ${entry.kind}${entry.done ? ' · done' : ''}`].filter(Boolean).join('\n\n'),
    start: entry.time ? { dateTime: startDate.toISOString(), timeZone } : { date: entry.date },
    end: entry.time ? { dateTime: endDate.toISOString(), timeZone } : { date: day(endDate) },
    recurrence: entry.annual ? ['RRULE:FREQ=YEARLY'] : [],
    extendedProperties: { private: { slateApp: 'slate-v1', slateEntryId: entry.id } },
  };
}

export function sameGoogleEvent(a: GoogleEvent, b: GoogleEvent): boolean {
  const date = (d: GoogleEvent['start']) => d?.date ?? (d?.dateTime ? new Date(d.dateTime).getTime() : null);
  return (a.summary ?? '') === (b.summary ?? '') && (a.description ?? '') === (b.description ?? '') &&
    date(a.start) === date(b.start) && date(a.end) === date(b.end) &&
    (a.start?.timeZone ?? '') === (b.start?.timeZone ?? '') &&
    JSON.stringify(a.recurrence ?? []) === JSON.stringify(b.recurrence ?? []);
}

/** Nulls clear the old representation when switching all-day/timed events. */
export function eventPatch(event: GoogleEvent): Record<string, unknown> {
  const time = (value: GoogleEvent['start']) => value?.date
    ? { date: value.date, dateTime: null, timeZone: null }
    : { date: null, ...value };
  return { ...event, start: time(event.start), end: time(event.end) };
}
