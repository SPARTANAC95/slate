import { useState, type ReactNode } from 'react';

type Props = {
  url: string | null;
  className: string;
  alt?: string;
  /** what to draw instead when there is no art, or the url turns out dead */
  fallback?: ReactNode;
  /** for callers that would rather drop the whole row than leave a gap */
  onFail?: () => void;
};

/**
 * A provider's poster url is a claim, not a promise. Steam's portrait capsule
 * is an address built from the app id and simply 404s for most DLC, and any
 * provider's cdn can drop an image years after an entry was added — RAWG's
 * whole API went dark. So every place that draws cover art has to survive a
 * dead url quietly, instead of showing the browser's broken-image icon.
 */
export function CoverArt({ url, className, alt = '', fallback = null, onFail }: Props) {
  // remember *which* url failed, not merely that one did: an entry that swaps
  // a dead poster for a good one keeps this component instance, and a bare
  // boolean would go on hiding the new art
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  if (!url || url === failedUrl) return <>{fallback}</>;
  return (
    <img
      src={url}
      alt={alt}
      loading="lazy"
      // a row is what gets dragged onto a day, never the picture inside it
      draggable={false}
      onError={() => {
        setFailedUrl(url);
        onFail?.();
      }}
      className={className}
    />
  );
}
