-- CreateTable
CREATE TABLE "StaffProfile" (
    "id" UUID NOT NULL,
    "employeeNumber" TEXT NOT NULL,
    "userId" UUID,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "otherNames" TEXT,
    "gender" TEXT NOT NULL DEFAULT 'OTHER',
    "dateOfBirth" TIMESTAMP(3),
    "nationalIdNumber" TEXT,
    "phone" TEXT NOT NULL,
    "alternatePhone" TEXT,
    "email" TEXT,
    "residenceAddress" TEXT,
    "emergencyContactName" TEXT NOT NULL,
    "emergencyContactPhone" TEXT NOT NULL,
    "emergencyContactRelation" TEXT NOT NULL DEFAULT 'NEXT_OF_KIN',
    "departmentCode" TEXT NOT NULL,
    "jobTitle" TEXT NOT NULL,
    "employmentType" TEXT NOT NULL DEFAULT 'FULL_TIME',
    "dateJoined" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "contractEndDate" TIMESTAMP(3),
    "baseSalaryMinor" BIGINT NOT NULL DEFAULT 0,
    "currency" "Currency" NOT NULL DEFAULT 'UGX',
    "paymentMethod" TEXT NOT NULL DEFAULT 'BANK_TRANSFER',
    "bankName" TEXT,
    "bankAccountNumber" TEXT,
    "mobileMoneyNumber" TEXT,
    "nssfNumber" TEXT,
    "tinNumber" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "avatarUrl" TEXT,
    "notes" TEXT,
    "isSeed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StaffProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StaffShift" (
    "id" UUID NOT NULL,
    "staffId" UUID NOT NULL,
    "departmentCode" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "shiftType" TEXT NOT NULL DEFAULT 'MORNING',
    "scheduledStartTime" TEXT,
    "scheduledEndTime" TEXT,
    "actualCheckIn" TIMESTAMP(3),
    "actualCheckOut" TIMESTAMP(3),
    "attendanceStatus" TEXT NOT NULL DEFAULT 'SCHEDULED',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StaffShift_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StaffLeaveRequest" (
    "id" UUID NOT NULL,
    "staffId" UUID NOT NULL,
    "leaveType" TEXT NOT NULL DEFAULT 'ANNUAL',
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "daysCount" INTEGER NOT NULL DEFAULT 1,
    "reason" TEXT NOT NULL,
    "handoverNotes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "reviewedById" UUID,
    "reviewedByName" TEXT,
    "reviewNotes" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StaffLeaveRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StaffPayrollRecord" (
    "id" UUID NOT NULL,
    "staffId" UUID NOT NULL,
    "periodMonth" TEXT NOT NULL,
    "baseSalaryMinor" BIGINT NOT NULL DEFAULT 0,
    "overtimeMinor" BIGINT NOT NULL DEFAULT 0,
    "allowancesMinor" BIGINT NOT NULL DEFAULT 0,
    "grossSalaryMinor" BIGINT NOT NULL DEFAULT 0,
    "payeTaxMinor" BIGINT NOT NULL DEFAULT 0,
    "nssfEmployeeMinor" BIGINT NOT NULL DEFAULT 0,
    "nssfEmployerMinor" BIGINT NOT NULL DEFAULT 0,
    "advancesDeductionMinor" BIGINT NOT NULL DEFAULT 0,
    "otherDeductionsMinor" BIGINT NOT NULL DEFAULT 0,
    "netSalaryMinor" BIGINT NOT NULL DEFAULT 0,
    "currency" "Currency" NOT NULL DEFAULT 'UGX',
    "paymentStatus" TEXT NOT NULL DEFAULT 'DRAFT',
    "paymentReference" TEXT,
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StaffPayrollRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StaffDocument" (
    "id" UUID NOT NULL,
    "staffId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'CONTRACT',
    "fileUrl" TEXT NOT NULL,
    "expiryDate" DATE,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StaffDocument_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StaffProfile_employeeNumber_key" ON "StaffProfile"("employeeNumber");

-- CreateIndex
CREATE INDEX "StaffProfile_departmentCode_status_idx" ON "StaffProfile"("departmentCode", "status");

-- CreateIndex
CREATE INDEX "StaffProfile_status_idx" ON "StaffProfile"("status");

-- CreateIndex
CREATE INDEX "StaffShift_date_departmentCode_idx" ON "StaffShift"("date", "departmentCode");

-- CreateIndex
CREATE INDEX "StaffShift_staffId_date_idx" ON "StaffShift"("staffId", "date");

-- CreateIndex
CREATE INDEX "StaffLeaveRequest_status_startDate_idx" ON "StaffLeaveRequest"("status", "startDate");

-- CreateIndex
CREATE INDEX "StaffLeaveRequest_staffId_idx" ON "StaffLeaveRequest"("staffId");

-- CreateIndex
CREATE INDEX "StaffPayrollRecord_periodMonth_paymentStatus_idx" ON "StaffPayrollRecord"("periodMonth", "paymentStatus");

-- CreateIndex
CREATE UNIQUE INDEX "StaffPayrollRecord_staffId_periodMonth_key" ON "StaffPayrollRecord"("staffId", "periodMonth");

-- CreateIndex
CREATE INDEX "StaffDocument_staffId_idx" ON "StaffDocument"("staffId");

-- AddForeignKey
ALTER TABLE "StaffShift" ADD CONSTRAINT "StaffShift_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "StaffProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffLeaveRequest" ADD CONSTRAINT "StaffLeaveRequest_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "StaffProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffPayrollRecord" ADD CONSTRAINT "StaffPayrollRecord_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "StaffProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffDocument" ADD CONSTRAINT "StaffDocument_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "StaffProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
