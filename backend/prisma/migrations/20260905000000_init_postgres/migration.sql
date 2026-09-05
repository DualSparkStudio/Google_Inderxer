-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IndexingJob" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "normalizedUrl" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "provider" TEXT,
    "validationResult" TEXT,
    "resultMessage" TEXT,
    "metadata" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IndexingJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BridgePage" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "targetUrl" TEXT NOT NULL,
    "crawled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "crawledAt" TIMESTAMP(3),
    "deleteAfter" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BridgePage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "IndexingJob_userId_idx" ON "IndexingJob"("userId");

-- CreateIndex
CREATE INDEX "IndexingJob_status_idx" ON "IndexingJob"("status");

-- CreateIndex
CREATE INDEX "IndexingJob_normalizedUrl_idx" ON "IndexingJob"("normalizedUrl");

-- CreateIndex
CREATE INDEX "BridgePage_jobId_idx" ON "BridgePage"("jobId");

-- CreateIndex
CREATE INDEX "BridgePage_deleteAfter_idx" ON "BridgePage"("deleteAfter");

-- AddForeignKey
ALTER TABLE "IndexingJob" ADD CONSTRAINT "IndexingJob_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
