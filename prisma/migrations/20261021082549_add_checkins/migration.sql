-- CreateEnum
CREATE TYPE "CheckInStatus" AS ENUM ('PENDING', 'SAFE', 'MISSED', 'CANCELLED');

-- AlterTable
ALTER TABLE "Alert" ALTER COLUMN "latitude" DROP NOT NULL,
ALTER COLUMN "longitude" DROP NOT NULL;

-- CreateTable
CREATE TABLE "CheckIn" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT 'Safety Check-in',
    "note" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "expectedAt" TIMESTAMP(3) NOT NULL,
    "graceMinutes" INTEGER NOT NULL DEFAULT 10,
    "deadlineAt" TIMESTAMP(3) NOT NULL,
    "status" "CheckInStatus" NOT NULL DEFAULT 'PENDING',
    "checkedInAt" TIMESTAMP(3),
    "missedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "alertId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CheckIn_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CheckIn_alertId_key" ON "CheckIn"("alertId");

-- CreateIndex
CREATE INDEX "CheckIn_userId_status_idx" ON "CheckIn"("userId", "status");

-- CreateIndex
CREATE INDEX "CheckIn_status_deadlineAt_idx" ON "CheckIn"("status", "deadlineAt");

-- AddForeignKey
ALTER TABLE "CheckIn" ADD CONSTRAINT "CheckIn_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CheckIn" ADD CONSTRAINT "CheckIn_alertId_fkey" FOREIGN KEY ("alertId") REFERENCES "Alert"("id") ON DELETE SET NULL ON UPDATE CASCADE;
