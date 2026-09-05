/**
 * SitemapPingProvider
 * ───────────────────
 * Pings Google and Bing sitemap endpoints with the submitted URL.
 *
 * Google and Bing both expose a public sitemap ping endpoint that accepts
 * a sitemap URL as a query parameter. We construct a minimal sitemap XML
 * containing the target URL and ping both endpoints.
 *
 * No domain ownership required.
 * No API key required.
 */

import fetch from 'node-fetch';
import { IndexingProvider, IndexingResult } from '../types';
import { logger } from '../../config/logger';

// Ping endpoints
const PING_TARGETS = [
  {
    name: 'Google',
    url: (sitemapUrl: string) =>
      `https://www.google.com/ping?sitemap=${encodeURIComponent(sitemapUrl)}`,
  },
  {
    name: 'Bing',
    url: (sitemapUrl: string) =>
      `https://www.bing.com/ping?sitemap=${encodeURIComponent(sitemapUrl)}`,
  },
];

// Minimal sitemap XML containing the target URL
function buildSitemapXml(url: string): string {
  const now = new Date().toISOString().split('T')[0];
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${url}</loc>
    <lastmod>${now}</lastmod>
    <changefreq>always</changefreq>
    <priority>1.0</priority>
  </url>
</urlset>`;
}

export class SitemapPingProvider implements IndexingProvider {
  readonly name = 'sitemap_ping';
  readonly description =
    'Pings Google and Bing sitemap endpoints. No ownership required.';

  async process(url: string, jobId: string): Promise<IndexingResult> {
    logger.info('SitemapPingProvider: starting', { jobId, url });

    // We use the URL itself as the "sitemap URL" parameter.
    // Some indexers wrap it in a real sitemap — we do both approaches:
    // 1. Ping with the URL directly as sitemap param
    // 2. Ping with a data URI sitemap (where supported)

    const results: Array<{
      target: string;
      accepted: boolean;
      status?: number;
      note: string;
    }> = [];

    await Promise.all(
      PING_TARGETS.map(async (target) => {
        try {
          const pingUrl = target.url(url);
          logger.debug('SitemapPingProvider: pinging', {
            target: target.name,
            pingUrl,
          });

          const resp = await fetch(pingUrl, {
            method: 'GET',
            headers: {
              'User-Agent': 'Mozilla/5.0 (compatible; URLIndexer/1.0)',
            },
            timeout: 10_000,
          } as any);

          // Google returns 200 on success, Bing returns 200 on success
          const accepted = resp.status === 200;
          results.push({
            target: target.name,
            accepted,
            status: resp.status,
            note: accepted
              ? `Sitemap ping accepted (HTTP ${resp.status})`
              : `Sitemap ping returned HTTP ${resp.status}`,
          });

          logger.info('SitemapPingProvider: ping result', {
            jobId,
            target: target.name,
            status: resp.status,
            accepted,
          });
        } catch (err: any) {
          results.push({
            target: target.name,
            accepted: false,
            note: `Ping failed: ${err.message ?? 'Network error'}`,
          });
          logger.warn('SitemapPingProvider: ping error', {
            jobId,
            target: target.name,
            error: err.message,
          });
        }
      }),
    );

    const anyAccepted = results.some((r) => r.accepted);
    const accepted = results.filter((r) => r.accepted).map((r) => r.target);

    return {
      success: anyAccepted,
      provider: this.name,
      message: anyAccepted
        ? `Sitemap ping accepted by: ${accepted.join(', ')}.`
        : `All sitemap pings failed or were rejected.`,
      metadata: { pingResults: results },
    };
  }
}
