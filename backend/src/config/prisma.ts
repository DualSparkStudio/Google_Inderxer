import { PrismaClient } from '@prisma/client';
import { logger } from './logger';

// Singleton Prisma client — safe for both dev (hot reload) and prod
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log:
      process.env['NODE_ENV'] === 'development'
        ? [
            { emit: 'event', level: 'query' },
            { emit: 'event', level: 'error' },
            { emit: 'event', level: 'warn' },
          ]
        : [{ emit: 'event', level: 'error' }],
  });

if (process.env['NODE_ENV'] === 'development') {
  (prisma as any).$on('query', (e: any) => {
    logger.debug('Prisma query', { query: e.query, duration: `${e.duration}ms` });
  });
}

(prisma as any).$on('error', (e: any) => {
  logger.error('Prisma error', { message: e.message });
});

if (process.env['NODE_ENV'] !== 'production') {
  globalForPrisma.prisma = prisma;
}
