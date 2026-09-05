# URL Indexer

A small, production-quality web application for submitting URLs to discovery/indexing pipelines, tracking their processing status, and viewing submission history.

---

## What it does

1. User logs in (seeded demo account).
2. User submits a public URL.
3. Backend validates the URL — checks format, SSRF safety, reachability, HTTP status, redirects, robots.txt, and noindex meta tag.
4. A background job is created and immediately returned to the frontend (non-blocking).
5. The background worker processes the job through the **IndexingEngine** using one or more **IndexingProviders**.
6. Status progresses: `QUEUED → VALIDATING → PROCESSING → PROCESSED` (or `FAILED`).
7. User can view history with pagination/filtering and retry failed jobs.

> **Important:** `PROCESSED` means the pipeline completed. It does **not** mean the URL was indexed by Google or any search engine. Final crawling and indexing decisions are made exclusively by each search engine. The status `INDEXED` is reserved for future use with verified external evidence only.

---

## Architecture

```
frontend/          Next.js 14 + React + TypeScript + Tailwind CSS
backend/           Express + TypeScript + Prisma ORM
  src/
    config/        Environment config, logger (Winston), Prisma client
    middleware/    Auth (JWT), rate limiters, request logger, error handler
    routes/        /api/auth, /api/urls, /api/health
    services/      auth.service, url.service, validation.service, worker.service
    engine/
      types.ts           IndexingProvider interface + IndexingResult type
      IndexingEngine.ts  Provider registry + orchestrator
      providers/
        PingDiscoveryProvider.ts   (experimental — see below)
    seed.ts        Creates demo user
  prisma/
    schema.prisma  User + IndexingJob models
```

### Background processing

```
POST /api/urls/submit
  → validate input
  → create DB job (status: QUEUED)
  → return Job ID immediately
  → workerService.enqueue(jobId)        ← non-blocking

WorkerService (in-process, setInterval poll)
  → mark VALIDATING
  → validationService.validate(url)
  → mark PROCESSING
  → indexingEngine.process(url, jobId)
  → mark PROCESSED or FAILED
```

To replace the in-process worker with BullMQ:
1. Replace `workerService.enqueue()` call in `url.service.ts` with `queue.add()`.
2. Replace `WorkerService.processJob()` with a BullMQ `Worker` handler.
3. The job processing logic inside `processJob` stays identical.

---

## Installation

### Prerequisites

- Node.js 18+
- npm 9+

### Clone and install

```bash
git clone <repo>
cd Google_Inderxer

# Backend
cd backend
npm install

# Frontend
cd ../frontend
npm install
```

---

## Environment variables

### Backend (`backend/.env`)

```env
DATABASE_URL="file:./dev.db"           # SQLite (local dev)
# DATABASE_URL="postgresql://..."       # PostgreSQL (production)

JWT_SECRET="your-long-random-secret"
JWT_EXPIRES_IN="7d"
PORT=4000
FRONTEND_URL="http://localhost:3000"
INDEXING_PROVIDERS="ping_discovery"
NODE_ENV="development"
```

### Frontend (`frontend/.env.local`)

```env
NEXT_PUBLIC_API_URL=http://localhost:4000
```

---

## Database setup

```bash
cd backend

# Run migrations (creates SQLite dev.db automatically)
npx prisma migrate dev --name init

# Seed demo user (demo@example.com / demo1234)
npm run seed
```

To migrate to PostgreSQL:
1. Update `DATABASE_URL` to a PostgreSQL connection string.
2. Change `provider = "sqlite"` to `provider = "postgresql"` in `prisma/schema.prisma`.
3. Run `npx prisma migrate dev --name init` again.

---

## Running the backend

```bash
cd backend
npm run dev       # ts-node-dev (hot reload)
# or
npm run build && npm start   # compiled
```

Server starts on `http://localhost:4000`.

---

## Running the frontend

```bash
cd frontend
npm run dev
```

Frontend starts on `http://localhost:3000`.

---

## Running workers

The background worker is embedded in the backend process — it starts automatically when you run the backend. No separate process needed for V1.

If you add BullMQ in the future, run the worker as a separate process:

```bash
cd backend
node dist/worker-process.js
```

---

## API documentation

### Authentication

#### `POST /api/auth/login`
```json
{ "email": "demo@example.com", "password": "demo1234" }
→ { "success": true, "token": "...", "user": { "id": "...", "email": "..." } }
```

#### `POST /api/auth/logout`
Requires `Authorization: Bearer <token>`. Logs the event server-side; client should discard the token.

#### `GET /api/auth/me`
Returns current user info. Useful for session restore on frontend reload.

---

### URLs

All URL endpoints require `Authorization: Bearer <token>`.

#### `POST /api/urls/submit`
```json
{ "url": "https://example.com/article" }
→ { "success": true, "jobId": "...", "url": "...", "status": "QUEUED", "submittedAt": "..." }
```

#### `GET /api/urls/history`
Query params: `page`, `limit` (max 100), `status` (QUEUED|VALIDATING|PROCESSING|PROCESSED|FAILED|INDEXED)
```json
{
  "success": true,
  "jobs": [...],
  "pagination": { "page": 1, "limit": 20, "total": 42, "totalPages": 3 }
}
```

#### `GET /api/urls/:jobId/status`
```json
{
  "success": true,
  "jobId": "...",
  "url": "...",
  "status": "PROCESSED",
  "provider": "ping_discovery",
  "submittedAt": "...",
  "completedAt": "...",
  "message": "Discovery pings accepted by IndexNow (Bing/Yandex)...",
  "validationResult": { ... },
  "metadata": { ... }
}
```

#### `POST /api/urls/:jobId/retry`
Only FAILED jobs can be retried. Returns new job state.

---

### Health

#### `GET /api/health`
```json
{ "status": "ok", "timestamp": "...", "version": "1.0.0", "services": { "database": "ok" } }
```

---

## Current indexing provider: `PingDiscoveryProvider`

**What it does:**
Submits the URL to [IndexNow](https://www.indexnow.org/) (used by Bing and Yandex). IndexNow is a standard, documented, public protocol designed for exactly this purpose — notifying search engines about new or updated content.

**What it does NOT do:**
- Does not interact with Google (Google does not support IndexNow as of this writing).
- Does not guarantee crawling or indexing by any search engine.
- Does not use fake traffic, click manipulation, CAPTCHA bypass, or any deceptive techniques.

**IndexNow key note:**
For full IndexNow verification, a key file must be hosted at `https://<target-domain>/<key>.txt`. Without that file, submissions are accepted (HTTP 202) and queued, but may not be fully acted upon until the key is verified on the target domain. This is a limitation of the protocol, not a bug.

**Extending:**
To add a new provider, implement the `IndexingProvider` interface in `backend/src/engine/providers/` and register it in `IndexingEngine.ts`. Set its name in `INDEXING_PROVIDERS`.

---

## Limitations

- **No Google indexing.** Google does not provide a public URL submission API for third-party sites. The `INDEXED` status is not currently set by any provider.
- **IndexNow key verification.** The demo uses a static key. A production deployment should host the key file on the submitter's domain.
- **In-process worker.** The background worker is an in-process `setInterval` loop — suitable for low volume. For higher throughput, replace with BullMQ + Redis.
- **SQLite for local dev.** The schema is fully compatible with PostgreSQL. See database setup above.
- **Single user.** Registration is not exposed. Users are seeded manually via `npm run seed`.

---

## Deployment

### Backend (Render / Railway)

1. Set environment variables (see above), using PostgreSQL `DATABASE_URL`.
2. Build command: `npm run build && npx prisma migrate deploy && npm run seed`
3. Start command: `npm start`

### Frontend (Vercel)

1. Set `NEXT_PUBLIC_API_URL` to the deployed backend URL.
2. Deploy with `next build`.
3. Remove the `rewrites` in `next.config.js` if your backend is on a different domain and CORS is configured.

---

## Security notes

- Passwords are hashed with bcrypt (cost factor 12).
- JWTs are signed with `HS256`. Rotate `JWT_SECRET` in production.
- SSRF protection: all outbound URL fetches resolve DNS and reject private/internal IP ranges, loopback addresses, link-local addresses, and cloud metadata endpoints. Each redirect hop is independently checked.
- Rate limiting on all endpoints (tighter limits on auth and submit).
- Helmet sets standard security headers.
- Request body size is capped at 50KB.
- Users can only access their own jobs (enforced server-side on all job endpoints).
