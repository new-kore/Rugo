// Rugo API server: REST + Server-Sent Events. Serves the built web app in production.
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { UPLOAD_DIR, isFresh, flush } from './db.js';
import { routes } from './routes.js';
import { seed } from './seed.js';

if (isFresh) await seed();

const app = express();
app.use(express.json({ limit: '20mb' }));
routes(app);

/* ------------------------------- static ------------------------------- */

app.use('/uploads', express.static(UPLOAD_DIR, { maxAge: '30d', immutable: true }));
const dist = path.resolve('dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get(/^(?!\/api).*/, (_req, res) => res.sendFile(path.join(dist, 'index.html')));
}

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'Something went wrong on our side. Please try again.' });
});

const PORT = Number(process.env.PORT) || 4000;
app.listen(PORT, () => console.log(`Rugo API listening on http://localhost:${PORT}`));
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { flush(); process.exit(0); });
