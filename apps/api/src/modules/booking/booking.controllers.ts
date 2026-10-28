import { All, Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Put, Query, Req } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { z } from 'zod';
import {
  zAvailabilityQuery, zBookingInput, zStayLookup, zStayVerify, zManualReservationInput, zRecordPaymentInput, zCancelInput, zReservationPatch, zRatePlanInput, zRateBulkInput,
  zInventoryPatch, zExtraInput, zPackageInput,
} from '@reberon/contracts';
import { normalizePhone } from '@reberon/utils';
import type { Prisma } from '@reberon/db';
import { PrismaService } from '../../common/prisma.service.js';
import { AuditService } from '../../common/audit.service.js';
import { CurrentUser, Public, Requires, type AuthUser } from '../../common/auth.js';
import { ZodPipe } from '../../common/zod.pipe.js';
import { badRequest, notFound } from '../../common/errors.js';
import { env } from '../../config.js';
import { lt } from '../content/mappers.js';
import { BookingService } from './booking.service.js';
import { MessagingService } from '../notifications/messaging.service.js';
import { PricingService, toExtraDTO } from './pricing.service.js';
import { PaymentsService } from './payments.service.js';
import { InventoryService, day, iso, nightsOf } from './inventory.service.js';

const isBooking = async (prisma: PrismaService) => (await prisma.setting.findUnique({ where: { key: 'features.bookingEnabled' } }))?.value === true;

/* ═════════ Public ═════════ */

@Controller('v1/public')
export class PublicBookingController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pricing: PricingService,
    private readonly booking: BookingService,
    private readonly messaging: MessagingService,
  ) {}

  @Get('availability')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  availability(@Query(new ZodPipe(zAvailabilityQuery)) q: z.infer<typeof zAvailabilityQuery>) {
    if (q.departure > iso(new Date(Date.now() + 540 * 86_400_000))) throw badRequest('We take bookings up to 18 months ahead.');
    return this.pricing.availability(q);
  }

  @Get('extras')
  async extras() {
    return (await this.prisma.extra.findMany({ where: { status: 'PUBLISHED', deletedAt: null }, orderBy: { order: 'asc' } })).map(toExtraDTO);
  }

  @Post('bookings')
  @HttpCode(201)
  @Throttle({ default: { limit: 6, ttl: 60_000 } })
  async book(@Body(new ZodPipe(zBookingInput)) body: z.infer<typeof zBookingInput>) {
    if (!(await isBooking(this.prisma))) throw badRequest('Online booking opens soon. Claim a first stay and we will contact you.');
    return this.booking.start(body);
  }

  @Get('bookings/:code')
  async booked(@Param('code') code: string, @Query('t') token: string) {
    if (!this.booking.verifyAccess(code, token)) throw notFound('Booking');
    return this.booking.guestStay(code);
  }

  @Post('bookings/:code/pay')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  pay(@Param('code') code: string, @Body() body: { t?: string }) {
    return this.booking.payAgain(code, body.t ?? '');
  }

  /** Find a stay with its code and the phone number it was booked with. */
  @Post('stay/lookup')
  @HttpCode(200)
  @Throttle({ default: { limit: 8, ttl: 15 * 60_000 } })
  async lookup(@Body(new ZodPipe(zStayLookup)) body: z.infer<typeof zStayLookup>) {
    const r = await this.prisma.reservation.findUnique({ where: { code: body.code }, include: { contact: true } });
    const phone = normalizePhone(body.phone);
    if (!r || !phone || r.contact.phone !== phone) throw notFound('No booking matches that code and phone number');
    // With SMS live and the owner's switch on, prove the phone is theirs first.
    if (await this.messaging.otpRequired()) {
      await this.messaging.startOtp(r.code, phone, r.id);
      return { code: r.code, otp: true };
    }
    return { code: r.code, token: this.booking.accessToken(r.code) };
  }

  @Post('stay/verify')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 15 * 60_000 } })
  async verify(@Body(new ZodPipe(zStayVerify)) body: z.infer<typeof zStayVerify>) {
    const phone = normalizePhone(body.phone);
    if (!phone || !(await this.messaging.verifyOtp(body.code, phone, body.otp))) throw badRequest('That code is not right, or it has expired. Ask for a new one.');
    return { code: body.code, token: this.booking.accessToken(body.code) };
  }

  /** Test payments only: never available with real money. */
  @Get('payments/test/:ref')
  async testPayment(@Param('ref') ref: string) {
    if (env.PAYMENT_PROVIDER !== 'TEST' || env.NODE_ENV === 'production') throw notFound('Payment');
    const i = await this.prisma.paymentIntent.findUnique({ where: { merchantReference: ref }, include: { reservation: { include: { contact: true } } } });
    if (!i || i.provider !== 'TEST') throw notFound('Payment');
    return { reference: i.merchantReference, code: i.reservation.code, amountMinor: i.amountMinor.toString(), currency: i.currency, status: i.status, guest: i.reservation.contact.name, token: this.booking.accessToken(i.reservation.code) };
  }

  @Post('payments/test/:ref')
  @HttpCode(200)
  async testPaymentOutcome(@Param('ref') ref: string, @Body() body: { outcome?: 'success' | 'fail'; method?: 'MOBILE_MONEY' | 'CARD' }) {
    if (env.PAYMENT_PROVIDER !== 'TEST' || env.NODE_ENV === 'production') throw notFound('Payment');
    const ok = body.outcome !== 'fail';
    await this.booking.applyOutcome(ref, { outcome: ok ? 'SUCCEEDED' : 'FAILED', providerStatus: ok ? 'Completed (test)' : 'Failed (test)', method: body.method ?? 'MOBILE_MONEY', confirmationCode: ok ? `TEST${Date.now().toString(36).toUpperCase()}` : undefined }, `test:${ref}:${Date.now()}`, body, 'TEST');
    return { ok };
  }
}

/* ═════════ Pesapal IPN ═════════ */

@Controller('v1/webhooks')
export class PaymentWebhookController {
  constructor(
    private readonly payments: PaymentsService,
    private readonly booking: BookingService,
  ) {}

  /**
   * Pesapal calls this (GET or POST) when a payment changes. We never trust the
   * call itself: we ask Pesapal for the status, then apply it once.
   */
  @Public()
  @All('pesapal')
  @HttpCode(200)
  async pesapal(@Req() req: Request) {
    const src = { ...(req.query as Record<string, string>), ...((req.body as Record<string, string>) ?? {}) };
    const trackingId = src.OrderTrackingId ?? src.orderTrackingId;
    const merchantRef = src.OrderMerchantReference ?? src.orderMerchantReference;
    const type = src.OrderNotificationType ?? src.orderNotificationType ?? 'IPNCHANGE';
    if (!trackingId || !merchantRef) throw badRequest('Missing OrderTrackingId');
    const status = await this.payments.pesapalStatus(trackingId);
    await this.booking.applyOutcome(merchantRef, status, `pesapal:${trackingId}:${status.outcome}`, { ...src, status }, 'PESAPAL');
    return { orderNotificationType: type, orderTrackingId: trackingId, orderMerchantReference: merchantRef, status: 200 };
  }
}

/* ═════════ The House ═════════ */

@Controller('v1/admin')
export class ReservationsAdminController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly booking: BookingService,
    private readonly pricing: PricingService,
    private readonly audit: AuditService,
  ) {}

  @Get('reservations')
  @Requires('bookings:read')
  async list(@Query() q: Record<string, string>) {
    const where: Prisma.ReservationWhereInput = {};
    if (q.status === 'upcoming') Object.assign(where, { status: { in: ['CONFIRMED', 'HELD'] }, departure: { gte: day(iso(new Date())) } });
    else if (q.status) where.status = q.status as never;
    if (q.from) where.departure = { ...(where.departure as object), gt: day(q.from) };
    if (q.to) where.arrival = { lt: day(q.to) };
    if (q.q) where.OR = [{ code: { contains: q.q.toUpperCase() } }, { contact: { name: { contains: q.q, mode: 'insensitive' } } }, { contact: { phone: { contains: q.q.replace(/\s/g, '') } } }];
    const rows = await this.prisma.reservation.findMany({ where, include: { contact: true, rooms: true }, orderBy: q.sort === 'created' ? { createdAt: 'desc' } : { arrival: 'asc' }, take: 300 });
    const names = await this.booking.roomTypeNames();
    const counts = await this.prisma.reservation.groupBy({ by: ['status'], _count: true });
    return { data: rows.map((r) => this.booking.summary(r, names)), counts: Object.fromEntries(counts.map((c) => [c.status, c._count])) };
  }

  @Get('reservations/:id')
  @Requires('bookings:read')
  detail(@Param('id') id: string) {
    return this.booking.detail(id);
  }

  @Post('reservations')
  @Requires('bookings:write')
  create(@Body(new ZodPipe(zManualReservationInput)) body: z.infer<typeof zManualReservationInput>, @CurrentUser() user: AuthUser) {
    return this.booking.manual(body, user);
  }

  @Get('reservations-quote')
  @Requires('bookings:read')
  quote(@Query(new ZodPipe(zAvailabilityQuery)) q: z.infer<typeof zAvailabilityQuery>) {
    return this.pricing.availability(q);
  }

  @Patch('reservations/:id')
  @Requires('bookings:write')
  async patch(@Param('id') id: string, @Body(new ZodPipe(zReservationPatch)) body: z.infer<typeof zReservationPatch>, @CurrentUser() user: AuthUser, @Req() req: Request) {
    await this.prisma.reservation.update({ where: { id }, data: body });
    await this.audit.record({ actor: user, action: 'reservation.update', entityType: 'Reservation', entityId: id, summary: 'Updated notes/ETA', after: body, req });
    return this.booking.detail(id);
  }

  @Post('reservations/:id/payments')
  @Requires('payments:record')
  pay(@Param('id') id: string, @Body(new ZodPipe(zRecordPaymentInput)) body: z.infer<typeof zRecordPaymentInput>, @CurrentUser() user: AuthUser) {
    return this.booking.recordPayment(id, body, user);
  }

  @Post('reservations/:id/refunds')
  @Requires('payments:refund')
  refund(@Param('id') id: string, @Body(new ZodPipe(zRecordPaymentInput)) body: z.infer<typeof zRecordPaymentInput>, @CurrentUser() user: AuthUser) {
    return this.booking.recordRefund(id, body, user);
  }

  @Post('reservations/:id/cancel')
  @HttpCode(200)
  @Requires('bookings:write')
  cancel(@Param('id') id: string, @Body(new ZodPipe(zCancelInput)) body: z.infer<typeof zCancelInput>, @CurrentUser() user: AuthUser) {
    return this.booking.cancel(id, body.reason, body.waivePenalty, user);
  }

  @Post('reservations/:id/resend-confirmation')
  @HttpCode(200)
  @Requires('bookings:write')
  async resend(@Param('id') id: string) {
    await this.booking.sendConfirmation(id);
    return { ok: true };
  }

  @Get('owner/brief')
  @Requires('bookings:read')
  brief(@Query('date') date?: string) {
    return this.booking.ownerBrief(date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : undefined);
  }

  @Post('owner/brief/send')
  @HttpCode(200)
  @Requires('settings:features')
  async sendBrief() {
    await this.booking.sendOwnerBrief();
    return { ok: true };
  }
}

@Controller('v1/admin')
export class RatesAdminController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventory: InventoryService,
    private readonly audit: AuditService,
  ) {}

  /** Calendar: per room type per night — rooms free/held/sold/blocked, restrictions, and each plan's prices. */
  @Get('calendar')
  @Requires('rates:read')
  async calendar(@Query('from') from: string, @Query('days') daysRaw?: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from ?? '')) throw badRequest('from=YYYY-MM-DD');
    const days = Math.min(62, Math.max(7, Number(daysRaw) || 28));
    const to = iso(new Date(day(from).getTime() + days * 86_400_000));
    const dates = nightsOf(from, to);
    const [roomTypes, plans] = await Promise.all([
      this.prisma.roomType.findMany({ where: { deletedAt: null }, orderBy: { order: 'asc' }, include: { _count: { select: { rooms: { where: { isActive: true } } } } } }),
      this.prisma.ratePlan.findMany({ orderBy: { order: 'asc' } }),
    ]);
    const inv = await this.inventory.days(roomTypes.map((r) => r.id), dates);
    const rates = await this.prisma.rate.findMany({ where: { date: { gte: day(from), lt: day(to) } } });
    return {
      dates,
      ratePlans: plans.map((p) => ({ id: p.id, code: p.code, name: lt(p.name), isActive: p.isActive })),
      roomTypes: roomTypes.map((rt) => ({
        id: rt.id,
        name: lt(rt.name),
        rooms: rt._count.rooms,
        fromPriceUgx: rt.fromPriceUgx?.toString() ?? null,
        fromPriceUsd: rt.fromPriceUsd?.toString() ?? null,
        days: dates.map((d) => {
          const row = inv.find((x) => x.roomTypeId === rt.id && iso(x.date) === d);
          return {
            date: d,
            total: row?.totalRooms ?? 0,
            sold: row?.soldRooms ?? 0,
            held: row?.heldRooms ?? 0,
            blocked: row?.blockedRooms ?? 0,
            stopSell: row?.stopSell ?? false,
            closedToArrival: row?.closedToArrival ?? false,
            minStay: row?.minStay ?? null,
            note: row?.note ?? null,
            rates: Object.fromEntries(
              plans.map((p) => {
                const r = rates.filter((x) => x.ratePlanId === p.id && x.roomTypeId === rt.id && iso(x.date) === d);
                return [p.id, { UGX: r.find((x) => x.currency === 'UGX')?.amountMinor.toString() ?? null, USD: r.find((x) => x.currency === 'USD')?.amountMinor.toString() ?? null }];
              }),
            ),
          };
        }),
      })),
    };
  }

  @Put('rates')
  @Requires('rates:write')
  async setRates(@Body(new ZodPipe(zRateBulkInput)) b: z.infer<typeof zRateBulkInput>, @CurrentUser() user: AuthUser, @Req() req: Request) {
    const dates = nightsOf(b.from, iso(new Date(day(b.to).getTime() + 86_400_000))).filter((d) => b.weekdays.includes(day(d).getUTCDay()));
    if (dates.length > 800) throw badRequest('Set at most about two years at once');
    let n = 0;
    await this.prisma.$transaction(async (tx) => {
      for (const roomTypeId of b.roomTypeIds) {
        for (const [currency, amount] of [['UGX', b.ugx], ['USD', b.usd]] as const) {
          if (amount === undefined) continue;
          if (amount === null) {
            n += (await tx.rate.deleteMany({ where: { ratePlanId: b.ratePlanId, roomTypeId, currency, date: { in: dates.map(day) } } })).count;
            continue;
          }
          for (const d of dates) {
            await tx.rate.upsert({ where: { ratePlanId_roomTypeId_date_currency: { ratePlanId: b.ratePlanId, roomTypeId, date: day(d), currency } }, create: { ratePlanId: b.ratePlanId, roomTypeId, date: day(d), currency, amountMinor: amount }, update: { amountMinor: amount } });
            n++;
          }
        }
      }
    });
    await this.audit.record({ actor: user, action: 'rates.set', entityType: 'Rate', summary: `Set ${n} prices ${b.from} → ${b.to}`, after: b, req });
    return { updated: n };
  }

  @Patch('inventory')
  @Requires('rates:write')
  async patchInventory(@Body(new ZodPipe(zInventoryPatch)) b: z.infer<typeof zInventoryPatch>, @CurrentUser() user: AuthUser, @Req() req: Request) {
    const dates = nightsOf(b.from, iso(new Date(day(b.to).getTime() + 86_400_000)));
    await this.inventory.ensure(b.roomTypeIds, dates);
    const data: Prisma.InventoryDayUpdateManyMutationInput = {};
    if (b.stopSell !== undefined) data.stopSell = b.stopSell;
    if (b.closedToArrival !== undefined) data.closedToArrival = b.closedToArrival;
    if (b.minStay !== undefined) data.minStay = b.minStay;
    if (b.note !== undefined) data.note = b.note;
    if (b.blockedRooms !== undefined) data.blockedRooms = b.blockedRooms;
    try {
      const r = await this.prisma.inventoryDay.updateMany({ where: { roomTypeId: { in: b.roomTypeIds }, date: { gte: day(b.from), lte: day(b.to) } }, data });
      await this.audit.record({ actor: user, action: 'inventory.update', entityType: 'InventoryDay', summary: `Updated ${r.count} night(s) ${b.from} → ${b.to}`, after: b, req });
      return { updated: r.count };
    } catch (e) {
      if (String(e).includes('inventory_never_oversold')) throw badRequest('Cannot block that many rooms: some of those nights are already booked.');
      throw e;
    }
  }

  @Get('rate-plans')
  @Requires('rates:read')
  async plans() {
    return this.prisma.ratePlan.findMany({ orderBy: { order: 'asc' }, include: { cancellationPolicy: true, _count: { select: { reservations: true } } } });
  }

  @Get('cancellation-policies')
  @Requires('rates:read')
  policies() {
    return this.prisma.cancellationPolicy.findMany({ orderBy: { createdAt: 'asc' } });
  }

  @Post('rate-plans')
  @Requires('rates:write')
  async createPlan(@Body(new ZodPipe(zRatePlanInput)) b: z.infer<typeof zRatePlanInput>, @CurrentUser() user: AuthUser, @Req() req: Request) {
    const p = await this.prisma.ratePlan.create({ data: { ...b, order: await this.prisma.ratePlan.count() } });
    await this.audit.record({ actor: user, action: 'rate_plan.create', entityType: 'RatePlan', entityId: p.id, summary: `Created rate plan ${p.code}`, req });
    return p;
  }

  @Patch('rate-plans/:id')
  @Requires('rates:write')
  async updatePlan(@Param('id') id: string, @Body(new ZodPipe(zRatePlanInput.partial())) b: Partial<z.infer<typeof zRatePlanInput>>, @CurrentUser() user: AuthUser, @Req() req: Request) {
    const p = await this.prisma.ratePlan.update({ where: { id }, data: b });
    await this.audit.record({ actor: user, action: 'rate_plan.update', entityType: 'RatePlan', entityId: id, summary: `Updated rate plan ${p.code}`, after: b, req });
    return p;
  }

  @Delete('rate-plans/:id')
  @Requires('rates:write')
  async deletePlan(@Param('id') id: string, @CurrentUser() user: AuthUser, @Req() req: Request) {
    const plan = await this.prisma.ratePlan.findUnique({ where: { id }, include: { _count: { select: { reservations: true } } } });
    if (!plan) throw notFound('Rate plan');
    if (plan._count.reservations > 0) {
      await this.prisma.ratePlan.update({ where: { id }, data: { isActive: false, isPublic: false } });
      await this.audit.record({ actor: user, action: 'rate_plan.archive', entityType: 'RatePlan', entityId: id, summary: `Archived rate plan ${plan.code}`, req });
      return { archived: true };
    }
    await this.prisma.rate.deleteMany({ where: { ratePlanId: id } });
    await this.prisma.ratePlan.delete({ where: { id } });
    await this.audit.record({ actor: user, action: 'rate_plan.delete', entityType: 'RatePlan', entityId: id, summary: `Deleted rate plan ${plan.code}`, req });
    return { deleted: true };
  }
}

@Controller('v1/admin')
export class SellablesAdminController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  @Get('extras')
  @Requires('rates:read')
  extras() {
    return this.prisma.extra.findMany({ where: { deletedAt: null }, orderBy: { order: 'asc' } });
  }

  @Post('extras')
  @Requires('rates:write')
  async createExtra(@Body(new ZodPipe(zExtraInput)) b: z.infer<typeof zExtraInput>, @CurrentUser() user: AuthUser, @Req() req: Request) {
    const e = await this.prisma.extra.create({ data: { ...b, order: await this.prisma.extra.count() } });
    await this.audit.record({ actor: user, action: 'extra.create', entityType: 'Extra', entityId: e.id, summary: `Created extra ${e.slug}`, req });
    return e;
  }

  @Patch('extras/:id')
  @Requires('rates:write')
  async updateExtra(@Param('id') id: string, @Body(new ZodPipe(zExtraInput.partial())) b: Partial<z.infer<typeof zExtraInput>>, @CurrentUser() user: AuthUser, @Req() req: Request) {
    const e = await this.prisma.extra.update({ where: { id }, data: b });
    await this.audit.record({ actor: user, action: 'extra.update', entityType: 'Extra', entityId: id, summary: `Updated extra ${e.slug}`, after: b, req });
    return e;
  }

  @Delete('extras/:id')
  @HttpCode(204)
  @Requires('rates:write')
  async deleteExtra(@Param('id') id: string, @CurrentUser() user: AuthUser, @Req() req: Request) {
    const e = await this.prisma.extra.update({ where: { id }, data: { deletedAt: new Date(), status: 'HIDDEN', slug: `deleted-${Date.now()}` } });
    await this.audit.record({ actor: user, action: 'extra.delete', entityType: 'Extra', entityId: id, summary: `Deleted extra`, after: { id: e.id }, req });
  }

  @Get('packages')
  @Requires('rates:read')
  packages() {
    return this.prisma.package.findMany({ where: { deletedAt: null }, orderBy: { order: 'asc' } });
  }

  @Post('packages')
  @Requires('rates:write')
  async createPackage(@Body(new ZodPipe(zPackageInput)) b: z.infer<typeof zPackageInput>, @CurrentUser() user: AuthUser, @Req() req: Request) {
    const p = await this.prisma.package.create({ data: { ...b, inclusions: b.inclusions as object[], body: b.body ?? undefined, order: await this.prisma.package.count() } });
    await this.audit.record({ actor: user, action: 'package.create', entityType: 'Package', entityId: p.id, summary: `Created package ${p.slug}`, req });
    return p;
  }

  @Patch('packages/:id')
  @Requires('rates:write')
  async updatePackage(@Param('id') id: string, @Body(new ZodPipe(zPackageInput.partial())) b: Partial<z.infer<typeof zPackageInput>>, @CurrentUser() user: AuthUser, @Req() req: Request) {
    const p = await this.prisma.package.update({ where: { id }, data: { ...b, inclusions: b.inclusions as object[] | undefined, body: b.body === null ? undefined : b.body } });
    await this.audit.record({ actor: user, action: 'package.update', entityType: 'Package', entityId: id, summary: `Updated package ${p.slug}`, req });
    return p;
  }

  @Delete('packages/:id')
  @HttpCode(204)
  @Requires('rates:write')
  async deletePackage(@Param('id') id: string, @CurrentUser() user: AuthUser, @Req() req: Request) {
    const p = await this.prisma.package.update({ where: { id }, data: { deletedAt: new Date(), status: 'HIDDEN', slug: `deleted-${Date.now()}` } });
    await this.audit.record({ actor: user, action: 'package.delete', entityType: 'Package', entityId: id, summary: `Deleted package`, after: { id: p.id }, req });
  }
}
