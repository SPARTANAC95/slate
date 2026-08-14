export function Toggle({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-start gap-2 py-1">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 size-3.5"
      />
      <span className="flex flex-col">
        <span className="text-12 text-text-2">{label}</span>
        {hint && <span className="text-11 text-text-3">{hint}</span>}
      </span>
    </label>
  );
}
