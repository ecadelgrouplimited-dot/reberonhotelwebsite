-- Maintenance work orders and lost & found
-- CreateEnum
CREATE TYPE "WorkOrderStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'ON_HOLD', 'DONE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "WorkOrderPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "WorkOrderCategory" AS ENUM ('PLUMBING', 'ELECTRICAL', 'HOT_WATER', 'FURNITURE', 'APPLIANCE', 'WIFI_TV', 'DOORS_LOCKS', 'BUILDING', 'GROUNDS', 'OTHER');

-- CreateEnum
CREATE TYPE "LostItemStatus" AS ENUM ('STORED', 'RETURNED', 'DISPOSED');

-- CreateEnum
CREATE TYPE "LostItemCategory" AS ENUM ('ELECTRONICS', 'CLOTHING', 'JEWELLERY', 'DOCUMENTS', 'MONEY', 'KEYS', 'BAG', 'TOILETRIES', 'OTHER');

-- CreateTable
CREATE TABLE "WorkOrder" (
    "id" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "details" TEXT,
    "category" "WorkOrderCategory" NOT NULL DEFAULT 'OTHER',
    "priority" "WorkOrderPriority" NOT NULL DEFAULT 'NORMAL',
    "status" "WorkOrderStatus" NOT NULL DEFAULT 'OPEN',
    "roomId" UUID,
    "location" TEXT,
    "reportedById" UUID,
    "reportedByName" TEXT NOT NULL,
    "assignedToId" UUID,
    "assignedToName" TEXT,
    "blockId" UUID,
    "dueAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "resolution" TEXT,
    "costMinor" BIGINT,
    "currency" TEXT,
    "isSeed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkOrderNote" (
    "id" UUID NOT NULL,
    "workOrderId" UUID NOT NULL,
    "authorId" UUID,
    "authorName" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'NOTE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkOrderNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LostItem" (
    "id" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" "LostItemCategory" NOT NULL DEFAULT 'OTHER',
    "valuable" BOOLEAN NOT NULL DEFAULT false,
    "foundAt" TIMESTAMP(3) NOT NULL,
    "foundWhere" TEXT NOT NULL,
    "roomId" UUID,
    "foundById" UUID,
    "foundByName" TEXT NOT NULL,
    "storedAt" TEXT NOT NULL,
    "holdUntil" DATE NOT NULL,
    "status" "LostItemStatus" NOT NULL DEFAULT 'STORED',
    "reservationId" UUID,
    "guestName" TEXT,
    "guestContact" TEXT,
    "returnedAt" TIMESTAMP(3),
    "returnedTo" TEXT,
    "returnMethod" TEXT,
    "handledById" UUID,
    "handledByName" TEXT,
    "disposedAt" TIMESTAMP(3),
    "disposalMethod" TEXT,
    "notes" TEXT,
    "isSeed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LostItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WorkOrder_number_key" ON "WorkOrder"("number");

-- CreateIndex
CREATE INDEX "WorkOrder_status_priority_idx" ON "WorkOrder"("status", "priority");

-- CreateIndex
CREATE INDEX "WorkOrder_roomId_idx" ON "WorkOrder"("roomId");

-- CreateIndex
CREATE INDEX "WorkOrder_assignedToId_idx" ON "WorkOrder"("assignedToId");

-- CreateIndex
CREATE INDEX "WorkOrderNote_workOrderId_createdAt_idx" ON "WorkOrderNote"("workOrderId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "LostItem_number_key" ON "LostItem"("number");

-- CreateIndex
CREATE INDEX "LostItem_status_holdUntil_idx" ON "LostItem"("status", "holdUntil");

-- AddForeignKey
ALTER TABLE "WorkOrder" ADD CONSTRAINT "WorkOrder_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkOrderNote" ADD CONSTRAINT "WorkOrderNote_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "WorkOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LostItem" ADD CONSTRAINT "LostItem_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE SET NULL ON UPDATE CASCADE;

