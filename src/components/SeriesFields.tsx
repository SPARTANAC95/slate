type Props = {
  season: number;
  episode: number;
  onSeason: (n: number) => void;
  onEpisode: (n: number) => void;
  className: string;
};

/**
 * An emptied number box reads as NaN. Show it empty so a new number can be
 * typed; the form turns it back into 1 on save rather than storing `sNaN`.
 */
const shown = (n: number): number | '' => (Number.isFinite(n) ? n : '');

/** the s/e pair, shown only while the entry is a series */
export function SeriesFields({ season, episode, onSeason, onEpisode, className }: Props) {
  return (
    <div className="flex items-center gap-2 font-mono text-12 text-text-2">
      <label className="flex items-center gap-1.5">
        s
        <input
          type="number"
          min={1}
          value={shown(season)}
          onChange={(e) => onSeason(Number(e.target.value))}
          aria-label="season"
          className={`${className} w-14 font-mono text-12`}
        />
      </label>
      <label className="flex items-center gap-1.5">
        e
        <input
          type="number"
          min={1}
          value={shown(episode)}
          onChange={(e) => onEpisode(Number(e.target.value))}
          aria-label="episode"
          className={`${className} w-14 font-mono text-12`}
        />
      </label>
    </div>
  );
}
