const SHORTCUTS: [string[], string][] = [
  [['ctrl', 'k'], 'command palette'],
  [['n'], 'quick add'],
  [['/'], 'search'],
  [['←', '→'], 'previous / next day'],
  [['↑', '↓'], 'previous / next week'],
  [['shift', '←'], 'previous / next month'],
  [['t'], 'today'],
  [['y'], 'year view'],
  [['b'], 'backlog'],
  [['esc'], 'close'],
  [['?'], 'this sheet'],
];

export function HelpSheet({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-30 bg-black/60" onMouseDown={onClose}>
      <div
        className="panel-lit fade-in mx-auto mt-[18vh] w-[360px] rounded-xl border border-line bg-panel p-4"
        onMouseDown={(e) => e.stopPropagation()}
      >
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
