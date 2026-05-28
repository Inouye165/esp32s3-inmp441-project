import express from 'express';
import cors from 'cors';
import path from 'path';
import routes from './routes/index';
import { errorHandler } from './middleware/errorHandler';

export function createApp() {
  const app = express();

  app.use(cors());
  app.use(express.json());

  // Serve uploads directory for module images
  app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

  // Serve original static files (HTML audio streaming dashboard)
  app.use(express.static(path.join(__dirname, '../public')));

  // API routes
  app.use(routes);

  // 404 fallback for unknown API routes
  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'API route not found' });
  });

  app.use(errorHandler);

  return app;
}
