/**
 * GoogleIndexingProvider
 * ──────────────────────
 * Submits URLs to Google via the Google Indexing API.
 *
 * HOW IT WORKS:
 * Google's Indexing API (https://developers.google.com/search/apis/indexing-api)
 * accepts a URL and signals Google to crawl/index it. The API was officially
 * designed for job postings and livestream pages, but Google processes the
 * request for any URL — the same mechanism used by commercial indexer tools.
 *
 * SETUP REQUIRED (one-time, free):
 * 1. Google Cloud Console → create project → enable "Web Search Indexing API"
 * 2. IAM & Admin → Service Accounts → create one → download JSON key file
 * 3. Google Search Console → add that service account email as an Owner
 *    on at least one verified property
 * 4. Place the key file path in GOOGLE_SERVICE_ACCOUNT_KEY_FILE env variable
 *    OR paste the JSON content into GOOGLE_SERVICE_ACCOUNT_KEY_JSON
 *
 * QUOTA:
 * Default: 200 requests/day per service account (free).
 * To increase volume: add multiple service accounts (see MultiAccountGoogleProvider
 * which can be added later as a wrapper around this provider).
 *
 * IMPORTANT DISCLAIMER:
 * A successful API response (200 OK) means Google has QUEUED the URL for crawling.
 * It does NOT guarantee the page will appear in search results.
 * Google may still decide not to index the page based on quality, canonical tags,
 * noindex directives, or other signals.
 */

import { JWT } from 'google-auth-library';
import * as fs from 'fs';
import * as path from 'path';
import { IndexingProvider, IndexingResult } from '../types';
import { logger } from '../../config/logger';

const INDEXING_API_ENDPOINT =
  'https://indexing.googleapis.com/v3/urlNotifications:publish';

const SCOPES = ['https://www.googleapis.com/auth/indexing'];

interface ServiceAccountKey {
  type: string;
  project_id: string;
  private_key_id: string;
  private_key: string;
  client_email: string;
  client_id: string;
  auth_uri: string;
  token_uri: string;
}

function loadServiceAccountKey(): ServiceAccountKey {
  // Option 1: JSON string in env variable (good for Render/Railway/Vercel)
  const keyJson = process.env['GOOGLE_SERVICE_ACCOUNT_KEY_JSON'];
  if (keyJson) {
    try {
      return JSON.parse(keyJson) as ServiceAccountKey;
    } catch {
      throw new Error(
        'GOOGLE_SERVICE_ACCOUNT_KEY_JSON is set but contains invalid JSON.',
      );
    }
  }

  // Option 2: Path to the key file on disk
  const keyFile = process.env['GOOGLE_SERVICE_ACCOUNT_KEY_FILE'];
  if (keyFile) {
    const resolved = path.resolve(keyFile);
    if (!fs.existsSync(resolved)) {
      throw new Error(
        `GOOGLE_SERVICE_ACCOUNT_KEY_FILE points to a file that does not exist: ${resolved}`,
      );
    }
    const raw = fs.readFileSync(resolved, 'utf-8');
    return JSON.parse(raw) as ServiceAccountKey;
  }

  throw new Error(
    'Google Indexing API credentials not configured. ' +
      'Set GOOGLE_SERVICE_ACCOUNT_KEY_JSON or GOOGLE_SERVICE_ACCOUNT_KEY_FILE in your .env file.',
  );
}

export class GoogleIndexingProvider implements IndexingProvider {
  readonly name = 'google_indexing';
  readonly description =
    'Submits URLs to Google via the Indexing API. ' +
    'Requires a Google service account with Search Console owner access. ' +
    'A 200 response means Google has queued the URL for crawling — not that it is indexed.';

  private authClient: JWT | null = null;

  private getAuthClient(): JWT {
    if (this.authClient) return this.authClient;

    const key = loadServiceAccountKey();

    this.authClient = new JWT({
      email: key.client_email,
      key: key.private_key,
      scopes: SCOPES,
    });

    return this.authClient;
  }

  async process(url: string, jobId: string): Promise<IndexingResult> {
    logger.info('GoogleIndexingProvider: submitting URL', { jobId, url });

    let authClient: JWT;
    try {
      authClient = this.getAuthClient();
    } catch (err: any) {
      logger.error('GoogleIndexingProvider: auth setup failed', {
        jobId,
        error: err.message,
      });
      return {
        success: false,
        provider: this.name,
        message: `Google Indexing API auth error: ${err.message}`,
        metadata: { error: err.message },
      };
    }

    // Get access token
    let accessToken: string;
    try {
      const tokenResponse = await authClient.getAccessToken();
      if (!tokenResponse.token) {
        throw new Error('Empty access token received from Google.');
      }
      accessToken = tokenResponse.token;
    } catch (err: any) {
      logger.error('GoogleIndexingProvider: token fetch failed', {
        jobId,
        error: err.message,
      });
      return {
        success: false,
        provider: this.name,
        message: `Failed to get Google access token: ${err.message}`,
        metadata: { error: err.message },
      };
    }

    // Submit URL to Google Indexing API
    let httpStatus: number;
    let responseBody: Record<string, unknown>;

    try {
      const response = await fetch(INDEXING_API_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          url,
          type: 'URL_UPDATED', // Signal Google to crawl this URL
        }),
      });

      httpStatus = response.status;
      responseBody = (await response.json()) as Record<string, unknown>;

      logger.info('GoogleIndexingProvider: API response', {
        jobId,
        url,
        httpStatus,
        response: responseBody,
      });
    } catch (err: any) {
      logger.error('GoogleIndexingProvider: API request failed', {
        jobId,
        error: err.message,
      });
      return {
        success: false,
        provider: this.name,
        message: `Google Indexing API request failed: ${err.message}`,
        metadata: { error: err.message },
      };
    }

    // Handle response codes
    if (httpStatus === 200) {
      return {
        success: true,
        provider: this.name,
        message:
          'Google has queued this URL for crawling. ' +
          'NOTE: This does not guarantee the page will appear in search results. ' +
          'Google may still decide not to index it based on content quality, ' +
          'canonical tags, noindex directives, or other signals.',
        metadata: {
          httpStatus,
          apiResponse: responseBody,
          note: 'URL_UPDATED notification accepted by Google Indexing API.',
        },
      };
    }

    if (httpStatus === 403) {
      return {
        success: false,
        provider: this.name,
        message:
          'Google Indexing API returned 403 Forbidden. ' +
          'Make sure the service account email is added as an Owner in Google Search Console.',
        metadata: { httpStatus, apiResponse: responseBody },
      };
    }

    if (httpStatus === 429) {
      return {
        success: false,
        provider: this.name,
        message:
          'Google Indexing API quota exceeded (429). ' +
          'Default limit is 200 requests/day. Add more service accounts to increase capacity.',
        metadata: { httpStatus, apiResponse: responseBody },
      };
    }

    if (httpStatus === 400) {
      return {
        success: false,
        provider: this.name,
        message: `Google Indexing API rejected the request (400 Bad Request): ${JSON.stringify(responseBody)}`,
        metadata: { httpStatus, apiResponse: responseBody },
      };
    }

    // Any other non-200
    return {
      success: false,
      provider: this.name,
      message: `Google Indexing API returned HTTP ${httpStatus}.`,
      metadata: { httpStatus, apiResponse: responseBody },
    };
  }
}
