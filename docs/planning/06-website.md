# 06 · Public Website (the Face) — `apps/web`

Domain `reberonhotel.com`. Own voice, not a page on the construction company's site. Mobile first: *a booking or enquiry that works on a phone in a moving vehicle.*

## 1. Sitemap (Movement I)

```
/                               Home                         Page(kind=HOME)
/rooms                          Rooms index                  Page(kind=ROOMS_INDEX) + RoomType[]
/rooms/[slug]                   Room type                    RoomType
/about                          About the house              Page(kind=ABOUT)
/rising                         Watch the hotel rise         Page(kind=PROGRESS) + ProgressUpdate[]
/rising/[slug]                  Single progress update       ProgressUpdate
/facilities                     Facilities                   Page(kind=FACILITIES) + Facility[]
/kapchorwa                      Destination index            Page(kind=DESTINATION_INDEX) + Destination[]
/kapchorwa/[slug]               Sipi · Elgon · Coffee · The road · Getting here · When to come
/first-stay                     Claim a first stay (waitlist) Page(kind=LANDING) + waitlistForm block
/contact                        Contact                      Page(kind=CONTACT)
/enquire                        Enquiry (also a sheet from any page)
/legal/[slug]                   Privacy · Booking terms · Cancellation   Page(kind=LEGAL)
/[...slug]                      Any other CMS page (kind=STANDARD/LANDING) — managers can create pages
/sitemap.xml  /robots.txt  /opengraph-image (per route)  /manifest.webmanifest
```

Movement II adds `/book` (search → room → extras → guest → pay), `/stay` (guest lookup), `/packages`, `/packages/[slug]`. Movement III adds tour launchers on room pages and checkout.

Every route segment is data-driven: the router asks the API for the page by slug; unknown slugs → check `Redirect` → else 404 (with a designed 404 that offers WhatsApp).

## 2. Page compositions (default seed layouts — all editable)

### Home
1. `hero` (mist variant) — "Sleep on the shoulder of Elgon." Sub: *Ten rooms in Kapchorwa, above Sipi, among the coffee.* CTAs: *Claim a first stay* · *WhatsApp us*
2. `stats` — 1,900 m altitude · 10 rooms · 40-seat hall · 15 min to Sipi (all editable; seed values flagged for confirmation)
3. `story` — Why Kapchorwa (short, with photo)
4. `roomGrid` — all room types, from-price
5. `progressTimeline` — latest 3 updates, "Watch the hotel rise →"
6. `destinationCards` — Sipi, Elgon, Coffee, The road
7. `facilities` — only AVAILABLE ones + clearly labelled COMING_SOON
8. `quote` — a line from the owner
9. `faq` — "Before you drive"
10. `ctaBand` — enquire / WhatsApp / call

### Room type `/rooms/[slug]`
Hero gallery (shared-element transition from card) → `RoomFacts` (sleeps, bed, size, view) → description → amenities grid → floor plan (if any) → from-price (UGX, USD toggle when available) → "Walk this room" (Movement III, hidden until a tour exists) → other rooms → sticky mobile bar: *Enquire about this room* (prefilled) · *WhatsApp* (message includes room name).

### Watch the hotel rise `/rising`
Intro (honest, not an apology) → overall percent + current milestone → vertical timeline of `ProgressUpdate` (date, title, photos, text), infinite scroll by cursor → subscribe via waitlist CTA.

### Destination `/kapchorwa/*`
Editorial long-read layout: hero, rich text with pull quotes, galleries, `journey` block for The road (Kampala → Mbale → Kapchorwa with honest hours), `seasonStrip` for When to come, `map` for Getting here with last-mile note and transfer mention (as an extra, when sold).

### Contact
Phone(s) with `tel:` links, WhatsApp, email, pin (map), hours, `enquiryForm`. "No treasure hunt": all above the fold on a phone.

### Legal
`richText` blocks; last-updated date from version publish time.

## 3. Global elements

- **Header:** logo, nav from `NavigationMenu HEADER`, primary CTA (from settings: *Claim a first stay* in waitlist mode → *Book* when `features.bookingEnabled`).
- **Mobile sticky action bar:** WhatsApp · Call · Enquire. Visible after the hero, hides while typing in forms.
- **Enquiry sheet:** opens from any CTA without leaving the page; carries context (page, room type, dates).
- **Footer:** contact, hours, nav columns, legal links, "Built by Ecadel Group" (setting), social.
- **Currency toggle:** UGX / USD, stored in a cookie; prices without a USD value show UGX only (no silent conversion).
- **Theme toggle:** light / Night on Elgon / system.

## 4. Forms

| Form | Required | Optional | After submit |
|---|---|---|---|
| Enquiry | name, (phone **or** email), message, consent | intent, dates, guests, room type | Inline success with reference (`EQ-4F7K`), "We reply on WhatsApp within X hours" (setting), wa.me button to continue there |
| Waitlist | name, phone, consent | email, room type, preferred dates / flexible, adults, children, note | Success with reference + what happens next ("Waitlist is not a booking. We will contact you when the calendar opens.") |

Progressive enhancement: plain HTML `<form>` posting to a Server Action; JS adds inline validation, phone formatting (+256), and optimistic success. Offline/poor network: the form keeps values in `sessionStorage` and retries; the button never double-submits (idempotency key).

## 5. SEO

- Per-page `title`, `description`, canonical, OG/Twitter cards from `seo` JSON with fallbacks to settings.
- Generated share images (`opengraph-image.tsx`) using the page hero + Fraunces title.
- JSON-LD: `Hotel` (name, address, geo, telephone, amenityFeature, starRating omitted until real, `checkinTime`/`checkoutTime` from settings), `HotelRoom` per room type, `FAQPage`, `BreadcrumbList`, `TouristAttraction` for destinations.
- `sitemap.xml` from `/public/pages` + room types + destinations + progress; `robots.txt` blocks staging entirely.
- Redirect table honoured in middleware; slugs immutable after publish.

## 6. Analytics

Privacy-friendly, cookieless (Plausible or Umami, self-hostable — ADR-008). Events: `enquiry_submitted`, `waitlist_submitted`, `whatsapp_click` (with page/room), `call_click`, `currency_toggle`, `room_view`. Movement III adds tour events to our own `TourEvent` table.

## 7. Content source map (nothing hard-coded)

| UI | Source |
|---|---|
| Logo, name, tagline, colours of CTA text | `Setting hotel.*` + `MediaAsset` |
| Every section on every page | `PageVersion.blocks` |
| Nav / footer links | `NavigationMenu` |
| Room facts, photos, prices | `RoomType`, `Amenity`, `MediaAsset` |
| Contact details, hours, map pin | `Setting contact.*` |
| Form labels & success copy | Block `data` (with sensible defaults in contracts) |
| Legal text | `Page(kind=LEGAL)` |
| 404 / error page copy | `Page(slug="404")` — falls back to a safe static string only if the API is unreachable |

The only strings in code are accessibility fallbacks and API-down fallbacks.
