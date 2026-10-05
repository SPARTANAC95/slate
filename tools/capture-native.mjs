// Capture the actual native UI, using a dedicated capture application identifier.
// Never connect this script to a personal app/profile. See docs/PRESENTATION.md.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const endpoint = process.env.SLATE_CAPTURE_CDP;
assert(endpoint, 'Set SLATE_CAPTURE_CDP to the isolated native capture app');
const output = path.resolve(process.env.SLATE_CAPTURE_OUTPUT || 'docs/assets');
const sample = JSON.parse(await fs.readFile(new URL('../docs/sample-calendar.json', import.meta.url)));
const browser = await chromium.connectOverCDP(endpoint);
const page = browser.contexts()[0].pages().find(p => p.url().startsWith('http://tauri.localhost'));
assert(page, 'Native Tauri app required');
page.setDefaultTimeout(10000);
const invoke = (cmd, args = {}) => page.evaluate(({cmd, args}) => window.__TAURI_INTERNALS__.invoke(cmd, args), {cmd, args});
const errors = [];
page.on('pageerror', e => errors.push(e.message));
const clock = Date.UTC(2026, 9, 5, 10);
const version = JSON.parse(await fs.readFile(new URL('../package.json', import.meta.url))).version;
const sourceCommit = execFileSync('git', ['log','-1','--format=%H','--','src','src-tauri','package.json','package-lock.json'], {encoding:'utf8'}).trim();
try {
  const backup = await invoke('backup_location');
  assert.equal(await invoke('plugin:app|version'), version, 'Capture binary must match this checkout version');
  assert(/[/\\]com\.slate\.capture[\w.-]*[/\\]/.test(backup), 'Refusing a non-capture profile');
  const google = await invoke('google_status');
  assert.equal(google.configured, false, 'Capture profile must not contain OAuth credentials');
  assert.equal(google.connected, false);
  const old = await invoke('read_backup');
  if (old) assert(JSON.parse(old).entries.every(e => e.id.startsWith('slate-demo-')), 'Only demo data may be replaced');
  // Original fictional sample, moved forward twelve days from its September capture.
  const shift = date => date ? new Date(Date.parse(date + 'T12:00:00Z') + 12 * 86400000).toISOString().slice(0, 10) : date;
  for (const e of sample.entries) {
    e.date = shift(e.date);
    for (const h of e.dateHistory) h.date = shift(h.date);
    e.createdAt = e.updatedAt = clock;
  }
  for (const n of sample.dayNotes) { n.date = shift(n.date); n.updatedAt = clock; }
  sample.exportedAt = clock;
  await page.addInitScript(({clock}) => {
    const RealDate = Date;
    globalThis.Date = class extends RealDate {
      constructor(...args) { super(...(args.length ? args : [clock])); }
      static now() { return clock; }
    };
    localStorage.setItem('slate:notifications', 'off');
    localStorage.setItem('slate:auto-update-check', 'off');
  }, {clock});
  await page.reload();
  // Import through the native backup restore path, in this empty capture profile.
  await page.getByRole('textbox', {name:'quick add',exact:true}).waitFor();
  await page.evaluate(async () => {
    const databases = await indexedDB.databases();
    assertNoPersonalDatabase(databases);
    function assertNoPersonalDatabase(dbs) { if (dbs.some(d => d.name !== 'slate')) throw Error('Unexpected database in capture profile'); }
    const db = await new Promise((resolve, reject) => { const r = indexedDB.open('slate'); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
    const rows = await new Promise((resolve, reject) => { const r = db.transaction('entries').objectStore('entries').getAll(); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
    if (rows.some(e => !e.id.startsWith('slate-demo-'))) throw Error('Unexpected non-demo entry');
    await new Promise((resolve, reject) => { const tx = db.transaction(['entries','dayNotes','googleLinks'], 'readwrite'); for (const name of ['entries','dayNotes','googleLinks']) tx.objectStore(name).clear(); tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); });
    db.close();
  });
  await invoke('write_backup', {json: JSON.stringify(sample)});
  await page.reload();
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setDeviceMetricsOverride', {width:1440,height:960,deviceScaleFactor:1,mobile:false});
  await cdp.send('Emulation.setFocusEmulationEnabled', {enabled:true});
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.getByRole('textbox', {name:'quick add',exact:true}).waitFor();
  await page.getByRole('button', {name:'Restore',exact:true}).click();
  const todayEntry = sample.entries.find(e => e.date === '2026-10-05');
  assert(todayEntry, 'The fictional capture day needs an entry');
  await page.getByText(todayEntry.title, {exact:true}).first().waitFor();
  await page.getByText('restored from the disk backup', {exact:true}).waitFor({state:'hidden'});
  await fs.mkdir(output, {recursive:true});
  const shot = async name => { await page.mouse.move(1439,959); await page.waitForTimeout(250); await page.screenshot({path:path.join(output,name+'.png')}); console.log('Captured '+name); };
  await shot('calendar');
  await page.getByRole('textbox', {name:'quick add',exact:true}).fill('#event cinema tomorrow 20:00');
  await shot('quick-add');
  await page.getByRole('textbox', {name:'quick add',exact:true}).fill('');
  await page.getByRole('textbox', {name:'quick add',exact:true}).blur();
  await page.keyboard.press('b');
  await page.getByRole('complementary', {name:'Backlog'}).waitFor();
  await shot('backlog');
  await page.getByRole('button', {name:'Close backlog',exact:true}).click();
  await page.keyboard.press('u');
  await shot('upcoming');
  await page.keyboard.press('y');
  await shot('year');
  await page.getByRole('button', {name:'Google Calendar sync',exact:true}).click();
  const panel = page.getByRole('region', {name:'Google Calendar sync',exact:true});
  await panel.getByRole('button', {name:'Import credentials JSON',exact:true}).waitFor();
  await panel.screenshot({path:path.join(output,'google-calendar.png')});
  console.log('Captured google-calendar (unconnected setup; no credentials or account)');
  assert.deepEqual(errors, []);
  await fs.writeFile(path.join(output,'capture.json'),JSON.stringify({version,sourceCommit,capturedAt:new Date().toISOString(),clock:'2026-10-05T10:00:00Z',renderer:'Native Windows WebView2; unmodified frontend and backend',profile:'Separate capture application identifier and WebView profile',data:'Fictional docs/sample-calendar.json, dates shifted forward 12 days',google:'Real native unconnected setup; no account or live sync exercised',screenshots:['calendar.png','quick-add.png','backlog.png','upcoming.png','year.png','google-calendar.png'],pageErrors:errors},null,2)+'\n');
} finally { await browser.close(); }
