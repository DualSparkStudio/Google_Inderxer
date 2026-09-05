/**
 * Core types for the Indexing/Discovery Engine.
 *
 * IMPORTANT NOTE ON STATUS SEMANTICS:
 * ------------------------------------
 * PROCESSED means our discovery pipeline completed successfully.
 * It does NOT mean the URL was indexed by any search engine.
 * Search engine crawling and indexing decisions are outside our control.
 *
 * INDEXED is reserved for cases where we have reliable, external evidence
 * (e.g., a verified Search Console API result) that the page has been indexed.
 * Do NOT set status=INDEXED based solely on our own processing.
 */

export type JobStatus =
  | 'QUEUED'
  | 'VALIDATING'
  | 'PROCESSING'
  | 'PROCESSED'
  | 'FAILED'
  | 'INDEXED'; // Only set when there is external verified evidence

/**
 * The result returned by an indexing provider after processing a URL.
 */
export interface IndexingResult {
  success: boolean;
  provider: string;
  message: string;
  metadata?: Record<string, unknown>;
}

/**
 * Interface every indexing/discovery provider must implement.
 *
 * To add a new provider:
 * 1. Create a new file in engine/providers/
 * 2. Implement this interface
 * 3. Register the provider in engine/IndexingEngine.ts
 * 4. Add its name to the INDEXING_PROVIDERS env variable
 */
export interface IndexingProvider {
  /** Unique identifier for this provider — must match INDEXING_PROVIDERS env value */
  readonly name: string;

  /** Human-readable description of what this provider does */
  readonly description: string;

  /**
   * Process the given URL.
   * Should never throw — return success:false with a message instead.
   */
  process(url: string, jobId: string): Promise<IndexingResult>;
}
