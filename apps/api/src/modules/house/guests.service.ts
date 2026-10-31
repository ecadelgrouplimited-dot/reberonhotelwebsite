import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { z } from 'zod';
import type { FeedbackDTO, GuestProfileDTO, GuestSummaryDTO, MoneyByCurrency, zGuestPatch } from '@reberon/contracts';
import { hotelToday, normalizePhone } from '@reberon/utils';
import type { Prisma } from '@reberon/db';
import { PrismaService } from '../../common/prisma.service.js';
import { AuditService } from '../../common/audit.service.js';
import { has, type AuthUser } from '../../common/auth.js';
import { badRequest, conflict, forbidden, notFound } from '../../common/errors.js';
import { last4, seal } from '../../common/crypto.js';
import { Events } from '../../common/events.js';
import { BookingService } from '../booking/booking.service.js';
import { InventoryService, iso, nightsOf } from '../booking/inventory.service.js';

const STAYED = ['CHECKED_OUT', 'IN_HOUSE'] as const;
const LIVE = ['CONFIRMED', 'IN_HOUSE', 'CHECKED_OUT'] as const;

type Res = { status: string; arrival: Date; departure: Date; paidMinor: bigint; currency: string };

function roll(rows: Res[], today: string) {
  const stayed = rows.filter((r) => (STAYED as readonly string[]).includes(r.status));
  const spent: MoneyByCurrency = { UGX: '0', USD: '0' };
  for (const r of rows) if ((LIVE as readonly string[]).includes(r.status) || r.status === 'NO_SHOW' || r.status === 'CANCELLED') spent[r.currency as 'UGX' | 'USD'] = (BigInt(spent[r.currency as 'UGX' | 'USD']) + r.paidMinor).toString();
  const past = stayed.map((r) => iso(r.arrival)).sort();
  const future = rows.filter((r) => r.status === 'CONFIRMED' && iso(r.arrival) >= today).map((r) => iso(r.arrival)).sort();
  return {
    stays: stayed.length,
    nights: stayed.reduce((a, r) => a + nightsOf(iso(r.arrival), iso(r.departure)).length, 0),
    lastStay: past.at(-1) ?? null,
    nextStay: future[0] ?? null,
    spent,
  };
}

const simplify = (name: string) => name.toLowerCase().normalize('NFKD').replace(/[^a-z\s]/g, '').split(/\s+/).filter(Boolean).sort().join(' ');

/** Guests are Contacts who have booked. One person, one profile, their whole history (ADR-017). */
@Injectable()
export class GuestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly booking: BookingService,
    private readonly inventory: InventoryService,
    private readonly events: EventEmitter2,
  ) {}

  async list(q: { q?: string; filter?: string }, viewer: AuthUser): Promise<{ data: GuestSummaryDTO[]; total: number }> {
    const where: Prisma.ContactWhereInput = { mergedIntoId: null, reservations: { some: {} } };
    const term = q.q?.trim();
    if (term) {
      const digits = term.replace(/[^\d]/g, '');
      where.OR = [{ name: { contains: term, mode: 'insensitive' } }, { email: { contains: term.toLowerCase() } }, ...(digits.length >= 4 ? [{ phone: { contains: digits.slice(-9) } }] : []), { reservations: { some: { code: { contains: term.toUpperCase() } } } }];
    }
    if (q.filter === 'vip') where.isVip = true;
    if (q.filter === 'returning') where.reservations = { some: { status: 'CHECKED_OUT' } };
    const rows = await this.prisma.contact.findMany({ where, include: { reservations: { select: { status: true, arrival: true, departure: true, paidMinor: true, currency: true } } }, orderBy: { updatedAt: 'desc' }, take: 400 });
    const today = hotelToday();
    const money = has(viewer, 'payments:record');
    let data = rows.map((c) => {
      const r = roll(c.reservations, today);
      return { id: c.id, name: c.name, phone: c.phone, email: c.email, country: c.country, stays: r.stays, nights: r.nights, lastStay: r.lastStay, nextStay: r.nextStay, isVip: c.isVip, tags: c.tags, ...(money ? { spent: r.spent } : {}) };
    });
    if (q.filter === 'returning') data = data.filter((g) => g.stays >= 2 || (g.stays >= 1 && g.nextStay));
    data.sort((a, b) => (b.nextStay && !a.nextStay ? 1 : 0) - (a.nextStay && !b.nextStay ? 1 : 0) || (b.lastStay ?? '').localeCompare(a.lastStay ?? ''));
    return { data, total: data.length };
  }

  async profile(id: string, viewer: AuthUser): Promise<GuestProfileDTO> {
    let c = await this.prisma.contact.findUnique({ where: { id } });
    if (!c) throw notFound('Guest');
    if (c.mergedIntoId) c = (await this.prisma.contact.findUnique({ where: { id: c.mergedIntoId } }))!;
    const [reservations, names, conversations] = await Promise.all([
      this.prisma.reservation.findMany({ where: { contactId: c.id }, include: { contact: true, rooms: true, feedback: true, assignments: { include: { room: { select: { number: true } } } } }, orderBy: { arrival: 'desc' } }),
      this.booking.roomTypeNames(),
      this.prisma.conversation.findMany({ where: { contactId: c.id }, orderBy: { lastMessageAt: 'desc' }, take: 20 }),
    ]);
    const today = hotelToday();
    const r = roll(reservations, today);
    const money = has(viewer, 'payments:record');
    // Preferred room type: explicit, else the one they stayed in most.
    let pref = c.preferredRoomTypeId;
    if (!pref) {
      const tally = new Map<string, number>();
      for (const x of reservations.filter((x) => x.status === 'CHECKED_OUT')) for (const rr of x.rooms) tally.set(rr.roomTypeId, (tally.get(rr.roomTypeId) ?? 0) + 1);
      pref = [...tally.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
    }
    return {
      id: c.id,
      name: c.name,
      phone: c.phone,
      email: c.email,
      country: c.country,
      nationality: c.nationality,
      idDocType: c.idDocType,
      idDocLast4: c.idDocLast4,
      preferredRoomType: pref ? { id: pref, name: names.get(pref) ?? 'Room' } : null,
      guestNotes: c.guestNotes,
      isVip: c.isVip,
      tags: c.tags,
      source: c.source,
      whatsappOptIn: c.whatsappOptIn,
      createdAt: c.createdAt.toISOString(),
      stays: r.stays,
      nights: r.nights,
      lastStay: r.lastStay,
      nextStay: r.nextStay,
      ...(money ? { spent: r.spent } : {}),
      reservations: reservations.map((x) => {
        const s = this.booking.summary(x, names);
        const numbers = [...new Set(x.assignments.map((a) => a.room.number))].sort();
        return money ? { ...s, roomNumbers: numbers } : { ...s, totalMinor: '0', paidMinor: '0', balanceMinor: '0', roomNumbers: numbers };
      }),
      feedback: reservations.filter((x) => x.feedback).map((x) => ({ id: x.feedback!.id, code: x.code, score: x.feedback!.score, comment: x.feedback!.comment, createdAt: x.feedback!.createdAt.toISOString() })),
      conversations: conversations.map((v) => ({ id: v.id, subject: v.subject, status: v.status, lastMessageAt: v.lastMessageAt.toISOString() })),
      possibleDuplicates: await this.duplicatesOf(c),
    };
  }

  private async duplicatesOf(c: { id: string; name: string; phone: string | null; email: string | null }) {
    const key = simplify(c.name);
    const first = key.split(' ')[0] ?? '';
    const candidates = await this.prisma.contact.findMany({
      where: {
        id: { not: c.id },
        mergedIntoId: null,
        OR: [...(c.phone ? [{ phone: c.phone }] : []), ...(c.email ? [{ email: c.email }] : []), ...(first.length >= 3 ? [{ name: { contains: first, mode: 'insensitive' as const } }] : [])],
      },
      include: { _count: { select: { reservations: { where: { status: 'CHECKED_OUT' } } } } },
      take: 30,
    });
    return candidates
      .map((x) => {
        const why = c.phone && x.phone === c.phone ? 'Same phone number' : c.email && x.email === c.email ? 'Same email' : simplify(x.name) === key ? 'Same name' : null;
        return why ? { id: x.id, name: x.name, phone: x.phone, email: x.email, stays: x._count.reservations, why } : null;
      })
      .filter((x): x is NonNullable<typeof x> => !!x)
      .slice(0, 6);
  }

  async update(id: string, body: z.infer<typeof zGuestPatch>, actor: AuthUser) {
    const c = await this.prisma.contact.findUnique({ where: { id } });
    if (!c || c.mergedIntoId) throw notFound('Guest');
    const data: Prisma.ContactUpdateInput = {};
    for (const k of ['name', 'country', 'nationality', 'idDocType', 'preferredRoomTypeId', 'tags', 'guestNotes', 'isVip'] as const) if (body[k] !== undefined) (data as Record<string, unknown>)[k] = body[k];
    if (body.email !== undefined) data.email = body.email?.toLowerCase() ?? null;
    if (body.phone !== undefined) {
      const phone = body.phone ? normalizePhone(body.phone) : null;
      if (body.phone && !phone) throw badRequest('That phone number does not look right', [{ path: 'phone', message: 'Check the number' }]);
      data.phone = phone;
    }
    if (body.idDocNumber !== undefined) Object.assign(data, body.idDocNumber ? { idDocNumberEnc: seal(body.idDocNumber), idDocLast4: last4(body.idDocNumber) } : { idDocNumberEnc: null, idDocLast4: null });
    if (body.tags) data.tags = [...new Set(body.tags.map((t) => t.toLowerCase()))];
    await this.prisma.contact.update({ where: { id }, data });
    const changedFields = Object.keys(body).filter((k) => (body as Record<string, unknown>)[k] !== undefined);
    await this.audit.record({
      actor,
      action: 'guest.update',
      entityType: 'Contact',
      entityId: id,
      summary: `Updated guest "${body.name ?? c.name}" (${changedFields.join(', ') || 'profile'}) by ${actor.name} (${actor.role})`,
      before: {
        name: c.name,
        phone: c.phone,
        email: c.email,
        country: c.country,
        nationality: c.nationality,
        isVip: c.isVip,
        tags: c.tags,
        guestNotes: c.guestNotes,
      },
      after: {
        ...body,
        idDocNumber: body.idDocNumber ? '••••' : body.idDocNumber,
        actorRole: actor.role,
      },
    });
    return this.profile(id, actor);
  }

  async delete(id: string, reason: string | undefined, actor: AuthUser) {
    if (!['OWNER', 'MANAGER'].includes(actor.role)) {
      throw forbidden('Only the Super Admin (Owner) or Manager can delete a guest profile');
    }
    const existing = await this.prisma.contact.findUnique({
      where: { id },
      include: { reservations: { include: { rooms: true } } },
    });
    if (!existing) throw notFound('Guest');
    const inHouse = existing.reservations.filter((r) => r.status === 'IN_HOUSE');
    if (inHouse.length > 0 && actor.role !== 'OWNER') {
      throw badRequest(`Cannot delete ${existing.name} while they have an active In-House stay (${inHouse.map((r) => r.code).join(', ')}). Check them out first.`);
    }

    await this.prisma.$transaction(async (tx) => {
      for (const r of existing.reservations) {
        if (['HELD', 'CONFIRMED', 'IN_HOUSE'].includes(r.status)) {
          const nights = nightsOf(iso(r.arrival), iso(r.departure));
          for (const rr of r.rooms) {
            await this.inventory.release(tx, rr.roomTypeId, nights, rr.quantity, r.status === 'HELD' ? 'held' : 'sold');
          }
        }
        await tx.issuedDocument.updateMany({ where: { reservationId: r.id }, data: { reservationId: null } });
        await tx.posOrder.updateMany({ where: { reservationId: r.id }, data: { reservationId: null } });
        await tx.healthClubAccessLog.updateMany({ where: { reservationId: r.id }, data: { reservationId: null } });
        await tx.outboundMessage.updateMany({ where: { reservationId: r.id }, data: { reservationId: null } });
        await tx.quotation.updateMany({ where: { convertedReservationId: r.id }, data: { convertedReservationId: null } });
        await tx.paymentIntent.deleteMany({ where: { reservationId: r.id } });
        await tx.reservation.delete({ where: { id: r.id } });
      }
      await tx.contact.updateMany({ where: { mergedIntoId: id }, data: { mergedIntoId: null } });
      await tx.contact.delete({ where: { id } });
    });

    const cleanReason = reason?.trim() || `Deleted by ${actor.role}`;
    await this.audit.record({
      actor,
      action: 'guest.delete',
      entityType: 'Contact',
      entityId: id,
      summary: `Deleted guest "${existing.name}" (${existing.phone ?? existing.email ?? 'no contact'}, ${existing.reservations.length} stays) by ${actor.name} (${actor.role}): ${cleanReason}`,
      before: {
        name: existing.name,
        phone: existing.phone,
        email: existing.email,
        country: existing.country,
        nationality: existing.nationality,
        isVip: existing.isVip,
        tags: existing.tags,
        guestNotes: existing.guestNotes,
        reservationCodes: existing.reservations.map((r) => r.code),
        reservationsCount: existing.reservations.length,
        actorRole: actor.role,
        reason: cleanReason,
      },
    });
    return { ok: true, deleted: true, name: existing.name };
  }

  /** Fold `mergeId` into `keepId`: bookings, conversations and list entries follow; gaps are filled. */
  async merge(keepId: string, mergeId: string, actor: AuthUser) {
    const [keep, gone] = await Promise.all([this.prisma.contact.findUnique({ where: { id: keepId } }), this.prisma.contact.findUnique({ where: { id: mergeId } })]);
    if (!keep || !gone) throw notFound('Guest');
    if (keep.mergedIntoId || gone.mergedIntoId) throw conflict('One of these was already merged');
    await this.prisma.$transaction(async (tx) => {
      await tx.reservation.updateMany({ where: { contactId: gone.id }, data: { contactId: keep.id } });
      await tx.conversation.updateMany({ where: { contactId: gone.id }, data: { contactId: keep.id } });
      await tx.waitlistEntry.updateMany({ where: { contactId: gone.id }, data: { contactId: keep.id } });
      await tx.contact.updateMany({ where: { mergedIntoId: gone.id }, data: { mergedIntoId: keep.id } });
      await tx.contact.update({
        where: { id: keep.id },
        data: {
          phone: keep.phone ?? gone.phone,
          email: keep.email ?? gone.email,
          country: keep.country ?? gone.country,
          nationality: keep.nationality ?? gone.nationality,
          idDocType: keep.idDocType ?? gone.idDocType,
          idDocNumberEnc: keep.idDocNumberEnc ?? gone.idDocNumberEnc,
          idDocLast4: keep.idDocLast4 ?? gone.idDocLast4,
          preferredRoomTypeId: keep.preferredRoomTypeId ?? gone.preferredRoomTypeId,
          whatsappOptIn: keep.whatsappOptIn || gone.whatsappOptIn,
          isVip: keep.isVip || gone.isVip,
          tags: [...new Set([...keep.tags, ...gone.tags])],
          guestNotes: [keep.guestNotes, gone.guestNotes].filter(Boolean).join('\n\n') || null,
        },
      });
      await tx.contact.update({ where: { id: gone.id }, data: { mergedIntoId: keep.id } });
    });
    await this.audit.record({ actor, action: 'guest.merge', entityType: 'Contact', entityId: keep.id, summary: `Merged "${gone.name}" into "${keep.name}"`, before: { mergedId: gone.id } });
    return this.profile(keep.id, actor);
  }

  /* ───────── feedback ───────── */

  async feedback(filter?: string): Promise<FeedbackDTO[]> {
    const where: Prisma.FeedbackWhereInput = filter === 'open' ? { handledAt: null, score: { not: 'GOOD' } } : filter === 'public' ? { allowPublic: true, comment: { not: null } } : {};
    const rows = await this.prisma.feedback.findMany({ where, include: { reservation: { include: { contact: true } } }, orderBy: { createdAt: 'desc' }, take: 300 });
    return rows.map((f) => ({
      id: f.id,
      score: f.score,
      comment: f.comment,
      allowPublic: f.allowPublic,
      published: !!f.testimonialId,
      handledAt: f.handledAt?.toISOString() ?? null,
      createdAt: f.createdAt.toISOString(),
      reservation: { id: f.reservationId, code: f.reservation.code, arrival: iso(f.reservation.arrival), departure: iso(f.reservation.departure), status: f.reservation.status },
      guest: { id: f.reservation.contactId, name: f.reservation.contact.name, country: f.reservation.contact.country },
    }));
  }

  async submitFeedback(code: string, body: { score: 'GOOD' | 'OK' | 'BAD'; comment?: string; allowPublic: boolean }) {
    const r = await this.prisma.reservation.findUnique({ where: { code } });
    if (!r) throw notFound('Booking');
    if (r.status !== 'IN_HOUSE' && r.status !== 'CHECKED_OUT') throw badRequest('We will ask how it was once you have stayed.');
    const existing = await this.prisma.feedback.findUnique({ where: { reservationId: r.id } });
    if (existing?.testimonialId) throw conflict('Thank you — this is already on our website.');
    await this.prisma.feedback.upsert({
      where: { reservationId: r.id },
      create: { reservationId: r.id, score: body.score, comment: body.comment ?? null, allowPublic: body.allowPublic },
      update: { score: body.score, comment: body.comment ?? null, allowPublic: body.allowPublic, handledAt: null },
    });
    await this.booking.change(this.prisma, r.id, 'feedback', `Guest said: ${body.score.toLowerCase()}${body.comment ? ` — “${body.comment.slice(0, 120)}${body.comment.length > 120 ? '…' : ''}”` : ''}`, null);
    return { ok: true };
  }

  async handleFeedback(id: string, actor: AuthUser) {
    await this.prisma.feedback.update({ where: { id }, data: { handledAt: new Date(), handledById: actor.id } });
    return { ok: true };
  }

  /** With the guest's permission and the owner's say-so, their words go on the website ("Guest voices" block). */
  async publishFeedback(id: string, actor: AuthUser) {
    const f = await this.prisma.feedback.findUnique({ where: { id }, include: { reservation: { include: { contact: true } } } });
    if (!f) throw notFound('Feedback');
    if (!f.allowPublic) throw badRequest('The guest did not agree to share this publicly.');
    if (!f.comment) throw badRequest('There are no words to publish.');
    if (f.testimonialId) throw conflict('Already a testimonial');
    const parts = f.reservation.contact.name.trim().split(/\s+/);
    const author = parts.length > 1 ? `${parts[0]} ${parts.at(-1)![0]}.` : parts[0]!;
    const t = await this.prisma.$transaction(async (tx) => {
      const t = await tx.testimonial.create({ data: { author, origin: f.reservation.contact.country, text: { en: f.comment! }, rating: f.score === 'GOOD' ? 5 : f.score === 'OK' ? 4 : 3, isPublished: true } });
      await tx.feedback.update({ where: { id }, data: { testimonialId: t.id, handledAt: f.handledAt ?? new Date(), handledById: f.handledById ?? actor.id } });
      return t;
    });
    await this.audit.record({ actor, action: 'feedback.publish', entityType: 'Testimonial', entityId: t.id, summary: `Put ${author}'s words on the website` });
    await this.events.emitAsync(Events.ContentChanged, { tags: ['voices'] });
    return { testimonialId: t.id };
  }

  async unpublishFeedback(id: string, actor: AuthUser) {
    const f = await this.prisma.feedback.findUnique({ where: { id } });
    if (!f?.testimonialId) throw notFound('Published feedback');
    await this.prisma.$transaction([this.prisma.feedback.update({ where: { id }, data: { testimonialId: null } }), this.prisma.testimonial.deleteMany({ where: { id: f.testimonialId } })]);
    await this.audit.record({ actor, action: 'feedback.unpublish', entityType: 'Feedback', entityId: id, summary: 'Took guest words off the website' });
    await this.events.emitAsync(Events.ContentChanged, { tags: ['voices'] });
    return { ok: true };
  }
}
