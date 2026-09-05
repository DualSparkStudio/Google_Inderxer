/**
 * RSS Feed Route
 * GET /rss.xml
 * GET /feed.xml
 */

import { Router, Request, Response } from 'express';
import { rssService } from '../services/rss.service';
import { logger } from '../config/logger';

export const rssRouter = Router();

rssRouter.get(['/rss.xml', '/feed.xml'], async (req: Request, res: Response): Promise<void> => {
  try {
    const bridgeHost = process.env['BRIDGE_HOST'] ?? 'index.dualsparkstudio.com';
    const xml = await rssService.generateRssXml(bridgeHost);

    const ua = req.headers['user-agent'] ?? '';
    logger.info('RSS: Feed requested', { userAgent: ua, ip: req.ip });

    res.setHeader('Content-Type', 'application/rss+xml; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=60');
    res.status(200).send(xml);
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    logger.error('RSS: Failed to generate feed', { error: errorMsg });
    res.status(500).send('Error generating RSS feed');
  }
});
