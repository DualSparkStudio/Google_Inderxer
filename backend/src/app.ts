import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { config } from './config';
import { requestLogger } from './middleware/requestLogger';
import { apiLimiter } from './middleware/rateLimiter';
import { errorHandler } from './middleware/errorHandler';

// Route imports (filled in as we build each module)
import { authRouter } from './routes/auth';
import { urlsRouter } from './routes/urls';
import { healthRouter } from './routes/health';
import { bridgeRouter } from './routes/bridge';

export function createApp(): express.Application {
  const app = express();

  // ── Security headers ──────────────────────────────────────────────────────
  app.use(helmet());

  // ── CORS ──────────────────────────────────────────────────────────────────
  app.use(
    cors({
      origin: config.cors.frontendUrl,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
    }),
  );

  // ── Body parsing (limit request size) ────────────────────────────────────
  app.use(express.json({ limit: '50kb' }));
  app.use(express.urlencoded({ extended: true, limit: '50kb' }));

  // ── Request logging ───────────────────────────────────────────────────────
  app.use(requestLogger);

  // ── Global rate limiter ───────────────────────────────────────────────────
  app.use('/api', apiLimiter);

  // ── Routes ────────────────────────────────────────────────────────────────
  app.use('/api/health', healthRouter);
  app.use('/api/auth', authRouter);
  app.use('/api/urls', urlsRouter);
  app.use('/bridge', bridgeRouter); // Bridge pages for Google crawling (no auth)

  // ── Root route — Google Search Console verification for index subdomain ───
  app.get('/', (_req, res) => {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.status(200).send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="google-site-verification" content="plHz5KQ-pN7BmWuMnXGhYYj5Fe7Ev8rNZcF6srgYgtg">
  <title>URL Indexer</title>
</head>
<body><p>URL Indexer Service</p></body>
</html>`);
  });

  // ── 404 handler ───────────────────────────────────────────────────────────
  app.use((_req, res) => {
    res.status(404).json({ success: false, error: 'Route not found.' });
  });

  // ── Global error handler ──────────────────────────────────────────────────
  app.use(errorHandler);

  return app;
}
