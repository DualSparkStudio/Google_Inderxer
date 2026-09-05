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

  // Detect Googlebot or other search engine crawlers by User-Agent
  const ua = req.headers['user-agent'] ?? '';
  const isGooglebot = /googlebot|google-inspectiontool|google/i.test(ua);
  const isCrawler = /googlebot|google-inspectiontool|google|bingbot|yandex|duckduckbot|slurp|baiduspider/i.test(ua);

  if (!page.crawled) {
    logger.info('Bridge: Page visited by crawler/client', {
      id,
      targetUrl: page.targetUrl,
      isGooglebot,
      isCrawler,
      userAgent: ua,
    });
    bridgeService.markCrawled(id as string).catch((err) => {
      logger.error('Bridge: Failed to mark page as crawled', { id, error: err?.message });
    });
  }

  // Fast-Redirect: HTTP 302 Found (or 301) tells Googlebot to immediately fetch targetUrl in the same pass
  const redirectStatus = process.env['BRIDGE_REDIRECT_STATUS'] === '301' ? 301 : 302;

  res.setHeader('Location', page.targetUrl);
  res.setHeader('Link', `<${page.targetUrl}>; rel="canonical"`);
  res.setHeader('X-Robots-Tag', 'index, follow');
  res.setHeader('Refresh', `0; url=${page.targetUrl}`);
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Content-Type', 'text/html; charset=utf-8');

  const html = bridgeService.buildHtml(page.targetUrl, id as string);
  res.status(redirectStatus).send(html);
});
