import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';

declare global {
  namespace Express {
    interface Request {
      requestId: string;
    }
  }
}

/**
 * Structured request logging and request-ID propagation middleware.
 * Ensures every incoming request has an identifiable x-request-id for observability.
 * Omits sensitive request payloads to ensure zero credential or user secret leakage in logs.
 */
export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const existingId = req.headers['x-request-id'];
  const requestId =
    typeof existingId === 'string' && existingId.trim().length > 0
      ? existingId.trim()
      : randomUUID();

  req.requestId = requestId;
  res.setHeader('x-request-id', requestId);

  const start = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - start;
    const { method, originalUrl } = req;
    const { statusCode } = res;

    // Do not log noisy health check pollings in test/dev unless error
    if (originalUrl === '/api/v1/health' && statusCode === 200) {
      return;
    }

    console.log(
      JSON.stringify({
        level: statusCode >= 500 ? 'error' : statusCode >= 400 ? 'warn' : 'info',
        type: 'http_request',
        requestId,
        method,
        url: originalUrl,
        statusCode,
        durationMs: duration,
        timestamp: new Date().toISOString(),
      }),
    );
  });

  next();
}
