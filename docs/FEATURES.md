# Reberon Hotel Suite — what has been built

*Status as of 1 October 2026.*

This document lists every feature that exists today, where to find it, and what is switched off until the hotel is ready.

The plan behind it lives in [`docs/planning/`](planning/00-README.md). Steps to go live are in [`planning/13-deployment.md`](planning/13-deployment.md).

The suite has three parts:

| Part | Who uses it | Address in development |
|---|---|---|
| **The website** | Guests | `http://localhost:3000` |
| **The House** (management platform) | Hotel staff | `http://localhost:3001` |
| **The API** | Both of the above; never used directly | `http://localhost:4000` |

Nothing guest-facing is hard-coded. Every word, photo, price and page on the website comes from the House.

## At a glance

| Area | Spec modules | State |
|---|---|---|
| Website, rooms, Kapchorwa guide, enquiries, first-stay list | M01–M03, M10, M11, M19 | **Live** |
| Content management (pages, media, publishing) | M01, M22 | **Live** |
| Rates, availability, online booking, payments, confirmations | M05–M09, M12, M21 | Built, **switched off** until rates and Pesapal keys exist |
| Front desk, room rack, housekeeping, guests, feedback, reports | M12–M15, M21 | **Live** in the House |
| Virtual tours | M04 | Built, **switched off** until the owner is ready |
| Messages to guests (email, SMS, WhatsApp) | M09, M10 | Email **live**. SMS and WhatsApp work by hand until their keys are entered |
| Integrations vault (Pesapal, SMS, WhatsApp, email keys) | M22 | **Live**, empty |
| People and access | M22 | **Live** |
| Receipts, refund notes, invoices | M08, M09 | **Live** |
| Deployment and continuous integration | — | Ready; waits for a domain and a server |

Features marked "switched off" are flipped on by the owner in **Settings → Features**. No developer is needed.

---

## 1. The website (for guests)

**Pages built from blocks.** Every page is a stack of blocks that staff arrange in the House. The available blocks are:

- Hero, story, stats, features
- Room grid and room spotlight
- Facilities
- Gallery (masonry, filmstrip or mosaic)
- Hotel-rising timeline
- Destination cards, journey, seasons
- Quote, questions (FAQ), contact card, map
- Enquiry form, first-stay form, call-to-action band
- Live weather strip, guest voices, virtual tour, package cards
- Rich text, spacer

Other website features:

- **Rooms.** A page per room type with:
  - a gallery and the room's facts (sleeps, bed, size, view)
  - amenities and a starting price, switchable between UGX and USD
  - a "walk this room" tour, once tours are switched on
- **Kapchorwa.** A guide to Sipi Falls, Mount Elgon, coffee, getting here and when to come.
- **Hotel rising.** Construction progress with photos and milestones.
- **Contact.**
  - Click-to-chat on WhatsApp, with the room and dates already in the first message.
  - An enquiry form that lands in the House inbox.
  - The guest gets an acknowledgement with the reply-time promise.
- **First-stay list.** Before opening, guests claim a first stay: name, phone, dates and room type.
- **Online booking at `/book`** (switched off for now):
  - Search, then a room, then extras, then the guest's details, then payment.
  - Real availability and prices for every night.
  - Rooms are held for 20 minutes while the guest pays.
  - Payment by Pesapal (card and mobile money).
- **Your stay at `/stay`.** Guests find their booking with the booking code and their phone number. There they can:
  - see the dates, room and what they have paid
  - pay the balance
  - open and print their receipts and invoices
  - tell the hotel how the stay was

  Optionally, a guest must also enter a code texted to them (once SMS is connected).
- **Check a receipt at `/verify`.** Anyone holding a Reberon receipt can confirm it is genuine using its number and check code.
- **Honesty rules.**
  - Drawings and renders are labelled as drawings.
  - Construction progress shows only what really exists.
  - "Coming soon" facilities are labelled as such.
- **Built to be found and fast.**
  - Search-engine data (hotel, rooms, FAQs, breadcrumbs), a sitemap and share images.
  - Scroll animations that need no JavaScript.
  - Images served at the right size for each screen.

## 2. The House (for staff)

Each person sees only the screens their access allows (see §3.1).

### Everyday
- **Today.** The day at a glance: arrivals, messages, website health.
  Housekeeping staff land straight on their cleaning list instead.
- **Inbox.** Website enquiries and WhatsApp conversations in one list. Staff assign, reply and close them.
- **First-stay list.** Who asked for a first stay. Staff contact them, then convert them into a reservation in one step.
- **Sent messages.** Every email, SMS and WhatsApp sent to a guest. Messages for channels that are not connected yet wait here, with a one-tap "send from WhatsApp" link.

### Website
- **Publishing.** Every unpublished change across the site, in one place.
- **Pages.** A block page builder with:
  - autosaved drafts and a live preview of the real site
  - scheduled publishing and version history with restore
  - automatic redirects when a page's address changes

  Changes appear on the website within about a second of publishing.
- **Content editors.** Rooms, facilities, virtual tours, Kapchorwa guide, hotel rising, questions, navigation and redirects.
- **Media.** A photo and document library:
  - drag-and-drop upload, with every size generated automatically
  - "replace everywhere" for a photo
  - images in use cannot be deleted by accident
- **Virtual tours.** One tour per place: each room type, the hall (cleared and set for forty), lobby, compound and "beyond the gate".
  - Sources: Matterport, Kuula, YouTube or Vimeo, or an **image walk** built from the media library before any scan exists.
  - Hotspots state facts: the bed, the bath, the view, how many it sleeps.
  - A **live** tour added later replaces the pre-opening one everywhere, with no page edits.
  - Anonymous analytics show who walked a room and then booked and paid.

### Bookings
- **Reservations.**
  - Every booking, whatever the source: website, WhatsApp, phone or walk-in.
  - New bookings for phone and WhatsApp guests, either confirmed straight away or held with a payment link.
  - Each booking page shows:
    - the bill, with every charge and payment in order; lines are never edited
    - payments, refunds and cancellations, with the refund worked out from the booking's cancellation terms
    - notes, messages to the guest, receipts and history
- **Calendar and rates.**
  - Prices per night, per rate plan, in UGX and USD.
  - Rooms available per night; nights can be closed to sale.
  - Rate plans: bed and breakfast, room only, long stay.
- **Extras and packages.** Transfers, guided walks, meals and late check-out. Packages such as First Light, Sipi Sunday and Seed to Cup.
- **Receipts.** The register of every receipt, refund note and invoice (see §3.3).
- **Owner brief.** Tomorrow's arrivals, tonight's occupancy and money received. Emailed to the owners at 19:00.

### The house (daily operations)
- **Front desk.** Designed for a tablet, with 56 px buttons. It shows today's arrivals, guests in the house, departures, and guests who were due earlier but never arrived.
  - **Check-in:**
    - choose a room (clean ones are suggested)
    - take the balance
    - record the ID document; the number is stored encrypted and only the last four digits are ever shown
    - offer to print the receipt
  - **Check-out:**
    - shows the bill and takes the balance
    - handles early departures; only a manager can close a bill with money still owed
    - asks how the stay was
    - produces the numbered invoice, ready to print
  - Walk-ins, no-shows, moving a guest to another room, and adding charges or credits to the bill.
- **Room rack.**
  - Every room by floor: clean, dirty, occupied, inspected, blocked or out of order, with who is in it and who arrives today.
  - A room can be taken off sale for maintenance. If that would oversell a night, it is refused.
- **Housekeeping.** Designed for a phone.
  - Each task goes start → done → inspected.
  - Rooms with a guest arriving today come first.
  - Stay-over tidies, with a "not today" option.
  - No money or phone numbers are ever shown here.
- **Guests.** One profile per person:
  - the whole stay history, stays and nights
  - preferred room, tags, VIP flag and notes
  - what they told the hotel

  Returning guests show as "2nd stay" at the desk. Duplicate records are spotted and can be merged.
- **Feedback.** Good / OK / Not good, from the desk or the guest's stay page. Anything less than good waits until someone deals with it. With the guest's consent, the owner can put their words on the website as "Guest voices".
- **Reports.** Occupancy, average rate (ADR) and revenue per available room (RevPAR). Also room revenue and money received, where bookings come from and how far ahead people book, with a CSV export. UGX and USD are never mixed.

### Admin
- **Settings.**
  - Hotel details, contact numbers and check-in times.
  - Receipt details: company name, TIN, VAT, footer, default paper.
  - Search defaults.
  - Feature switches (owner only).
- **Messages.** The words guests receive, editable for each message and channel:
  - confirmation, failed payment, hold ended, cancellation
  - "before you come", "are you still coming?", thank you
  - receipt, one-time code

  Each comes with a live preview, an SMS length counter and a test send.
- **Integrations** (owner only). Keys for Pesapal, Africa's Talking SMS, the WhatsApp Cloud API and email. Each has sandbox/live modes and a test-connection button.
- **People and access** (owner only). See §3.1.
- **Audit log.** Who changed what, and when, for every action in the House.

## 3. Features in more depth

### 3.1 People and access
- **Not everyone signs in.** Cleaners and guards can be on the staff list without a login. They can still be given rooms to clean.
- **Access is per person.** The role is only a starting point: owner, manager, front desk or housekeeping. The owner switches single permissions on or off for each person. There are 37 permissions, each described in plain words, and those that touch money are marked.
- **Sign-in hours** (Kampala time) and an **access end date** for relief or seasonal staff.
- **Changes apply on the person's next click.** There is also a "sign out everywhere" button and a list of signed-in devices.
- **Owner-only powers** stay with owners: managing people, holding keys, switching features. Nobody can change their own access, and the last owner cannot be locked out.

### 3.2 Money
- Amounts are stored exactly, in UGX and USD, and never converted between the two.
- The bill is append-only: a mistake is corrected with a new line, never by editing an old one.
- Two guests can never get the last room. The database refuses it, and this was tested with five simultaneous bookings.
- One room can never be given to two stays on the same night. The database refuses that too.
- Pesapal payment notifications are double-checked with Pesapal and counted once, even if they arrive twice.
- Unpaid holds release their rooms automatically.

### 3.3 Receipts, refund notes and invoices
- **What is issued.**
  - A **receipt** for every payment. It is emailed automatically when the guest paid online.
  - A **refund note** for every refund.
  - An **invoice** at check-out.
  - Numbers run in order with no gaps, e.g. `RCT-2026-00001`, `RFD-…`, `INV-…`.
- **What a document shows.**
  - It is frozen once issued: a reprint shows exactly what the guest was given.
  - The first print says ORIGINAL; later prints say COPY 2, 3…
  - The amount in words ("Uganda Shillings … Only"), the payment method and reference, and the balance.
  - The TIN, the VAT included (when the hotel is VAT-registered) and a **check code**.
- **Printing and sending.**
  - Print on A4 or an **80 mm receipt printer**.
  - Send by email, SMS or WhatsApp.
  - Guests can open their own copies.
- **Corrections.** A document is **voided** (watermarked VOID, with the reason) and a corrected one reissued, for example in a company's name.
- A **statement** of the live bill can be printed at any time. It says "not a receipt".
- The register shows totals and exports to CSV for the accountant.
- These are hotel documents, not URA EFRIS fiscal invoices.

### 3.4 Messages to guests
- **Sent automatically:**
  - the confirmation
  - "payment did not go through" and "hold ended"
  - the cancellation notice
  - the **pre-arrival note** at 10:00 the day before arrival
  - the thank-you after check-out
  - the receipt after an online payment
- **Sent by the desk** from a reservation: "are you still coming?", or any other message.
- **Channels:** email, SMS and WhatsApp. A WhatsApp message goes only to guests who opted in.
- **Nothing is ever lost.** A channel that is not connected yet records the message for staff to send by hand.

### 3.5 Security
- **Keys:** encrypted in the database and never sent to a browser.
- **Sign-in and sessions:**
  - accounts lock after five failed sign-ins
  - sessions rotate, and a stolen session token is detected
- **Requests and website forms:**
  - every staff action carries an anti-forgery header
  - website forms are rate-limited
- **Every staff action is audited.** The API enforces every permission. The screens only hide what a person cannot use.

## 4. What is switched off, and what it waits for

| Switch or item | Waits for | Where |
|---|---|---|
| Online booking | Confirmed rates and Pesapal keys | Settings → Features, Integrations |
| Virtual tours | The owner's go-ahead; later, a camera walk | Settings → Features, Website → Virtual tours |
| SMS | An Africa's Talking account and an approved sender ID | Integrations |
| WhatsApp Cloud API | A WhatsApp Business number and Meta-approved message templates | Integrations, Messages |
| Code by SMS for "your stay" | SMS live | Settings → Features |
| VAT line on invoices | VAT registration and a TIN | Settings → Receipts and invoices |
| Production website | The domain and a server | [`planning/13-deployment.md`](planning/13-deployment.md) |

Spec items deliberately left for later:

- Events and hall bookings (M17)
- Food and drink posting at a till (M18)
- Group quotes (M19)
- Booking-portal channel management (M20)
- Other languages

Open questions for the owner, such as the room mix, real phone numbers and logo, are listed in [`planning/12-decisions-log.md`](planning/12-decisions-log.md).

## 5. Trying it

- **Start:**
  ```sh
  pnpm infra:up
  pnpm dev
  ```
  Full setup is in the [README](../README.md).
- **Demo sign-ins.** The password is `Reberon@Elgon1900` for every account:

  | Account | Role |
  |---|---|
  | `owner@reberonhotel.com` | Owner |
  | `manager@reberonhotel.com` | Manager |
  | `desk@reberonhotel.com` | Front desk |
  | `housekeeping@reberonhotel.com` | Housekeeping |
  | `relief.desk@reberonhotel.com` | Front desk without "take payments", 07:00–19:00, access ends after three months |

- **Demo data:**
  - three months of past stays, with guests in the house and arrivals today
  - a dirty room and a room under maintenance
  - a duplicate guest to merge (Grace Chebet)
  - two staff without a login
  - receipts and invoices for the history

  Every demo row is marked and can be removed on launch day in one step.

## Appendix: for developers

| | |
|---|---|
| **Repository** | pnpm + Turborepo monorepo |
| **Apps** | `apps/web` (Next.js 16), `apps/admin` (Next.js 16), `apps/api` (NestJS) |
| **Packages** | `db` (Prisma 7 / PostgreSQL 16), `contracts` (Zod schemas and types shared by all three apps), `media`, `ui`, `utils` |
| **Infrastructure** | Redis with BullMQ for queues and scheduled jobs; Mailpit for email in development |
| **Tests** | 33 API integration tests (`pnpm --filter @reberon/api test`); typecheck and lint across the repo; CI in `.github/workflows/ci.yml` |
| **Deploy** | Docker Compose with Caddy; `infra/deploy.sh`, `infra/backup.sh` |
| **Decisions** | ADR-001 to ADR-025 in [`planning/12-decisions-log.md`](planning/12-decisions-log.md) |
