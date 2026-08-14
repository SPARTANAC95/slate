import { HardDrive, HardDriveDownload } from 'lucide-react';
import type { BackupStatus } from '../db/backup';

const TEXT: Record<BackupStatus['state'], string> = {
  idle: 'backup pending',
  saving: 'saving to disk…',
  saved: 'backed up to disk',
  unavailable: 'not backing up — disk copy unavailable',
};

/**
 * The disk backup is a silent safety net, so its absence has to be
 * visible: a dim dot when it's working, a legible warning when it isn't.
 */
export function BackupIndicator({ status }: { status: BackupStatus }) {
  const broken = status.state === 'unavailable';
  const time =
    status.state === 'saved'
      ? new Date(status.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      : null;

  return (
    <span
      title={time ? `${TEXT.saved} at ${time}` : TEXT[status.state]}
      aria-label={TEXT[status.state]}
      className={`flex shrink-0 items-center gap-1.5 rounded-lg px-1.5 py-1 text-11 ${
        broken ? 'border border-line-strong text-text-2' : 'text-text-3'
      }`}
    >
      {broken ? <HardDriveDownload size={13} /> : <HardDrive size={13} />}
      {broken && <span>no disk backup</span>}
      {status.state === 'saved' && <span className="font-mono">{time}</span>}
    </span>
  );
}
