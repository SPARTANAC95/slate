// Browser-only fixture. Never included in the production entry point.
import React from 'react';
import ReactDOM from 'react-dom/client';
import { mockIPC } from '@tauri-apps/api/mocks';
import App from '../src/App';
import '@fontsource-variable/inter';
import '@fontsource-variable/jetbrains-mono';
import '../src/index.css';

const fixture = {
  mode: 'available',
  calls: [] as string[],
  backups: [] as string[],
  continueDownload: null as null | (() => void),
};
Object.assign(window, { updaterFixture: fixture });
localStorage.setItem('slate:auto-update-check', 'off');
mockIPC(async (command, payload: any) => {
  fixture.calls.push(command);
  if (command === 'plugin:updater|check') {
    if (fixture.mode === 'offline') throw new Error('offline');
    if (fixture.mode === 'current') return null;
    return { rid: 10, currentVersion: '0.1.1', version: '0.2.0', body: 'Test release: calendar improvements.\nA second line of release notes.', rawJson: {} };
  }
  if (command === 'plugin:updater|download') {
    if (fixture.mode === 'bad-signature') throw new Error('invalid signature');
    payload.onEvent.onmessage({ event: 'Started', data: { contentLength: 1024 } });
    payload.onEvent.onmessage({ event: 'Progress', data: { chunkLength: 512 } });
    await new Promise<void>(resolve => { fixture.continueDownload = resolve; });
    payload.onEvent.onmessage({ event: 'Progress', data: { chunkLength: 512 } });
    payload.onEvent.onmessage({ event: 'Finished' });
    return 11;
  }
  if (command === 'plugin:updater|install') {
    if (fixture.mode === 'installer-error') throw new Error('installer failed');
    return;
  }
  if (command === 'write_backup') {
    if (fixture.mode === 'backup-error') throw new Error('disk full');
    fixture.backups.push(payload.json); return;
  }
  if (command === 'read_backup') return null;
  if (command === 'get_api_keys') return { tmdb: '', igdbId: '', igdbSecret: '' };
  if (command === 'backup_location') return 'Test profile / slate-backup.json';
  if (command === 'plugin:autostart|is_enabled') return false;
  if (command === 'plugin:event|listen') return 1;
  if (command === 'google_status') return { connected: false, configured: false };
  if (command === 'plugin:notification|is_permission_granted') return false;
  if (command === 'plugin:resources|close') return;
  return null;
});
ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);
