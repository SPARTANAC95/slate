import express from 'express';
import 'dotenv/config';

const app = express();
const PORT = 8787;

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

// TMDB / RAWG proxy routes land in M3.

app.listen(PORT, () => {
  console.log(`slate proxy listening on :${PORT}`);
});
