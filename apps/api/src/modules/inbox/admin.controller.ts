import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import type { z } from 'zod';
import { zConversationPatch, zMessageCreate, zManualConversationInput, zWaitlistPatch, t, type DashboardDTO, type AdminPulseDTO } from '@reberon/contracts';
import { hotelToday, addDays } from '@reberon/utils';
import type { Prisma, WaitlistEntry } from '@reberon/db';
import { PrismaService } from '../../common/prisma.service.js';
import { AuditService } from '../../common/audit.service.js';
import { CurrentUser, Requires, has, type AuthUser } from '../../common/auth.js';
import { ZodPipe } from '../../common/zod.pipe.js';
import { forbidden, notFound } from '../../common/errors.js';
import { lt } from '../content/mappers.js';
import { InboxService, toWaitlist } from './inbox.service.js';
import { EmailIngestionService } from './email-ingestion.service.js';

@Controller('v1/admin/conversations')
export class ConversationsController {
  constructor(
    private readonly inbox: InboxService,
    private readonly ingestion: EmailIngestionService,
  ) {}

  @Post('sync-email')
  @HttpCode(200)
  @Requires('inbox:write')
  syncEmail(@CurrentUser() user: AuthUser) {
    return this.ingestion.syncEmails(user);
  }

  @Get()
  @Requires('inbox:read')
  list(@CurrentUser() user: AuthUser, @Query() q: Record<string, string>) {
    return this.inbox.list(user, { ...q, limit: Math.min(100, Number(q.limit) || 40) });
  }

  @Get(':id')
  @Requires('inbox:read')
  get(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.inbox.get(id, user);
  }

  @Patch(':id')
  @Requires('inbox:write')
  update(@Param('id') id: string, @Body(new ZodPipe(zConversationPatch)) body: z.infer<typeof zConversationPatch>, @CurrentUser() user: AuthUser, @Req() req: Request) {
    return this.inbox.update(id, body, user, req);
  }

  @Post(':id/messages')
  @Requires('inbox:write')
  reply(@Param('id') id: string, @Body(new ZodPipe(zMessageCreate)) body: z.infer<typeof zMessageCreate>, @CurrentUser() user: AuthUser, @Req() req: Request) {
    return this.inbox.reply(id, body.body, body.kind, user, req);
  }

  @Post(':id/waitlist')
  @Requires('waitlist:write')
  toWaitlist(@Param('id') id: string, @CurrentUser() user: AuthUser, @Req() req: Request) {
    return this.inbox.toWaitlist(id, user, req);
  }

  @Post()
  @Requires('inbox:write')
  manual(@Body(new ZodPipe(zManualConversationInput)) body: z.infer<typeof zManualConversationInput>, @CurrentUser() user: AuthUser, @Req() req: Request) {
    return this.inbox.manual(body, user, req);
  }
}

const waitlistInclude = { contact: true, roomType: true } as const;

@Controller('v1/admin/waitlist')
export class WaitlistController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private where(q: Record<string, string>): Prisma.WaitlistEntryWhereInput {
    const where: Prisma.WaitlistEntryWhereInput = {};
    if (q.status) where.status = q.status as WaitlistEntry['status'];
    if (q.roomTypeId) where.roomTypeId = q.roomTypeId === 'none' ? null : q.roomTypeId;
    if (q.month) {
      const from = new Date(`${q.month}-01T00:00:00Z`);
      const to = new Date(from);
      to.setUTCMonth(to.getUTCMonth() + 1);
      where.preferredFrom = { gte: from, lt: to };
    }
    if (q.q) where.OR = [{ reference: { contains: q.q, mode: 'insensitive' } }, { contact: { name: { contains: q.q, mode: 'insensitive' } } }, { contact: { phone: { contains: q.q.replace(/\s/g, '') } } }];
    return where;
  }

  @Get()
  @Requires('waitlist:read')
  async list(@Query() q: Record<string, string>) {
    const where = this.where(q);
    const sort = q.sort === 'dates' ? [{ preferredFrom: 'asc' as const }] : [{ priority: 'desc' as const }, { createdAt: 'asc' as const }];
    const [rows, total, byStatus] = await Promise.all([
      this.prisma.waitlistEntry.findMany({ where, include: waitlistInclude, orderBy: sort, take: 500 }),
      this.prisma.waitlistEntry.count({ where }),
      this.prisma.waitlistEntry.groupBy({ by: ['status'], _count: true }),
    ]);
    return { data: rows.map(toWaitlist), total, counts: Object.fromEntries(byStatus.map((s) => [s.status, s._count])) };
  }

  @Get('export.csv')
  @Requires('waitlist:export')
  async export(@Query() q: Record<string, string>, @Res() res: Response, @CurrentUser() user: AuthUser, @Req() req: Request) {
    const rows = await this.prisma.waitlistEntry.findMany({ where: this.where(q), include: waitlistInclude, orderBy: { createdAt: 'asc' } });
    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const header = ['Reference', 'Name', 'Phone', 'Email', 'Room', 'From', 'To', 'Flexible', 'Adults', 'Children', 'Status', 'Priority', 'Note', 'Staff notes', 'Created'];
    const lines = rows.map((r) =>
      [r.reference, r.contact.name, r.contact.phone, r.contact.email, r.roomType ? t(lt(r.roomType.name)) : 'Any', r.preferredFrom?.toISOString().slice(0, 10), r.preferredTo?.toISOString().slice(0, 10), r.flexibleDates ? 'yes' : 'no', r.adults, r.children, r.status, r.priority, r.note, r.staffNotes, r.createdAt.toISOString()].map(esc).join(','),
    );
    await this.audit.record({ actor: user, action: 'waitlist.export', entityType: 'WaitlistEntry', summary: `Exported ${rows.length} waitlist rows`, req });
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="reberon-first-stay-${hotelToday()}.csv"`);
    res.send('﻿' + [header.map(esc).join(','), ...lines].join('\r\n'));
  }

  @Get(':id')
  @Requires('waitlist:read')
  async get(@Param('id') id: string) {
    const w = await this.prisma.waitlistEntry.findUnique({ where: { id }, include: waitlistInclude });
    if (!w) throw notFound('Waitlist entry');
    const history = await this.prisma.auditLog.findMany({ where: { entityType: 'WaitlistEntry', entityId: id }, include: { actor: { select: { name: true } } }, orderBy: { createdAt: 'desc' }, take: 20 });
    const conversations = await this.prisma.conversation.findMany({ where: { contactId: w.contactId }, select: { id: true, reference: true, subject: true, status: true, lastMessageAt: true }, orderBy: { lastMessageAt: 'desc' } });
    return { ...toWaitlist(w), history: history.map((h) => ({ id: h.id, summary: h.summary, actor: h.actor?.name ?? 'Guest', createdAt: h.createdAt })), conversations };
  }

  @Patch(':id')
  @Requires('waitlist:write')
  async update(@Param('id') id: string, @Body(new ZodPipe(zWaitlistPatch)) body: z.infer<typeof zWaitlistPatch>, @CurrentUser() user: AuthUser, @Req() req: Request) {
    const before = await this.prisma.waitlistEntry.findUnique({ where: { id } });
    if (!before) throw notFound('Waitlist entry');
    const w = await this.prisma.waitlistEntry.update({ where: { id }, data: body, include: waitlistInclude });
    const bits = [body.status && `status → ${body.status}`, body.priority !== undefined && `priority → ${body.priority}`, body.staffNotes !== undefined && 'notes'].filter(Boolean);
    await this.audit.record({ actor: user, action: 'waitlist.update', entityType: 'WaitlistEntry', entityId: id, summary: `${w.reference}: ${bits.join(', ')}`, before: { status: before.status, priority: before.priority }, after: body, req });
    return toWaitlist(w);
  }

  @Delete(':id')
  @HttpCode(200)
  @Requires('waitlist:write')
  async delete(@Param('id') id: string, @CurrentUser() user: AuthUser, @Req() req: Request) {
    if (user.role !== 'OWNER') throw forbidden('Only the hotel owner can delete waitlist entries');
    const existing = await this.prisma.waitlistEntry.findUnique({ where: { id } });
    if (!existing) throw notFound('Waitlist entry');
    await this.prisma.waitlistEntry.delete({ where: { id } });
    await this.audit.record({
      actor: user,
      action: 'waitlist.delete',
      entityType: 'WaitlistEntry',
      entityId: id,
      summary: `Deleted waitlist entry ${existing.reference}`,
      req,
    });
    return { ok: true, deleted: true };
  }
}

@Controller('v1/admin')
export class DashboardController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inbox: InboxService,
  ) {}

  @Get('pulse')
  async pulse(@CurrentUser() user: AuthUser): Promise<AdminPulseDTO> {
    const todayStr = hotelToday();
    const todayDate = new Date(`${todayStr}T00:00:00.000Z`);
    const next7Date = new Date(`${addDays(todayStr, 7)}T00:00:00.000Z`);
    const todayKampalaStart = new Date(`${todayStr}T00:00:00+03:00`);
    const since24h = new Date(Date.now() - 86_400_000);

    const canInbox = has(user, 'inbox:read');
    const canWaitlist = has(user, 'waitlist:read');
    const canDesk = has(user, 'desk:operate') || has(user, 'bookings:read');
    const canRooms = has(user, 'rooms:status');
    const canGuests = has(user, 'guests:read');
    const canFinance = has(user, 'reports:read') || has(user, 'receipts:read') || has(user, 'payments:record');
    const canQuotes = has(user, 'quotations:manage');
    const canPos = has(user, 'pos:operate');
    const canClub = has(user, 'healthclub:operate');
    const canInv = has(user, 'inventory:manage');
    const canReq = has(user, 'requisitions:request');
    const canContent = has(user, 'content:read');
    const canMessages = has(user, 'messages:read');

    const [
      inboxNew,
      inboxOpen,
      inbox24h,
      wlNew,
      wlContacted,
      arrivalsToday,
      arrivedToday,
      inHouseStays,
      departuresToday,
      departedToday,
      lateArrivals,
      pendingGuestReqs,
      heldRes,
      confirmedRes,
      upcoming7d,
      roomsList,
      hkTasksToday,
      feedbackRows,
      paymentsToday,
      receiptsToday,
      quotesByStatus,
      posOpen,
      posCompletedToday,
      clubInsideNow,
      clubActiveMembers,
      invItems,
      reqPending,
      reqUrgent,
      pinnedAnnouncements,
      activeStaff,
      deptsCount,
      shiftsToday,
      onLeaveToday,
      pendingLeaves,
      draftPayrolls,
      pagesList,
      failedMessages24h,
    ] = await Promise.all([
      canInbox ? this.prisma.conversation.count({ where: { status: 'NEW' } }) : Promise.resolve(0),
      canInbox ? this.prisma.conversation.count({ where: { status: { in: ['NEW', 'OPEN', 'WAITING_GUEST'] } } }) : Promise.resolve(0),
      canInbox ? this.prisma.conversation.count({ where: { createdAt: { gte: since24h }, status: { not: 'SPAM' } } }) : Promise.resolve(0),
      canWaitlist ? this.prisma.waitlistEntry.count({ where: { status: 'NEW' } }) : Promise.resolve(0),
      canWaitlist ? this.prisma.waitlistEntry.count({ where: { status: 'CONTACTED' } }) : Promise.resolve(0),
      canDesk ? this.prisma.reservation.count({ where: { arrival: todayDate, status: { in: ['CONFIRMED', 'HELD'] } } }) : Promise.resolve(0),
      canDesk ? this.prisma.reservation.count({ where: { arrival: todayDate, status: 'IN_HOUSE' } }) : Promise.resolve(0),
      canDesk ? this.prisma.reservation.findMany({ where: { status: 'IN_HOUSE' }, select: { adults: true, children: true } }) : Promise.resolve([]),
      canDesk ? this.prisma.reservation.count({ where: { departure: todayDate, status: 'IN_HOUSE' } }) : Promise.resolve(0),
      canDesk ? this.prisma.reservation.count({ where: { departure: todayDate, status: 'CHECKED_OUT' } }) : Promise.resolve(0),
      canDesk ? this.prisma.reservation.count({ where: { arrival: { lt: todayDate }, status: 'CONFIRMED' } }) : Promise.resolve(0),
      canDesk ? this.prisma.guestRequest.count({ where: { status: 'NEW' } }) : Promise.resolve(0),
      canDesk ? this.prisma.reservation.count({ where: { status: 'HELD' } }) : Promise.resolve(0),
      canDesk ? this.prisma.reservation.count({ where: { status: 'CONFIRMED' } }) : Promise.resolve(0),
      canDesk ? this.prisma.reservation.count({ where: { arrival: { gte: todayDate, lte: next7Date }, status: { in: ['CONFIRMED', 'HELD'] } } }) : Promise.resolve(0),
      canRooms ? this.prisma.room.findMany({ where: { isActive: true }, select: { hkStatus: true } }) : Promise.resolve([]),
      canRooms ? this.prisma.housekeepingTask.findMany({ where: { date: todayDate }, select: { status: true } }) : Promise.resolve([]),
      canGuests ? this.prisma.feedback.findMany({ select: { score: true, handledAt: true } }) : Promise.resolve([]),
      canFinance
        ? this.prisma.paymentIntent.findMany({
            where: { status: 'SUCCEEDED', paidAt: { gte: todayKampalaStart } },
            select: { amountMinor: true, currency: true },
          })
        : Promise.resolve([]),
      canFinance ? this.prisma.issuedDocument.count({ where: { issuedAt: { gte: todayKampalaStart }, voidedAt: null } }) : Promise.resolve(0),
      canQuotes ? this.prisma.quotation.groupBy({ by: ['status'], _count: true }) : Promise.resolve([]),
      canPos ? this.prisma.posOrder.count({ where: { status: { in: ['PENDING', 'PREPARING', 'READY'] } } }) : Promise.resolve(0),
      canPos
        ? this.prisma.posOrder.findMany({
            where: { createdAt: { gte: todayKampalaStart }, status: 'COMPLETED' },
            select: { totalMinor: true, currency: true },
          })
        : Promise.resolve([]),
      canClub ? this.prisma.healthClubAccessLog.count({ where: { checkedOutAt: null } }) : Promise.resolve(0),
      canClub ? this.prisma.healthClubMembership.count({ where: { isActive: true, endDate: { gte: todayDate } } }) : Promise.resolve(0),
      canInv ? this.prisma.inventoryItem.findMany({ select: { onHand: true, parLevel: true } }) : Promise.resolve([]),
      canReq ? this.prisma.requisition.count({ where: { status: { in: ['PENDING', 'MANAGER_APPROVED'] } } }) : Promise.resolve(0),
      canReq ? this.prisma.requisition.count({ where: { status: { in: ['PENDING', 'MANAGER_APPROVED'] }, priority: 'URGENT' } }) : Promise.resolve(0),
      this.prisma.staffAnnouncement.count({ where: { isPinned: true } }),
      canInv ? this.prisma.staffProfile.count({ where: { status: 'ACTIVE' } }) : Promise.resolve(0),
      canInv ? this.prisma.hotelDepartment.count({ where: { isActive: true } }) : Promise.resolve(0),
      canInv ? this.prisma.staffShift.findMany({ where: { date: todayDate }, select: { attendanceStatus: true } }) : Promise.resolve([]),
      canInv ? this.prisma.staffProfile.count({ where: { status: 'ON_LEAVE' } }) : Promise.resolve(0),
      canInv ? this.prisma.staffLeaveRequest.count({ where: { status: 'PENDING' } }) : Promise.resolve(0),
      canInv ? this.prisma.staffPayrollRecord.count({ where: { paymentStatus: 'DRAFT' } }) : Promise.resolve(0),
      canContent ? this.prisma.page.findMany({ where: { deletedAt: null }, include: { publishedVersion: true } }) : Promise.resolve([]),
      canMessages ? this.prisma.outboundMessage.count({ where: { status: 'FAILED', createdAt: { gte: since24h } } }) : Promise.resolve(0),
    ]);

    const guestsInHouse = inHouseStays.reduce((s, r) => s + r.adults + r.children, 0);
    const vacantClean = roomsList.filter((r) => r.hkStatus === 'VACANT_CLEAN' || r.hkStatus === 'INSPECTED').length;
    const occupied = roomsList.filter((r) => r.hkStatus === 'OCCUPIED').length;
    const vacantDirty = roomsList.filter((r) => r.hkStatus === 'VACANT_DIRTY').length;
    const blocked = roomsList.filter((r) => r.hkStatus === 'BLOCKED' || r.hkStatus === 'OUT_OF_ORDER').length;

    const hkTodoCount = hkTasksToday.filter((t) => t.status === 'TODO' || t.status === 'IN_PROGRESS').length;
    const hkDoneToInspect = hkTasksToday.filter((t) => t.status === 'DONE').length;
    const hkInspectedToday = hkTasksToday.filter((t) => t.status === 'INSPECTED').length;

    const openIssues = feedbackRows.filter((f) => f.score !== 'GOOD' && !f.handledAt).length;
    const goodCount = feedbackRows.filter((f) => f.score === 'GOOD').length;

    let clearedUgx = 0n;
    let clearedUsd = 0n;
    for (const p of paymentsToday) {
      if (p.currency === 'USD') clearedUsd += p.amountMinor;
      else clearedUgx += p.amountMinor;
    }

    const qCount = (st: string) => quotesByStatus.find((q) => q.status === st)?._count ?? 0;
    const pendingQuotations = qCount('DRAFT') + qCount('SENT');
    const acceptedQuotations = qCount('ACCEPTED') + qCount('CONVERTED');

    let posRevUgx = 0n;
    for (const o of posCompletedToday) {
      if (o.currency === 'UGX') posRevUgx += o.totalMinor;
    }

    const lowStockCount = invItems.filter((i) => i.onHand <= i.parLevel).length;
    const unpublishedPages = pagesList.filter(
      (p) => p.status !== 'SCHEDULED' && (!p.publishedVersion || JSON.stringify(p.publishedVersion.blocks) !== JSON.stringify(p.draftBlocks)),
    ).length;
    const publishedPages = pagesList.filter((p) => p.status === 'PUBLISHED').length;

    return {
      generatedAt: new Date().toISOString(),
      hotelDate: todayStr,
      inbox: {
        newCount: inboxNew,
        openCount: inboxOpen,
        enquiries24h: inbox24h,
      },
      waitlist: {
        newCount: wlNew,
        contactedCount: wlContacted,
        totalActive: wlNew + wlContacted,
      },
      desk: {
        arrivalsToday,
        arrivedToday,
        inHouse: inHouseStays.length,
        guestsInHouse,
        departuresToday,
        departedToday,
        lateArrivals,
        pendingGuestRequests: pendingGuestReqs,
      },
      reservations: {
        heldCount: heldRes,
        confirmedCount: confirmedRes,
        inHouseCount: inHouseStays.length,
        upcoming7d,
      },
      rooms: {
        totalActive: roomsList.length,
        vacantClean,
        occupied,
        vacantDirty,
        blocked,
        hkTodoCount,
        hkDoneToInspect,
        hkInspectedToday,
      },
      feedback: {
        openIssues,
        goodCount,
        totalCount: feedbackRows.length,
      },
      finance: {
        clearedTodayCount: paymentsToday.length,
        clearedTodayUgxMinor: clearedUgx.toString(),
        clearedTodayUsdMinor: clearedUsd.toString(),
        receiptsIssuedToday: receiptsToday,
        pendingQuotations,
        acceptedQuotations,
      },
      operations: {
        posOpenOrders: posOpen,
        posCompletedToday: posCompletedToday.length,
        posRevenueTodayUgxMinor: posRevUgx.toString(),
        healthClubInsideNow: clubInsideNow,
        healthClubActiveMembers: clubActiveMembers,
        lowStockCount,
        totalInventoryItems: invItems.length,
        pendingRequisitions: reqPending,
        urgentRequisitions: reqUrgent,
        pinnedAnnouncements,
      },
      hr: {
        activeStaff,
        departmentsCount: deptsCount,
        shiftsToday: shiftsToday.length,
        checkedInShiftsToday: shiftsToday.filter((s) => s.attendanceStatus === 'PRESENT' || s.attendanceStatus === 'CHECKED_IN').length,
        pendingLeaves,
        onLeaveToday,
        draftPayrolls,
      },
      cms: {
        unpublishedPages,
        publishedPages,
        failedOutboundMessages24h: failedMessages24h,
      },
    };
  }

  @Get('dashboard')
  @Requires('dashboard:view')
  async dashboard(@CurrentUser() user: AuthUser): Promise<DashboardDTO> {
    const since = new Date(Date.now() - 86_400_000);
    const from30 = addDays(hotelToday(), -29);
    const canAudit = has(user, 'audit:read');
    const canInbox = has(user, 'inbox:read');
    const canWaitlist = has(user, 'waitlist:read');
    const canContent = has(user, 'content:read');
    const [newEnq, open, wlTotal, wlNew, drafts, mediaCount, byRoom, rooms, latestConv, latestWl, activity, progress, perDay] = await Promise.all([
      canInbox ? this.prisma.conversation.count({ where: { createdAt: { gte: since }, status: { not: 'SPAM' } } }) : Promise.resolve(0),
      canInbox ? this.prisma.conversation.count({ where: { status: { in: ['NEW', 'OPEN', 'WAITING_GUEST'] } } }) : Promise.resolve(0),
      canWaitlist ? this.prisma.waitlistEntry.count({ where: { status: { in: ['NEW', 'CONTACTED'] } } }) : Promise.resolve(0),
      canWaitlist ? this.prisma.waitlistEntry.count({ where: { status: 'NEW' } }) : Promise.resolve(0),
      canContent ? this.prisma.page.findMany({ where: { deletedAt: null }, include: { publishedVersion: true } }) : Promise.resolve([]),
      canContent ? this.prisma.mediaAsset.count({ where: { deletedAt: null } }) : Promise.resolve(0),
      canWaitlist ? this.prisma.waitlistEntry.groupBy({ by: ['roomTypeId'], _count: true, where: { status: { in: ['NEW', 'CONTACTED'] } } }) : Promise.resolve([]),
      canWaitlist ? this.prisma.roomType.findMany({ select: { id: true, name: true, order: true } }) : Promise.resolve([]),
      canInbox ? this.prisma.conversation.findMany({ where: { status: { not: 'SPAM' } }, include: this.inbox.include(user.id), orderBy: { lastMessageAt: 'desc' }, take: 6 }) : Promise.resolve([]),
      canWaitlist ? this.prisma.waitlistEntry.findMany({ include: waitlistInclude, orderBy: { createdAt: 'desc' }, take: 6 }) : Promise.resolve([]),
      canAudit ? this.prisma.auditLog.findMany({ where: { actorType: { in: ['USER', 'GUEST', 'SYSTEM'] }, action: { notIn: ['auth.login', 'auth.login_failed'] } }, include: { actor: { select: { id: true, name: true } } }, orderBy: { createdAt: 'desc' }, take: 12 }) : Promise.resolve([]),
      canContent ? this.prisma.progressUpdate.findFirst({ where: { status: 'PUBLISHED', deletedAt: null }, orderBy: { happenedOn: 'desc' } }) : Promise.resolve(null),
      canInbox
        ? this.prisma.$queryRaw<{ d: Date; c: bigint }[]>`
            SELECT date_trunc('day', "createdAt" AT TIME ZONE 'Africa/Kampala') AS d, count(*) AS c
            FROM "Conversation" WHERE "createdAt" >= ${new Date(`${from30}T00:00:00+03:00`)} AND status <> 'SPAM'
            GROUP BY 1 ORDER BY 1`
        : Promise.resolve([]),
    ]);
    const byDay = new Map(perDay.map((r) => [r.d.toISOString().slice(0, 10), Number(r.c)]));
    const draftCount = drafts.filter((p) => !p.publishedVersion || JSON.stringify(p.publishedVersion.blocks) !== JSON.stringify(p.draftBlocks)).length;
    return {
      counts: { newEnquiries24h: newEnq, openConversations: open, waitlistTotal: wlTotal, waitlistNew: wlNew, draftPages: draftCount, mediaCount },
      waitlistByRoomType: byRoom
        .map((r) => ({ name: r.roomTypeId ? lt(rooms.find((x) => x.id === r.roomTypeId)?.name) : { en: 'Any room' }, count: r._count, order: rooms.find((x) => x.id === r.roomTypeId)?.order ?? 99 }))
        .sort((a, b) => a.order - b.order)
        .map(({ name, count }) => ({ name, count })),
      enquiriesByDay: Array.from({ length: 30 }, (_, i) => {
        const date = addDays(from30, i);
        return { date, count: byDay.get(date) ?? 0 };
      }),
      latestConversations: latestConv.map((c) => this.inbox.summary(c)),
      latestWaitlist: latestWl.map(toWaitlist),
      recentActivity: activity.map((a) => ({ id: a.id, actor: a.actor, actorType: a.actorType, action: a.action, entityType: a.entityType, entityId: a.entityId, summary: a.summary, before: null, after: null, ip: null, createdAt: a.createdAt.toISOString() })),
      progress: { percent: progress?.percentComplete ?? null, milestone: progress?.milestone ?? null, lastUpdate: progress?.happenedOn.toISOString().slice(0, 10) ?? null },
    };
  }

  @Get('audit')
  @Requires('audit:read')
  async audit(@Query() q: Record<string, string>) {
    const where: Prisma.AuditLogWhereInput = {};
    if (q.entityType) where.entityType = q.entityType;
    if (q.entityId) where.entityId = q.entityId;
    if (q.actorId) where.actorId = q.actorId;
    if (q.action) where.action = { startsWith: q.action };
    if (q.q) where.summary = { contains: q.q, mode: 'insensitive' };
    const skip = Number(q.cursor) || 0;
    const limit = Math.min(100, Number(q.limit) || 50);
    const [rows, total] = await Promise.all([
      this.prisma.auditLog.findMany({ where, include: { actor: { select: { id: true, name: true } } }, orderBy: { createdAt: 'desc' }, skip, take: limit }),
      this.prisma.auditLog.count({ where }),
    ]);
    return {
      data: rows.map((a) => ({ ...a, createdAt: a.createdAt.toISOString() })),
      nextCursor: skip + limit < total ? String(skip + limit) : null,
      total,
    };
  }
}
