-- Quick PIN switching on shared terminals
ALTER TABLE "User" ADD COLUMN "pinHash" TEXT;
ALTER TABLE "User" ADD COLUMN "pinSetAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "failedPins" INTEGER NOT NULL DEFAULT 0;
