import { Injectable, Logger } from '@nestjs/common';
import type { z } from 'zod';
import type { DeskBoardDTO, DeskStayDTO, zAssignRoomsInput, zCheckInInput, zCheckOutInput, zFolioChargeInput, zMoveRoomInput } from '@reberon/contracts';
import { hotelToday } from '@reberon/utils';
import type { Prisma } from '@reberon/db';
import { PrismaService } from '../../common/prisma.service.js';
import { AuditService } from '../../common/audit.service.js';
import { has, type AuthUser } from '../../common/auth.js';
import { badRequest, conflict, forbidden, notFound } from '../../common/errors.js';
import { last4, seal } from '../../common/crypto.js';
import { env } from '../../config.js';
import { MessagingService } from '../notifications/messaging.service.js';
import { DocumentsService } from '../documents/documents.service.js';
import { BookingService } from '../booking/booking.service.js';
import { InventoryService, day, iso, nightsOf, type Tx } from '../booking/inventory.service.js';
import { RackService } from './rack.service.js';

const stayInclude = { contact: true, rooms: true, assignments: { where: { releasedAt: null }, include: { room: { select: { number: true } } } } } satisfies Prisma.ReservationInclude;
type StayRow = Prisma.ReservationGetPayload<{ include: typeof stayInclude }>;

const isExclusion = (e: unknown) => String((e as Error)?.message ?? e).includes('room_never_double_assigned');

/**
 * The front desk. Every transition locks the reservation row first, so two
 * people at two screens can't check the same guest in twice.
 */
@Injectable()
export class DeskService {
  private readonly log = new Logger('Desk');

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly inventory: InventoryService,
    private readonly booking: BookingService,
    private readonly rack: RackService,
    private readonly messaging: MessagingService,
    private readonly documents: DocumentsService,
  ) {}

  /* ───────── board ───────── */

  private async stays(rows: StayRow[]): Promise<DeskStayDTO[]> {
    if (!rows.length) return [];
    const names = await this.booking.roomTypeNames();
    const prior = await this.prisma.reservation.groupBy({ by: ['contactId'], where: { contactId: { in: [...new Set(rows.map((r) => r.contactId))] }, status: 'CHECKED_OUT' }, _count: true });
    const priorOf = new Map(prior.map((p) => [p.contactId, p._count]));
    return rows.map((r) => ({
      ...this.booking.summary(r, names),
      rooms: r.rooms.map((rr) => ({
        reservationRoomId: rr.id,
        roomTypeId: rr.roomTypeId,
        roomTypeName: names.get(rr.roomTypeId) ?? 'Room',
        quantity: rr.quantity,
        assigned: r.assignments.filter((a) => a.reservationRoomId === rr.id).map((a) => ({ roomId: a.roomId, number: a.room.number })),
      })),
      eta: r.eta,
      staffNotes: r.staffNotes,
      guestNotes: r.guestNotes,
      contactId: r.contactId,
      previousStays: (priorOf.get(r.contactId) ?? 0) - (r.status === 'CHECKED_OUT' ? 1 : 0),
      isVip: r.contact.isVip,
      checkedInAt: r.checkedInAt?.toISOString() ?? null,
      checkedOutAt: r.checkedOutAt?.toISOString() ?? null,
    }));
  }

  async board(date = hotelToday()): Promise<DeskBoardDTO> {
    const d = day(date);
    const rooms = await this.rack.rack(date);
    const [arrivals, departures, inHouse, late, guestRequests] = await Promise.all([
      this.prisma.reservation.findMany({ where: { arrival: d, status: { in: ['HELD', 'CONFIRMED', 'IN_HOUSE', 'CHECKED_OUT'] } }, include: stayInclude, orderBy: [{ eta: { sort: 'asc', nulls: 'last' } }, { createdAt: 'asc' }] }),
      this.prisma.reservation.findMany({ where: { OR: [{ departure: d, status: { in: ['IN_HOUSE', 'CHECKED_OUT'] } }, { status: 'IN_HOUSE', departure: { lt: d } }] }, include: stayInclude, orderBy: { checkedOutAt: { sort: 'asc', nulls: 'first' } } }),
      this.prisma.reservation.findMany({ where: { status: 'IN_HOUSE' }, include: stayInclude, orderBy: { departure: 'asc' } }),
      this.prisma.reservation.findMany({ where: { status: 'CONFIRMED', arrival: { lt: d } }, include: stayInclude, orderBy: { arrival: 'asc' } }),
      this.prisma.guestRequest.findMany({
        where: { status: { in: ['NEW', 'ACCEPTED'] } },
        include: {
          reservation: {
            include: {
              contact: { select: { name: true } },
              assignments: { where: { releasedAt: null }, include: { room: { select: { number: true } } } },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: 25,
      }),
    ]);
    const departuresToday = departures.filter((r) => r.status === 'CHECKED_OUT' ? r.checkedOutAt && iso(r.checkedOutAt) >= date : true);
    return {
      date,
      arrivals: await this.stays(arrivals),
      departures: await this.stays(departuresToday),
      inHouse: await this.stays(inHouse),
      lateArrivals: await this.stays(late),
      rooms,
      guestRequests: guestRequests.map((gr) => ({
        id: gr.id,
        reservationId: gr.reservationId,
        code: gr.reservation.code,
        guestName: gr.reservation.contact.name,
        roomNumbers: gr.reservation.assignments.map((a) => a.room.number),
        kind: gr.kind,
        note: gr.note,
        status: gr.status,
        createdAt: gr.createdAt.toISOString(),
      })),
      counts: {
        arrivals: arrivals.length,
        arrived: arrivals.filter((r) => r.status === 'IN_HOUSE' || r.status === 'CHECKED_OUT').length,
        departures: departuresToday.length,
        departed: departuresToday.filter((r) => r.status === 'CHECKED_OUT').length,
        inHouse: inHouse.length,
        guestsInHouse: inHouse.reduce((a, r) => a + r.adults + r.children, 0),
        cleanVacant: rooms.filter((r) => (r.hkStatus === 'VACANT_CLEAN' || r.hkStatus === 'INSPECTED') && !r.occupant).length,
        dirty: rooms.filter((r) => r.hkStatus === 'VACANT_DIRTY').length,
        outOfService: rooms.filter((r) => r.hkStatus === 'BLOCKED' || r.hkStatus === 'OUT_OF_ORDER').length,
      },
    };
  }

  /** Rooms the desk can offer for each reservation room. */
  async options(id: string) {
    const r = await this.prisma.reservation.findUnique({ where: { id }, include: { rooms: true } });
    if (!r) throw notFound('Reservation');
    const today = hotelToday();
    const from = iso(r.arrival) < today ? today : iso(r.arrival);
    const to = iso(r.departure) > from ? iso(r.departure) : iso(new Date(day(from).getTime() + 86_400_000));
    const names = await this.booking.roomTypeNames();
    return Promise.all(
      r.rooms.map(async (rr) => ({ reservationRoomId: rr.id, roomTypeId: rr.roomTypeId, name: names.get(rr.roomTypeId) ?? 'Room', quantity: rr.quantity, rooms: await this.rack.candidates(rr.roomTypeId, from, to, r.id) })),
    );
  }

  /* ───────── assignment ───────── */

  private async assignWithin(tx: Tx, r: { id: string; arrival: Date; departure: Date; rooms: { id: string; roomTypeId: string; quantity: number }[] }, list: { reservationRoomId: string; roomId: string }[], opts: { from: string; checkClean: boolean; allowDirty: boolean; actorId: string }) {
    const to = iso(r.departure);
    for (const rr of r.rooms) {
      const n = list.filter((a) => a.reservationRoomId === rr.id).length;
      if (n !== rr.quantity) throw badRequest(`Choose ${rr.quantity} room${rr.quantity > 1 ? 's' : ''} for each part of the booking`);
    }
    if (new Set(list.map((a) => a.roomId)).size !== list.length) throw badRequest('The same room was chosen twice');
    const rooms = await tx.room.findMany({ where: { id: { in: list.map((a) => a.roomId) } } });
    for (const a of list) {
      const room = rooms.find((x) => x.id === a.roomId);
      const rr = r.rooms.find((x) => x.id === a.reservationRoomId);
      if (!room || !rr || !room.isActive) throw badRequest('That room is not available');
      if (room.roomTypeId !== rr.roomTypeId) throw badRequest(`Room ${room.number} is a different room type`);
      if (opts.checkClean && ['BLOCKED', 'OUT_OF_ORDER'].includes(room.hkStatus)) throw conflict(`Room ${room.number} is out of service`);
      if (opts.checkClean && room.hkStatus === 'VACANT_DIRTY' && !opts.allowDirty) throw conflict(`Room ${room.number} has not been cleaned yet`);
      const block = await tx.roomBlock.findFirst({ where: { roomId: room.id, releasedAt: null, fromDate: { lt: day(to) }, toDate: { gt: day(opts.from) } } });
      if (block) throw conflict(`Room ${room.number} is blocked on some of these nights`);
    }
    // Replace this reservation's live assignments.
    await tx.roomAssignment.deleteMany({ where: { reservationId: r.id, releasedAt: null } });
    try {
      for (const a of list) await tx.roomAssignment.create({ data: { reservationId: r.id, reservationRoomId: a.reservationRoomId, roomId: a.roomId, fromDate: day(opts.from), toDate: day(to), createdById: opts.actorId } });
    } catch (e) {
      if (isExclusion(e)) throw conflict('One of those rooms was just given to another booking. Refresh and choose again.');
      throw e;
    }
    return rooms;
  }

  private async lock(tx: Tx, id: string) {
    await tx.$queryRaw`SELECT id FROM "Reservation" WHERE id = ${id}::uuid FOR UPDATE`;
    const r = await tx.reservation.findUnique({ where: { id }, include: { rooms: true, folio: true, contact: true, assignments: { where: { releasedAt: null }, include: { room: true } } } });
    if (!r) throw notFound('Reservation');
    return r;
  }

  /** Pre-assign rooms before the guest arrives. */
  async assign(id: string, body: z.infer<typeof zAssignRoomsInput>, actor: AuthUser) {
    const numbers = await this.prisma.$transaction(async (tx) => {
      const r = await this.lock(tx, id);
      if (!['CONFIRMED', 'HELD'].includes(r.status)) throw badRequest('Rooms are given to upcoming bookings; use "move room" once the guest is in.');
      const today = hotelToday();
      const from = iso(r.arrival) < today ? today : iso(r.arrival);
      const rooms = await this.assignWithin(tx, r, body.assignments, { from, checkClean: from === today, allowDirty: true, actorId: actor.id });
      const list = rooms.map((x) => x.number).sort().join(', ');
      await this.booking.change(tx, id, 'rooms', `Room${rooms.length > 1 ? 's' : ''} ${list} given`, actor.id);
      return list;
    });
    await this.audit.record({ actor, action: 'desk.assign', entityType: 'Reservation', entityId: id, summary: `Assigned room(s) ${numbers}` });
    return this.booking.detail(id);
  }

  /* ───────── check-in ───────── */

  async checkIn(id: string, body: z.infer<typeof zCheckInInput>, actor: AuthUser) {
    const today = hotelToday();
    const pre = await this.prisma.reservation.findUnique({ where: { id } });
    if (!pre) throw notFound('Reservation');
    if (pre.status !== 'CONFIRMED') throw badRequest(pre.status === 'HELD' ? 'This booking is still waiting for its deposit. Take a payment first.' : `A ${pre.status.toLowerCase().replace('_', ' ')} booking cannot be checked in`);
    if (iso(pre.arrival) > today) throw badRequest(`This guest arrives on ${iso(pre.arrival)}`);
    if (iso(pre.departure) <= today) throw badRequest('The stay has already ended. Mark it a no-show or change the dates.');
    if (body.payment) {
      if (!has(actor, 'payments:record')) throw forbidden('You cannot take payments');
      await this.booking.recordPayment(id, body.payment, actor);
    }
    const numbers = await this.prisma.$transaction(async (tx) => {
      const r = await this.lock(tx, id);
      if (r.status !== 'CONFIRMED') throw conflict('Someone else just changed this booking. Refresh.');
      const list = body.assignments ?? r.assignments.map((a) => ({ reservationRoomId: a.reservationRoomId, roomId: a.roomId }));
      if (!list.length) throw badRequest('Choose a room first');
      const rooms = await this.assignWithin(tx, r, list, { from: today, checkClean: true, allowDirty: body.allowDirty, actorId: actor.id });
      const occupied = rooms.find((x) => x.hkStatus === 'OCCUPIED');
      if (occupied) throw conflict(`Room ${occupied.number} still has a guest in it`);
      await tx.room.updateMany({ where: { id: { in: rooms.map((x) => x.id) } }, data: { hkStatus: 'OCCUPIED' } });
      await tx.housekeepingTask.updateMany({ where: { roomId: { in: rooms.map((x) => x.id) }, date: day(today), status: { in: ['TODO', 'IN_PROGRESS'] }, kind: { in: ['DEPARTURE', 'INSPECTION'] } }, data: { status: 'SKIPPED', notes: 'Guest checked in before the clean was finished' } });
      await tx.reservation.update({ where: { id }, data: { status: 'IN_HOUSE', checkedInAt: new Date(), checkedInById: actor.id, version: { increment: 1 } } });
      const guest: Prisma.ContactUpdateInput = {};
      if (body.nationality) guest.nationality = body.nationality;
      if (body.idDocType) guest.idDocType = body.idDocType;
      if (body.idDocNumber) Object.assign(guest, { idDocNumberEnc: seal(body.idDocNumber), idDocLast4: last4(body.idDocNumber) });
      if (Object.keys(guest).length) await tx.contact.update({ where: { id: r.contactId }, data: guest });
      const nums = rooms.map((x) => x.number).sort().join(', ');
      await this.booking.change(tx, id, 'checked_in', `Checked in — room${rooms.length > 1 ? 's' : ''} ${nums}${body.allowDirty && rooms.some((x) => x.hkStatus === 'VACANT_DIRTY') ? ' (before cleaning)' : ''}`, actor.id);
      return nums;
    });
    await this.audit.record({ actor, action: 'desk.check_in', entityType: 'Reservation', entityId: id, summary: `Checked in ${pre.code} to ${numbers}` });
    return this.booking.detail(id);
  }

  /* ───────── check-out ───────── */

  async checkOut(id: string, body: z.infer<typeof zCheckOutInput>, actor: AuthUser) {
    const today = hotelToday();
    const pre = await this.prisma.reservation.findUnique({ where: { id } });
    if (!pre) throw notFound('Reservation');
    if (pre.status !== 'IN_HOUSE') throw badRequest('Only a guest who is in the house can check out');
    if (body.writeOffReason && !has(actor, 'payments:refund')) throw forbidden('Only the owner or a manager can close a bill with money owed');
    if (body.payment) {
      if (!has(actor, 'payments:record')) throw forbidden('You cannot take payments');
      await this.booking.recordPayment(id, body.payment, actor);
    }
    const out = await this.prisma.$transaction(async (tx) => {
      const r = await this.lock(tx, id);
      if (r.status !== 'IN_HOUSE') throw conflict('Someone else just checked this guest out. Refresh.');
      const balance = r.totalMinor - r.paidMinor;
      if (balance > 0n && !body.writeOffReason) throw badRequest(`${this.booking.money(balance, r.currency)} is still owed. Take the balance first.`, [{ path: 'payment.amount', message: 'Balance outstanding' }]);
      if (balance > 0n) {
        await tx.folioLine.create({ data: { folioId: r.folio!.id, kind: 'ADJUSTMENT', description: `Written off: ${body.writeOffReason}`, date: day(today), amountMinor: -balance, postedById: actor.id } });
        await tx.reservation.update({ where: { id }, data: { totalMinor: { decrement: balance } } });
      }
      // Leaving early frees the rest of the nights for sale; the nights stay charged unless someone credits them.
      const early = today < iso(r.departure);
      if (early) for (const rr of r.rooms) await this.inventory.release(tx, rr.roomTypeId, nightsOf(today, iso(r.departure)), rr.quantity, 'sold');
      for (const a of r.assignments) {
        const end = today < iso(a.toDate) ? (today > iso(a.fromDate) ? today : null) : null;
        await tx.roomAssignment.update({ where: { id: a.id }, data: { releasedAt: new Date(), ...(end ? { toDate: day(end) } : {}) } });
        await tx.room.update({ where: { id: a.roomId }, data: { hkStatus: 'VACANT_DIRTY' } });
        const arriving = await tx.roomAssignment.count({ where: { roomId: a.roomId, releasedAt: null, fromDate: day(today) } });
        await this.rack.ensureTask(a.roomId, today, 'DEPARTURE', tx, { priority: arriving ? 2 : 1 });
        await tx.housekeepingTask.updateMany({ where: { roomId: a.roomId, date: day(today), kind: 'STAYOVER', status: 'TODO' }, data: { status: 'SKIPPED', notes: 'Guest checked out' } });
      }
      await tx.reservation.update({ where: { id }, data: { status: 'CHECKED_OUT', checkedOutAt: new Date(), checkedOutById: actor.id, version: { increment: 1 } } });
      await tx.folio.update({ where: { id: r.folio!.id }, data: { isClosed: true } });
      if (body.feedback) await tx.feedback.upsert({ where: { reservationId: id }, create: { reservationId: id, score: body.feedback.score, comment: body.feedback.comment ?? null }, update: { score: body.feedback.score, comment: body.feedback.comment ?? null } });
      await this.booking.change(tx, id, 'checked_out', `Checked out${early ? ` early (was due ${iso(r.departure)})` : ''}${balance > 0n ? ` — ${this.booking.money(balance, r.currency)} written off` : ''}`, actor.id);
      return { r, early };
    });
    // The numbered final bill, ready to print at the desk.
    await this.documents.invoice(id, actor).catch((e) => this.log.error(`invoice for ${pre.code}: ${(e as Error).message}`));
    await this.audit.record({ actor, action: 'desk.check_out', entityType: 'Reservation', entityId: id, summary: `Checked out ${pre.code}${out.early ? ' (early)' : ''}` });
    if (!body.feedback) await this.messaging.forReservation('stay.thank_you', id).catch(() => undefined);
    return this.booking.detail(id);
  }



  /* ───────── no-show ───────── */

  async noShow(id: string, note: string | undefined, actor: AuthUser) {
    const today = hotelToday();
    const out = await this.prisma.$transaction(async (tx) => {
      const r = await this.lock(tx, id);
      if (r.status !== 'CONFIRMED') throw badRequest('Only a confirmed booking that never arrived can be a no-show');
      if (iso(r.arrival) > today) throw badRequest('The guest is not due yet');
      const from = iso(r.arrival) > today ? iso(r.arrival) : today;
      if (from < iso(r.departure)) for (const rr of r.rooms) await this.inventory.release(tx, rr.roomTypeId, nightsOf(from, iso(r.departure)), rr.quantity, 'sold');
      await tx.roomAssignment.updateMany({ where: { reservationId: id, releasedAt: null }, data: { releasedAt: new Date() } });
      // Stay charges are reversed; what was paid is kept as the no-show charge.
      await tx.folioLine.create({ data: { folioId: r.folio!.id, kind: 'ADJUSTMENT', description: 'No-show — stay charges reversed', date: day(today), amountMinor: -r.totalMinor, postedById: actor.id } });
      if (r.paidMinor > 0n) await tx.folioLine.create({ data: { folioId: r.folio!.id, kind: 'ADJUSTMENT', description: 'No-show charge (payments kept)', date: day(today), amountMinor: r.paidMinor, postedById: actor.id } });
      await tx.reservation.update({ where: { id }, data: { status: 'NO_SHOW', totalMinor: r.paidMinor, version: { increment: 1 }, ...(note ? { staffNotes: `${r.staffNotes ? `${r.staffNotes}\n` : ''}No-show: ${note}` } : {}) } });
      await this.booking.change(tx, id, 'no_show', `Marked no-show${r.paidMinor > 0n ? ` — ${this.booking.money(r.paidMinor, r.currency)} kept` : ''}${note ? `: ${note}` : ''}`, actor.id);
      return r;
    });
    await this.audit.record({ actor, action: 'desk.no_show', entityType: 'Reservation', entityId: id, summary: `No-show ${out.code}` });
    await this.rack.syncToday();
    return this.booking.detail(id);
  }

  /* ───────── move room ───────── */

  async move(id: string, body: z.infer<typeof zMoveRoomInput>, actor: AuthUser) {
    const today = hotelToday();
    const summary = await this.prisma.$transaction(async (tx) => {
      const r = await this.lock(tx, id);
      if (r.status !== 'IN_HOUSE') throw badRequest('Move room is for guests in the house; before arrival, just choose another room.');
      const current = r.assignments.find((a) => a.roomId === body.fromRoomId);
      if (!current) throw badRequest('The guest is not in that room');
      const to = await tx.room.findUnique({ where: { id: body.toRoomId } });
      if (!to?.isActive) throw notFound('Room');
      if (to.roomTypeId !== current.room.roomTypeId) throw badRequest('Moves are within the same room type for now. For an upgrade, change the booking first.');
      if (['OCCUPIED', 'BLOCKED', 'OUT_OF_ORDER'].includes(to.hkStatus)) throw conflict(`Room ${to.number} is not free`);
      if (to.hkStatus === 'VACANT_DIRTY' && !body.allowDirty) throw conflict(`Room ${to.number} has not been cleaned yet`);
      if (today > iso(current.fromDate)) await tx.roomAssignment.update({ where: { id: current.id }, data: { toDate: day(today), releasedAt: new Date() } });
      else await tx.roomAssignment.update({ where: { id: current.id }, data: { releasedAt: new Date() } });
      try {
        await tx.roomAssignment.create({ data: { reservationId: id, reservationRoomId: current.reservationRoomId, roomId: to.id, fromDate: day(today), toDate: day(iso(r.departure) > today ? iso(r.departure) : iso(new Date(day(today).getTime() + 86_400_000))), createdById: actor.id } });
      } catch (e) {
        if (isExclusion(e)) throw conflict(`Room ${to.number} is given to another booking on some of these nights`);
        throw e;
      }
      await tx.room.update({ where: { id: current.roomId }, data: { hkStatus: 'VACANT_DIRTY' } });
      await tx.room.update({ where: { id: to.id }, data: { hkStatus: 'OCCUPIED' } });
      await this.rack.ensureTask(current.roomId, today, 'DEPARTURE', tx, { priority: 1, notes: `Guest moved to ${to.number}` });
      const s = `Moved from ${current.room.number} to ${to.number}: ${body.reason}`;
      await this.booking.change(tx, id, 'moved', s, actor.id);
      return s;
    });
    await this.audit.record({ actor, action: 'desk.move', entityType: 'Reservation', entityId: id, summary });
    return this.booking.detail(id);
  }

  /* ───────── folio ───────── */

  async charge(id: string, body: z.infer<typeof zFolioChargeInput>, actor: AuthUser) {
    if (body.credit && !has(actor, 'payments:refund')) throw forbidden('Only the owner or a manager can take money off a bill');
    const amount = body.credit ? -body.amount : body.amount;
    const r = await this.prisma.$transaction(async (tx) => {
      const r = await this.lock(tx, id);
      if (!['CONFIRMED', 'IN_HOUSE'].includes(r.status)) throw badRequest('Charges go on an open bill (confirmed or in the house)');
      if (amount < 0n && r.totalMinor + amount < 0n) throw badRequest('That credit is more than the bill');
      await tx.folioLine.create({ data: { folioId: r.folio!.id, kind: body.credit ? 'ADJUSTMENT' : body.kind, description: body.description, date: day(hotelToday()), amountMinor: amount, postedById: actor.id } });
      await tx.reservation.update({ where: { id }, data: { totalMinor: { increment: amount }, version: { increment: 1 } } });
      await this.booking.change(tx, id, body.credit ? 'credit' : 'charge', `${body.credit ? 'Credit' : 'Charge'}: ${body.description} ${this.booking.money(body.amount, r.currency)}`, actor.id);
      return r;
    });
    await this.audit.record({ actor, action: body.credit ? 'folio.credit' : 'folio.charge', entityType: 'Reservation', entityId: id, summary: `${body.credit ? 'Credited' : 'Charged'} ${this.booking.money(body.amount, r.currency)} on ${r.code}: ${body.description}` });
    return this.booking.detail(id);
  }

  async patchGuestRequest(id: string, status: 'ACCEPTED' | 'DONE' | 'DECLINED', actor: AuthUser) {
    const gr = await this.prisma.guestRequest.findUnique({ where: { id }, include: { reservation: true } });
    if (!gr) throw notFound('Guest request');
    await this.prisma.guestRequest.update({ where: { id }, data: { status } });
    await this.audit.record({
      actor,
      action: 'desk.guest_request',
      entityType: 'Reservation',
      entityId: gr.reservationId,
      summary: `Guest request (${gr.kind}) on ${gr.reservation.code} → ${status}`,
    });
    return { ok: true };
  }
}
