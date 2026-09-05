import { config } from './config';
import { logger } from './config/logger';
import { prisma } from './config/prisma';
import { createApp } from './app';
import { workerService } from './services/worker.service';

async function main(): Promise<void> {
  // Verify database connection
  await prisma.$connect();
  logger.info('Database connected');

  const app = createApp();

  const server = app.listen(config.port, () => {
    logger.info(`Server listening on port ${config.port}`, {
      env: config.nodeEnv,
      providers: config.indexing.providers,
    });
  });

  // Start the background worker
  workerService.start();
  logger.info('Background worker started');

  // Graceful shutdown
  const shutdown = async (signal: string): Promise<void> => {
    logger.info(`Received ${signal}, shutting down gracefully`);
    workerService.stop();
    server.close(async () => {
      await prisma.$disconnect();
      logger.info('Server closed');
      process.exit(0);
    });
    // Force exit after 10s
    setTimeout(() => process.exit(1), 10_000).unref();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled promise rejection', { reason });
  });

  process.on('uncaughtException', (err) => {
    logger.error('Uncaught exception', { message: err.message, stack: err.stack });
    process.exit(1);
  });
}

main().catch((err) => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});
