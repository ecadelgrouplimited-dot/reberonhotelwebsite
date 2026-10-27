# reberonhotelwebsite — Reberon Hotel Suite (`reberonhotel.com`)

The complete digital platform for **Reberon Hotel, Kapchorwa** (`reberonhotel.com`): a public hospitality website (`apps/web`), **the House** high-density management & operations suite (`apps/admin`), and the backend API engine (`apps/api`). Technology created and managed by **ECADEL GROUP LIMITED** (`ecadelgroup.com`).

- **Master Specification:** [`docs/REBERON_HOTEL_MASTER_SPECIFICATION.md`](docs/REBERON_HOTEL_MASTER_SPECIFICATION.md) & [`docs/RERERON_HOTEL.md`](docs/RERERON_HOTEL.md)
- **Feature Registry:** [`docs/FEATURES.md`](docs/FEATURES.md) (Movements I–V)
- **Architecture & Engineering:** [`docs/planning/`](docs/planning/00-README.md)

## What is here

| App | Port | What it is |
|---|---|---|
| `apps/web` | 3000 | Public website (`reberonhotel.com`, Next.js 16): rooms, booking engine, virtual tours, verify portal (`/verify`). |
| `apps/admin` | 3001 | The House (`house.reberonhotel.com`, Next.js 16): Front Desk, Room Rack, Housekeeping Dispatch, Dual POS (Kitchen/Bar/Health Club/Conference), Health Club & Spa, Quotations & Events, Segregated Inventory & Linen, Requisitions, CMS, People & Access, and Reports. |
| `apps/api` | 4000 | Backend Engine (`api.reberonhotel.com`, NestJS 11, PostgreSQL, Redis, BullMQ). |

| Package | Purpose |
|---|---|
| `packages/contracts` | Zod schemas, block registry, DTOs, granular RBAC permissions (`@reberon/contracts`). |
| `packages/db` | Prisma 7 schema, migrations, and comprehensive reference + demo seeds (`@reberon/db`). |
| `packages/media` | Sharp WebP responsive image pipeline, blur placeholders, and storage (`@reberon/media`). |
| `packages/utils` | Minor-unit dual-currency money (`UGX`/`USD`), Kampala timezone helpers, phone normalization (`@reberon/utils`). |
| `packages/ui` | Shared design tokens (`@reberon/ui`). |

## Run it locally

Requires Node 22+, pnpm 10, Docker.

```bash
pnpm install
cp .env.example .env
pnpm infra:up          # Postgres :5433, Redis :6380, Mailpit :8025
pnpm db:migrate        # apply Prisma schema migrations
pnpm db:seed           # seed settings, rooms, pages, bookings, POS, inventory & staff
pnpm dev               # web :3000 · admin :3001 · api :4000
```

Sign in to the House at <http://localhost:3001> with any seeded account (`SEED_PASSWORD` in `.env`):

| Official Email | Role |
|---|---|
| `owner@reberonhotel.com` | Owner / Super Admin (Denis Mayamba) |
| `wilson@ecadelgroup.com` | Owner / Super Admin (Wilson Ecaat) |
| `manager@reberonhotel.com` | Manager (Grace Chemutai) |
| `desk@reberonhotel.com` | Front Desk (Brian Cheptoek) |
| `housekeeping@reberonhotel.com` | Housekeeping (Sarah Chelangat) |
| `bar@reberonhotel.com` | Bar POS Attendant (Samuel Kiprop) |
| `kitchen@reberonhotel.com` | Head Chef / Kitchen KDS (Chef Isaac Mangusho) |
| `gym@reberonhotel.com` | Health Club & Spa Attendant (Coach Daniel Cherop) |

All outbound email notifications (booking confirmations, receipts, staff alerts, invitations, and direct credential dispatches) run by default through **`alerts@reberonhotel.com`** (captured in Mailpit at <http://localhost:8025> in development).
