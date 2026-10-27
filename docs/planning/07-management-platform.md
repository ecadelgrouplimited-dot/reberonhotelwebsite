# 07 · Management Platform (the House) — `apps/admin`

Domain `suite.reberonhotel.com`. `noindex`, strict CSP, cookie auth. Large buttons where staff work fast; dense tables where managers work long.

## 1. Navigation (Movement I build, later items greyed/hidden by feature flag and role)

```
Today (dashboard)
Inbox                         M19/M10
Waitlist                      M11
Website
  ├ Pages                     M01 page builder
  ├ Navigation                M01
  ├ Rooms                     M02 room types + amenities
  ├ Facilities                M01
  ├ Destination               M03
  ├ Hotel rising              M01 progress updates
  ├ FAQs                      M01
  ├ Testimonials              (IV)
  └ Redirects                 M01 SEO
Media                         M22
── Movement II ──
Reservations · Calendar · Rates · Packages & extras · Payments · Messages (templates)
── Movement IV ──
Desk · Room rack · Housekeeping · Guests
── Owner ──
Brief (M21) · Reports
Settings
  ├ Hotel · Contact · SEO defaults · Features
  ├ Users & roles             M22
  ├ Integrations (vault)      (II)
  └ Audit log                 M22
```

## 2. Screens — Movement I

### Login / invite / reset
Email + password; optional TOTP for OWNER (encouraged). Invite link sets password. Lockout after 5 failures (15 min).

### Today (dashboard)
KPI tiles: new enquiries (24 h), open conversations, waitlist total + by room type, drafts awaiting publish. Lists: newest enquiries (click → inbox), latest waitlist names, recent activity (audit). Quick actions: *New progress update*, *Upload photos*, *Edit home page*. Role-aware: HOUSEKEEPING never lands here (goes to their list in IV).

### Inbox
Three-pane: filters (status, channel, intent, assignee) · conversation list (unread bold, age, channel icon) · thread (messages, internal notes in amber, contact card, context chips: room, dates, guests, source page). Actions: assign to me / someone, mark waiting / done / spam, reply (email now; WhatsApp when Cloud API lands; until then *Open in WhatsApp* with the prefilled reply), convert to waitlist, (II) convert to reservation. Keyboard: `j/k`, `e` done, `a` assign. Real-time: new items appear via SSE.

### Waitlist
Table: name, phone, room type, preferred dates, flexible, guests, status, age. Filters and saved views ("Wants Elgon View in December"). Row → side panel with notes, status changes, "Open WhatsApp", history. Export CSV. (II) *Convert to reservation* — one action pre-fills booking.

### Pages (page builder)
- List: title, slug, kind, status, last published, author.
- Editor layout: left — block list (drag to reorder, add from a visual palette with thumbnails, duplicate, hide); centre — block form (auto-generated from the Zod block schema: localized text, rich text, media pickers, entity pickers for rooms/facilities/destinations, CTA builder); right — **live preview** iframe of the web app in draft mode with device-width toggle.
- Publish bar: *Save draft* (autosave every 5 s), *Preview*, *Publish*, *Schedule…*, version history with *Restore*. Validation errors block publish and point to the block.
- SEO tab: title/description with length meters, share image, Google result preview, noindex.

### Rooms (catalogue)
List with drag-order and status. Edit: name, tagline, description, sleeps, bed configuration, size, view, amenities (multi-select with icons), hero + gallery (reorder, mark as rendering), floor plan, from-price UGX / USD, SEO. Preview on the site. Amenities managed on a sub-tab.

### Facilities · Destination · FAQs · Redirects
Standard list + editor pattern, same components (LocalizedField, RichText, MediaPicker, status, order). Destination editor includes route stops (for The road) and a map pin picker.

### Hotel rising (progress)
Fast mobile-friendly composer (Wilson/Denis on site with a phone): title, date (defaults today), milestone, percent complete, photos (multi-upload straight from camera), text. Publish → appears on `/rising` within seconds.

### Media library
Grid/list, folders, tags, search, filter by kind / rendering vs photo / unused. Upload by drag-drop or phone camera; progress per file; processing state. Detail: preview at all variants, focal point picker (click on image), alt text (required), caption, credit, "Drawing / render" toggle, usages list. Delete blocked while in use.

### Settings
Grouped forms: Hotel (name, tagline, timezone locked to Africa/Kampala, currencies, check-in/out times), Contact (phones, WhatsApp, email, address, map pin, hours, response-time promise), SEO defaults, Features (booking enabled, waitlist enabled, progress visible, tours enabled) — OWNER only for Features.

### Users & roles
OWNER only: invite, change role, disable, reset MFA, see last login. Role descriptions shown in plain words (from the spec's "Who may touch what").

### Audit log
Filterable by actor, entity, action, date; shows a before/after diff.

## 3. Movement II–IV screens (designed now, built later)

| Screen | Essence |
|---|---|
| Calendar | Room types × dates grid: available / held / sold / blocked; drag to close-out; min-stay badges |
| Rates | Rate plan × room type × date grid, UGX and USD columns side by side, bulk fill by date range + weekday |
| Reservations | List + detail: status timeline, guest, rooms, nightly rates, folio, payments, notes, amend/cancel with policy preview, resend confirmation |
| Payments | Intents and their statuses, cleared vs promised, refunds |
| Messages | Template editor per channel with variable picker and test-send |
| Owner brief | Tomorrow: arrivals (names), occupancy %, money cleared today, unpaid holds; same content as the 19:00 message |
| Desk (IV) | Touch density. Tabs: Arrivals · In-house · Departures. Big actions: *Check in*, *Take payment*, *Check out*, *Walk-in*. Find guest by phone/name |
| Room rack (IV) | Floor plan tiles coloured by status; tap to change; assign on arrival |
| Housekeeping (IV) | Phone-first list: rooms to make → tap *Clean* → (optional) *Inspected*. No payments visible |
| Guests (IV) | Profile, stay history, preferred room type, merge duplicates, second-stay badge |

## 4. UX rules

- Every destructive action confirms with the object's name. Money actions confirm with the amount and currency.
- Every list has an empty state that says what to do next.
- Unsaved changes guard on navigation.
- Optimistic UI only for reversible actions (status changes); never for money.
- All timestamps shown in Africa/Kampala with relative time on hover.
- Works on a tablet at the desk and a phone on the building site.
