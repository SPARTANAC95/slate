import type { ImportPlan } from '../db/transfer';
import { planCounts } from '../db/transfer';

type Props = {
  plan: ImportPlan;
  fileName: string;
  /** the app found the database empty and is offering the disk mirror back */
  restore?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export function ImportDialog({ plan, fileName, restore = false, onConfirm, onCancel }: Props) {
  const c = planCounts(plan);
  const row = (label: string, n: { add: number; update: number; skip: number }) => (
    <li className="flex items-baseline gap-2">
      <span className="w-20 text-12 text-text-2">{label}</span>
      <span className="font-mono text-12 text-text">
        +{n.add} new · {n.update} updated · {n.skip} unchanged
      </span>
    </li>
  );

  return (
    <div className="fixed inset-0 z-30 bg-black/60" onMouseDown={onCancel}>
      <div
        className="panel-lit fade-in mx-auto mt-[20vh] w-[400px] rounded-xl border border-line bg-panel p-4"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="section-label mb-1">{restore ? 'restore' : 'import'}</div>
        {restore && (
          <p className="mb-2 text-13 text-text-2">
            this database is empty, but the disk backup is not — bring it back?
          </p>
        )}
        <p className="mb-3 truncate font-mono text-12 text-text-2">{fileName}</p>
        <ul className="flex flex-col gap-1.5">
          {row('entries', c.entries)}
          {row('day notes', c.notes)}
        </ul>
        <p className="mt-2 text-11 text-text-3">
          {restore
            ? 'nothing here is overwritten — there is nothing here yet'
            : 'merged by id — the newer version of each wins'}
        </p>
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            autoFocus
            onClick={onConfirm}
            className="rounded-lg border border-line-strong bg-panel-hover px-3 py-1 text-12 text-text transition-colors duration-150 hover:bg-panel"
          >
            {restore ? 'Restore' : 'Import'}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg px-2 py-1 text-12 text-text-3 transition-colors duration-150 hover:text-text-2"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
