-- Quick PINs become exactly 4 digits and unique across the hotel, with email reset.
-- Salted argon2 hashes cannot be compared for uniqueness, so PINs are now a keyed HMAC
-- (server-held key) behind a unique index. PINs set before this must be set again once.
ALTER TYPE "UserTokenKind" ADD VALUE IF NOT EXISTS 'PIN_RESET';
ALTER TABLE "User" DROP COLUMN IF EXISTS "pinHash";
ALTER TABLE "User" ADD COLUMN "pinDigest" TEXT;
UPDATE "User" SET "pinSetAt" = NULL, "failedPins" = 0;
CREATE UNIQUE INDEX "User_pinDigest_key" ON "User"("pinDigest");
