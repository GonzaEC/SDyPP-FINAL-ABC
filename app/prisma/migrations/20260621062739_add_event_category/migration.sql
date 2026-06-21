-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "category" TEXT NOT NULL DEFAULT 'OTHER';

-- CreateIndex
CREATE INDEX "Event_category_idx" ON "Event"("category");
