import { Cloud, CloudOff, LoaderCircle } from 'lucide-react';
import { useEffect, useState } from 'react';
import { getGoogleProgress, watchGoogleProgress } from '../db/googleSync';

export function GoogleSyncIndicator({ onClick }: { onClick: () => void }) {
  const [progress, setProgress] = useState(getGoogleProgress);
  useEffect(() => watchGoogleProgress(setProgress), []);
  const Icon = progress.state === 'syncing' ? LoaderCircle : progress.state === 'error' ? CloudOff : Cloud;
  return <button type="button" aria-label="Google Calendar sync" title={progress.message} onClick={onClick} className="mr-1 rounded-lg border border-line p-1.5 text-text-3 hover:bg-panel-hover hover:text-text">
    <Icon size={14} className={progress.state === 'syncing' ? 'animate-spin' : ''} />
  </button>;
}
