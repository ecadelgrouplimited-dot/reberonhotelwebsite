-- Cookie consent records, Events, Careers
-- CreateEnum
CREATE TYPE "EventStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "EventCategory" AS ENUM ('MUSIC', 'FOOD_DRINK', 'COFFEE', 'OUTDOOR', 'CULTURE', 'WELLNESS', 'FAMILY', 'CONFERENCE', 'OTHER');

-- CreateEnum
CREATE TYPE "RegistrationStatus" AS ENUM ('CONFIRMED', 'WAITLISTED', 'CANCELLED', 'ATTENDED');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('DRAFT', 'OPEN', 'CLOSED');

-- CreateEnum
CREATE TYPE "JobType" AS ENUM ('FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERNSHIP', 'SEASONAL', 'VOLUNTEER');

-- CreateEnum
CREATE TYPE "ApplicationStatus" AS ENUM ('NEW', 'REVIEWING', 'SHORTLISTED', 'INTERVIEW', 'OFFERED', 'HIRED', 'REJECTED', 'WITHDRAWN');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "PageKind" ADD VALUE 'EVENTS';
ALTER TYPE "PageKind" ADD VALUE 'CAREERS';

-- CreateTable
CREATE TABLE "ConsentRecord" (
    "id" UUID NOT NULL,
    "visitorId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "preferences" BOOLEAN NOT NULL,
    "analytics" BOOLEAN NOT NULL,
    "media" BOOLEAN NOT NULL,
    "method" TEXT NOT NULL,
    "path" TEXT,
    "ipPrefix" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConsentRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Event" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "title" JSONB NOT NULL,
    "summary" JSONB,
    "body" JSONB,
    "category" "EventCategory" NOT NULL DEFAULT 'OTHER',
    "coverId" UUID,
    "galleryIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3),
    "venue" TEXT,
    "venueDetail" TEXT,
    "offsite" BOOLEAN NOT NULL DEFAULT false,
    "priceMinor" BIGINT,
    "currency" TEXT,
    "priceNote" JSONB,
    "capacity" INTEGER,
    "rsvpEnabled" BOOLEAN NOT NULL DEFAULT true,
    "rsvpClosesAt" TIMESTAMP(3),
    "maxPartySize" INTEGER NOT NULL DEFAULT 6,
    "featured" BOOLEAN NOT NULL DEFAULT false,
    "status" "EventStatus" NOT NULL DEFAULT 'DRAFT',
    "seo" JSONB NOT NULL DEFAULT '{}',
    "isSeed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventRegistration" (
    "id" UUID NOT NULL,
    "eventId" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "partySize" INTEGER NOT NULL DEFAULT 1,
    "notes" TEXT,
    "status" "RegistrationStatus" NOT NULL DEFAULT 'CONFIRMED',
    "manageTokenHash" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'web',
    "checkedInAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "isSeed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EventRegistration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobPosting" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "title" JSONB NOT NULL,
    "summary" JSONB,
    "description" JSONB,
    "requirements" JSONB,
    "benefits" JSONB,
    "departmentCode" TEXT,
    "employmentType" "JobType" NOT NULL DEFAULT 'FULL_TIME',
    "location" TEXT NOT NULL DEFAULT 'Kapchorwa, Uganda',
    "openings" INTEGER NOT NULL DEFAULT 1,
    "salaryMinMinor" BIGINT,
    "salaryMaxMinor" BIGINT,
    "currency" TEXT,
    "salaryPeriod" TEXT,
    "showSalary" BOOLEAN NOT NULL DEFAULT false,
    "closesOn" DATE,
    "status" "JobStatus" NOT NULL DEFAULT 'DRAFT',
    "questions" JSONB NOT NULL DEFAULT '[]',
    "coverId" UUID,
    "seo" JSONB NOT NULL DEFAULT '{}',
    "publishedAt" TIMESTAMP(3),
    "isSeed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "JobPosting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobApplication" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "jobId" UUID,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "location" TEXT,
    "coverLetter" TEXT,
    "answers" JSONB NOT NULL DEFAULT '[]',
    "cvKey" TEXT,
    "cvName" TEXT,
    "cvMime" TEXT,
    "cvSize" INTEGER,
    "consentAt" TIMESTAMP(3) NOT NULL,
    "status" "ApplicationStatus" NOT NULL DEFAULT 'NEW',
    "rating" SMALLINT,
    "source" TEXT,
    "staffProfileId" UUID,
    "isSeed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JobApplication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobApplicationNote" (
    "id" UUID NOT NULL,
    "applicationId" UUID NOT NULL,
    "authorId" UUID,
    "authorName" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'NOTE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JobApplicationNote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ConsentRecord_createdAt_idx" ON "ConsentRecord"("createdAt");

-- CreateIndex
CREATE INDEX "ConsentRecord_visitorId_idx" ON "ConsentRecord"("visitorId");

-- CreateIndex
CREATE UNIQUE INDEX "Event_slug_key" ON "Event"("slug");

-- CreateIndex
CREATE INDEX "Event_status_startsAt_idx" ON "Event"("status", "startsAt");

-- CreateIndex
CREATE UNIQUE INDEX "EventRegistration_code_key" ON "EventRegistration"("code");

-- CreateIndex
CREATE UNIQUE INDEX "EventRegistration_manageTokenHash_key" ON "EventRegistration"("manageTokenHash");

-- CreateIndex
CREATE INDEX "EventRegistration_eventId_status_idx" ON "EventRegistration"("eventId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "JobPosting_slug_key" ON "JobPosting"("slug");

-- CreateIndex
CREATE INDEX "JobPosting_status_closesOn_idx" ON "JobPosting"("status", "closesOn");

-- CreateIndex
CREATE UNIQUE INDEX "JobApplication_code_key" ON "JobApplication"("code");

-- CreateIndex
CREATE INDEX "JobApplication_jobId_status_idx" ON "JobApplication"("jobId", "status");

-- CreateIndex
CREATE INDEX "JobApplication_status_createdAt_idx" ON "JobApplication"("status", "createdAt");

-- CreateIndex
CREATE INDEX "JobApplicationNote_applicationId_createdAt_idx" ON "JobApplicationNote"("applicationId", "createdAt");

-- AddForeignKey
ALTER TABLE "EventRegistration" ADD CONSTRAINT "EventRegistration_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobApplication" ADD CONSTRAINT "JobApplication_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "JobPosting"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobApplicationNote" ADD CONSTRAINT "JobApplicationNote_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "JobApplication"("id") ON DELETE CASCADE ON UPDATE CASCADE;

