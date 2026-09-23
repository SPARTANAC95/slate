import { useMemo, useState } from 'react';
import type { Entry } from '../types';
import { monthName, nextAnnualOccurrence } from '../lib/dates';

type Props = {
  entries: Entry[];
  year: number;
  onJumpToDay: (iso: string) => void;
};

type DayInfo = { logged: string[]; scheduled: string[] };
type Tip = { iso: string; info: DayInfo; x: number; y: number };

/** logged days step up in brightness; merely scheduled days stay dim */
const LOGGED = ['', 'bg-white/25', 'bg-white/45', 'bg-white/70'];
const EMPTY = 'bg-white/[0.045]';
const SCHEDULED = 'bg-white/[0.11]';

const iso = (y: number, m: number, d: number) =>
  `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

export function YearView({ entries, year, onJumpToDay }: Props) {
  const [tip, setTip] = useState<Tip | null>(null);

  const byDay = useMemo(() => {
    const map = new Map<string, DayInfo>();
    const push = (date: string, title: string, done: boolean) => {
      if (!date.startsWith(`${year}-`)) return;
      const cur = map.get(date) ?? { logged: [], scheduled: [] };
      (done ? cur.logged : cur.scheduled).push(title);
      map.set(date, cur);
    };
    for (const e of entries) {
      if (typeof e.date !== 'string') continue;
      if (e.annual) {
        // a recurring entry is never "logged" — one done flag can't belong
        // to every year it appears in
        push(nextAnnualOccurrence(e.date, new Date(year, 0, 1)), e.title, false);
      } else {
        push(e.date, e.title, e.done);
      }
    }
    return map;
  }, [entries, year]);

  const totals = useMemo(() => {
    let logged = 0;
    let scheduled = 0;
    for (const info of byDay.values()) {
      logged += info.logged.length;
      scheduled += info.scheduled.length;
    }
    return { logged, scheduled };
  }, [byDay]);

  const show = (el: HTMLElement, dayISO: string, info: DayInfo) => {
    const r = el.getBoundingClientRect();
    setTip({ iso: dayISO, info, x: r.left + r.width / 2, y: r.top });
  };

  return (
    <div className="fade-in flex min-h-0 min-w-0 flex-1 flex-col px-1">
      <p className="mb-4 text-center font-mono text-12 text-text-3">
        {totals.logged} logged
        {totals.scheduled > 0 && ` · ${totals.scheduled} scheduled`}
      </p>
      <div className="flex min-h-0 flex-1 overflow-auto">
        <div className="m-auto flex gap-6 pb-4">
          {Array.from({ length: 12 }, (_, m) => {
            const daysInMonth = new Date(year, m + 1, 0).getDate();
            return (
              <div key={m} className="flex flex-col items-center gap-2">
                <div className="section-label">{monthName(m).slice(0, 3)}</div>
                <div className="flex flex-col gap-[3px]">
                  {Array.from({ length: daysInMonth }, (_, d) => {
                    const dayISO = iso(year, m, d + 1);
                    const info = byDay.get(dayISO) ?? { logged: [], scheduled: [] };
                    const tone =
                      info.logged.length > 0
                        ? LOGGED[Math.min(info.logged.length, 3)]
                        : info.scheduled.length > 0
                          ? SCHEDULED
                          : EMPTY;
                    const count = info.logged.length + info.scheduled.length;
                    return (
                      <button
                        key={d}
                        type="button"
                        aria-label={`${dayISO}${count ? ` — ${info.logged.length} logged, ${info.scheduled.length} scheduled` : ''}`}
                        onClick={() => onJumpToDay(dayISO)}
                        onMouseEnter={(e) => show(e.currentTarget, dayISO, info)}
                        onMouseLeave={() => setTip(null)}
                        onFocus={(e) => show(e.currentTarget, dayISO, info)}
                        onBlur={() => setTip(null)}
                        className={`size-(--size-square) rounded-[3px] transition-colors duration-150 ${tone} ${
                          count === 0 ? 'hover:bg-white/15' : 'hover:bg-white/80'
                        }`}
                      />
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      {tip && <YearTooltip tip={tip} />}
    </div>
  );
}

function YearTooltip({ tip }: { tip: Tip }) {
  const { logged, scheduled } = tip.info;
  return (
    <div
      className="panel-lit pointer-events-none fixed z-20 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-lg border border-line bg-panel px-2.5 py-1.5"
      style={{ left: tip.x, top: tip.y - 6 }}
    >
      <div className="font-mono text-11 text-text-3">{tip.iso}</div>
      {logged.map((t, i) => (
        <div key={`l${i}`} className="text-12 text-text">
          {t}
        </div>
      ))}
      {scheduled.map((t, i) => (
        <div key={`s${i}`} className="text-12 text-text-2">
          {t} <span className="text-text-3">· scheduled</span>
        </div>
      ))}
      {logged.length === 0 && scheduled.length === 0 && (
        <div className="text-12 text-text-3">nothing logged</div>
      )}
    </div>
  );
}
