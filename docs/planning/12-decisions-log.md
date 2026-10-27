# 12 · Decisions Log & Open Questions

## Decisions (ADRs)

| # | Date | Decision | Why | Status |
|---|---|---|---|---|
| ADR-001 | 2026-09-29 | Stack: Next.js (web + admin), NestJS (api), PostgreSQL, Redis | Fixed by spec | Accepted |
| ADR-002 | 2026-09-29 | Two Next.js apps (public `web`, private `admin`) in one pnpm/Turborepo monorepo | Separate security posture, caching and bundles; shared packages avoid duplication | Accepted |
| ADR-003 | 2026-09-29 | Prisma ORM + Zod contracts shared across apps | Typed end-to-end, one validation source | Accepted |
| ADR-004 | 2026-09-29 | Block-based CMS built in-house on Postgres (no headless CMS vendor) | Content lives with bookings; one login, one audit log, one database; no extra monthly cost | Accepted |
| ADR-005 | 2026-09-29 | Localizable text stored as `{locale: text}` jsonb from day one | Spec keeps "Languages: Later" possible without migrations | Accepted |
| ADR-006 | 2026-09-29 | Single VPS with Docker Compose + Caddy for Movements I–II | Cost-appropriate for a 10-room hotel; revisit at Movement IV | Proposed |
| ADR-007 | 2026-09-29 | Money as bigint minor units + currency; UGX and USD stored side by side, never converted | Spec: "No silent conversion" | Accepted |
| ADR-008 | 2026-09-29 | Cookieless analytics (Plausible or self-hosted Umami) | No cookie banner, privacy law friendly | Proposed |
| ADR-009 | 2026-09-29 | Own auth (argon2id + rotating refresh) instead of a vendor | Few users, full control, audit in one place | Accepted |
| ADR-010 | 2026-09-29 | Seed placeholder imagery generated locally in brand palette; real photos replace via media library | No licensing risk, no network dependency, honest | Accepted |
| ADR-011 | 2026-09-29 | Cloudflare Turnstile for public forms | Free, no puzzles for guests on phones | Proposed |
| ADR-012 | 2026-09-29 | Tables for `Room` and `AuditLog` created in Movement I | Cheap now, avoids painful backfills later | Accepted |
| ADR-013 | 2026-09-29 | Web reveals use CSS scroll-driven animations (`animation-timeline: view()`); an IntersectionObserver fallback runs after hydration only where unsupported | Zero JS for motion in modern browsers, no hydration mismatches, content never hidden waiting for JS | Accepted |
| ADR-014 | 2026-09-29 | JS budget revised to ≤170 KB total / ≤30 KB app code | The React 19 + Next 16 runtime alone is ~150 KB compressed; the original 110 KB target was unattainable. Browser code must import `@reberon/contracts/text`, never the Zod entry | Accepted |
| ADR-015 | 2026-09-29 | Local-disk media storage in dev (MinIO deferred); `StorageDriver` interface keeps S3 a drop-in | Fewer moving parts locally | Accepted |
| ADR-016 | 2026-09-29 | Public API returns localized objects (`{en: …}`); the website resolves the locale | One cached response serves every locale | Accepted |
| ADR-017 | 2026-09-30 | The guest profile is the existing `Contact`, extended (not a separate `Guest` table as sketched in 03 §9). Merges set `mergedIntoId` and move bookings, conversations and list entries | Enquiries, first-stay names and bookings already point at Contact, so a returning guest's whole history joins up with no copying | Accepted |
| ADR-018 | 2026-09-30 | Room occupancy is `RoomAssignment` rows guarded by Postgres exclusion constraints; a room block raises `InventoryDay.blockedRooms` atomically and is refused if it would oversell | The database, not the screen, is what stops a double-booked room | Accepted |
| ADR-019 | 2026-09-30 | Room moves stay within the same room type for now | Changing type mid-stay alters what was sold; that needs a priced amendment flow, planned with Movement II changes | Accepted |
| ADR-020 | 2026-09-30 | Provider keys live in an encrypted `Integration` table (AES-256-GCM with `DATA_KEY`), owner-only, with "test connection"; the environment stays as a fallback | The owner can connect Pesapal, SMS and WhatsApp without a deploy; keys never reach a browser; nothing changes until they are entered | Accepted |
| ADR-021 | 2026-09-30 | Every guest message goes through an outbox. A channel that is not connected yet records the message as NOT_CONNECTED (with a wa.me link for WhatsApp) instead of failing | Build now, plug in later: the house keeps working and staff can send by hand | Accepted |
| ADR-022 | 2026-09-30 | Tours are addressed by slot (space + room type + variant); a published LIVE tour beats PRE_OPENING. An "image walk" provider uses the media library | "Live rooms replace drawings — same slot" from the spec, and a walk exists before any scan does | Accepted |
| ADR-024 | 2026-09-30 | Access is per person: the role is a preset, the owner adds or removes single permissions; staff can exist without a login; optional sign-in hours and an access end date. People, keys and feature switches stay owner-only. The guard recomputes access on every request | "Who can do what" differs by person, not only by job; changes must apply at once, not at the next token refresh | Accepted |
| ADR-025 | 2026-09-30 | Receipts, refund notes and invoices are immutable numbered documents (RCT/RFD/INV-year-00001), numbered gap-free in the same transaction; corrections void and reissue; HTML rendered by the API for A4 and 80 mm; a check code lets anyone verify a document. They are hotel documents, not URA EFRIS fiscal invoices | Guests and accountants need paper that cannot be quietly changed; EFRIS stays out of scope (01 §non-goals) until the hotel is ready to integrate | Accepted |
| ADR-023 | 2026-09-30 | Production is Docker Compose on one VPS with Caddy for HTTPS; standalone Next.js images; the website is built against the running API; classic Docker builder (BuildKit optional) | Smallest thing that works for ten rooms; nothing to install beyond Docker | Accepted |

## Open questions (need answers from Denis / Wilson)

| # | Question | Blocks | Default until answered |
|---|---|---|---|
| Q1 | Final room types, names and count per type | Rooms content (not build) | 4 types / 10 rooms per [08 §4](08-seed-data.md) |
| Q2 | Domain `reberonhotel.com` registered? DNS access? | Production deploy | — |
| Q3 | Logo and brand mark — existing or to be designed? | Header, share cards | Wordmark in Fraunces |
| Q4 | Official phone, WhatsApp number, email | Contact, forms ack | Placeholders |
| Q5 | Exact map pin / gate location and last-mile description | Getting here | Kapchorwa town approx. |
| Q6 | Progress photos and architect's drawings available now? | "Watch the hotel rise", rooms | Generated placeholders |
| Q7 | Who answers enquiries and in what time window? (sets the promise on forms) | Forms copy | "Within 4 hours, 7:00–21:00" |
| Q8 | Email/SMS providers preference (and budget) | Enquiry acknowledgements | SMTP + Africa's Talking |
| Q9 | Hosting preference / existing Ecadel infrastructure? | ADR-006 | VPS |
| Q10 | Pesapal merchant account status (Movement II) | Payments | — |
| Q11 | Target opening date | Waitlist copy, progress | "2027" |
