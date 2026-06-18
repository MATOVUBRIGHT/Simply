import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';

const SLOW_REQUEST_MS = Number(process.env.SLOW_REQUEST_MS || 750);

export function requestPerformanceLogger(req: Request, res: Response, next: NextFunction) {
  const startedAt = process.hrtime.bigint();
  const startMemory = process.memoryUsage().heapUsed;

  res.on('finish', () => {
    const elapsedMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
    if (elapsedMs >= SLOW_REQUEST_MS) {
      const heapDeltaMb = (process.memoryUsage().heapUsed - startMemory) / 1024 / 1024;
      console.warn(JSON.stringify({
        event: 'slow_api_request',
        method: req.method,
        path: req.originalUrl,
        status: res.statusCode,
        elapsedMs: Math.round(elapsedMs),
        heapDeltaMb: Number(heapDeltaMb.toFixed(2)),
      }));
    }
  });

  next();
}

export function httpCacheHeaders(req: Request, res: Response, next: NextFunction) {
  if (req.method !== 'GET') {
    res.setHeader('Cache-Control', 'no-store');
    return next();
  }

  const ttl = req.originalUrl.includes('/dashboard') ? 15 : 60;
  res.setHeader('Cache-Control', `private, max-age=${ttl}, stale-while-revalidate=300`);
  res.setHeader('Vary', 'Authorization, Accept-Encoding');

  const originalJson = res.json.bind(res);
  res.json = (body: unknown) => {
    const payload = JSON.stringify(body);
    const etag = `"${crypto.createHash('sha1').update(payload).digest('base64url')}"`;
    res.setHeader('ETag', etag);
    if (req.headers['if-none-match'] === etag) {
      return res.status(304).end() as Response;
    }
    return originalJson(body);
  };

  next();
}
