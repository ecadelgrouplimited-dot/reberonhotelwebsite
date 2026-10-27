# 08 · Seed Data

Every environment boots full: pages, rooms, destination stories, progress updates, enquiries, waitlist, users. Design and QA happen against realistic, messy-enough data, not lorem ipsum.

## 1. Principles

1. **Two tiers.**
   - *Reference seed* — needed in every environment including production: roles, settings keys with defaults, navigation menus, amenity catalogue, block-less system pages (404, legal shells), notification templates (II).
   - *Demo seed* — realistic content and activity for local/staging: pages with blocks, room types, destination stories, progress updates, facilities, FAQs, contacts, conversations, waitlist entries, media. Every demo row has `isSeed = true`.
2. **Idempotent.** Upserts keyed by natural keys (slug, email, setting key). Running the seed twice changes nothing.
3. **Deterministic.** Faker with a fixed seed (`faker.seed(1900)` — the altitude) so screenshots and tests are stable.
4. **Purgeable.** `pnpm db:purge-demo` deletes all `isSeed` rows (and orphaned seed media) in dependency order. Run before launch; production content then replaces it.
5. **Honest placeholders.** Where the spec does not give a fact (room counts per type, sizes, prices, exact phone numbers), the seed uses plausible values and records them in `08-seed-data.md §4` as *to confirm*. The site shows nothing that looks like a fact we don't have without it being in that list.

## 2. Commands

```
pnpm db:migrate        # prisma migrate dev
pnpm db:seed           # reference + demo (non-production)
pnpm db:seed:ref       # reference only (production-safe)
pnpm db:purge-demo     # remove isSeed rows
pnpm db:reset          # drop, migrate, seed (local only; refuses if NODE_ENV=production)
```

## 3. Demo seed contents

| Entity | Count | Notes |
|---|---|---|
| Users | 5 | owner (Denis Mayamba), manager, desk, housekeeping, developer admin (Wilson, OWNER). Dev password from env `SEED_PASSWORD` |
| Settings | all keys | Hotel name *Reberon Hotel*, timezone Africa/Kampala, UGX default + USD, check-in 14:00 / out 10:30, WhatsApp/phone placeholders |
| Room types | 4 (10 rooms total) | *Elgon View King* ×4, *Sipi Twin* ×3, *Coffee Terrace Family* ×2, *Summit Suite* ×1 — each with tagline, description, facts, amenities, 6–10 gallery images (renders badged), from-price UGX + USD |
| Physical rooms | 10 | Numbers 101–105 (floor 1), 201–205 (floor 2), mapped to types; used from Movement IV |
| Amenities | ~24 | Hot shower, mountain view, balcony, desk, Wi-Fi, backup power, safe, kettle & local coffee, wardrobe, mosquito net, extra blanket (it's cold at 1,900 m), etc. |
| Facilities | 6 | Restaurant, Hall (40 seats), Parking, Power (grid + solar backup), Water (borehole + treatment), Garden terrace — some COMING_SOON |
| Destinations | 6 | Sipi Falls, Mount Elgon, Kapchorwa Coffee, The Road (with 5 route stops), Getting Here, When to Come (12-month season data) |
| Pages | 12 | Home, Rooms index, About, Rising, Facilities, Kapchorwa index, First stay, Contact, Privacy, Booking terms, Cancellation, 404 — fully composed with blocks (see [06 §2](06-website.md)) |
| Progress updates | 14 | From groundbreaking (Nov 2025) to finishes (Sep 2026), milestones + percent, 2–5 photos each |
| FAQs | 3 groups, ~18 items | Before you drive · Rooms & stay · Groups & hall |
| Navigation | 4 menus | Header, footer primary, footer legal, mobile |
| Contacts | 60 | Ugandan and international names, +256 7xx numbers (fake ranges), some email-only |
| Conversations | 45 | Mixed channels/statuses/intents over 90 days; 2–6 messages each incl. staff replies and internal notes |
| Waitlist | 38 | Preferred dates Dec 2026 – Apr 2027 skewed to holidays; some converted placeholders for II |
| Audit log | ~200 | Generated from seed actions so the audit screen is not empty |
| Media | ~80 | See §5 |

Movement II seed (added in Phase 2): rate plans (Rack, B&B, Long Stay, Seasonal), 18 months of rates in UGX and USD, inventory days, 6 packages (*First Light, Sipi Sunday, Seed to Cup, Champions Week, The Table, Long Stay*), 8 extras, ~120 reservations across all statuses with folios and payments, notification templates.

## 4. Placeholders to confirm with Denis / Wilson

| Fact | Seed value | Owner |
|---|---|---|
| Room mix per type | 4 / 3 / 2 / 1 | Denis |
| Room sizes | 22 / 24 / 32 / 40 m² | Architect |
| From-prices | UGX 250k / 230k / 380k / 520k; USD 70 / 65 / 105 / 145 | Denis |
| Phone, WhatsApp, email | `+256 700 000 000` style placeholders, `hello@reberonhotel.com` | Denis |
| Exact location pin | Kapchorwa town centre approx. `1.3960, 34.4500` | Wilson |
| Drive times | Kampala→Mbale ~4 h 30, Mbale→Kapchorwa ~1 h 30 | Verify |
| Check-in / out | 14:00 / 10:30 | Denis |
| Opening date | "2027" | Denis |

## 5. Seed media

No network dependency in the default seed:
- A generator (`packages/db/seed/media/generate.ts`, using `sharp`) produces art-directed placeholder images in the Highland palette — layered ridge silhouettes, contour lines, mist gradients, labelled "Placeholder — room render" — at 2400 px, then runs them through the normal media pipeline so variants/blurhash exist. They look intentional in design review and are obviously not real photos.
- Optional `pnpm db:seed:photos` fetches a curated list of freely licensed photos (Unsplash/Wikimedia Commons of Sipi Falls, Mount Elgon, coffee) with credit + licence stored on `MediaAsset.credit`. Never used in production without review.
- Real photography and architect's drawings replace these through the media library; references survive because blocks point at media IDs.

## 6. Seed code layout

```
packages/db/seed/
├─ index.ts            orchestrates tiers, checks NODE_ENV
├─ reference/          settings.ts, navigation.ts, amenities.ts, system-pages.ts
├─ demo/               users.ts, rooms.ts, facilities.ts, destinations.ts, pages.ts, progress.ts,
│                      faqs.ts, inbox.ts, waitlist.ts, audit.ts
├─ content/            copy written in the brand voice (typed objects, not lorem)
├─ media/generate.ts   placeholder art generator
└─ purge.ts
```
