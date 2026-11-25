import { Injectable } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import type { z } from 'zod';
import {
  LOST_ITEM_CATEGORY_LABEL,
  LOST_ITEM_HOLD_DAYS,
  VALUABLE_CATEGORIES,
  WORK_ORDER_CATEGORY_LABEL,
  WORK_ORDER_TARGET_HOURS,
  type LikelyOwnerDTO,
  type LostItemDTO,
  type LostItemListDTO,
  type WorkOrderDTO,
  type WorkOrderListDTO,
  type WorkOrderNoteDTO,
  type zLostItemCreate,
  type zLostItemDispose,
  type zLostItemPatch,
  type zLostItemReturn,
  type zWorkOrderCreate,
  type zWorkOrderPatch,
  type zWorkOrderStatus,
} from '@reberon/contracts';
import { hotelToday } from '@reberon/utils';
import type { LostItem, Prisma, Room, WorkOrder, WorkOrderNote } from '@reberon/db';
import { PrismaService } from '../../common/prisma.service.js';
import { AuditService } from '../../common/audit.service.js';
import { has, type AuthUser } from '../../common/auth.js';
import { permissionsOf } from '../../common/access.js';
import { badRequest, conflict, forbidden, notFound } from '../../common/errors.js';
import { day, iso } from '../booking/inventory.service.js';
import { PushService } from '../push/push.service.js';
import { BRAND, docShell, esc, letterhead, loadHotel } from '../documents/letterhead.js';
import { RackService } from './rack.service.js';

type WorkOrderRow = WorkOrder & { room: Pick<Room, 'id' | 'number'> | null; notes?: WorkOrderNote[] };
type LostItemRow = LostItem & { room: Pick<Room, 'id' | 'number'> | null };

const addDays = (date: string, n: number) => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const kampalaDate = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Kampala' }).format(d);
const OPEN_STATES = ['OPEN', 'IN_PROGRESS', 'ON_HOLD'] as const;
const STATUS_WORD: Record<string, string> = { OPEN: 'reopened', IN_PROGRESS: 'started work', ON_HOLD: 'put on hold', DONE: 'marked it fixed', CANCELLED: 'cancelled it' };

/**
 * Upkeep: maintenance work orders (report → assign → fix, with the room off sale while it
 * is repaired) and lost and found (log → match to a guest → return or dispose).
 */
@Injectable()
export class UpkeepService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly rack: RackService,
    private readonly push: PushService,
  ) {}

  /* ───────────────────────── numbering ───────────────────────── */

  private async nextNumber(kind: 'WO' | 'LF', tx: Prisma.TransactionClient | PrismaService = this.prisma) {
    const last = kind === 'WO'
      ? await tx.workOrder.findFirst({ orderBy: { number: 'desc' }, select: { number: true } })
      : await tx.lostItem.findFirst({ orderBy: { number: 'desc' }, select: { number: true } });
    const n = last ? Number(last.number.split('-')[1]) + 1 : 1;
    return `${kind}-${String(n).padStart(4, '0')}`;
  }

  /** Create with the next number; two people saving at once just retry with the one after. */
  private async withNumber<T>(kind: 'WO' | 'LF', create: (number: string) => Promise<T>): Promise<T> {
    for (let i = 0; i < 5; i++) {
      try {
        return await create(await this.nextNumber(kind));
      } catch (e) {
        if ((e as { code?: string }).code !== 'P2002') throw e;
      }
    }
    throw conflict('Could not number this record — try again.');
  }

  /* ───────────────────────── maintenance ───────────────────────── */

  private async blocksOf(rows: WorkOrderRow[]) {
    const ids = rows.map((r) => r.blockId).filter((x): x is string => !!x);
    if (!ids.length) return new Map<string, { id: string; until: string }>();
    const blocks = await this.prisma.roomBlock.findMany({ where: { id: { in: ids }, releasedAt: null, toDate: { gt: day(hotelToday()) } } });
    return new Map(blocks.map((b) => [b.id, { id: b.id, until: iso(b.toDate) }]));
  }

  private woDTO(r: WorkOrderRow, blocks: Map<string, { id: string; until: string }>): WorkOrderDTO {
    const b = r.blockId ? blocks.get(r.blockId) : undefined;
    const open = (OPEN_STATES as readonly string[]).includes(r.status);
    return {
      id: r.id,
      number: r.number,
      title: r.title,
      details: r.details,
      category: r.category,
      priority: r.priority,
      status: r.status,
      room: r.room ? { id: r.room.id, number: r.room.number } : null,
      location: r.location,
      reportedByName: r.reportedByName,
      reportedById: r.reportedById,
      assignedToId: r.assignedToId,
      assignedToName: r.assignedToName,
      outOfService: b ? { blockId: b.id, until: b.until } : null,
      dueAt: r.dueAt?.toISOString() ?? null,
      overdue: open && r.status !== 'ON_HOLD' && !!r.dueAt && r.dueAt < new Date(),
      startedAt: r.startedAt?.toISOString() ?? null,
      completedAt: r.completedAt?.toISOString() ?? null,
      resolution: r.resolution,
      costMinor: r.costMinor?.toString() ?? null,
      currency: r.currency,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
      notes: r.notes?.map((n): WorkOrderNoteDTO => ({ id: n.id, authorName: n.authorName, body: n.body, kind: n.kind === 'EVENT' ? 'EVENT' : 'NOTE', createdAt: n.createdAt.toISOString() })),
    };
  }

  private async assignees() {
    const users = await this.prisma.user.findMany({ where: { status: 'ACTIVE', deletedAt: null, canSignIn: true }, orderBy: { name: 'asc' } });
    return users
      .filter((u) => permissionsOf(u).includes('maintenance:report'))
      .map((u) => ({ id: u.id, name: u.name, jobTitle: u.jobTitle ?? null }));
  }

  async listWorkOrders(actor: AuthUser): Promise<WorkOrderListDTO> {
    const since = new Date(Date.now() - 30 * 86_400_000);
    const weekAgo = new Date(Date.now() - 7 * 86_400_000);
    const rows = await this.prisma.workOrder.findMany({
      where: { OR: [{ status: { in: [...OPEN_STATES] } }, { updatedAt: { gte: since } }] },
      include: { room: { select: { id: true, number: true } } },
      orderBy: { createdAt: 'desc' },
      take: 400,
    });
    const blocks = await this.blocksOf(rows);
    const rank = { URGENT: 0, HIGH: 1, NORMAL: 2, LOW: 3 } as const;
    const items = rows
      .map((r) => this.woDTO(r, blocks))
      .sort((a, b) => {
        const ao = (OPEN_STATES as readonly string[]).includes(a.status) ? 0 : 1;
        const bo = (OPEN_STATES as readonly string[]).includes(b.status) ? 0 : 1;
        return ao - bo || rank[a.priority] - rank[b.priority] || b.createdAt.localeCompare(a.createdAt);
      });
    const open = items.filter((i) => (OPEN_STATES as readonly string[]).includes(i.status));
    const [assignees, rooms] = await Promise.all([
      this.assignees(),
      this.prisma.room.findMany({ where: { isActive: true }, select: { id: true, number: true }, orderBy: { number: 'asc' } }),
    ]);
    return {
      items,
      counts: {
        open: open.length,
        urgent: open.filter((i) => i.priority === 'URGENT').length,
        overdue: open.filter((i) => i.overdue).length,
        mine: open.filter((i) => i.assignedToId === actor.id).length,
        outOfService: open.filter((i) => i.outOfService).length,
        doneThisWeek: items.filter((i) => i.status === 'DONE' && i.completedAt && new Date(i.completedAt) >= weekAgo).length,
      },
      assignees,
      rooms,
    };
  }

  async getWorkOrder(id: string): Promise<WorkOrderDTO> {
    const r = await this.prisma.workOrder.findUnique({ where: { id }, include: { room: { select: { id: true, number: true } }, notes: { orderBy: { createdAt: 'asc' } } } });
    if (!r) throw notFound('Work order');
    return this.woDTO(r, await this.blocksOf([r]));
  }

  private event(workOrderId: string, actor: AuthUser, body: string, tx: Prisma.TransactionClient | PrismaService = this.prisma) {
    return tx.workOrderNote.create({ data: { workOrderId, authorId: actor.id, authorName: actor.name, body, kind: 'EVENT' } });
  }

  private where(r: { room: { number: string } | null; location: string | null }) {
    return r.room ? `Room ${r.room.number}` : (r.location ?? 'the hotel');
  }

  async createWorkOrder(body: z.infer<typeof zWorkOrderCreate>, actor: AuthUser): Promise<WorkOrderDTO> {
    if (body.outOfServiceUntil && !has(actor, 'maintenance:manage')) throw forbidden('Only maintenance managers can take a room out of service');
    if (body.outOfServiceUntil && !body.roomId) throw badRequest('Pick the room to take out of service');
    const room = body.roomId ? await this.prisma.room.findUnique({ where: { id: body.roomId }, select: { id: true, number: true, isActive: true } }) : null;
    if (body.roomId && !room?.isActive) throw notFound('Room');
    const created = await this.withNumber('WO', (number) =>
      this.prisma.workOrder.create({
        data: {
          number,
          title: body.title,
          details: body.details ?? null,
          category: body.category,
          priority: body.priority,
          roomId: room?.id ?? null,
          location: room ? (body.location ?? null) : (body.location ?? null),
          reportedById: actor.id,
          reportedByName: actor.name,
          dueAt: new Date(Date.now() + WORK_ORDER_TARGET_HOURS[body.priority] * 3600_000),
        },
        include: { room: { select: { id: true, number: true } } },
      }),
    );
    await this.event(created.id, actor, `Reported ${WORK_ORDER_CATEGORY_LABEL[body.category].toLowerCase()} at ${this.where(created)}`);
    await this.audit.record({
      actor,
      action: body.priority === 'URGENT' ? 'maintenance.report_urgent' : 'maintenance.report',
      entityType: 'WorkOrder',
      entityId: created.id,
      summary: `${created.number} ${body.priority === 'URGENT' ? 'URGENT: ' : ''}${created.title} — ${this.where(created)}`,
    });
    if (body.outOfServiceUntil) await this.outOfService(created.id, { until: body.outOfServiceUntil }, actor);
    return this.getWorkOrder(created.id);
  }

  async patchWorkOrder(id: string, body: z.infer<typeof zWorkOrderPatch>, actor: AuthUser): Promise<WorkOrderDTO> {
    const before = await this.prisma.workOrder.findUnique({ where: { id }, include: { room: { select: { id: true, number: true } } } });
    if (!before) throw notFound('Work order');
    const mine = before.reportedById === actor.id && before.status === 'OPEN';
    const manage = has(actor, 'maintenance:manage');
    // The reporter may fix their own wording while nobody has picked it up; the rest is for managers.
    const onlyWording = Object.keys(body).every((k) => ['title', 'details', 'category'].includes(k));
    if (!manage && !(mine && onlyWording)) throw forbidden('Only maintenance managers can change this');

    const data: Prisma.WorkOrderUpdateInput = {};
    const events: string[] = [];
    if (body.title !== undefined) data.title = body.title;
    if (body.details !== undefined) data.details = body.details;
    if (body.category !== undefined && body.category !== before.category) {
      data.category = body.category;
      events.push(`Category: ${WORK_ORDER_CATEGORY_LABEL[body.category]}`);
    }
    if (body.priority !== undefined && body.priority !== before.priority) {
      data.priority = body.priority;
      // A new priority sets a new target, counted from when it was reported.
      data.dueAt = new Date(before.createdAt.getTime() + WORK_ORDER_TARGET_HOURS[body.priority] * 3600_000);
      events.push(`Priority: ${body.priority.toLowerCase()}`);
    }
    if (body.dueAt !== undefined) {
      data.dueAt = body.dueAt ? new Date(body.dueAt) : null;
      events.push(body.dueAt ? `Due ${new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Kampala' }).format(new Date(body.dueAt))}` : 'Due date cleared');
    }
    let assignee: { id: string; name: string } | null = null;
    if (body.assignedToId !== undefined && body.assignedToId !== before.assignedToId) {
      if (body.assignedToId) {
        const u = await this.prisma.user.findFirst({ where: { id: body.assignedToId, status: 'ACTIVE', deletedAt: null } });
        if (!u) throw notFound('Person');
        assignee = { id: u.id, name: u.name };
        data.assignedToId = u.id;
        data.assignedToName = u.name;
        events.push(`Assigned to ${u.name}`);
      } else {
        data.assignedToId = null;
        data.assignedToName = null;
        events.push('Unassigned');
      }
    }
    await this.prisma.workOrder.update({ where: { id }, data });
    for (const e of events) await this.event(id, actor, e);
    await this.audit.record({ actor, action: 'maintenance.update', entityType: 'WorkOrder', entityId: id, summary: `${before.number}: ${events.join('; ') || 'details edited'}` });
    if (assignee && assignee.id !== actor.id) {
      await this.push
        .sendToUsers([assignee.id], {
          title: `New job for you: ${before.number}`,
          body: `${body.title ?? before.title} — ${this.where(before)}${(body.priority ?? before.priority) === 'URGENT' ? ' (urgent)' : ''}`,
          url: `/maintenance?open=${id}`,
          tag: `wo-${id}`,
          urgency: (body.priority ?? before.priority) === 'URGENT' ? 'CRITICAL' : 'HIGH',
          sound: 'urgent',
        })
        .catch(() => undefined);
    }
    return this.getWorkOrder(id);
  }

  async setWorkOrderStatus(id: string, body: z.infer<typeof zWorkOrderStatus>, actor: AuthUser): Promise<WorkOrderDTO> {
    const wo = await this.prisma.workOrder.findUnique({ where: { id }, include: { room: { select: { id: true, number: true } } } });
    if (!wo) throw notFound('Work order');
    if (wo.status === body.status) return this.getWorkOrder(id);
    const manage = has(actor, 'maintenance:manage');
    const assignee = wo.assignedToId === actor.id;
    const reporter = wo.reportedById === actor.id;
    const allowed =
      manage ||
      (assignee && ['IN_PROGRESS', 'ON_HOLD', 'DONE'].includes(body.status) && (OPEN_STATES as readonly string[]).includes(wo.status)) ||
      (reporter && body.status === 'CANCELLED' && wo.status === 'OPEN');
    if (!allowed) throw forbidden(assignee || reporter ? 'Ask a maintenance manager to make that change' : 'Only the person assigned or a maintenance manager can update this job');
    if (body.costMinor && !body.currency) throw badRequest('Say which currency the cost is in');

    const now = new Date();
    const data: Prisma.WorkOrderUpdateInput = { status: body.status };
    if (body.status === 'IN_PROGRESS' && !wo.startedAt) data.startedAt = now;
    if (body.status === 'IN_PROGRESS' && !wo.assignedToId) {
      // Starting an unassigned job takes it.
      data.assignedToId = actor.id;
      data.assignedToName = actor.name;
    }
    if (body.status === 'DONE') {
      data.completedAt = now;
      data.resolution = body.note ?? null;
      if (body.costMinor) {
        data.costMinor = BigInt(body.costMinor);
        data.currency = body.currency;
      }
    }
    if (body.status === 'OPEN') {
      data.completedAt = null;
      data.resolution = null;
    }
    await this.prisma.workOrder.update({ where: { id }, data });
    await this.event(id, actor, `${actor.name.split(' ')[0]} ${STATUS_WORD[body.status]}${body.note ? `: ${body.note}` : ''}`);

    // Fixed or dropped: the room goes back on sale, dirty, so housekeeping turns it before anyone sells it.
    let released = false;
    if (['DONE', 'CANCELLED'].includes(body.status) && wo.blockId) {
      const b = await this.prisma.roomBlock.findUnique({ where: { id: wo.blockId } });
      if (b && !b.releasedAt) {
        await this.rack.releaseBlock(wo.blockId, actor);
        released = true;
        await this.event(id, actor, `Room ${wo.room?.number ?? ''} back in service — sent to housekeeping for cleaning`);
      }
    }
    await this.audit.record({
      actor,
      action: `maintenance.${body.status.toLowerCase()}`,
      entityType: 'WorkOrder',
      entityId: id,
      summary: `${wo.number} ${STATUS_WORD[body.status]}${body.note ? ` — ${body.note}` : ''}${released ? ` (room ${wo.room?.number} back in service)` : ''}`,
    });
    return this.getWorkOrder(id);
  }

  async addWorkOrderNote(id: string, text: string, actor: AuthUser) {
    const wo = await this.prisma.workOrder.findUnique({ where: { id }, select: { id: true, number: true } });
    if (!wo) throw notFound('Work order');
    await this.prisma.workOrderNote.create({ data: { workOrderId: id, authorId: actor.id, authorName: actor.name, body: text, kind: 'NOTE' } });
    await this.prisma.workOrder.update({ where: { id }, data: { updatedAt: new Date() } });
    await this.audit.record({ actor, action: 'maintenance.note', entityType: 'WorkOrder', entityId: id, summary: `${wo.number}: note added` });
    return this.getWorkOrder(id);
  }

  /** Off sale while it is repaired: a maintenance block from today until the given date. */
  async outOfService(id: string, body: { until: string; note?: string }, actor: AuthUser): Promise<WorkOrderDTO> {
    const wo = await this.prisma.workOrder.findUnique({ where: { id }, include: { room: { select: { id: true, number: true } } } });
    if (!wo) throw notFound('Work order');
    if (!wo.roomId || !wo.room) throw badRequest('This job is not in a guest room');
    if (!(OPEN_STATES as readonly string[]).includes(wo.status)) throw badRequest('This job is already closed');
    const today = hotelToday();
    if (body.until <= today) throw badRequest('Pick a date after today');
    // Changing the date: release the old block first, then block again.
    if (wo.blockId) {
      const b = await this.prisma.roomBlock.findUnique({ where: { id: wo.blockId } });
      if (b && !b.releasedAt) await this.rack.releaseBlock(b.id, actor);
    }
    const block = await this.rack.block({ roomId: wo.roomId, fromDate: today, toDate: body.until, reason: 'MAINTENANCE', note: `${wo.number}: ${wo.title}`.slice(0, 300) }, actor);
    await this.prisma.workOrder.update({ where: { id }, data: { blockId: block.id } });
    const untilWord = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${body.until}T00:00:00Z`));
    await this.event(id, actor, `Room ${wo.room.number} taken out of service until ${untilWord}`);
    await this.audit.record({ actor, action: 'maintenance.out_of_service', entityType: 'WorkOrder', entityId: id, summary: `Room ${wo.room.number} out of service until ${untilWord} — ${wo.number} ${wo.title}` });
    return this.getWorkOrder(id);
  }

  async backInService(id: string, actor: AuthUser): Promise<WorkOrderDTO> {
    const wo = await this.prisma.workOrder.findUnique({ where: { id }, include: { room: { select: { number: true } } } });
    if (!wo?.blockId) throw badRequest('This room is not out of service for this job');
    const b = await this.prisma.roomBlock.findUnique({ where: { id: wo.blockId } });
    if (b && !b.releasedAt) await this.rack.releaseBlock(b.id, actor);
    await this.event(id, actor, `Room ${wo.room?.number ?? ''} back in service — sent to housekeeping for cleaning`);
    return this.getWorkOrder(id);
  }

  /* ───────────────────────── lost and found ───────────────────────── */

  private async lostDTOs(rows: LostItemRow[]): Promise<LostItemDTO[]> {
    const resIds = rows.map((r) => r.reservationId).filter((x): x is string => !!x);
    const res = resIds.length ? await this.prisma.reservation.findMany({ where: { id: { in: resIds } }, select: { id: true, code: true, contact: { select: { name: true } } } }) : [];
    const byId = new Map(res.map((r) => [r.id, r]));
    const today = hotelToday();
    return rows.map((r) => {
      const rv = r.reservationId ? byId.get(r.reservationId) : undefined;
      return {
        id: r.id,
        number: r.number,
        description: r.description,
        category: r.category,
        valuable: r.valuable,
        foundAt: r.foundAt.toISOString(),
        foundWhere: r.foundWhere,
        room: r.room ? { id: r.room.id, number: r.room.number } : null,
        foundByName: r.foundByName,
        storedAt: r.storedAt,
        holdUntil: iso(r.holdUntil),
        due: r.status === 'STORED' && iso(r.holdUntil) <= today,
        status: r.status,
        reservation: rv ? { id: rv.id, code: rv.code, guestName: rv.contact.name } : null,
        guestName: r.guestName,
        guestContact: r.guestContact,
        returnedAt: r.returnedAt?.toISOString() ?? null,
        returnedTo: r.returnedTo,
        returnMethod: r.returnMethod,
        handledByName: r.handledByName,
        disposedAt: r.disposedAt?.toISOString() ?? null,
        disposalMethod: r.disposalMethod,
        notes: r.notes,
        createdAt: r.createdAt.toISOString(),
      };
    });
  }

  async listLost(): Promise<LostItemListDTO> {
    const since = new Date(Date.now() - 90 * 86_400_000);
    const rows = await this.prisma.lostItem.findMany({
      where: { OR: [{ status: 'STORED' }, { updatedAt: { gte: since } }] },
      include: { room: { select: { id: true, number: true } } },
      orderBy: { foundAt: 'desc' },
      take: 500,
    });
    const items = await this.lostDTOs(rows);
    const monthStart = `${hotelToday().slice(0, 7)}-01`;
    const stored = items.filter((i) => i.status === 'STORED');
    const rooms = await this.prisma.room.findMany({ where: { isActive: true }, select: { id: true, number: true }, orderBy: { number: 'asc' } });
    return {
      items,
      counts: {
        stored: stored.length,
        valuables: stored.filter((i) => i.valuable).length,
        due: stored.filter((i) => i.due).length,
        returnedThisMonth: items.filter((i) => i.status === 'RETURNED' && i.returnedAt && kampalaDate(new Date(i.returnedAt)) >= monthStart).length,
      },
      rooms,
    };
  }

  private async lostOne(id: string): Promise<LostItemDTO> {
    const r = await this.prisma.lostItem.findUnique({ where: { id }, include: { room: { select: { id: true, number: true } } } });
    if (!r) throw notFound('Item');
    return (await this.lostDTOs([r]))[0]!;
  }

  /** Who stayed in that room around that date: the likely owner, most recent first. */
  async likelyOwners(roomId: string, date: string): Promise<LikelyOwnerDTO[]> {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw badRequest('A date like 2026-11-25 is needed');
    const rows = await this.prisma.roomAssignment.findMany({
      where: { roomId, fromDate: { lte: day(date) }, toDate: { gte: day(addDays(date, -3)) } },
      include: { reservation: { select: { id: true, code: true, status: true, contact: { select: { name: true, phone: true, email: true } } } } },
      orderBy: { toDate: 'desc' },
      take: 5,
    });
    const seen = new Set<string>();
    return rows
      .filter((a) => !seen.has(a.reservationId) && seen.add(a.reservationId))
      .map((a) => ({
        reservationId: a.reservation.id,
        code: a.reservation.code,
        guestName: a.reservation.contact.name,
        guestPhone: a.reservation.contact.phone,
        guestEmail: a.reservation.contact.email,
        fromDate: iso(a.fromDate),
        toDate: iso(a.toDate),
        status: a.reservation.status,
      }));
  }

  async createLost(body: z.infer<typeof zLostItemCreate>, actor: AuthUser): Promise<LostItemDTO> {
    const foundAt = body.foundAt ? new Date(body.foundAt) : new Date();
    if (foundAt.getTime() > Date.now() + 5 * 60_000) throw badRequest('The time found cannot be in the future');
    const valuable = VALUABLE_CATEGORIES.includes(body.category);
    const holdUntil = addDays(kampalaDate(foundAt), valuable ? LOST_ITEM_HOLD_DAYS.valuable : LOST_ITEM_HOLD_DAYS.other);
    let guestName = body.guestName ?? null;
    let guestContact = body.guestContact ?? null;
    if (body.reservationId) {
      const r = await this.prisma.reservation.findUnique({ where: { id: body.reservationId }, select: { contact: { select: { name: true, phone: true, email: true } } } });
      if (!r) throw notFound('Booking');
      guestName ??= r.contact.name;
      guestContact ??= r.contact.phone ?? r.contact.email ?? null;
    }
    const created = await this.withNumber('LF', (number) =>
      this.prisma.lostItem.create({
        data: {
          number,
          description: body.description,
          category: body.category,
          valuable,
          foundAt,
          foundWhere: body.foundWhere,
          roomId: body.roomId ?? null,
          foundById: actor.id,
          foundByName: actor.name,
          storedAt: body.storedAt,
          holdUntil: day(holdUntil),
          reservationId: body.reservationId ?? null,
          guestName,
          guestContact,
          notes: body.notes ?? null,
        },
      }),
    );
    await this.audit.record({ actor, action: 'lostfound.log', entityType: 'LostItem', entityId: created.id, summary: `${created.number} logged: ${created.description} (found ${created.foundWhere}, kept ${created.storedAt})${valuable ? ' — valuable' : ''}` });
    return this.lostOne(created.id);
  }

  async patchLost(id: string, body: z.infer<typeof zLostItemPatch>, actor: AuthUser): Promise<LostItemDTO> {
    const before = await this.prisma.lostItem.findUnique({ where: { id } });
    if (!before) throw notFound('Item');
    if (before.status !== 'STORED') throw badRequest('This item has already left lost and found');
    const data: Prisma.LostItemUpdateInput = {};
    if (body.description !== undefined) data.description = body.description;
    if (body.category !== undefined) {
      data.category = body.category;
      const valuable = VALUABLE_CATEGORIES.includes(body.category);
      data.valuable = valuable;
      data.holdUntil = day(addDays(kampalaDate(before.foundAt), valuable ? LOST_ITEM_HOLD_DAYS.valuable : LOST_ITEM_HOLD_DAYS.other));
    }
    if (body.foundWhere !== undefined) data.foundWhere = body.foundWhere;
    if (body.storedAt !== undefined) data.storedAt = body.storedAt;
    if (body.reservationId !== undefined) data.reservationId = body.reservationId;
    if (body.guestName !== undefined) data.guestName = body.guestName || null;
    if (body.guestContact !== undefined) data.guestContact = body.guestContact || null;
    if (body.notes !== undefined) data.notes = body.notes || null;
    await this.prisma.lostItem.update({ where: { id }, data });
    await this.audit.record({ actor, action: 'lostfound.update', entityType: 'LostItem', entityId: id, summary: `${before.number} updated${body.storedAt && body.storedAt !== before.storedAt ? ` — moved to ${body.storedAt}` : ''}` });
    return this.lostOne(id);
  }

  async returnLost(id: string, body: z.infer<typeof zLostItemReturn>, actor: AuthUser): Promise<LostItemDTO> {
    const item = await this.prisma.lostItem.findUnique({ where: { id } });
    if (!item) throw notFound('Item');
    if (item.status !== 'STORED') throw badRequest('This item has already left lost and found');
    if (item.valuable && !body.proof) throw badRequest('For a valuable, note how you confirmed the owner (ID seen, booking matched…)', [{ path: 'proof', message: 'Required for valuables' }]);
    const how = { IN_PERSON: 'in person', COURIER: 'by courier', POST: 'by post', GUEST_REPRESENTATIVE: 'to someone sent by the guest' }[body.method];
    await this.prisma.lostItem.update({
      where: { id },
      data: {
        status: 'RETURNED',
        returnedAt: new Date(),
        returnedTo: body.returnedTo,
        returnMethod: body.method,
        handledById: actor.id,
        handledByName: actor.name,
        notes: [item.notes, body.proof ? `Owner confirmed: ${body.proof}` : null, body.note].filter(Boolean).join('\n') || null,
      },
    });
    await this.audit.record({ actor, action: 'lostfound.return', entityType: 'LostItem', entityId: id, summary: `${item.number} returned to ${body.returnedTo} ${how}: ${item.description}` });
    return this.lostOne(id);
  }

  async disposeLost(id: string, body: z.infer<typeof zLostItemDispose>, actor: AuthUser): Promise<LostItemDTO> {
    const item = await this.prisma.lostItem.findUnique({ where: { id } });
    if (!item) throw notFound('Item');
    if (item.status !== 'STORED') throw badRequest('This item has already left lost and found');
    const due = iso(item.holdUntil) <= hotelToday();
    // Before the hold ends only a manager with delete rights may let it go (spoiled food, a broken umbrella…).
    if (!due && !has(actor, 'records:delete')) {
      const until = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(item.holdUntil);
      throw badRequest(`Keep it until ${until} — the owner may still come back for it.`);
    }
    if (item.valuable && body.method === 'STAFF_CLAIM') throw badRequest('Valuables cannot be given to staff. Hand them to the police or donate them.');
    const how = { DONATED: 'donated', DESTROYED: 'thrown away', POLICE: 'handed to the police', STAFF_CLAIM: 'given to the staff member who found it' }[body.method];
    await this.prisma.lostItem.update({
      where: { id },
      data: { status: 'DISPOSED', disposedAt: new Date(), disposalMethod: body.method, handledById: actor.id, handledByName: actor.name, notes: [item.notes, body.note].filter(Boolean).join('\n') || null },
    });
    await this.audit.record({ actor, action: 'lostfound.dispose', entityType: 'LostItem', entityId: id, summary: `${item.number} ${how}${due ? '' : ' before its hold ended'}: ${item.description}` });
    return this.lostOne(id);
  }

  /** A tag to keep with the item: number, what, where found, where kept, hold date. */
  async lostTag(id: string) {
    const item = await this.lostOne(id);
    const hotel = await loadHotel(this.prisma);
    const nonce = randomBytes(16).toString('base64');
    const fmt = (s: string, withTime = false) =>
      new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}), timeZone: withTime ? 'Africa/Kampala' : 'UTC' }).format(new Date(withTime ? s : `${s}T00:00:00Z`));
    const row = (k: string, v: string | null | undefined) => (v ? `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>` : '');
    const body = `
      ${letterhead(hotel, { title: 'Lost & found', number: item.number, date: `Found ${fmt(item.foundAt, true)}`, badge: item.valuable ? 'Valuable — keep in safe' : 'Stored', badgeTone: item.valuable ? 'warn' : 'ok', narrow: true })}
      <p class="what">${esc(item.description)}</p>
      <table>
        ${row('Kind', LOST_ITEM_CATEGORY_LABEL[item.category])}
        ${row('Found', `${item.foundWhere}${item.room ? ` (room ${item.room.number})` : ''}`)}
        ${row('Found by', item.foundByName)}
        ${row('Kept at', item.storedAt)}
        ${row('Likely owner', item.reservation ? `${item.reservation.guestName} · ${item.reservation.code}` : item.guestName)}
        ${row('Hold until', fmt(item.holdUntil))}
      </table>
      <p class="sig">Released by ______________________ &nbsp; Date __________</p>`;
    const css = `.what{margin:3mm 0 2mm;font-size:15px;font-weight:700;text-align:center} table{width:100%;border-collapse:collapse;font-size:11.5px} th{text-align:left;color:${BRAND.muted};font-weight:600;padding:1.2mm 2mm 1.2mm 0;vertical-align:top;white-space:nowrap} td{padding:1.2mm 0;border-bottom:1px dashed ${BRAND.line}} .sig{margin-top:6mm;font-size:10.5px}`;
    return { html: docShell({ title: `${item.number} · Lost & found`, nonce, narrow: true, body, css }), nonce };
  }
}
