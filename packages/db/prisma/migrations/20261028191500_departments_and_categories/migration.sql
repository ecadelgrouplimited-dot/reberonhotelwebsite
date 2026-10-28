-- CreateTable
CREATE TABLE "HotelDepartment" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT,
    "description" TEXT,
    "location" TEXT,
    "headName" TEXT,
    "headUserId" UUID,
    "monthlyBudgetMinor" BIGINT DEFAULT 0,
    "currency" "Currency" NOT NULL DEFAULT 'UGX',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isSeed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HotelDepartment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ItemCategory" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT,
    "description" TEXT,
    "defaultUnit" TEXT NOT NULL DEFAULT 'PIECE',
    "defaultParLevel" INTEGER NOT NULL DEFAULT 10,
    "departmentCode" TEXT,
    "tone" TEXT NOT NULL DEFAULT 'neutral',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isSeed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ItemCategory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "HotelDepartment_code_key" ON "HotelDepartment"("code");

-- CreateIndex
CREATE UNIQUE INDEX "HotelDepartment_slug_key" ON "HotelDepartment"("slug");

-- CreateIndex
CREATE INDEX "HotelDepartment_isActive_sortOrder_idx" ON "HotelDepartment"("isActive", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "ItemCategory_code_key" ON "ItemCategory"("code");

-- CreateIndex
CREATE UNIQUE INDEX "ItemCategory_slug_key" ON "ItemCategory"("slug");

-- CreateIndex
CREATE INDEX "ItemCategory_isActive_sortOrder_idx" ON "ItemCategory"("isActive", "sortOrder");
