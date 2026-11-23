-- Personal House layout per person (pinned apps, hidden apps, dock), so it follows them to any device.
ALTER TABLE "User" ADD COLUMN "preferences" JSONB NOT NULL DEFAULT '{}';
