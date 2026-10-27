# Reberon Hotel Suite — Planning Set

Source of truth for *what* we build: [`../Reberon_Hotel_Suite_Module_Feature_Specification.docx`](../Reberon_Hotel_Suite_Module_Feature_Specification.docx) (Ecadel Group, Sept 2026).
This folder is the *how*: architecture, data, API, design, screens, seed data, delivery plan.

When the spec and these documents disagree, the spec wins on **scope**, these documents win on **implementation**. Record every deviation in [`12-decisions-log.md`](12-decisions-log.md).

| # | Document | Answers |
|---|----------|---------|
| 01 | [Product scope](01-product-scope.md) | What the suite is, who uses it, what "dynamic" means, what we will not build |
| 02 | [Architecture](02-architecture.md) | Monorepo layout, apps, packages, runtime, infra, caching, jobs |
| 03 | [Data model](03-data-model.md) | Every table, by module and Movement, with invariants |
| 04 | [API specification](04-api-spec.md) | NestJS modules, endpoints, contracts, errors, webhooks |
| 05 | [Design system](05-design-system.md) | Brand, tokens, type, motion, components, performance budget |
| 06 | [Public website](06-website.md) | Sitemap, page-by-page blocks, SEO, where each piece of content comes from |
| 07 | [Management platform](07-management-platform.md) | "The House": every admin screen, role walls, workflows |
| 08 | [Seed data](08-seed-data.md) | What we seed, how, and how seed data is kept separate from real data |
| 09 | [Roadmap](09-roadmap.md) | Phases, milestones, acceptance criteria per Movement |
| 10 | [Security & RBAC](10-security.md) | Auth, permissions matrix, audit, secrets, threat notes |
| 11 | [Engineering workflow](11-engineering.md) | Conventions, testing, CI, environments, deployment |
| 12 | [Decisions log](12-decisions-log.md) | ADRs and open questions for Denis / Wilson |
| 13 | [Deployment and go-live](13-deployment.md) | The server, CI, and what to plug in when keys and data arrive |

## One-paragraph summary

One platform, three apps. **`web`** (Next.js) is the Face at `reberonhotel.com`: fast, mobile-first, every word and photo pulled from the database. **`admin`** (Next.js) is the House at `suite.reberonhotel.com`: content, inbox, waitlist, and later reservations, desk and housekeeping. **`api`** (NestJS) is the engine behind both, on PostgreSQL and Redis. Nothing a guest reads is hard-coded; the owner and manager edit it in the House, the website revalidates within seconds. We build Movement I (Face) first on a schema that already has room for Movements II–IV and Later.
