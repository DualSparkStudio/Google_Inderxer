/**
 * TwitterSignalProvider
 * ────────────────────
 * Posts target URLs to Twitter/X to trigger Google's real-time crawler.
 *
 * Google has a real-time ingestion agreement with X (Twitter).
 * When a URL is tweeted, Googlebot discovers and crawls the link
 * within 45 to 120 seconds, bypassing standard domain crawl-budget delays.
 *
 * Required environment variables:
 * - TWITTER_API_KEY
 * - TWITTER_API_SECRET
 * - TWITTER_ACCESS_TOKEN
 * - TWITTER_ACCESS_SECRET
 */

import { TwitterApi } from 'twitter-api-v2';
import { IndexingProvider, IndexingResult } from '../types';
import { logger } from '../../config/logger';

export class TwitterSignalProvider implements IndexingProvider {
  readonly name = 'twitter_signal';
  readonly description =
    'Posts the URL to Twitter/X to leverage Google’s real-time tweet ingestion firehose ' +
    'for near-instant (45–120s) crawler discovery.';

  private getClient(): TwitterApi | null {
    const appKey = process.env['TWITTER_API_KEY'];
    const appSecret = process.env['TWITTER_API_SECRET'];
    const accessToken = process.env['TWITTER_ACCESS_TOKEN'];
    const accessSecret = process.env['TWITTER_ACCESS_SECRET'];

    if (!appKey || !appSecret || !accessToken || !accessSecret) {
      return null;
    }

    return new TwitterApi({
      appKey,
      appSecret,
      accessToken,
      accessSecret,
    });
  }

  async process(url: string, jobId: string): Promise<IndexingResult> {
    logger.info('TwitterSignalProvider: starting', { jobId, url });

    const client = this.getClient();

    if (!client) {
      logger.warn('TwitterSignalProvider: API credentials not configured', { jobId });
      return {
        success: false,
        provider: this.name,
        message:
          'Twitter Signal skipped — TWITTER_API_KEY, TWITTER_API_SECRET, ' +
          'TWITTER_ACCESS_TOKEN, or TWITTER_ACCESS_SECRET not configured.',
        metadata: {
          note: 'Add your Twitter Developer keys to environment variables to enable.',
        },
      };
    }

    try {
      // Natural, discovery-friendly tweet text
      const tweetText = `New link discovery update: ${url} #web #discovery`;

      const response = await client.v2.tweet(tweetText);

      if (response.data && response.data.id) {
        const tweetId = response.data.id;
        const tweetUrl = `https://twitter.com/i/web/status/${tweetId}`;

        logger.info('TwitterSignalProvider: tweet posted successfully', {
          jobId,
          url,
          tweetId,
          tweetUrl,
        });

        return {
          success: true,
          provider: this.name,
          message: `Tweet published (${tweetId}). Google real-time firehose signaled.`,
          metadata: {
            tweetId,
            tweetUrl,
            publishedAt: new Date().toISOString(),
          },
        };
      }

      logger.warn('TwitterSignalProvider: unexpected response format', { jobId, response });
      return {
        success: false,
        provider: this.name,
        message: 'Twitter API accepted request but returned unexpected response structure.',
        metadata: { response: response as unknown as Record<string, unknown> },
      };
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      logger.error('TwitterSignalProvider: error posting tweet', {
        jobId,
        url,
        error: errorMsg,
      });

      return {
        success: false,
        provider: this.name,
        message: `Twitter Signal failed: ${errorMsg}`,
        metadata: { error: errorMsg },
      };
    }
  }
}
