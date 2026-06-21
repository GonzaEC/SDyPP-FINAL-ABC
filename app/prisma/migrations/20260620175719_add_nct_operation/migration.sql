-- CreateTable
CREATE TABLE "NctOperation" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "eventId" TEXT,
    "organizerPublicKey" TEXT,
    "ticketCount" INTEGER,
    "ticketId" TEXT,
    "fromPublicKey" TEXT,
    "toPublicKey" TEXT,
    "reason" TEXT,
    "scheduledConfirmAt" TIMESTAMP(3) NOT NULL,
    "confirmedAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "errorCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NctOperation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "NctOperation_status_scheduledConfirmAt_idx" ON "NctOperation"("status", "scheduledConfirmAt");

-- CreateIndex
CREATE INDEX "NctOperation_eventId_idx" ON "NctOperation"("eventId");

-- CreateIndex
CREATE INDEX "NctOperation_ticketId_idx" ON "NctOperation"("ticketId");
