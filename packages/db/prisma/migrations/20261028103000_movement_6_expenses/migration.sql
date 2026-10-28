-- AlterEnum
ALTER TYPE "Department" ADD VALUE IF NOT EXISTS 'ENERGY_UTILITIES';
ALTER TYPE "Department" ADD VALUE IF NOT EXISTS 'ADMIN_GENERAL';

-- CreateEnum
CREATE TYPE "ExpenseCategory" AS ENUM (
    'COGS_FOOD',
    'COGS_BEVERAGE',
    'UTILITIES_ELECTRICITY',
    'UTILITIES_DIESEL_FUEL',
    'UTILITIES_WATER_GAS',
    'MAINTENANCE_REPAIRS',
    'HOUSEKEEPING_AMENITIES',
    'STAFF_PAYROLL_WELFARE',
    'MARKETING_COMMISSIONS',
    'ADMIN_GENERAL'
);

-- CreateEnum
CREATE TYPE "ExpensePaymentMethod" AS ENUM (
    'CASH',
    'MOMO_MTN',
    'MOMO_AIRTEL',
    'BANK_TRANSFER',
    'CHEQUE',
    'CARD'
);

-- CreateTable
CREATE TABLE "Expense" (
    "id" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "department" "Department" NOT NULL,
    "category" "ExpenseCategory" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "vendor" TEXT,
    "amountMinor" BIGINT NOT NULL,
    "currency" "Currency" NOT NULL DEFAULT 'UGX',
    "paymentMethod" "ExpensePaymentMethod" NOT NULL DEFAULT 'CASH',
    "referenceNumber" TEXT,
    "receiptUrl" TEXT,
    "recordedById" UUID,
    "recordedByName" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'APPROVED',
    "isSeed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Expense_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Expense_number_key" ON "Expense"("number");

-- CreateIndex
CREATE INDEX "Expense_department_date_idx" ON "Expense"("department", "date");

-- CreateIndex
CREATE INDEX "Expense_category_date_idx" ON "Expense"("category", "date");
