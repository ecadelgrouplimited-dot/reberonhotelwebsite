-- CreateEnum
CREATE TYPE "PosOutletType" AS ENUM ('KITCHEN', 'BAR', 'HEALTH_CLUB', 'CONFERENCE');

-- CreateEnum
CREATE TYPE "PosOrderStatus" AS ENUM ('PENDING', 'PREPARING', 'READY', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PosPaymentMethod" AS ENUM ('CASH', 'MOBILE_MONEY', 'CARD', 'ROOM_FOLIO', 'BANK_TRANSFER');

-- CreateEnum
CREATE TYPE "MembershipTier" AS ENUM ('DAILY_PASS', 'MONTHLY', 'ANNUAL', 'RESIDENT_GUEST');

-- CreateEnum
CREATE TYPE "HealthClubService" AS ENUM ('GYM_ONLY', 'STEAM_ONLY', 'SAUNA_ONLY', 'STEAM_SAUNA', 'FULL_COMBO');

-- CreateEnum
CREATE TYPE "QuotationStatus" AS ENUM ('DRAFT', 'SENT', 'ACCEPTED', 'CONVERTED', 'DECLINED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "EventType" AS ENUM ('WEDDING', 'CONFERENCE', 'MEETING', 'WORKSHOP', 'RETREAT', 'BANQUET', 'GROUP_STAY', 'CUSTOM');

-- CreateEnum
CREATE TYPE "InventoryCategory" AS ENUM ('LINEN_GYM', 'LINEN_ROOM', 'CONSUMABLE', 'BEVERAGE', 'FOOD_KITCHEN', 'FIXED_ASSET');

-- CreateEnum
CREATE TYPE "StockMovementType" AS ENUM ('STOCK_IN', 'STOCK_OUT', 'LAUNDRY_SEND', 'LAUNDRY_RETURN', 'DAMAGED_LOST', 'ADJUSTMENT');

-- CreateEnum
CREATE TYPE "RequisitionStatus" AS ENUM ('PENDING', 'MANAGER_APPROVED', 'DIRECTOR_APPROVED', 'DISBURSED', 'REJECTED');

-- CreateEnum
CREATE TYPE "Department" AS ENUM ('KITCHEN', 'BAR', 'HEALTH_CLUB', 'HOUSEKEEPING', 'FRONT_DESK', 'CONFERENCE', 'MAINTENANCE');

-- CreateTable
CREATE TABLE "PosOutlet" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "PosOutletType" NOT NULL,
    "description" TEXT,
    "deviceStation" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isSeed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PosOutlet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PosCategory" (
    "id" UUID NOT NULL,
    "outletId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isSeed" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "PosCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PosItem" (
    "id" UUID NOT NULL,
    "categoryId" UUID NOT NULL,
    "sku" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "priceMinorUGX" BIGINT NOT NULL,
    "priceMinorUSD" BIGINT,
    "isAvailable" BOOLEAN NOT NULL DEFAULT true,
    "prepMinutes" SMALLINT,
    "inventoryItemId" UUID,
    "isSeed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PosItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PosOrder" (
    "id" UUID NOT NULL,
    "orderNumber" TEXT NOT NULL,
    "outletId" UUID NOT NULL,
    "reservationId" UUID,
    "folioLineId" UUID,
    "documentId" UUID,
    "tableOrRoom" TEXT,
    "customerName" TEXT,
    "customerPhone" TEXT,
    "status" "PosOrderStatus" NOT NULL DEFAULT 'COMPLETED',
    "paymentMethod" "PosPaymentMethod" NOT NULL DEFAULT 'CASH',
    "currency" "Currency" NOT NULL DEFAULT 'UGX',
    "subtotalMinor" BIGINT NOT NULL,
    "discountMinor" BIGINT NOT NULL DEFAULT 0,
    "totalMinor" BIGINT NOT NULL,
    "notes" TEXT,
    "servedById" UUID,
    "servedByName" TEXT,
    "isSeed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PosOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PosOrderItem" (
    "id" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "itemId" UUID NOT NULL,
    "itemName" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unitPriceMinor" BIGINT NOT NULL,
    "totalMinor" BIGINT NOT NULL,
    "notes" TEXT,

    CONSTRAINT "PosOrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HealthClubMembership" (
    "id" UUID NOT NULL,
    "membershipNo" TEXT NOT NULL,
    "memberName" TEXT NOT NULL,
    "memberPhone" TEXT NOT NULL,
    "memberEmail" TEXT,
    "tier" "MembershipTier" NOT NULL,
    "service" "HealthClubService" NOT NULL,
    "currency" "Currency" NOT NULL DEFAULT 'UGX',
    "amountMinor" BIGINT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "documentId" UUID,
    "notes" TEXT,
    "isSeed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HealthClubMembership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HealthClubAccessLog" (
    "id" UUID NOT NULL,
    "membershipId" UUID,
    "reservationId" UUID,
    "guestName" TEXT NOT NULL,
    "guestPhone" TEXT,
    "service" "HealthClubService" NOT NULL,
    "tier" "MembershipTier" NOT NULL,
    "currency" "Currency" NOT NULL DEFAULT 'UGX',
    "amountPaidMinor" BIGINT NOT NULL DEFAULT 0,
    "paymentMethod" TEXT,
    "documentId" UUID,
    "gymTowelsIssued" INTEGER NOT NULL DEFAULT 1,
    "gymTowelsReturned" INTEGER NOT NULL DEFAULT 0,
    "sandalsIssued" BOOLEAN NOT NULL DEFAULT false,
    "showerCapIssued" BOOLEAN NOT NULL DEFAULT false,
    "ropeIssued" BOOLEAN NOT NULL DEFAULT false,
    "lockerNumber" TEXT,
    "attendantId" UUID,
    "attendantName" TEXT,
    "checkedInAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "checkedOutAt" TIMESTAMP(3),
    "isSeed" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "HealthClubAccessLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Quotation" (
    "id" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "clientName" TEXT NOT NULL,
    "clientOrganization" TEXT,
    "clientPhone" TEXT NOT NULL,
    "clientEmail" TEXT,
    "eventType" "EventType" NOT NULL DEFAULT 'CONFERENCE',
    "eventTitle" TEXT NOT NULL,
    "eventDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "attendees" INTEGER,
    "hallSetup" TEXT,
    "validUntil" TIMESTAMP(3) NOT NULL,
    "currency" "Currency" NOT NULL DEFAULT 'UGX',
    "subtotalMinor" BIGINT NOT NULL,
    "discountMinor" BIGINT NOT NULL DEFAULT 0,
    "taxMinor" BIGINT NOT NULL DEFAULT 0,
    "totalMinor" BIGINT NOT NULL,
    "status" "QuotationStatus" NOT NULL DEFAULT 'DRAFT',
    "notes" TEXT,
    "terms" TEXT,
    "convertedInvoiceId" UUID,
    "convertedReservationId" UUID,
    "createdById" UUID,
    "createdByName" TEXT,
    "checkCode" TEXT NOT NULL,
    "isSeed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Quotation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuotationLine" (
    "id" UUID NOT NULL,
    "quotationId" UUID NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'GENERAL',
    "description" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unit" TEXT NOT NULL DEFAULT 'UNIT',
    "unitPriceMinor" BIGINT NOT NULL,
    "totalMinor" BIGINT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "QuotationLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryItem" (
    "id" UUID NOT NULL,
    "sku" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" "InventoryCategory" NOT NULL,
    "department" "Department" NOT NULL,
    "unit" TEXT NOT NULL DEFAULT 'PIECE',
    "onHand" INTEGER NOT NULL DEFAULT 0,
    "inUseOrLaundry" INTEGER NOT NULL DEFAULT 0,
    "parLevel" INTEGER NOT NULL DEFAULT 10,
    "unitCostMinor" BIGINT NOT NULL DEFAULT 0,
    "location" TEXT,
    "condition" TEXT NOT NULL DEFAULT 'GOOD',
    "lastCountedAt" TIMESTAMP(3),
    "isSeed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InventoryItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockMovement" (
    "id" UUID NOT NULL,
    "itemId" UUID NOT NULL,
    "type" "StockMovementType" NOT NULL,
    "quantity" INTEGER NOT NULL,
    "balanceAfter" INTEGER NOT NULL,
    "department" TEXT,
    "reference" TEXT,
    "notes" TEXT,
    "recordedById" UUID,
    "recordedByName" TEXT,
    "isSeed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockMovement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Requisition" (
    "id" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "department" "Department" NOT NULL,
    "title" TEXT NOT NULL,
    "priority" TEXT NOT NULL DEFAULT 'NORMAL',
    "status" "RequisitionStatus" NOT NULL DEFAULT 'PENDING',
    "currency" "Currency" NOT NULL DEFAULT 'UGX',
    "totalEstimatedMinor" BIGINT NOT NULL,
    "notes" TEXT,
    "rejectionReason" TEXT,
    "requestedById" UUID,
    "requestedByName" TEXT NOT NULL,
    "managerApprovedById" UUID,
    "managerApprovedBy" TEXT,
    "managerApprovedAt" TIMESTAMP(3),
    "directorApprovedById" UUID,
    "directorApprovedBy" TEXT,
    "directorApprovedAt" TIMESTAMP(3),
    "disbursedById" UUID,
    "disbursedBy" TEXT,
    "disbursedAt" TIMESTAMP(3),
    "isSeed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Requisition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RequisitionItem" (
    "id" UUID NOT NULL,
    "requisitionId" UUID NOT NULL,
    "inventoryItemId" UUID,
    "itemName" TEXT NOT NULL,
    "unit" TEXT NOT NULL DEFAULT 'PIECE',
    "quantityRequested" INTEGER NOT NULL,
    "quantityApproved" INTEGER,
    "estimatedUnitMinor" BIGINT NOT NULL,
    "totalEstimatedMinor" BIGINT NOT NULL,

    CONSTRAINT "RequisitionItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StaffAnnouncement" (
    "id" UUID NOT NULL,
    "department" "Department",
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "priority" TEXT NOT NULL DEFAULT 'NORMAL',
    "authorId" UUID,
    "authorName" TEXT NOT NULL,
    "authorRole" TEXT,
    "isPinned" BOOLEAN NOT NULL DEFAULT false,
    "isSeed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StaffAnnouncement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TerminalDevice" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "department" "Department" NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'POS_TERMINAL',
    "paperSize" TEXT NOT NULL DEFAULT '80MM',
    "ipOrPort" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ONLINE',
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isSeed" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "TerminalDevice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PosOutlet_code_key" ON "PosOutlet"("code");

-- CreateIndex
CREATE INDEX "PosCategory_outletId_sortOrder_idx" ON "PosCategory"("outletId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "PosItem_sku_key" ON "PosItem"("sku");

-- CreateIndex
CREATE INDEX "PosItem_categoryId_idx" ON "PosItem"("categoryId");

-- CreateIndex
CREATE UNIQUE INDEX "PosOrder_orderNumber_key" ON "PosOrder"("orderNumber");

-- CreateIndex
CREATE INDEX "PosOrder_outletId_createdAt_idx" ON "PosOrder"("outletId", "createdAt");

-- CreateIndex
CREATE INDEX "PosOrder_status_idx" ON "PosOrder"("status");

-- CreateIndex
CREATE INDEX "PosOrder_reservationId_idx" ON "PosOrder"("reservationId");

-- CreateIndex
CREATE INDEX "PosOrderItem_orderId_idx" ON "PosOrderItem"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "HealthClubMembership_membershipNo_key" ON "HealthClubMembership"("membershipNo");

-- CreateIndex
CREATE INDEX "HealthClubMembership_memberPhone_idx" ON "HealthClubMembership"("memberPhone");

-- CreateIndex
CREATE INDEX "HealthClubMembership_isActive_endDate_idx" ON "HealthClubMembership"("isActive", "endDate");

-- CreateIndex
CREATE INDEX "HealthClubAccessLog_checkedInAt_idx" ON "HealthClubAccessLog"("checkedInAt");

-- CreateIndex
CREATE INDEX "HealthClubAccessLog_membershipId_idx" ON "HealthClubAccessLog"("membershipId");

-- CreateIndex
CREATE UNIQUE INDEX "Quotation_number_key" ON "Quotation"("number");

-- CreateIndex
CREATE INDEX "Quotation_status_createdAt_idx" ON "Quotation"("status", "createdAt");

-- CreateIndex
CREATE INDEX "QuotationLine_quotationId_sortOrder_idx" ON "QuotationLine"("quotationId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryItem_sku_key" ON "InventoryItem"("sku");

-- CreateIndex
CREATE INDEX "InventoryItem_category_department_idx" ON "InventoryItem"("category", "department");

-- CreateIndex
CREATE INDEX "StockMovement_itemId_createdAt_idx" ON "StockMovement"("itemId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Requisition_number_key" ON "Requisition"("number");

-- CreateIndex
CREATE INDEX "Requisition_status_createdAt_idx" ON "Requisition"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Requisition_department_idx" ON "Requisition"("department");

-- CreateIndex
CREATE INDEX "RequisitionItem_requisitionId_idx" ON "RequisitionItem"("requisitionId");

-- CreateIndex
CREATE INDEX "StaffAnnouncement_isPinned_createdAt_idx" ON "StaffAnnouncement"("isPinned", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "TerminalDevice_code_key" ON "TerminalDevice"("code");

-- AddForeignKey
ALTER TABLE "PosCategory" ADD CONSTRAINT "PosCategory_outletId_fkey" FOREIGN KEY ("outletId") REFERENCES "PosOutlet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PosItem" ADD CONSTRAINT "PosItem_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "PosCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PosOrder" ADD CONSTRAINT "PosOrder_outletId_fkey" FOREIGN KEY ("outletId") REFERENCES "PosOutlet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PosOrderItem" ADD CONSTRAINT "PosOrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "PosOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PosOrderItem" ADD CONSTRAINT "PosOrderItem_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "PosItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HealthClubAccessLog" ADD CONSTRAINT "HealthClubAccessLog_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "HealthClubMembership"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuotationLine" ADD CONSTRAINT "QuotationLine_quotationId_fkey" FOREIGN KEY ("quotationId") REFERENCES "Quotation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "InventoryItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequisitionItem" ADD CONSTRAINT "RequisitionItem_requisitionId_fkey" FOREIGN KEY ("requisitionId") REFERENCES "Requisition"("id") ON DELETE CASCADE ON UPDATE CASCADE;
