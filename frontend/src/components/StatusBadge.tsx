import type { JobStatus } from '@/types';

const STATUS_CONFIG: Record<
  JobStatus,
  { label: string; classes: string }
> = {
  QUEUED:     { label: 'Queued',     classes: 'bg-gray-100 text-gray-700' },
  VALIDATING: { label: 'Validating', classes: 'bg-yellow-100 text-yellow-800' },
  PROCESSING: { label: 'Processing', classes: 'bg-blue-100 text-blue-800' },
  PROCESSED:  { label: 'Processed',  classes: 'bg-green-100 text-green-800' },
  FAILED:     { label: 'Failed',     classes: 'bg-red-100 text-red-700' },
  INDEXED:    { label: 'Indexed',    classes: 'bg-emerald-100 text-emerald-800' },
};

interface Props {
  status: string;
}

export function StatusBadge({ status }: Props) {
  const cfg = STATUS_CONFIG[status as JobStatus] ?? {
    label: status,
    classes: 'bg-gray-100 text-gray-600',
  };

  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${cfg.classes}`}
    >
      {cfg.label}
    </span>
  );
}
