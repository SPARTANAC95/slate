import express from 'express';
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { prunePlan, snapshotHasData } from './history.js';

const app = express();
const PORT = 8787;
const dataDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data');

app.use(express.json({ limit: '50mb', type: () => true }));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

const backupPath = () => path.join(dataDir, 'slate-backup.json');
const historyDir = () => path.join(dataDir, 'history');

/** history file names, oldest first */
const historyNames = () => {
  try {
    return fs
      .readdirSync(historyDir())
      .filter((n) => n.endsWith('.json'))
      .sort();
  } catch {
    return [];
  }
};

/** a local stamp, like the rust side: `2026-09-02T10-00-00` */
const stamp = () => {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}-${p(d.getMinutes())}-${p(d.getSeconds())}`;
};

// on-disk mirror of the browser database; written atomically. the previous
// version is archived to data/history/ so an empty browser profile can never
// wipe out the only good backup — and an empty snapshot never replaces one
// that has data at all: the only way the database is empty while the backup
// is not is a wiped profile, and that is the moment the backup is for.
app.post('/api/backup', (req, res) => {
  try {
    fs.mkdirSync(dataDir, { recursive: true });
    const dest = backupPath();
    const next = JSON.stringify(req.body, null, 2);

    if (fs.existsSync(dest)) {
      // a corrupt previous file must not block the write — it only feeds
      // the "did anything change" check
      let prevBody = null;
      try {
        prevBody = JSON.parse(fs.readFileSync(dest, 'utf8'));
      } catch {
        prevBody = null;
      }
      if (prevBody && !snapshotHasData(req.body) && snapshotHasData(prevBody)) {
        return res.json({ ok: true, kept: 'empty snapshot kept away from a backup that has data' });
      }
      const changed =
        !prevBody ||
        JSON.stringify({ ...prevBody, exportedAt: 0 }) !==
          JSON.stringify({ ...req.body, exportedAt: 0 });
      if (changed) {
        fs.mkdirSync(historyDir(), { recursive: true });
        fs.copyFileSync(dest, path.join(historyDir(), `slate-backup-${stamp()}.json`));
        for (const f of prunePlan(historyNames())) fs.unlinkSync(path.join(historyDir(), f));
      }
    }

    const tmp = dest + '.tmp';
    fs.writeFileSync(tmp, next);
    fs.renameSync(tmp, dest);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err) });
  }
});

// the best snapshot on disk: the current mirror if it holds anything, else
// the newest history copy that does. what the empty-database restore offer
// is built from. 204 when there is nothing to offer.
app.get('/api/backup', (_req, res) => {
  const read = (p) => {
    try {
      return fs.readFileSync(p, 'utf8');
    } catch {
      return null;
    }
  };
  const current = read(backupPath());
  if (current && snapshotHasData(current)) return res.type('json').send(current);
  for (const name of historyNames().reverse()) {
    const text = read(path.join(historyDir(), name));
    if (text && snapshotHasData(text)) return res.type('json').send(text);
  }
  res.status(204).end();
});

// metadata lookups — a dead provider degrades to empty results, never errors
import { search, currentDate, seasonEpisodes, checkKeys } from './metadata.js';

app.get('/api/key-check', async (_req, res) => {
  res.json(await checkKeys());
});

app.get('/api/search', async (req, res) => {
  const q = String(req.query.q ?? '').trim();
  const kinds = String(req.query.kinds ?? '')
    .split(',')
    .filter((k) => ['film', 'series', 'game'].includes(k));
  if (q.length < 2) return res.json({ results: [] });
  try {
    res.json({ results: await search(q, kinds) });
  } catch {
    res.json({ results: [] });
  }
});

app.get('/api/season', async (req, res) => {
  const { id, season } = req.query;
  if (!id || !season) return res.status(400).json({ ok: false });
  try {
    const episodes = await seasonEpisodes({ id: String(id), season: Number(season) });
    if (!episodes) return res.status(503).json({ ok: false });
    res.json({ ok: true, episodes });
  } catch {
    res.status(502).json({ ok: false });
  }
});

app.get('/api/current-date', async (req, res) => {
  const { source, kind, id, season, episode } = req.query;
  // rawg is retired and answers nothing, but an entry still linked to it may
  // ask — better a clean 503 than a 400 the refresh has to special-case
  if (!id || !['tmdb', 'igdb', 'steam', 'rawg'].includes(source)) {
    return res.status(400).json({ ok: false });
  }
  try {
    const result = await currentDate({
      source,
      kind,
      id: String(id),
      season: season ? Number(season) : undefined,
      episode: episode ? Number(episode) : undefined,
    });
    if (!result) return res.status(503).json({ ok: false });
    res.json({ ok: true, ...result });
  } catch {
    res.status(502).json({ ok: false });
  }
});

app.listen(PORT, '127.0.0.1', () => {
  console.log(`slate proxy listening on http://127.0.0.1:${PORT}`);
});
