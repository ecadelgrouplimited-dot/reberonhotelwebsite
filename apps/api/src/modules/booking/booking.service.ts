import { HttpStatus, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Queue, Worker } from 'bullmq';
import { timingSafeEqual } from 'node:crypto';
import { stayToken } from '../../common/stay-token.js';
import type { z } from 'zod';
import type { BookingStartedDTO, CurrencyCode, GuestStayDTO, ReservationSummaryDTO, zBookingInput, zManualReservationInput } from '@reberon/contracts';
import { t } from '@reberon/contracts';
import { formatMoney, hotelToday, normalizePhone, randomCode } from '@reberon/utils';
import type { Prisma, Reservation } from '@reberon/db';
import { PrismaService } from '../../common/prisma.service.js';
import { RedisService } from '../../common/redis.service.js';
import { AuditService } from '../../common/audit.service.js';
import { AppError, badRequest, conflict, forbidden, notFound } from '../../common/errors.js';
import type { AuthUser } from '../../common/auth.js';
import { env } from '../../config.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { MessagingService } from '../notifications/messaging.service.js';
import { DocumentsService } from '../documents/documents.service.js';
import { lt, toMediaRef } from '../content/mappers.js';
import { InventoryService, InventoryUnavailable, day, iso, nightsOf, type Tx } from './inventory.service.js';
import { PricingService, extraTotal, roundDeposit, type PolicyRule } from './pricing.service.js';
import { PaymentsService, type ProviderStatus } from './payments.service.js';

type BookingInput = z.infer<typeof zBookingInput>;
type ManualInput = z.infer<typeof zManualReservationInput>;

const full = {
  contact: true,
  ratePlan: true,
  rooms: true,
  extras: true,
  payments: { orderBy: { createdAt: 'asc' as const } },
  folio: { include: { lines: { orderBy: { createdAt: 'asc' as const } } } },
  changes: { orderBy: { createdAt: 'desc' as const } },
} satisfies Prisma.ReservationInclude;
export type FullReservation = Prisma.ReservationGetPayload<{ include: typeof full }>;

const QUEUE = 'booking';

@Injectable()
export class BookingService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger('Booking');
  private queue!: Queue;
  private worker!: Worker;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly audit: AuditService,
    private readonly inventory: InventoryService,
    private readonly pricing: PricingService,
    private readonly payments: PaymentsService,
    private readonly notifications: NotificationsService,
    private readonly messaging: MessagingService,
    private readonly documents: DocumentsService,
  ) {}

  onModuleInit() {
    const connection = this.redis.bullConnection();
    this.queue = new Queue(QUEUE, { connection, defaultJobOptions: { removeOnComplete: 200, removeOnFail: 200, attempts: 3, backoff: { type: 'fixed', delay: 10_000 } } });
    this.worker = new Worker(QUEUE, async (job) => (job.name === 'expire' ? this.expire(job.data.reservationId) : undefined), { connection });
  }

  async onModuleDestroy() {
    await this.worker?.close();
    await this.queue?.close();
  }

  /* ───────── helpers ───────── */

  accessToken(code: string) {
    return stayToken(code);
  }
  verifyAccess(code: string, token: string | undefined) {
    const expected = this.accessToken(code);
    return !!token && token.length === expected.length && timingSafeEqual(Buffer.from(token), Buffer.from(expected));
  }

  private async newCode(tx: Tx) {
    for (let i = 0; i < 8; i++) {
      const code = `RB-${randomCode(5)}`;
      if (!(await tx.reservation.findUnique({ where: { code }, select: { id: true } }))) return code;
    }
    throw new Error('Could not allocate a booking code');
  }

  private async upsertContact(tx: Tx, g: { name: string; phone?: string; email?: string }, source: 'WEB' | 'PHONE' | 'WHATSAPP' | 'WALK_IN') {
    const phone = g.phone ? normalizePhone(g.phone) : null;
    if (g.phone && !phone) throw new AppError(HttpStatus.UNPROCESSABLE_ENTITY, 'VALIDATION_FAILED', 'That phone number does not look right', [{ path: 'guest.phone', message: 'Check the number' }]);
    const email = g.email?.toLowerCase() ?? null;
    const existing = (phone && (await tx.contact.findFirst({ where: { phone }, orderBy: [{ mergedIntoId: { sort: 'asc', nulls: 'first' } }, { createdAt: 'desc' }] }))) || (email && (await tx.contact.findFirst({ where: { email }, orderBy: { createdAt: 'desc' } }))) || null;
    const target = existing?.mergedIntoId ? await tx.contact.findUnique({ where: { id: existing.mergedIntoId } }) : null;
    if (target) return target;
    if (existing) return tx.contact.update({ where: { id: existing.id }, data: { name: g.name, phone: phone ?? existing.phone, email: email ?? existing.email } });
    return tx.contact.create({ data: { name: g.name, phone, email, source, whatsappOptIn: !!phone } });
  }

  async change(tx: Tx, reservationId: string, kind: string, summary: string, actorId?: string | null, after?: unknown) {
    await tx.reservationChange.create({ data: { reservationId, kind, summary, actorId: actorId ?? null, after: after === undefined ? undefined : (JSON.parse(JSON.stringify(after, (_, v) => (typeof v === 'bigint' ? v.toString() : v))) as Prisma.InputJsonValue) } });
  }

  money(amount: bigint, currency: string) {
    return formatMoney(amount, currency as CurrencyCode).replace(/\.00$/, '');
  }

  /**
   * Build a reservation inside a transaction: price, inventory, contact,
   * frozen nightly rates, extras and the folio charges.
   */
  private async build(tx: Tx, input: BookingInput | ManualInput, opts: { source: Reservation['source']; status: 'HELD' | 'CONFIRMED'; holdMinutes: number; actorId?: string | null; guest: { name: string; phone?: string; email?: string } }) {
    const nights = nightsOf(input.arrival, input.departure);
    if (!nights.length) throw badRequest('Departure must be after arrival');
    if (input.arrival < hotelToday() && opts.source === 'DIRECT') throw badRequest('Arrival is in the past');
    const [plan, roomType] = await Promise.all([
      tx.ratePlan.findFirst({ where: { id: input.ratePlanId, isActive: true }, include: { cancellationPolicy: true } }),
      tx.roomType.findFirst({ where: { id: input.roomTypeId, deletedAt: null, ...(opts.source === 'DIRECT' ? { status: 'PUBLISHED' as const } : {}) } }),
    ]);
    if (!plan || !roomType) throw notFound('Room or rate');
    const capacity = input.rooms * (roomType.sleepsAdults + roomType.sleepsChildren);
    if (input.adults > input.rooms * roomType.sleepsAdults || input.adults + input.children > capacity) throw badRequest(`${input.rooms} ${t(lt(roomType.name))} room(s) sleep up to ${capacity}. Add a room or choose a larger type.`);
    const { quote, reason } = await this.pricing.quotePlan(tx, plan, roomType.id, input.arrival, input.departure, input.currency);
    if (!quote) throw badRequest(reason ?? 'Not available');

    try {
      if (opts.status === 'CONFIRMED') await this.inventory.sell(tx, roomType.id, nights, input.rooms);
      else await this.inventory.hold(tx, roomType.id, nights, input.rooms);
    } catch (e) {
      if (e instanceof InventoryUnavailable) throw conflict(e.message, 'CONFLICT');
      throw e;
    }

    const extras = input.extras.length ? await tx.extra.findMany({ where: { id: { in: input.extras.map((e) => e.extraId) }, deletedAt: null } }) : [];
    const extraLines = input.extras.map((sel) => {
      const e = extras.find((x) => x.id === sel.extraId);
      if (!e) throw badRequest('One of the extras is no longer offered');
      const total = extraTotal(e, input.currency, sel.quantity, nights.length);
      if (total === null) throw badRequest(`${t(lt(e.name))} has no ${input.currency} price`);
      return { e, qty: sel.quantity, unit: total / BigInt(e.unit === 'PER_NIGHT' ? sel.quantity * nights.length : sel.quantity), total };
    });

    const roomsTotal = quote.roomTotal * BigInt(input.rooms);
    const total = roomsTotal + extraLines.reduce((a, l) => a + l.total, 0n);
    const contact = await this.upsertContact(tx, opts.guest, opts.source === 'DIRECT' ? 'WEB' : opts.source === 'WALK_IN' ? 'WALK_IN' : opts.source === 'WHATSAPP' ? 'WHATSAPP' : 'PHONE');
    const code = await this.newCode(tx);
    const rules = (plan.cancellationPolicy?.rules as unknown as PolicyRule[]) ?? [];
    const deposit = plan.depositPercent > 0 ? roundDeposit((total * BigInt(plan.depositPercent)) / 100n, input.currency) : total;

    const reservation = await tx.reservation.create({
      data: {
        code,
        status: opts.status,
        source: opts.source,
        contactId: contact.id,
        ratePlanId: plan.id,
        arrival: day(input.arrival),
        departure: day(input.departure),
        adults: input.adults,
        children: input.children,
        currency: input.currency,
        totalMinor: total,
        depositMinor: deposit > total ? total : deposit,
        cancellationSnapshot: { rules, text: lt(plan.cancellationPolicy?.text) } as unknown as Prisma.InputJsonValue,
        eta: input.eta,
        guestNotes: input.notes,
        tourSessionId: 'tourSessionId' in input ? (input.tourSessionId ?? null) : null,
        holdExpiresAt: opts.status === 'HELD' ? new Date(Date.now() + opts.holdMinutes * 60_000) : null,
        confirmedAt: opts.status === 'CONFIRMED' ? new Date() : null,
        createdById: opts.actorId ?? null,
        rooms: { create: { roomTypeId: roomType.id, quantity: input.rooms, nightly: quote.nightly.map((n) => ({ date: n.date, amountMinor: n.amountMinor.toString() })) } },
        extras: { create: extraLines.map((l) => ({ extraId: l.e.id, quantity: l.qty, unitMinor: l.unit, totalMinor: l.total })) },
        folio: {
          create: {
            currency: input.currency,
            lines: {
              create: [
                ...quote.nightly.map((n) => ({ kind: 'ROOM' as const, description: `${t(lt(roomType.name))} × ${input.rooms} — ${t(lt(plan.name))}`, date: day(n.date), quantity: input.rooms, amountMinor: n.amountMinor * BigInt(input.rooms), postedById: opts.actorId ?? null })),
                ...extraLines.map((l) => ({ kind: 'EXTRA' as const, description: `${t(lt(l.e.name))} × ${l.qty}`, date: day(input.arrival), quantity: l.qty, amountMinor: l.total, postedById: opts.actorId ?? null })),
              ],
            },
          },
        },
      },
    });
    await this.change(tx, reservation.id, 'created', `${opts.status === 'CONFIRMED' ? 'Confirmed' : 'Held'} ${input.rooms} × ${t(lt(roomType.name))}, ${nights.length} night(s), ${this.money(total, input.currency)}`, opts.actorId);
    return { reservation, roomType, plan, contact, nights, total };
  }

  private async startPayment(reservationId: string, purpose: 'DEPOSIT' | 'FULL' | 'BALANCE', amount: bigint) {
    const r = await this.prisma.reservation.findUniqueOrThrow({ where: { id: reservationId }, include: { contact: true, payments: true } });
    const n = r.payments.length + 1;
    const intent = await this.prisma.paymentIntent.create({
      data: { reservationId, purpose, amountMinor: amount, currency: r.currency, provider: await this.payments.provider(), merchantReference: `${r.code}-P${n}`, expiresAt: r.holdExpiresAt ?? new Date(Date.now() + 24 * 3600_000) },
    });
    const [first, ...rest] = r.contact.name.split(' ');
    const order = await this.payments.createOrder({
      merchantReference: intent.merchantReference,
      amountMinor: amount,
      currency: r.currency,
      description: `Reberon Hotel ${r.code} — ${purpose.toLowerCase()}`,
      callbackUrl: `${env.WEB_URL}/book/return?code=${r.code}&t=${this.accessToken(r.code)}`,
      guest: { email: r.contact.email, phone: r.contact.phone, firstName: first ?? r.contact.name, lastName: rest.join(' ') || '-' },
    });
    return this.prisma.paymentIntent.update({ where: { id: intent.id }, data: { redirectUrl: order.redirectUrl, providerTrackingId: order.trackingId, provider: order.provider } });
  }

  /* ───────── public booking ───────── */

  async start(input: BookingInput): Promise<BookingStartedDTO> {
    if (input.payAtPremises) {
      const built = await this.prisma.$transaction(async (tx) => {
        const b = await this.build(tx, input, {
          source: 'DIRECT',
          status: 'CONFIRMED',
          holdMinutes: 0,
          guest: { name: input.guest.name, phone: input.guest.phone, email: input.guest.email },
        });
        await tx.reservation.update({
          where: { id: b.reservation.id },
          data: { staffNotes: 'Guest selected Pay at the Premises upon arrival.' },
        });
        return b;
      });
      const r = built.reservation;
      const token = this.accessToken(r.code);
      await this.audit.record({
        actorType: 'GUEST',
        action: 'reservation.create',
        entityType: 'Reservation',
        entityId: r.id,
        summary: `Web booking ${r.code} confirmed — Pay at the premises (${this.money(r.totalMinor, r.currency)})`,
      });
      await this.notifyAfterPayment(r.id, true, false).catch((e) => this.log.error(e));
      return {
        code: r.code,
        status: 'CONFIRMED',
        holdExpiresAt: null,
        payment: {
          merchantReference: `${r.code}-PREMISES`,
          redirectUrl: `${env.WEB_URL}/stay?code=${r.code}&t=${token}`,
          amountMinor: '0',
          currency: r.currency,
          provider: 'PREMISES',
        },
        accessToken: token,
      };
    }

    const built = await this.prisma.$transaction((tx) =>
      this.build(tx, input, { source: 'DIRECT', status: 'HELD', holdMinutes: env.BOOKING_HOLD_MINUTES, guest: { name: input.guest.name, phone: input.guest.phone, email: input.guest.email } }),
    );
    const r = built.reservation;
    const amount = input.payInFull ? r.totalMinor : r.depositMinor;
    let intent;
    try {
      intent = await this.startPayment(r.id, input.payInFull ? 'FULL' : 'DEPOSIT', amount);
    } catch (e) {
      await this.expire(r.id, true);
      throw e;
    }
    await this.queue.add('expire', { reservationId: r.id }, { delay: env.BOOKING_HOLD_MINUTES * 60_000 + 5_000, jobId: `expire-${r.id}` });
    await this.audit.record({ actorType: 'GUEST', action: 'reservation.hold', entityType: 'Reservation', entityId: r.id, summary: `Web booking ${r.code} held for ${env.BOOKING_HOLD_MINUTES} min (${this.money(r.totalMinor, r.currency)})` });
    return {
      code: r.code,
      status: r.status,
      holdExpiresAt: r.holdExpiresAt?.toISOString() ?? null,
      payment: { merchantReference: intent.merchantReference, redirectUrl: intent.redirectUrl!, amountMinor: intent.amountMinor.toString(), currency: r.currency, provider: intent.provider as 'PESAPAL' | 'TEST' },
      accessToken: this.accessToken(r.code),
    };
  }

  /** A new payment attempt for a booking still on hold, or the balance of a confirmed one. */
  async payAgain(code: string, token: string) {
    if (!this.verifyAccess(code, token)) throw notFound('Booking');
    const r = await this.prisma.reservation.findUnique({ where: { code } });
    if (!r) throw notFound('Booking');
    if (r.status === 'HELD') {
      if (r.holdExpiresAt && r.holdExpiresAt < new Date()) throw badRequest('This hold has expired. Please start again.');
      const i = await this.startPayment(r.id, 'DEPOSIT', r.depositMinor - r.paidMinor > 0n ? r.depositMinor - r.paidMinor : r.totalMinor - r.paidMinor);
      return { redirectUrl: i.redirectUrl };
    }
    const balance = r.totalMinor - r.paidMinor;
    if (r.status === 'CONFIRMED' && balance > 0n) {
      const i = await this.startPayment(r.id, 'BALANCE', balance);
      return { redirectUrl: i.redirectUrl };
    }
    throw badRequest('Nothing to pay on this booking.');
  }

  /* ───────── payment outcomes (idempotent) ───────── */

  async applyOutcome(merchantReference: string, s: ProviderStatus, eventId: string, payload: unknown, provider: 'PESAPAL' | 'TEST' | 'MANUAL') {
    // Store the notification once: a replayed webhook stops here.
    try {
      await this.prisma.paymentEvent.create({ data: { provider, providerEventId: eventId, payload: JSON.parse(JSON.stringify(payload ?? {})) as Prisma.InputJsonValue } });
    } catch (e) {
      if ((e as { code?: string }).code === 'P2002') return { duplicate: true };
      throw e;
    }
    const intent = await this.prisma.paymentIntent.findUnique({ where: { merchantReference } });
    if (!intent) {
      this.log.warn(`payment event for unknown reference ${merchantReference}`);
      return { unknown: true };
    }
    await this.prisma.paymentEvent.update({ where: { providerEventId: eventId }, data: { paymentIntentId: intent.id, processedAt: new Date() } });
    if (s.outcome === 'SUCCEEDED') return this.succeeded(intent.id, s);
    if (s.outcome === 'FAILED') return this.failed(intent.id, s);
    return { pending: true };
  }

  private async succeeded(intentId: string, s: Pick<ProviderStatus, 'providerStatus' | 'method' | 'confirmationCode'>, actor?: AuthUser) {
    const result = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "PaymentIntent" WHERE id = ${intentId}::uuid FOR UPDATE`;
      const intent = await tx.paymentIntent.findUniqueOrThrow({ where: { id: intentId } });
      if (intent.status === 'SUCCEEDED') return { already: true, reservationId: intent.reservationId, confirmedNow: false, stranded: false };
      await tx.paymentIntent.update({ where: { id: intentId }, data: { status: 'SUCCEEDED', providerStatus: s.providerStatus, method: s.method, confirmationCode: s.confirmationCode, paidAt: new Date() } });
      const r = await tx.reservation.findUniqueOrThrow({ where: { id: intent.reservationId }, include: { rooms: true, folio: true } });
      await tx.folioLine.create({ data: { folioId: r.folio!.id, kind: 'PAYMENT', description: `Payment ${intent.merchantReference}${s.confirmationCode ? ` (${s.confirmationCode})` : ''} — ${s.method.toLowerCase().replace('_', ' ')}`, date: day(hotelToday()), amountMinor: -intent.amountMinor, paymentId: intent.id, postedById: actor?.id ?? null } });
      let confirmedNow = false;
      let stranded = false;
      if (r.status === 'HELD') {
        for (const rr of r.rooms) await this.inventory.convertHeldToSold(tx, rr.roomTypeId, nightsOf(iso(r.arrival), iso(r.departure)), rr.quantity);
        confirmedNow = true;
      } else if (r.status === 'EXPIRED') {
        // Paid after the hold lapsed: take the rooms back if they are still free.
        try {
          for (const rr of r.rooms) await this.inventory.sell(tx, rr.roomTypeId, nightsOf(iso(r.arrival), iso(r.departure)), rr.quantity);
          confirmedNow = true;
        } catch {
          stranded = true;
        }
      }
      await tx.reservation.update({
        where: { id: r.id },
        data: {
          paidMinor: { increment: intent.amountMinor },
          version: { increment: 1 },
          ...(confirmedNow ? { status: 'CONFIRMED', confirmedAt: new Date(), holdExpiresAt: null } : {}),
          ...(stranded ? { staffNotes: `${r.staffNotes ? r.staffNotes + '\n' : ''}⚠ Paid ${this.money(intent.amountMinor, r.currency)} after the hold expired and the rooms were no longer free. Re-house or refund.` } : {}),
        },
      });
      await this.change(tx, r.id, 'payment', `Payment of ${this.money(intent.amountMinor, r.currency)} received${confirmedNow ? ' — booking confirmed' : ''}${stranded ? ' — ROOMS NO LONGER FREE' : ''}`, actor?.id);
      return { already: false, reservationId: r.id, confirmedNow, stranded };
    });
    if (!result.already) {
      // Every payment gets a numbered receipt; a guest who paid online also gets it by email.
      await this.documents.forPayment(intentId, actor ?? null, { send: !actor }).catch((e) => this.log.error(`receipt for ${intentId}: ${(e as Error).message}`));
      await this.audit.record({ actor: actor ?? null, actorType: actor ? 'USER' : 'WEBHOOK', action: 'payment.succeeded', entityType: 'Reservation', entityId: result.reservationId, summary: `Payment received${result.confirmedNow ? '; booking confirmed' : ''}` });
      await this.notifyAfterPayment(result.reservationId, result.confirmedNow, result.stranded);
    }
    return result;
  }

  private async failed(intentId: string, s: ProviderStatus) {
    const intent = await this.prisma.paymentIntent.findUniqueOrThrow({ where: { id: intentId }, include: { reservation: { include: { contact: true } } } });
    if (intent.status !== 'PENDING') return { ignored: true };
    await this.prisma.paymentIntent.update({ where: { id: intentId }, data: { status: 'FAILED', providerStatus: s.providerStatus } });
    const r = intent.reservation;
    await this.change(this.prisma, r.id, 'payment_failed', `Payment ${intent.merchantReference} did not go through (${s.providerStatus})`);
    if (r.status === 'HELD') await this.messaging.forReservation('booking.payment_failed', r.id).catch((e) => this.log.error(e));
    return { failed: true };
  }

  /* ───────── holds expire ───────── */

  async expire(reservationId: string, force = false) {
    const done = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Reservation" WHERE id = ${reservationId}::uuid FOR UPDATE`;
      const r = await tx.reservation.findUnique({ where: { id: reservationId }, include: { rooms: true } });
      if (!r || r.status !== 'HELD') return null;
      if (!force && r.holdExpiresAt && r.holdExpiresAt > new Date()) return null;
      for (const rr of r.rooms) await this.inventory.release(tx, rr.roomTypeId, nightsOf(iso(r.arrival), iso(r.departure)), rr.quantity, 'held');
      await tx.reservation.update({ where: { id: r.id }, data: { status: 'EXPIRED', version: { increment: 1 } } });
      await tx.paymentIntent.updateMany({ where: { reservationId: r.id, status: 'PENDING' }, data: { status: 'EXPIRED' } });
      await this.change(tx, r.id, 'expired', 'Hold expired without payment; rooms released');
      return r;
    });
    if (done && !force) {
      await this.messaging.forReservation('booking.hold_expired', done.id).catch((e) => this.log.error(e));
    }
    return done;
  }

  /** Safety net for holds whose delayed job was lost (Redis restart etc.). */
  @Cron(CronExpression.EVERY_MINUTE)
  async sweep() {
    const overdue = await this.prisma.reservation.findMany({ where: { status: 'HELD', holdExpiresAt: { lt: new Date(Date.now() - 60_000) } }, select: { id: true } });
    for (const r of overdue) await this.expire(r.id).catch((e) => this.log.error(e));
  }

  /* ───────── the House ───────── */

  async manual(input: ManualInput, actor: AuthUser) {
    const built = await this.prisma.$transaction(async (tx) => {
      const b = await this.build(tx, input, { source: input.source, status: input.confirmNow ? 'CONFIRMED' : 'HELD', holdMinutes: 24 * 60, actorId: actor.id, guest: input.guest });
      if (input.staffNotes) await tx.reservation.update({ where: { id: b.reservation.id }, data: { staffNotes: input.staffNotes } });
      if (input.fromWaitlistId) {
        await tx.waitlistEntry.update({ where: { id: input.fromWaitlistId }, data: { status: 'CONVERTED', staffNotes: `Converted to ${b.reservation.code}` } }).catch(() => undefined);
      }
      return b;
    });
    const r = built.reservation;
    let paymentLink: string | null = null;
    if (!input.confirmNow) {
      try {
        paymentLink = (await this.startPayment(r.id, 'DEPOSIT', r.depositMinor)).redirectUrl;
      } catch (e) {
        this.log.warn(`no payment link for ${r.code}: ${(e as Error).message}`);
      }
      await this.queue.add('expire', { reservationId: r.id }, { delay: 24 * 3600_000 + 5_000, jobId: `expire-${r.id}` });
    }
    await this.audit.record({ actor, action: 'reservation.create', entityType: 'Reservation', entityId: r.id, summary: `${input.confirmNow ? 'Confirmed' : 'Held'} ${r.code} for ${built.contact.name} (${input.source.toLowerCase()})` });
    if (input.confirmNow) await this.sendConfirmation(r.id);
    return { id: r.id, code: r.code, paymentLink };
  }

  async recordPayment(id: string, p: { amount: bigint; method: 'MOBILE_MONEY' | 'CARD' | 'CASH' | 'BANK' | 'UNKNOWN'; reference?: string; note?: string }, actor: AuthUser) {
    const r = await this.prisma.reservation.findUnique({ where: { id } });
    if (!r) throw notFound('Reservation');
    if (['CANCELLED', 'CHECKED_OUT'].includes(r.status)) throw badRequest('This reservation is closed.');
    const n = await this.prisma.paymentIntent.count({ where: { reservationId: id } });
    const intent = await this.prisma.paymentIntent.create({
      data: { reservationId: id, purpose: r.paidMinor === 0n ? 'DEPOSIT' : 'BALANCE', amountMinor: p.amount, currency: r.currency, provider: 'MANUAL', method: p.method, merchantReference: `${r.code}-P${n + 1}`, recordedById: actor.id, note: [p.reference, p.note].filter(Boolean).join(' · ') || null },
    });
    await this.succeeded(intent.id, { providerStatus: 'Recorded by staff', method: p.method, confirmationCode: p.reference }, actor);
    return this.detail(id);
  }

  async cancel(id: string, reason: string, waivePenalty: boolean, actor: AuthUser | null) {
    const out = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Reservation" WHERE id = ${id}::uuid FOR UPDATE`;
      const r = await tx.reservation.findUnique({ where: { id }, include: { rooms: true, folio: true } });
      if (!r) throw notFound('Reservation');
      if (!['HELD', 'CONFIRMED'].includes(r.status)) throw badRequest(`A ${r.status.toLowerCase()} reservation cannot be cancelled`);
      const nights = nightsOf(iso(r.arrival), iso(r.departure));
      for (const rr of r.rooms) await this.inventory.release(tx, rr.roomTypeId, nights, rr.quantity, r.status === 'HELD' ? 'held' : 'sold');
      const rules = ((r.cancellationSnapshot as { rules?: PolicyRule[] }).rules ?? []) as PolicyRule[];
      const { percent, days } = this.pricing.refundPercent(rules, iso(r.arrival), hotelToday());
      const refundPct = waivePenalty ? 100 : percent;
      const kept = r.paidMinor - (r.paidMinor * BigInt(refundPct)) / 100n;
      const refundDue = r.paidMinor - kept;
      const today = day(hotelToday());
      await tx.folioLine.create({ data: { folioId: r.folio!.id, kind: 'ADJUSTMENT', description: 'Cancelled — stay charges reversed', date: today, amountMinor: -r.totalMinor, postedById: actor?.id ?? null } });
      if (kept > 0n) await tx.folioLine.create({ data: { folioId: r.folio!.id, kind: 'ADJUSTMENT', description: `Cancellation fee (${100 - refundPct}% of payments, ${days} days before arrival)`, date: today, amountMinor: kept, postedById: actor?.id ?? null } });
      await tx.reservation.update({ where: { id }, data: { status: 'CANCELLED', cancelledAt: new Date(), cancelReason: reason, totalMinor: kept, holdExpiresAt: null, version: { increment: 1 } } });
      await tx.paymentIntent.updateMany({ where: { reservationId: id, status: 'PENDING' }, data: { status: 'EXPIRED' } });
      await this.change(tx, id, 'cancelled', `Cancelled: ${reason}. ${refundDue > 0n ? `Refund due ${this.money(refundDue, r.currency)}` : 'No refund due'}${waivePenalty ? ' (penalty waived)' : ''}`, actor?.id);
      return { r, refundDue, kept };
    });
    await this.audit.record({ actor, action: 'reservation.cancel', entityType: 'Reservation', entityId: id, summary: `Cancelled ${out.r.code}: ${reason}` });
    if (out.r.status === 'CONFIRMED') {
      const refund = out.refundDue > 0n ? `We will refund ${this.money(out.refundDue, out.r.currency)} the way you paid. It can take a few days to show.` : 'Under the cancellation terms of your rate, no refund is due.';
      await this.messaging.forReservation('booking.cancelled', id, { refund }).catch((e) => this.log.error(e));
    }
    return { refundDueMinor: out.refundDue.toString() };
  }

  async deleteReservation(id: string, reason: string | undefined, actor: AuthUser) {
    if (actor.role !== 'OWNER') {
      throw forbidden('Only the Super Admin (Owner) can delete reservations');
    }
    const deleted = await this.prisma.$transaction(async (tx) => {
      const r = await tx.reservation.findUnique({ where: { id }, include: { contact: true, rooms: true } });
      if (!r) throw notFound('Reservation');
      if (['HELD', 'CONFIRMED', 'IN_HOUSE'].includes(r.status)) {
        const nights = nightsOf(iso(r.arrival), iso(r.departure));
        for (const rr of r.rooms) {
          await this.inventory.release(tx, rr.roomTypeId, nights, rr.quantity, r.status === 'HELD' ? 'held' : 'sold');
        }
      }
      await tx.issuedDocument.updateMany({ where: { reservationId: id }, data: { reservationId: null } });
      await tx.posOrder.updateMany({ where: { reservationId: id }, data: { reservationId: null } });
      await tx.healthClubAccessLog.updateMany({ where: { reservationId: id }, data: { reservationId: null } });
      await tx.outboundMessage.updateMany({ where: { reservationId: id }, data: { reservationId: null } });
      await tx.quotation.updateMany({ where: { convertedReservationId: id }, data: { convertedReservationId: null } });
      await tx.paymentIntent.deleteMany({ where: { reservationId: id } });
      await tx.reservation.delete({ where: { id } });
      return r;
    });
    const cleanReason = reason?.trim() || 'Super Admin permanent deletion';
    await this.audit.record({
      actor,
      action: 'reservation.delete',
      entityType: 'Reservation',
      entityId: id,
      summary: `Deleted reservation ${deleted.code} (${deleted.contact.name}, ${iso(deleted.arrival)} → ${iso(deleted.departure)}): ${cleanReason}`,
      before: {
        code: deleted.code,
        status: deleted.status,
        guestName: deleted.contact.name,
        guestPhone: deleted.contact.phone,
        arrival: iso(deleted.arrival),
        departure: iso(deleted.departure),
        totalMinor: deleted.totalMinor.toString(),
        paidMinor: deleted.paidMinor.toString(),
        currency: deleted.currency,
        reason: cleanReason,
      },
    });
    return { ok: true, deleted: true, code: deleted.code };
  }

  async recordRefund(id: string, p: { amount: bigint; method: 'MOBILE_MONEY' | 'CARD' | 'CASH' | 'BANK' | 'UNKNOWN'; reference?: string; note?: string }, actor: AuthUser) {
    const lineId = await this.prisma.$transaction(async (tx) => {
      const r = await tx.reservation.findUnique({ where: { id }, include: { folio: true } });
      if (!r) throw notFound('Reservation');
      if (p.amount > r.paidMinor) throw badRequest('That is more than was paid.');
      const line = await tx.folioLine.create({ data: { folioId: r.folio!.id, kind: 'REFUND', description: `Refund — ${p.method.toLowerCase().replace('_', ' ')}${p.reference ? ` (${p.reference})` : ''}${p.note ? ` · ${p.note}` : ''}`, date: day(hotelToday()), amountMinor: p.amount, postedById: actor.id } });
      await tx.reservation.update({ where: { id }, data: { paidMinor: { decrement: p.amount }, version: { increment: 1 } } });
      await this.change(tx, id, 'refund', `Refunded ${this.money(p.amount, r.currency)}`, actor.id);
      return line.id;
    });
    await this.documents.forRefund(lineId, actor).catch((e) => this.log.error(`refund note: ${(e as Error).message}`));
    await this.audit.record({ actor, action: 'payment.refund', entityType: 'Reservation', entityId: id, summary: `Recorded refund` });
    return this.detail(id);
  }

  /* ───────── views ───────── */

  summary(r: Reservation & { contact: { name: string; phone: string | null; email: string | null }; rooms: { roomTypeId: string; quantity: number }[] }, names: Map<string, string>): ReservationSummaryDTO {
    const nights = nightsOf(iso(r.arrival), iso(r.departure)).length;
    return {
      id: r.id,
      code: r.code,
      status: r.status,
      source: r.source,
      guest: { name: r.contact.name, phone: r.contact.phone, email: r.contact.email },
      arrival: iso(r.arrival),
      departure: iso(r.departure),
      nights,
      adults: r.adults,
      children: r.children,
      roomSummary: r.rooms.map((x) => `${x.quantity} × ${names.get(x.roomTypeId) ?? 'room'}`).join(', '),
      currency: r.currency,
      totalMinor: r.totalMinor.toString(),
      paidMinor: r.paidMinor.toString(),
      balanceMinor: (r.totalMinor - r.paidMinor).toString(),
      holdExpiresAt: r.holdExpiresAt?.toISOString() ?? null,
      createdAt: r.createdAt.toISOString(),
    };
  }

  async roomTypeNames() {
    const rts = await this.prisma.roomType.findMany({ select: { id: true, name: true } });
    return new Map(rts.map((x) => [x.id, t(lt(x.name))]));
  }

  async detail(id: string) {
    const r = await this.prisma.reservation.findUnique({ where: { id }, include: { ...full, assignments: { include: { room: true }, orderBy: { fromDate: 'asc' } }, feedback: true } });
    if (!r) throw notFound('Reservation');
    const names = await this.roomTypeNames();
    const extraNames = r.extras.length ? new Map((await this.prisma.extra.findMany({ where: { id: { in: r.extras.map((e) => e.extraId) } } })).map((e) => [e.id, t(lt(e.name))])) : new Map<string, string>();
    const staffIds = [...new Set(r.changes.map((c) => c.actorId).filter(Boolean) as string[])];
    const staff = new Map((await this.prisma.user.findMany({ where: { id: { in: staffIds } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]));
    return {
      ...this.summary(r, names),
      contact: { id: r.contact.id, name: r.contact.name, phone: r.contact.phone, email: r.contact.email, country: r.contact.country },
      ratePlan: { id: r.ratePlan.id, code: r.ratePlan.code, name: lt(r.ratePlan.name), mealPlan: r.ratePlan.mealPlan, depositPercent: r.ratePlan.depositPercent },
      depositMinor: r.depositMinor.toString(),
      cancellation: r.cancellationSnapshot,
      eta: r.eta,
      guestNotes: r.guestNotes,
      staffNotes: r.staffNotes,
      cancelReason: r.cancelReason,
      confirmedAt: r.confirmedAt?.toISOString() ?? null,
      cancelledAt: r.cancelledAt?.toISOString() ?? null,
      rooms: r.rooms.map((x) => ({ roomTypeId: x.roomTypeId, name: names.get(x.roomTypeId) ?? 'Room', quantity: x.quantity, nightly: x.nightly })),
      extras: r.extras.map((x) => ({ name: extraNames.get(x.extraId) ?? 'Extra', quantity: x.quantity, totalMinor: x.totalMinor.toString() })),
      folio: (r.folio?.lines ?? []).map((l) => ({ id: l.id, kind: l.kind, description: l.description, date: iso(l.date), amountMinor: l.amountMinor.toString() })),
      payments: r.payments.map((p) => ({ id: p.id, reference: p.merchantReference, purpose: p.purpose, amountMinor: p.amountMinor.toString(), status: p.status, provider: p.provider, method: p.method, redirectUrl: p.status === 'PENDING' ? p.redirectUrl : null, confirmationCode: p.confirmationCode, paidAt: p.paidAt?.toISOString() ?? null, createdAt: p.createdAt.toISOString() })),
      history: r.changes.map((c) => ({ id: c.id, kind: c.kind, summary: c.summary, actor: c.actorId ? (staff.get(c.actorId) ?? 'Staff') : c.kind === 'created' && r.source === 'DIRECT' ? 'Guest (website)' : 'System', createdAt: c.createdAt.toISOString() })),
      checkedInAt: r.checkedInAt?.toISOString() ?? null,
      checkedOutAt: r.checkedOutAt?.toISOString() ?? null,
      reservationRooms: r.rooms.map((x) => ({ id: x.id, roomTypeId: x.roomTypeId, name: names.get(x.roomTypeId) ?? 'Room', quantity: x.quantity })),
      assignments: r.assignments.map((a) => ({ id: a.id, reservationRoomId: a.reservationRoomId, roomId: a.roomId, number: a.room.number, fromDate: iso(a.fromDate), toDate: iso(a.toDate), active: !a.releasedAt })),
      feedback: r.feedback ? { score: r.feedback.score, comment: r.feedback.comment, allowPublic: r.feedback.allowPublic, createdAt: r.feedback.createdAt.toISOString() } : null,
      previousStays: await this.prisma.reservation.count({ where: { contactId: r.contactId, status: 'CHECKED_OUT', id: { not: r.id } } }),
      guestLink: `${env.WEB_URL}/stay?code=${r.code}&t=${this.accessToken(r.code)}`,
    };
  }

  async guestStay(code: string): Promise<GuestStayDTO> {
    const r = await this.prisma.reservation.findUnique({ where: { code }, include: { contact: true, ratePlan: true, rooms: true, extras: true, feedback: true, payments: { orderBy: { createdAt: 'asc' } } } });
    if (!r) throw notFound('Booking');
    const rts = await this.prisma.roomType.findMany({ where: { id: { in: r.rooms.map((x) => x.roomTypeId) } }, include: { hero: true } });
    const extras = r.extras.length ? await this.prisma.extra.findMany({ where: { id: { in: r.extras.map((e) => e.extraId) } } }) : [];
    const settings = Object.fromEntries((await this.prisma.setting.findMany({ where: { key: { in: ['hotel.checkInTime', 'hotel.checkOutTime'] } } })).map((s) => [s.key, s.value]));
    const balance = r.totalMinor - r.paidMinor;
    return {
      code: r.code,
      status: r.status,
      arrival: iso(r.arrival),
      departure: iso(r.departure),
      nights: nightsOf(iso(r.arrival), iso(r.departure)).length,
      adults: r.adults,
      children: r.children,
      guestName: r.contact.name,
      currency: r.currency,
      totalMinor: r.totalMinor.toString(),
      paidMinor: r.paidMinor.toString(),
      balanceMinor: balance.toString(),
      holdExpiresAt: r.holdExpiresAt?.toISOString() ?? null,
      rooms: r.rooms.map((x) => {
        const rt = rts.find((y) => y.id === x.roomTypeId);
        return { name: lt(rt?.name), quantity: x.quantity, hero: rt?.hero ? toMediaRef(rt.hero) : null };
      }),
      ratePlan: { name: lt(r.ratePlan.name), mealPlan: r.ratePlan.mealPlan },
      extras: r.extras.map((x) => ({ name: lt(extras.find((e) => e.id === x.extraId)?.name), quantity: x.quantity, totalMinor: x.totalMinor.toString() })),
      cancellation: lt((r.cancellationSnapshot as { text?: unknown }).text),
      checkIn: String(settings['hotel.checkInTime'] ?? '14:00'),
      checkOut: String(settings['hotel.checkOutTime'] ?? '10:30'),
      payments: r.payments.map((p) => ({ amountMinor: p.amountMinor.toString(), status: p.status, method: p.method, paidAt: p.paidAt?.toISOString() ?? null })),
      canPayBalance: (r.status === 'CONFIRMED' && balance > 0n) || (r.status === 'HELD' && !!r.holdExpiresAt && r.holdExpiresAt > new Date()),
      canGiveFeedback: r.status === 'IN_HOUSE' || (r.status === 'CHECKED_OUT' && !!r.checkedOutAt && Date.now() - r.checkedOutAt.getTime() < 60 * 86_400_000),
      feedback: r.feedback ? { score: r.feedback.score, comment: r.feedback.comment, allowPublic: r.feedback.allowPublic } : null,
      documents: ['CONFIRMED', 'IN_HOUSE', 'CHECKED_OUT', 'CANCELLED', 'NO_SHOW'].includes(r.status) ? await this.documents.forGuest(r.id, r.code) : [],
    };
  }

  /* ───────── messages ───────── */

  private async notifyAfterPayment(reservationId: string, confirmedNow: boolean, stranded: boolean) {
    if (confirmedNow) await this.sendConfirmation(reservationId);
    const r = await this.prisma.reservation.findUniqueOrThrow({ where: { id: reservationId }, include: { contact: true } });
    const staff = ((await this.prisma.setting.findUnique({ where: { key: 'notifications.staffEmails' } }))?.value as string[] | undefined) ?? [];
    for (const to of staff) {
      await this.notifications.email({
        to,
        subject: `${stranded ? '⚠ PAID BUT NO ROOM' : confirmedNow ? 'New booking' : 'Payment received'} ${r.code}: ${r.contact.name}`,
        heading: stranded ? 'Paid after the hold expired — rooms are gone' : confirmedNow ? `${r.contact.name} booked` : 'Payment received',
        paragraphs: [stranded ? 'The guest paid but the rooms were taken in the meantime. Call them to re-house or refund.' : `${iso(r.arrival)} → ${iso(r.departure)}, ${r.adults} adult(s)${r.children ? `, ${r.children} child(ren)` : ''}.`],
        facts: [['Total', this.money(r.totalMinor, r.currency)], ['Paid', this.money(r.paidMinor, r.currency)], ['Balance', this.money(r.totalMinor - r.paidMinor, r.currency)], ['Phone', r.contact.phone ?? '—']],
        action: { label: 'Open the reservation', url: `${env.ADMIN_URL}/reservations/${r.id}` },
      });
    }
  }

  /** Email, SMS and WhatsApp from the owner's templates (Settings → Messages). */
  async sendConfirmation(reservationId: string) {
    await this.messaging.forReservation('booking.confirmed', reservationId);
  }


  /* ───────── owner brief ───────── */

  async ownerBrief(forDate = hotelToday()) {
    const tomorrow = iso(new Date(day(forDate).getTime() + 86_400_000));
    const start = new Date(`${forDate}T00:00:00+03:00`);
    const end = new Date(start.getTime() + 86_400_000);
    const monthStartStr = `${forDate.slice(0, 8)}01`;
    const monthStart = new Date(`${monthStartStr}T00:00:00+03:00`);
    const next7Date = day(iso(new Date(day(forDate).getTime() + 7 * 86_400_000)));

    const stayInc = {
      contact: true,
      rooms: true,
      assignments: { where: { releasedAt: null }, include: { room: { select: { number: true } } } },
    } as const;

    const [
      todayArrivals,
      todayDepartures,
      arrivals,
      inHouseTonight,
      roomsList,
      cleared,
      mtdPayments,
      posToday,
      posMtd,
      hcToday,
      holds,
      upcoming7dRes,
      pendingRequisitions,
      pendingGuestRequests,
      invItems,
      unhandledFeedbackCount,
      activeStaffCount,
      names,
    ] = await Promise.all([
      this.prisma.reservation.findMany({
        where: { arrival: day(forDate), status: { in: ['CONFIRMED', 'HELD', 'IN_HOUSE', 'CHECKED_OUT'] } },
        include: stayInc,
        orderBy: [{ eta: { sort: 'asc', nulls: 'last' } }, { createdAt: 'asc' }],
      }),
      this.prisma.reservation.findMany({
        where: { departure: day(forDate), status: { in: ['IN_HOUSE', 'CHECKED_OUT'] } },
        include: stayInc,
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.reservation.findMany({
        where: { arrival: day(tomorrow), status: { in: ['CONFIRMED', 'HELD'] } },
        include: stayInc,
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.reservation.findMany({
        where: { arrival: { lte: day(forDate) }, departure: { gt: day(forDate) }, status: { in: ['CONFIRMED', 'IN_HOUSE'] } },
        include: stayInc,
        orderBy: { departure: 'asc' },
      }),
      this.prisma.room.findMany({
        where: { isActive: true },
        orderBy: [{ floor: 'asc' }, { number: 'asc' }],
      }),
      this.prisma.paymentIntent.findMany({
        where: { status: 'SUCCEEDED', paidAt: { gte: start, lt: end } },
      }),
      this.prisma.paymentIntent.findMany({
        where: { status: 'SUCCEEDED', paidAt: { gte: monthStart, lt: end } },
      }),
      this.prisma.posOrder.findMany({
        where: { status: 'COMPLETED', createdAt: { gte: start, lt: end } },
      }),
      this.prisma.posOrder.findMany({
        where: { status: 'COMPLETED', createdAt: { gte: monthStart, lt: end } },
      }),
      this.prisma.healthClubAccessLog.findMany({
        where: { checkedInAt: { gte: start, lt: end } },
      }),
      this.prisma.reservation.findMany({
        where: {
          OR: [
            { status: 'HELD' },
            { status: 'IN_HOUSE' },
            { status: 'CONFIRMED', arrival: { lte: next7Date } },
          ],
        },
        include: stayInc,
        orderBy: { arrival: 'asc' },
      }),
      this.prisma.reservation.findMany({
        where: {
          status: { in: ['CONFIRMED', 'IN_HOUSE', 'HELD'] },
          arrival: { lt: next7Date },
          departure: { gt: day(forDate) },
        },
        include: { rooms: true },
      }),
      this.prisma.requisition.findMany({
        where: { status: { in: ['PENDING', 'MANAGER_APPROVED'] } },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
      this.prisma.guestRequest.findMany({
        where: { status: { in: ['NEW', 'ACCEPTED'] } },
        include: { reservation: { include: { contact: { select: { name: true } } } } },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
      this.prisma.inventoryItem.findMany({ select: { onHand: true, parLevel: true } }),
      this.prisma.feedback.count({ where: { score: { not: 'GOOD' }, handledAt: null } }),
      this.prisma.staffProfile.count({ where: { status: 'ACTIVE' } }),
      this.roomTypeNames(),
    ]);

    const totalRooms = roomsList.length;
    const occupiedTonight = inHouseTonight.reduce((a, r) => a + r.rooms.reduce((b, x) => b + x.quantity, 0), 0);
    const sum = (list: { amountMinor: bigint; currency: string }[], cur: string) =>
      list.filter((p) => p.currency === cur).reduce((a, p) => a + p.amountMinor, 0n);
    const sumPos = (list: { totalMinor: bigint; currency: string }[], cur: string) =>
      list.filter((p) => p.currency === cur).reduce((a, p) => a + p.totalMinor, 0n);
    const sumHc = (list: { amountPaidMinor: bigint; currency: string }[], cur: string) =>
      list.filter((p) => p.currency === cur).reduce((a, p) => a + p.amountPaidMinor, 0n);

    const unpaid = holds.filter((r) => r.totalMinor - r.paidMinor > 0n);

    const mapStayRow = (r: (typeof todayArrivals)[number]) => {
      const assignedRooms = r.assignments.map((a) => a.room.number);
      return {
        id: r.id,
        code: r.code,
        name: r.contact.name,
        phone: r.contact.phone,
        isVip: r.contact.isVip,
        status: r.status,
        arrival: iso(r.arrival),
        departure: iso(r.departure),
        nights: nightsOf(iso(r.arrival), iso(r.departure)).length,
        guests: r.adults + r.children,
        adults: r.adults,
        children: r.children,
        eta: r.eta,
        rooms: r.rooms.map((x) => `${x.quantity} × ${names.get(x.roomTypeId) ?? 'Suite'}`).join(', '),
        assignedRooms,
        roomNumbers: assignedRooms,
        total: this.money(r.totalMinor, r.currency),
        paid: this.money(r.paidMinor, r.currency),
        balance: this.money(r.totalMinor - r.paidMinor, r.currency),
        balanceMinor: (r.totalMinor - r.paidMinor).toString(),
        currency: r.currency,
      };
    };

    // Payment methods breakdown today
    const methodKeys = ['MOBILE_MONEY', 'CASH', 'CARD', 'BANK'] as const;
    const byMethod: Record<string, string> = {};
    for (const m of methodKeys) {
      const mRows = cleared.filter((p) => p.method === m);
      byMethod[m] = sum(mRows, 'UGX').toString();
    }

    const roomTodayUgx = sum(cleared, 'UGX');
    const roomTodayUsd = sum(cleared, 'USD');
    const posTodayUgx = sumPos(posToday, 'UGX');
    const posTodayUsd = sumPos(posToday, 'USD');
    const hcTodayUgx = sumHc(hcToday, 'UGX');
    const hcTodayUsd = sumHc(hcToday, 'USD');

    // House readiness by room type
    const rtIds = [...new Set(roomsList.map((r) => r.roomTypeId))];
    const roomTypesReadiness = rtIds.map((rtId) => {
      const rtRooms = roomsList.filter((r) => r.roomTypeId === rtId);
      const outOfOrder = rtRooms.filter((r) => r.hkStatus === 'BLOCKED' || r.hkStatus === 'OUT_OF_ORDER').length;
      return {
        id: rtId,
        code: rtId.slice(0, 6).toUpperCase(),
        name: names.get(rtId) ?? 'Suite',
        total: rtRooms.length,
        occupied: rtRooms.filter((r) => r.hkStatus === 'OCCUPIED').length,
        ready: rtRooms.filter((r) => r.hkStatus === 'INSPECTED' || r.hkStatus === 'VACANT_CLEAN').length,
        dirty: rtRooms.filter((r) => r.hkStatus === 'VACANT_DIRTY').length,
        blocked: outOfOrder,
        outOfOrder,
      };
    });

    // 7-day forecast strip
    const forecast7d = Array.from({ length: 7 }, (_, i) => {
      const dObj = new Date(day(forDate).getTime() + i * 86_400_000);
      const dStr = iso(dObj);
      const staying = upcoming7dRes.filter((r) => iso(r.arrival) <= dStr && iso(r.departure) > dStr);
      const bookedRooms = staying.reduce((acc, r) => acc + r.rooms.reduce((s, rm) => s + rm.quantity, 0), 0);
      const arrCount = upcoming7dRes.filter((r) => iso(r.arrival) === dStr).length;
      const depCount = upcoming7dRes.filter((r) => iso(r.departure) === dStr).length;
      const pct = totalRooms ? Math.min(100, Math.round((bookedRooms / totalRooms) * 100)) : 0;
      return {
        date: dStr,
        occupied: bookedRooms,
        bookedRooms,
        total: totalRooms,
        totalRooms,
        percent: pct,
        occupancyPct: pct,
        arrivals: arrCount,
        arrivalsCount: arrCount,
        departures: depCount,
        departuresCount: depCount,
      };
    });

    const guestsInHouse = inHouseTonight.reduce((acc, r) => acc + r.adults + r.children, 0);
    const vipsInHouse = inHouseTonight.filter((r) => r.contact.isVip).length;
    const inspectedCount = roomsList.filter((r) => r.hkStatus === 'INSPECTED').length;
    const vacantCleanCount = roomsList.filter((r) => r.hkStatus === 'VACANT_CLEAN').length;
    const dirtyCount = roomsList.filter((r) => r.hkStatus === 'VACANT_DIRTY').length;
    const blockedCount = roomsList.filter((r) => r.hkStatus === 'BLOCKED' || r.hkStatus === 'OUT_OF_ORDER').length;

    return {
      date: forDate,
      tomorrow,
      arrivals: arrivals.map(mapStayRow),
      todayArrivals: todayArrivals.map(mapStayRow),
      todayDepartures: todayDepartures.map(mapStayRow),
      inHouseList: inHouseTonight.map(mapStayRow),
      occupancy: {
        tonight: occupiedTonight,
        total: totalRooms,
        percent: totalRooms ? Math.round((occupiedTonight / totalRooms) * 100) : 0,
        guestsInHouse,
        vipsInHouse,
      },
      clearedToday: {
        UGX: roomTodayUgx.toString(),
        USD: roomTodayUsd.toString(),
        count: cleared.length,
      },
      financialPulse: {
        today: {
          roomsUGX: roomTodayUgx.toString(),
          roomsUSD: roomTodayUsd.toString(),
          roomPaymentsCount: cleared.length,
          posUGX: posTodayUgx.toString(),
          posOrdersCount: posToday.length,
          posOpenTabsUGX: '0',
          posOpenTabsCount: 0,
          healthClubUGX: hcTodayUgx.toString(),
          healthClubPassesCount: hcToday.length,
          totalUGX: (roomTodayUgx + posTodayUgx + hcTodayUgx).toString(),
          totalUSD: (roomTodayUsd + posTodayUsd + hcTodayUsd).toString(),
          byMethod,
        },
        mtd: {
          roomsUGX: sum(mtdPayments, 'UGX').toString(),
          roomsUSD: sum(mtdPayments, 'USD').toString(),
          posUGX: sumPos(posMtd, 'UGX').toString(),
          totalUGX: (sum(mtdPayments, 'UGX') + sumPos(posMtd, 'UGX')).toString(),
        },
      },
      houseReadiness: {
        totalRooms,
        occupied: roomsList.filter((r) => r.hkStatus === 'OCCUPIED').length,
        inspected: inspectedCount,
        vacantClean: vacantCleanCount,
        ready: inspectedCount + vacantCleanCount,
        dirty: dirtyCount,
        vacantDirty: dirtyCount,
        blocked: blockedCount,
        outOfOrder: blockedCount,
        pendingTasks: dirtyCount,
        roomTypes: roomTypesReadiness,
      },
      forecast7d,
      promised: unpaid.map(mapStayRow),
      alertsAndApprovals: {
        pendingRequisitions: pendingRequisitions.map((req) => ({
          id: req.id,
          number: req.number,
          title: req.title,
          department: req.department,
          priority: req.priority,
          status: req.status,
          totalAmountMinor: req.totalEstimatedMinor.toString(),
          currency: req.currency,
          amount: this.money(req.totalEstimatedMinor, req.currency),
          requestedBy: req.requestedByName,
          createdAt: req.createdAt.toISOString(),
        })),
        pendingGuestRequests: pendingGuestRequests.map((gr) => ({
          id: gr.id,
          reservationId: gr.reservationId,
          code: gr.reservation.code,
          guestName: gr.reservation.contact.name,
          kind: gr.kind,
          status: gr.status,
          note: gr.note,
          createdAt: gr.createdAt.toISOString(),
        })),
        lowStockCount: invItems.filter((i) => i.onHand <= i.parLevel).length,
        unhandledFeedbackCount,
        activeStaffCount,
      },
    };
  }

  /** 19:00 Kampala every evening: tomorrow's names, occupancy, money (spec M21). */
  @Cron('0 19 * * *', { timeZone: 'Africa/Kampala' })
  async sendOwnerBrief() {
    const brief = await this.ownerBrief();
    const owners = (await this.prisma.user.findMany({ where: { role: 'OWNER', status: 'ACTIVE', deletedAt: null, email: { not: null } } })) as { email: string; name: string }[];
    const ugx = this.money(BigInt(brief.clearedToday.UGX), 'UGX');
    const usd = BigInt(brief.clearedToday.USD) > 0n ? ` + ${this.money(BigInt(brief.clearedToday.USD), 'USD')}` : '';
    for (const o of owners) {
      await this.notifications.email({
        to: o.email,
        subject: `Tomorrow at Reberon: ${brief.arrivals.length} arrival(s), ${brief.occupancy.percent}% tonight`,
        heading: `Good evening, ${o.name.split(' ')[0]}.`,
        paragraphs: [
          brief.arrivals.length ? `Tomorrow: ${brief.arrivals.map((a) => `${a.name} (${a.rooms}${a.eta ? `, ETA ${a.eta}` : ''})`).join('; ')}.` : 'No arrivals tomorrow.',
          `Money cleared today: ${ugx}${usd} across ${brief.clearedToday.count} payment(s).`,
          brief.promised.length ? `Still promised: ${brief.promised.map((p) => `${p.name} ${p.balance}`).join('; ')}.` : 'Nothing outstanding.',
        ],
        facts: [['Occupied tonight', `${brief.occupancy.tonight} of ${brief.occupancy.total} rooms (${brief.occupancy.percent}%)`]],
        action: { label: 'Open the owner brief', url: `${env.ADMIN_URL}/brief` },
      });
    }
    this.log.log(`owner brief sent to ${owners.length} owner(s)`);
  }
}
