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

// TMDB / RAWG proxy routes land in M3.

app.listen(PORT, () => {
  console.log(`slate proxy listening on :${PORT}`);
});
