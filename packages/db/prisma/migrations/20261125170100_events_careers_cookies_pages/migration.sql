-- Pages and navigation for Events, Careers and the cookie policy.
-- Idempotent: a page is created only when its address is free; a link only when none points there yet.
-- Everything here stays editable in the House (Website → Pages / Navigation).

CREATE OR REPLACE FUNCTION pg_temp.rb_page(p_slug text, p_kind "PageKind", p_title jsonb, p_blocks jsonb, p_seo jsonb) RETURNS void AS $$
DECLARE pid uuid; vid uuid;
BEGIN
  IF EXISTS (SELECT 1 FROM "Page" WHERE slug = p_slug) THEN RETURN; END IF;
  pid := gen_random_uuid(); vid := gen_random_uuid();
  INSERT INTO "Page" (id, slug, kind, title, status, "draftBlocks", "draftSeo", "draftVersion", "createdAt", "updatedAt")
    VALUES (pid, p_slug, p_kind, p_title, 'PUBLISHED', p_blocks, p_seo, 1, now(), now());
  INSERT INTO "PageVersion" (id, "pageId", version, title, blocks, seo, "publishedAt")
    VALUES (vid, pid, 1, p_title, p_blocks, p_seo, now());
  UPDATE "Page" SET "publishedVersionId" = vid WHERE id = pid;
END $$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION pg_temp.rb_link(p_menu "NavMenuKey", p_label text, p_url text, p_parent_label text DEFAULT NULL) RETURNS void AS $$
DECLARE parent uuid; next_order int;
BEGIN
  IF p_parent_label IS NOT NULL THEN
    SELECT id INTO parent FROM "NavigationItem" WHERE menu = p_menu AND "parentId" IS NULL AND label->>'en' = p_parent_label LIMIT 1;
    IF parent IS NULL THEN RETURN; END IF;
  END IF;
  IF EXISTS (SELECT 1 FROM "NavigationItem" WHERE menu = p_menu AND url = p_url) THEN RETURN; END IF;
  SELECT coalesce(max("order") + 1, 0) INTO next_order FROM "NavigationItem" WHERE menu = p_menu AND "parentId" IS NOT DISTINCT FROM parent;
  INSERT INTO "NavigationItem" (id, menu, "parentId", label, target, url, "order", "isVisible", "createdAt", "updatedAt")
    VALUES (gen_random_uuid(), p_menu, parent, jsonb_build_object('en', p_label), 'URL', p_url, next_order, true, now(), now());
END $$ LANGUAGE plpgsql;

SELECT pg_temp.rb_page('events', 'EVENTS', '{"en":"Events"}',
  '[
    {"id":"hero-events","type":"hero","variant":"compact","data":{"eyebrow":{"en":"At the house"},"heading":{"en":"Evenings, harvests and trails on the slopes of Elgon."},"sub":{"en":"Live music on the terrace, coffee from the bush to the cup, walks to Sipi. Come for one evening, or plan a stay around it."},"media":[]}},
    {"id":"eventList-events","type":"eventList","data":{"layout":"agenda","showPast":true,"heading":{"en":"What''s on"}}},
    {"id":"ctaBand-events","type":"ctaBand","data":{"heading":{"en":"Planning something of your own?"},"sub":{"en":"Weddings, retreats and celebrations for up to a hundred guests, with rooms for everyone."},"ctas":[{"label":{"en":"Tell us about it"},"action":"enquire"},{"label":{"en":"WhatsApp us"},"action":"whatsapp"}]}}
  ]'::jsonb,
  '{"description":{"en":"Events at Reberon Hotel, Kapchorwa — live music, coffee harvests, guided walks and evenings on the slopes of Mount Elgon. Book your place online."}}'::jsonb);

SELECT pg_temp.rb_page('careers', 'CAREERS', '{"en":"Careers"}',
  '[
    {"id":"hero-careers","type":"hero","variant":"compact","data":{"eyebrow":{"en":"Careers"},"heading":{"en":"Build the house with us."},"sub":{"en":"We are a new hotel in Kapchorwa looking for warm, careful people who love the mountain and want to grow with us."},"media":[]}},
    {"id":"jobList-careers","type":"jobList","data":{"heading":{"en":"Open roles"},"showOpenApplication":true}},
    {"id":"richText-careers","type":"richText","variant":"prose","data":{"heading":{"en":"How we hire"},"body":{"en":{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Every application is read by a person. If your experience fits, we call you for a conversation, then a short working day at the hotel. We reply to everyone — even when the answer is no."}]},{"type":"paragraph","content":[{"type":"text","text":"We keep applications for up to a year and then delete them. You can ask us to delete yours at any time."}]}]}}}}
  ]'::jsonb,
  '{"description":{"en":"Jobs at Reberon Hotel, Kapchorwa. See open roles and apply online in a few minutes."}}'::jsonb);

SELECT pg_temp.rb_page('legal/cookies', 'LEGAL', '{"en":"Cookies"}',
  '[
    {"id":"richText-cookies","type":"richText","variant":"prose","data":{"eyebrow":{"en":"Legal"},"heading":{"en":"Cookies and what this site remembers"},"body":{"en":{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"We keep this short and true. The site uses only what it needs to work, unless you say yes to more. There is no advertising and no tracking across other websites."}]},{"type":"paragraph","content":[{"type":"text","text":"You choose when you first visit, and you can change your mind at any time with the button below or the Cookie settings link at the bottom of every page. Saying no never stops you booking or contacting us."}]},{"type":"paragraph","content":[{"type":"text","text":"Questions about your data? Write to us through the contact page — we answer within a few days, in line with the Uganda Data Protection and Privacy Act, 2019."}]}]}}}},
    {"id":"cookieTable-cookies","type":"cookieTable","data":{"heading":{"en":"Everything the site stores"},"intro":{"en":"Grouped by purpose. Necessary items are always on; everything else waits for your yes."}}}
  ]'::jsonb,
  '{"description":{"en":"Which cookies and browser storage the Reberon Hotel website uses, why, and how to change your choices."}}'::jsonb);

SELECT pg_temp.rb_link('FOOTER_PRIMARY', 'Events', '/events', 'The house');
SELECT pg_temp.rb_link('FOOTER_PRIMARY', 'Careers', '/careers', 'The house');
SELECT pg_temp.rb_link('MOBILE', 'Events', '/events');
SELECT pg_temp.rb_link('FOOTER_LEGAL', 'Cookies', '/legal/cookies');
SELECT pg_temp.rb_link('FOOTER_LEGAL', 'Cookie settings', '#cookie-settings');
