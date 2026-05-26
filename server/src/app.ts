import express from 'express';
import cors from 'cors';
import path from 'path';
import routes from './routes/index';
import { errorHandler } from './middleware/errorHandler';

export function createApp() {
  const app = express();

  app.use(cors());
  app.use(express.json());

  // Serve static frontend files (JS, CSS, images) with normal caching.
  // index: false so index.html is NOT served here — it gets no-store below.
  app.use(express.static(path.join(__dirname, '../public'), { index: false }));

  // API routes
  app.use(routes);

  // 404 fallback for unknown API routes
  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'API route not found' });
  });

  // Serve index.html for all other paths (SPA fallback).
  // no-store prevents Chrome from caching the shell — fixes the "paste URL
  // and nothing happens until hard-reload" symptom.
  app.get('*', (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.sendFile(path.join(__dirname, '../public/index.html'));
  });

  app.use(errorHandler);

  return app;
}
