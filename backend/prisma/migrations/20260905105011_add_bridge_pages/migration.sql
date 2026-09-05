-- CreateTable
CREATE TABLE "BridgePage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "jobId" TEXT NOT NULL,
    "targetUrl" TEXT NOT NULL,
    "crawled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "crawledAt" DATETIME,
    "deleteAfter" DATETIME NOT NULL
);

-- CreateIndex
CREATE INDEX "BridgePage_jobId_idx" ON "BridgePage"("jobId");

-- CreateIndex
CREATE INDEX "BridgePage_deleteAfter_idx" ON "BridgePage"("deleteAfter");
