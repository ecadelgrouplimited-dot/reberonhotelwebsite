-- AlterTable
ALTER TABLE "PosOrder" ADD COLUMN     "settledAt" TIMESTAMP(3),
ADD COLUMN     "tableId" UUID;

-- CreateTable
CREATE TABLE "PosTable" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "area" TEXT NOT NULL DEFAULT 'Dining Room',
    "seats" INTEGER NOT NULL DEFAULT 4,
    "sortOrder" INTEGER NOT NULL DEFAULT 10,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "isSeed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PosTable_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PosTable_name_key" ON "PosTable"("name");

-- CreateIndex
CREATE INDEX "PosTable_isActive_sortOrder_idx" ON "PosTable"("isActive", "sortOrder");

-- CreateIndex
CREATE INDEX "PosOrder_settledAt_idx" ON "PosOrder"("settledAt");

-- CreateIndex
CREATE INDEX "PosOrder_tableId_idx" ON "PosOrder"("tableId");

-- AddForeignKey
ALTER TABLE "PosOrder" ADD CONSTRAINT "PosOrder_tableId_fkey" FOREIGN KEY ("tableId") REFERENCES "PosTable"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Backfill: settled bills get the time their receipt was issued, or their folio line was posted.
UPDATE "PosOrder" o SET "settledAt" = d."issuedAt"
FROM "IssuedDocument" d WHERE o."documentId" = d."id" AND o."settledAt" IS NULL;

UPDATE "PosOrder" o SET "settledAt" = f."createdAt"
FROM "FolioLine" f WHERE o."folioLineId" = f."id" AND o."settledAt" IS NULL;

UPDATE "PosOrder" SET "settledAt" = "updatedAt"
WHERE "settledAt" IS NULL AND "totalMinor" = 0 AND "status" <> 'CANCELLED';

-- The spots the POS used to hard-code become editable tables.
INSERT INTO "PosTable" ("id", "name", "area", "seats", "sortOrder", "updatedAt") VALUES
  (gen_random_uuid(), 'Counter',      'Counter',      1, 10,  CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Table 1',      'Dining Room',  4, 20,  CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Table 2',      'Dining Room',  4, 30,  CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Table 3',      'Dining Room',  4, 40,  CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Table 4',      'Dining Room',  4, 50,  CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Table 5',      'Dining Room',  6, 60,  CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Table 6',      'Dining Room',  6, 70,  CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Terrace 1',    'Terrace',      4, 80,  CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Terrace 2',    'Terrace',      4, 90,  CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Bar Lounge',   'Lounge',       8, 100, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'VIP Lounge',   'Lounge',       6, 110, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Room Service', 'Room Service', 1, 120, CURRENT_TIMESTAMP)
ON CONFLICT ("name") DO NOTHING;

-- Link existing bills to a table when the name matches exactly.
UPDATE "PosOrder" o SET "tableId" = t."id"
FROM "PosTable" t WHERE o."tableId" IS NULL AND o."tableOrRoom" = t."name";
