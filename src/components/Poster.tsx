import { useState } from 'react';
import type { Entry } from '../types';

type Size = 'row' | 'rail';

const BOX: Record<Size, string> = {
  row: 'h-[38px] w-[26px]',
  rail: 'h-[46px] w-[31px]',
};

/**
 * Cover art for entries that came from an API. Falls back to an empty
 * hairline box so rows keep their rhythm whether or not art exists.
 */
export function Poster({ entry, size }: { entry: Entry; size: Size }) {
  const [failed, setFailed] = useState(false);
  const url = entry.external?.posterUrl ?? null;

  // no art is not a gap to fill — the kind dot already identifies the row
  if (!url || failed) return null;
  return (
    <img
      src={url}
      alt=""
      loading="lazy"
      onError={() => setFailed(true)}
      className={`${BOX[size]} shrink-0 rounded-[4px] border border-line object-cover ${
        entry.done ? 'opacity-50' : ''
      }`}
    />
  );
}
