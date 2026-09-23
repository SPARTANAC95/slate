const SHORTCUTS: [string[], string][] = [
  [['ctrl', 'k'], 'command palette'],
  [['n'], 'quick add'],
  [['alt', '↵'], 'add with only that cover art'],
  [['/'], 'search'],
  [['←', '→'], 'previous / next day'],
  [['↑', '↓'], 'previous / next week'],
  [['shift', '←'], 'previous / next month'],
  [['t'], 'today'],
  [['y'], 'year view'],
  [['u'], 'upcoming — countdowns for everything'],
  [['b'], 'backlog'],
  [['esc'], 'close'],
  [['?'], 'this sheet'],
];

/** what the quick-add box understands — the app's other half of the input */
const SYNTAX: [string, string][] = [
  ['tomorrow · friday · 19.11. · dec 18', 'when'],
  ['20:45 · at 8pm', 'what time'],
  ['s3e1', 'season and episode'],
  ['s3', 'every episode of a season'],
  ['#film #game #task', 'what kind of thing'],
  ['#hype', 'any other tag'],
  ['every year', 'repeats annually'],
];

export function HelpSheet({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-30 bg-black/60" onMouseDown={onClose}>
      <div
        className="panel-lit fade-in mx-auto mt-[12vh] max-h-[76vh] w-[380px] overflow-y-auto rounded-xl border border-line bg-panel p-4"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="section-label mb-3">typing into quick add</div>
        <ul className="mb-4 flex flex-col gap-1.5">
          {SYNTAX.map(([token, meaning]) => (
            <li key={token} className="flex items-baseline gap-2">
              <span className="shrink-0 font-mono text-11 text-text-2">{token}</span>
              <span className="text-11 text-text-3">{meaning}</span>
            </li>
          ))}
        </ul>

        <div className="section-label mb-3">keyboard shortcuts</div>
        <ul className="flex flex-col gap-2">
          {SHORTCUTS.map(([keys, label]) => (
            <li key={label} className="flex items-center gap-2">
              <span className="flex w-24 shrink-0 gap-1">
                {keys.map((k) => (
                  <kbd
                    key={k}
                    className="rounded-[5px] border border-line bg-panel-hover px-1.5 py-0.5 font-mono text-11 text-text-2"
                  >
                    {k}
                  </kbd>
                ))}
              </span>
              <span className="text-12 text-text-2">{label}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
