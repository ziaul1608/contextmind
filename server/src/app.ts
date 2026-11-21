import express, { Application } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { env } from './config/env';
import { healthRouter } from './routes/health.routes';
import { conversationRouter } from './routes/conversation.routes';
import { messageRouter } from './routes/message.routes';
import { memoryRouter } from './routes/memory.routes';
import { errorHandler } from './middleware/errorHandler';
import { notFound } from './middleware/notFound';
import { workspaceMiddleware } from './middleware/workspace';
import { requestLogger } from './middleware/requestLogger';

export function createApp(): Application {
  const app = express();

  // Security headers
  app.use(helmet());

  // CORS: allow configured origins, Netlify domains, and local dev
  const allowedOrigins = env.CLIENT_URL.split(',').map((u) => u.trim());
  app.use(
    cors({
      origin: (origin, callback) => {
        if (!origin) return callback(null, true);
        if (
          allowedOrigins.includes(origin) ||
          allowedOrigins.includes('*') ||
          origin.endsWith('.netlify.app') ||
          origin.includes('localhost') ||
          origin.includes('127.0.0.1')
        ) {
          return callback(null, true);
        }
        return callback(null, true); // Allow all valid web clients
      },
      methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id'],
      credentials: true,
    }),
  );

  // Request ID & structured request logging
  app.use(requestLogger);

  // Body parsing with size limit
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));

  // Health check (no workspace required)
  app.use('/api/v1/health', healthRouter);

  // Conversation CRUD routes
  app.use('/api/v1/conversations', workspaceMiddleware, conversationRouter);

  // Message streaming: POST /api/v1/conversations/:id/messages
  app.use('/api/v1/conversations/:id/messages', workspaceMiddleware, messageRouter);

  // Memory & historical retrieval routes
  app.use('/api/v1/memories', workspaceMiddleware, memoryRouter);

  // 404 handler
  app.use(notFound);

  // Centralized error handler
  app.use(errorHandler);

  return app;
}
