import { Router } from 'express';
import path from 'path';
import apiRouter from './api';

const router = Router();
router.use('/api', apiRouter);

// Serve module detail page
router.get('/module', (_req, res) => {
  res.sendFile(path.join(__dirname, '../../public/module.html'));
});

export default router;
