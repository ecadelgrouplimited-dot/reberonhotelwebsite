import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { Request } from 'express';
import type { z } from 'zod';
import type { ConversationSummaryDTO, ContactDTO, ConversationDetailDTO, WaitlistEntryDTO, zEnquiryInput, zWaitlistInput, zManualConversationInput } from '@reberon/contracts';
import { normalizePhone, referenceCode, whatsappLink } from '@reberon/utils';
import type { Contact, Conversation, Message, Prisma, User, WaitlistEntry, RoomType } from '@reberon/db';
import { PrismaService } from '../../common/prisma.service.js';
import { AuditService } from '../../common/audit.service.js';
import { badRequest, notFound } from '../../common/errors.js';
import { Events } from '../../common/events.js';
import type { AuthUser } from '../../common/auth.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { lt } from '../content/mappers.js';

type ConvRow = Conversation & {
  contact: Contact;
  assignee: Pick<User, 'id' | 'name'> | null;
  messages: Message[];
  _count: { messages: number };
  reads?: { readAt: Date }[];
};

export const toContact = (c: Contact): ContactDTO => ({
  id: c.id, name: c.name, phone: c.phone, email: c.email, country: c.country, source: c.source, whatsappOptIn: c.whatsappOptIn,
});

export function toWaitlist(w: WaitlistEntry & { contact: Contact; roomType: RoomType | null }): WaitlistEntryDTO {
  return {
    id: w.id,
    reference: w.reference,
    contact: toContact(w.contact),
    roomType: w.roomType ? { id: w.roomType.id, name: lt(w.roomType.name) } : null,
    preferredFrom: w.preferredFrom?.toISOString().slice(0, 10) ?? null,
    preferredTo: w.preferredTo?.toISOString().slice(0, 10) ?? null,
    flexibleDates: w.flexibleDates,
    adults: w.adults,
    children: w.children,
    note: w.note,
    staffNotes: w.staffNotes,
    status: w.status,
    priority: w.priority,
    createdAt: w.createdAt.toISOString(),
  };
}

@Injectable()
export class InboxService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly events: EventEmitter2,
    private readonly notifications: NotificationsService,
  ) {}

  summary(c: ConvRow): ConversationSummaryDTO {
    const last = c.messages[0];
    return {
      id: c.id,
      reference: c.reference,
      channel: c.channel,
      intent: c.intent,
      status: c.status,
      subject: c.subject,
      preview: (last?.body ?? '').slice(0, 160),
      contact: toContact(c.contact),
      assignee: c.assignee,
      lastMessageAt: c.lastMessageAt.toISOString(),
      createdAt: c.createdAt.toISOString(),
      messageCount: c._count.messages,
      unread: c.reads ? !c.reads[0] || c.reads[0].readAt < c.lastMessageAt : false,
    };
  }

  include(userId?: string) {
    return {
      contact: true,
      assignee: { select: { id: true, name: true } },
      messages: { orderBy: { createdAt: 'desc' as const }, take: 1, where: { direction: { not: 'NOTE' as const } } },
      _count: { select: { messages: true } },
      ...(userId ? { reads: { where: { userId }, select: { readAt: true } } } : {}),
    };
  }

  /** Find or create the contact, matching on phone first, then email. */
  private async upsertContact(tx: Prisma.TransactionClient, name: string, phone: string | null, email: string | null, source: Contact['source']) {
    const existing =
      (phone && (await tx.contact.findFirst({ where: { phone }, orderBy: { createdAt: 'desc' } }))) ||
      (email && (await tx.contact.findFirst({ where: { email }, orderBy: { createdAt: 'desc' } }))) ||
      null;
    if (existing) {
      return tx.contact.update({ where: { id: existing.id }, data: { name, phone: phone ?? existing.phone, email: email ?? existing.email } });
    }
    return tx.contact.create({ data: { name, phone, email, source, whatsappOptIn: !!phone } });
  }

  private phone(raw?: string | null) {
    if (!raw) return null;
    const n = normalizePhone(raw);
    if (!n) throw badRequest('That phone number does not look right', [{ path: 'phone', message: 'Check the number, including the country code if not Ugandan' }]);
    return n;
  }

  async createEnquiry(input: z.infer<typeof zEnquiryInput>) {
    const phone = this.phone(input.phone);
    const email = input.email?.toLowerCase() ?? null;
    const room = input.roomTypeSlug ? await this.prisma.roomType.findUnique({ where: { slug: input.roomTypeSlug }, select: { id: true, name: true } }) : null;
    const reference = referenceCode('EQ');
    const conv = await this.prisma.$transaction(async (tx) => {
      const contact = await this.upsertContact(tx, input.name, phone, email, 'WEB');
      return tx.conversation.create({
        data: {
          reference,
          contactId: contact.id,
          channel: 'WEB_FORM',
          intent: input.intent,
          subject: input.message.split(/[.?!\n]/)[0]!.slice(0, 80),
          context: {
            pagePath: input.pagePath,
            arrival: input.arrival,
            departure: input.departure,
            adults: input.adults,
            children: input.children,
            roomTypeId: room?.id,
            roomTypeName: room ? lt(room.name).en : undefined,
          } as Prisma.InputJsonObject,
          messages: { create: { direction: 'INBOUND', body: input.message } },
        },
      });
    });
    await this.audit.record({ actorType: 'GUEST', action: 'enquiry.create', entityType: 'Conversation', entityId: conv.id, summary: `Web enquiry ${reference} from ${input.name}` });
    this.events.emit(Events.EnquiryCreated, { conversationId: conv.id });
    return { reference };
  }

  async createWaitlist(input: z.infer<typeof zWaitlistInput>) {
    const phone = this.phone(input.phone)!;
    const email = input.email?.toLowerCase() ?? null;
    const room = input.roomTypeSlug ? await this.prisma.roomType.findUnique({ where: { slug: input.roomTypeSlug }, select: { id: true } }) : null;
    const reference = referenceCode('WL');
    const entry = await this.prisma.$transaction(async (tx) => {
      const contact = await this.upsertContact(tx, input.name, phone, email, 'WEB');
      return tx.waitlistEntry.create({
        data: {
          reference,
          contactId: contact.id,
          roomTypeId: room?.id,
          preferredFrom: input.preferredFrom ? new Date(`${input.preferredFrom}T00:00:00Z`) : null,
          preferredTo: input.preferredTo ? new Date(`${input.preferredTo}T00:00:00Z`) : null,
          flexibleDates: input.flexibleDates,
          adults: input.adults,
          children: input.children,
          note: input.note,
        },
      });
    });
    await this.audit.record({ actorType: 'GUEST', action: 'waitlist.create', entityType: 'WaitlistEntry', entityId: entry.id, summary: `First-stay request ${reference} from ${input.name}` });
    this.events.emit(Events.WaitlistCreated, { entryId: entry.id });
    return { reference };
  }

  async list(user: AuthUser, q: { status?: string; channel?: string; assignee?: string; q?: string; cursor?: string; limit: number }) {
    const where: Prisma.ConversationWhereInput = {};
    if (q.status === 'active') where.status = { in: ['NEW', 'OPEN', 'WAITING_GUEST'] };
    else if (q.status) where.status = q.status as Conversation['status'];
    else where.status = { not: 'SPAM' };
    if (q.channel) where.channel = q.channel as Conversation['channel'];
    if (q.assignee === 'me') where.assigneeId = user.id;
    else if (q.assignee === 'none') where.assigneeId = null;
    if (q.q) {
      where.OR = [
        { reference: { contains: q.q, mode: 'insensitive' } },
        { subject: { contains: q.q, mode: 'insensitive' } },
        { contact: { name: { contains: q.q, mode: 'insensitive' } } },
        { contact: { phone: { contains: q.q.replace(/\s/g, '') } } },
        { contact: { email: { contains: q.q, mode: 'insensitive' } } },
      ];
    }
    const skip = Number(q.cursor) || 0;
    const [rows, total, counts] = await Promise.all([
      this.prisma.conversation.findMany({ where, include: this.include(user.id), orderBy: { lastMessageAt: 'desc' }, skip, take: q.limit }),
      this.prisma.conversation.count({ where }),
      this.prisma.conversation.groupBy({ by: ['status'], _count: true }),
    ]);
    return {
      data: rows.map((r) => this.summary(r)),
      nextCursor: skip + q.limit < total ? String(skip + q.limit) : null,
      total,
      counts: Object.fromEntries(counts.map((c) => [c.status, c._count])),
    };
  }

  async get(id: string, user: AuthUser): Promise<ConversationDetailDTO> {
    const c = await this.prisma.conversation.findUnique({ where: { id }, include: this.include(user.id) });
    if (!c) throw notFound('Conversation');
    const messages = await this.prisma.message.findMany({ where: { conversationId: id }, orderBy: { createdAt: 'asc' }, include: { author: { select: { id: true, name: true } } } });
    await this.prisma.conversationRead.upsert({
      where: { conversationId_userId: { conversationId: id, userId: user.id } },
      create: { conversationId: id, userId: user.id },
      update: { readAt: new Date() },
    });
    if (c.status === 'NEW') await this.prisma.conversation.update({ where: { id }, data: { status: 'OPEN' } });
    return {
      ...this.summary({ ...c, reads: [{ readAt: new Date() }] }),
      status: c.status === 'NEW' ? 'OPEN' : c.status,
      context: c.context as Record<string, unknown>,
      messages: messages.map((m) => ({ id: m.id, direction: m.direction, body: m.body, author: m.author, createdAt: m.createdAt.toISOString() })),
    };
  }

  async update(id: string, patch: { status?: Conversation['status']; intent?: Conversation['intent']; assigneeId?: string | null }, user: AuthUser, req: Request) {
    const before = await this.prisma.conversation.findUnique({ where: { id } });
    if (!before) throw notFound('Conversation');
    await this.prisma.conversation.update({ where: { id }, data: patch });
    const bits = [patch.status && `status → ${patch.status}`, patch.assigneeId !== undefined && `assignee changed`, patch.intent && `intent → ${patch.intent}`].filter(Boolean);
    await this.audit.record({ actor: user, action: 'conversation.update', entityType: 'Conversation', entityId: id, summary: `${before.reference}: ${bits.join(', ')}`, before: { status: before.status, assigneeId: before.assigneeId }, after: patch, req });
    return this.get(id, user);
  }

  async reply(id: string, body: string, kind: 'REPLY' | 'NOTE', user: AuthUser, req: Request) {
    const c = await this.prisma.conversation.findUnique({ where: { id }, include: { contact: true } });
    if (!c) throw notFound('Conversation');
    let waUrl: string | undefined;
    let delivery: string | undefined;
    if (kind === 'REPLY') {
      if ((c.channel === 'WEB_FORM' || c.channel === 'EMAIL') && c.contact.email) {
        await this.notifications.email({
          to: c.contact.email,
          subject: `Re: your message to Reberon Hotel (${c.reference})`,
          heading: `Hello ${c.contact.name.split(' ')[0]},`,
          paragraphs: body.split(/\n{2,}/),
          footnote: `${user.name}, Reberon Hotel. Reply to this email or quote ${c.reference}.`,
        });
        delivery = 'email';
      } else if (c.contact.phone) {
        // Until the WhatsApp Cloud API is connected, staff send from their phone.
        waUrl = whatsappLink(c.contact.phone, body);
        delivery = 'whatsapp-link';
      }
    }
    const message = await this.prisma.$transaction(async (tx) => {
      const m = await tx.message.create({ data: { conversationId: id, direction: kind === 'NOTE' ? 'NOTE' : 'OUTBOUND', body, authorId: user.id, deliveryStatus: delivery } });
      await tx.conversation.update({
        where: { id },
        data: {
          ...(kind === 'REPLY' ? { lastMessageAt: new Date(), status: c.status === 'DONE' ? 'DONE' : 'WAITING_GUEST' } : {}),
          assigneeId: c.assigneeId ?? user.id,
        },
      });
      await this.audit.record({ actor: user, action: kind === 'NOTE' ? 'message.note' : 'message.create', entityType: 'Conversation', entityId: id, summary: `${kind === 'NOTE' ? 'Note on' : 'Replied on'} ${c.reference}`, req }, tx);
      return m;
    });
    return { message: { id: message.id, direction: message.direction, body: message.body, author: { id: user.id, name: user.name }, createdAt: message.createdAt.toISOString() }, waUrl, delivery };
  }

  async manual(input: z.infer<typeof zManualConversationInput>, user: AuthUser, req: Request) {
    const phone = this.phone(input.phone);
    const reference = referenceCode('EQ');
    const conv = await this.prisma.$transaction(async (tx) => {
      const contact = await this.upsertContact(tx, input.name, phone, input.email?.toLowerCase() ?? null, input.channel === 'WHATSAPP' ? 'WHATSAPP' : input.channel === 'PHONE' ? 'PHONE' : 'EMAIL');
      const created = await tx.conversation.create({
        data: {
          reference,
          contactId: contact.id,
          channel: input.channel,
          intent: input.intent,
          status: 'OPEN',
          assigneeId: user.id,
          subject: input.message.split(/[.?!\n]/)[0]!.slice(0, 80),
          messages: { create: { direction: 'INBOUND', body: input.message } },
        },
      });
      await this.audit.record({ actor: user, action: 'conversation.create', entityType: 'Conversation', entityId: created.id, summary: `Logged ${input.channel.toLowerCase()} conversation ${reference}`, req }, tx);
      return created;
    });
    return this.get(conv.id, user);
  }

  async toWaitlist(id: string, user: AuthUser, req: Request) {
    const c = await this.prisma.conversation.findUnique({ where: { id }, include: { contact: true } });
    if (!c) throw notFound('Conversation');
    const ctx = c.context as Record<string, string | number | undefined>;
    const entry = await this.prisma.waitlistEntry.create({
      data: {
        reference: referenceCode('WL'),
        contactId: c.contactId,
        roomTypeId: typeof ctx.roomTypeId === 'string' ? ctx.roomTypeId : undefined,
        preferredFrom: ctx.arrival ? new Date(`${ctx.arrival}T00:00:00Z`) : undefined,
        preferredTo: ctx.departure ? new Date(`${ctx.departure}T00:00:00Z`) : undefined,
        adults: Number(ctx.adults) || 2,
        children: Number(ctx.children) || 0,
        note: `From enquiry ${c.reference}`,
        status: 'CONTACTED',
      },
    });
    await this.prisma.conversation.update({ where: { id }, data: { intent: 'WAITLIST' } });
    await this.audit.record({ actor: user, action: 'waitlist.create', entityType: 'WaitlistEntry', entityId: entry.id, summary: `Added ${c.contact.name} to the first-stay list from ${c.reference}`, req });
    return { waitlistId: entry.id, reference: entry.reference };
  }

  async deleteConversation(id: string, user: AuthUser, req?: Request) {
    const existing = await this.prisma.conversation.findUnique({
      where: { id },
      include: { contact: { select: { id: true, name: true } } },
    });
    if (!existing) throw notFound('Conversation');

    await this.prisma.conversation.delete({ where: { id } });

    await this.audit.record({
      actor: user,
      action: 'conversation.delete',
      entityType: 'Conversation',
      entityId: id,
      summary: `Deleted conversation ${existing.reference} from ${existing.contact?.name ?? 'unknown'}`,
      req,
    });

    return { ok: true, deleted: true };
  }

  async deleteMessage(conversationId: string, messageId: string, user: AuthUser, req?: Request) {
    const conversation = await this.prisma.conversation.findUnique({ where: { id: conversationId } });
    if (!conversation) throw notFound('Conversation');

    const message = await this.prisma.message.findFirst({
      where: { id: messageId, conversationId },
    });
    if (!message) throw notFound('Message');

    await this.prisma.message.delete({ where: { id: messageId } });

    const latestMessage = await this.prisma.message.findFirst({
      where: { conversationId },
      orderBy: { createdAt: 'desc' },
    });
    if (latestMessage) {
      await this.prisma.conversation.update({
        where: { id: conversationId },
        data: { lastMessageAt: latestMessage.createdAt },
      });
    }

    await this.audit.record({
      actor: user,
      action: 'message.delete',
      entityType: 'Conversation',
      entityId: conversationId,
      summary: `Deleted message from conversation ${conversation.reference}`,
      req,
    });

    return { ok: true, deleted: true };
  }

  async clearSpam(user: AuthUser, req?: Request) {
    const spamConvs = await this.prisma.conversation.findMany({
      where: { status: 'SPAM' },
      select: { id: true },
    });

    if (spamConvs.length === 0) {
      return { ok: true, count: 0 };
    }

    const ids = spamConvs.map((c) => c.id);
    await this.prisma.$transaction(async (tx) => {
      await tx.message.deleteMany({ where: { conversationId: { in: ids } } });
      await tx.conversationRead.deleteMany({ where: { conversationId: { in: ids } } });
      await tx.conversation.deleteMany({ where: { id: { in: ids } } });
    });

    await this.audit.record({
      actor: user,
      action: 'conversation.clear_spam',
      entityType: 'Conversation',
      summary: `Cleared ${ids.length} spam conversation(s)`,
      req,
    });

    return { ok: true, count: ids.length };
  }
}
