import { useState } from 'react';
import { Image as ImageIcon, Search, X } from 'lucide-react';
import type { Entry } from '../types';
import { useMetadataSearch } from '../lib/lookup';
import { CoverArt } from './CoverArt';

const EMPTY_SLOT = (
  <span className="flex h-[58px] w-10 shrink-0 items-center justify-center rounded-[5px] border border-dashed border-line text-text-3">
    <ImageIcon size={14} />
  </span>
);

type Props = {
  /** the entry's title — only the starting point for the art search */
  title: string;
  external: Entry['external'];
  onChange: (external: Entry['external']) => void;
};

/**
 * Cover art on its own. Anything can carry a poster — a rewatch, a night
 * out, a personal event — without the entry becoming that search result.
 */
export function ArtPicker({ title, external, onChange }: Props) {
  const [open, setOpen] = useState(false);
  /**
   * Searched for separately from the entry's title. The cover you want is
   * filed under the real release name, and renaming your entry to go and find
   * it — then renaming it back — is the wrong price to pay for a poster.
   */
  const [query, setQuery] = useState(title);
  const [dead, setDead] = useState<ReadonlySet<string>>(new Set());
  const searching = query.trim().length > 1;
  const { results } = useMetadataSearch(query, [], open && searching);
  // a tile whose art turned out to be a 404 leaves the grid rather than
  // offering itself: picking it would pin a dead url to the entry
  const withArt = results.filter((r) => r.posterUrl && !dead.has(r.posterUrl));

  // opening seeds the box with the title, since that is usually right
  const toggle = () => {
    if (!open) setQuery(title);
    setOpen((v) => !v);
  };

  return (
    <div className="flex items-start gap-2">
      {external?.posterUrl ? (
        <span className="relative shrink-0">
          <CoverArt
            url={external.posterUrl}
            className="h-[58px] w-10 rounded-[5px] border border-line object-cover"
            fallback={EMPTY_SLOT}
          />
          <button
            type="button"
            // drop the art, keep the link — losing the poster should not
            // quietly stop the entry from following its release date
            onClick={() => onChange(external ? { ...external, posterUrl: null } : null)}
            aria-label="remove cover art"
            title="remove cover art"
            className="absolute -right-1.5 -top-1.5 rounded-full border border-line bg-bg p-0.5 text-text-3 transition-colors duration-150 hover:text-text"
          >
            <X size={10} />
          </button>
        </span>
      ) : (
        EMPTY_SLOT
      )}

      <div className="min-w-0 flex-1">
        <button
          type="button"
          onClick={toggle}
          className="rounded-lg border border-line px-2 py-1 text-11 text-text-2 transition-colors duration-150 hover:bg-panel-hover hover:text-text"
        >
          {external?.posterUrl ? 'change cover art' : 'find cover art'}
        </button>
        {open && (
          <div className="fade-in mt-1.5">
            <div className="flex items-center gap-1.5 rounded-lg border border-line px-2 transition-colors duration-150 focus-within:border-line-strong">
              <Search size={12} className="shrink-0 text-text-3" />
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                // escape closes the picker, not the whole editor around it
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    e.stopPropagation();
                    setOpen(false);
                  }
                }}
                placeholder="search covers by name"
                aria-label="cover art search"
                spellCheck={false}
                className="h-7 min-w-0 flex-1 bg-transparent text-12 text-text outline-none"
              />
            </div>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {withArt.map((r) => (
                <button
                  key={`${r.source}:${r.id}`}
                  type="button"
                  onClick={() => {
                    onChange({ source: r.source, id: r.id, posterUrl: r.posterUrl });
                    setOpen(false);
                  }}
                  title={`${r.title}${r.year ? ` (${r.year})` : ''}`}
                  className="rounded-[5px] border border-line transition-colors duration-150 hover:border-line-strong"
                >
                  <CoverArt
                    url={r.posterUrl}
                    alt={r.title}
                    className="h-[58px] w-10 rounded-[4px] object-cover"
                    onFail={() => setDead((s) => new Set(s).add(r.posterUrl as string))}
                  />
                </button>
              ))}
            </div>
            {searching && withArt.length === 0 && (
              <span className="mt-1.5 block text-11 text-text-3">
                nothing with art for “{query.trim()}” — try the release name, or check the api
                keys in preferences
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
