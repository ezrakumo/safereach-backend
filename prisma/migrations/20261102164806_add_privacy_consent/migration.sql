-- AlterTable
ALTER TABLE "User" ADD COLUMN     "locationConsentAt" TIMESTAMP(3),
ADD COLUMN     "marketingConsent" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "privacyAcceptedAt" TIMESTAMP(3),
ADD COLUMN     "privacyPolicyVersion" TEXT,
ADD COLUMN     "termsAcceptedAt" TIMESTAMP(3);
