import { rt, zBlocks, type Cta } from '@reberon/contracts';
import type { PageKind } from '../../src/index.js';
import { prisma, en, log, seedImage, bid, REFRESH } from '../lib.js';

type B = { id: string; type: string; variant?: string; tone?: string; anchor?: string; data: Record<string, unknown> };
const block = (type: string, data: Record<string, unknown>, extra: Partial<B> = {}): B => ({ id: bid(type), type, data, ...extra });

const cta = (label: string, action: Cta['action'], style: Cta['style'] = 'primary', href?: string) => ({ label: en(label), action, style, ...(href ? { href } : {}) });

interface Refs {
  rooms: Record<string, string>;
  facilities: Record<string, string>;
  destinations: Record<string, string>;
  faqs: Record<string, string>;
}

async function upsertPublishedPage(slug: string, kind: PageKind, title: string, blocks: B[], seo: { title?: string; description?: string } = {}, publishedById?: string) {
  const parsed = zBlocks.safeParse(blocks);
  if (!parsed.success) {
    console.error(JSON.stringify(parsed.error.issues.slice(0, 5), null, 2));
    throw new Error(`Seed page "${slug}" has invalid blocks`);
  }
  const seoJson = { ...(seo.title ? { title: en(seo.title) } : {}), ...(seo.description ? { description: en(seo.description) } : {}) };
  const existing = await prisma.page.findUnique({ where: { slug } });
  if (existing) {
    if (!REFRESH || !existing.isSeed) return;
    const last = await prisma.pageVersion.findFirst({ where: { pageId: existing.id }, orderBy: { version: 'desc' } });
    const v = await prisma.pageVersion.create({ data: { pageId: existing.id, version: (last?.version ?? 0) + 1, title: en(title), blocks: blocks as object[], seo: seoJson, publishedById } });
    await prisma.page.update({ where: { id: existing.id }, data: { title: en(title), draftBlocks: blocks as object[], draftSeo: seoJson, draftVersion: { increment: 1 }, publishedVersionId: v.id, status: 'PUBLISHED' } });
    return;
  }
  const page = await prisma.page.create({
    data: { slug, kind, title: en(title), draftBlocks: blocks as object[], draftSeo: seoJson, status: 'PUBLISHED', isSeed: true, updatedById: publishedById },
  });
  const version = await prisma.pageVersion.create({
    data: { pageId: page.id, version: 1, title: en(title), blocks: blocks as object[], seo: seoJson, publishedById },
  });
  await prisma.page.update({ where: { id: page.id }, data: { publishedVersionId: version.id } });
}

export async function seedPages(refs: Refs, ownerId: string) {
  const img = (key: string, scene: Parameters<typeof seedImage>[0]['scene'], label: string, mood?: 'dawn' | 'mist' | 'day' | 'dusk' | 'night') =>
    seedImage({ key: `page-${key}`, scene, mood, label, alt: label, folder: 'Pages' });

  const heroDawn = await img('home-hero-1', 'ridge', 'Elgon at first light', 'dawn');
  const heroMist = await img('home-hero-2', 'ridge', 'Mist on the escarpment', 'mist');
  const heroDusk = await img('home-hero-3', 'ridge', 'Dusk over Kapchorwa', 'dusk');
  const whyImg = await img('home-why', 'coffee', 'Coffee on the slope', 'day');
  const quoteImg = await img('home-quote', 'night', 'Night on Elgon', 'night');
  const ctaImg = await img('home-cta', 'road', 'The road up the escarpment', 'dawn');
  const aboutHero = await img('about-hero', 'construction', 'The house going up', 'dawn');
  const aboutStory = await img('about-story', 'garden', 'The compound garden', 'day');
  const aboutGallery = [
    await img('about-g1', 'room', 'A room, as drawn', 'dawn'),
    await img('about-g2', 'hall', 'The hall, as drawn', 'mist'),
    await img('about-g3', 'table', 'Breakfast, as imagined'),
    await img('about-g4', 'ridge', 'The view we built for', 'dusk'),
    await img('about-g5', 'garden', 'The garden terrace', 'day'),
  ];
  const roomsHero = await img('rooms-hero', 'room', 'Rooms that face the mountain', 'dawn');
  const facilitiesHero = await img('facilities-hero', 'table', 'The restaurant');
  const destHero = await img('kapchorwa-hero', 'falls', 'Sipi Falls', 'mist');
  const risingHero = await img('rising-hero', 'construction', 'The site in September', 'dawn');
  const firstStayHero = await img('first-stay-hero', 'ridge', 'Be among the first', 'dawn');
  const contactHero = await img('contact-hero', 'road', 'The last kilometre', 'day');
  await img('share-default', 'ridge', 'Reberon Hotel, Kapchorwa', 'dawn');

  const roomIds: string[] = [];
  const allDest = Object.values(refs.destinations);

  // ── Home ──────────────────────────────────────────────
  await upsertPublishedPage(
    '',
    'HOME',
    'Home',
    [
      block(
        'hero',
        {
          eyebrow: en('Kapchorwa · 1,900 m · Mount Elgon'),
          heading: en('Sleep on the shoulder of Elgon.'),
          sub: en('Ten rooms above Sipi, among the coffee. We are building now and open in 2027 — claim a first stay.'),
          media: [heroDawn, heroMist, heroDusk],
          ctas: [cta('Claim a first stay', 'waitlist'), cta('WhatsApp us', 'whatsapp', 'secondary')],
          showScrollCue: true,
        },
        { variant: 'mist' },
      ),
      block('stats', {
        items: [
          { value: '1,900 m', label: en('above the sea, on the mountain’s northern shoulder') },
          { value: '10', label: en('rooms, each with a window worth waking for') },
          { value: '40', label: en('seats in the hall, for workshops and small weddings') },
          { value: '25 min', label: en('by car to the first of Sipi’s three falls') },
        ],
      }),
      block('nowStrip', { heading: en('Cool air, long light'), showForecast: true, compareKampala: true }, { variant: 'band' }),
      block(
        'story',
        {
          eyebrow: en('Why Kapchorwa'),
          heading: en('People drive here for the mountain. The hotel is where they sleep.'),
          body: rt.md(
            'Kapchorwa sits high on the northern slope of Mount Elgon, above Sipi Falls, in some of the best coffee country in East Africa. It is cool, green and quiet — and until now it has had few places to stay that match the view.\n\nReberon is a small house built for that view: ten rooms, a restaurant that opens early for walkers, a hall for forty, and people who know the road.',
          ),
          media: whyImg,
          ctas: [cta('About the house', 'link', 'ghost', '/about')],
        },
        { variant: 'right' },
      ),
      block('roomGrid', {
        eyebrow: en('Rooms'),
        heading: en('Four ways to wake up here'),
        intro: en('Every room faces the mountain or the garden. Prices are starting figures; bookings open with the calendar.'),
        roomTypeIds: roomIds,
        showFromPrice: true,
      }),
      block('spacer', { size: 'md' }, { variant: 'contour' }),
      block(
        'progressTimeline',
        {
          eyebrow: en('Watch the hotel rise'),
          heading: en('Built in the open'),
          intro: en('We post the site as it is — mud, scaffolding and all. Honest progress, not an apology.'),
          limit: 3,
          showLink: true,
        },
        { tone: 'warm' },
      ),
      block('destinationCards', {
        eyebrow: en('Kapchorwa'),
        heading: en('What you come for'),
        intro: en('Falls, a mountain, coffee on the slope, and a road that climbs the escarpment.'),
        destinationIds: [refs.destinations['sipi-falls'], refs.destinations['mount-elgon'], refs.destinations['kapchorwa-coffee'], refs.destinations['the-road']].filter(Boolean),
      }),
      block(
        'facilities',
        {
          eyebrow: en('In the house'),
          heading: en('Only what exists'),
          intro: en('We list what is built. Things still under construction are marked that way.'),
          facilityIds: [],
        },
        { tone: 'moss' },
      ),
      block('quote', {
        text: en('We wanted a place where the first thing you see in the morning is the mountain, and the second is a good cup of coffee from it.'),
        attribution: en('Denis Mayamba, owner'),
        media: quoteImg,
      }),
      block('faq', { eyebrow: en('Before you drive'), heading: en('Questions people ask first'), faqGroupId: refs.faqs['before-you-drive'] }),
      block('ctaBand', {
        heading: en('Be among the first to stay.'),
        sub: en('Put your name against a room and dates. No payment — we will contact you when the calendar opens.'),
        ctas: [cta('Claim a first stay', 'waitlist'), cta('Ask a question', 'enquire', 'secondary')],
        media: ctaImg,
      }),
    ],
    { description: 'A ten-room hotel in Kapchorwa, above Sipi Falls and among the coffee of Mount Elgon. Opening 2027 — claim a first stay.' },
    ownerId,
  );

  // ── Rooms index ──────────────────────────────────────
  await upsertPublishedPage(
    'rooms',
    'ROOMS_INDEX',
    'Rooms',
    [
      block('hero', { eyebrow: en('Rooms'), heading: en('Ten rooms. Four kinds.'), sub: en('Each described as a place, with the facts you need to choose.'), media: [roomsHero], ctas: [] }, { variant: 'compact' }),
      block('roomGrid', { heading: en('Choose by the view, the beds, or the people you bring'), roomTypeIds: [], showFromPrice: true }),
      block('features', {
        eyebrow: en('In every room'),
        heading: en('The things that matter at 1,900 metres'),
        items: [
          { icon: 'shower-head', title: en('Hot water, all day'), text: en('Solar with backup, not only when the sun has been out.') },
          { icon: 'bed', title: en('Heavy blankets'), text: en('Nights are cold on the mountain. You will not be.') },
          { icon: 'coffee', title: en('Local coffee'), text: en('A kettle and beans from farms within twenty kilometres.') },
          { icon: 'zap', title: en('Power that stays on'), text: en('Grid, solar and batteries. Sockets by every bed.') },
          { icon: 'wifi', title: en('Wi-Fi'), text: en('Good enough for a call. Better on the terrace.') },
          { icon: 'shield-check', title: en('A staffed gate'), text: en('Parking inside the compound, lit at night.') },
        ],
      }, { variant: 'grid', tone: 'warm' }),
      block('ctaBand', { heading: en('Have dates in mind?'), sub: en('Tell us the room and the dates; we will hold your name for the first calendar.'), ctas: [cta('Claim a first stay', 'waitlist'), cta('WhatsApp us', 'whatsapp', 'secondary')] }),
    ],
    { description: 'Rooms at Reberon Hotel, Kapchorwa: Elgon View King, Sipi Twin, Coffee Terrace Family and the Summit Suite.' },
    ownerId,
  );

  // ── About ────────────────────────────────────────────
  await upsertPublishedPage(
    'about',
    'ABOUT',
    'About the house',
    [
      block(
        'hero',
        {
          eyebrow: en('Kapchorwa · 1,900 m · Mount Elgon'),
          heading: en('A mountain sanctuary, built by people of Elgon.'),
          sub: en('Ten panoramic suites, honest highland hospitality, and a quiet retreat above the clouds in Kapchorwa. Built with local hands, powered by mountain sun and fresh spring water.'),
          media: [aboutHero],
          ctas: [
            cta('Explore rooms', 'link', 'primary', '/rooms'),
            cta('WhatsApp concierge', 'whatsapp', 'secondary'),
            cta('Our facilities', 'link', 'ghost', '/facilities'),
          ],
          showScrollCue: true,
        },
        { variant: 'split' },
      ),
      block('stats', {
        items: [
          { value: '1,900 m', label: en('altitude on Mount Elgon shoulder, pure cool mountain air') },
          { value: '10 Suites', label: en('exclusive guest rooms framing panoramic ridge & valley views') },
          { value: '100%', label: en('local stone masons, carpenters & regional artisans') },
          { value: '24/7', label: en('solar energy & gravity-fed mountain spring water system') },
          { value: '0 Plastic', label: en('commitment to refillable glass and mountain conservation') },
          { value: '6:30 AM', label: en('single-origin Arabica brewed fresh before trail departure') },
        ],
      }),
      block(
        'story',
        {
          eyebrow: en('The People & The Vision'),
          heading: en('Denis, local hands, and a quiet sanctuary'),
          body: rt.md('Reberon was conceived by Denis Mayamba as a sanctuary of quiet dignity on the slopes of Mount Elgon. Rather than imposing a standard city structure, the house is hand-shaped by stone masons, carpenters, and metalworkers from Kapchorwa and Mbale.\n\nEvery timber beam, volcanic basalt stone, and window opening is placed to respect the mountain ridge. Our digital guest experience and hotel infrastructure are engineered by [Ecadel Group Limited](https://ecadelgroup.com), blending high-altitude serenity with dependable modern connectivity.\n\nWe are building a place that honours the rhythm of Kapchorwa: early mornings in the mist, warm fires at night, and food grown within sight of the terrace.'),
          media: aboutStory,
          ctas: [
            cta('Claim a first stay', 'waitlist', 'primary'),
            cta('Message Denis & the team', 'whatsapp', 'secondary'),
          ],
        },
        { variant: 'left' },
      ),
      block(
        'features',
        {
          eyebrow: en('The Highland Ethos'),
          heading: en('Built for the mountain, not despite it'),
          intro: en('Six guiding commitments that define life, hospitality, and comfort at Reberon Hotel.'),
          items: [
            { icon: 'mountain-snow', title: en('Athletic heritage & trails'), text: en('Kapchorwa is the home of world champions. Step straight onto high-altitude trails, pine forest runs, and quiet escarpment walks.') },
            { icon: 'utensils', title: en('Slow highland food'), text: en('Fresh mountain trout, Elgon bamboo shoots (malewa), organic vegetables, and wholesome meals prepared for hungry walkers.') },
            { icon: 'coffee', title: en('Origin Arabica coffee'), text: en('Cultivated on the rich volcanic soils between 1,600 m and 2,200 m. Picked, roasted, and poured fresh every morning.') },
            { icon: 'zap', title: en('Resilient solar & water'), text: en('Continuous hot water from solar thermal systems, battery storage, and gravity-fed spring lines tested for clarity.') },
            { icon: 'users', title: en('The Hall for community'), text: en('A warm 40-seat space equipped for athletic team briefings, masterclasses, cultural gatherings, and family celebrations.') },
            { icon: 'shield-check', title: en('Honest promises'), text: en('If a facility is under construction, we declare it. No surprises, no hidden levies, and travel guidance you can rely on.') },
          ],
        },
        { variant: 'grid', tone: 'warm' },
      ),
      block(
        'nowStrip',
        {
          heading: en('Right now on the ridge'),
          intro: en('Kapchorwa sits 700 metres higher than the plateau — pack a fleece for the evening.'),
          showForecast: true,
          compareKampala: true,
        },
        { variant: 'band' },
      ),
      block(
        'gallery',
        {
          eyebrow: en('Craft & Architecture'),
          heading: en('Spaces designed for light, stone, and horizon'),
          media: aboutGallery,
        },
        { variant: 'mosaic' },
      ),
      block(
        'ctaBand',
        {
          heading: en('Come and see the mountain.'),
          sub: en('Reserve your place for our 2027 opening season or speak to our team today. No deposit required for the priority waitlist.'),
          ctas: [
            cta('Claim a first stay', 'waitlist', 'primary'),
            cta('Ask a question', 'enquire', 'secondary'),
            cta('WhatsApp concierge', 'whatsapp', 'ghost'),
          ],
          media: aboutHero,
        },
      ),
    ],
    { description: 'Who built Reberon Hotel, why Kapchorwa, and the highland ethos behind our 10-suite Mount Elgon sanctuary.' },
    ownerId,
  );

  // ── Rising ───────────────────────────────────────────
  await upsertPublishedPage(
    'rising',
    'PROGRESS',
    'Watch the hotel rise',
    [
      block('hero', { eyebrow: en('Watch the hotel rise'), heading: en('The house, as it is this month.'), sub: en('Progress while the building is unfinished. Honest, not an apology.'), media: [risingHero] }, { variant: 'compact' }),
      block('progressTimeline', { heading: en('From groundbreaking to the first room'), limit: 50, showLink: false }),
      block('ctaBand', { heading: en('Want a room when it is ready?'), sub: en('Claim a first stay. We contact the list before the calendar opens to anyone else.'), ctas: [cta('Claim a first stay', 'waitlist')] }),
    ],
    { description: 'Construction progress at Reberon Hotel, Kapchorwa — photographs and notes from the site.' },
    ownerId,
  );

  // ── Facilities ───────────────────────────────────────
  await upsertPublishedPage(
    'facilities',
    'FACILITIES',
    'Facilities',
    [
      block('hero', { eyebrow: en('Facilities'), heading: en('What the house has. Nothing it does not.'), sub: en('Restaurant, hall, parking, power and water — with honest labels on what is still being built.'), media: [facilitiesHero] }, { variant: 'compact' }),
      block('facilities', { facilityIds: [] }),
      block('faq', { eyebrow: en('Groups and events'), heading: en('Planning something?'), faqGroupId: refs.faqs['groups-and-hall'] }),
      block('enquiryForm', { eyebrow: en('The hall'), heading: en('Ask about the hall'), intro: en('Dates, numbers and what you have in mind. We reply with a one-page quote.'), intent: 'EVENT' }),
    ],
    { description: 'Facilities at Reberon Hotel: restaurant, hall for forty, parking, backup power and borehole water.' },
    ownerId,
  );

  // ── Kapchorwa (destination index) ────────────────────
  await upsertPublishedPage(
    'kapchorwa',
    'DESTINATION_INDEX',
    'Kapchorwa',
    [
      block('hero', { eyebrow: en('Kapchorwa'), heading: en('Kapchorwa is why they drive.'), sub: en('Sipi’s falls, Elgon’s slopes, coffee at altitude, and a road that climbs the escarpment.'), media: [destHero], ctas: [cta('The road', 'link', 'secondary', '/kapchorwa/the-road')] }, { variant: 'fullbleed' }),
      block('destinationCards', { heading: en('Places, seasons, and practical things'), destinationIds: allDest }),
      block('nowStrip', { eyebrow: en('On the mountain today'), showForecast: true, compareKampala: true }, { variant: 'card' }),
      block('journey', {
        eyebrow: en('The road'),
        heading: en('Kampala to Kapchorwa, stop by stop'),
        intro: en('About six to seven hours with lunch. Leave early.'),
        stops: [
          { name: en('Kampala'), minutesFromPrev: 0, altitude: 1190, note: en('Leave by 6:30.') },
          { name: en('Jinja'), minutesFromPrev: 120, altitude: 1140, note: en('Cross the Nile.') },
          { name: en('Mbale'), minutesFromPrev: 160, altitude: 1150, note: en('Fuel, cash, lunch.') },
          { name: en('Sipi'), minutesFromPrev: 60, altitude: 1780, note: en('The escarpment and the falls.') },
          { name: en('Kapchorwa'), minutesFromPrev: 30, altitude: 1900, note: en('Tea is ready.') },
        ],
      }, { tone: 'dark' }),
      block('ctaBand', { heading: en('Come and see it for yourself'), ctas: [cta('Claim a first stay', 'waitlist'), cta('Ask about a guide', 'enquire', 'secondary')] }),
    ],
    { description: 'Kapchorwa, Sipi Falls, Mount Elgon and highland coffee — and how to get here from Kampala.' },
    ownerId,
  );

  // ── First stay (waitlist) ────────────────────────────
  await upsertPublishedPage(
    'first-stay',
    'LANDING',
    'Claim a first stay',
    [
      block('hero', { eyebrow: en('Opening 2027'), heading: en('Claim a first stay.'), sub: en('The hotel opens with names, not hope. Put yours against a room and dates.'), media: [firstStayHero] }, { variant: 'split' }),
      block('waitlistForm', {
        heading: en('Your first stay'),
        intro: en('No payment now. When the calendar opens we contact this list first, in the order names arrived.'),
        successMessage: en('You are on the list. This is not a booking yet — we will contact you on the number you gave when the calendar opens.'),
      }),
      block('features', {
        heading: en('What happens next'),
        items: [
          { icon: 'list-ordered', title: en('1. You are on the list'), text: en('We keep your name, room and dates. Nothing to pay.') },
          { icon: 'message-circle', title: en('2. We contact you first'), text: en('Before bookings open to anyone else, by WhatsApp or phone.') },
          { icon: 'calendar-check', title: en('3. You confirm with a deposit'), text: en('Only then does it become a booking. The waitlist is not money.') },
        ],
      }, { variant: 'grid', tone: 'warm' }),
      block('faq', { heading: en('About your stay'), faqGroupId: refs.faqs['rooms-and-stay'] }),
    ],
    { description: 'Reberon Hotel opens in 2027. Put your name against a room and dates — no payment.' },
    ownerId,
  );

  // ── Contact ──────────────────────────────────────────
  await upsertPublishedPage(
    'contact',
    'CONTACT',
    'Contact',
    [
      block('hero', { eyebrow: en('Contact'), heading: en('No treasure hunt.'), sub: en('Phone, WhatsApp, email and the pin. We answer from 7:00 to 21:00.'), media: [contactHero] }, { variant: 'compact' }),
      block('contactCard', { heading: en('Talk to a person') }),
      block('enquiryForm', { heading: en('Or write to us'), intro: en('A few words is enough. We reply by WhatsApp or email.'), intent: 'STAY' }),
      block('map', {
        heading: en('Finding us'),
        directions: rt.md('Follow the Mbale–Kapchorwa road into town and look for our sign. The last kilometre is graded murram; take it slowly after rain. The gate is staffed all night.\n\nFull directions: [Getting here](/kapchorwa/getting-here).'),
        zoom: 13,
      }),
    ],
    { description: 'Phone, WhatsApp, email and map for Reberon Hotel, Kapchorwa.' },
    ownerId,
  );

  // ── Legal ────────────────────────────────────────────
  const legal: [string, string, string][] = [
    [
      'legal/privacy',
      'Privacy',
      `
We collect only what we need to answer you and, later, to host you: your name, a phone number or email, the dates and room you ask about, and anything you choose to tell us.

## Why we keep it
To reply to your enquiry, to contact you when the calendar opens if you joined the list, and — once you book — to run your stay.

## Who sees it
Hotel staff who need it. Payment details are handled by our payment provider and never stored by us. We do not sell or share your details for marketing.

## How long
Enquiries and waitlist names that do not become bookings are deleted or anonymised after 24 months.

## Your rights
Under Uganda’s Data Protection and Privacy Act, 2019, you may ask to see, correct or delete what we hold. Write to hello@reberonhotel.com.`,
    ],
    [
      'legal/booking-terms',
      'Booking terms',
      `
These terms apply once bookings open. Until then, joining the first-stay list costs nothing and commits you to nothing.

## Prices
Prices are shown in Ugandan shillings and, where set, US dollars. The price you see includes taxes and is the price you pay. We never convert between currencies without telling you.

## Deposits
A booking is confirmed when the deposit or full payment is received. Unpaid holds expire automatically.

## Arrival
Check-in from 14:00, check-out by 10:30. Tell us if you will arrive late; the gate is staffed all night.`,
    ],
    [
      'legal/cancellation',
      'Cancellation',
      `
Plain language, written on every booking.

- **More than 14 days before arrival:** full refund of the deposit, less payment-provider fees.
- **7 to 14 days before arrival:** half the deposit is refunded.
- **Less than 7 days, or no-show:** the deposit is kept.

If weather or road closures stop you reaching us, talk to us — we move dates rather than keep money.`,
    ],
  ];
  for (const [slug, title, body] of legal) {
    await upsertPublishedPage(slug, 'LEGAL', title, [block('richText', { eyebrow: en('Legal'), heading: en(title), body: rt.md(body) }, { variant: 'prose' })], { description: `${title} — Reberon Hotel, in plain language.` }, ownerId);
  }

  // ── 404 ──────────────────────────────────────────────
  await upsertPublishedPage(
    '404',
    'SYSTEM',
    'Page not found',
    [
      block('hero', { eyebrow: en('404'), heading: en('This path leads into the mist.'), sub: en('The page you wanted is not here. The mountain is, and so are we.'), media: [heroMist], ctas: [cta('Go home', 'link', 'primary', '/'), cta('WhatsApp us', 'whatsapp', 'secondary')] }, { variant: 'compact' }),
    ],
    { title: 'Not found' },
    ownerId,
  );

  log('pages', '13 published');
}
