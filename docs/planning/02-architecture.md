# 02 · Architecture

Stack fixed by the spec: **Next.js** (public + desk screens), **NestJS** (engine), **PostgreSQL**, **Redis**. Virtual tours are embedded, never built.

## 1. System view

```
             reberonhotel.com                      suite.reberonhotel.com
        ┌──────────────────────┐              ┌──────────────────────────┐
Guest → │  apps/web  (Next.js) │              │ apps/admin  (Next.js)    │ ← Owner / Manager / Desk / HK
        │  RSC + ISR, public   │              │ RSC + client islands     │
        └──────────┬───────────┘              └────────────┬─────────────┘
                   │ REST (public, cached)                  │ REST (authenticated, cookie)
                   └──────────────┬─────────────────────────┘
                                  ▼
                     ┌──────────────────────────┐   webhooks   ┌───────────────┐
                     │  apps/api  (NestJS)      │ ◄─────────── │ Pesapal, WA   │
                     │  modules M01…M22         │ ───────────► │ Email / SMS   │
                     └───┬───────────┬──────────┘              └───────────────┘
                         │           │
                  ┌──────▼───┐  ┌────▼─────┐   ┌──────────────────┐
                  │ Postgres │  │  Redis   │   │ Object storage   │
                  │ (truth)  │  │ cache,   │   │ (S3-compatible;  │
                  └──────────┘  │ BullMQ,  │   │  local disk dev) │
                                │ holds,   │   └──────────────────┘
                                │ ratelimit│
                                └──────────┘
```

Why two Next apps rather than one: different audiences, different security posture (the admin app never ships to guests, has no public caching, sets strict CSP and `noindex`), independent deploys, smaller public bundle.

## 2. Monorepo

pnpm workspaces + Turborepo.

```
reberon_hotel_web/
├─ apps/
│  ├─ web/        Next.js — public website (the Face)
│  ├─ admin/      Next.js — management platform (the House)
│  └─ api/        NestJS — engine
├─ packages/
│  ├─ db/         Prisma schema, migrations, client, seed scripts
│  ├─ contracts/  Zod schemas + inferred TS types shared by api/web/admin (DTOs, block schemas, enums)
│  ├─ ui/         Design tokens (CSS vars), shared primitives, icons
│  ├─ config/     tsconfig, eslint, prettier presets
│  └─ utils/      money, dates (Africa/Kampala), slug, phone (E.164 UG), reference codes
├─ infra/
│  ├─ docker-compose.yml   postgres, redis, minio, mailpit
│  └─ deploy/              Dockerfiles, Caddy/Nginx, CI
├─ docs/
└─ turbo.json, pnpm-workspace.yaml, package.json
```

### Library choices

| Concern | Choice | Reason |
|---|---|---|
| ORM / migrations | **Prisma** | Typed client, reviewed SQL migrations, first-class seeding |
| Validation / contracts | **Zod** (in `packages/contracts`) | One schema validates API input *and* types the front ends; `nestjs-zod` pipe |
| API docs | OpenAPI via `@nestjs/swagger` + zod-to-openapi | Generated at `/api/docs` in non-prod |
| Queue / jobs | **BullMQ** on Redis | Holds expiry, emails, evening brief, image processing |
| Cache | Redis (`cache-manager`) + Next ISR tags | Two layers, invalidated together on publish |
| Auth | Own implementation: argon2id, short JWT access + rotating refresh, httpOnly cookies | Small user base, no vendor lock-in, full audit |
| Images | `sharp` in api worker → AVIF/WebP variants + blurhash; `next/image` custom loader | Fast on slow networks |
| Styling | **Tailwind CSS v4** with CSS-variable tokens from `packages/ui` | Tokens shared by both apps |
| Admin components | Radix primitives (shadcn-style, owned in repo), TanStack Table, React Hook Form + Zod | Accessible, no heavy UI kit |
| Rich text | **Tiptap** stored as JSON (ProseMirror doc), rendered server-side on web | Structured, safe, no raw HTML from editors |
| Drag & drop blocks | `dnd-kit` | Page builder reordering |
| Motion (web) | `motion` (Framer Motion), CSS scroll-driven animations, View Transitions API, Lenis | See [05](05-design-system.md) |
| Maps | MapLibre GL + free vector tiles (static image fallback) | No API-key dependency for the pin |
| Email | React Email templates → SMTP provider (Mailpit in dev) | Hotel-looking confirmations |
| SMS / WhatsApp | Provider adapters (Africa's Talking SMS; WhatsApp Cloud API) behind one `NotificationsService` | Swap providers without touching modules |
| Payments | Pesapal v3 adapter (Movement II) | MoMo, Airtel, Visa, Mastercard |
| Logging / errors | `pino` structured logs, Sentry (web, admin, api) | |
| Testing | Vitest (units), Jest+Supertest (api e2e on real Postgres), Playwright (web/admin e2e) | See [11](11-engineering.md) |

Exact versions are pinned in the lockfile at scaffold time (latest stable of each).

## 3. API architecture (NestJS)

- **One Nest module per spec module** where it carries weight: `site` (M01 settings/pages), `cms` (pages/blocks/publish), `rooms` (M02), `destination` (M03), `tours` (M04), `inventory` (M05), `packages` (M06), `reservations` (M07), `payments` (M08), `notifications` (M09 + M22), `whatsapp` (M10), `waitlist` (M11), `guest-portal` (M12), `desk` (M13), `housekeeping` (M14), `guests` (M15), `experiences` (M16), `inbox` (M19), `owner` (M21), plus platform: `auth`, `users`, `media`, `jobs`, `audit`, `vault`, `health`.
- Later modules (`events`, `fnb`, `channels`) get a folder and a README only.
- **Layering:** controller (HTTP, auth guards, zod pipe) → service (business rules, transactions) → Prisma. No business rules in controllers, no HTTP in services.
- **Two route namespaces:**
  - `/v1/public/*` — no auth, read-mostly, rate-limited, cacheable (`Cache-Control` + ETag), only *published* content.
  - `/v1/admin/*` — cookie auth, RBAC guard, never cached, every mutation audited.
- **Domain events** (in-process `EventEmitter2`, fan-out to BullMQ when async): `content.published`, `enquiry.created`, `waitlist.created`, `reservation.confirmed`, `payment.succeeded`… Notifications, revalidation and audit subscribe; modules don't call each other's side effects directly.
- **Transactions & money:** all money as integer minor units + ISO currency (`UGX` exponent 0, `USD` exponent 2). Never floats. See [03 §2](03-data-model.md).

## 4. Rendering and caching (web)

| Page type | Strategy |
|---|---|
| Content pages (home, about, facilities, destination, rooms, legal) | RSC + ISR with **tag-based revalidation** (`page:home`, `room-type:elgon-view`, `settings`, `nav`) |
| Progress feed ("Watch the hotel rise") | ISR, tag `progress` |
| Enquiry / waitlist forms | Server Actions → api `/v1/public/*` (CSRF-safe, works without JS as a plain form post) |
| Availability & booking (Movement II) | Dynamic, uncached; availability from api with Redis short TTL |

**Publish flow:** manager clicks Publish in admin → api writes version, emits `content.published` → subscriber (a) busts Redis keys, (b) calls `POST web/api/revalidate` with an HMAC-signed list of tags → web calls `revalidateTag()`. Target: live in ≤ 10 s.

**Preview:** admin opens `web/api/preview?token=…` → Next draft mode → web fetches draft content with a preview token. Managers see exactly what will ship.

## 5. Redis responsibilities

| Key space | Use |
|---|---|
| `cache:public:*` | Published content responses (invalidated on publish) |
| `bull:*` | BullMQ queues: `media`, `notifications`, `holds`, `brief`, `revalidate` |
| `hold:{roomTypeId}:{date}` | Checkout holds (Movement II) — Postgres remains truth; Redis gives fast TTL + lock |
| `rl:*` | Rate limiting for public forms and login |
| `sess:revoked:*` | Revoked refresh-token families |

## 6. Media pipeline

Upload (admin) → api streams to object storage `originals/` → `media` job generates AVIF + WebP at 480/768/1080/1600/2400 widths, a 32px blurhash, dominant colour, EXIF-stripped → `MediaAsset` updated with variants, dimensions, focal point (editor-settable). Web uses a custom `next/image` loader pointing at variants; blurhash + dominant colour give instant placeholders on slow networks.

## 7. Environments

| Env | Hosts | Data |
|---|---|---|
| local | `localhost:3000` web, `:3001` admin, `:4000` api | docker-compose; full seed |
| staging | `staging.reberonhotel.com`, `suite-staging…`, `api-staging…` | full seed, refreshed on demand |
| production | `reberonhotel.com`, `suite.reberonhotel.com`, `api.reberonhotel.com` | real data; seed limited to reference data + purged demo content |

Deployment target (proposed, see ADR-006): a single VPS (Docker Compose, Caddy for TLS) close to East Africa for Movements I–II; managed Postgres backups nightly to off-site storage. Revisit when desk operations begin.

## 8. Cross-cutting rules

- Time: store `timestamptz` in UTC; business dates (stay nights) as `date` interpreted in `Africa/Kampala`. Never compute "tonight" on the client.
- IDs: UUIDv7 (sortable) as primary keys; human reference codes separately (e.g. `RB-7K3Q`).
- Soft delete (`deletedAt`) for content and people; hard rules on money (never delete, only reverse).
- Every admin mutation writes an `AuditLog` row (actor, entity, before/after diff, IP, UA).
- Feature flags in settings (`booking.enabled`, `tours.enabled`, `waitlist.enabled`) gate UI and API together.
