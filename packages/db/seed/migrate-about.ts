import { config } from 'dotenv';
import { resolve } from 'node:path';
import { createHmac } from 'node:crypto';
import { rt, zBlocks, type Cta } from '@reberon/contracts';
import { repoRoot } from '@reberon/media';
import { prisma, en, bid } from './lib.js';

config({ path: resolve(repoRoot(), '.env'), quiet: true });

type B = { id: string; type: string; variant?: string; tone?: string; anchor?: string; data: Record<string, unknown> };
const block = (type: string, data: Record<string, unknown>, extra: Partial<B> = {}): B => ({ id: bid(type), type, data, ...extra });
const cta = (label: string, action: Cta['action'], style: Cta['style'] = 'primary', href?: string) => ({
  label: en(label),
  action,
  style,
  ...(href ? { href } : {}),
});

async function revalidate() {
  const webUrl = process.env.WEB_URL || process.env.NEXT_PUBLIC_WEB_URL || 'https://reberonhotel.com';
  const secret = process.env.REVALIDATE_SECRET;
  if (!secret) {
    console.log('No REVALIDATE_SECRET found, skipping revalidation request.');
    return;
  }
  try {
    const body = JSON.stringify({ tags: ['content'], ts: Date.now() });
    const sig = createHmac('sha256', secret).update(body).digest('hex');
    const res = await fetch(`${webUrl}/api/revalidate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-signature': sig },
      body,
    });
    console.log(`Revalidation response: ${res.status} ${await res.text()}`);
  } catch (err) {
    console.warn('Revalidation failed:', err);
  }
}

export async function run() {
  const existingPage = await prisma.page.findUnique({
    where: { slug: 'about' },
    include: { publishedVersion: true },
  });

  if (!existingPage) {
    console.error('Page "about" not found in database.');
    return;
  }

  const oldBlocks = ((existingPage.publishedVersion?.blocks ?? existingPage.draftBlocks) as B[]) || [];
  const oldHero = oldBlocks.find((b) => b.type === 'hero');
  const oldStory = oldBlocks.find((b) => b.type === 'story');
  const oldGallery = oldBlocks.find((b) => b.type === 'gallery');

  const heroMedia = oldHero?.data?.media ?? [];
  const storyMedia = oldStory?.data?.media;
  const galleryMedia = oldGallery?.data?.media ?? [];

  const newBlocks: B[] = [
    block(
      'hero',
      {
        eyebrow: en('Kapchorwa · 1,900 m · Mount Elgon'),
        heading: en('A mountain sanctuary, built by people of Elgon.'),
        sub: en('Ten panoramic suites, honest highland hospitality, and a quiet retreat above the clouds in Kapchorwa. Built with local hands, powered by mountain sun and fresh spring water.'),
        media: heroMedia,
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
        body: rt.md(
          'Reberon was conceived by Denis Mayamba as a sanctuary of quiet dignity on the slopes of Mount Elgon. Rather than imposing a standard city structure, the house is hand-shaped by stone masons, carpenters, and metalworkers from Kapchorwa and Mbale.\n\nEvery timber beam, volcanic basalt stone, and window opening is placed to respect the mountain ridge. Our digital guest experience and hotel infrastructure are engineered by [Ecadel Group Limited](https://ecadelgroup.com), blending high-altitude serenity with dependable modern connectivity.\n\nWe are building a place that honours the rhythm of Kapchorwa: early mornings in the mist, warm fires at night, and food grown within sight of the terrace.',
        ),
        media: storyMedia,
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
        media: galleryMedia,
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
        media: Array.isArray(heroMedia) && heroMedia.length > 0 ? heroMedia[0] : heroMedia,
      },
    ),
  ];

  const parsed = zBlocks.safeParse(newBlocks);
  if (!parsed.success) {
    console.error('Validation failed:', JSON.stringify(parsed.error.issues, null, 2));
    throw new Error('New blocks for about page failed zBlocks schema validation');
  }

  const lastVersion = await prisma.pageVersion.findFirst({
    where: { pageId: existingPage.id },
    orderBy: { version: 'desc' },
  });

  const nextVersionNum = (lastVersion?.version ?? 0) + 1;
  const newVersion = await prisma.pageVersion.create({
    data: {
      pageId: existingPage.id,
      version: nextVersionNum,
      title: en('About the house'),
      blocks: newBlocks as object[],
      seo: {
        title: en('About Reberon Hotel · Highland Sanctuary on Mount Elgon'),
        description: en('Who built Reberon Hotel, why Kapchorwa, and the highland ethos behind our 10-suite Mount Elgon sanctuary.'),
      },
    },
  });

  await prisma.page.update({
    where: { id: existingPage.id },
    data: {
      title: en('About the house'),
      draftBlocks: newBlocks as object[],
      draftSeo: {
        title: en('About Reberon Hotel · Highland Sanctuary on Mount Elgon'),
        description: en('Who built Reberon Hotel, why Kapchorwa, and the highland ethos behind our 10-suite Mount Elgon sanctuary.'),
      },
      draftVersion: { increment: 1 },
      publishedVersionId: newVersion.id,
      status: 'PUBLISHED',
    },
  });

  console.log(`✓ About page updated successfully to version ${nextVersionNum} (ID: ${newVersion.id}) with ${newBlocks.length} rich blocks.`);
  await revalidate();
}

if (process.argv[1]?.endsWith('migrate-about.ts')) {
  run()
    .then(async () => {
      await prisma.$disconnect();
      process.exit(0);
    })
    .catch(async (e) => {
      console.error(e);
      await prisma.$disconnect();
      process.exit(1);
    });
}
