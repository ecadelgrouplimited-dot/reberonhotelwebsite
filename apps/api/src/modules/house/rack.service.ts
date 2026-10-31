import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import type { z } from 'zod';
import type {
  HkBoardDTO,
  HkStatus,
  HkTaskDTO,
  HkTaskStatus,
  RackRoomDTO,
  zHkTaskCreateInput,
  zHkTaskPatch,
  zRoomBlockInput,
  zRoomCreateInput,
  zRoomUpdateInput,
} from '@reberon/contracts';
import { HK_TASK_STATUSES } from '@reberon/contracts';
import { hotelToday } from '@reberon/utils';
import type { Prisma } from '@reberon/db';
import { PrismaService } from '../../common/prisma.service.js';
import { AuditService } from '../../common/audit.service.js';
import { has, type AuthUser } from '../../common/auth.js';
import { badRequest, conflict, forbidden, notFound } from '../../common/errors.js';
import { BookingService } from '../booking/booking.service.js';
import { InventoryService, day, iso, nightsOf, type Tx } from '../booking/inventory.service.js';

const OUT_OF_SERVICE: HkStatus[] = ['BLOCKED', 'OUT_OF_ORDER'];
const firstName = (n: string) => n.trim().split(/\s+/)[0] ?? null;

/**
 * The room rack: every numbered room, what state it is in, who is in it,
 * and the housekeeping list that keeps the two honest.
 */
@Injectable()
export class RackService {
  private readonly log = new Logger('Rack');

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly inventory: InventoryService,
    private readonly booking: BookingService,
  ) {}

  /* ───────── occupancy ───────── */

  /** Active assignments touching `date`: staying the night, or leaving that morning. */
  async occupancy(date: string, tx: Tx = this.prisma) {
    const d = day(date);
    const rows = await tx.roomAssignment.findMany({
      where: { releasedAt: null, fromDate: { lte: d }, toDate: { gte: d } },
      include: { reservation: { include: { contact: { select: { name: true } } } } },
    });
    const occupant = new Map<string, (typeof rows)[number]>();
    const arriving = new Map<string, (typeof rows)[number]>();
    for (const a of rows) {
      const r = a.reservation;
      if (r.status === 'IN_HOUSE') occupant.set(a.roomId, a);
      else if (r.status === 'CONFIRMED' && iso(a.fromDate) === date) arriving.set(a.roomId, a);
    }
    return { occupant, arriving };
  }

  /**
   * Keep the rack consistent with blocks, and make sure today's housekeeping list
   * exists. Idempotent and cheap; runs on every board read and after midnight.
   */
  async syncToday(date = hotelToday()) {
    const d = day(date);
    const [rooms, blocks, { occupant }] = await Promise.all([
      this.prisma.room.findMany({ where: { isActive: true } }),
      this.prisma.roomBlock.findMany({ where: { releasedAt: null, fromDate: { lte: d }, toDate: { gt: d } } }),
      this.occupancy(date),
    ]);
    const blockOf = new Map(blocks.map((b) => [b.roomId, b]));
    for (const room of rooms) {
      const b = blockOf.get(room.id);
      const occ = occupant.get(room.id);
      let want: HkStatus | null = null;
      if (b && !occ) want = b.reason === 'OUT_OF_ORDER' || b.reason === 'MAINTENANCE' ? 'OUT_OF_ORDER' : 'BLOCKED';
      else if (!b && OUT_OF_SERVICE.includes(room.hkStatus)) want = 'VACANT_DIRTY';
      else if (occ && room.hkStatus !== 'OCCUPIED') want = 'OCCUPIED';
      if (want && want !== room.hkStatus) {
        await this.prisma.room.update({ where: { id: room.id }, data: { hkStatus: want } });
        room.hkStatus = want;
      }
      if (room.hkStatus === 'OCCUPIED' && occ && iso(occ.toDate) !== date) await this.ensureTask(room.id, date, 'STAYOVER');
      if (room.hkStatus === 'VACANT_DIRTY') {
        const open = await this.prisma.housekeepingTask.count({ where: { roomId: room.id, date: d, status: { in: ['TODO', 'IN_PROGRESS'] } } });
        if (!open) await this.ensureTask(room.id, date, 'DEPARTURE');
      }
    }
  }

  async ensureTask(roomId: string, date: string, kind: 'DEPARTURE' | 'STAYOVER' | 'INSPECTION' | 'DEEP_CLEAN' | 'MAINTENANCE', tx: Tx = this.prisma, extra: { priority?: number; notes?: string } = {}) {
    const existing = await tx.housekeepingTask.findUnique({ where: { roomId_date_kind: { roomId, date: day(date), kind } } });
    if (existing) {
      // A room dirtied again after a finished clean needs the task reopened.
      if (kind === 'DEPARTURE' && ['DONE', 'INSPECTED', 'SKIPPED'].includes(existing.status))
        return tx.housekeepingTask.update({ where: { id: existing.id }, data: { status: 'TODO', startedAt: null, completedAt: null, inspectedAt: null, ...extra } });
      return existing;
    }
    return tx.housekeepingTask.create({ data: { roomId, date: day(date), kind, ...extra } });
  }

  @Cron('5 0 * * *', { timeZone: 'Africa/Kampala' })
  async midnight() {
    await this.syncToday().catch((e) => this.log.error(e));
  }

  /* ───────── rack ───────── */

  async rack(date = hotelToday()): Promise<RackRoomDTO[]> {
    await this.syncToday(date);
    const d = day(date);
    const [rooms, names, { occupant, arriving }, blocks, tasks] = await Promise.all([
      this.prisma.room.findMany({ orderBy: [{ floor: 'asc' }, { number: 'asc' }] }),
      this.booking.roomTypeNames(),
      this.occupancy(date),
      this.prisma.roomBlock.findMany({ where: { releasedAt: null, toDate: { gt: d } }, orderBy: { fromDate: 'asc' } }),
      this.prisma.housekeepingTask.findMany({ where: { date: d }, orderBy: { updatedAt: 'desc' } }),
    ]);
    return rooms.map((room) => {
      const o = occupant.get(room.id);
      const a = arriving.get(room.id);
      const b = blocks.find((x) => x.roomId === room.id);
      const task = tasks.find((x) => x.roomId === room.id && ['TODO', 'IN_PROGRESS'].includes(x.status)) ?? tasks.find((x) => x.roomId === room.id);
      return {
        id: room.id,
        number: room.number,
        floor: room.floor,
        roomType: { id: room.roomTypeId, name: names.get(room.roomTypeId) ?? 'Room' },
        hkStatus: room.hkStatus,
        isActive: room.isActive,
        notes: room.notes,
        occupant: o ? { reservationId: o.reservationId, code: o.reservation.code, guestName: o.reservation.contact.name, departure: iso(o.reservation.departure), departsToday: iso(o.toDate) <= date } : null,
        arriving: a ? { reservationId: a.reservationId, code: a.reservation.code, guestName: a.reservation.contact.name } : null,
        block: b ? { id: b.id, reason: b.reason, fromDate: iso(b.fromDate), toDate: iso(b.toDate), note: b.note } : null,
        task: task ? { id: task.id, kind: task.kind, status: task.status } : null,
      };
    });
  }

  /** Rooms that could take this reservation room for these nights. */
  async candidates(roomTypeId: string, from: string, to: string, exceptReservationId?: string) {
    const [rooms, taken, blocked] = await Promise.all([
      this.prisma.room.findMany({ where: { roomTypeId, isActive: true }, orderBy: { number: 'asc' } }),
      this.prisma.roomAssignment.findMany({ where: { releasedAt: null, fromDate: { lt: day(to) }, toDate: { gt: day(from) }, ...(exceptReservationId ? { reservationId: { not: exceptReservationId } } : {}) }, include: { reservation: { select: { code: true } } } }),
      this.prisma.roomBlock.findMany({ where: { releasedAt: null, fromDate: { lt: day(to) }, toDate: { gt: day(from) } } }),
    ]);
    return rooms.map((r) => {
      const t = taken.find((x) => x.roomId === r.id);
      const b = blocked.find((x) => x.roomId === r.id);
      return { id: r.id, number: r.number, floor: r.floor, hkStatus: r.hkStatus, free: !t && !b, why: t ? `Given to ${t.reservation.code}` : b ? `Blocked (${b.reason.toLowerCase().replace('_', ' ')})` : null };
    });
  }

  /* ───────── physical room units (room numbers) ───────── */

  async roomTypes() {
    const [rts, names] = await Promise.all([
      this.prisma.roomType.findMany({
        where: { deletedAt: null },
        orderBy: { order: 'asc' },
        include: {
          _count: { select: { rooms: { where: { isActive: true } } } },
          rooms: { orderBy: [{ floor: 'asc' }, { number: 'asc' }], select: { id: true, number: true, floor: true, isActive: true, hkStatus: true } },
        },
      }),
      this.booking.roomTypeNames(),
    ]);
    return rts.map((rt) => ({
      id: rt.id,
      slug: rt.slug,
      name: names.get(rt.id) ?? rt.slug,
      activeRoomsCount: rt._count.rooms,
      rooms: rt.rooms,
    }));
  }

  private async syncRoomTypeInventory(tx: Tx, roomTypeId: string) {
    const activeCount = await tx.room.count({ where: { roomTypeId, isActive: true } });
    const today = day(hotelToday());
    await tx.inventoryDay.updateMany({
      where: {
        roomTypeId,
        date: { gte: today },
      },
      data: { totalRooms: activeCount },
    });
  }

  async createRoom(input: z.infer<typeof zRoomCreateInput>, actor: AuthUser) {
    const cleanNum = input.number.trim().toUpperCase();
    const exists = await this.prisma.room.findUnique({ where: { number: cleanNum } });
    if (exists) throw conflict(`Room number "${cleanNum}" already exists.`);
    const rt = await this.prisma.roomType.findUnique({ where: { id: input.roomTypeId } });
    if (!rt || rt.deletedAt) throw notFound('Room type');

    const room = await this.prisma.$transaction(async (tx) => {
      const created = await tx.room.create({
        data: {
          number: cleanNum,
          floor: input.floor,
          roomTypeId: input.roomTypeId,
          hkStatus: input.hkStatus,
          isActive: input.isActive,
          notes: input.notes ?? null,
        },
      });
      await this.syncRoomTypeInventory(tx, input.roomTypeId);
      if (input.hkStatus === 'VACANT_DIRTY') {
        await this.ensureTask(created.id, hotelToday(), 'DEPARTURE', tx);
      }
      return created;
    });

    const names = await this.booking.roomTypeNames();
    await this.audit.record({
      actor,
      action: 'room.create',
      entityType: 'Room',
      entityId: room.id,
      summary: `Created physical Room ${room.number} (Floor ${room.floor}, ${names.get(room.roomTypeId) ?? 'Suite'})`,
      after: { number: room.number, floor: room.floor, roomTypeId: room.roomTypeId, hkStatus: room.hkStatus, isActive: room.isActive },
    });
    return room;
  }

  async updateRoom(id: string, input: z.infer<typeof zRoomUpdateInput>, actor: AuthUser) {
    const existing = await this.prisma.room.findUnique({ where: { id } });
    if (!existing) throw notFound('Room');

    const cleanNum = input.number ? input.number.trim().toUpperCase() : undefined;
    if (cleanNum && cleanNum !== existing.number) {
      const clash = await this.prisma.room.findUnique({ where: { number: cleanNum } });
      if (clash) throw conflict(`Room number "${cleanNum}" is already used by another room.`);
    }
    if (input.roomTypeId && input.roomTypeId !== existing.roomTypeId) {
      const rt = await this.prisma.roomType.findUnique({ where: { id: input.roomTypeId } });
      if (!rt || rt.deletedAt) throw notFound('Room type');
    }
    if (input.isActive === false && existing.hkStatus === 'OCCUPIED') {
      throw conflict(`Room ${existing.number} currently has a checked-in guest. Move or check out the guest before deactivating it.`);
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const r = await tx.room.update({
        where: { id },
        data: {
          ...(cleanNum !== undefined ? { number: cleanNum } : {}),
          ...(input.floor !== undefined ? { floor: input.floor } : {}),
          ...(input.roomTypeId !== undefined ? { roomTypeId: input.roomTypeId } : {}),
          ...(input.hkStatus !== undefined && existing.hkStatus !== 'OCCUPIED' ? { hkStatus: input.hkStatus } : {}),
          ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
          ...(input.notes !== undefined ? { notes: input.notes } : {}),
        },
      });
      await this.syncRoomTypeInventory(tx, existing.roomTypeId);
      if (input.roomTypeId && input.roomTypeId !== existing.roomTypeId) {
        await this.syncRoomTypeInventory(tx, input.roomTypeId);
      }
      return r;
    });

    await this.audit.record({
      actor,
      action: 'room.update',
      entityType: 'Room',
      entityId: id,
      summary: `Updated Room ${updated.number} (Floor ${updated.floor}, active=${updated.isActive})`,
      before: { number: existing.number, floor: existing.floor, roomTypeId: existing.roomTypeId, isActive: existing.isActive, notes: existing.notes },
      after: input,
    });
    return updated;
  }

  async deleteRoom(id: string, actor: AuthUser) {
    if (!['OWNER', 'MANAGER'].includes(actor.role)) {
      throw forbidden('Only the Owner or Manager can delete a physical room');
    }
    const existing = await this.prisma.room.findUnique({
      where: { id },
      include: { assignments: { where: { releasedAt: null }, include: { reservation: { select: { code: true, status: true } } } } },
    });
    if (!existing) throw notFound('Room');

    const activeAssign = existing.assignments.find((a) => ['IN_HOUSE', 'CONFIRMED', 'HELD'].includes(a.reservation.status));
    if (activeAssign) {
      throw conflict(`Room ${existing.number} is assigned to booking ${activeAssign.reservation.code}. Reassign that booking to another room first.`);
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.housekeepingTask.deleteMany({ where: { roomId: id } });
      await tx.roomBlock.deleteMany({ where: { roomId: id } });
      await tx.roomAssignment.deleteMany({ where: { roomId: id } });
      await tx.room.delete({ where: { id } });
      await this.syncRoomTypeInventory(tx, existing.roomTypeId);
    });

    await this.audit.record({
      actor,
      action: 'room.delete',
      entityType: 'Room',
      entityId: id,
      summary: `Deleted physical Room ${existing.number} (Floor ${existing.floor}) by ${actor.name} (${actor.role})`,
      before: { number: existing.number, floor: existing.floor, roomTypeId: existing.roomTypeId },
    });
    return { ok: true, deleted: true, number: existing.number };
  }

  /* ───────── housekeeping ───────── */

  async board(date = hotelToday()): Promise<HkBoardDTO> {
    if (date === hotelToday()) await this.syncToday(date);
    const d = day(date);
    const [tasks, rooms, names, { occupant, arriving }, staff] = await Promise.all([
      this.prisma.housekeepingTask.findMany({ where: { date: d }, include: { room: true } }),
      this.rack(date),
      this.booking.roomTypeNames(),
      this.occupancy(date),
      this.prisma.user.findMany({ where: { status: 'ACTIVE', role: { in: ['HOUSEKEEPING', 'MANAGER', 'OWNER'] } }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
    ]);
    const people = new Map(staff.map((s) => [s.id, s.name]));
    const missing = tasks.map((t) => t.assigneeId).filter((id): id is string => !!id && !people.has(id));
    if (missing.length) for (const u of await this.prisma.user.findMany({ where: { id: { in: missing } }, select: { id: true, name: true } })) people.set(u.id, u.name);
    const rank: Record<HkTaskStatus, number> = { IN_PROGRESS: 0, TODO: 1, DONE: 2, INSPECTED: 3, SKIPPED: 4 };
    const dto: HkTaskDTO[] = tasks
      .map((t) => {
        const arrival = arriving.has(t.roomId);
        const occ = occupant.get(t.roomId);
        return {
          id: t.id,
          date,
          kind: t.kind,
          status: t.status,
          priority: t.priority + (arrival && t.kind === 'DEPARTURE' ? 2 : 0),
          notes: t.notes,
          room: { id: t.room.id, number: t.room.number, floor: t.room.floor, roomTypeName: names.get(t.room.roomTypeId) ?? 'Room', hkStatus: t.room.hkStatus },
          assignee: t.assigneeId ? { id: t.assigneeId, name: people.get(t.assigneeId) ?? 'Staff' } : null,
          arrivalToday: arrival,
          guestFirstName: occ ? firstName(occ.reservation.contact.name) : null,
          startedAt: t.startedAt?.toISOString() ?? null,
          completedAt: t.completedAt?.toISOString() ?? null,
          inspectedAt: t.inspectedAt?.toISOString() ?? null,
        };
      })
      .sort((a, b) => rank[a.status] - rank[b.status] || b.priority - a.priority || a.room.number.localeCompare(b.room.number));
    const counts = Object.fromEntries(HK_TASK_STATUSES.map((s) => [s, dto.filter((t) => t.status === s).length])) as Record<HkTaskStatus, number>;
    return { date, tasks: dto, rooms, staff, counts };
  }

  async createTask(input: z.infer<typeof zHkTaskCreateInput>, actor: AuthUser) {
    const room = await this.prisma.room.findUnique({ where: { id: input.roomId } });
    if (!room) throw notFound('Room');
    const date = input.date || hotelToday();
    const d = day(date);

    const task = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.housekeepingTask.findUnique({
        where: { roomId_date_kind: { roomId: room.id, date: d, kind: input.kind } },
      });
      const saved = existing
        ? await tx.housekeepingTask.update({
            where: { id: existing.id },
            data: {
              status: ['DONE', 'INSPECTED', 'SKIPPED'].includes(existing.status) ? 'TODO' : existing.status,
              priority: input.priority,
              assigneeId: input.assigneeId !== undefined ? input.assigneeId : existing.assigneeId,
              notes: input.notes !== undefined ? input.notes : existing.notes,
              startedAt: ['DONE', 'INSPECTED', 'SKIPPED'].includes(existing.status) ? null : existing.startedAt,
              completedAt: ['DONE', 'INSPECTED', 'SKIPPED'].includes(existing.status) ? null : existing.completedAt,
              inspectedAt: ['DONE', 'INSPECTED', 'SKIPPED'].includes(existing.status) ? null : existing.inspectedAt,
            },
          })
        : await tx.housekeepingTask.create({
            data: {
              roomId: room.id,
              date: d,
              kind: input.kind,
              priority: input.priority,
              assigneeId: input.assigneeId ?? null,
              notes: input.notes ?? null,
            },
          });

      if (
        (input.kind === 'DEPARTURE' || input.kind === 'DEEP_CLEAN') &&
        ['VACANT_CLEAN', 'INSPECTED'].includes(room.hkStatus)
      ) {
        await tx.room.update({ where: { id: room.id }, data: { hkStatus: 'VACANT_DIRTY' } });
      }
      return saved;
    });

    await this.audit.record({
      actor,
      action: 'housekeeping.create',
      entityType: 'Room',
      entityId: room.id,
      summary: `Dispatched ${input.kind.toLowerCase().replace('_', ' ')} task for Room ${room.number}`,
    });
    return task;
  }

  async deleteTask(id: string, actor: AuthUser) {
    const task = await this.prisma.housekeepingTask.findUnique({ where: { id }, include: { room: true } });
    if (!task) throw notFound('Task');
    await this.prisma.housekeepingTask.delete({ where: { id } });
    await this.audit.record({
      actor,
      action: 'housekeeping.delete',
      entityType: 'Room',
      entityId: task.roomId,
      summary: `Removed ${task.kind.toLowerCase()} task on Room ${task.room.number}`,
    });
    return { ok: true };
  }

  async patchTask(id: string, body: z.infer<typeof zHkTaskPatch>, actor: AuthUser) {
    const task = await this.prisma.housekeepingTask.findUnique({ where: { id }, include: { room: true } });
    if (!task) throw notFound('Task');
    const supervisor = has(actor, 'rooms:inspect');
    if (body.assigneeId !== undefined && !supervisor && body.assigneeId !== actor.id && body.assigneeId !== null) throw forbidden('Only a supervisor can give a room to someone else');
    if (body.status === 'INSPECTED' && !supervisor) throw forbidden('A supervisor inspects the room');
    if (body.status === 'INSPECTED' && task.status !== 'DONE' && task.status !== 'INSPECTED') throw badRequest('Clean the room before inspecting it');

    const data: Prisma.HousekeepingTaskUpdateInput = {};
    if (body.notes !== undefined) data.notes = body.notes;
    if (body.priority !== undefined) data.priority = body.priority;
    if (body.assigneeId !== undefined) data.assigneeId = body.assigneeId;
    let roomStatus: HkStatus | null = null;
    const vacant = !['OCCUPIED', 'BLOCKED', 'OUT_OF_ORDER'].includes(task.room.hkStatus);
    const cleans = task.kind === 'DEPARTURE' || task.kind === 'DEEP_CLEAN';
    switch (body.status) {
      case 'IN_PROGRESS':
        Object.assign(data, { status: 'IN_PROGRESS', startedAt: task.startedAt ?? new Date(), completedAt: null, inspectedAt: null, ...(task.assigneeId ? {} : { assigneeId: actor.id }) });
        if (cleans && vacant && ['DONE', 'INSPECTED'].includes(task.status)) roomStatus = 'VACANT_DIRTY';
        break;
      case 'DONE':
        Object.assign(data, { status: 'DONE', completedAt: new Date(), completedById: actor.id, startedAt: task.startedAt ?? new Date() });
        if (cleans && vacant) roomStatus = 'VACANT_CLEAN';
        break;
      case 'INSPECTED':
        Object.assign(data, { status: 'INSPECTED', inspectedAt: new Date(), inspectedById: actor.id });
        if (vacant) roomStatus = 'INSPECTED';
        break;
      case 'SKIPPED':
        Object.assign(data, { status: 'SKIPPED', completedAt: new Date(), completedById: actor.id });
        break;
      case 'TODO':
        Object.assign(data, { status: 'TODO', startedAt: null, completedAt: null, inspectedAt: null });
        if (cleans && vacant) roomStatus = 'VACANT_DIRTY';
        break;
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.housekeepingTask.update({ where: { id }, data });
      if (roomStatus) await tx.room.update({ where: { id: task.roomId }, data: { hkStatus: roomStatus } });
    });
    if (body.status) await this.audit.record({ actor, action: 'housekeeping.task', entityType: 'Room', entityId: task.roomId, summary: `Room ${task.room.number}: ${task.kind.toLowerCase()} → ${body.status.toLowerCase().replace('_', ' ')}` });
    return { ok: true };
  }

  /** Quick status from the rack (dirty/clean/inspected). Occupancy and blocks come from their own flows. */
  async setStatus(roomId: string, status: HkStatus, note: string | undefined, actor: AuthUser) {
    const room = await this.prisma.room.findUnique({ where: { id: roomId } });
    if (!room) throw notFound('Room');
    if (!['VACANT_CLEAN', 'VACANT_DIRTY', 'INSPECTED'].includes(status)) throw badRequest('Occupied comes from check-in; blocked and out of order come from a room block.');
    if (OUT_OF_SERVICE.includes(room.hkStatus)) throw badRequest(`Room ${room.number} is ${room.hkStatus === 'BLOCKED' ? 'blocked' : 'out of order'}. Release the block first.`);
    if (room.hkStatus === 'OCCUPIED') throw badRequest(`Room ${room.number} has a guest in it.`);
    if (status === 'INSPECTED' && !has(actor, 'rooms:inspect')) throw forbidden('A supervisor inspects the room');
    const today = hotelToday();
    await this.prisma.$transaction(async (tx) => {
      await tx.room.update({ where: { id: roomId }, data: { hkStatus: status, ...(note ? { notes: note } : {}) } });
      if (status === 'VACANT_DIRTY') await this.ensureTask(roomId, today, 'DEPARTURE', tx);
      else await tx.housekeepingTask.updateMany({ where: { roomId, date: day(today), status: { in: ['TODO', 'IN_PROGRESS'] }, kind: { in: ['DEPARTURE', 'DEEP_CLEAN'] } }, data: { status: status === 'INSPECTED' ? 'INSPECTED' : 'DONE', completedAt: new Date(), completedById: actor.id, ...(status === 'INSPECTED' ? { inspectedAt: new Date(), inspectedById: actor.id } : {}) } });
    });
    await this.audit.record({ actor, action: 'room.status', entityType: 'Room', entityId: roomId, summary: `Room ${room.number} → ${status.toLowerCase().replace('_', ' ')}` });
    return { ok: true };
  }

  /* ───────── blocks ───────── */

  async blocks() {
    const rows = await this.prisma.roomBlock.findMany({ where: { releasedAt: null, toDate: { gt: day(hotelToday()) } }, include: { room: true }, orderBy: { fromDate: 'asc' } });
    return rows.map((b) => ({ id: b.id, room: { id: b.roomId, number: b.room.number }, fromDate: iso(b.fromDate), toDate: iso(b.toDate), reason: b.reason, note: b.note }));
  }

  async block(input: z.infer<typeof zRoomBlockInput>, actor: AuthUser) {
    const today = hotelToday();
    if (input.toDate <= today) throw badRequest('That block is entirely in the past');
    const from = input.fromDate < today ? today : input.fromDate;
    const room = await this.prisma.room.findUnique({ where: { id: input.roomId } });
    if (!room?.isActive) throw notFound('Room');
    const nights = nightsOf(from, input.toDate);
    const block = await this.prisma.$transaction(async (tx) => {
      const clash = await tx.roomAssignment.findFirst({ where: { roomId: room.id, releasedAt: null, fromDate: { lt: day(input.toDate) }, toDate: { gt: day(from) } }, include: { reservation: { select: { code: true } } } });
      if (clash) throw conflict(`Room ${room.number} is given to ${clash.reservation.code} on some of those nights. Move that booking to another room first.`);
      const full = await this.inventory.block(tx, room.roomTypeId, nights);
      if (full.length) throw conflict(`Blocking room ${room.number} would oversell ${full.slice(0, 3).join(', ')}${full.length > 3 ? ` and ${full.length - 3} more nights` : ''}: every room of that type is already sold.`);
      try {
        return await tx.roomBlock.create({ data: { roomId: room.id, fromDate: day(from), toDate: day(input.toDate), reason: input.reason, note: input.note ?? null, createdById: actor.id } });
      } catch (e) {
        if ((e as { code?: string }).code === 'P2002' || String(e).includes('room_block_no_overlap')) throw conflict(`Room ${room.number} is already blocked on some of those nights.`);
        throw e;
      }
    });
    await this.audit.record({ actor, action: 'room.block', entityType: 'Room', entityId: room.id, summary: `Blocked room ${room.number} ${from} → ${input.toDate} (${input.reason.toLowerCase().replace('_', ' ')})` });
    await this.syncToday();
    return { id: block.id };
  }

  async releaseBlock(id: string, actor: AuthUser) {
    const today = hotelToday();
    const b = await this.prisma.roomBlock.findUnique({ where: { id }, include: { room: true } });
    if (!b || b.releasedAt) throw notFound('Block');
    await this.prisma.$transaction(async (tx) => {
      const from = iso(b.fromDate) > today ? iso(b.fromDate) : today;
      await tx.roomBlock.update({ where: { id }, data: { releasedAt: new Date(), ...(from > iso(b.fromDate) && from < iso(b.toDate) ? { toDate: day(from) } : {}) } });
      if (from < iso(b.toDate)) await this.inventory.unblock(tx, b.room.roomTypeId, nightsOf(from, iso(b.toDate)));
    });
    await this.audit.record({ actor, action: 'room.unblock', entityType: 'Room', entityId: b.roomId, summary: `Released block on room ${b.room.number}` });
    await this.syncToday();
    return { ok: true };
  }
}
