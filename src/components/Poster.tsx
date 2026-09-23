import type { Entry } from '../types';
import { CoverArt } from './CoverArt';

type Size = 'row' | 'rail';

// 2:3, the poster ratio every provider ships. Big enough to recognise a
// cover at a glance — that is the whole reason the art is here.
const BOX: Record<Size, string> = {
  row: 'h-[51px] w-[34px]',
  rail: 'h-[69px] w-[46px]',
};

/**
 * Cover art for entries that came from an API. No art is not a gap to fill —
 * the kind dot already identifies the row — so a missing or dead poster
 * simply leaves nothing behind.
 */
export function Poster({ entry, size }: { entry: Entry; size: Size }) {
  return (
    <CoverArt
      url={entry.external?.posterUrl ?? null}
      className={`${BOX[size]} shrink-0 rounded-[5px] border border-line object-cover ${
        entry.done ? 'opacity-50' : ''
      }`}
    />
  );
}
