import { Injectable } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import type { z } from 'zod';
import type { DayCheckDTO, DayCloseDTO, DayCloseHistoryDTO, DayCloseRecordDTO, DayFiguresDTO, MoneyByCurrency, zDayCloseInput } from '@reberon/contracts';
import { hotelToday } from '@reberon/utils';
import type { Prisma } from '@reberon/db';
import { PrismaService } from '../../common/prisma.service.js';
import { AuditService } from '../../common/audit.service.js';
import type { AuthUser } from '../../common/auth.js';
import { badRequest, conflict, notFound } from '../../common/errors.js';
import { day, iso } from '../booking/inventory.service.js';
import { FinanceService } from './finance.service.js';
import { BRAND, docFooter, docShell, esc, letterhead, loadHotel } from '../documents/letterhead.js';

const kStart = (d: string) => new Date(`${d}T00:00:00+03:00`);
const plus = (d: string, n: number) => {
  const x = new Date(`${d}T00:00:00Z`);
  x.setUTCDate(x.getUTCDate() + n);
  return x.toISOString().slice(0, 10);
};
const ZERO: MoneyByCurrency = { UGX: '0', USD: '0' };
const RAIL_LABEL: Record<string, string> = { MOBILE_MONEY: 'Mobile money', CARD: 'Card', BANK: 'Bank transfer' };

/**
 * Close the day (night audit). Before signing a business date off, the House checks
 * the loose ends a hotel must not carry into tomorrow — guests who never arrived,
 * guests who should have left, bills still open — and what is worth a look (balances
 * owed, guests without a room, dirty rooms, payments without a reference). Closing
 * keeps the checks and the day's figures as they stood, with who closed it and why.
 */
@Injectable()
export class DayCloseService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly finance: FinanceService,
  ) {}

  private assertDate(date: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw badRequest('A date like 2026-11-24 is needed');
    if (date > hotelToday()) throw badRequest('A day can only be closed once it has started');
  }

  async checks(date: string): Promise<DayCheckDTO[]> {
    const D = day(date);
    const endTs = kStart(plus(date, 1));
    const startTs = kStart(date);
    const today = hotelToday();
    const money = (minor: bigint, cur: string) => `${cur} ${Number(minor) / (cur === 'USD' ? 100 : 1) >= 0 ? '' : '-'}${Math.abs(Number(minor) / (cur === 'USD' ? 100 : 1)).toLocaleString('en-US', { minimumFractionDigits: cur === 'USD' ? 2 : 0, maximumFractionDigits: cur === 'USD' ? 2 : 0 })}`;

    const [arrivals, departures, openBills, inHouse, dirty, unreferenced] = await Promise.all([
      this.prisma.reservation.findMany({
        where: { status: { in: ['CONFIRMED', 'HELD'] }, arrival: { lte: D } },
        select: { id: true, code: true, arrival: true, departure: true, status: true, contact: { select: { name: true } } },
        orderBy: { arrival: 'asc' },
        take: 50,
      }),
      this.prisma.reservation.findMany({
        where: { status: 'IN_HOUSE', departure: { lte: D } },
        select: { id: true, code: true, departure: true, totalMinor: true, paidMinor: true, currency: true, contact: { select: { name: true } } },
        orderBy: { departure: 'asc' },
        take: 50,
      }),
      this.prisma.posOrder.findMany({
        where: { settledAt: null, status: { not: 'CANCELLED' }, createdAt: { lt: endTs } },
        select: { id: true, orderNumber: true, totalMinor: true, currency: true, tableOrRoom: true, customerName: true, createdAt: true, outlet: { select: { name: true } } },
        orderBy: { createdAt: 'asc' },
        take: 50,
      }),
      this.prisma.reservation.findMany({
        where: { status: 'IN_HOUSE', arrival: { lte: D }, departure: { gt: D } },
        select: { id: true, code: true, totalMinor: true, paidMinor: true, currency: true, departure: true, contact: { select: { name: true } }, assignments: { where: { releasedAt: null }, select: { room: { select: { number: true } } } } },
        take: 200,
      }),
      date === today ? this.prisma.room.findMany({ where: { isActive: true, hkStatus: 'VACANT_DIRTY' }, select: { id: true, number: true }, orderBy: { number: 'asc' } }) : Promise.resolve([]),
      this.prisma.paymentIntent.findMany({
        where: { status: 'SUCCEEDED', provider: 'MANUAL', method: { in: ['MOBILE_MONEY', 'CARD', 'BANK'] }, confirmationCode: null, paidAt: { gte: startTs, lt: endTs } },
        select: { id: true, amountMinor: true, currency: true, method: true, reservation: { select: { id: true, code: true, contact: { select: { name: true } } } } },
        take: 50,
      }),
    ]);

    const owing = inHouse.filter((r) => r.totalMinor > r.paidMinor);
    const unassigned = inHouse.filter((r) => r.assignments.length === 0);
    const when = (d: Date) => new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(d);

    const list: DayCheckDTO[] = [
      {
        key: 'arrivals',
        level: arrivals.length ? 'must' : 'ok',
        title: arrivals.length ? `${arrivals.length} guest${arrivals.length > 1 ? 's' : ''} due but not arrived` : 'Every guest due has arrived',
        hint: 'Check them in if they are here, change the dates if they called, or mark a no-show.',
        count: arrivals.length,
        items: arrivals.map((r) => ({ id: r.id, reservationId: r.id, label: r.contact.name, detail: `${r.code} · due ${when(r.arrival)}${r.status === 'HELD' ? ' · not yet confirmed' : ''}`, href: `/reservations/${r.id}` })),
      },
      {
        key: 'departures',
        level: departures.length ? 'must' : 'ok',
        title: departures.length ? `${departures.length} guest${departures.length > 1 ? 's' : ''} past their departure` : 'Everyone due to leave has checked out',
        hint: 'Check them out, or extend the stay if they are staying on.',
        count: departures.length,
        items: departures.map((r) => ({ id: r.id, reservationId: r.id, label: r.contact.name, detail: `${r.code} · was due out ${when(r.departure)}${r.totalMinor > r.paidMinor ? ` · owes ${money(r.totalMinor - r.paidMinor, r.currency)}` : ''}`, href: `/desk?tab=departures` })),
      },
      {
        key: 'openBills',
        level: openBills.length ? 'must' : 'ok',
        title: openBills.length ? `${openBills.length} bill${openBills.length > 1 ? 's' : ''} still open at the POS` : 'No open bills',
        hint: 'Take payment, charge it to the guest’s room, or cancel a bill opened by mistake.',
        count: openBills.length,
        items: openBills.map((o) => ({ id: o.id, label: `${o.orderNumber} · ${o.tableOrRoom ?? o.customerName ?? o.outlet.name}`, detail: `${o.outlet.name} · ${money(o.totalMinor, o.currency)} · opened ${new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Kampala' }).format(o.createdAt)}`, href: '/pos' })),
      },
      {
        key: 'balances',
        level: owing.length ? 'should' : 'ok',
        title: owing.length ? `${owing.length} guest${owing.length > 1 ? 's' : ''} in house with a balance` : 'No balances owed by guests in house',
        hint: 'Worth a word at breakfast — or take a deposit tonight.',
        count: owing.length,
        items: owing.map((r) => ({ id: r.id, reservationId: r.id, label: r.contact.name, detail: `${r.code} · owes ${money(r.totalMinor - r.paidMinor, r.currency)} · leaves ${when(r.departure)}`, href: `/reservations/${r.id}` })),
      },
      {
        key: 'unassigned',
        level: unassigned.length ? 'should' : 'ok',
        title: unassigned.length ? `${unassigned.length} guest${unassigned.length > 1 ? 's' : ''} in house without a room number` : 'Every guest in house has a room',
        hint: 'Give them a room so housekeeping and the bill know where they are.',
        count: unassigned.length,
        items: unassigned.map((r) => ({ id: r.id, reservationId: r.id, label: r.contact.name, detail: r.code, href: `/reservations/${r.id}` })),
      },
      {
        key: 'rooms',
        level: dirty.length ? 'should' : 'ok',
        title: dirty.length ? `${dirty.length} empty room${dirty.length > 1 ? 's' : ''} still to clean` : date === today ? 'All empty rooms are clean' : 'Room status is only checked for today',
        hint: 'Leave a note for the morning shift, or clean them now for a late arrival.',
        count: dirty.length,
        items: dirty.map((r) => ({ id: r.id, label: `Room ${r.number}`, detail: 'Vacant, dirty', href: '/housekeeping' })),
      },
      {
        key: 'references',
        level: unreferenced.length ? 'should' : 'ok',
        title: unreferenced.length ? `${unreferenced.length} payment${unreferenced.length > 1 ? 's' : ''} without a reference` : 'Every mobile money, card and bank payment has its reference',
        hint: 'Add the transaction ID so the money can be matched to the statement.',
        count: unreferenced.length,
        items: unreferenced.map((p) => ({ id: p.id, reservationId: p.reservation?.id, label: p.reservation?.contact.name ?? 'Payment', detail: `${RAIL_LABEL[p.method] ?? p.method} · ${money(p.amountMinor, p.currency)}${p.reservation ? ` · ${p.reservation.code}` : ''}`, href: p.reservation ? `/reservations/${p.reservation.id}` : '/receipts' })),
      },
    ];
    return list;
  }

  async figures(date: string): Promise<DayFiguresDTO> {
    const D = day(date);
    const [f, arrivals, departures, inHouse] = await Promise.all([
      this.finance.finance(date, date, 'prev'),
      this.prisma.reservation.count({ where: { arrival: D, status: { in: ['IN_HOUSE', 'CHECKED_OUT'] } } }),
      this.prisma.reservation.count({ where: { departure: D, status: 'CHECKED_OUT' } }),
      this.prisma.reservation.count({ where: { arrival: { lte: D }, departure: { gt: D }, status: { in: ['IN_HOUSE', 'CHECKED_OUT'] } } }),
    ]);
    const k = f.kpis;
    return {
      roomRevenue: k.roomRevenue,
      fnbRevenue: k.fnbRevenue,
      otherRevenue: k.otherRevenue,
      grossRevenue: k.grossRevenue,
      collected: k.collected,
      refunds: f.cash.totals.refunds ?? ZERO,
      expenses: k.expenses,
      occupancy: k.occupancy,
      roomNightsSold: k.roomNightsSold,
      roomNightsAvailable: k.roomNightsAvailable,
      adr: k.adr,
      revpar: k.revpar,
      arrivals,
      departures,
      inHouse,
      noShows: k.noShows,
      posOrders: k.posOrders,
      rails: f.cash.rails.filter((r) => r.inCount > 0).map((r) => ({ method: r.method, label: r.label, count: r.inCount, amount: r.inflow })),
    };
  }

  private record(row: { date: Date; closedAt: Date; closedByName: string; notes: string | null; overridden: boolean }): DayCloseRecordDTO {
    return { date: iso(row.date), closedAt: row.closedAt.toISOString(), closedByName: row.closedByName, notes: row.notes, overridden: row.overridden };
  }

  /** Days before `date` (up to a week) that were never closed — counted from the first close ever, so a new system is not nagged about its past. */
  async unclosed(date: string): Promise<string[]> {
    const first = await this.prisma.dayClose.findFirst({ orderBy: { date: 'asc' }, select: { date: true } });
    if (!first) return [];
    const from = [iso(first.date), plus(date, -7)].sort().pop()!;
    const closed = new Set((await this.prisma.dayClose.findMany({ where: { date: { gte: day(from), lt: day(date) } }, select: { date: true } })).map((r) => iso(r.date)));
    const out: string[] = [];
    for (let d = from; d < date; d = plus(d, 1)) if (!closed.has(d)) out.push(d);
    return out;
  }

  async get(date = hotelToday()): Promise<DayCloseDTO> {
    this.assertDate(date);
    const row = await this.prisma.dayClose.findUnique({ where: { date: day(date) } });
    const [checks, figures, unclosed] = await Promise.all([this.checks(date), this.figures(date), this.unclosed(date)]);
    const snap = row?.snapshot as { checks: DayCheckDTO[]; figures: DayFiguresDTO } | undefined;
    return {
      date,
      today: hotelToday(),
      checks,
      figures,
      closed: row && snap ? { ...this.record(row), checks: snap.checks, figures: snap.figures } : null,
      unclosed,
    };
  }

  async history(days = 14): Promise<DayCloseHistoryDTO> {
    const today = hotelToday();
    const from = plus(today, -(Math.min(Math.max(days, 1), 60) - 1));
    const rows = await this.prisma.dayClose.findMany({ where: { date: { gte: day(from) } }, select: { date: true, closedAt: true, closedByName: true, notes: true, overridden: true } });
    const byDate = new Map(rows.map((r) => [iso(r.date), this.record(r)]));
    const out: DayCloseHistoryDTO['days'] = [];
    for (let d = today; d >= from; d = plus(d, -1)) out.push({ date: d, closed: byDate.get(d) ?? null });
    return { days: out };
  }

  async close(body: z.infer<typeof zDayCloseInput>, actor: AuthUser) {
    this.assertDate(body.date);
    if (await this.prisma.dayClose.findUnique({ where: { date: day(body.date) }, select: { id: true } })) throw conflict('This day is already closed');
    const [checks, figures] = await Promise.all([this.checks(body.date), this.figures(body.date)]);
    const open = checks.filter((c) => c.level === 'must');
    if (open.length && !body.override) throw badRequest(`Settle these first, or close anyway with a note: ${open.map((c) => c.title.toLowerCase()).join('; ')}`);
    if (open.length && (body.notes ?? '').trim().length < 5) throw badRequest('Say in a few words why the day is closed with these still open');
    const who = await this.prisma.user.findUnique({ where: { id: actor.id }, select: { name: true } });
    try {
      await this.prisma.dayClose.create({
        data: {
          date: day(body.date),
          closedById: actor.id,
          closedByName: who?.name ?? actor.name,
          notes: body.notes?.trim() || null,
          overridden: open.length > 0,
          snapshot: { checks, figures } as unknown as Prisma.InputJsonValue,
        },
      });
    } catch (e) {
      if ((e as { code?: string }).code === 'P2002') throw conflict('This day was just closed by someone else');
      throw e;
    }
    await this.audit.record({
      actor,
      action: 'day.close',
      entityType: 'DayClose',
      entityId: body.date,
      summary: `Closed ${body.date}${open.length ? ` with ${open.map((c) => c.title.toLowerCase()).join('; ')} — ${body.notes}` : ''}`,
      after: { date: body.date, overridden: open.length > 0, notes: body.notes ?? null, collected: figures.collected, gross: figures.grossRevenue },
    });
    return this.get(body.date);
  }

  /** Reopen a day closed by mistake (owner or general manager). */
  async reopen(date: string, actor: AuthUser) {
    this.assertDate(date);
    const row = await this.prisma.dayClose.findUnique({ where: { date: day(date) } });
    if (!row) throw notFound('This day is not closed');
    await this.prisma.dayClose.delete({ where: { id: row.id } });
    await this.audit.record({ actor, action: 'day.reopen', entityType: 'DayClose', entityId: date, summary: `Reopened ${date} (closed by ${row.closedByName})`, before: this.record(row) });
    return this.get(date);
  }

  /* ───────── the printed end-of-day report ───────── */

  async print(date: string, opts: { autoprint?: boolean } = {}) {
    const data = await this.get(date);
    const hotel = await loadHotel(this.prisma);
    const view = data.closed ?? { checks: data.checks, figures: data.figures };
    const f = view.figures;
    const m = (x: MoneyByCurrency) => {
      const parts = [];
      if (BigInt(x.UGX) !== 0n) parts.push(`UGX ${Number(x.UGX).toLocaleString('en-US')}`);
      if (BigInt(x.USD) !== 0n) parts.push(`USD ${(Number(x.USD) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
      return parts.join(' + ') || 'UGX 0';
    };
    const long = new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${date}T00:00:00Z`));
    const closedAt = data.closed ? new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Kampala' }).format(new Date(data.closed.closedAt)) : null;
    const tile = (label: string, value: string, sub = '') => `<div class="tile"><span>${esc(label)}</span><b>${esc(value)}</b>${sub ? `<em>${esc(sub)}</em>` : ''}</div>`;
    const body = `
      ${letterhead(hotel, { title: 'End-of-day report', number: new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${date}T00:00:00Z`)), date: `${long.split(' ')[0]} · ${data.closed ? `closed by ${data.closed.closedByName} at ${closedAt}` : 'not closed yet — figures so far'}`, badge: data.closed ? (data.closed.overridden ? 'Closed with notes' : 'Closed') : 'Open', badgeTone: data.closed ? (data.closed.overridden ? 'warn' : 'ok') : 'warn', narrow: false })}
      <section class="grid">
        ${tile('Revenue', m(f.grossRevenue), `Rooms ${m(f.roomRevenue)} · Food & drink ${m(f.fnbRevenue)}`)}
        ${tile('Money in', m(f.collected), BigInt(f.refunds.UGX) || BigInt(f.refunds.USD) ? `after refunds of ${m(f.refunds)}` : '')}
        ${tile('Occupancy', `${Math.round(f.occupancy * 100)}%`, `${f.roomNightsSold} of ${f.roomNightsAvailable} rooms`)}
        ${tile('Average rate', m(f.adr), `RevPAR ${m(f.revpar)}`)}
        ${tile('Guests', `${f.inHouse} in house`, `${f.arrivals} arrived · ${f.departures} left · ${f.noShows} no-show`)}
        ${tile('Expenses', m(f.expenses), `${f.posOrders} POS bill${f.posOrders === 1 ? '' : 's'}`)}
      </section>
      <h3>Money taken, by method</h3>
      <table><thead><tr><th>Method</th><th class="n">Payments</th><th class="n">Amount</th></tr></thead><tbody>
        ${f.rails.length ? f.rails.map((r) => `<tr><td>${esc(r.label)}</td><td class="n">${r.count}</td><td class="n">${esc(m(r.amount))}</td></tr>`).join('') : '<tr><td colspan="3" class="muted">No money taken this day.</td></tr>'}
      </tbody></table>
      <h3>Checks at close</h3>
      <table><tbody>
        ${view.checks.map((c) => `<tr><td class="st ${c.level}">${c.level === 'ok' ? '✓' : c.level === 'must' ? '!' : '•'}</td><td><b>${esc(c.title)}</b>${c.items.length ? `<div class="items">${c.items.slice(0, 8).map((i) => `${esc(i.label)} — ${esc(i.detail)}`).join('<br>')}${c.items.length > 8 ? `<br>and ${c.items.length - 8} more` : ''}</div>` : ''}</td></tr>`).join('')}
      </tbody></table>
      ${data.closed?.notes ? `<h3>Notes</h3><p class="notes">${esc(data.closed.notes)}</p>` : ''}
      <div class="sign"><div><span>Closed by</span><b>${esc(data.closed?.closedByName ?? '')}</b></div><div><span>Checked by (manager)</span><b>&nbsp;</b></div></div>
      ${docFooter(hotel, [`Printed ${new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Kampala' }).format(new Date())} · Internal document`], { internal: true })}`;
    const css = `
      .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 3mm; margin: 6mm 0 4mm; }
      .tile { border: 1px solid ${BRAND.line}; border-radius: 3mm; padding: 3mm 3.5mm; }
      .tile span { display: block; font-size: 10px; letter-spacing: .12em; text-transform: uppercase; color: ${BRAND.muted}; font-weight: 700; }
      .tile b { display: block; font-size: 15px; margin-top: 1mm; }
      .tile em { display: block; font-style: normal; font-size: 10.5px; color: ${BRAND.muted}; margin-top: .5mm; }
      h3 { margin: 6mm 0 2mm; font-size: 11px; letter-spacing: .14em; text-transform: uppercase; color: ${BRAND.copper}; }
      table { width: 100%; border-collapse: collapse; }
      th { text-align: left; font-size: 10.5px; color: ${BRAND.muted}; border-bottom: 1.5px solid ${BRAND.navy}; padding: 1.5mm 2mm; }
      td { border-bottom: 1px solid ${BRAND.line}; padding: 1.8mm 2mm; vertical-align: top; }
      .n { text-align: right; font-variant-numeric: tabular-nums; }
      .muted { color: ${BRAND.muted}; }
      .st { width: 7mm; font-weight: 800; text-align: center; }
      .st.ok { color: #15803d; } .st.must { color: #b91c1c; } .st.should { color: #b45309; }
      .items { margin-top: 1mm; font-size: 11px; color: ${BRAND.muted}; }
      .notes { white-space: pre-wrap; border-left: 3px solid ${BRAND.copper}; padding: 1mm 0 1mm 3mm; margin: 0; }
      .sign { display: grid; grid-template-columns: 1fr 1fr; gap: 12mm; margin-top: 12mm; }
      .sign div { border-top: 1px solid ${BRAND.navy}; padding-top: 1.5mm; }
      .sign span { display: block; font-size: 10px; color: ${BRAND.muted}; text-transform: uppercase; letter-spacing: .1em; }
    `;
    const nonce = randomBytes(16).toString('base64');
    return { html: docShell({ title: `End of day · ${date}`, nonce, narrow: false, body, css, autoprint: opts.autoprint }), nonce };
  }
}
