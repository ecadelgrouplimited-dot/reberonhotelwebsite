import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import type { BriefInsightsDTO, CashRailDTO, FinanceKpisDTO, FinanceReportDTO, HouseReportDTO, MoneyByCurrency } from '@reberon/contracts';
import { t } from '@reberon/contracts';
import { hotelToday } from '@reberon/utils';
import { PrismaService } from '../../common/prisma.service.js';
import { env } from '../../config.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { badRequest } from '../../common/errors.js';
import { BookingService } from '../booking/booking.service.js';
import { day, iso, nightsOf } from '../booking/inventory.service.js';
import { lt } from '../content/mappers.js';
import { ReportsService, classifyAdjustments, isMechanical } from './reports.service.js';

type Cur = 'UGX' | 'USD';
type M = Record<Cur, bigint>;
const CURS: Cur[] = ['UGX', 'USD'];
const zero = (): M => ({ UGX: 0n, USD: 0n });
const out = (m: M): MoneyByCurrency => ({ UGX: m.UGX.toString(), USD: m.USD.toString() });
const inM = (m?: MoneyByCurrency): M => ({ UGX: BigInt(m?.UGX ?? '0'), USD: BigInt(m?.USD ?? '0') });
const addM = (...xs: (MoneyByCurrency | undefined)[]): MoneyByCurrency => out(xs.reduce<M>((a, x) => { const v = inM(x); return { UGX: a.UGX + v.UGX, USD: a.USD + v.USD }; }, zero()));
const subM = (a?: MoneyByCurrency, b?: MoneyByCurrency): MoneyByCurrency => { const x = inM(a), y = inM(b); return out({ UGX: x.UGX - y.UGX, USD: x.USD - y.USD }); };
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 1000) / 10 : 0);
const plus = (d: string, n: number) => iso(new Date(day(d).getTime() + n * 86_400_000));
const kDate = (d: Date) => iso(new Date(d.getTime() + 3 * 3600_000));
const kStart = (d: string) => new Date(`${d}T00:00:00+03:00`);
const shiftYear = (d: string, n: number) => {
  const y = Number(d.slice(0, 4)) + n;
  const md = d.slice(5);
  return md === '02-29' && !((y % 4 === 0 && y % 100 !== 0) || y % 400 === 0) ? `${y}-02-28` : `${y}-${md}`;
};
const SOLD = ['CONFIRMED', 'IN_HOUSE', 'CHECKED_OUT'] as const;
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const RAILS: { method: string; label: string }[] = [
  { method: 'CASH', label: 'Cash' },
  { method: 'MOBILE_MONEY', label: 'Mobile money (MTN / Airtel)' },
  { method: 'CARD', label: 'Card' },
  { method: 'BANK', label: 'Bank transfer / cheque' },
  { method: 'UNKNOWN', label: 'Method not recorded' },
];
const railOf = (m: string | null | undefined) => {
  const v = (m ?? '').toUpperCase();
  if (v === 'CASH') return 'CASH';
  if (v === 'MOBILE_MONEY' || v.startsWith('MOMO')) return 'MOBILE_MONEY';
  if (v === 'CARD') return 'CARD';
  if (v === 'BANK' || v === 'BANK_TRANSFER' || v === 'CHEQUE') return 'BANK';
  return 'UNKNOWN';
};
const refundRail = (description: string) => {
  const m = /^Refund — ([a-z ]+)/.exec(description)?.[1]?.trim();
  return railOf(m?.replace(' ', '_'));
};

interface Stay {
  id: string; code: string; status: string; source: string; currency: string; arrival: Date; departure: Date; checkedOutAt: Date | null;
  contactId: string; ratePlanId: string; totalMinor: bigint; paidMinor: bigint;
  rooms: { roomTypeId: string; quantity: number; nightly: unknown }[];
}

/** Each sold night of a stay inside a set of dates (unslept nights after an early check-out are not sold). */
function soldNights(r: Stay, inRange: (d: string) => boolean) {
  const lastNight = r.status === 'CHECKED_OUT' && r.checkedOutAt ? kDate(r.checkedOutAt) : null;
  const outList: { date: string; roomTypeId: string; rooms: number; amount: bigint }[] = [];
  for (const rr of r.rooms) {
    for (const n of rr.nightly as { date: string; amountMinor: string }[]) {
      if (!inRange(n.date)) continue;
      if (lastNight && n.date >= lastNight && lastNight < iso(r.departure)) continue;
      outList.push({ date: n.date, roomTypeId: rr.roomTypeId, rooms: rr.quantity, amount: BigInt(n.amountMinor) * BigInt(rr.quantity) });
    }
  }
  return outList;
}

/**
 * The owner's finance desk: everything in HouseReport plus cash by rail,
 * receivables, allowances, pace and comparisons. UGX and USD stay separate.
 */
@Injectable()
export class FinanceService {
  private readonly log = new Logger('Finance');

  constructor(
    private readonly prisma: PrismaService,
    private readonly reports: ReportsService,
    private readonly booking: BookingService,
    private readonly notifications: NotificationsService,
  ) {}

  /** 19:00 Kampala every evening: tomorrow, today's money, the month so far and what needs attention (spec M21). */
  @Cron('0 19 * * *', { timeZone: 'Africa/Kampala' })
  async sendBrief() {
    const [brief, x] = await Promise.all([this.booking.ownerBrief(), this.briefInsights()]);
    const owners = (await this.prisma.user.findMany({ where: { role: 'OWNER', status: 'ACTIVE', deletedAt: null, email: { not: null } } })) as { email: string; name: string }[];
    const m = (v: MoneyByCurrency) => `${this.booking.money(BigInt(v.UGX), 'UGX')}${BigInt(v.USD) ? ` + ${this.booking.money(BigInt(v.USD), 'USD')}` : ''}`;
    const change = (a: string, b: string) => { const x1 = Number(a), x0 = Number(b); return x0 ? ` (${x1 >= x0 ? '+' : ''}${Math.round(((x1 - x0) / x0) * 100)}% vs last month)` : ''; };
    for (const o of owners) {
      await this.notifications.email({
        to: o.email,
        subject: `Reberon tonight: ${x.onBooksTonight.percent}% · ${this.booking.money(BigInt(x.today.collected.UGX), 'UGX')} collected · ${brief.arrivals.length} arriving tomorrow`,
        heading: `Good evening, ${o.name.split(' ')[0]}.`,
        paragraphs: [
          brief.arrivals.length ? `Tomorrow: ${brief.arrivals.map((a) => `${a.name} (${a.rooms}${a.eta ? `, ETA ${a.eta}` : ''})`).join('; ')}.` : 'No arrivals tomorrow.',
          `Today the hotel collected ${m(x.today.collected)}${BigInt(x.today.refunds.UGX) ? ` after ${m(x.today.refunds)} of refunds` : ''} and spent ${m(x.today.expenses)}. ${x.today.bookingsMade} new booking(s) worth ${m(x.today.bookingsValue)}${x.today.cancellations ? `, ${x.today.cancellations} cancellation(s)` : ''}.`,
          `Month so far: ${m(x.mtd.netRevenue)} revenue${change(x.mtd.netRevenue.UGX, x.mtdLastMonth.netRevenue.UGX)}, ${x.mtd.occupancy}% occupancy, ADR ${this.booking.money(BigInt(x.mtd.adr.UGX), 'UGX')}, operating profit ${m(x.mtd.gop)}.`,
          x.attention.length ? `Needs your eye: ${x.attention.map((a) => a.title).join('; ')}.` : 'Nothing needs your attention.',
        ],
        facts: [
          ['On the books tonight', `${x.onBooksTonight.rooms} of ${x.onBooksTonight.total} rooms (${x.onBooksTonight.percent}%)`],
          ['Next 30 days', `${x.forecast30Totals.occupancy}% · ${m(x.forecast30Totals.revenue)}`],
          ['Owed to the hotel', m(x.receivables.total)],
          ['Deposits held for future stays', m(x.receivables.advanceDeposits)],
        ],
        action: { label: 'Open the owner brief', url: `${env.ADMIN_URL}/brief` },
      });
    }
    this.log.log(`owner brief sent to ${owners.length} owner(s)`);
    return owners.length;
  }

  /* ───────── cash by rail ───────── */

  async cash(from: string, to: string) {
    const tsStart = kStart(from);
    const tsEnd = kStart(plus(to, 1));
    const [payments, refunds, pos, visits, memberships, expenses, reqs] = await Promise.all([
      this.prisma.paymentIntent.findMany({ where: { status: 'SUCCEEDED', paidAt: { gte: tsStart, lt: tsEnd } }, select: { amountMinor: true, currency: true, method: true, provider: true, confirmationCode: true, paidAt: true } }),
      this.prisma.folioLine.findMany({ where: { kind: 'REFUND', date: { gte: day(from), lte: day(to) } }, include: { folio: { select: { currency: true } } } }),
      this.prisma.posOrder.findMany({ where: { settledAt: { gte: tsStart, lt: tsEnd }, status: { not: 'CANCELLED' }, paymentMethod: { not: 'ROOM_FOLIO' } }, select: { totalMinor: true, currency: true, paymentMethod: true, settledAt: true } }),
      this.prisma.healthClubAccessLog.findMany({ where: { checkedInAt: { gte: tsStart, lt: tsEnd }, amountPaidMinor: { gt: 0 } }, select: { amountPaidMinor: true, currency: true, paymentMethod: true, checkedInAt: true } }),
      this.prisma.healthClubMembership.findMany({ where: { createdAt: { gte: tsStart, lt: tsEnd } }, select: { amountMinor: true, currency: true, createdAt: true } }),
      this.prisma.expense.findMany({ where: { date: { gte: day(from), lte: day(to) } }, select: { amountMinor: true, currency: true, paymentMethod: true, date: true } }),
      this.prisma.requisition.findMany({ where: { status: 'DISBURSED', updatedAt: { gte: tsStart, lt: tsEnd } }, select: { totalEstimatedMinor: true, currency: true, updatedAt: true } }),
    ]);
    const rails = new Map(RAILS.map((r) => [r.method, { ...r, inCount: 0, inflow: zero(), refunds: zero(), outflow: zero(), missingRefs: 0, rooms: zero(), pos: zero(), hc: zero() }]));
    const daily = new Map<string, { collected: bigint; expenses: bigint }>();
    const bump = (d: string, k: 'collected' | 'expenses', v: bigint) => { const x = daily.get(d) ?? { collected: 0n, expenses: 0n }; x[k] += v; daily.set(d, x); };
    const take = (method: string, cur: string, amount: bigint, src: 'rooms' | 'pos' | 'hc', when: Date) => {
      if (amount <= 0n || (cur !== 'UGX' && cur !== 'USD')) return;
      const r = rails.get(method)!;
      r.inCount += 1;
      r.inflow[cur as Cur] += amount;
      r[src][cur as Cur] += amount;
      if (cur === 'UGX') bump(kDate(when), 'collected', amount);
    };
    for (const p of payments) {
      const m = railOf(p.method);
      take(m, p.currency, p.amountMinor, 'rooms', p.paidAt!);
      if (p.provider === 'MANUAL' && ['MOBILE_MONEY', 'BANK', 'CARD'].includes(m) && !p.confirmationCode) rails.get(m)!.missingRefs += 1;
    }
    for (const o of pos) take(railOf(o.paymentMethod), o.currency, o.totalMinor, 'pos', o.settledAt!);
    for (const v of visits) if (!['ROOM_FOLIO', 'MEMBER_PASS'].includes(v.paymentMethod ?? '')) take(railOf(v.paymentMethod), v.currency, v.amountPaidMinor, 'hc', v.checkedInAt);
    for (const m of memberships) take('UNKNOWN', m.currency, m.amountMinor, 'hc', m.createdAt);
    for (const l of refunds) {
      const r = rails.get(refundRail(l.description))!;
      r.refunds[l.folio.currency as Cur] += l.amountMinor;
      if (l.folio.currency === 'UGX') bump(iso(l.date), 'collected', -l.amountMinor);
    }
    for (const e of expenses) {
      rails.get(railOf(e.paymentMethod))!.outflow[e.currency as Cur] += e.amountMinor;
      if (e.currency === 'UGX') bump(iso(e.date), 'expenses', e.amountMinor);
    }
    for (const q of reqs) {
      rails.get('UNKNOWN')!.outflow[q.currency as Cur] += q.totalEstimatedMinor;
      if (q.currency === 'UGX') bump(kDate(q.updatedAt), 'expenses', q.totalEstimatedMinor);
    }
    const list: CashRailDTO[] = [...rails.values()].map((r) => {
      const net = zero();
      for (const c of CURS) net[c] = r.inflow[c] - r.refunds[c] - r.outflow[c];
      return { method: r.method, label: r.label, inCount: r.inCount, inflow: out(r.inflow), refunds: out(r.refunds), outflow: out(r.outflow), net: out(net), missingRefs: r.missingRefs, bySource: { rooms: out(r.rooms), pos: out(r.pos), healthClub: out(r.hc) } };
    });
    const totals = {
      inflow: addM(...list.map((r) => r.inflow)),
      refunds: addM(...list.map((r) => r.refunds)),
      outflow: addM(...list.map((r) => r.outflow)),
      net: addM(...list.map((r) => r.net)),
      transactions: list.reduce((a, r) => a + r.inCount, 0),
      missingRefs: list.reduce((a, r) => a + r.missingRefs, 0),
    };
    return { rails: list, totals, daily };
  }

  kpis(h: HouseReportDTO, cash: Awaited<ReturnType<FinanceService['cash']>>): FinanceKpisDTO {
    const dep = (k: string) => h.departments?.find((d) => d.department === k);
    const gross = h.financialSummary?.totalGrossRevenue ?? h.totals.roomRevenue;
    const fnb = addM(dep('KITCHEN')?.revenue, dep('BAR')?.revenue);
    return {
      grossRevenue: gross,
      netRevenue: h.financialSummary?.netRevenue ?? gross,
      roomRevenue: h.totals.roomRevenue,
      fnbRevenue: fnb,
      otherRevenue: subM(subM(gross, h.totals.roomRevenue), fnb),
      collected: subM(cash.totals.inflow, cash.totals.refunds),
      expenses: h.expenses?.total ?? out(zero()),
      gop: h.financialSummary?.grossOperatingProfit ?? out(zero()),
      adr: h.totals.adr,
      revpar: h.totals.revpar,
      trevpar: h.financialSummary?.trevpar ?? out(zero()),
      occupancy: h.totals.occupancy,
      roomNightsSold: h.totals.roomNightsSold,
      roomNightsAvailable: h.totals.roomNightsAvailable,
      bookings: h.totals.bookings,
      cancellations: h.totals.cancellations,
      noShows: h.totals.noShows,
      averageStay: h.totals.averageStay,
      posOrders: (dep('KITCHEN')?.ordersCount ?? 0) + (dep('BAR')?.ordersCount ?? 0),
    };
  }

  /* ───────── receivables (as of a date) ───────── */

  async receivables(asOf: string) {
    const rows = await this.prisma.reservation.findMany({ where: { status: { in: ['CONFIRMED', 'IN_HOUSE', 'CHECKED_OUT'] } }, include: { contact: { select: { name: true, phone: true } } } });
    const owing = rows.filter((r) => r.totalMinor > r.paidMinor && (r.status !== 'CONFIRMED' || iso(r.arrival) <= plus(asOf, 30)));
    const B = [
      { key: 'upcoming', label: 'Arriving soon (deposit / balance due)' },
      { key: 'inhouse', label: 'In the house now' },
      { key: 'd0_30', label: '0–30 days after departure' },
      { key: 'd31_60', label: '31–60 days after departure' },
      { key: 'd60', label: 'Over 60 days' },
    ].map((b) => ({ ...b, count: 0, amount: zero() }));
    const total = zero();
    const debtors = owing.map((r) => {
      const bal = r.totalMinor - r.paidMinor;
      const past = Math.round((day(asOf).getTime() - r.departure.getTime()) / 86_400_000);
      const key = r.status === 'CONFIRMED' ? 'upcoming' : r.status === 'IN_HOUSE' && past < 0 ? 'inhouse' : past <= 30 ? 'd0_30' : past <= 60 ? 'd31_60' : 'd60';
      const b = B.find((x) => x.key === key)!;
      b.count += 1;
      b.amount[r.currency as Cur] += bal;
      total[r.currency as Cur] += bal;
      return { id: r.id, code: r.code, name: r.contact.name, phone: r.contact.phone, status: r.status, arrival: iso(r.arrival), departure: iso(r.departure), currency: r.currency, totalMinor: r.totalMinor.toString(), paidMinor: r.paidMinor.toString(), balanceMinor: bal.toString(), daysPastDeparture: Math.max(0, past) };
    });
    debtors.sort((a, b) => b.daysPastDeparture - a.daysPastDeparture || Number(BigInt(b.balanceMinor) - BigInt(a.balanceMinor)));
    const deposits = rows.filter((r) => r.status === 'CONFIRMED' && iso(r.arrival) > asOf && r.paidMinor > 0n);
    const adv = zero();
    for (const r of deposits) adv[r.currency as Cur] += r.paidMinor;
    const overdue = zero();
    let overdueCount = 0;
    for (const d of debtors) if (d.status === 'CHECKED_OUT' || (d.status === 'IN_HOUSE' && d.departure < asOf)) { overdue[d.currency as Cur] += BigInt(d.balanceMinor); overdueCount += 1; }
    return { asOf, buckets: B.map((b) => ({ key: b.key, label: b.label, count: b.count, amount: out(b.amount) })), debtors, total: out(total), advanceDeposits: out(adv), advanceDepositCount: deposits.length, overdue: out(overdue), overdueCount };
  }

  /* ───────── the full report ───────── */

  async finance(from: string, to: string, compare: 'prev' | 'yoy'): Promise<FinanceReportDTO> {
    const dates = nightsOf(from, plus(to, 1));
    if (dates.length > 400) throw badRequest('Choose up to about a year at a time');
    const [cmpFrom, cmpTo] = compare === 'prev' ? [plus(from, -dates.length), plus(from, -1)] : [shiftYear(from, -1), shiftYear(to, -1)];
    const today = hotelToday();
    const inRange = new Set(dates);
    const tsStart = kStart(from);
    const tsEnd = kStart(plus(to, 1));

    const [house, cmpHouse, cash, cmpCash, receivables] = await Promise.all([
      this.reports.house(from, to),
      this.reports.house(cmpFrom, cmpTo),
      this.cash(from, to),
      this.cash(cmpFrom, cmpTo),
      this.receivables(today),
    ]);

    const otbEnd = plus(`${today.slice(0, 8)}01`, 0);
    const otbMonths = [0, 1, 2].map((i) => {
      const [y, m] = [Number(otbEnd.slice(0, 4)), Number(otbEnd.slice(5, 7)) - 1 + i];
      const d = new Date(Date.UTC(y, m, 1));
      return iso(d).slice(0, 7);
    });
    const otbLast = iso(new Date(Date.UTC(Number(otbMonths[2]!.slice(0, 4)), Number(otbMonths[2]!.slice(5, 7)), 0)));

    const [stays, rooms, blocks, posOrders, lines, adjRows, plans, tax, future, recent, extrasLines, gym] = await Promise.all([
      this.prisma.reservation.findMany({ where: { status: { in: [...SOLD] }, arrival: { lte: day(to) }, departure: { gt: day(from) } }, include: { rooms: true, contact: { select: { name: true } } } }),
      this.prisma.room.findMany({ where: { isActive: true }, select: { roomTypeId: true } }),
      this.prisma.roomBlock.findMany({ where: { fromDate: { lte: day(otbLast > to ? otbLast : to) }, toDate: { gt: day(from < today ? from : today) } }, include: { room: { select: { roomTypeId: true } } } }),
      this.prisma.posOrder.findMany({ where: { settledAt: { gte: tsStart, lt: tsEnd }, status: { not: 'CANCELLED' } }, include: { outlet: true, items: true } }),
      this.prisma.folioLine.findMany({ where: { kind: 'FNB', date: { gte: day(from), lte: day(to) }, folio: { reservation: { status: { in: [...SOLD] } } } }, include: { folio: { select: { currency: true } } } }),
      this.prisma.folioLine.findMany({ where: { kind: { in: ['ADJUSTMENT', 'REFUND'] }, date: { gte: day(from), lte: day(to) } }, include: { folio: { select: { currency: true, reservation: { select: { id: true, code: true, contact: { select: { name: true } } } } } } }, orderBy: { date: 'asc' } }),
      this.prisma.ratePlan.findMany({ select: { id: true, name: true } }),
      this.prisma.taxRule.findFirst({ where: { isActive: true } }),
      this.prisma.reservation.findMany({ where: { status: { in: ['CONFIRMED', 'IN_HOUSE'] }, departure: { gt: day(today) }, arrival: { lte: day(otbLast) } }, include: { rooms: true } }),
      this.prisma.reservation.findMany({ where: { createdAt: { gte: new Date(Date.now() - 7 * 86_400_000) }, status: { in: ['CONFIRMED', 'IN_HOUSE', 'CHECKED_OUT'] } }, include: { rooms: true } }),
      this.prisma.folioLine.findMany({ where: { kind: { in: ['EXTRA', 'PACKAGE'] }, date: { gte: day(from), lte: day(to) }, folio: { reservation: { status: { in: [...SOLD] } } } }, include: { folio: { select: { currency: true } } } }),
      this.prisma.healthClubAccessLog.findMany({ where: { checkedInAt: { gte: tsStart, lt: tsEnd } }, select: { amountPaidMinor: true, currency: true, checkedInAt: true } }),
    ]);
    const names = await this.booking.roomTypeNames();
    const planName = new Map(plans.map((p) => [p.id, t(lt(p.name))]));

    /* rooms: by type, plan, channel, guest, LOS */
    const typeRooms = new Map<string, number>();
    for (const r of rooms) typeRooms.set(r.roomTypeId, (typeRooms.get(r.roomTypeId) ?? 0) + 1);
    const blockedNights = (typeId: string, ds: string[]) => ds.reduce((a, d) => a + blocks.filter((b) => b.room.roomTypeId === typeId && iso(b.fromDate) <= d && iso(b.toDate) > d && (!b.releasedAt || kDate(b.releasedAt) > d)).length, 0);
    const byType = new Map<string, { nights: number; rev: M }>();
    const byPlan = new Map<string, { bookings: Set<string>; nights: number; rev: M }>();
    const byChannel = new Map<string, { bookings: Set<string>; nights: number; rev: M }>();
    const byGuest = new Map<string, { name: string; stays: Set<string>; nights: number; rev: M }>();
    const dailyRoom = new Map<string, bigint>();
    const los = [
      { bucket: '1 night', min: 1, max: 1 }, { bucket: '2 nights', min: 2, max: 2 }, { bucket: '3–4 nights', min: 3, max: 4 }, { bucket: '5–7 nights', min: 5, max: 7 }, { bucket: '8+ nights', min: 8, max: Infinity },
    ].map((b) => ({ ...b, bookings: 0 }));
    for (const r of stays) {
      const cur = r.currency as Cur;
      for (const n of soldNights(r, (d) => inRange.has(d))) {
        const ty = byType.get(n.roomTypeId) ?? { nights: 0, rev: zero() };
        ty.nights += n.rooms; ty.rev[cur] += n.amount; byType.set(n.roomTypeId, ty);
        const pl = byPlan.get(r.ratePlanId) ?? { bookings: new Set(), nights: 0, rev: zero() };
        pl.bookings.add(r.id); pl.nights += n.rooms; pl.rev[cur] += n.amount; byPlan.set(r.ratePlanId, pl);
        const ch = byChannel.get(r.source) ?? { bookings: new Set(), nights: 0, rev: zero() };
        ch.bookings.add(r.id); ch.nights += n.rooms; ch.rev[cur] += n.amount; byChannel.set(r.source, ch);
        const g = byGuest.get(r.contactId) ?? { name: r.contact.name, stays: new Set(), nights: 0, rev: zero() };
        g.stays.add(r.id); g.nights += n.rooms; g.rev[cur] += n.amount; byGuest.set(r.contactId, g);
        if (cur === 'UGX') dailyRoom.set(n.date, (dailyRoom.get(n.date) ?? 0n) + n.amount);
      }
      if (inRange.has(iso(r.arrival))) {
        const n = nightsOf(iso(r.arrival), iso(r.departure)).length;
        los.find((b) => n >= b.min && n <= b.max)!.bookings += 1;
      }
    }
    const adrOf = (rev: M, nights: number) => out({ UGX: nights ? rev.UGX / BigInt(nights) : 0n, USD: nights ? rev.USD / BigInt(nights) : 0n });
    const roomTypes = [...typeRooms.entries()].map(([id, count]) => {
      const avail = count * dates.length - blockedNights(id, dates);
      const x = byType.get(id) ?? { nights: 0, rev: zero() };
      return { id, name: names.get(id) ?? 'Room', rooms: count, roomNightsSold: x.nights, roomNightsAvailable: avail, occupancy: pct(x.nights, avail), revenue: out(x.rev), adr: adrOf(x.rev, x.nights), revpar: out({ UGX: avail ? x.rev.UGX / BigInt(avail) : 0n, USD: avail ? x.rev.USD / BigInt(avail) : 0n }) };
    }).sort((a, b) => Number(BigInt(b.revenue.UGX) - BigInt(a.revenue.UGX)));
    const ratePlans = [...byPlan.entries()].map(([id, v]) => ({ id, name: planName.get(id) ?? 'Rate', bookings: v.bookings.size, roomNights: v.nights, revenue: out(v.rev), adr: adrOf(v.rev, v.nights) })).sort((a, b) => b.roomNights - a.roomNights);
    const totalNights = [...byChannel.values()].reduce((a, v) => a + v.nights, 0);
    const channels = [...byChannel.entries()].map(([source, v]) => ({ source, bookings: v.bookings.size, roomNights: v.nights, revenue: out(v.rev), share: pct(v.nights, totalNights) })).sort((a, b) => b.roomNights - a.roomNights);
    const topGuests = [...byGuest.entries()].map(([contactId, v]) => ({ contactId, name: v.name, stays: v.stays.size, nights: v.nights, revenue: out(v.rev) })).sort((a, b) => Number(BigInt(b.revenue.UGX) - BigInt(a.revenue.UGX)) || b.nights - a.nights).slice(0, 10);

    const dow = WEEKDAYS.map((d) => ({ day: d, sold: 0, available: 0 }));
    for (const d of house.days) {
      const w = dow[new Date(`${d.date}T12:00:00Z`).getUTCDay()]!;
      w.sold += d.sold;
      w.available += d.available;
    }
    const dayOfWeek = [1, 2, 3, 4, 5, 6, 0].map((i) => ({ day: dow[i]!.day, occupancy: pct(dow[i]!.sold, dow[i]!.available), roomNights: dow[i]!.sold }));

    /* POS */
    const posFolio = new Set(posOrders.map((o) => o.folioLineId).filter(Boolean));
    const deskFnbLines = lines.filter((l) => !posFolio.has(l.id));
    const linkedElsewhere = deskFnbLines.length ? new Set((await this.prisma.posOrder.findMany({ where: { folioLineId: { in: deskFnbLines.map((l) => l.id) } }, select: { folioLineId: true } })).map((x) => x.folioLineId)) : new Set<string | null>();
    const deskFnb = zero();
    const dailyFnb = new Map<string, bigint>();
    for (const l of deskFnbLines) {
      if (linkedElsewhere.has(l.id)) continue;
      deskFnb[l.folio.currency as Cur] += l.amountMinor;
      if (l.folio.currency === 'UGX') dailyFnb.set(iso(l.date), (dailyFnb.get(iso(l.date)) ?? 0n) + l.amountMinor);
    }
    const outlets = new Map<string, { id: string; name: string; type: string; orders: number; rev: M; disc: M; toRoom: number }>();
    const items = new Map<string, { name: string; qty: number; rev: M }>();
    const hours = Array.from({ length: 24 }, (_, hour) => ({ hour, orders: 0, rev: 0n }));
    const posDiscounts = zero();
    for (const o of posOrders) {
      const cur = o.currency as Cur;
      const x = outlets.get(o.outletId) ?? { id: o.outletId, name: o.outlet.name, type: o.outlet.type, orders: 0, rev: zero(), disc: zero(), toRoom: 0 };
      x.orders += 1; x.rev[cur] += o.totalMinor; x.disc[cur] += o.discountMinor; if (o.paymentMethod === 'ROOM_FOLIO') x.toRoom += 1;
      outlets.set(o.outletId, x);
      posDiscounts[cur] += o.discountMinor;
      for (const it of o.items) {
        const k = it.itemId;
        const v = items.get(k) ?? { name: it.itemName, qty: 0, rev: zero() };
        v.qty += it.quantity; v.rev[cur] += it.totalMinor; items.set(k, v);
      }
      if (o.settledAt) {
        const h = hours[(o.settledAt.getUTCHours() + 3) % 24]!;
        h.orders += 1;
        if (cur === 'UGX') h.rev += o.totalMinor;
        if (cur === 'UGX') { const d = kDate(o.settledAt); dailyFnb.set(d, (dailyFnb.get(d) ?? 0n) + o.totalMinor); }
      }
    }
    const pos = {
      outlets: [...outlets.values()].map((x) => ({ id: x.id, name: x.name, type: x.type, orders: x.orders, revenue: out(x.rev), avgCheck: adrOf(x.rev, x.orders), discounts: out(x.disc), toRoomFolio: x.toRoom })).sort((a, b) => b.orders - a.orders),
      topItems: [...items.values()].sort((a, b) => b.qty - a.qty).slice(0, 12).map((v) => ({ name: v.name, quantity: v.qty, revenue: out(v.rev) })),
      byHour: hours.map((h) => ({ hour: h.hour, orders: h.orders, revenueUGX: h.rev.toString() })),
      deskFnb: out(deskFnb),
    };

    /* daily series */
    const dailyOther = new Map<string, bigint>();
    for (const l of extrasLines) if (l.folio.currency === 'UGX') dailyOther.set(iso(l.date), (dailyOther.get(iso(l.date)) ?? 0n) + l.amountMinor);
    for (const g of gym) if (g.currency === 'UGX') { const d = kDate(g.checkedInAt); dailyOther.set(d, (dailyOther.get(d) ?? 0n) + g.amountPaidMinor); }
    const daily = house.days.map((d) => ({
      date: d.date,
      roomUGX: (dailyRoom.get(d.date) ?? 0n).toString(),
      fnbUGX: (dailyFnb.get(d.date) ?? 0n).toString(),
      otherUGX: (dailyOther.get(d.date) ?? 0n).toString(),
      collectedUGX: (cash.daily.get(d.date)?.collected ?? 0n).toString(),
      expensesUGX: (cash.daily.get(d.date)?.expenses ?? 0n).toString(),
      occupancy: d.occupancy,
    }));

    /* allowances & adjustments */
    const adj = classifyAdjustments(adjRows.filter((l) => l.kind === 'ADJUSTMENT'));
    const refunds = zero();
    for (const l of adjRows) if (l.kind === 'REFUND') refunds[l.folio.currency as Cur] += l.amountMinor;
    const adjustments = {
      discounts: out(adj.discounts),
      credits: out(adj.credits),
      writeOffs: out(adj.writeOffs),
      refunds: out(refunds),
      cancellationFees: out(adj.cancellationFees),
      noShowRevenue: out(adj.noShow),
      posDiscounts: out(posDiscounts),
      lines: adjRows
        .filter((l) => !isMechanical(l.description) && (l.kind === 'REFUND' || l.amountMinor !== 0n))
        .filter((l) => l.kind === 'REFUND' || l.amountMinor < 0n || /^(Cancellation fee|No-show charge)/.test(l.description))
        .map((l) => ({
          date: iso(l.date),
          reservationId: l.folio.reservation.id,
          code: l.folio.reservation.code,
          guest: l.folio.reservation.contact.name,
          kind: l.kind === 'REFUND' ? 'REFUND' : l.description.startsWith('Discount') ? 'DISCOUNT' : l.description.startsWith('Written off') ? 'WRITE_OFF' : l.description.startsWith('Cancellation fee') ? 'CANCELLATION_FEE' : l.description.startsWith('No-show') ? 'NO_SHOW' : 'CREDIT',
          description: l.description,
          currency: l.folio.currency,
          amountMinor: l.amountMinor.toString(),
        })),
    };

    /* on the books (forward from today) */
    const months = otbMonths.map((month) => ({ month, roomNights: 0, roomNightsAvailable: 0, occupancy: 0, revenue: zero(), bookings: new Set<string>() }));
    for (const mo of months) {
      const first = mo.month === today.slice(0, 7) ? today : `${mo.month}-01`;
      const last = iso(new Date(Date.UTC(Number(mo.month.slice(0, 4)), Number(mo.month.slice(5, 7)), 0)));
      const ds = nightsOf(first, plus(last, 1));
      mo.roomNightsAvailable = [...typeRooms.entries()].reduce((a, [id, c]) => a + c * ds.length - blockedNights(id, ds), 0);
    }
    for (const r of future) {
      for (const n of soldNights(r as unknown as Stay, (d) => d >= today && d <= otbLast)) {
        const mo = months.find((m) => m.month === n.date.slice(0, 7));
        if (!mo) continue;
        mo.roomNights += n.rooms;
        mo.revenue[r.currency as Cur] += n.amount;
        mo.bookings.add(r.id);
      }
    }
    const pickup = { bookings: 0, roomNights: 0, revenue: zero() };
    for (const r of recent) {
      const ns = soldNights(r as unknown as Stay, (d) => d >= today);
      if (!ns.length) continue;
      pickup.bookings += 1;
      for (const n of ns) { pickup.roomNights += n.rooms; pickup.revenue[r.currency as Cur] += n.amount; }
    }
    const onTheBooks = {
      months: months.map((m) => ({ month: m.month, roomNights: m.roomNights, roomNightsAvailable: m.roomNightsAvailable, occupancy: pct(m.roomNights, m.roomNightsAvailable), revenue: out(m.revenue), bookings: m.bookings.size })),
      pickup7d: { bookings: pickup.bookings, roomNights: pickup.roomNights, revenue: out(pickup.revenue) },
    };

    /* VAT contained in inclusive prices */
    const kpis = this.kpis(house, cash);
    const cmp = this.kpis(cmpHouse, cmpCash);
    let taxOut: FinanceReportDTO['tax'] = null;
    if (tax) {
      const rate = Number(tax.ratePercent);
      const base = inM(kpis.netRevenue);
      const scale = BigInt(Math.round(rate * 100));
      const vat = zero();
      for (const c of CURS) vat[c] = tax.inclusive ? (base[c] * scale) / (10_000n + scale) : (base[c] * scale) / 10_000n;
      taxOut = { label: t(lt(tax.name)) || 'VAT', ratePercent: rate, inclusive: tax.inclusive, vat: out(vat) };
    }

    const { overdue: _o, overdueCount: _c, ...rec } = receivables;
    return {
      from, to, compareMode: compare, compareFrom: cmpFrom, compareTo: cmpTo, generatedAt: new Date().toISOString(),
      kpis, compare: cmp, house, daily, roomTypes, ratePlans, channels,
      lengthOfStay: los.map(({ bucket, bookings }) => ({ bucket, bookings })),
      dayOfWeek, pos, cash: { rails: cash.rails, totals: cash.totals }, receivables: rec, adjustments, onTheBooks, topGuests, tax: taxOut,
      insights: this.insights(kpis, cmp, compare, cash.totals, receivables, adjustments, channels, onTheBooks.months[0]),
    };
  }

  private insights(k: FinanceKpisDTO, c: FinanceKpisDTO, mode: 'prev' | 'yoy', cash: { inflow: MoneyByCurrency; missingRefs: number }, rec: Awaited<ReturnType<FinanceService['receivables']>>, adj: FinanceReportDTO['adjustments'], channels: FinanceReportDTO['channels'], otb?: FinanceReportDTO['onTheBooks']['months'][number]): FinanceReportDTO['insights'] {
    const fmt = (v: string | bigint) => this.booking.money(BigInt(v), 'UGX');
    const vs = mode === 'prev' ? 'the previous period' : 'the same dates last year';
    const list: FinanceReportDTO['insights'] = [];
    const net = BigInt(k.netRevenue.UGX), netC = BigInt(c.netRevenue.UGX);
    if (netC > 0n) {
      const ch = Math.round((Number(net - netC) / Number(netC)) * 1000) / 10;
      list.push({ tone: ch >= 0 ? 'good' : 'bad', title: `Revenue ${ch >= 0 ? 'up' : 'down'} ${Math.abs(ch)}%`, detail: `${fmt(net)} net against ${fmt(netC)} in ${vs}.` });
    } else if (net > 0n) list.push({ tone: 'good', title: 'Revenue where there was none', detail: `${fmt(net)} net; nothing was earned in ${vs}.` });
    const occD = Math.round((k.occupancy - c.occupancy) * 10) / 10;
    if (k.roomNightsAvailable) list.push({ tone: occD >= 0 ? 'good' : 'warn', title: `Occupancy ${k.occupancy}% (${occD >= 0 ? '+' : ''}${occD} pts)`, detail: `${k.roomNightsSold} of ${k.roomNightsAvailable} room nights sold. ADR ${fmt(k.adr.UGX)}, RevPAR ${fmt(k.revpar.UGX)}.` });
    if (net > 0n) {
      const margin = Math.round((Number(BigInt(k.gop.UGX)) / Number(net)) * 1000) / 10;
      list.push({ tone: margin < 0 ? 'bad' : margin < 20 ? 'warn' : 'good', title: `Operating margin ${margin}%`, detail: `GOP ${fmt(k.gop.UGX)} after ${fmt(k.expenses.UGX)} of costs.` });
    } else if (BigInt(k.expenses.UGX) > 0n) list.push({ tone: 'bad', title: 'Costs with no revenue', detail: `${fmt(k.expenses.UGX)} spent in a period with no earnings.` });
    if (rec.overdueCount) list.push({ tone: 'bad', title: `${rec.overdueCount} guest${rec.overdueCount > 1 ? 's' : ''} left owing money`, detail: `${fmt(rec.overdue.UGX)}${BigInt(rec.overdue.USD) ? ` + ${this.booking.money(BigInt(rec.overdue.USD), 'USD')}` : ''} outstanding after departure. Chase or write off.` });
    if (cash.missingRefs) list.push({ tone: 'warn', title: `${cash.missingRefs} digital payment${cash.missingRefs > 1 ? 's' : ''} without a reference`, detail: 'Mobile money, card or bank payments recorded with no transaction ID can’t be matched to statements.' });
    const allow = BigInt(adj.discounts.UGX) + BigInt(adj.credits.UGX) + BigInt(adj.writeOffs.UGX);
    const roomRev = BigInt(k.roomRevenue.UGX);
    if (allow > 0n && roomRev > 0n) {
      const p = Math.round((Number(allow) / Number(roomRev)) * 1000) / 10;
      list.push({ tone: p > 5 ? 'warn' : 'info', title: `${fmt(allow)} given away (${p}% of rooms)`, detail: `Discounts ${fmt(adj.discounts.UGX)}, credits ${fmt(adj.credits.UGX)}, write-offs ${fmt(adj.writeOffs.UGX)}.` });
    }
    if (channels[0] && channels[0].share >= 50) list.push({ tone: 'info', title: `${channels[0].share}% of nights from one channel`, detail: `${channels[0].source.replace('_', ' ').toLowerCase()} brought ${channels[0].roomNights} room nights. Worth spreading the risk.` });
    if (k.bookings && k.cancellations / Math.max(1, k.bookings) > 0.2) list.push({ tone: 'warn', title: `${k.cancellations} cancellations`, detail: `Against ${k.bookings} bookings made — check deposit terms.` });
    if (otb) list.push({ tone: otb.occupancy >= 50 ? 'good' : otb.occupancy >= 25 ? 'info' : 'warn', title: `This month on the books: ${otb.occupancy}%`, detail: `${otb.roomNights} room nights confirmed from today, ${fmt(otb.revenue.UGX)}.` });
    return list;
  }

  /* ───────── owner brief extras ───────── */

  async briefInsights(date = hotelToday()): Promise<BriefInsightsDTO> {
    const monthStart = `${date.slice(0, 8)}01`;
    const dayN = Number(date.slice(8));
    const lmStart = iso(new Date(Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 2, 1)));
    const lmDays = new Date(Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, 0)).getUTCDate();
    const lmEnd = plus(lmStart, Math.min(dayN, lmDays) - 1);
    const today = hotelToday();
    const ts = kStart(date);
    const te = kStart(plus(date, 1));
    const horizon = plus(date, 30);

    const [h, hLm, hLy, c, cLm, cLy, cToday, made, cancels, rooms, stays, receivables, holds, late, overdueOut, occupiedRooms, arrivalsToday, unhandled] = await Promise.all([
      this.reports.house(monthStart, date),
      this.reports.house(lmStart, lmEnd),
      this.reports.house(shiftYear(monthStart, -1), shiftYear(date, -1)),
      this.cash(monthStart, date),
      this.cash(lmStart, lmEnd),
      this.cash(shiftYear(monthStart, -1), shiftYear(date, -1)),
      this.cash(date, date),
      this.prisma.reservation.findMany({ where: { createdAt: { gte: ts, lt: te }, status: { notIn: ['EXPIRED', 'CANCELLED'] } }, select: { totalMinor: true, currency: true } }),
      this.prisma.reservation.count({ where: { cancelledAt: { gte: ts, lt: te } } }),
      this.prisma.room.findMany({ where: { isActive: true }, select: { id: true, number: true, hkStatus: true } }),
      this.prisma.reservation.findMany({ where: { status: { in: ['CONFIRMED', 'IN_HOUSE'] }, arrival: { lte: day(horizon) }, departure: { gt: day(date) } }, include: { rooms: true } }),
      this.receivables(date),
      this.prisma.reservation.findMany({ where: { status: 'HELD', holdExpiresAt: { lt: new Date(Date.now() + 6 * 3600_000) } }, include: { contact: { select: { name: true } } } }),
      this.prisma.reservation.findMany({ where: { status: 'CONFIRMED', arrival: { lt: day(date) } }, include: { contact: { select: { name: true } } } }),
      this.prisma.reservation.findMany({ where: { status: 'IN_HOUSE', departure: { lt: day(date) } }, include: { contact: { select: { name: true } } } }),
      this.prisma.roomAssignment.findMany({ where: { releasedAt: null, reservation: { status: 'IN_HOUSE' } }, select: { roomId: true } }),
      this.prisma.reservation.findMany({ where: { status: 'CONFIRMED', arrival: day(date) }, include: { rooms: true, contact: { select: { name: true } }, assignments: { where: { releasedAt: null } } } }),
      this.prisma.feedback.count({ where: { score: 'BAD', handledAt: null } }),
    ]);

    const total = rooms.length;
    const forecast30 = Array.from({ length: 30 }, (_, i) => {
      const d = plus(date, i);
      let r = 0;
      let rev = 0n;
      for (const s of stays) {
        if (iso(s.arrival) <= d && iso(s.departure) > d) {
          for (const rr of s.rooms) {
            r += rr.quantity;
            if (s.currency === 'UGX') rev += BigInt((rr.nightly as { date: string; amountMinor: string }[]).find((n) => n.date === d)?.amountMinor ?? '0') * BigInt(rr.quantity);
          }
        }
      }
      return { date: d, rooms: r, percent: total ? Math.min(100, Math.round((r / total) * 100)) : 0, revenueUGX: rev.toString(), arrivals: stays.filter((s) => iso(s.arrival) === d).length, departures: stays.filter((s) => iso(s.departure) === d).length };
    });
    const fRev = zero();
    let fNights = 0;
    for (const s of stays) for (const n of soldNights(s as unknown as Stay, (d) => d >= date && d < horizon)) { fNights += n.rooms; fRev[s.currency as Cur] += n.amount; }

    const tonight = stays.filter((s) => iso(s.arrival) <= date && iso(s.departure) > date);
    const roomsOf = (list: typeof stays) => list.reduce((a, s) => a + s.rooms.reduce((b, x) => b + x.quantity, 0), 0);
    const inHouse = roomsOf(tonight.filter((s) => s.status === 'IN_HOUSE'));
    const arriving = roomsOf(tonight.filter((s) => s.status === 'CONFIRMED'));
    const revTonight = zero();
    for (const s of tonight) for (const n of soldNights(s as unknown as Stay, (d) => d === date)) revTonight[s.currency as Cur] += n.amount;

    const bookingsValue = zero();
    for (const m of made) bookingsValue[m.currency as Cur] += m.totalMinor;

    /* what needs the owner's eye */
    const fmt = (v: bigint, cur = 'UGX') => this.booking.money(v, cur);
    const attention: BriefInsightsDTO['attention'] = [];
    if (receivables.overdueCount) attention.push({ tone: 'bad', title: `${receivables.overdueCount} guest${receivables.overdueCount > 1 ? 's' : ''} left without paying in full`, detail: `${fmt(BigInt(receivables.overdue.UGX))} owed after departure.`, href: '/reports?tab=RECEIVABLES' });
    if (overdueOut.length) attention.push({ tone: 'bad', title: `${overdueOut.length} stay${overdueOut.length > 1 ? 's' : ''} past departure still in the house`, detail: overdueOut.map((r) => `${r.contact.name} (${r.code})`).join(', '), href: '/desk' });
    const ghost = rooms.filter((r) => r.hkStatus === 'OCCUPIED' && !occupiedRooms.some((a) => a.roomId === r.id));
    if (ghost.length) attention.push({ tone: 'warn', title: `Room${ghost.length > 1 ? 's' : ''} ${ghost.map((r) => r.number).join(', ')} marked occupied with no guest checked in`, detail: 'Housekeeping status and the desk disagree — fix it on the Room Rack so the room can be sold.', href: '/rack' });
    if (late.length) attention.push({ tone: 'warn', title: `${late.length} confirmed guest${late.length > 1 ? 's' : ''} never arrived`, detail: `${late.map((r) => `${r.contact.name} (${iso(r.arrival)})`).join(', ')} — check in, change dates or mark no-show.`, href: '/desk' });
    if (holds.length) attention.push({ tone: 'warn', title: `${holds.length} hold${holds.length > 1 ? 's' : ''} expire within 6 hours`, detail: holds.map((r) => r.contact.name).join(', '), href: '/reservations?sort=latest' });
    const ready = rooms.filter((r) => r.hkStatus === 'VACANT_CLEAN' || r.hkStatus === 'INSPECTED').length;
    const needed = arrivalsToday.reduce((a, r) => a + r.rooms.reduce((b, x) => b + x.quantity, 0), 0);
    if (date === today && needed > ready) attention.push({ tone: 'bad', title: `${needed} rooms arriving, only ${ready} ready`, detail: 'Housekeeping needs to turn rooms before the guests arrive.', href: '/housekeeping' });
    const unassigned = arrivalsToday.filter((r) => r.assignments.length === 0);
    if (unassigned.length) attention.push({ tone: 'info', title: `${unassigned.length} arrival${unassigned.length > 1 ? 's' : ''} today without a room number`, detail: unassigned.map((r) => r.contact.name).join(', '), href: '/desk' });
    const dueToday = arrivalsToday.filter((r) => r.totalMinor > r.paidMinor);
    if (dueToday.length) attention.push({ tone: 'info', title: `${dueToday.length} arrival${dueToday.length > 1 ? 's' : ''} today with a balance to collect`, detail: dueToday.map((r) => `${r.contact.name} ${fmt(r.totalMinor - r.paidMinor, r.currency)}`).join(', '), href: '/desk' });
    if (cToday.totals.missingRefs) attention.push({ tone: 'warn', title: `${cToday.totals.missingRefs} digital payment${cToday.totals.missingRefs > 1 ? 's' : ''} today without a reference`, detail: 'Add the MoMo / bank transaction ID so the statement matches.', href: '/reports?tab=CASH' });
    if (unhandled) attention.push({ tone: 'warn', title: `${unhandled} unhappy guest${unhandled > 1 ? 's' : ''} not yet answered`, detail: 'Negative feedback waiting for a reply.', href: '/feedback' });

    return {
      date,
      mtd: this.kpis(h, c),
      mtdLastMonth: this.kpis(hLm, cLm),
      mtdLastYear: this.kpis(hLy, cLy),
      today: {
        collected: subM(cToday.totals.inflow, cToday.totals.refunds),
        refunds: cToday.totals.refunds,
        expenses: cToday.totals.outflow,
        byRail: cToday.rails.map((r) => ({ method: r.method, label: r.label, amount: subM(r.inflow, r.refunds), count: r.inCount })),
        bookingsMade: made.length,
        bookingsValue: out(bookingsValue),
        cancellations: cancels,
        roomRevenueTonight: out(revTonight),
      },
      onBooksTonight: { rooms: inHouse + arriving, total, percent: total ? Math.round(((inHouse + arriving) / total) * 100) : 0, inHouse, arrivingStill: arriving },
      forecast30,
      forecast30Totals: { roomNights: fNights, occupancy: pct(fNights, total * 30), revenue: out(fRev) },
      receivables: { total: receivables.total, overdue: receivables.overdue, overdueCount: receivables.overdueCount, advanceDeposits: receivables.advanceDeposits },
      attention,
    };
  }
}
