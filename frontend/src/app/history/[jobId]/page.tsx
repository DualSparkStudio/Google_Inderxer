'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { AppLayout } from '@/components/AppLayout';
import { StatusBadge } from '@/components/StatusBadge';
import { api } from '@/lib/api';
import type { JobDetail } from '@/types';

function formatDate(iso: string | null | undefined) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export default function JobDetailPage() {
  const { jobId } = useParams<{ jobId: string }>();
  const router = useRouter();
  const [job, setJob] = useState<JobDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retrying, setRetrying] = useState(false);

  async function fetchJob() {
    setLoading(true);
    try {
      const detail = await api.getJobStatus(jobId);
      setJob(detail);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load job.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchJob(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleRetry() {
    if (!job) return;
    setRetrying(true);
    try {
      await api.retryJob(job.jobId);
      fetchJob();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Retry failed.');
    } finally {
      setRetrying(false);
    }
  }

  return (
    <AppLayout>
      <div className="mx-auto max-w-2xl">
        {/* Back link */}
        <Link
          href="/history"
          className="text-sm text-gray-500 hover:text-gray-700 mb-6 inline-flex items-center gap-1"
        >
          ← Back to History
        </Link>

        <h1 className="text-xl font-semibold text-gray-900 mb-6 mt-2">Job Detail</h1>

        {loading && (
          <div className="rounded-xl border border-gray-200 bg-white p-8 text-center text-sm text-gray-400">
            Loading…
          </div>
        )}

        {error && (
          <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {job && !loading && (
          <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm space-y-6">
            {/* Status row */}
            <div className="flex items-center justify-between">
              <StatusBadge status={job.status} />
              <div className="flex gap-2">
                <button
                  onClick={fetchJob}
                  className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-500 hover:bg-gray-50 transition-colors"
                >
                  ↻ Refresh
                </button>
                {job.status === 'FAILED' && (
                  <button
                    onClick={handleRetry}
                    disabled={retrying}
                    className="rounded-lg bg-orange-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-orange-600 disabled:opacity-60 transition-colors"
                  >
                    {retrying ? 'Retrying…' : 'Retry'}
                  </button>
                )}
              </div>
            </div>

            {/* Details */}
            <dl className="space-y-3 text-sm">
              <DetailRow label="URL">
                <a
                  href={job.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-brand-600 hover:underline break-all"
                >
                  {job.url}
                </a>
              </DetailRow>
              <DetailRow label="Job ID">
                <code className="text-xs bg-gray-100 px-1.5 py-0.5 rounded">{job.jobId}</code>
              </DetailRow>
              <DetailRow label="Provider">{job.provider ?? '—'}</DetailRow>
              <DetailRow label="Submitted">{formatDate(job.submittedAt)}</DetailRow>
              <DetailRow label="Started">{formatDate(job.startedAt)}</DetailRow>
              <DetailRow label="Completed">{formatDate(job.completedAt)}</DetailRow>
              <DetailRow label="Last Updated">{formatDate(job.updatedAt)}</DetailRow>
              {job.message && (
                <DetailRow label="Message">
                  <span className={job.status === 'FAILED' ? 'text-red-600' : 'text-gray-700'}>
                    {job.message}
                  </span>
                </DetailRow>
              )}
            </dl>

            {/* Validation result */}
            {job.validationResult && (
              <section>
                <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                  Validation Result
                </h2>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
                  {Object.entries(job.validationResult).map(([k, v]) => {
                    if (v === null || v === undefined || k === 'checkedAt') return null;
                    return (
                      <div key={k} className="flex gap-1.5">
                        <dt className="text-gray-400 capitalize">{k.replace(/([A-Z])/g, ' $1')}:</dt>
                        <dd className="text-gray-700 break-all">{String(v)}</dd>
                      </div>
                    );
                  })}
                </dl>
              </section>
            )}

            {/* Provider metadata */}
            {job.metadata && Object.keys(job.metadata).length > 0 && (
              <section>
                <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                  Provider Metadata
                </h2>
                <pre className="rounded-lg bg-gray-50 border border-gray-200 p-3 text-xs text-gray-600 overflow-x-auto whitespace-pre-wrap">
                  {JSON.stringify(job.metadata, null, 2)}
                </pre>
              </section>
            )}

            {/* Disclaimer */}
            <p className="text-xs text-gray-400 border-t border-gray-100 pt-4">
              Processing/discovery completion does not guarantee inclusion in any search index.
              Crawling and indexing decisions are controlled by each search engine independently.
            </p>
          </div>
        )}
      </div>
    </AppLayout>
  );
}

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <dt className="w-28 flex-shrink-0 text-gray-400">{label}</dt>
      <dd className="text-gray-900">{children}</dd>
    </div>
  );
}
