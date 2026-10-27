# 11 · Engineering Workflow

## 1. Local setup

```
pnpm install
cp .env.example .env
pnpm infra:up            # postgres, redis, minio, mailpit (docker compose)
pnpm db:reset            # migrate + seed (reference + demo + placeholder media)
pnpm dev                 # web :3000 · admin :3001 · api :4000 · mailpit :8025 · minio :9001
```

Default logins after seed: `owner@reberonhotel.com`, `manager@…`, `desk@…`, `housekeeping@…` with `SEED_PASSWORD`.

## 2. Conventions

| Area | Rule |
|---|---|
| Language | TypeScript strict everywhere; no `any` without a comment |
| Naming | Files kebab-case; React components PascalCase; DB models PascalCase singular; routes plural nouns |
| Contracts first | New endpoint = Zod schema in `packages/contracts` → controller → service → test → consumer |
| Imports | Apps may import packages; packages never import apps; `contracts` has no runtime deps besides zod |
| Styling | Tokens only (no raw hex in components); Tailwind classes via `cn()`; component variants with `cva` |
| Server/client | Web defaults to Server Components; `"use client"` only for interaction/motion islands |
| Commits | Conventional Commits (`feat(web): …`, `fix(api): …`), enforced by commitlint |
| Branches | `main` (deployable) ← short-lived feature branches; PR required, CI green, 1 review |
| Docs | Behaviour change → update the relevant doc in `docs/planning` in the same PR |

## 3. Testing

| Layer | Tool | Scope |
|---|---|---|
| Unit | Vitest | utils (money, dates, codes), block schemas, services with mocked Prisma where trivial |
| API integration | Jest + Supertest against a real Postgres (testcontainers or CI service) | Every endpoint: happy path, validation, RBAC walls, audit rows written |
| Contract | Zod parse of API responses in web/admin tests | No drift between api and consumers |
| E2E | Playwright | Web: home loads, room page, enquiry submit (JS and no-JS), waitlist; Admin: login, edit + publish page → visible on web, inbox reply |
| Visual | Playwright screenshots of block gallery page, light + dark, 375/1280 | Catch design regressions |
| Performance | Lighthouse CI on key web routes | Budgets from [05 §8](05-design-system.md) fail the build |
| Accessibility | axe via Playwright | Zero serious/critical violations |

Critical Movement II tests (planned): concurrent holds on last room, webhook replay, currency integrity, amend/cancel ledger correctness.

## 4. CI (GitHub Actions)

`install (pnpm cache) → lint → typecheck → unit → api integration (postgres+redis services) → build all → e2e (web+admin against seeded db) → lighthouse (web)`. Turborepo remote cache for speed. Preview deploys of web/admin per PR (optional).

## 5. Environments & deploy

- Docker images per app (multi-stage, Node 24 alpine, non-root).
- Production host: Docker Compose on a VPS, Caddy for TLS and HTTP/3, images from GHCR; zero-downtime via rolling restart.
- Migrations run as a one-off job before api rollout; backward-compatible migrations only (expand → migrate → contract).
- Observability: pino → log shipper; Sentry for errors and performance; uptime checks on `/v1/health`, web home and admin login.

## 6. Definition of done

Code + tests + types + lint pass · a11y checked · reduced-motion checked (web) · audit rows for new admin mutations · seed updated so the feature has data · docs updated · demoed on staging.
