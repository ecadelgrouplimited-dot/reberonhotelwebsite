import { faker } from '@faker-js/faker';
import { rt } from '@reberon/contracts';
import { hotelToday, addDays, randomCode } from '@reberon/utils';
import { prisma, en, log } from '../lib.js';

const day = (iso: string) => new Date(`${iso}T00:00:00Z`);
const iso = (d: Date) => d.toISOString().slice(0, 10);

/** Weekends and high season cost more; everything rounds to prices people say out loud. */
export function priceFor(base: number, date: string, currency: 'UGX' | 'USD') {
  const d = day(date);
  const dow = d.getUTCDay();
  const md = date.slice(5);
  let f = 1;
  if (dow === 5 || dow === 6) f *= 1.1;
  if (md >= '12-15' || md <= '01-05' || (md >= '07-01' && md <= '08-31')) f *= 1.15;
  const v = base * f;
  return currency === 'UGX' ? Math.round(v / 5000) * 5000 : Math.round(v) * 100;
}

const EXTRAS = [
  { slug: 'transfer-mbale', name: 'Transfer from Mbale', summary: 'Met at the bus park or fuel station in Mbale and driven up the escarpment.', kind: 'TRANSFER', unit: 'PER_TRIP', ugx: 150_000, usd: 42 },
  { slug: 'transfer-entebbe', name: 'Transfer from Entebbe airport', summary: 'A driver who knows the night road. About seven hours.', kind: 'TRANSFER', unit: 'PER_TRIP', ugx: 650_000, usd: 180 },
  { slug: 'sipi-guided-walk', name: 'Sipi Falls guided walk', summary: 'All three falls with a guide from Sipi. About four hours.', kind: 'GUIDE', unit: 'PER_PERSON', ugx: 60_000, usd: 18, exp: true },
  { slug: 'coffee-farm-morning', name: 'Seed to cup: a coffee farm morning', summary: 'Pick, pulp, roast and drink it with the family who grew it.', kind: 'EXPERIENCE', unit: 'PER_PERSON', ugx: 80_000, usd: 22, exp: true },
  { slug: 'elgon-day-hike', name: 'Mount Elgon day hike with a ranger', summary: 'Bamboo and montane forest on the lower slopes. Park fees extra.', kind: 'GUIDE', unit: 'PER_PERSON', ugx: 150_000, usd: 42, exp: true },
  { slug: 'packed-lunch', name: 'Packed lunch', summary: 'For the falls, the road or the mountain.', kind: 'MEAL', unit: 'PER_PERSON', ugx: 25_000, usd: 7 },
  { slug: 'extra-bed', name: 'Extra bed', summary: 'For a child or a third adult, where the room allows.', kind: 'BED', unit: 'PER_NIGHT', ugx: 70_000, usd: 20 },
  { slug: 'late-checkout', name: 'Late check-out until 14:00', summary: 'When the drive back can wait.', kind: 'LATE_CHECKOUT', unit: 'PER_STAY', ugx: 60_000, usd: 17 },
] as const;

const PACKAGES = [
  { slug: 'first-light', name: 'First Light', nights: 2, summary: 'Two nights timed for sunrise on the ridge, coffee on the terrace before breakfast.', inclusions: ['Two nights, bed & breakfast', 'Sunrise coffee on the terrace', 'Late check-out'], ugx: 120_000, usd: 34 },
  { slug: 'sipi-sunday', name: 'Sipi Sunday', nights: 1, summary: 'Saturday night, Sunday at the falls with a guide and a packed lunch.', inclusions: ['One night, bed & breakfast', 'Guided walk to all three falls', 'Packed lunch'], ugx: 85_000, usd: 24 },
  { slug: 'seed-to-cup', name: 'Seed to Cup', nights: 2, summary: 'A morning on a coffee farm and a bag of the beans you roasted.', inclusions: ['Two nights, bed & breakfast', 'Coffee farm morning', '250 g of your own roast'], ugx: 110_000, usd: 31 },
  { slug: 'champions-week', name: 'Champions Week', nights: 7, summary: 'For runners training at altitude: early breakfasts, late dinners, quiet rooms.', inclusions: ['Seven nights, half board', 'Breakfast from 5:30', 'Laundry twice a week'], ugx: 350_000, usd: 98 },
  { slug: 'the-table', name: 'The Table', nights: 1, summary: 'A long dinner of what is good on the slope this week.', inclusions: ['One night, bed & breakfast', 'Five-course dinner for two'], ugx: 180_000, usd: 50 },
  { slug: 'long-stay', name: 'Long Stay', nights: 14, summary: 'Two weeks or more for writers, researchers and anyone who needs the quiet.', inclusions: ['Fourteen nights', 'Weekly room refresh', 'Desk by the window'], ugx: null, usd: null },
] as const;

export async function seedBooking(ownerId: string, deskId: string) {
  const REFRESH = process.argv.includes('--refresh');
  if ((await prisma.ratePlan.count()) && !REFRESH) return log('booking', 'exists, skipped');

  const flexible = await prisma.cancellationPolicy.upsert({
    where: { id: '01a0f000-0000-7000-8000-000000000001' },
    create: {
      id: '01a0f000-0000-7000-8000-000000000001',
      name: en('Flexible'),
      isDefault: true,
      rules: [{ daysBefore: 14, refundPercent: 100 }, { daysBefore: 7, refundPercent: 50 }, { daysBefore: 0, refundPercent: 0 }],
      text: en('Free cancellation up to 14 days before arrival; half the deposit back from 7 to 14 days; within 7 days the deposit is kept. Weather or road closures: we move dates rather than keep money.'),
    },
    update: {},
  });
  const nonRef = await prisma.cancellationPolicy.upsert({
    where: { id: '01a0f000-0000-7000-8000-000000000002' },
    create: { id: '01a0f000-0000-7000-8000-000000000002', name: en('Non-refundable'), rules: [{ daysBefore: 0, refundPercent: 0 }], text: en('Paid in full when you book and not refunded if you cancel. We can still move your dates once, up to 7 days before arrival.') },
    update: {},
  });
  if (!(await prisma.taxRule.count())) await prisma.taxRule.create({ data: { name: en('VAT'), ratePercent: 18, inclusive: true } });

  const plans = [
    { code: 'BB', name: 'Bed & breakfast', description: 'Breakfast from 6:30 for early walkers. Pay 30% now, the rest at the house.', mealPlan: 'BB' as const, minNights: 1, depositPercent: 30, cancellationPolicyId: flexible.id, factor: 1 },
    { code: 'RO', name: 'Room only, non-refundable', description: 'Our lowest price. Paid in full now.', mealPlan: 'RO' as const, minNights: 1, depositPercent: 100, cancellationPolicyId: nonRef.id, factor: 0.88 },
    { code: 'LONG', name: 'Long stay (7+ nights)', description: 'Seven nights or more, breakfast included, a fifth off.', mealPlan: 'BB' as const, minNights: 7, depositPercent: 30, cancellationPolicyId: flexible.id, factor: 0.8 },
  ];
  const planRows = [];
  for (const [order, p] of plans.entries()) {
    const { factor: _f, ...data } = p;
    planRows.push({ ...(await prisma.ratePlan.upsert({ where: { code: p.code }, create: { ...data, name: en(p.name), description: en(p.description), order, isSeed: true }, update: {} })), factor: p.factor });
  }

  // 18 months of prices from today, both currencies, per plan and room type.
  const rooms = await prisma.roomType.findMany({ where: { deletedAt: null } });
  const start = hotelToday();
  const dates = Array.from({ length: 548 }, (_, i) => addDays(start, i));
  let rateCount = 0;
  for (const plan of planRows) {
    for (const r of rooms) {
      const baseUgx = Number(r.fromPriceUgx ?? 250_000n) * plan.factor;
      const baseUsd = Number(r.fromPriceUsd ?? 7000n) / 100 * plan.factor;
      const data = dates.flatMap((d) => [
        { ratePlanId: plan.id, roomTypeId: r.id, date: day(d), currency: 'UGX' as const, amountMinor: BigInt(priceFor(baseUgx, d, 'UGX')) },
        { ratePlanId: plan.id, roomTypeId: r.id, date: day(d), currency: 'USD' as const, amountMinor: BigInt(priceFor(baseUsd, d, 'USD')) },
      ]);
      rateCount += (await prisma.rate.createMany({ data, skipDuplicates: true })).count;
    }
  }

  for (const [order, e] of EXTRAS.entries()) {
    await prisma.extra.upsert({
      where: { slug: e.slug },
      create: { slug: e.slug, name: en(e.name), summary: en(e.summary), kind: e.kind, unit: e.unit, priceUgx: BigInt(e.ugx), priceUsd: BigInt(e.usd * 100), isExperience: 'exp' in e, order, isSeed: true },
      update: {},
    });
  }
  for (const [order, p] of PACKAGES.entries()) {
    await prisma.package.upsert({
      where: { slug: p.slug },
      create: { slug: p.slug, name: en(p.name), summary: en(p.summary), body: rt.md(p.summary), nights: p.nights, inclusions: p.inclusions.map(en), priceUgx: p.ugx === null ? null : BigInt(p.ugx), priceUsd: p.usd === null ? null : BigInt(p.usd * 100), status: 'PUBLISHED', order, isSeed: true },
      update: {},
    });
  }

  await seedReservations(planRows, rooms, ownerId, deskId);
  log('booking', `${planRows.length} rate plans, ${rateCount} prices, ${EXTRAS.length} extras, ${PACKAGES.length} packages`);
}

async function seedReservations(plans: { id: string; code: string; depositPercent: number; minNights: number }[], rooms: { id: string; name: unknown }[], ownerId: string, deskId: string) {
  const today = hotelToday();
  if (await prisma.reservation.count({ where: { isSeed: true, status: 'CONFIRMED', arrival: { gt: day(today) } } })) return;
  faker.seed(1901);
  const contacts = await prisma.contact.findMany({ where: { isSeed: true }, take: 40, orderBy: { createdAt: 'asc' } });
  const physical = await prisma.room.groupBy({ by: ['roomTypeId'], where: { isActive: true }, _count: true });
  const capacity = new Map(physical.map((p) => [p.roomTypeId, p._count]));
  const used = new Map<string, number>(); // roomTypeId|date → rooms taken
  const flexible = await prisma.cancellationPolicy.findFirst({ where: { isDefault: true } });
  let made = 0;

  const plan = (code: string) => plans.find((p) => p.code === code)!;
  const scenarios: { status: 'CONFIRMED' | 'HELD' | 'CANCELLED' | 'EXPIRED' | 'CHECKED_OUT'; offset: number; nights: number; plan: string; paid: 'none' | 'deposit' | 'full'; source: 'DIRECT' | 'WHATSAPP' | 'PHONE' | 'WALK_IN' }[] = [
    ...Array.from({ length: 12 }, (_, i) => ({ status: 'CONFIRMED' as const, offset: 1 + i * 3 + faker.number.int({ min: 0, max: 2 }), nights: faker.number.int({ min: 1, max: 4 }), plan: i % 5 === 0 ? 'RO' : 'BB', paid: (i % 5 === 0 ? 'full' : i % 3 === 0 ? 'full' : 'deposit') as 'full' | 'deposit', source: faker.helpers.arrayElement(['DIRECT', 'DIRECT', 'WHATSAPP', 'PHONE'] as const) })),
    { status: 'CONFIRMED', offset: 9, nights: 8, plan: 'LONG', paid: 'deposit', source: 'WHATSAPP' },
    { status: 'CONFIRMED', offset: 0, nights: 2, plan: 'BB', paid: 'deposit', source: 'PHONE' },
    { status: 'HELD', offset: 20, nights: 2, plan: 'BB', paid: 'none', source: 'DIRECT' },
    { status: 'HELD', offset: 33, nights: 3, plan: 'BB', paid: 'none', source: 'PHONE' },
    { status: 'CANCELLED', offset: 15, nights: 2, plan: 'BB', paid: 'deposit', source: 'DIRECT' },
    { status: 'CANCELLED', offset: 40, nights: 3, plan: 'BB', paid: 'deposit', source: 'WHATSAPP' },
    { status: 'EXPIRED', offset: 12, nights: 2, plan: 'BB', paid: 'none', source: 'DIRECT' },
    { status: 'EXPIRED', offset: 26, nights: 1, plan: 'BB', paid: 'none', source: 'DIRECT' },
    { status: 'CONFIRMED', offset: 55, nights: 3, plan: 'BB', paid: 'deposit', source: 'DIRECT' },
    { status: 'CONFIRMED', offset: 70, nights: 2, plan: 'BB', paid: 'none', source: 'WALK_IN' },
  ];

  for (const [i, s] of scenarios.entries()) {
    const p = plan(s.plan);
    const room = rooms[i % rooms.length]!;
    const arrival = addDays(today, s.offset);
    const departure = addDays(arrival, s.nights);
    const nights = Array.from({ length: s.nights }, (_, k) => addDays(arrival, k));
    const takesRoom = s.status === 'CONFIRMED' || s.status === 'HELD';
    if (takesRoom && nights.some((d) => (used.get(`${room.id}|${d}`) ?? 0) >= (capacity.get(room.id) ?? 0))) continue;
    const rates = await prisma.rate.findMany({ where: { ratePlanId: p.id, roomTypeId: room.id, currency: 'UGX', date: { in: nights.map(day) } } });
    if (rates.length !== nights.length) continue;
    const nightly = nights.map((d) => ({ date: d, amountMinor: rates.find((r) => iso(r.date) === d)!.amountMinor }));
    const total = nightly.reduce((a, n) => a + n.amountMinor, 0n);
    const deposit = p.depositPercent >= 100 ? total : ((total * BigInt(p.depositPercent)) / 100n + 999n) / 1000n * 1000n;
    const paid = s.paid === 'full' ? total : s.paid === 'deposit' ? deposit : 0n;
    const contact = contacts[i % contacts.length]!;
    const code = `RB-${randomCode(5)}`;
    const created = new Date(Date.now() - faker.number.int({ min: 1, max: 30 }) * 86_400_000);
    const cancelledKept = s.status === 'CANCELLED' ? (s.offset >= 14 ? 0n : paid / 2n) : null;

    await prisma.$transaction(async (tx) => {
      const r = await tx.reservation.create({
        data: {
          code,
          status: s.status,
          source: s.source,
          contactId: contact.id,
          ratePlanId: p.id,
          arrival: day(arrival),
          departure: day(departure),
          adults: faker.number.int({ min: 1, max: 2 }),
          children: faker.datatype.boolean(0.2) ? 1 : 0,
          currency: 'UGX',
          totalMinor: cancelledKept ?? total,
          paidMinor: s.status === 'CANCELLED' ? cancelledKept! : paid,
          depositMinor: deposit,
          cancellationSnapshot: { rules: flexible?.rules ?? [], text: flexible?.text ?? {} },
          eta: faker.helpers.arrayElement([null, '15:00', 'After 18:00', 'Around lunch']),
          guestNotes: faker.helpers.arrayElement([null, null, 'Vegetarian breakfast please', 'Celebrating an anniversary', 'Arriving by bus to Mbale']),
          holdExpiresAt: s.status === 'HELD' ? new Date(Date.now() + 20 * 3600_000) : null,
          confirmedAt: s.status === 'CONFIRMED' ? created : null,
          cancelledAt: s.status === 'CANCELLED' ? new Date() : null,
          cancelReason: s.status === 'CANCELLED' ? faker.helpers.arrayElement(['Plans changed', 'Road trip postponed']) : null,
          createdById: s.source === 'DIRECT' ? null : faker.helpers.arrayElement([ownerId, deskId]),
          createdAt: created,
          isSeed: true,
          rooms: { create: { roomTypeId: room.id, quantity: 1, nightly: nightly.map((n) => ({ date: n.date, amountMinor: n.amountMinor.toString() })) } },
          folio: { create: { currency: 'UGX', lines: { create: nightly.map((n) => ({ kind: 'ROOM' as const, description: `${(room.name as { en: string }).en} × 1`, date: day(n.date), amountMinor: n.amountMinor })) } } },
          changes: { create: { kind: 'created', summary: `${s.status === 'HELD' ? 'Held' : 'Booked'} ${s.nights} night(s)`, createdAt: created } },
        },
        include: { folio: true },
      });
      if (paid > 0n) {
        const intent = await tx.paymentIntent.create({
          data: { reservationId: r.id, purpose: s.paid === 'full' ? 'FULL' : 'DEPOSIT', amountMinor: paid, currency: 'UGX', provider: s.source === 'DIRECT' ? 'TEST' : 'MANUAL', method: faker.helpers.arrayElement(['MOBILE_MONEY', 'MOBILE_MONEY', 'CARD', 'CASH'] as const), status: 'SUCCEEDED', merchantReference: `${code}-P1`, paidAt: created, confirmationCode: `SEED${i}` },
        });
        await tx.folioLine.create({ data: { folioId: r.folio!.id, kind: 'PAYMENT', description: `Payment ${intent.merchantReference}`, date: day(iso(created)), amountMinor: -paid, paymentId: intent.id } });
      }
      if (s.status === 'CANCELLED') {
        await tx.folioLine.create({ data: { folioId: r.folio!.id, kind: 'ADJUSTMENT', description: 'Cancelled — stay charges reversed', date: day(today), amountMinor: -total } });
        if (cancelledKept! > 0n) await tx.folioLine.create({ data: { folioId: r.folio!.id, kind: 'ADJUSTMENT', description: 'Cancellation fee', date: day(today), amountMinor: cancelledKept! } });
        if (paid - cancelledKept! > 0n) await tx.folioLine.create({ data: { folioId: r.folio!.id, kind: 'REFUND', description: 'Refund — mobile money', date: day(today), amountMinor: paid - cancelledKept! } });
      }
    });
    if (takesRoom) {
      for (const d of nights) used.set(`${room.id}|${d}`, (used.get(`${room.id}|${d}`) ?? 0) + 1);
      await prisma.inventoryDay.createMany({ data: nights.map((d) => ({ roomTypeId: room.id, date: day(d), totalRooms: capacity.get(room.id) ?? 0 })), skipDuplicates: true });
      await prisma.inventoryDay.updateMany({ where: { roomTypeId: room.id, date: { in: nights.map(day) } }, data: s.status === 'HELD' ? { heldRooms: { increment: 1 } } : { soldRooms: { increment: 1 } } });
    }
    made++;
  }
  log('reservations', `${made} demo reservations`);
}
