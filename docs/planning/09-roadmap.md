# 09 · Roadmap

Phases map to the spec's Movements. Each phase ends with a demo on staging and the acceptance checklist signed off.

## Status (2026-09-30)

- **Phase 0:** done. MinIO is deferred (ADR-015). CI is wired (`.github/workflows/ci.yml`).
- **Phase 1:** done except 1.15 (production deploy). That waits on the domain and hosting decisions (Q2, Q9).
- **Phase 2 (Movement II):** built and verified. Switched off until rates are confirmed and Pesapal keys exist (Q10):
  - rates and availability, holds, reservations and folio, Pesapal plus a test provider
  - confirmations, guest stay page, House screens, owner brief

  Verified:
  - 5 concurrent bookings for the last room: exactly 1 wins
  - a duplicate payment notification counts once
  - holds expire and release rooms
  - cancellation refunds follow the policy
  - the full website booking journey works in Chrome
- **Phase 4 (Movement IV, the House):** built and verified. Some parts wait on field data (real room numbers, staff rota) and on SMS:
  - front desk (M13): arrivals, in-house, departures and late arrivals; check-in with room choice, payment and ID; check-out with balance, early departure and write-off; walk-in; no-show; move room; folio charges and credits
  - room rack and housekeeping (M14): rooms by floor with live status, phone-first cleaning list (start → done → inspected), room blocks that take nights off sale
  - guests and memory (M15): one profile per person, stay history, preferred room, tags, VIP, ID stored encrypted, duplicate detection and merge (ADR-017)
  - feedback (M12): at check-out or from the stay page; with the guest's consent the owner can put their words on the website (a "Guest voices" block)
  - reports (M21): occupancy, ADR, RevPAR, revenue by currency, source mix, lead time, CSV export

  Verified:
  - the database refuses to give one room to two stays on the same night, and refuses overlapping blocks (exclusion constraints)
  - inventory still matches live reservations on every night after check-in, early check-out, move, no-show and blocks
  - housekeeping never receives money or phone numbers, and cannot reach the desk, guests or reports
  - walk-in → check-in → check-out works in Chrome
- **Phase 3 (Movement III, the Walk):** built and verified; switched off (`features.toursEnabled`) until the owner is ready:
  - tours per slot (room type, hall cleared / set, lobby, compound, beyond the gate) from Matterport, Kuula, video, any embed, or an image walk built from the library
  - a published live tour replaces the pre-opening one in the same slot, with no page edits
  - hotspots as labelled facts; anonymous analytics down to "walked, then booked and paid"
- **Integrations and messaging (M22 vault, M09, M10):** built and verified. Encrypted keys for Pesapal, Africa's Talking, WhatsApp Cloud API and SMTP; editable templates; an outbox that records unconnected channels instead of failing
- **People and access (M22) and receipts (M08/M09):** built and verified. Per-person permissions, staff without a login, hours and end dates; gap-free numbered receipts, refund notes and invoices with print, send, void and verify
- **Deployment:** Docker images, production compose file with Caddy, deploy and backup scripts, and CI. Verified from a clean checkout and by running the images. Waits only on the domain and the server (Q2, Q9). See [13-deployment.md](13-deployment.md)

Verified end to end in a real browser:
- publish → live on the website in under 1 second
- enquiry and first-stay forms work with and without JavaScript
- a photo upload appears on `/rising`

The API integration suite (19 tests) passes.

## Phase 0 — Foundation

| # | Deliverable | Done when |
|---|---|---|
| 0.1 | Monorepo (pnpm + Turborepo), shared tsconfig/eslint/prettier, Husky + lint-staged, commit convention | `pnpm dev` starts web :3000, admin :3001, api :4000 |
| 0.2 | `infra/docker-compose.yml`: Postgres 16, Redis 7, MinIO, Mailpit | `pnpm infra:up` healthy |
| 0.3 | `packages/db`: Prisma schema for Movement I (+ `Room`, `AuditLog`), first migration | `pnpm db:migrate` clean |
| 0.4 | `packages/contracts`: enums, block schemas, public/admin DTOs | Types import in all three apps |
| 0.5 | `packages/ui`: tokens, fonts, base primitives | Token page renders light + dark |
| 0.6 | API skeleton: config validation, pino, problem+json filter, zod pipe, health, OpenAPI, rate limiter, Redis, BullMQ | `/v1/health` green, `/api/docs` lists routes |
| 0.7 | Auth + RBAC + audit interceptor | Login/refresh/logout e2e tests pass; role guard tests |
| 0.8 | Media pipeline (upload → variants → blurhash) | Upload in admin shows processed variants |
| 0.9 | Seed pipeline (reference + demo + placeholder media generator + purge) | Fresh clone → one command → full site |
| 0.10 | CI: lint, typecheck, unit, api e2e (Postgres service), build | Green on PR |

## Phase 1 — Movement I · Face

| # | Deliverable | Acceptance |
|---|---|---|
| 1.1 | Public API: site, pages (resolved blocks), rooms, facilities, destinations, progress, FAQs, redirects | Contract tests; only published data leaks |
| 1.2 | Web shell: header, mobile nav, sticky action bar, footer, theme + currency toggles, 404 | Lighthouse ≥ 95 mobile on shell |
| 1.3 | Block renderer + all Movement I block components with motion | Every block renders from seed on a demo page; reduced-motion verified |
| 1.4 | Pages: home, rooms index/detail, about, rising, facilities, Kapchorwa index/detail, first stay, contact, legal, catch-all | All seed pages render; SEO/JSON-LD validated |
| 1.5 | Forms: enquiry + waitlist (Server Actions, Turnstile, idempotent, no-JS) | Submission appears in admin inbox/waitlist < 2 s; ack sent |
| 1.6 | WhatsApp click-to-chat with context + intent logging | wa.me message contains page/room/dates + ref |
| 1.7 | Revalidation + preview (draft mode) | Publish → live ≤ 10 s; preview shows drafts only to signed-in managers |
| 1.8 | Admin shell: login, layout, command palette, dashboard | Role-based nav; HK cannot open website screens |
| 1.9 | Admin: page builder with live preview, versions, schedule | Manager rebuilds home page from blocks without help |
| 1.10 | Admin: rooms, amenities, facilities, destination, progress, FAQs, navigation, redirects | CRUD + reorder + publish for each |
| 1.11 | Admin: media library | Focal point, alt text enforced, usages, delete protection |
| 1.12 | Admin: inbox + waitlist | Assign, reply (email), notes, status, CSV export |
| 1.13 | Admin: settings, users & invitations, audit log | OWNER-only walls enforced in API tests |
| 1.14 | Performance, a11y and SEO pass; content load with real copy/photos | Targets in [01 §6](01-product-scope.md) met |
| 1.15 | Production deploy, backups, monitoring, purge demo, go-live | `reberonhotel.com` live |

## Phase 2 — Movement II · Door (starts when rates exist)

Inventory calendar & holds → rate plans & two-currency rates → taxes & cancellation policies → packages & extras → reservations (create/amend/cancel, reference codes) → Pesapal intents + IPN webhook + folio ledger → confirmations (email/SMS/WhatsApp templates) → guest lookup + add a night + requests → waitlist conversion → WhatsApp Cloud API → jobs (hold expiry, pre-arrival, 19:00 owner brief) → owner screen → vault.

**Acceptance highlights:** two phones cannot take the last room (concurrency test); webhook replay posts once; UGX and USD never converted silently; confirmation facts identical across channels.

## Phase 3 — Movement III · Walk

Tour records + embeds on room pages and checkout, hotspots, pre-opening → live swap in the same slot, hall empty/set, tour analytics.

## Phase 4 — Movement IV · House

Physical rooms & rack, housekeeping flow, desk (arrivals, in-house, departures, check-in/out, walk-in, folio), guests & memory with merge, feedback → public reviews, occupancy/ADR/source mix.

## Later

Events & hall (M17), F&B posting (M18), group quotes (M19), channels (M20), additional languages, guide capacity.

## Working rhythm

- Weekly demo on staging; decisions recorded in [12](12-decisions-log.md).
- Each deliverable = one PR with tests, screenshots (admin/web), and updated docs if behaviour changed.
- Content track runs in parallel from Phase 1 start: real copy, photos, drawings, confirmed facts from [08 §4](08-seed-data.md).
