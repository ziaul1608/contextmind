import { Response } from 'express';

/**
 * Writes a typed SSE event to the response.
 * Format: event: <name>\ndata: <json>\n\n
 */
export function writeSseEvent(
  res: Response,
  event: string,
  data: Record<string, unknown>,
): void {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

/**
 * Sets SSE headers on the response.
 */
export function setSseHeaders(res: Response): void {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering
  res.flushHeaders();
}
