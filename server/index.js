import express from 'express';
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const app = express();
const PORT = 8787;
const dataDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data');

app.use(express.json({ limit: '50mb', type: () => true }));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

// on-disk mirror of the browser database; written atomically.
// the previous version is archived to data/history/ so an empty browser
// profile can never wipe out the only good backup. last 20 kept.
app.post('/api/backup', (req, res) => {
  try {
    fs.mkdirSync(dataDir, { recursive: true });
    const dest = path.join(dataDir, 'slate-backup.json');
    const next = JSON.stringify(req.body, null, 2);

    if (fs.existsSync(dest)) {
      const prev = fs.readFileSync(dest, 'utf8');
      const changed =
        JSON.stringify({ ...JSON.parse(prev), exportedAt: 0 }) !==
        JSON.stringify({ ...req.body, exportedAt: 0 });
      if (changed) {
        const histDir = path.join(dataDir, 'history');
        fs.mkdirSync(histDir, { recursive: true });
        const stamp = new Date().toISOString().replace(/[:.]/g, '-');
        fs.copyFileSync(dest, path.join(histDir, `slate-backup-${stamp}.json`));
        const old = fs.readdirSync(histDir).sort();
        for (const f of old.slice(0, Math.max(0, old.length - 20))) {
          fs.unlinkSync(path.join(histDir, f));
        }
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

// metadata lookups — a dead provider degrades to empty results, never errors
import { search, currentDate } from './metadata.js';

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

app.get('/api/current-date', async (req, res) => {
  const { source, kind, id, season, episode } = req.query;
  if (!id || !['tmdb', 'rawg'].includes(source)) {
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

app.listen(PORT, () => {
  console.log(`slate proxy listening on :${PORT}`);
});
