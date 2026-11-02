-- AlterEnum
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'HR';
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'ACCOUNTANT';
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'KITCHEN';
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'BAR';
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'GYM';

-- AlterTable
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "customRoleKey" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "customRoleName" TEXT;

-- CreateTable
CREATE TABLE IF NOT EXISTS "RoleDefinition" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "color" TEXT NOT NULL DEFAULT 'emerald',
    "baseRole" "Role" NOT NULL DEFAULT 'DESK',
    "permissions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RoleDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "RoleDefinition_key_key" ON "RoleDefinition"("key");
