-- Fonts and text size for the website and the House, chosen in Settings → Typography.
-- An empty value means "the Reberon defaults" (Fraunces + Inter on the website, Plus Jakarta Sans + Inter in the House).
INSERT INTO "Setting" ("key", "value", "group", "updatedAt")
VALUES ('appearance.typography', '{}'::jsonb, 'GENERAL', now())
ON CONFLICT ("key") DO NOTHING;
