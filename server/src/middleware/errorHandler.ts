import { Request, Response, NextFunction } from 'express';
import type { ApiError } from '../types/index';

export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  const statusCode = 'statusCode' in err ? (err as ApiError & Error).statusCode ?? 500 : 500;
  res.status(statusCode).json({ error: err.message || 'Internal server error' });
}
