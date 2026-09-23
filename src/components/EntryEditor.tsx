import { useEffect, useRef, useState } from 'react';
import type { Entry, EntryKind } from '../types';
import { KIND_ORDER } from '../types';
import { cleanCount, useEntryForm } from '../lib/useEntryForm';
import { fetchDetails, useMetadataSearch, type LookupResult } from '../lib/lookup';
import { ArtPicker } from './ArtPicker';
import { SearchDropdown } from './SearchDropdown';
import { SeriesFields } from './SeriesFields';

type Props = {
  /** editing an existing entry… */
  entry?: Entry;
  /** …or creating a new one on this day */
  date?: string;
  onDone: () => void;
  onSaved?: (date: string | null) => void;
};

const field =
  'rounded-lg border border-line bg-transparent px-2 py-1.5 text-13 text-text ' +
  'transition-colors duration-150 focus:border-line-strong focus:outline-none';

/** the kinds a provider can actually tell us anything about */
const EXTERNAL = new Set<EntryKind>(['film', 'series', 'game']);

export function EntryEditor({ entry, date, onDone, onSaved }: Props) {
  const f = useEntryForm(entry, date);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const busy = useRef(false);
  const [highlight, setHighlight] = useState(-1);
  /**
   * Set once a result has been taken, or once the dropdown has been waved
   * away with escape. Typing in the title clears it, so the lookup comes back
   * the moment you go looking again.
   */
  const [lookupOff, setLookupOff] = useState(false);

  // Only while creating. Retitling an existing entry from a search result
  // would quietly relink it to something else, and the row already offers
  // `find cover art` for the case where only the poster is wanted.
  const lookupEnabled = !entry && EXTERNAL.has(f.kind) && !lookupOff;
  const { results } = useMetadataSearch(f.title, [f.kind], lookupEnabled);
  const open = lookupEnabled && results.length > 0;

  useEffect(() => setHighlight(-1), [results]);

  /**
   * Fill the form from a result — but hand the date over as an offer, not a
   * fact. See `applyResult`: whatever is already in the date field stays.
   */
  const pick = async (r: LookupResult) => {
    setLookupOff(true);
    setHighlight(-1);
    const series = f.kind === 'series';
    const details = await fetchDetails({
      source: r.source,
      kind: r.kind,
      id: r.id,
      season: series ? cleanCount(f.season) : undefined,
      episode: series ? cleanCount(f.episode) : undefined,
    });
    f.applyResult(r, details);
  };

  const onTitleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown' && open) {
      e.preventDefault();
      setHighlight((h) => (h + 1) % results.length);
    } else if (e.key === 'ArrowUp' && open) {
      e.preventDefault();
      setHighlight((h) => (h <= 0 ? results.length - 1 : h - 1));
    } else if (e.key === 'Enter' && open && highlight >= 0) {
      // enter belongs to the dropdown while a row is highlighted — the form
      // would otherwise submit a half-filled entry out from under it
      e.preventDefault();
      pick(results[highlight]);
    } else if (e.key === 'Escape' && open) {
      // dismiss the dropdown, not the editor around it
      e.stopPropagation();
      setLookupOff(true);
      setHighlight(-1);
    }
  };

  return (
    <form
      className="fade-in flex flex-col gap-2 rounded-lg border border-line bg-bg p-2.5"
      onSubmit={async (e) => {
        e.preventDefault();
        if (busy.current) return;
        busy.current = true;
        setSaving(true);
        setError('');
        try {
          if (await f.submit()) { onSaved?.(f.dateVal || null); onDone(); }
        } catch { setError('Could not save this entry. Your edits are still here; try again.'); }
        finally { busy.current = false; setSaving(false); }
      }}
      // escape closes the editor the way it closes everything else here
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation();
          onDone();
        }
      }}
    >
      <div className="relative">
        <input
          autoFocus
          value={f.title}
          onChange={(e) => {
            f.setTitle(e.target.value);
            setLookupOff(false);
          }}
          onKeyDown={onTitleKeyDown}
          placeholder={EXTERNAL.has(f.kind) && !entry ? 'title — searches as you type' : 'title'}
          aria-label="title"
          className={`${field} w-full`}
        />
        {open && (
          <SearchDropdown
            results={results}
            highlight={highlight}
            onPick={pick}
            onHover={setHighlight}
            hint={<span>enter · fill this form from it</span>}
          />
        )}
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)_108px] gap-2">
        <select
          value={f.kind}
          onChange={(e) => {
            f.setKind(e.target.value as EntryKind);
            // a kind switched to game or series is an invitation to look it up
            setLookupOff(false);
          }}
          aria-label="kind"
          className={`${field} col-span-2 min-w-0`}
        >
          {KIND_ORDER.map((k) => (
            <option key={k} value={k}>
              {k}
            </option>
          ))}
        </select>
        <input
          type="date"
          value={f.dateVal}
          onChange={(e) => f.setDateVal(e.target.value)}
          aria-label="date"
          className={`${field} min-w-0 w-full font-mono text-12`}
        />
        <input
          type="time"
          value={f.time}
          onChange={(e) => f.setTime(e.target.value)}
          aria-label="time"
          title="time — leave empty for an all-day entry"
          disabled={f.dateVal === ''}
          className={`${field} w-[108px] shrink-0 font-mono text-12 disabled:opacity-40`}
        />
      </div>
      {/* the panel is narrow, so the date and the choice get a line each */}
      {f.providerDate && (
        <div className="flex flex-col gap-1 rounded-lg border border-line bg-panel px-2 py-1.5">
          <div className="flex items-center gap-2">
            <span className="shrink-0 text-11 text-text-3">release</span>
            <span className="shrink-0 whitespace-nowrap font-mono text-12 text-text">
              {f.providerDate}
            </span>
            {f.dateVal !== f.providerDate && (
              <button
                type="button"
                onClick={f.takeProviderDate}
                className="ml-auto shrink-0 rounded-lg border border-line px-1.5 py-0.5 text-11 text-text-2 transition-colors duration-150 hover:bg-panel-hover hover:text-text"
              >
                use it
              </button>
            )}
          </div>
          <span className="text-11 text-text-3">
            {f.dateVal === f.providerDate
              ? 'the date above follows it'
              : 'keeping the date above instead'}
          </span>
        </div>
      )}
      {f.kind === 'series' && (
        <SeriesFields
          season={f.season}
          episode={f.episode}
          onSeason={f.setSeason}
          onEpisode={f.setEpisode}
          className={field}
        />
      )}
      <input
        value={f.tagsText}
        onChange={(e) => f.setTagsText(e.target.value)}
        placeholder="tags — separated by spaces"
        aria-label="tags"
        className={`${field} font-mono text-12`}
      />
      <input
        value={f.linksText}
        onChange={(e) => f.setLinksText(e.target.value)}
        placeholder="links — paste urls, separated by spaces"
        aria-label="links"
        className={`${field} font-mono text-12`}
      />
      <textarea
        value={f.notes}
        onChange={(e) => f.setNotes(e.target.value)}
        placeholder="notes"
        aria-label="notes"
        rows={2}
        className={`${field} resize-y`}
      />
      <ArtPicker title={f.title} external={f.external} onChange={f.setExternal} />
      <label className="flex items-center gap-2 text-12 text-text-2">
        <input
          type="checkbox"
          checked={f.annual}
          onChange={(e) => f.setAnnual(e.target.checked)}
          className="size-3.5"
        />
        every year
      </label>
      {f.external && f.dateVal !== '' && (
        <label className="flex items-center gap-2 text-12 text-text-2">
          <input
            type="checkbox"
            checked={f.datePinned}
            onChange={(e) => f.setDatePinned(e.target.checked)}
            className="size-3.5"
          />
          keep my date
          <span className="text-11 text-text-3">
            {f.datePinned ? 'release updates leave it alone' : 'follows the release date'}
          </span>
        </label>
      )}
      <div className="mt-0.5 flex items-center gap-2">
        <button
          type="submit"
          disabled={saving}
          className="rounded-lg border border-line-strong bg-panel-hover px-3 py-1 text-12 text-text transition-colors duration-150 hover:bg-panel"
        >
          {entry ? 'Save' : 'Add'}
        </button>
        <button
          type="button"
          onClick={onDone}
          className="rounded-lg px-2 py-1 text-12 text-text-3 transition-colors duration-150 hover:text-text-2"
        >
          Cancel
        </button>
        {f.dateVal === '' && <span className="ml-auto text-11 text-text-3">no date — backlog</span>}
      </div>
      {error && <p role="alert" className="text-12 text-amber-300">{error}</p>}
    </form>
  );
}
