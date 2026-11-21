import { createApp } from './app';
import { env } from './config/env';
import { connectDatabase, disconnectDatabase, prisma } from './config/prisma';
import { initializeWorkspace } from './middleware/workspace';
import { drainBackgroundTasks } from './utils/backgroundTasks';

async function main(): Promise<void> {
  // Connect to database
  await connectDatabase();
  console.log('[ContextMind] Database connected.');

  // Initialize workspace
  await initializeWorkspace();

  const app = createApp();

  const host = process.env.HOST || '0.0.0.0';
  const server = app.listen(env.PORT, host, () => {
    console.log(`[ContextMind] Server running on http://${host}:${env.PORT} (${env.NODE_ENV})`);
  });

  // Graceful shutdown
  async function shutdown(signal: string): Promise<void> {
    console.log(`\n[ContextMind] Received ${signal}, draining background tasks...`);
    await drainBackgroundTasks(5000);
    server.close(async () => {
      await disconnectDatabase();
      console.log('[ContextMind] Server closed.');
      process.exit(0);
    });
  }

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  process.on('unhandledRejection', (reason) => {
    console.error('[ContextMind] Unhandled rejection:', reason);
    process.exit(1);
  });
}

main().catch((err) => {
  console.error('[ContextMind] Fatal startup error:', err);
  process.exit(1);
});
