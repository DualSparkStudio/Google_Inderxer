/**
 * Bridge page serving route
 * GET /bridge/:id
 *
 * Serves temporary HTML pages that link to target URLs.
 * Googlebot crawls these pages via the Indexing API and follows
 * the link to discover the target URL.
 *
 * When Googlebot hits this route, we mark the page as crawled.
 */

import { Router, Request, Response } from 'express';
import { bridgeService } from '../services/bridge.service';
import { logger } from '../config/logger';

export const bridgeRouter = Router();

// Google Search Console domain verification
bridgeRouter.get('/', (_req: Request, res: Response): void => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.status(200).send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="google-site-verification" content="plHz5KQ-pN7BmWuMnXGhYYj5Fe7Ev8rNZcF6srgYgtg">
  <title>URL Indexer Bridge</title>
</head>
<body><p>URL Indexer Bridge Service</p></body>
</html>`);
});

bridgeRouter.get('/:id', async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;

  const page = await bridgeService.get(id as string);

  if (!page) {
    res.status(404).send('Not found');
    return;
  }

  // Detect Googlebot by User-Agent and mark as crawled
  const ua = req.headers['user-agent'] ?? '';
  const isGooglebot = /googlebot|google-inspectiontool|google/i.test(ua);

  if (isGooglebot && !page.crawled) {
    logger.info('Bridge: Googlebot crawled page', {
      id,
      targetUrl: page.targetUrl,
      userAgent: ua,
    });
    bridgeService.markCrawled(id as string).catch(() => {});
  }

  const html = bridgeService.buildHtml(page.targetUrl, id as string);

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('X-Robots-Tag', 'index, follow');
  res.status(200).send(html);
});
