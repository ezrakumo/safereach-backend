/*
  Warnings:

  - A unique constraint covering the columns `[shareToken]` on the table `Alert` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "Alert" ADD COLUMN     "shareToken" TEXT;

-- CreateTable
CREATE TABLE "TrackingPoint" (
    "id" TEXT NOT NULL,
    "alertId" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "accuracy" DOUBLE PRECISION,
    "speed" DOUBLE PRECISION,
    "heading" DOUBLE PRECISION,
    "battery" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrackingPoint_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TrackingPoint_alertId_createdAt_idx" ON "TrackingPoint"("alertId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Alert_shareToken_key" ON "Alert"("shareToken");

-- AddForeignKey
ALTER TABLE "TrackingPoint" ADD CONSTRAINT "TrackingPoint_alertId_fkey" FOREIGN KEY ("alertId") REFERENCES "Alert"("id") ON DELETE CASCADE ON UPDATE CASCADE;
