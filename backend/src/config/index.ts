import dotenv from 'dotenv';
import path from 'path';

// Load .env from backend root
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

function required(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`Missing required environment variable: ${key}`);
  return val;
}

function optional(key: string, fallback: string): string {
  return process.env[key] ?? fallback;
}

export const config = {
  nodeEnv: optional('NODE_ENV', 'development'),
  port: parseInt(optional('PORT', '4000'), 10),

  db: {
    url: required('DATABASE_URL'),
  },

  jwt: {
    secret: required('JWT_SECRET'),
    expiresIn: optional('JWT_EXPIRES_IN', '7d'),
  },

  cors: {
    frontendUrl: optional('FRONTEND_URL', 'http://localhost:3000'),
  },

  indexing: {
    // Comma-separated list of enabled providers
    providers: optional('INDEXING_PROVIDERS', 'ping_discovery')
      .split(',')
      .map((p) => p.trim())
      .filter(Boolean),
  },

  redis: {
    url: process.env['REDIS_URL'] ?? null,
  },

  isDev: optional('NODE_ENV', 'development') === 'development',
  isProd: process.env['NODE_ENV'] === 'production',
} as const;
