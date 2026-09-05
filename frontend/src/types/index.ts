export type JobStatus =
  | 'QUEUED'
  | 'VALIDATING'
  | 'PROCESSING'
  | 'PROCESSED'
  | 'FAILED'
  | 'INDEXED';

export interface User {
  id: string;
  email: string;
}

export interface AuthResponse {
  success: boolean;
  token: string;
  user: User;
}

export interface JobSummary {
  id: string;
  url: string;
  status: JobStatus;
  provider: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  resultMessage: string | null;
}

export interface JobDetail extends JobSummary {
  normalizedUrl: string;
  startedAt: string | null;
  validationResult: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
  jobId: string;
  submittedAt: string;
  message: string | null;
}

export interface SubmitResponse {
  success: boolean;
  jobId: string;
  url: string;
  status: JobStatus;
  submittedAt: string;
}

export interface HistoryResponse {
  success: boolean;
  jobs: JobSummary[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface ApiError {
  success: false;
  error: string;
}
