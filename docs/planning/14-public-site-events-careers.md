# 14 — Public site: cookie consent, Events, Careers

Status: sections 1–4 shipped 2026-11-25 (ADR-046 cookie consent, ADR-047 events, ADR-048 careers). Still open from this plan: the House consent-stats screen (the API exists), dynamic share images for events/jobs, and a 12-month retention job for consent records.

The public site is the hotel's front door. This phase closes three real gaps — no lawful cookie consent, no events, no careers — and raises the whole site's polish while doing it. Everything guest-facing stays in the database (pages, blocks, navigation); nothing is hard-coded copy.

## 0. Ground truth (what the site actually stores today)

Audited before designing the banner, so the banner tells the truth:

| Where | Name | What | Category |
|---|---|---|---|
| Cookie (first-party) | `rb_at`, `rb_rt`, `rb_session` | Staff sign-in (House) — only for staff | Necessary |
| Cookie (first-party) | `__prerender_bypass`, `__next_preview_data` | Staff preview of unpublished pages | Necessary |
| Cookie (first-party) | `rb_consent` | Remembers this consent choice | Necessary |
| localStorage | `rb-theme` | Light/dark choice the visitor made | Necessary (explicit request) |
| localStorage | `rb-currency` | UGX/USD choice the visitor made | Necessary (explicit request) |
| localStorage | `rb-saved-staff-email` | Staff gate convenience | Necessary |
| localStorage | concierge identity | Sipi Concierge remembers who you are between visits | Preferences |
| localStorage | `rb_tour_sid`, `rb_tour_walked` | Counts virtual-tour visits (anonymous id) | Analytics |
| Third party | YouTube / Vimeo players | Video embeds set their own cookies | Third-party media |
| Third party | 3-D tour providers (Kuula, Matterport…) | Tour iframes set their own cookies | Third-party media |
| Third party | Cloudflare Turnstile (forms) | Bot check on forms | Necessary (security) |

OpenStreetMap map tiles set no cookies. There are no ad or analytics trackers.

## 1. Cookie consent — genuine, not decorative

Law: Uganda Data Protection and Privacy Act 2019 (consent, purpose limitation) and GDPR/ePrivacy for European guests (prior consent for non-essential storage, reject as easy as accept, withdrawable, recorded).

- **One registry** in `packages/contracts/src/consent.ts`: categories, every cookie/storage key with purpose, duration and provider. The banner, the settings panel and the cookie-policy table all read it — they cannot drift apart.
- **Categories**: Necessary (always on, explained), Preferences, Analytics, Third-party media. Default: all optional ones **off**.
- **Banner**: Accept all · Reject all (same size and weight) · Choose. Not a wall: the site stays usable. Keyboard and screen-reader accessible; respects reduced motion.
- **Global Privacy Control / Do Not Track**: honoured as "reject optional" unless the visitor opts in.
- **Storage**: `rb_consent` first-party cookie (version, choices, id, time), 180 days; re-asked when the registry version changes.
- **Proof**: each choice is logged server-side (`ConsentRecord`: anonymous id, choices, version, policy hash, truncated IP, user agent, time) — what a regulator asks for. Kept 2 years.
- **Enforcement** (the part most banners skip):
  - Concierge memory only persists with *Preferences*; otherwise the session forgets on close.
  - Tour visit counter only with *Analytics*.
  - YouTube/Vimeo and 3-D tours load behind a click-to-load facade unless *Third-party media* is on; YouTube uses `youtube-nocookie.com`.
  - Withdrawing consent deletes the stored keys immediately.
- **Cookie settings** link in the footer (DB nav item `#cookie-settings`) reopens the panel anywhere.
- **Cookie policy** page `/legal/cookies` (CMS page) with a `cookieTable` block that renders the registry live.
- **House**: Settings → Privacy shows consent stats (accept/reject/custom rates, last 30 days) — no personal data.

## 2. Events — public and House

Events are what happens *at* the hotel that the public can come to: coffee-harvest weekends, live music on the terrace, Sipi trail runs, cultural evenings, wine tastings, conference days open to the public.

**Data**: `Event` (localised title/summary/body, slug, category, cover + gallery, startsAt/endsAt in Africa/Kampala, venue (in the hotel or elsewhere), price per person as bigint minor + currency or free, capacity, RSVP open/closed, status DRAFT/PUBLISHED/CANCELLED, featured, SEO). `EventRegistration` (code, name, phone, email, party size, notes, status CONFIRMED/WAITLISTED/CANCELLED/ATTENDED, source).

**Public**
- `/events` — CMS page (kind `EVENTS`) with the new `eventList` block: upcoming first, grouped by month, filter by category, past events below; empty state invites to the newsletter/waitlist.
- `/events/[slug]` — hero, when/where with live countdown, "add to calendar" (.ics + Google), map, price, seats left ("only 6 seats left" when under 20%), RSVP form (party size, capacity-aware, waitlist when full), share sheet, JSON-LD `Event` (rich results), dynamic share image.
- RSVP confirmation email with the .ics attached and a manage link (cancel own RSVP).
- `upcomingEvents` block for the home page and anywhere else.
- Sitemap + revalidation on every change.

**House**: Website → Events (list with seats taken, editor via the shared entity editor) and an event's Guest list (registrations, check-in at the door, cancel, export CSV, print). New registrations alert the desk (notification rule `EVENT_RSVP`). Permissions: `content:write` to publish; `events:manage` for guest lists.

## 3. Careers — share jobs, receive applications, hire

**Data**: `JobPosting` (localised title/summary/description/requirements/benefits, slug, department, employment type, location, openings, salary range minor+currency with show/hide, closing date, status DRAFT/OPEN/CLOSED, questions). `JobApplication` (code, job, name, email, phone, location, cover letter, CV file (private), answers, consent, status pipeline NEW → REVIEWING → SHORTLISTED → INTERVIEW → OFFERED → HIRED / REJECTED / WITHDRAWN, rating, notes timeline, source).

**Public**
- `/careers` — CMS page (kind `CAREERS`) with `jobList` block: open roles by department, "why work here" blocks editable around it, "no openings — leave your CV" general application.
- `/careers/[slug]` — the role, what you'll do, what we look for, benefits, closing date, share sheet (WhatsApp, Facebook, LinkedIn, X, email, copy link, native share), JSON-LD `JobPosting` (Google for Jobs), apply form: CV upload (PDF/DOC/DOCX ≤ 5 MB, type-sniffed), cover letter, answers, data-use consent, Turnstile, idempotent.
- Confirmation email to the applicant with their reference; status emails (shortlisted, interview, not selected) from the House with editable wording.
- CVs live in **private storage** (`private/applications/…`), never under the public media path; downloaded only by staff with `careers:manage`, every download audited.
- Retention: applications deleted 12 months after the job closes (privacy), unless hired.

**House**: HR → Careers: jobs (editor), applications board by stage, application view (CV preview, notes, rating, status with optional email), "Hire" → creates the HR staff profile prefilled. Notification rule `NEW_APPLICATION` (HR, Manager). Permission `careers:manage` (HR, Manager).

## 4. Shared polish that ships with these

- Share sheet component (native share on phones, links elsewhere, copy with confirmation).
- Dynamic Open Graph images for events and jobs (branded, title + date/department).
- Sitemap and robots include events and jobs; closed jobs `noindex`.
- Every new page: skip link, landmarks, focus states, reduced motion, dark mode, 360 px phones.

## 5. Later (next phases, not in this one)

Newsletter with double opt-in; public site search; multilingual (fields are already localised); gift vouchers; package pages; guest reviews feed; accessibility statement page; Lighthouse budget in CI.

## 6. Order of work

1. Consent registry + banner + enforcement + policy block + logging.
2. Events: schema → API (admin + public) → House screens → public pages → emails → sitemap.
3. Careers: schema → API (admin + public, private CV storage) → House screens → public pages → emails.
4. Navigation items (footer: Events, Careers, Cookie settings, Cookie policy) via a data migration so existing sites get them.
5. Tests with TEST data, cleanup, ADRs.
