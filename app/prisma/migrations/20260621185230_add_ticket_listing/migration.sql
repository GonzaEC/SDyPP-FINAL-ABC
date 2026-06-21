-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "listingId" TEXT;

-- CreateTable
CREATE TABLE "TicketListing" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "sellerId" TEXT NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'ARS',
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "buyerId" TEXT,
    "paymentId" TEXT,
    "listedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "TicketListing_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TicketListing_ticketId_status_idx" ON "TicketListing"("ticketId", "status");

-- CreateIndex
CREATE INDEX "TicketListing_sellerId_idx" ON "TicketListing"("sellerId");

-- CreateIndex
CREATE INDEX "TicketListing_status_idx" ON "TicketListing"("status");

-- AddForeignKey
ALTER TABLE "TicketListing" ADD CONSTRAINT "TicketListing_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketListing" ADD CONSTRAINT "TicketListing_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
