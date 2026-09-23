import { useEffect, useState } from 'react';

/** each example demonstrates a different piece of the quick-add syntax */
const EXAMPLES = [
  'new season s3e1 sunday',
  'album drop oct 22',
  '#game dlc release 19.11.',
  'renew passport in 5 days',
  'anniversary 4.7. every year',
  '#film premiere dec 18 2026',
  'match tomorrow 20:45',
  '#event dinner friday at 8pm',
];

/** cycles the placeholder example with a short fade between swaps */
export function useRotatingExample(intervalMs = 4000): { text: string; fading: boolean } {
  const [index, setIndex] = useState(0);
  const [fading, setFading] = useState(false);

  useEffect(() => {
    let swap: ReturnType<typeof setTimeout> | null = null;
    const tick = setInterval(() => {
      setFading(true);
      swap = setTimeout(() => {
        setIndex((i) => (i + 1) % EXAMPLES.length);
        setFading(false);
      }, 160);
    }, intervalMs);
    return () => {
      clearInterval(tick);
      if (swap) clearTimeout(swap);
    };
  }, [intervalMs]);

  return { text: EXAMPLES[index], fading };
}
