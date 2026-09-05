/**
 * WebSubProvider (PubSubHubbub)
 * ─────────────────────────────
 * Notifies WebSub hubs that a URL has been updated.
 *
 * WebSub (formerly PubSubHubbub) is a W3C protocol that allows publishers
 * to push content updates to subscribers. Google actively subscribes to
 * major WebSub hubs, so notifying them that a URL has new content is a
 * legitimate and effective discovery signal.
 *
 * No API key required.
 * No domain ownership required.
 * Works on any public URL.
 *
 * Hubs notified:
 * - pubsubhubbub.appspot.com (Google's own hub — most direct signal)
 * - hub.pubsubhubbub.com
 * - websubhub.com
 */

import fetch from 'node-fetch';
import { IndexingProvider, IndexingResult } from '../types';
import { logger } from '../../config/logger';

const WEBSUB_HUBS = [
  'https://pubsubhubbub.appspot.com/',   // Google's own hub
  'https://hub.pubsubhubbub.com/',
  'https://websubhub.com/hub',
];

export class WebSubProvider implements IndexingProvider {
  readonly name = 'websub';
  readonly description =
    'Notifies WebSub/PubSubHubbub hubs about URL updates. ' +
    'Google subscribes to these hubs — no ownership or API key required.';

  async process(url: string, jobId: string): Promise<IndexingResult> {
    logger.info('WebSubProvider: starting', { jobId, url });

    const results: Array<{
      hub: string;
      accepted: boolean;
      status?: number;
      note: string;
    }> = [];

    await Promise.all(
      WEBSUB_HUBS.map(async (hub) => {
        try {
          // WebSub publish notification — standard POST with form body
          const body = new URLSearchParams({
            'hub.mode': 'publish',
            'hub.url': url,
          });

          logger.debug('WebSubProvider: notifying hub', { hub, url });

          const resp = await fetch(hub, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
              'User-Agent': 'Mozilla/5.0 (compatible; URLIndexer/1.0)',
            },
            body: body.toString(),
            timeout: 10_000,
          } as any);

          // 200 or 204 = accepted
          const accepted = [200, 204].includes(resp.status);

          results.push({
            hub,
            accepted,
            status: resp.status,
            note: accepted
              ? `Hub notified (HTTP ${resp.status})`
              : `Hub returned HTTP ${resp.status}`,
          });

          logger.info('WebSubProvider: hub result', {
            jobId,
            hub,
            status: resp.status,
            accepted,
          });
        } catch (err: any) {
          results.push({
            hub,
            accepted: false,
            note: `Notification failed: ${err.message ?? 'Network error'}`,
          });
          logger.warn('WebSubProvider: hub error', {
            jobId,
            hub,
            error: err.message,
          });
        }
      }),
    );

    const accepted = results.filter((r) => r.accepted);
    const anyAccepted = accepted.length > 0;

    return {
      success: anyAccepted,
      provider: this.name,
      message: anyAccepted
        ? `WebSub hubs notified: ${accepted.length}/${results.length} accepted.`
        : `No WebSub hubs accepted the notification.`,
      metadata: { hubResults: results },
    };
  }
}
