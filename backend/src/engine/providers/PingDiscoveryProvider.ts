/**
 * PingDiscoveryProvider
 * ---------------------
 * EXPERIMENTAL — first-pass implementation.
 *
 * What this provider does:
 * - Submits the URL to publicly available "ping" / discovery endpoints that
 *   are designed to notify services about new or updated content.
 * - These are standard, documented, public endpoints — no deception, no
 *   bot traffic, no CAPTCHA bypassing.
 *
 * What this provider does NOT guarantee:
 * - That Google or any other search engine will crawl the URL.
 * - That the URL will be indexed.
 * - Any specific response from the pinged services.
 *
 * Current ping targets:
 * - IndexNow (Bing/Yandex) — https://api.indexnow.org
 *
 * Limitations:
 * - IndexNow requires a key file hosted on the target domain for verification.
 *   Without that file, the submission will be accepted (202) but may not be
 *   acted upon until verified. We record whether the ping was accepted.
 * - Google no longer supports the /ping sitemap endpoint as of 2023.
 *   We do NOT fabricate a Google ping.
 *
 * To replace or extend this provider, implement IndexingProvider and register
 * it in IndexingEngine.ts.
 */

import fetch from 'node-fetch';
import { IndexingProvider, IndexingResult } from '../types';
import { logger } from '../../config/logger';

const INDEXNOW_API = 'https://api.indexnow.org/indexnow';
// A demo key — in production this key file must be placed at
// https://<your-target-domain>/<key>.txt for IndexNow verification.
// The key here identifies the submitter, not the target domain.
const INDEXNOW_KEY = 'urlindexer-demo-key-01';

interface PingTarget {
  name: string;
  ping: (url: string) => Promise<{ accepted: boolean; status?: number; note?: string }>;
}

const pingTargets: PingTarget[] = [
  {
    name: 'IndexNow (Bing/Yandex)',
    ping: async (url: string) => {
      try {
        const parsed = new URL(url);
        const body = {
          host: parsed.hostname,
          key: INDEXNOW_KEY,
          urlList: [url],
        };

        const resp = await fetch(INDEXNOW_API, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json; charset=utf-8' },
          body: JSON.stringify(body),
          timeout: 10_000,
        } as any);

        // 200 = OK, 202 = Accepted (key not yet verified but queued)
        const accepted = [200, 202].includes(resp.status);
        return {
          accepted,
          status: resp.status,
          note: accepted
            ? `Ping accepted (HTTP ${resp.status}). IndexNow key verification may be required on the target domain for full activation.`
            : `Ping rejected (HTTP ${resp.status}).`,
        };
      } catch (err: any) {
        return {
          accepted: false,
          note: `IndexNow ping failed: ${err.message ?? 'Network error'}`,
        };
      }
    },
  },
];

export class PingDiscoveryProvider implements IndexingProvider {
  readonly name = 'ping_discovery';
  readonly description =
    'Submits URLs to public discovery/ping endpoints (e.g. IndexNow). ' +
    'Does not guarantee search engine crawling or indexing.';

  async process(url: string, jobId: string): Promise<IndexingResult> {
    logger.info('PingDiscoveryProvider: starting', { jobId, url });

    const results: Array<{ target: string; accepted: boolean; status?: number; note?: string }> = [];

    for (const target of pingTargets) {
      logger.debug('PingDiscoveryProvider: pinging', { target: target.name, url });
      const result = await target.ping(url);
      results.push({ target: target.name, ...result });
      logger.info('PingDiscoveryProvider: ping result', {
        jobId,
        target: target.name,
        accepted: result.accepted,
        status: result.status,
        note: result.note,
      });
    }

    const anyAccepted = results.some((r) => r.accepted);

    const message = anyAccepted
      ? `Discovery pings accepted by ${results.filter((r) => r.accepted).map((r) => r.target).join(', ')}. ` +
        `NOTE: Acceptance does not guarantee crawling or indexing by any search engine.`
      : `No discovery pings were accepted. The URL may still be discoverable through other means.`;

    return {
      success: anyAccepted,
      provider: this.name,
      message,
      metadata: {
        pingResults: results,
        note: 'PROCESSED status means our pipeline completed, not that the URL is indexed by any search engine.',
      },
    };
  }
}
