import type { KeyCheck, KeyStatus } from '../lib/desktop';

type Props = {
  /** the desktop build stores keys itself; the browser reads them from .env */
  desktop: boolean;
  tmdb: string;
  igdbId: string;
  igdbSecret: string;
  onTmdb: (v: string) => void;
  onIgdbId: (v: string) => void;
  onIgdbSecret: (v: string) => void;
  /** 'failed' = the check itself never answered, which is not a verdict on any key */
  check: KeyCheck | 'checking' | 'failed' | null;
  onTest: () => void;
};

const field =
  'w-full rounded-lg border border-line bg-transparent px-2 py-1.5 font-mono text-12 ' +
  'text-text transition-colors duration-150 focus:border-line-strong focus:outline-none';

/** plain english for what the provider said, so a dead lookup is explainable */
const STATUS_TEXT: Record<KeyStatus, string> = {
  ok: 'working',
  missing: 'no key saved',
  rejected: 'key refused — check you copied the whole key',
  down: 'the provider is down right now — nothing wrong with your key',
  error: 'provider returned an error',
  unreachable: 'could not reach the provider — offline?',
};

/**
 * `missingText` is for a provider that is optional: igdb sharpens game lookups
 * but steam already covers them, so an empty box there is a choice, not a
 * fault, and must not wear the same warning dot as a refused key.
 */
function StatusLine({
  label,
  status,
  missingText,
}: {
  label: string;
  status: KeyStatus;
  missingText?: string;
}) {
  const optional = status === 'missing' && missingText !== undefined;
  const dot = status === 'ok' ? 'bg-kind-task' : optional ? 'bg-line-strong' : 'bg-kind-film';
  return (
    // the longer verdicts wrap, so the dot sits on the first line rather than
    // drifting to the middle of a two-line block
    <div className="flex items-start gap-1.5 text-11">
      <span className={`mt-[5px] size-1.5 shrink-0 rounded-full ${dot}`} />
      <span className="w-10 shrink-0 text-text-2">{label}</span>
      <span className="text-text-3">{optional ? missingText : STATUS_TEXT[status]}</span>
    </div>
  );
}

/** the keys, and an answer to "why is nothing showing up in search" */
export function ApiKeysPanel({
  desktop,
  tmdb,
  igdbId,
  igdbSecret,
  onTmdb,
  onIgdbId,
  onIgdbSecret,
  check,
  onTest,
}: Props) {
  return (
    <>
      {desktop ? (
        <>
          <div className="section-label mb-1.5">api keys</div>
          <label className="mb-2 block">
            <span className="mb-1 block text-11 text-text-3">
              tmdb — films and series, from themoviedb.org
            </span>
            <input
              value={tmdb}
              onChange={(e) => onTmdb(e.target.value)}
              aria-label="tmdb key"
              spellCheck={false}
              className={field}
            />
          </label>
          <div className="mb-1">
            <span className="mb-1 block text-11 text-text-3">
              igdb — games, from a twitch app at dev.twitch.tv/console/apps
            </span>
            <div className="flex flex-col gap-1.5">
              <input
                value={igdbId}
                onChange={(e) => onIgdbId(e.target.value)}
                aria-label="igdb client id"
                placeholder="client id"
                spellCheck={false}
                className={field}
              />
              <input
                value={igdbSecret}
                onChange={(e) => onIgdbSecret(e.target.value)}
                aria-label="igdb client secret"
                placeholder="client secret"
                spellCheck={false}
                className={field}
              />
            </div>
          </div>
          <p className="mb-3 text-11 text-text-3">
            optional — without it games come from the steam store, which needs no key but only
            knows what already has a store page
          </p>
        </>
      ) : (
        <p className="mb-3 text-11 text-text-3">
          api keys come from <span className="font-mono text-text-2">.env</span> when running in a
          browser — the desktop app stores them itself
        </p>
      )}

      <div className="mb-3 flex flex-col gap-1.5">
        <button
          type="button"
          onClick={onTest}
          className="self-start rounded-lg border border-line px-2 py-1 text-11 text-text-2 transition-colors duration-150 hover:bg-panel-hover hover:text-text"
        >
          Test keys
        </button>
        {check === 'checking' && <span className="text-11 text-text-3">asking…</span>}
        {check === 'failed' && (
          <span className="text-11 text-text-3">
            the check itself did not answer — nothing is known about the keys yet, try again
          </span>
        )}
        {typeof check === 'object' && check !== null && (
          <>
            <StatusLine label="tmdb" status={check.tmdb} />
            <StatusLine
              label="igdb"
              status={check.igdb}
              missingText="no key saved — games come from steam instead"
            />
            <StatusLine label="steam" status={check.steam} />
          </>
        )}
        {check === null && (
          <span className="text-11 text-text-3">
            films and series need the tmdb key; games work with no key at all
          </span>
        )}
      </div>
    </>
  );
}
