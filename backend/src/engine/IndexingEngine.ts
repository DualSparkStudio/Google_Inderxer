/**
 * IndexingEngine
 * ──────────────
 * Orchestrates URL processing through one or more IndexingProviders.
 *
 * Providers are registered at startup based on the INDEXING_PROVIDERS
 * environment variable. The engine tries the first enabled provider;
 * additional provider chaining can be added here as requirements evolve.
 *
 * To add a new provider:
 * 1. Implement IndexingProvider in engine/providers/
 * 2. Import and register it below in the PROVIDER_REGISTRY
 * 3. Add its name to INDEXING_PROVIDERS in your .env
 */

import { IndexingProvider, IndexingResult } from './types';
import { GoogleIndexingProvider } from './providers/GoogleIndexingProvider';
import { GoogleBridgeProvider } from './providers/GoogleBridgeProvider';
import { PingDiscoveryProvider } from './providers/PingDiscoveryProvider';
import { SitemapPingProvider } from './providers/SitemapPingProvider';
import { BingUrlSubmissionProvider } from './providers/BingUrlSubmissionProvider';
import { WebSubProvider } from './providers/WebSubProvider';
import { PingServicesProvider } from './providers/PingServicesProvider';
import { TwitterSignalProvider } from './providers/TwitterSignalProvider';
import { RedditSignalProvider } from './providers/RedditSignalProvider';
import { config } from '../config';
import { logger } from '../config/logger';

// ── Provider registry ─────────────────────────────────────────────────────────
const PROVIDER_REGISTRY: IndexingProvider[] = [
  new GoogleBridgeProvider(),      // google_bridge       — System B: bridge page + Google API (best for third-party URLs)
  new RedditSignalProvider(),      // reddit_signal       — Google real-time firehose (100% free, 60-180s discovery)
  new TwitterSignalProvider(),     // twitter_signal      — Twitter real-time signal
  new GoogleIndexingProvider(),    // google_indexing     — Google Indexing API direct (works only for owned domains)
  new PingDiscoveryProvider(),     // ping_discovery      — IndexNow (Bing/Yandex)
  new SitemapPingProvider(),       // sitemap_ping        — Google + Bing sitemap ping
  new BingUrlSubmissionProvider(), // bing_url_submission — Bing Webmaster API
  new WebSubProvider(),            // websub              — PubSubHubbub hubs
  new PingServicesProvider(),      // ping_services       — 20+ ping services
];

class IndexingEngine {
  private providers: Map<string, IndexingProvider> = new Map();

  constructor() {
    const enabledNames = config.indexing.providers;

    for (const provider of PROVIDER_REGISTRY) {
      if (enabledNames.includes(provider.name)) {
        this.providers.set(provider.name, provider);
        logger.info('IndexingEngine: provider registered', {
          name: provider.name,
          description: provider.description,
        });
      }
    }

    if (this.providers.size === 0) {
      logger.warn(
        'IndexingEngine: no providers registered. ' +
          'Set INDEXING_PROVIDERS in your .env to enable at least one.',
      );
    }
  }

  /**
   * Process a URL through ALL enabled providers in order.
   * Each provider runs independently — a failure in one does not stop others.
   * Returns a combined result: success if at least one provider succeeded.
   */
  async process(url: string, jobId: string): Promise<IndexingResult & { providerUsed: string | null }> {
    if (this.providers.size === 0) {
      logger.warn('IndexingEngine: no providers available', { jobId, url });
      return {
        success: false,
        provider: 'none',
        providerUsed: null,
        message: 'No indexing providers are currently configured. Processing skipped.',
        metadata: {
          note: 'Configure INDEXING_PROVIDERS in your environment to enable processing.',
        },
      };
    }

    const results: Array<IndexingResult & { providerName: string }> = [];

    // Run all enabled providers
    for (const provider of this.providers.values()) {
      logger.info('IndexingEngine: dispatching to provider', {
        jobId,
        url,
        provider: provider.name,
      });

      const result = await provider.process(url, jobId);
      results.push({ ...result, providerName: provider.name });
    }

    const succeeded = results.filter((r) => r.success);
    const failed = results.filter((r) => !r.success);
    const anySuccess = succeeded.length > 0;

    // Primary provider is the first one that succeeded, or first that ran
    const primaryResult = succeeded[0] ?? results[0];

    const combinedMessage = results
      .map((r) => `[${r.providerName}] ${r.message}`)
      .join(' | ');

    return {
      success: anySuccess,
      provider: results.map((r) => r.providerName).join(', '),
      providerUsed: results.map((r) => r.providerName).join(', '),
      message: combinedMessage,
      metadata: {
        providers: results.map((r) => ({
          name: r.providerName,
          success: r.success,
          message: r.message,
          metadata: r.metadata,
        })),
        summary: `${succeeded.length} succeeded, ${failed.length} failed`,
      },
    };
  }

  /**
   * Returns the names of all currently registered (enabled) providers.
   */
  getEnabledProviders(): string[] {
    return Array.from(this.providers.keys());
  }
}

// Singleton export
export const indexingEngine = new IndexingEngine();
