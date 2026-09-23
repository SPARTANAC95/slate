// Isolated, local UI fixture. Not included in the production Vite entry points.
import React from 'react';
import { createRoot } from 'react-dom/client';
import '../src/index.css';
import { GoogleCalendarPanel } from '../src/components/GoogleCalendarPanel';
const status = { configured: true, connected: false, enabled: false, calendarId: '', calendarName: '', mode: 'push' };
Object.assign(window, { __TAURI_INTERNALS__: { invoke: async (cmd: string, args: Record<string, unknown> = {}) => {
  if (cmd === 'google_status') return { ...status };
  if (cmd === 'google_connect') { status.connected = true; return { ...status }; }
  if (cmd === 'google_calendars') return [{ id: 'fixture-calendar', summary: 'Personal calendar', accessRole: 'owner', primary: true }, { id: 'readonly', summary: 'Read-only holidays', accessRole: 'reader' }];
  if (cmd === 'google_select') { Object.assign(status, args); return { ...status }; }
  if (cmd === 'google_disconnect') { status.connected = false; status.enabled = false; return { ...status }; }
  if (cmd === 'google_events') return [];
  throw new Error(`Unexpected fixture command: ${cmd}`);
} } });
createRoot(document.getElementById('root')!).render(<main className="mx-auto mt-12 max-w-[480px] rounded-xl border border-line bg-panel p-4"><p className="mb-4 text-11 text-text-3">UI TEST · simulated Google account</p><GoogleCalendarPanel /></main>);
