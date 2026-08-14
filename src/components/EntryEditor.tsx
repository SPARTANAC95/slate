import type { Entry, EntryKind } from '../types';
import { KIND_ORDER } from '../types';
import { useEntryForm } from '../lib/useEntryForm';

type Props = {
  /** editing an existing entry… */
  entry?: Entry;
  /** …or creating a new one on this day */
  date?: string;
  onDone: () => void;
};

const field =
  'rounded-lg border border-line bg-transparent px-2 py-1.5 text-13 text-text ' +
  'transition-colors duration-150 focus:border-line-strong focus:outline-none';

export function EntryEditor({ entry, date, onDone }: Props) {
  const f = useEntryForm(entry, date);

  return (
    <form
      className="fade-in flex flex-col gap-2 rounded-lg border border-line bg-bg p-2.5"
      onSubmit={async (e) => {
        e.preventDefault();
        if (await f.submit()) onDone();
      }}
    >
      <input
        autoFocus
        value={f.title}
        onChange={(e) => f.setTitle(e.target.value)}
        placeholder="title"
        aria-label="title"
        className={field}
      />
      <div className="flex gap-2">
        <select
          value={f.kind}
          onChange={(e) => f.setKind(e.target.value as EntryKind)}
          aria-label="kind"
          className={`${field} flex-1 bg-bg`}
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
          className={`${field} flex-1 font-mono text-12`}
        />
      </div>
      {f.kind === 'series' && (
        <div className="flex items-center gap-2 font-mono text-12 text-text-2">
          <label className="flex items-center gap-1.5">
            s
            <input
              type="number"
              min={1}
              value={f.season}
              onChange={(e) => f.setSeason(Number(e.target.value))}
              aria-label="season"
              className={`${field} w-14 font-mono text-12`}
            />
          </label>
          <label className="flex items-center gap-1.5">
            e
            <input
              type="number"
              min={1}
              value={f.episode}
              onChange={(e) => f.setEpisode(Number(e.target.value))}
              aria-label="episode"
              className={`${field} w-14 font-mono text-12`}
            />
          </label>
        </div>
      )}
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
      <label className="flex items-center gap-2 text-12 text-text-2">
        <input
          type="checkbox"
          checked={f.annual}
          onChange={(e) => f.setAnnual(e.target.checked)}
          className="size-3.5"
        />
        every year
      </label>
      <div className="mt-0.5 flex items-center gap-2">
        <button
          type="submit"
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
    </form>
  );
}
