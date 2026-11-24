-- Close the day (night audit): one sign-off per business date.
CREATE TABLE "DayClose" (
    "id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "closedById" UUID,
    "closedByName" TEXT NOT NULL,
    "closedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,
    "overridden" BOOLEAN NOT NULL DEFAULT false,
    "snapshot" JSONB NOT NULL,
    CONSTRAINT "DayClose_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "DayClose_date_key" ON "DayClose"("date");
