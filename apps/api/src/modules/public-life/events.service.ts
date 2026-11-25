import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { createHash, randomBytes } from 'node:crypto';
import type { z } from 'zod';
import {
  t,
  type EventAdminRowDTO,
  type EventCardDTO,
  type EventDetailDTO,
  type EventRegistrationDTO,
  type MediaRef,
  type RsvpResultDTO,
  type zEventInput,
  type zRegistrationAdminInput,
  type zRsvpInput,
} from '@reberon/contracts';
import { formatMoney, referenceCode, slugify, type Currency } from '@reberon/utils';
import { Prisma, type Event, type EventRegistration } from '@reberon/db';
import { PrismaService } from '../../common/prisma.service.js';
import { AuditService } from '../../common/audit.service.js';
import { CacheService } from '../../common/cache.service.js';
import { Events } from '../../common/events.js';
import { has, type AuthUser } from '../../common/auth.js';
import { badRequest, conflict, forbidden, notFound } from '../../common/errors.js';
import { env } from '../../config.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { ResolverService } from '../content/resolver.service.js';
import { lr, lt, pick } from '../content/mappers.js';
import { eventCard, eventRsvpOpen } from './cards.js';

const TTL = 60;
const SEATED: EventRegistration['status'][] = ['CONFIRMED', 'ATTENDED'];
const hash = (s: string) => createHash('sha256').update(s).digest('hex');

/** "2026-12-05T19:00" is Kampala time (UTC+3, no daylight saving); full ISO strings pass through. */
export function kampalaToDate(v: string) {
  return new Date(/[zZ]|[+-]\d{2}:?\d{2}$/.test(v) ? v : `${v.length === 16 ? `${v}:00` : v}+03:00`);
}
/** The reverse, for the House editor: "YYYY-MM-DDTHH:MM" in Kampala time. */
export function toKampalaInput(d: Date | null) {
  if (!d) return null;
  return new Date(d.getTime() + 3 * 3600_000).toISOString().slice(0, 16);
}
const whenText = (start: Date, end: Date | null) => {
  const day = new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Africa/Kampala' }).format(start);
  const time = (d: Date) => new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Kampala' }).format(d);
  const sameDay = end && new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Kampala' }).format(end) === new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Kampala' }).format(start);
  return `${day}, ${time(start)}${end ? (sameDay ? `–${time(end)}` : ` until ${new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Kampala' }).format(end)}`) : ''}`;
};

type WithCounts = Event & { seatsTaken: number };

@Injectable()
export class EventsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly cache: CacheService,
    private readonly bus: EventEmitter2,
    private readonly resolver: ResolverService,
    private readonly notifications: NotificationsService,
  ) {}

  private async changed() {
    await this.bus.emitAsync(Events.ContentChanged, { tags: ['events'] });
  }

  private async seatsTaken(ids: string[]) {
    if (!ids.length) return new Map<string, number>();
    const rows = await this.prisma.eventRegistration.groupBy({ by: ['eventId'], where: { eventId: { in: ids }, status: { in: SEATED } }, _sum: { partySize: true } });
    return new Map(rows.map((r) => [r.eventId, r._sum.partySize ?? 0]));
  }

  private rsvpOpen(e: Event) {
    return eventRsvpOpen(e);
  }

  toCard(e: WithCounts, media: Map<string, MediaRef>): EventCardDTO {
    return eventCard(e, e.seatsTaken, media);
  }

  private async cards(rows: Event[]) {
    const [seats, media] = await Promise.all([this.seatsTaken(rows.map((r) => r.id)), this.resolver.mediaMap(rows.map((r) => r.coverId).filter((x): x is string => !!x))]);
    return rows.map((r) => this.toCard({ ...r, seatsTaken: seats.get(r.id) ?? 0 }, media));
  }

  /* ───────────────────────── public ───────────────────────── */

  /** Upcoming (soonest first), then the last six months of past events. */
  publicList(): Promise<{ upcoming: EventCardDTO[]; past: EventCardDTO[] }> {
    return this.cache.wrap('events:list', ['events', 'media'], TTL, async () => {
      const now = new Date();
      const since = new Date(now.getTime() - 183 * 86_400_000);
      const rows = await this.prisma.event.findMany({
        where: { status: { in: ['PUBLISHED', 'CANCELLED'] }, deletedAt: null, startsAt: { gte: since } },
        orderBy: { startsAt: 'asc' },
      });
      const cards = await this.cards(rows);
      return { upcoming: cards.filter((c) => !c.past), past: cards.filter((c) => c.past && c.status !== 'CANCELLED').reverse() };
    });
  }

  publicDetail(slug: string): Promise<EventDetailDTO> {
    return this.cache.wrap(`event:${slug}`, ['events', `event:${slug}`, 'media'], TTL, async () => {
      const e = await this.prisma.event.findFirst({ where: { slug, status: { in: ['PUBLISHED', 'CANCELLED'] }, deletedAt: null } });
      if (!e) throw notFound('Event');
      return this.detail(e);
    });
  }

  private async detail(e: Event): Promise<EventDetailDTO> {
    const [card] = await this.cards([e]);
    const [gallery, moreRows] = await Promise.all([
      this.resolver.mediaMap(e.galleryIds),
      this.prisma.event.findMany({ where: { status: 'PUBLISHED', deletedAt: null, id: { not: e.id }, startsAt: { gte: new Date() } }, orderBy: { startsAt: 'asc' }, take: 3 }),
    ]);
    const seo = (e.seo ?? {}) as EventDetailDTO['seo'];
    return {
      ...card!,
      body: lr(e.body),
      gallery: pick(gallery, e.galleryIds),
      venueDetail: e.venueDetail,
      maxPartySize: e.maxPartySize,
      rsvpClosesAt: e.rsvpClosesAt?.toISOString() ?? null,
      seo,
      more: await this.cards(moreRows),
    };
  }

  /** Book places. The event row is locked while seats are counted, so two people can never take the last seat. */
  async rsvp(slug: string, body: z.infer<typeof zRsvpInput>): Promise<RsvpResultDTO> {
    const token = randomBytes(24).toString('base64url');
    const { reg, event } = await this.prisma.$transaction(async (tx) => {
      const [locked] = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM "Event" WHERE slug = ${slug} AND "deletedAt" IS NULL FOR UPDATE`;
      if (!locked) throw notFound('Event');
      const event = await tx.event.findUniqueOrThrow({ where: { id: locked.id } });
      if (event.status === 'CANCELLED') throw badRequest('This event has been cancelled.');
      if (!this.rsvpOpen(event)) throw badRequest('Places for this event are no longer being taken.');
      if (body.partySize > event.maxPartySize) throw badRequest(`Up to ${event.maxPartySize} people per booking. For a bigger group, please contact us.`, [{ path: 'partySize', message: `At most ${event.maxPartySize}` }]);
      // Same email or phone already booked for this event: one booking per person.
      const or = [body.email ? { email: { equals: body.email, mode: 'insensitive' as const } } : null, body.phone ? { phone: body.phone } : null].filter(Boolean) as Prisma.EventRegistrationWhereInput[];
      if (or.length) {
        const dup = await tx.eventRegistration.findFirst({ where: { eventId: event.id, status: { in: ['CONFIRMED', 'WAITLISTED'] }, OR: or } });
        if (dup) throw conflict(`You already have ${dup.status === 'WAITLISTED' ? 'a waiting-list place' : 'a booking'} for this event (${dup.code}). Check your email to change it.`);
      }
      const taken = (await tx.eventRegistration.aggregate({ where: { eventId: event.id, status: { in: SEATED } }, _sum: { partySize: true } }))._sum.partySize ?? 0;
      const fits = event.capacity === null || taken + body.partySize <= event.capacity;
      const reg = await tx.eventRegistration.create({
        data: {
          eventId: event.id,
          code: referenceCode('EV', 5),
          name: body.name,
          email: body.email ?? null,
          phone: body.phone ?? null,
          partySize: body.partySize,
          notes: body.notes ?? null,
          status: fits ? 'CONFIRMED' : 'WAITLISTED',
          manageTokenHash: hash(token),
        },
      });
      return { reg, event };
    });
    const manageUrl = `${env.WEB_URL}/events/rsvp?token=${token}`;
    await this.audit.record({ actorType: 'GUEST', action: 'event.rsvp', entityType: 'Event', entityId: event.id, summary: `${reg.name} ${reg.status === 'WAITLISTED' ? 'joined the waiting list for' : 'booked'} ${reg.partySize} place${reg.partySize > 1 ? 's' : ''} — ${t(lt(event.title))} (${reg.code})` });
    await this.cache.bust([`event:${event.slug}`, 'events']);
    await this.changed();
    if (reg.email) await this.emailRegistration(event, reg, manageUrl, reg.status === 'WAITLISTED' ? 'waitlisted' : 'confirmed');
    return { code: reg.code, status: reg.status === 'WAITLISTED' ? 'WAITLISTED' : 'CONFIRMED', partySize: reg.partySize, eventTitle: lt(event.title), startsAt: event.startsAt.toISOString(), manageUrl };
  }

  private async byToken(token: string) {
    if (!/^[A-Za-z0-9_-]{20,80}$/.test(token)) throw notFound('Booking');
    const reg = await this.prisma.eventRegistration.findUnique({ where: { manageTokenHash: hash(token) }, include: { event: true } });
    if (!reg) throw notFound('Booking');
    return reg;
  }

  async manageView(token: string) {
    const reg = await this.byToken(token);
    return {
      code: reg.code,
      name: reg.name,
      partySize: reg.partySize,
      status: reg.status,
      event: { slug: reg.event.slug, title: lt(reg.event.title), startsAt: reg.event.startsAt.toISOString(), endsAt: reg.event.endsAt?.toISOString() ?? null, venue: reg.event.venue, status: reg.event.status },
      canCancel: ['CONFIRMED', 'WAITLISTED'].includes(reg.status) && reg.event.startsAt > new Date(),
    };
  }

  /** The guest gives their places back; the first waiting-list booking that now fits is confirmed. */
  async cancelByToken(token: string) {
    const reg = await this.byToken(token);
    if (!['CONFIRMED', 'WAITLISTED'].includes(reg.status)) return this.manageView(token);
    if (reg.event.startsAt <= new Date()) throw badRequest('This event has already started.');
    await this.prisma.eventRegistration.update({ where: { id: reg.id }, data: { status: 'CANCELLED', cancelledAt: new Date() } });
    await this.audit.record({ actorType: 'GUEST', action: 'event.rsvp_cancel', entityType: 'Event', entityId: reg.eventId, summary: `${reg.name} gave back ${reg.partySize} place${reg.partySize > 1 ? 's' : ''} (${reg.code})` });
    if (reg.status === 'CONFIRMED') await this.promoteWaitlist(reg.eventId);
    await this.cache.bust([`event:${reg.event.slug}`, 'events']);
    await this.changed();
    return this.manageView(token);
  }

  private async promoteWaitlist(eventId: string) {
    const promoted = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Event" WHERE id = ${eventId}::uuid FOR UPDATE`;
      const event = await tx.event.findUniqueOrThrow({ where: { id: eventId } });
      if (event.capacity === null) return [] as EventRegistration[];
      let free = event.capacity - ((await tx.eventRegistration.aggregate({ where: { eventId, status: { in: SEATED } }, _sum: { partySize: true } }))._sum.partySize ?? 0);
      const waiting = await tx.eventRegistration.findMany({ where: { eventId, status: 'WAITLISTED' }, orderBy: { createdAt: 'asc' } });
      const out: EventRegistration[] = [];
      for (const w of waiting) {
        if (w.partySize <= free) {
          out.push(await tx.eventRegistration.update({ where: { id: w.id }, data: { status: 'CONFIRMED' } }));
          free -= w.partySize;
        }
      }
      return out;
    });
    if (!promoted.length) return;
    const event = await this.prisma.event.findUniqueOrThrow({ where: { id: eventId } });
    for (const r of promoted) {
      await this.audit.record({ actorType: 'SYSTEM', action: 'event.rsvp_promoted', entityType: 'Event', entityId: eventId, summary: `${r.name} moved from the waiting list to confirmed (${r.code})` });
      if (r.email) await this.emailRegistration(event, r, null, 'promoted');
    }
  }

  /** A calendar file for the event (Kampala time stored as UTC). */
  ics(e: Event, extra: { code?: string } = {}) {
    const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    const fold = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
    const end = e.endsAt ?? new Date(e.startsAt.getTime() + 3 * 3600_000);
    const url = `${env.WEB_URL}/events/${e.slug}`;
    return [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Reberon Hotel//Events//EN',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      'BEGIN:VEVENT',
      `UID:${e.id}${extra.code ? `-${extra.code}` : ''}@reberonhotel.com`,
      `DTSTAMP:${stamp(new Date())}`,
      `DTSTART:${stamp(e.startsAt)}`,
      `DTEND:${stamp(end)}`,
      `SUMMARY:${fold(t(lt(e.title)))}`,
      `DESCRIPTION:${fold(`${e.summary ? `${t(lt(e.summary))}\n\n` : ''}${extra.code ? `Your booking: ${extra.code}\n` : ''}${url}`)}`,
      `LOCATION:${fold([e.venue ?? 'Reberon Hotel', e.venueDetail ?? 'Kapchorwa, Uganda'].join(', '))}`,
      `URL:${url}`,
      e.status === 'CANCELLED' ? 'STATUS:CANCELLED' : 'STATUS:CONFIRMED',
      'END:VEVENT',
      'END:VCALENDAR',
      '',
    ].join('\r\n');
  }

  async publicIcs(slug: string) {
    const e = await this.prisma.event.findFirst({ where: { slug, status: { in: ['PUBLISHED', 'CANCELLED'] }, deletedAt: null } });
    if (!e) throw notFound('Event');
    return { filename: `${e.slug}.ics`, body: this.ics(e) };
  }

  private async emailRegistration(e: Event, r: EventRegistration, manageUrl: string | null, kind: 'confirmed' | 'waitlisted' | 'promoted' | 'event_cancelled' | 'cancelled_by_hotel') {
    if (!r.email) return;
    const title = t(lt(e.title));
    const first = r.name.split(' ')[0];
    const places = `${r.partySize} place${r.partySize > 1 ? 's' : ''}`;
    const price = e.priceMinor && e.currency ? `${formatMoney(e.priceMinor * BigInt(r.partySize), e.currency as Currency)} (${formatMoney(e.priceMinor, e.currency as Currency)} per person, paid at the event)` : 'Free';
    const facts: [string, string][] = [
      ['Event', title],
      ['When', whenText(e.startsAt, e.endsAt)],
      ['Where', [e.venue ?? 'Reberon Hotel', e.venueDetail].filter(Boolean).join(' — ')],
      ['Places', places],
      ['Reference', r.code],
      ...(kind === 'confirmed' || kind === 'promoted' ? ([['Price', price]] as [string, string][]) : []),
    ];
    const copy = {
      confirmed: { subject: `You're booked: ${title}`, heading: 'See you there', paras: [`Hello ${first},`, `Your ${places} for ${title} ${r.partySize > 1 ? 'are' : 'is'} confirmed. The calendar invite is attached.`, 'If your plans change, please give your places back with the button below so someone on the waiting list can come.'] },
      waitlisted: { subject: `On the waiting list: ${title}`, heading: 'You are on the waiting list', paras: [`Hello ${first},`, `${title} is full right now, so we have put your ${places} on the waiting list. If places free up, we confirm them in the order people joined and email you straight away.`] },
      promoted: { subject: `Good news — you're in: ${title}`, heading: 'A place opened up', paras: [`Hello ${first},`, `Places freed up and your ${places} for ${title} ${r.partySize > 1 ? 'are' : 'is'} now confirmed. The calendar invite is attached.`] },
      event_cancelled: { subject: `Cancelled: ${title}`, heading: 'This event is cancelled', paras: [`Hello ${first},`, `We are sorry — ${title} will not go ahead as planned. Your booking ${r.code} is cancelled; there is nothing you need to do.`, 'We hope to welcome you to another evening at Reberon soon.'] },
      cancelled_by_hotel: { subject: `Your booking for ${title} was cancelled`, heading: 'Booking cancelled', paras: [`Hello ${first},`, `Your booking ${r.code} for ${title} has been cancelled by the hotel. If this is a surprise, just reply to this email.`] },
    }[kind];
    await this.notifications.email({
      to: r.email,
      subject: copy.subject,
      heading: copy.heading,
      paragraphs: copy.paras,
      facts,
      action: manageUrl && (kind === 'confirmed' || kind === 'waitlisted') ? { label: 'Manage my booking', url: manageUrl } : { label: 'See the event', url: `${env.WEB_URL}/events/${e.slug}` },
      attachments: kind === 'confirmed' || kind === 'promoted' ? [{ filename: `${e.slug}.ics`, content: this.ics(e, { code: r.code }), contentType: 'text/calendar; charset=utf-8; method=PUBLISH' }] : undefined,
    });
  }

  /* ───────────────────────── House ───────────────────────── */

  async adminList(): Promise<EventAdminRowDTO[]> {
    const rows = await this.prisma.event.findMany({ where: { deletedAt: null }, orderBy: { startsAt: 'desc' } });
    const cards = await this.cards(rows);
    const counts = await this.prisma.eventRegistration.groupBy({ by: ['eventId', 'status'], where: { eventId: { in: rows.map((r) => r.id) } }, _sum: { partySize: true }, _count: true });
    return cards.map((c) => {
      const mine = counts.filter((x) => x.eventId === c.id);
      return {
        ...c,
        confirmedSeats: mine.filter((x) => SEATED.includes(x.status)).reduce((n, x) => n + (x._sum.partySize ?? 0), 0),
        waitlistedSeats: mine.filter((x) => x.status === 'WAITLISTED').reduce((n, x) => n + (x._sum.partySize ?? 0), 0),
        registrations: mine.filter((x) => x.status !== 'CANCELLED').reduce((n, x) => n + x._count, 0),
      };
    });
  }

  /** Form-shaped for the House editor (times in Kampala, money as strings). */
  async adminGet(id: string) {
    const e = await this.prisma.event.findFirst({ where: { id, deletedAt: null } });
    if (!e) throw notFound('Event');
    const media = await this.resolver.mediaMap([...(e.coverId ? [e.coverId] : []), ...e.galleryIds]);
    const [card] = await this.cards([e]);
    return {
      ...e,
      startsAt: toKampalaInput(e.startsAt),
      endsAt: toKampalaInput(e.endsAt),
      rsvpClosesAt: toKampalaInput(e.rsvpClosesAt),
      priceMinor: e.priceMinor?.toString() ?? null,
      cover: e.coverId ? (media.get(e.coverId) ?? null) : null,
      gallery: pick(media, e.galleryIds),
      seatsLeft: card!.seatsLeft,
    };
  }

  private data(body: Partial<z.infer<typeof zEventInput>>): Prisma.EventUncheckedUpdateInput {
    const { startsAt, endsAt, rsvpClosesAt, priceMinor, seo, slug: _s, ...rest } = body;
    const d: Prisma.EventUncheckedUpdateInput = { ...rest } as Prisma.EventUncheckedUpdateInput;
    if (startsAt !== undefined) d.startsAt = kampalaToDate(startsAt);
    if (endsAt !== undefined) d.endsAt = endsAt ? kampalaToDate(endsAt) : null;
    if (rsvpClosesAt !== undefined) d.rsvpClosesAt = rsvpClosesAt ? kampalaToDate(rsvpClosesAt) : null;
    if (priceMinor !== undefined) d.priceMinor = priceMinor && priceMinor !== '0' ? BigInt(priceMinor) : null;
    if (seo !== undefined) d.seo = seo as Prisma.InputJsonValue;
    if (body.summary === null) d.summary = Prisma.JsonNull;
    if (body.body === null) d.body = Prisma.JsonNull;
    if (body.priceNote === null) d.priceNote = Prisma.JsonNull;
    if (d.priceMinor === null) d.currency = null;
    return d;
  }

  private check(startsAt: Date, endsAt: Date | null | undefined) {
    if (Number.isNaN(startsAt.getTime())) throw badRequest('The start time is not a time', [{ path: 'startsAt', message: 'Not a time' }]);
    if (endsAt && endsAt <= startsAt) throw badRequest('The end is before the start', [{ path: 'endsAt', message: 'Must be after the start' }]);
  }

  async create(body: z.infer<typeof zEventInput>, actor: AuthUser) {
    let slug = body.slug ?? slugify(body.title.en ?? Object.values(body.title)[0] ?? 'event');
    if (slug === 'rsvp') slug = 'rsvp-event';
    if (await this.prisma.event.findUnique({ where: { slug } })) slug = `${slug}-${body.startsAt.slice(0, 10)}`;
    if (await this.prisma.event.findUnique({ where: { slug } })) slug = `${slug}-${randomBytes(2).toString('hex')}`;
    const d = this.data(body) as Prisma.EventUncheckedCreateInput;
    this.check(d.startsAt as Date, d.endsAt as Date | null);
    const e = await this.prisma.event.create({ data: { ...d, slug } });
    await this.audit.record({ actor, action: 'event.create', entityType: 'Event', entityId: e.id, summary: `Created event "${t(lt(e.title))}" (${e.status.toLowerCase()})` });
    await this.changed();
    return this.adminGet(e.id);
  }

  async update(id: string, body: Partial<z.infer<typeof zEventInput>>, actor: AuthUser) {
    const before = await this.prisma.event.findFirst({ where: { id, deletedAt: null } });
    if (!before) throw notFound('Event');
    const d = this.data(body);
    if (body.slug === 'rsvp') throw badRequest('That address is used by the events pages — choose another', [{ path: 'slug', message: 'Reserved' }]);
    if (body.slug && body.slug !== before.slug) {
      if (await this.prisma.event.findFirst({ where: { slug: body.slug, id: { not: id } } })) throw conflict('Another event already uses that address');
      d.slug = body.slug;
    }
    this.check((d.startsAt as Date | undefined) ?? before.startsAt, d.endsAt === undefined ? before.endsAt : (d.endsAt as Date | null));
    if (body.capacity !== undefined && body.capacity !== null) {
      const taken = (await this.seatsTaken([id])).get(id) ?? 0;
      if (body.capacity < taken) throw badRequest(`${taken} places are already booked — the limit cannot go below that`, [{ path: 'capacity', message: `At least ${taken}` }]);
    }
    const e = await this.prisma.event.update({ where: { id }, data: d });
    await this.audit.record({ actor, action: 'event.update', entityType: 'Event', entityId: id, summary: `Updated event "${t(lt(e.title))}"${before.status !== e.status ? ` (${before.status.toLowerCase()} → ${e.status.toLowerCase()})` : ''}` });
    // Cancelled: tell everyone who booked.
    if (before.status !== 'CANCELLED' && e.status === 'CANCELLED') {
      const regs = await this.prisma.eventRegistration.findMany({ where: { eventId: id, status: { in: ['CONFIRMED', 'WAITLISTED'] } } });
      for (const r of regs) await this.emailRegistration(e, r, null, 'event_cancelled');
      await this.prisma.eventRegistration.updateMany({ where: { eventId: id, status: { in: ['CONFIRMED', 'WAITLISTED'] } }, data: { status: 'CANCELLED', cancelledAt: new Date() } });
    }
    // More room (capacity raised): confirm waiting guests that now fit.
    if (body.capacity !== undefined && (before.capacity === null || (e.capacity ?? Infinity) > before.capacity)) await this.promoteWaitlist(id);
    await this.cache.bust([`event:${before.slug}`, `event:${e.slug}`, 'events']);
    await this.changed();
    return this.adminGet(id);
  }

  async remove(id: string, actor: AuthUser) {
    const e = await this.prisma.event.findFirst({ where: { id, deletedAt: null } });
    if (!e) throw notFound('Event');
    const booked = await this.prisma.eventRegistration.count({ where: { eventId: id, status: { in: ['CONFIRMED', 'WAITLISTED'] } } });
    if (booked && e.startsAt > new Date()) throw badRequest(`${booked} booking${booked > 1 ? 's are' : ' is'} still live. Cancel the event first (guests are emailed), then delete it.`);
    await this.prisma.event.update({ where: { id }, data: { deletedAt: new Date(), slug: `${e.slug}--deleted-${Date.now()}` } });
    await this.audit.record({ actor, action: 'event.delete', entityType: 'Event', entityId: id, summary: `Deleted event "${t(lt(e.title))}"` });
    await this.cache.bust([`event:${e.slug}`, 'events']);
    await this.changed();
  }

  private regDTO(r: EventRegistration): EventRegistrationDTO {
    return { id: r.id, code: r.code, name: r.name, email: r.email, phone: r.phone, partySize: r.partySize, notes: r.notes, status: r.status, source: r.source, checkedInAt: r.checkedInAt?.toISOString() ?? null, createdAt: r.createdAt.toISOString() };
  }

  async registrations(eventId: string) {
    const e = await this.prisma.event.findFirst({ where: { id: eventId, deletedAt: null } });
    if (!e) throw notFound('Event');
    const rows = await this.prisma.eventRegistration.findMany({ where: { eventId }, orderBy: [{ status: 'asc' }, { createdAt: 'asc' }] });
    const [card] = await this.cards([e]);
    return { event: card!, registrations: rows.map((r) => this.regDTO(r)) };
  }

  /** Added at the desk or by phone. The House may go over the limit on purpose (`force`). */
  async addRegistration(eventId: string, body: z.infer<typeof zRegistrationAdminInput>, force: boolean, actor: AuthUser) {
    const e = await this.prisma.event.findFirst({ where: { id: eventId, deletedAt: null } });
    if (!e) throw notFound('Event');
    if (e.status === 'CANCELLED') throw badRequest('This event is cancelled');
    const taken = (await this.seatsTaken([eventId])).get(eventId) ?? 0;
    const fits = e.capacity === null || taken + body.partySize <= e.capacity;
    if (!fits && !force) throw conflict(`Only ${Math.max(0, (e.capacity ?? 0) - taken)} place(s) left. Add them to the waiting list, or confirm over the limit.`);
    const r = await this.prisma.eventRegistration.create({
      data: { eventId, code: referenceCode('EV', 5), name: body.name, email: body.email ?? null, phone: body.phone ?? null, partySize: body.partySize, notes: body.notes ?? null, status: 'CONFIRMED', manageTokenHash: hash(randomBytes(24).toString('base64url')), source: 'house' },
    });
    await this.audit.record({ actor, action: 'event.registration_add', entityType: 'Event', entityId: eventId, summary: `Added ${r.name} (${r.partySize}) to "${t(lt(e.title))}"${fits ? '' : ' over the limit'}` });
    if (r.email) await this.emailRegistration(e, r, null, 'confirmed');
    await this.cache.bust([`event:${e.slug}`, 'events']);
    await this.changed();
    return this.regDTO(r);
  }

  async setRegistrationStatus(regId: string, status: EventRegistration['status'], actor: AuthUser) {
    const r = await this.prisma.eventRegistration.findUnique({ where: { id: regId }, include: { event: true } });
    if (!r) throw notFound('Booking');
    if (r.status === status) return this.regDTO(r);
    if (status === 'CONFIRMED' && r.status === 'WAITLISTED' && r.event.capacity !== null) {
      const taken = (await this.seatsTaken([r.eventId])).get(r.eventId) ?? 0;
      if (taken + r.partySize > r.event.capacity && !has(actor, 'records:delete')) throw conflict('Not enough places left. A manager can confirm over the limit.');
    }
    const u = await this.prisma.eventRegistration.update({
      where: { id: regId },
      data: { status, checkedInAt: status === 'ATTENDED' ? new Date() : status === 'CONFIRMED' ? null : r.checkedInAt, cancelledAt: status === 'CANCELLED' ? new Date() : null },
    });
    const word = { CONFIRMED: r.status === 'ATTENDED' ? 'undid check-in for' : 'confirmed', WAITLISTED: 'moved to the waiting list', CANCELLED: 'cancelled', ATTENDED: 'checked in' }[status];
    await this.audit.record({ actor, action: status === 'ATTENDED' ? 'event.check_in' : 'event.registration_status', entityType: 'Event', entityId: r.eventId, summary: `${word} ${r.name} (${r.code})` });
    if (status === 'CANCELLED' && r.email && r.event.startsAt > new Date()) await this.emailRegistration(r.event, u, null, 'cancelled_by_hotel');
    if (status === 'CONFIRMED' && r.status === 'WAITLISTED' && r.email) await this.emailRegistration(r.event, u, null, 'promoted');
    if (status === 'CANCELLED' && SEATED.includes(r.status)) await this.promoteWaitlist(r.eventId);
    await this.cache.bust([`event:${r.event.slug}`, 'events']);
    await this.changed();
    return this.regDTO(u);
  }

  async csv(eventId: string, actor: AuthUser) {
    if (!has(actor, 'events:manage')) throw forbidden();
    const { event, registrations } = await this.registrations(eventId);
    const q = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lines = [['Reference', 'Name', 'Email', 'Phone', 'People', 'Status', 'Checked in', 'Notes', 'Booked'].join(','), ...registrations.map((r) => [r.code, r.name, r.email, r.phone, r.partySize, r.status, r.checkedInAt ?? '', r.notes, r.createdAt].map(q).join(','))];
    await this.audit.record({ actor, action: 'event.export', entityType: 'Event', entityId: eventId, summary: `Exported the guest list of "${t(event.title)}" (${registrations.length})` });
    return { filename: `${event.slug}-guests.csv`, body: `\uFEFF${lines.join('\r\n')}\r\n` };
  }
}
