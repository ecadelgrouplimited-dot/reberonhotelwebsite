import { Injectable } from '@nestjs/common';
import type { FeedbackScore, HouseReportDTO, MoneyByCurrency } from '@reberon/contracts';
import { PrismaService } from '../../common/prisma.service.js';
import { badRequest } from '../../common/errors.js';
import { BookingService } from '../booking/booking.service.js';
import { day, iso, nightsOf } from '../booking/inventory.service.js';

type Cur = 'UGX' | 'USD';
const zero = (): Record<Cur, bigint> => ({ UGX: 0n, USD: 0n });
const out = (m: Record<Cur, bigint>): MoneyByCurrency => ({ UGX: m.UGX.toString(), USD: m.USD.toString() });
const SOLD = ['CONFIRMED', 'IN_HOUSE', 'CHECKED_OUT'] as const;
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 1000) / 10 : 0);

/**
 * The owner's numbers (M21). Room nights come from the frozen nightly rates, so a
 * rate change never rewrites the past. UGX and USD are summed separately.
 */
@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly booking: BookingService,
  ) {}

  async house(from: string, to: string): Promise<HouseReportDTO> {
    const dates = nightsOf(from, iso(new Date(day(to).getTime() + 86_400_000)));
    if (dates.length > 400) throw badRequest('Choose up to about a year at a time');
    const start = day(from);
    const endExcl = new Date(day(to).getTime() + 86_400_000);

    const [
      rooms,
      blocks,
      stays,
      created,
      cancelled,
      noShows,
      lines,
      payments,
      refunds,
      feedback,
      names,
      posOrders,
      memberships,
      gymVisits,
      acceptedQuotes,
      expensesList,
      disbursedReqs,
    ] = await Promise.all([
      this.prisma.room.findMany({ where: { isActive: true }, select: { id: true, roomTypeId: true } }),
      this.prisma.roomBlock.findMany({ where: { fromDate: { lt: endExcl }, toDate: { gt: start } }, include: { room: { select: { roomTypeId: true } } } }),
      this.prisma.reservation.findMany({ where: { status: { in: [...SOLD] }, arrival: { lt: endExcl }, departure: { gt: start } }, include: { rooms: true } }),
      this.prisma.reservation.findMany({ where: { createdAt: { gte: start, lt: endExcl }, status: { notIn: ['HELD', 'EXPIRED'] } }, select: { createdAt: true, arrival: true } }),
      this.prisma.reservation.count({ where: { cancelledAt: { gte: start, lt: endExcl } } }),
      this.prisma.reservation.count({ where: { status: 'NO_SHOW', arrival: { gte: start, lt: endExcl } } }),
      this.prisma.folioLine.findMany({ where: { kind: { in: ['EXTRA', 'PACKAGE', 'FNB'] }, date: { gte: start, lt: endExcl }, folio: { reservation: { status: { in: [...SOLD] } } } }, include: { folio: { select: { currency: true } } } }),
      this.prisma.paymentIntent.findMany({ where: { status: 'SUCCEEDED', paidAt: { gte: start, lt: endExcl } }, select: { amountMinor: true, currency: true, method: true } }),
      this.prisma.folioLine.findMany({ where: { kind: 'REFUND', date: { gte: start, lt: endExcl } }, include: { folio: { select: { currency: true } } } }),
      this.prisma.feedback.groupBy({ by: ['score'], where: { createdAt: { gte: start, lt: endExcl } }, _count: true }),
      this.booking.roomTypeNames(),
      this.prisma.posOrder.findMany({
        where: { createdAt: { gte: start, lt: endExcl }, status: { in: ['COMPLETED', 'READY', 'PREPARING'] } },
        include: { outlet: true },
      }),
      this.prisma.healthClubMembership.findMany({
        where: { createdAt: { gte: start, lt: endExcl } },
      }),
      this.prisma.healthClubAccessLog.findMany({
        where: { checkedInAt: { gte: start, lt: endExcl } },
      }),
      this.prisma.quotation.findMany({
        where: { status: { in: ['ACCEPTED', 'CONVERTED'] }, updatedAt: { gte: start, lt: endExcl } },
      }),
      this.prisma.expense.findMany({
        where: { date: { gte: start, lt: endExcl } },
      }),
      this.prisma.requisition.findMany({
        where: { status: 'DISBURSED', updatedAt: { gte: start, lt: endExcl } },
      }),
    ]);

    const inRange = new Set(dates);
    const sold = new Map<string, number>(dates.map((d) => [d, 0]));
    const soldByType = new Map<string, number>();
    const revenue = zero();
    const nightsByCur: Record<Cur, number> = { UGX: 0, USD: 0 };
    const source = new Map<string, { bookings: number; roomNights: number }>();
    let staysArriving = 0;
    let nightsArriving = 0;

    for (const r of stays) {
      const cur = r.currency as Cur;
      // An early departure frees the unslept nights, which are no longer sold.
      const lastNight = r.status === 'CHECKED_OUT' && r.checkedOutAt ? iso(r.checkedOutAt) : null;
      let mine = 0;
      for (const rr of r.rooms) {
        for (const n of rr.nightly as { date: string; amountMinor: string }[]) {
          if (!inRange.has(n.date)) continue;
          if (lastNight && n.date >= lastNight && lastNight < iso(r.departure)) continue;
          sold.set(n.date, (sold.get(n.date) ?? 0) + rr.quantity);
          soldByType.set(rr.roomTypeId, (soldByType.get(rr.roomTypeId) ?? 0) + rr.quantity);
          revenue[cur] += BigInt(n.amountMinor) * BigInt(rr.quantity);
          nightsByCur[cur] += rr.quantity;
          mine += rr.quantity;
        }
      }
      const s = source.get(r.source) ?? { bookings: 0, roomNights: 0 };
      s.bookings += 1;
      s.roomNights += mine;
      source.set(r.source, s);
      if (iso(r.arrival) >= from && iso(r.arrival) <= to) {
        staysArriving += 1;
        nightsArriving += nightsOf(iso(r.arrival), iso(r.departure)).length;
      }
    }

    const typeRooms = new Map<string, number>();
    for (const r of rooms) typeRooms.set(r.roomTypeId, (typeRooms.get(r.roomTypeId) ?? 0) + 1);
    const blockedOn = (d: string, typeId?: string) => blocks.filter((b) => iso(b.fromDate) <= d && iso(b.toDate) > d && (!b.releasedAt || iso(b.releasedAt) > d) && (!typeId || b.room.roomTypeId === typeId)).length;

    const days = dates.map((d) => {
      const available = rooms.length - blockedOn(d);
      const s = sold.get(d) ?? 0;
      return { date: d, available, sold: s, occupancy: pct(s, available) };
    });
    const roomNightsAvailable = days.reduce((a, d) => a + d.available, 0);
    const roomNightsSold = days.reduce((a, d) => a + d.sold, 0);

    const other = zero();
    for (const l of lines) other[l.folio.currency as Cur] += l.amountMinor;
    const collected = zero();
    for (const p of payments) collected[p.currency as Cur] += p.amountMinor;
    for (const l of refunds) collected[l.folio.currency as Cur] -= l.amountMinor;

    const adr = zero();
    const revpar = zero();
    for (const c of ['UGX', 'USD'] as Cur[]) {
      adr[c] = nightsByCur[c] ? revenue[c] / BigInt(nightsByCur[c]) : 0n;
      revpar[c] = roomNightsAvailable ? revenue[c] / BigInt(roomNightsAvailable) : 0n;
    }

    const buckets = [
      { bucket: 'Same day', max: 0 },
      { bucket: '1–7 days', max: 7 },
      { bucket: '8–30 days', max: 30 },
      { bucket: '31–90 days', max: 90 },
      { bucket: '90+ days', max: Infinity },
    ].map((b) => ({ ...b, bookings: 0 }));
    for (const r of created) {
      const lead = Math.max(0, Math.round((r.arrival.getTime() - day(iso(r.createdAt)).getTime()) / 86_400_000));
      buckets.find((b) => lead <= b.max)!.bookings += 1;
    }

    // Returning: the guest had a completed stay before this arrival.
    const arriving = stays.filter((r) => iso(r.arrival) >= from && iso(r.arrival) <= to);
    const returningGuests = arriving.length
      ? (
          await Promise.all(
            arriving.map((r) => this.prisma.reservation.count({ where: { contactId: r.contactId, status: 'CHECKED_OUT', departure: { lte: r.arrival }, id: { not: r.id } } })),
          )
        ).filter((n) => n > 0).length
      : 0;

    const fb = Object.fromEntries((['GOOD', 'OK', 'BAD'] as FeedbackScore[]).map((s) => [s, feedback.find((f) => f.score === s)?._count ?? 0])) as Record<FeedbackScore, number>;

    /* ───── Multi-Department Aggregation ───── */
    const kitchenOrders = posOrders.filter((o) => o.outlet.type === 'KITCHEN');
    const kitchenRev = zero();
    for (const o of kitchenOrders) kitchenRev.UGX += o.totalMinor;

    const barOrders = posOrders.filter((o) => o.outlet.type === 'BAR');
    const barRev = zero();
    for (const o of barOrders) barRev.UGX += o.totalMinor;

    const gymRev = zero();
    for (const m of memberships) gymRev.UGX += m.amountMinor;
    for (const log of gymVisits) gymRev.UGX += log.amountPaidMinor;

    const eventsRev = zero();
    for (const q of acceptedQuotes) eventsRev.UGX += q.totalMinor;

    const extrasRev = zero();
    for (const l of lines) {
      if (l.kind === 'EXTRA' || l.kind === 'PACKAGE') {
        extrasRev[l.folio.currency as Cur] += l.amountMinor;
      }
    }

    const totalHotelGross = zero();
    for (const c of ['UGX', 'USD'] as Cur[]) {
      totalHotelGross[c] =
        revenue[c] +
        kitchenRev[c] +
        barRev[c] +
        gymRev[c] +
        eventsRev[c] +
        extrasRev[c];
    }

    const depList = [
      {
        department: 'ROOMS',
        label: 'Rooms & Accommodation',
        revenue: out(revenue),
        ordersCount: staysArriving || stays.length,
        secondaryMetric: `${roomNightsSold} room nights · ${pct(roomNightsSold, roomNightsAvailable)}% occ`,
        sharePercent: totalHotelGross.UGX ? pct(Number(revenue.UGX), Number(totalHotelGross.UGX)) : 0,
      },
      {
        department: 'KITCHEN',
        label: 'Restaurant & Kitchen Dining',
        revenue: out(kitchenRev),
        ordersCount: kitchenOrders.length,
        secondaryMetric: `${kitchenOrders.length} meal orders served`,
        sharePercent: totalHotelGross.UGX ? pct(Number(kitchenRev.UGX), Number(totalHotelGross.UGX)) : 0,
      },
      {
        department: 'BAR',
        label: 'Bar & Lounge Beverages',
        revenue: out(barRev),
        ordersCount: barOrders.length,
        secondaryMetric: `${barOrders.length} drink tabs & orders`,
        sharePercent: totalHotelGross.UGX ? pct(Number(barRev.UGX), Number(totalHotelGross.UGX)) : 0,
      },
      {
        department: 'HEALTH_CLUB',
        label: 'Health Club, Gym & Spa',
        revenue: out(gymRev),
        ordersCount: memberships.length,
        secondaryMetric: `${memberships.length} memberships · ${gymVisits.length} visits logged`,
        sharePercent: totalHotelGross.UGX ? pct(Number(gymRev.UGX), Number(totalHotelGross.UGX)) : 0,
      },
      {
        department: 'CONFERENCE',
        label: 'Conferences, Events & Banqueting',
        revenue: out(eventsRev),
        ordersCount: acceptedQuotes.length,
        secondaryMetric: `${acceptedQuotes.length} event quotations accepted`,
        sharePercent: totalHotelGross.UGX ? pct(Number(eventsRev.UGX), Number(totalHotelGross.UGX)) : 0,
      },
      {
        department: 'EXTRAS_TOURS',
        label: 'Tours, Transport & Extras',
        revenue: out(extrasRev),
        ordersCount: lines.length,
        secondaryMetric: `${lines.length} excursions, laundry & extras`,
        sharePercent: totalHotelGross.UGX ? pct(Number(extrasRev.UGX), Number(totalHotelGross.UGX)) : 0,
      },
    ];

    /* ───── Expense Management & Cost Drivers ───── */
    const CATEGORY_NAMES: Record<string, { label: string; isDirectCost: boolean }> = {
      COGS_FOOD: { label: 'Kitchen Food Supplies & Produce (COGS)', isDirectCost: true },
      COGS_BEVERAGE: { label: 'Bar Beverage Stock & Bottles (COGS)', isDirectCost: true },
      UTILITIES_ELECTRICITY: { label: 'Electricity Bills (Umeme)', isDirectCost: false },
      UTILITIES_DIESEL_FUEL: { label: 'Diesel Fuel (Backup Generator)', isDirectCost: false },
      UTILITIES_WATER_GAS: { label: 'Water & Gas Cylinders', isDirectCost: false },
      MAINTENANCE_REPAIRS: { label: 'Property Repairs & Maintenance', isDirectCost: false },
      HOUSEKEEPING_AMENITIES: { label: 'Linen, Cleaning & Room Amenities', isDirectCost: false },
      STAFF_PAYROLL_WELFARE: { label: 'Staff Payroll, Wages & Welfare', isDirectCost: false },
      MARKETING_COMMISSIONS: { label: 'Marketing, Advertising & OTA Fees', isDirectCost: false },
      ADMIN_GENERAL: { label: 'General Administration & IT Licensing', isDirectCost: false },
    };

    const expMap = new Map<string, { amount: Record<Cur, bigint>; count: number; department: string }>();
    const totalExpenses = zero();
    const cogsTotal = zero();
    const opexTotal = zero();

    for (const e of expensesList) {
      const cur = (e.currency ?? 'UGX') as Cur;
      totalExpenses[cur] += e.amountMinor;
      const meta = CATEGORY_NAMES[e.category] ?? { label: e.category, isDirectCost: false };
      if (meta.isDirectCost) {
        cogsTotal[cur] += e.amountMinor;
      } else {
        opexTotal[cur] += e.amountMinor;
      }
      const existing = expMap.get(e.category) ?? { amount: zero(), count: 0, department: e.department };
      existing.amount[cur] += e.amountMinor;
      existing.count += 1;
      expMap.set(e.category, existing);
    }

    // Include disbursed requisitions in OPEX
    for (const r of disbursedReqs) {
      const cur = (r.currency ?? 'UGX') as Cur;
      totalExpenses[cur] += r.totalEstimatedMinor;
      opexTotal[cur] += r.totalEstimatedMinor;
    }

    const expensesByCategory = Object.entries(CATEGORY_NAMES).map(([cat, meta]) => {
      const data = expMap.get(cat) ?? { amount: zero(), count: 0, department: 'GENERAL_ADMIN' };
      return {
        category: cat,
        label: meta.label,
        department: data.department,
        isDirectCost: meta.isDirectCost,
        amount: out(data.amount),
        count: data.count,
      };
    });

    const DEPT_NAMES: Record<string, string> = {
      KITCHEN: 'Kitchen & Restaurant',
      BAR: 'Bar & Lounge',
      HEALTH_CLUB: 'Health Club & Spa',
      HOUSEKEEPING: 'Housekeeping & Laundry',
      FRONT_DESK: 'Front Desk & Guest Services',
      CONFERENCE: 'Conferences & Banqueting',
      MAINTENANCE: 'Maintenance & Repairs',
      ENERGY_UTILITIES: 'Energy & Utilities',
      ADMIN_GENERAL: 'General & Administrative',
    };

    const deptExpMap = new Map<string, { amount: Record<Cur, bigint>; count: number }>();
    for (const e of expensesList) {
      const cur = (e.currency ?? 'UGX') as Cur;
      const d = deptExpMap.get(e.department) ?? { amount: zero(), count: 0 };
      d.amount[cur] += e.amountMinor;
      d.count += 1;
      deptExpMap.set(e.department, d);
    }
    for (const r of disbursedReqs) {
      const cur = (r.currency ?? 'UGX') as Cur;
      const d = deptExpMap.get(r.department) ?? { amount: zero(), count: 0 };
      d.amount[cur] += r.totalEstimatedMinor;
      d.count += 1;
      deptExpMap.set(r.department, d);
    }

    const expensesByDepartment = Object.entries(DEPT_NAMES).map(([deptKey, label]) => {
      const d = deptExpMap.get(deptKey) ?? { amount: zero(), count: 0 };
      return {
        department: deptKey,
        label,
        amount: out(d.amount),
        count: d.count,
      };
    });

    /* ───── Financial P&L Summary ───── */
    const grossProfit = zero();
    const gop = zero();
    const trevpar = zero();
    const goppar = zero();

    for (const c of ['UGX', 'USD'] as Cur[]) {
      grossProfit[c] = totalHotelGross[c] - cogsTotal[c];
      gop[c] = grossProfit[c] - opexTotal[c];
      trevpar[c] = roomNightsAvailable ? totalHotelGross[c] / BigInt(roomNightsAvailable) : 0n;
      goppar[c] = roomNightsAvailable ? gop[c] / BigInt(roomNightsAvailable) : 0n;
    }

    /* ───── Payment Rail Reconciliation ───── */
    const railMap = new Map<string, { amount: Record<Cur, bigint>; count: number }>();
    for (const p of payments) {
      const cur = p.currency as Cur;
      const method = (p as any).method ?? 'MOBILE_MONEY';
      const r = railMap.get(method) ?? { amount: zero(), count: 0 };
      r.amount[cur] += p.amountMinor;
      r.count += 1;
      railMap.set(method, r);
    }
    for (const o of posOrders) {
      const cur = 'UGX' as Cur;
      const m = o.paymentMethod ?? 'CASH';
      const r = railMap.get(m) ?? { amount: zero(), count: 0 };
      r.amount[cur] += o.totalMinor;
      r.count += 1;
      railMap.set(m, r);
    }

    const RAIL_LABELS: Record<string, string> = {
      CASH: 'Cash at Premises (Front Desk & POS)',
      MOBILE_MONEY: 'Mobile Money (MTN & Airtel)',
      BANK: 'Bank Transfer / Direct EFT',
      BANK_TRANSFER: 'Bank Transfer / Direct EFT',
      CARD: 'Credit / Debit Card (Visa & Mastercard)',
      ROOM_FOLIO: 'Charged to Resident Room Folio',
      UNKNOWN: 'Other / Pending Clearing',
    };

    const paymentReconciliation = Object.entries(RAIL_LABELS)
      .filter(([k]) => k !== 'BANK_TRANSFER')
      .map(([method, label]) => {
        const r1 = railMap.get(method) ?? { amount: zero(), count: 0 };
        const r2 = method === 'BANK' ? (railMap.get('BANK_TRANSFER') ?? { amount: zero(), count: 0 }) : { amount: zero(), count: 0 };
        const combined = zero();
        for (const c of ['UGX', 'USD'] as Cur[]) {
          combined[c] = r1.amount[c] + r2.amount[c];
        }
        return {
          method,
          label,
          amount: out(combined),
          count: r1.count + r2.count,
        };
      });

    return {
      from,
      to,
      days,
      totals: {
        roomNightsAvailable,
        roomNightsSold,
        occupancy: pct(roomNightsSold, roomNightsAvailable),
        roomRevenue: out(revenue),
        adr: out(adr),
        revpar: out(revpar),
        otherRevenue: out(other),
        collected: out(collected),
        averageStay: staysArriving ? Math.round((nightsArriving / staysArriving) * 10) / 10 : 0,
        bookings: created.length,
        cancellations: cancelled,
        noShows,
        returningGuests,
      },
      financialSummary: {
        totalGrossRevenue: out(totalHotelGross),
        costOfSales: out(cogsTotal),
        grossProfit: out(grossProfit),
        operatingExpenses: out(opexTotal),
        grossOperatingProfit: out(gop),
        trevpar: out(trevpar),
        goppar: out(goppar),
      },
      departments: depList,
      expenses: {
        total: out(totalExpenses),
        byCategory: expensesByCategory,
        byDepartment: expensesByDepartment,
      },
      paymentReconciliation,
      sourceMix: [...source.entries()].map(([s, v]) => ({ source: s, ...v })).sort((a, b) => b.roomNights - a.roomNights),
      roomTypes: [...typeRooms.entries()].map(([id, count]) => {
        const avail = dates.reduce((a, d) => a + count - blockedOn(d, id), 0);
        const s = soldByType.get(id) ?? 0;
        return { id, name: names.get(id) ?? 'Room', roomNightsSold: s, occupancy: pct(s, avail) };
      }),
      leadTime: buckets.map(({ bucket, bookings }) => ({ bucket, bookings })),
      feedback: fb,
      currencyNote: 'UGX and USD are counted separately and never converted. ADR divides each currency by the nights sold in it; RevPAR divides by every available room night.',
    };
  }
}
