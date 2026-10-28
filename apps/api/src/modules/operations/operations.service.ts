import { randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type {
  CurrencyCode,
  Department,
  HealthClubAccessLogDTO,
  HealthClubDashboardDTO,
  HealthClubMembershipDTO,
  InventoryDashboardDTO,
  InventoryItemDTO,
  PosInHouseGuestDTO,
  PosOrderDTO,
  PosOutletDTO,
  QuotationDTO,
  RequisitionDTO,
  StaffAnnouncementDTO,
  StockMovementDTO,
  TerminalDeviceDTO,
} from '@reberon/contracts';
import { z } from 'zod';
import {
  zAppendPosOrderItemsInput,
  zCheckInHealthClubInput,
  zConvertQuotationToInvoiceInput,
  zCreateAnnouncementInput,
  zCreateInventoryItemInput,
  zCreateMembershipInput,
  zCreatePosCategoryInput,
  zCreatePosItemInput,
  zCreatePosOrderInput,
  zCreateQuotationInput,
  zCreateRequisitionInput,
  zRecordStockMovementInput,
  zReviewRequisitionInput,
  zSettlePosOrderInput,
  zTogglePosItemInput,
} from '@reberon/contracts';
import { PrismaService } from '../../common/prisma.service.js';
import { AuditService } from '../../common/audit.service.js';
import type { AuthUser } from '../../common/auth.js';
import { badRequest, notFound } from '../../common/errors.js';
import { DocumentsService } from '../documents/documents.service.js';

@Injectable()
export class OperationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly docs: DocumentsService,
  ) {}

  private async nextSeq(prefix: string): Promise<string> {
    const year = Number(new Intl.DateTimeFormat('en-CA', { year: 'numeric', timeZone: 'Africa/Kampala' }).format(new Date()));
    const series = `${prefix}-${year}`;
    const [row] = await this.prisma.$queryRaw<{ n: number }[]>`
      INSERT INTO "DocumentSequence" (series, next) VALUES (${series}, 2)
      ON CONFLICT (series) DO UPDATE SET next = "DocumentSequence".next + 1
      RETURNING next - 1 AS n`;
    return `${series}-${String(Number(row!.n)).padStart(5, '0')}`;
  }

  /* ───────────────────────── 1. Point of Sale (Kitchen, Bar, Health Club, Conference) ───────────────────────── */

  async outlets(): Promise<PosOutletDTO[]> {
    const [outlets, invItems] = await Promise.all([
      this.prisma.posOutlet.findMany({
        orderBy: { createdAt: 'asc' },
        include: {
          categories: {
            orderBy: { sortOrder: 'asc' },
            include: { items: { orderBy: { name: 'asc' } } },
          },
        },
      }),
      this.prisma.inventoryItem.findMany({ select: { id: true, onHand: true } }),
    ]);
    const stockMap = new Map(invItems.map((i) => [i.id, i.onHand]));

    return outlets.map((o) => ({
      id: o.id,
      code: o.code,
      name: o.name,
      type: o.type,
      description: o.description,
      deviceStation: o.deviceStation,
      isActive: o.isActive,
      categories: o.categories.map((c) => ({
        id: c.id,
        outletId: c.outletId,
        name: c.name,
        sortOrder: c.sortOrder,
        items: c.items.map((it) => ({
          id: it.id,
          categoryId: it.categoryId,
          sku: it.sku,
          name: it.name,
          description: it.description,
          priceMinorUGX: it.priceMinorUGX.toString(),
          priceMinorUSD: it.priceMinorUSD?.toString() ?? null,
          isAvailable: it.isAvailable,
          prepMinutes: it.prepMinutes,
          inventoryItemId: it.inventoryItemId,
          stockOnHand: it.inventoryItemId ? (stockMap.get(it.inventoryItemId) ?? 0) : null,
        })),
      })),
    }));
  }

  async orders(q: { outletId?: string; status?: string } = {}): Promise<PosOrderDTO[]> {
    const rows = await this.prisma.posOrder.findMany({
      where: {
        ...(q.outletId ? { outletId: q.outletId } : {}),
        ...(q.status ? { status: q.status as any } : {}),
      },
      include: { outlet: true, items: true },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return rows.map((r) => this.mapOrder(r));
  }

  private mapOrder(r: any): PosOrderDTO {
    return {
      id: r.id,
      orderNumber: r.orderNumber,
      outletId: r.outletId,
      outletName: r.outlet.name,
      outletType: r.outlet.type,
      reservationId: r.reservationId,
      folioLineId: r.folioLineId ?? null,
      documentId: r.documentId,
      isSettled: Boolean(r.documentId || r.folioLineId || r.totalMinor === 0n),
      tableOrRoom: r.tableOrRoom,
      customerName: r.customerName,
      customerPhone: r.customerPhone,
      status: r.status,
      paymentMethod: r.paymentMethod,
      currency: r.currency as CurrencyCode,
      subtotalMinor: r.subtotalMinor.toString(),
      discountMinor: r.discountMinor.toString(),
      totalMinor: r.totalMinor.toString(),
      notes: r.notes,
      servedByName: r.servedByName,
      items: r.items.map((i: any) => ({
        id: i.id,
        itemId: i.itemId,
        itemName: i.itemName,
        quantity: i.quantity,
        unitPriceMinor: i.unitPriceMinor.toString(),
        totalMinor: i.totalMinor.toString(),
        notes: i.notes,
      })),
      createdAt: r.createdAt.toISOString(),
    };
  }

  async inHouseGuests(): Promise<PosInHouseGuestDTO[]> {
    const [reservations, roomTypes] = await Promise.all([
      this.prisma.reservation.findMany({
        where: { status: { in: ['IN_HOUSE', 'CONFIRMED'] } },
        include: {
          contact: true,
          rooms: true,
          assignments: {
            where: { releasedAt: null },
            include: { room: true },
          },
        },
        orderBy: [{ status: 'desc' }, { arrival: 'asc' }],
        take: 100,
      }),
      this.prisma.roomType.findMany({ select: { id: true, name: true } }),
    ]);
    const rtMap = new Map(
      roomTypes.map((rt) => {
        const n = rt.name as Record<string, string> | null;
        return [rt.id, n?.en ?? 'Room'];
      }),
    );
    return reservations.map((r) => {
      const assignedRoom = r.assignments[0]?.room?.number ?? null;
      const rtId = r.rooms[0]?.roomTypeId;
      return {
        reservationId: r.id,
        code: r.code,
        status: r.status,
        guestName: r.contact.name,
        guestPhone: r.contact.phone,
        roomNumber: assignedRoom,
        roomTypeName: rtId ? (rtMap.get(rtId) ?? null) : null,
      };
    });
  }

  async posStockItems() {
    const items = await this.prisma.inventoryItem.findMany({
      where: { category: { in: ['BEVERAGE', 'FOOD_KITCHEN', 'CONSUMABLE'] } },
      orderBy: { name: 'asc' },
      select: { id: true, sku: true, name: true, category: true, department: true, onHand: true, unit: true },
    });
    return items;
  }

  async createOrder(input: z.infer<typeof zCreatePosOrderInput>, actor: AuthUser): Promise<PosOrderDTO> {
    const outlet = await this.prisma.posOutlet.findUnique({ where: { id: input.outletId } });
    if (!outlet) throw notFound('POS Outlet');

    const dbItems = await this.prisma.posItem.findMany({
      where: { id: { in: input.items.map((x) => x.itemId) } },
    });
    const itemMap = new Map(dbItems.map((x) => [x.id, x]));

    let subtotal = 0n;
    const orderLines = input.items.map((reqItem) => {
      const dbIt = itemMap.get(reqItem.itemId);
      if (!dbIt) throw badRequest('One or more menu items were not found');
      if (!dbIt.isAvailable) throw badRequest(`${dbIt.name} is currently marked unavailable`);
      const unitPrice = input.currency === 'USD' ? (dbIt.priceMinorUSD ?? dbIt.priceMinorUGX) : dbIt.priceMinorUGX;
      const lineTotal = unitPrice * BigInt(reqItem.quantity);
      subtotal += lineTotal;
      return {
        itemId: dbIt.id,
        itemName: dbIt.name,
        quantity: reqItem.quantity,
        unitPriceMinor: unitPrice,
        totalMinor: lineTotal,
        notes: reqItem.notes ?? null,
        inventoryItemId: dbIt.inventoryItemId,
      };
    });

    const discount = BigInt(input.discountMinor || '0');
    const total = subtotal > discount ? subtotal - discount : 0n;
    const orderNumber = await this.nextSeq('ORD');
    const settleNow = input.settleNow !== false;

    let folioLineId: string | null = null;
    let documentId: string | null = null;
    let guestName = input.customerName || 'Walk-in Guest';
    let guestPhone = input.customerPhone || null;

    if (input.reservationId) {
      const res = await this.prisma.reservation.findUnique({
        where: { id: input.reservationId },
        include: { contact: true, folio: true },
      });
      if (res) {
        if (!input.customerName) guestName = res.contact.name;
        if (!input.customerPhone) guestPhone = res.contact.phone;
        if (settleNow && input.paymentMethod === 'ROOM_FOLIO') {
          if (!res.folio) throw notFound('Reservation folio');
          const summary = orderLines.map((l) => `${l.quantity}× ${l.itemName}`).join(', ');
          const fl = await this.prisma.folioLine.create({
            data: {
              folioId: res.folio.id,
              kind: 'EXTRA',
              date: new Date(),
              description: `${outlet.name} (${orderNumber}): ${summary}`,
              amountMinor: total,
              postedById: actor.id,
            },
          });
          folioLineId = fl.id;
        }
      } else if (settleNow && input.paymentMethod === 'ROOM_FOLIO') {
        throw notFound('Reservation folio');
      }
    } else if (settleNow && input.paymentMethod === 'ROOM_FOLIO') {
      throw badRequest('Select an active room reservation to charge to a room folio');
    }

    if (settleNow && input.paymentMethod !== 'ROOM_FOLIO' && total > 0n) {
      const todayIso = new Date().toISOString().slice(0, 10);
      const doc = await this.docs.issueDirectDocument({
        kind: 'RECEIPT',
        reservationId: input.reservationId ?? null,
        currency: input.currency,
        amountMinor: total,
        issuedTo: { name: guestName, phone: guestPhone, email: null },
        lines: orderLines.map((l) => ({
          date: todayIso,
          description: `${l.quantity} × ${l.itemName}${l.notes ? ` (${l.notes})` : ''}`,
          amountMinor: l.totalMinor.toString(),
        })),
        payment: {
          method: input.paymentMethod.replace('_', ' '),
          reference: orderNumber,
          purpose: `${outlet.name} — ${orderLines.map((l) => `${l.quantity}× ${l.itemName}`).join(', ')}`,
        },
        note: input.tableOrRoom ? `Station / Table: ${input.tableOrRoom}` : null,
        actor: { id: actor.id, name: actor.name },
      });
      documentId = doc.id;
    }

    const defaultStatus =
      input.status ??
      (!settleNow
        ? 'PREPARING'
        : outlet.type === 'KITCHEN'
          ? 'PREPARING'
          : 'COMPLETED');

    const created = await this.prisma.posOrder.create({
      data: {
        orderNumber,
        outletId: outlet.id,
        reservationId: input.reservationId ?? null,
        folioLineId,
        documentId,
        tableOrRoom: input.tableOrRoom ?? null,
        customerName: guestName,
        customerPhone: guestPhone,
        status: defaultStatus,
        paymentMethod: input.paymentMethod,
        currency: input.currency,
        subtotalMinor: subtotal,
        discountMinor: discount,
        totalMinor: total,
        notes: input.notes ?? null,
        servedById: actor.id,
        servedByName: actor.name,
        items: {
          create: orderLines.map((l) => ({
            itemId: l.itemId,
            itemName: l.itemName,
            quantity: l.quantity,
            unitPriceMinor: l.unitPriceMinor,
            totalMinor: l.totalMinor,
            notes: l.notes,
          })),
        },
      },
      include: { outlet: true, items: true },
    });

    // Auto-decrement inventory for items linked to stock SKUs
    for (const l of orderLines) {
      if (l.inventoryItemId) {
        const inv = await this.prisma.inventoryItem.findUnique({ where: { id: l.inventoryItemId } });
        if (inv) {
          const nextOnHand = Math.max(0, inv.onHand - l.quantity);
          await this.prisma.inventoryItem.update({
            where: { id: inv.id },
            data: { onHand: nextOnHand },
          });
          await this.prisma.stockMovement.create({
            data: {
              itemId: inv.id,
              type: 'STOCK_OUT',
              quantity: l.quantity,
              balanceAfter: nextOnHand,
              department: outlet.type,
              reference: orderNumber,
              notes: `POS Sale: ${l.quantity}× ${l.itemName}`,
              recordedById: actor.id,
              recordedByName: actor.name,
            },
          });
        }
      }
    }

    await this.audit.record({
      actor,
      action: 'pos.order.create',
      entityType: 'PosOrder',
      entityId: created.id,
      summary: `${outlet.name} order ${orderNumber} (${settleNow ? input.paymentMethod : 'OPEN TAB'})`,
    });

    return this.mapOrder(created);
  }

  async appendOrderItems(
    orderId: string,
    input: z.infer<typeof zAppendPosOrderItemsInput>,
    actor: AuthUser,
  ): Promise<PosOrderDTO> {
    const existing = await this.prisma.posOrder.findUnique({
      where: { id: orderId },
      include: { outlet: true, items: true },
    });
    if (!existing) throw notFound('POS Order');
    if (existing.status === 'CANCELLED') throw badRequest('Cannot add items to a cancelled order');
    if (existing.documentId || existing.folioLineId) {
      throw badRequest('This order is already settled. Create a new order instead.');
    }

    const dbItems = await this.prisma.posItem.findMany({
      where: { id: { in: input.items.map((x) => x.itemId) } },
    });
    const itemMap = new Map(dbItems.map((x) => [x.id, x]));

    let addedSubtotal = 0n;
    const newLines = input.items.map((reqItem) => {
      const dbIt = itemMap.get(reqItem.itemId);
      if (!dbIt) throw badRequest('One or more menu items were not found');
      if (!dbIt.isAvailable) throw badRequest(`${dbIt.name} is currently marked unavailable`);
      const unitPrice = existing.currency === 'USD' ? (dbIt.priceMinorUSD ?? dbIt.priceMinorUGX) : dbIt.priceMinorUGX;
      const lineTotal = unitPrice * BigInt(reqItem.quantity);
      addedSubtotal += lineTotal;
      return {
        itemId: dbIt.id,
        itemName: dbIt.name,
        quantity: reqItem.quantity,
        unitPriceMinor: unitPrice,
        totalMinor: lineTotal,
        notes: reqItem.notes ?? null,
        inventoryItemId: dbIt.inventoryItemId,
      };
    });

    const nextSubtotal = existing.subtotalMinor + addedSubtotal;
    const nextTotal = nextSubtotal > existing.discountMinor ? nextSubtotal - existing.discountMinor : 0n;
    const combinedNotes = input.notes
      ? existing.notes
        ? `${existing.notes} | ${input.notes}`
        : input.notes
      : existing.notes;

    const updated = await this.prisma.posOrder.update({
      where: { id: orderId },
      data: {
        subtotalMinor: nextSubtotal,
        totalMinor: nextTotal,
        notes: combinedNotes,
        status: 'PREPARING',
        items: {
          create: newLines.map((l) => ({
            itemId: l.itemId,
            itemName: l.itemName,
            quantity: l.quantity,
            unitPriceMinor: l.unitPriceMinor,
            totalMinor: l.totalMinor,
            notes: l.notes,
          })),
        },
      },
      include: { outlet: true, items: true },
    });

    for (const l of newLines) {
      if (l.inventoryItemId) {
        const inv = await this.prisma.inventoryItem.findUnique({ where: { id: l.inventoryItemId } });
        if (inv) {
          const nextOnHand = Math.max(0, inv.onHand - l.quantity);
          await this.prisma.inventoryItem.update({
            where: { id: inv.id },
            data: { onHand: nextOnHand },
          });
          await this.prisma.stockMovement.create({
            data: {
              itemId: inv.id,
              type: 'STOCK_OUT',
              quantity: l.quantity,
              balanceAfter: nextOnHand,
              department: existing.outlet.type,
              reference: existing.orderNumber,
              notes: `POS Tab Add: ${l.quantity}× ${l.itemName}`,
              recordedById: actor.id,
              recordedByName: actor.name,
            },
          });
        }
      }
    }

    await this.audit.record({
      actor,
      action: 'pos.order.append',
      entityType: 'PosOrder',
      entityId: orderId,
      summary: `Added ${newLines.length} item(s) to ${existing.orderNumber}`,
    });

    return this.mapOrder(updated);
  }

  async settleOrder(
    orderId: string,
    input: z.infer<typeof zSettlePosOrderInput>,
    actor: AuthUser,
  ): Promise<PosOrderDTO> {
    const order = await this.prisma.posOrder.findUnique({
      where: { id: orderId },
      include: { outlet: true, items: true },
    });
    if (!order) throw notFound('POS Order');
    if (order.status === 'CANCELLED') throw badRequest('Cannot settle a cancelled order');
    if (order.documentId || order.folioLineId) {
      return this.mapOrder(order);
    }

    const discount = input.discountMinor !== undefined ? BigInt(input.discountMinor) : order.discountMinor;
    const total = order.subtotalMinor > discount ? order.subtotalMinor - discount : 0n;
    const reservationId = input.reservationId ?? order.reservationId;
    let guestName = input.customerName || order.customerName || 'Walk-in Guest';
    let guestPhone = input.customerPhone || order.customerPhone || null;
    let folioLineId: string | null = null;
    let documentId: string | null = null;

    if (input.paymentMethod === 'ROOM_FOLIO') {
      if (!reservationId) throw badRequest('Select an active room reservation to charge to a room folio');
      const res = await this.prisma.reservation.findUnique({
        where: { id: reservationId },
        include: { contact: true, folio: true },
      });
      if (!res || !res.folio) throw notFound('Reservation folio');
      guestName = res.contact.name;
      guestPhone = res.contact.phone;
      const summary = order.items.map((l) => `${l.quantity}× ${l.itemName}`).join(', ');
      const fl = await this.prisma.folioLine.create({
        data: {
          folioId: res.folio.id,
          kind: 'EXTRA',
          date: new Date(),
          description: `${order.outlet.name} (${order.orderNumber}): ${summary}`,
          amountMinor: total,
          postedById: actor.id,
        },
      });
      folioLineId = fl.id;
    } else if (total > 0n) {
      const todayIso = new Date().toISOString().slice(0, 10);
      const doc = await this.docs.issueDirectDocument({
        kind: 'RECEIPT',
        reservationId: reservationId ?? null,
        currency: order.currency,
        amountMinor: total,
        issuedTo: { name: guestName, phone: guestPhone, email: null },
        lines: order.items.map((l) => ({
          date: todayIso,
          description: `${l.quantity} × ${l.itemName}${l.notes ? ` (${l.notes})` : ''}`,
          amountMinor: l.totalMinor.toString(),
        })),
        payment: {
          method: input.paymentMethod.replace('_', ' '),
          reference: order.orderNumber,
          purpose: `${order.outlet.name} — ${order.items.map((l) => `${l.quantity}× ${l.itemName}`).join(', ')}`,
        },
        note: order.tableOrRoom ? `Station / Table: ${order.tableOrRoom}` : null,
        actor: { id: actor.id, name: actor.name },
      });
      documentId = doc.id;
    }

    const updated = await this.prisma.posOrder.update({
      where: { id: orderId },
      data: {
        paymentMethod: input.paymentMethod,
        reservationId: reservationId ?? null,
        customerName: guestName,
        customerPhone: guestPhone,
        discountMinor: discount,
        totalMinor: total,
        folioLineId,
        documentId,
        status: 'COMPLETED',
      },
      include: { outlet: true, items: true },
    });

    await this.audit.record({
      actor,
      action: 'pos.order.settle',
      entityType: 'PosOrder',
      entityId: orderId,
      summary: `Settled ${order.orderNumber} via ${input.paymentMethod}`,
    });

    return this.mapOrder(updated);
  }

  async updateOrderStatus(id: string, status: PosOrderDTO['status'], actor: AuthUser): Promise<PosOrderDTO> {
    const before = await this.prisma.posOrder.findUnique({
      where: { id },
      include: { outlet: true, items: { include: { item: true } } },
    });
    if (!before) throw notFound('POS Order');

    const updated = await this.prisma.posOrder.update({
      where: { id },
      data: { status },
      include: { outlet: true, items: true },
    });

    // If order is being cancelled and wasn't already cancelled, restore stock
    if (status === 'CANCELLED' && before.status !== 'CANCELLED') {
      for (const l of before.items) {
        const invId = l.item?.inventoryItemId;
        if (invId) {
          const inv = await this.prisma.inventoryItem.findUnique({ where: { id: invId } });
          if (inv) {
            const nextOnHand = inv.onHand + l.quantity;
            await this.prisma.inventoryItem.update({
              where: { id: inv.id },
              data: { onHand: nextOnHand },
            });
            await this.prisma.stockMovement.create({
              data: {
                itemId: inv.id,
                type: 'ADJUSTMENT',
                quantity: l.quantity,
                balanceAfter: nextOnHand,
                department: before.outlet.type,
                reference: before.orderNumber,
                notes: `POS Order Cancelled: Restored ${l.quantity}× ${l.itemName}`,
                recordedById: actor.id,
                recordedByName: actor.name,
              },
            });
          }
        }
      }
    }

    await this.audit.record({
      actor,
      action: 'pos.order.status',
      entityType: 'PosOrder',
      entityId: id,
      summary: `Order ${updated.orderNumber} marked ${status}`,
    });
    return this.mapOrder(updated);
  }

  async createCategory(input: z.infer<typeof zCreatePosCategoryInput>, actor: AuthUser) {
    const cat = await this.prisma.posCategory.create({
      data: {
        outletId: input.outletId,
        name: input.name,
        sortOrder: input.sortOrder,
      },
    });
    await this.audit.record({
      actor,
      action: 'pos.category.create',
      entityType: 'PosCategory',
      entityId: cat.id,
      summary: `Created POS category ${cat.name}`,
    });
    return cat;
  }

  async createItem(input: z.infer<typeof zCreatePosItemInput>, actor: AuthUser) {
    const existingSku = await this.prisma.posItem.findUnique({ where: { sku: input.sku } });
    if (existingSku) throw badRequest(`Menu SKU "${input.sku}" already exists`);
    const item = await this.prisma.posItem.create({
      data: {
        categoryId: input.categoryId,
        sku: input.sku.toUpperCase(),
        name: input.name,
        description: input.description ?? null,
        priceMinorUGX: BigInt(input.priceMinorUGX),
        priceMinorUSD: input.priceMinorUSD ? BigInt(input.priceMinorUSD) : null,
        prepMinutes: input.prepMinutes ?? null,
        inventoryItemId: input.inventoryItemId || null,
        isAvailable: input.isAvailable ?? true,
      },
    });
    await this.audit.record({
      actor,
      action: 'pos.item.create',
      entityType: 'PosItem',
      entityId: item.id,
      summary: `Added POS menu item ${item.name} (${item.sku})`,
    });
    return {
      id: item.id,
      sku: item.sku,
      name: item.name,
      priceMinorUGX: item.priceMinorUGX.toString(),
      isAvailable: item.isAvailable,
    };
  }

  async toggleItem(id: string, input: z.infer<typeof zTogglePosItemInput>, actor: AuthUser) {
    const item = await this.prisma.posItem.update({
      where: { id },
      data: {
        ...(input.isAvailable !== undefined ? { isAvailable: input.isAvailable } : {}),
        ...(input.name ? { name: input.name } : {}),
        ...(input.sku ? { sku: input.sku.toUpperCase() } : {}),
        ...(input.categoryId ? { categoryId: input.categoryId } : {}),
        ...(input.description !== undefined ? { description: input.description || null } : {}),
        ...(input.priceMinorUGX ? { priceMinorUGX: BigInt(input.priceMinorUGX) } : {}),
        ...(input.priceMinorUSD !== undefined
          ? { priceMinorUSD: input.priceMinorUSD ? BigInt(input.priceMinorUSD) : null }
          : {}),
        ...(input.prepMinutes !== undefined ? { prepMinutes: input.prepMinutes } : {}),
        ...(input.inventoryItemId !== undefined
          ? { inventoryItemId: input.inventoryItemId || null }
          : {}),
      },
    });
    await this.audit.record({
      actor,
      action: 'pos.item.update',
      entityType: 'PosItem',
      entityId: id,
      summary: `Updated POS item ${item.name}`,
    });
    return { id: item.id, isAvailable: item.isAvailable };
  }

  async deleteItem(id: string, actor: AuthUser) {
    const item = await this.prisma.posItem.findUnique({
      where: { id },
      include: { _count: { select: { orderItems: true } } },
    });
    if (!item) throw notFound('POS Menu Item');
    if (item._count.orderItems > 0) {
      // Soft-disable if historical orders reference it
      await this.prisma.posItem.update({ where: { id }, data: { isAvailable: false } });
      return { deleted: false, archived: true };
    }
    await this.prisma.posItem.delete({ where: { id } });
    await this.audit.record({
      actor,
      action: 'pos.item.delete',
      entityType: 'PosItem',
      entityId: id,
      summary: `Deleted POS menu item ${item.name} (${item.sku})`,
    });
    return { deleted: true };
  }

  async renderPosOrderPrintHtml(id: string, kind: 'KOT' | 'BILL', autoprint: boolean) {
    const order = await this.prisma.posOrder.findUnique({
      where: { id },
      include: { outlet: true, items: true },
    });
    if (!order) throw notFound('POS Order');
    const nonce = randomBytes(16).toString('base64');
    const esc = (s: string | null | undefined) =>
      String(s ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    const fmtMoney = (minor: bigint, curr: string) =>
      `${curr} ${Number(minor).toLocaleString('en-UG')}`;
    const timeStr = new Intl.DateTimeFormat('en-GB', {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: 'Africa/Kampala',
    }).format(order.createdAt);

    const isKot = kind === 'KOT';
    const title = isKot ? `KITCHEN / BAR ORDER TICKET` : `GUEST BILL CHECK`;
    const rowsHtml = order.items
      .map(
        (it) => `
        <tr>
          <td class="qty">${it.quantity}×</td>
          <td class="item">
            <div class="name">${esc(it.itemName)}</div>
            ${it.notes ? `<div class="note">▸ ${esc(it.notes)}</div>` : ''}
          </td>
          ${!isKot ? `<td class="amt">${fmtMoney(it.totalMinor, order.currency)}</td>` : ''}
        </tr>`,
      )
      .join('');

    const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${esc(order.orderNumber)} · ${title}</title>
  <style nonce="${nonce}">
    @page { size: 80mm auto; margin: 4mm; }
    * { box-sizing: border-box; }
    body {
      font-family: ui-monospace, 'Cascadia Mono', 'Courier New', monospace;
      width: 72mm;
      margin: 0 auto;
      padding: 2mm 0;
      color: #000;
      font-size: 12px;
      line-height: 1.35;
    }
    .hdr { text-align: center; border-bottom: 2px dashed #000; padding-bottom: 6px; margin-bottom: 8px; }
    .brand { font-size: 15px; font-weight: 800; letter-spacing: 0.04em; text-transform: uppercase; }
    .sub { font-size: 10.5px; margin-top: 2px; }
    .badge {
      display: inline-block;
      margin-top: 5px;
      padding: 2px 8px;
      border: 1.5px solid #000;
      font-size: 12px;
      font-weight: 800;
    }
    .meta { margin-bottom: 8px; font-size: 11.5px; border-bottom: 1px dashed #000; padding-bottom: 6px; }
    .meta div { display: flex; justify-content: space-between; margin: 2px 0; }
    .station { font-size: 15px; font-weight: 900; margin: 4px 0; border: 1.5px solid #000; padding: 3px 6px; text-align: center; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 8px; }
    td { vertical-align: top; padding: 4px 0; border-bottom: 1px dotted #555; }
    td.qty { width: 14%; font-weight: 900; font-size: ${isKot ? '15px' : '12.5px'}; }
    td.item .name { font-weight: 700; font-size: ${isKot ? '14px' : '12px'}; }
    td.item .note { font-size: 11px; font-weight: 700; margin-top: 2px; }
    td.amt { text-align: right; white-space: nowrap; font-weight: 700; }
    .totals { border-top: 2px dashed #000; padding-top: 6px; margin-top: 4px; }
    .totals div { display: flex; justify-content: space-between; margin: 2px 0; }
    .totals .grand { font-size: 14px; font-weight: 900; margin-top: 4px; border-top: 1px solid #000; padding-top: 4px; }
    .order-note { border: 1.5px solid #000; padding: 5px; margin: 6px 0; font-weight: 700; font-size: 12px; }
    .ftr { text-align: center; margin-top: 10px; font-size: 10.5px; border-top: 1px dashed #000; padding-top: 6px; }
    .no-print { text-align: center; margin-bottom: 10px; }
    .btn { padding: 6px 14px; background: #111; color: #fff; border: 0; border-radius: 4px; font-weight: 700; cursor: pointer; }
    @media print { .no-print { display: none; } }
  </style>
</head>
<body>
  <div class="no-print"><button class="btn" id="pbtn">Print 80mm Slip</button></div>
  <div class="hdr">
    <div class="brand">Reberon Hotel</div>
    <div class="sub">${esc(order.outlet.name)} · Kapchorwa</div>
    <div class="badge">${title}</div>
  </div>
  <div class="station">${esc(order.tableOrRoom || 'COUNTER / WALK-IN')}</div>
  <div class="meta">
    <div><span>Order #:</span><strong>${esc(order.orderNumber)}</strong></div>
    <div><span>Time:</span><span>${esc(timeStr)}</span></div>
    <div><span>Guest:</span><strong>${esc(order.customerName || 'Walk-in')}</strong></div>
    <div><span>Server:</span><span>${esc(order.servedByName || 'Staff')}</span></div>
  </div>
  <table>
    <tbody>${rowsHtml}</tbody>
  </table>
  ${order.notes ? `<div class="order-note">ORDER NOTE: ${esc(order.notes)}</div>` : ''}
  ${
    !isKot
      ? `<div class="totals">
          <div><span>Subtotal</span><span>${fmtMoney(order.subtotalMinor, order.currency)}</span></div>
          ${order.discountMinor > 0n ? `<div><span>Discount</span><span>- ${fmtMoney(order.discountMinor, order.currency)}</span></div>` : ''}
          <div class="grand"><span>TOTAL DUE</span><span>${fmtMoney(order.totalMinor, order.currency)}</span></div>
          <div><span>Status</span><strong>${order.documentId || order.folioLineId ? `PAID (${order.paymentMethod.replace('_', ' ')})` : 'OPEN BILL (UNPAID)'}</strong></div>
        </div>
        <div class="ftr">
          Thank you for dining at Reberon Hotel<br/>
          Mount Elgon · reberonhotel.com
        </div>`
      : `<div class="ftr">Prepared for ${esc(order.outlet.deviceStation || order.outlet.name)}</div>`
  }
  <script nonce="${nonce}">
    document.getElementById('pbtn')?.addEventListener('click', () => window.print());
    ${autoprint ? 'window.addEventListener("load", () => setTimeout(() => window.print(), 150));' : ''}
  </script>
</body>
</html>`;
    return { html, nonce };
  }

  /* ───────────────────────── 2. Health Club & Spa (Gym, Steam, Sauna) ───────────────────────── */

  async healthClubDashboard(): Promise<HealthClubDashboardDTO> {
    const [memberships, accessLogs, visitCounts] = await Promise.all([
      this.prisma.healthClubMembership.findMany({ orderBy: { createdAt: 'desc' } }),
      this.prisma.healthClubAccessLog.findMany({
        orderBy: { checkedInAt: 'desc' },
        take: 100,
        include: { membership: { select: { membershipNo: true } } },
      }),
      this.prisma.healthClubAccessLog.groupBy({
        by: ['membershipId'],
        _count: { _all: true },
      }),
    ]);

    const countMap = new Map(visitCounts.map((v) => [v.membershipId, v._count._all]));
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const todayLogs = accessLogs.filter((l) => l.checkedInAt >= todayStart);
    const currentlyInside = accessLogs.filter((l) => !l.checkedOutAt).length;
    const towelsOutNow = accessLogs.reduce((acc, l) => acc + Math.max(0, l.gymTowelsIssued - l.gymTowelsReturned), 0);
    const todayWalkInRev = todayLogs.reduce((acc, l) => acc + (l.currency === 'UGX' ? l.amountPaidMinor : 0n), 0n);
    const todayMemRev = memberships
      .filter((m) => m.createdAt >= todayStart && m.currency === 'UGX')
      .reduce((acc, m) => acc + m.amountMinor, 0n);

    return {
      memberships: memberships.map((m) => ({
        id: m.id,
        membershipNo: m.membershipNo,
        memberName: m.memberName,
        memberPhone: m.memberPhone,
        memberEmail: m.memberEmail,
        tier: m.tier,
        service: m.service,
        currency: m.currency as CurrencyCode,
        amountMinor: m.amountMinor.toString(),
        startDate: m.startDate.toISOString(),
        endDate: m.endDate.toISOString(),
        isActive: m.isActive && m.endDate >= new Date(),
        documentId: m.documentId,
        notes: m.notes,
        visitsCount: countMap.get(m.id) ?? 0,
        createdAt: m.createdAt.toISOString(),
      })),
      accessLogs: accessLogs.map((l) => ({
        id: l.id,
        membershipId: l.membershipId,
        membershipNo: l.membership?.membershipNo ?? null,
        reservationId: l.reservationId,
        guestName: l.guestName,
        guestPhone: l.guestPhone,
        service: l.service,
        tier: l.tier,
        currency: l.currency as CurrencyCode,
        amountPaidMinor: l.amountPaidMinor.toString(),
        paymentMethod: l.paymentMethod,
        documentId: l.documentId,
        gymTowelsIssued: l.gymTowelsIssued,
        gymTowelsReturned: l.gymTowelsReturned,
        sandalsIssued: l.sandalsIssued,
        showerCapIssued: l.showerCapIssued,
        ropeIssued: l.ropeIssued,
        lockerNumber: l.lockerNumber,
        attendantName: l.attendantName,
        checkedInAt: l.checkedInAt.toISOString(),
        checkedOutAt: l.checkedOutAt?.toISOString() ?? null,
      })),
      stats: {
        activeMembers: memberships.filter((m) => m.isActive && m.endDate >= new Date()).length,
        todayVisits: todayLogs.length,
        currentlyInside,
        towelsOutNow,
        todayRevenueUGX: (todayWalkInRev + todayMemRev).toString(),
      },
    };
  }

  async createMembership(input: z.infer<typeof zCreateMembershipInput>, actor: AuthUser): Promise<HealthClubMembershipDTO> {
    const membershipNo = await this.nextSeq('HC');
    const now = new Date();
    const days = input.tier === 'ANNUAL' ? 365 : input.tier === 'MONTHLY' ? 30 : 1;
    const endDate = new Date(now.getTime() + days * 86_400_000);
    const amount = BigInt(input.amountMinor);

    let documentId: string | null = null;
    if (amount > 0n) {
      const doc = await this.docs.issueDirectDocument({
        kind: 'RECEIPT',
        currency: input.currency,
        amountMinor: amount,
        issuedTo: { name: input.memberName, phone: input.memberPhone, email: input.memberEmail || null },
        lines: [
          {
            date: now.toISOString().slice(0, 10),
            description: `Health Club ${input.tier.replace('_', ' ')} — ${input.service.replace('_', ' ')} (${membershipNo})`,
            amountMinor: amount.toString(),
          },
        ],
        payment: {
          method: input.paymentMethod.replace('_', ' '),
          reference: membershipNo,
          purpose: `Health Club Membership (${input.tier} · ${input.service})`,
        },
        actor: { id: actor.id, name: actor.name },
      });
      documentId = doc.id;
    }

    const m = await this.prisma.healthClubMembership.create({
      data: {
        membershipNo,
        memberName: input.memberName,
        memberPhone: input.memberPhone,
        memberEmail: input.memberEmail || null,
        tier: input.tier,
        service: input.service,
        currency: input.currency,
        amountMinor: amount,
        startDate: now,
        endDate,
        isActive: true,
        documentId,
        notes: input.notes ?? null,
      },
    });

    await this.audit.record({
      actor,
      action: 'healthclub.membership.create',
      entityType: 'HealthClubMembership',
      entityId: m.id,
      summary: `Enrolled ${m.memberName} (${m.membershipNo} · ${m.tier})`,
    });

    return {
      id: m.id,
      membershipNo: m.membershipNo,
      memberName: m.memberName,
      memberPhone: m.memberPhone,
      memberEmail: m.memberEmail,
      tier: m.tier,
      service: m.service,
      currency: m.currency as CurrencyCode,
      amountMinor: m.amountMinor.toString(),
      startDate: m.startDate.toISOString(),
      endDate: m.endDate.toISOString(),
      isActive: m.isActive,
      documentId: m.documentId,
      notes: m.notes,
      visitsCount: 0,
      createdAt: m.createdAt.toISOString(),
    };
  }

  async checkInHealthClub(input: z.infer<typeof zCheckInHealthClubInput>, actor: AuthUser): Promise<HealthClubAccessLogDTO> {
    const amount = BigInt(input.amountPaidMinor || '0');
    const now = new Date();
    let documentId: string | null = null;

    if (amount > 0n && input.paymentMethod !== 'ROOM_FOLIO' && input.paymentMethod !== 'MEMBER_PASS') {
      const doc = await this.docs.issueDirectDocument({
        kind: 'RECEIPT',
        currency: input.currency,
        amountMinor: amount,
        issuedTo: { name: input.guestName, phone: input.guestPhone ?? null, email: null },
        lines: [
          {
            date: now.toISOString().slice(0, 10),
            description: `Health Club Access — ${input.service.replace('_', ' ')} (${input.tier.replace('_', ' ')})`,
            amountMinor: amount.toString(),
          },
        ],
        payment: {
          method: input.paymentMethod.replace('_', ' '),
          reference: null,
          purpose: `Health Club & Spa Access (${input.service.replace('_', ' ')})`,
        },
        actor: { id: actor.id, name: actor.name },
      });
      documentId = doc.id;
    }

    // Update segregated Gym Towel count (move from clean onHand to inUseOrLaundry)
    if (input.gymTowelsIssued > 0) {
      const gymTowel = await this.prisma.inventoryItem.findUnique({ where: { sku: 'GYM-TWL-01' } });
      if (gymTowel) {
        await this.prisma.inventoryItem.update({
          where: { id: gymTowel.id },
          data: {
            onHand: Math.max(0, gymTowel.onHand - input.gymTowelsIssued),
            inUseOrLaundry: gymTowel.inUseOrLaundry + input.gymTowelsIssued,
          },
        });
      }
    }

    // If disposable shower cap issued, decrement consumable stock
    if (input.showerCapIssued) {
      const cap = await this.prisma.inventoryItem.findUnique({ where: { sku: 'SPA-CAP-01' } });
      if (cap && cap.onHand > 0) {
        await this.prisma.inventoryItem.update({
          where: { id: cap.id },
          data: { onHand: cap.onHand - 1 },
        });
      }
    }

    const row = await this.prisma.healthClubAccessLog.create({
      data: {
        membershipId: input.membershipId ?? null,
        reservationId: input.reservationId ?? null,
        guestName: input.guestName,
        guestPhone: input.guestPhone ?? null,
        service: input.service,
        tier: input.tier,
        currency: input.currency,
        amountPaidMinor: amount,
        paymentMethod: input.paymentMethod,
        documentId,
        gymTowelsIssued: input.gymTowelsIssued,
        gymTowelsReturned: 0,
        sandalsIssued: input.sandalsIssued,
        showerCapIssued: input.showerCapIssued,
        ropeIssued: input.ropeIssued,
        lockerNumber: input.lockerNumber ?? null,
        attendantId: actor.id,
        attendantName: actor.name,
      },
      include: { membership: { select: { membershipNo: true } } },
    });

    return {
      id: row.id,
      membershipId: row.membershipId,
      membershipNo: row.membership?.membershipNo ?? null,
      reservationId: row.reservationId,
      guestName: row.guestName,
      guestPhone: row.guestPhone,
      service: row.service,
      tier: row.tier,
      currency: row.currency as CurrencyCode,
      amountPaidMinor: row.amountPaidMinor.toString(),
      paymentMethod: row.paymentMethod,
      documentId: row.documentId,
      gymTowelsIssued: row.gymTowelsIssued,
      gymTowelsReturned: row.gymTowelsReturned,
      sandalsIssued: row.sandalsIssued,
      showerCapIssued: row.showerCapIssued,
      ropeIssued: row.ropeIssued,
      lockerNumber: row.lockerNumber,
      attendantName: row.attendantName,
      checkedInAt: row.checkedInAt.toISOString(),
      checkedOutAt: null,
    };
  }

  async checkOutHealthClub(id: string, gymTowelsReturned: number, actor: AuthUser) {
    const existing = await this.prisma.healthClubAccessLog.findUnique({ where: { id } });
    if (!existing) throw notFound('Access log');

    const row = await this.prisma.healthClubAccessLog.update({
      where: { id },
      data: {
        gymTowelsReturned,
        checkedOutAt: new Date(),
      },
    });

    await this.audit.record({
      actor,
      action: 'healthclub.checkout',
      entityType: 'HealthClubAccessLog',
      entityId: id,
      summary: `${row.guestName} checked out (${gymTowelsReturned}/${row.gymTowelsIssued} gym towels returned)`,
    });

    return {
      id: row.id,
      gymTowelsReturned: row.gymTowelsReturned,
      checkedOutAt: row.checkedOutAt?.toISOString(),
    };
  }

  /* ───────────────────────── 3. Quotations & Conference / Event Pipeline ───────────────────────── */

  async quotations(): Promise<QuotationDTO[]> {
    const rows = await this.prisma.quotation.findMany({
      include: { lines: { orderBy: { sortOrder: 'asc' } } },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((q) => this.mapQuotation(q));
  }

  private mapQuotation(q: any): QuotationDTO {
    return {
      id: q.id,
      number: q.number,
      clientName: q.clientName,
      clientOrganization: q.clientOrganization,
      clientPhone: q.clientPhone,
      clientEmail: q.clientEmail,
      eventType: q.eventType,
      eventTitle: q.eventTitle,
      eventDate: q.eventDate?.toISOString().slice(0, 10) ?? null,
      endDate: q.endDate?.toISOString().slice(0, 10) ?? null,
      attendees: q.attendees,
      hallSetup: q.hallSetup,
      validUntil: q.validUntil.toISOString().slice(0, 10),
      currency: q.currency as CurrencyCode,
      subtotalMinor: q.subtotalMinor.toString(),
      discountMinor: q.discountMinor.toString(),
      taxMinor: q.taxMinor.toString(),
      totalMinor: q.totalMinor.toString(),
      status: q.status,
      notes: q.notes,
      terms: q.terms,
      convertedInvoiceId: q.convertedInvoiceId,
      createdByName: q.createdByName,
      checkCode: q.checkCode,
      lines: q.lines.map((l: any) => ({
        id: l.id,
        category: l.category,
        description: l.description,
        quantity: l.quantity,
        unit: l.unit,
        unitPriceMinor: l.unitPriceMinor.toString(),
        totalMinor: l.totalMinor.toString(),
      })),
      createdAt: q.createdAt.toISOString(),
    };
  }

  async createQuotation(input: z.infer<typeof zCreateQuotationInput>, actor: AuthUser): Promise<QuotationDTO> {
    const number = await this.nextSeq('QUO');
    const checkCode = this.docs.checkCode(number);
    let subtotal = 0n;
    const lines = input.lines.map((l, idx) => {
      const unitPrice = BigInt(l.unitPriceMinor);
      const total = unitPrice * BigInt(l.quantity);
      subtotal += total;
      return {
        category: l.category,
        description: l.description,
        quantity: l.quantity,
        unit: l.unit,
        unitPriceMinor: unitPrice,
        totalMinor: total,
        sortOrder: idx + 1,
      };
    });
    const discount = BigInt(input.discountMinor || '0');
    const total = subtotal > discount ? subtotal - discount : 0n;
    const validUntil = new Date(Date.now() + input.validDays * 86_400_000);

    const created = await this.prisma.quotation.create({
      data: {
        number,
        clientName: input.clientName,
        clientOrganization: input.clientOrganization ?? null,
        clientPhone: input.clientPhone,
        clientEmail: input.clientEmail || null,
        eventType: input.eventType,
        eventTitle: input.eventTitle,
        eventDate: input.eventDate ? new Date(`${input.eventDate}T12:00:00Z`) : null,
        endDate: input.endDate ? new Date(`${input.endDate}T12:00:00Z`) : null,
        attendees: input.attendees ?? null,
        hallSetup: input.hallSetup ?? null,
        validUntil,
        currency: input.currency,
        subtotalMinor: subtotal,
        discountMinor: discount,
        taxMinor: 0n,
        totalMinor: total,
        status: 'SENT',
        notes: input.notes ?? null,
        terms: input.terms ?? '50% deposit upon confirmation; balance payable prior to event conclusion.',
        createdById: actor.id,
        createdByName: actor.name,
        checkCode,
        lines: { create: lines },
      },
      include: { lines: { orderBy: { sortOrder: 'asc' } } },
    });

    await this.audit.record({
      actor,
      action: 'quotation.create',
      entityType: 'Quotation',
      entityId: created.id,
      summary: `Issued quotation ${created.number} for ${created.clientName} (${created.eventTitle})`,
    });

    return this.mapQuotation(created);
  }

  async updateQuotationStatus(id: string, status: QuotationDTO['status'], actor: AuthUser): Promise<QuotationDTO> {
    const q = await this.prisma.quotation.update({
      where: { id },
      data: { status },
      include: { lines: { orderBy: { sortOrder: 'asc' } } },
    });
    await this.audit.record({
      actor,
      action: 'quotation.status',
      entityType: 'Quotation',
      entityId: id,
      summary: `Quotation ${q.number} marked ${status}`,
    });
    return this.mapQuotation(q);
  }

  /** Converts a Quotation into an official numbered Invoice (and optional immediate Receipt). */
  async convertQuotationToInvoice(
    id: string,
    input: z.infer<typeof zConvertQuotationToInvoiceInput>,
    actor: AuthUser,
  ) {
    const quo = await this.prisma.quotation.findUnique({
      where: { id },
      include: { lines: { orderBy: { sortOrder: 'asc' } } },
    });
    if (!quo) throw notFound('Quotation');
    if (quo.convertedInvoiceId) {
      const existingInv = await this.prisma.issuedDocument.findUnique({ where: { id: quo.convertedInvoiceId } });
      return { quotation: this.mapQuotation(quo), invoiceId: quo.convertedInvoiceId, invoiceNumber: existingInv?.number ?? null, receiptId: null, receiptNumber: null };
    }

    const todayIso = new Date().toISOString().slice(0, 10);
    const issuedTo = {
      name: quo.clientOrganization ? `${quo.clientName} (${quo.clientOrganization})` : quo.clientName,
      phone: quo.clientPhone,
      email: quo.clientEmail,
    };

    const docLines = quo.lines.map((l) => ({
      date: todayIso,
      description: `${l.description} (${l.quantity} × ${l.unit})`,
      amountMinor: l.totalMinor.toString(),
    }));
    if (quo.discountMinor > 0n) {
      docLines.push({
        date: todayIso,
        description: 'Agreed Package Discount',
        amountMinor: (-quo.discountMinor).toString(),
      });
    }

    const payments = input.recordPaymentNow
      ? [
          {
            date: todayIso,
            description: `Payment (${(input.paymentMethod ?? 'CASH').replace('_', ' ')})`,
            amountMinor: quo.totalMinor.toString(),
          },
        ]
      : [];

    const invoice = await this.docs.issueDirectDocument({
      kind: 'INVOICE',
      currency: quo.currency as 'UGX' | 'USD',
      amountMinor: quo.totalMinor,
      issuedTo,
      lines: docLines,
      payments,
      balanceMinor: input.recordPaymentNow ? 0n : quo.totalMinor,
      note: `Converted from Quotation ${quo.number} — ${quo.eventTitle}`,
      actor: { id: actor.id, name: actor.name },
    });

    let receiptId: string | null = null;
    let receiptNumber: string | null = null;
    if (input.recordPaymentNow) {
      const rct = await this.docs.issueDirectDocument({
        kind: 'RECEIPT',
        currency: quo.currency as 'UGX' | 'USD',
        amountMinor: quo.totalMinor,
        issuedTo,
        lines: docLines,
        payment: {
          method: (input.paymentMethod ?? 'CASH').replace('_', ' '),
          reference: input.paymentReference || invoice.number,
          purpose: `${quo.eventTitle} (Invoice ${invoice.number})`,
        },
        balanceMinor: 0n,
        actor: { id: actor.id, name: actor.name },
      });
      receiptId = rct.id;
      receiptNumber = rct.number;
    }

    const updatedQuo = await this.prisma.quotation.update({
      where: { id },
      data: {
        status: 'CONVERTED',
        convertedInvoiceId: invoice.id,
      },
      include: { lines: { orderBy: { sortOrder: 'asc' } } },
    });

    await this.audit.record({
      actor,
      action: 'quotation.convert',
      entityType: 'Quotation',
      entityId: id,
      summary: `Converted ${quo.number} → Invoice ${invoice.number}${receiptNumber ? ` & Receipt ${receiptNumber}` : ''}`,
    });

    return {
      quotation: this.mapQuotation(updatedQuo),
      invoiceId: invoice.id,
      invoiceNumber: invoice.number,
      receiptId,
      receiptNumber,
    };
  }

  /* ───────────────────────── 4. Inventory, Segregated Linen & Fixed Assets ───────────────────────── */

  async inventoryDashboard(): Promise<InventoryDashboardDTO> {
    const [items, movements] = await Promise.all([
      this.prisma.inventoryItem.findMany({ orderBy: [{ category: 'asc' }, { name: 'asc' }] }),
      this.prisma.stockMovement.findMany({
        include: { item: { select: { name: true, sku: true, category: true } } },
        orderBy: { createdAt: 'desc' },
        take: 80,
      }),
    ]);

    const gymTowels = items.filter((i) => i.category === 'LINEN_GYM');
    const roomTowels = items.filter((i) => i.category === 'LINEN_ROOM');

    return {
      items: items.map((i) => ({
        id: i.id,
        sku: i.sku,
        name: i.name,
        category: i.category,
        department: i.department,
        unit: i.unit,
        onHand: i.onHand,
        inUseOrLaundry: i.inUseOrLaundry,
        parLevel: i.parLevel,
        unitCostMinor: i.unitCostMinor.toString(),
        location: i.location,
        condition: i.condition,
        isLowStock: i.category !== 'FIXED_ASSET' && i.onHand <= i.parLevel,
        updatedAt: i.updatedAt.toISOString(),
      })),
      movements: movements.map((m) => ({
        id: m.id,
        itemId: m.itemId,
        itemName: m.item.name,
        itemSku: m.item.sku,
        category: m.item.category,
        type: m.type,
        quantity: m.quantity,
        balanceAfter: m.balanceAfter,
        department: m.department,
        reference: m.reference,
        notes: m.notes,
        recordedByName: m.recordedByName,
        createdAt: m.createdAt.toISOString(),
      })),
      summary: {
        gymTowelsClean: gymTowels.reduce((a, x) => a + x.onHand, 0),
        gymTowelsInUseOrLaundry: gymTowels.reduce((a, x) => a + x.inUseOrLaundry, 0),
        roomTowelsClean: roomTowels.reduce((a, x) => a + x.onHand, 0),
        roomTowelsInUseOrLaundry: roomTowels.reduce((a, x) => a + x.inUseOrLaundry, 0),
        lowStockCount: items.filter((i) => i.onHand <= i.parLevel && i.category !== 'FIXED_ASSET').length,
        totalFixedAssets: items.filter((i) => i.category === 'FIXED_ASSET').reduce((a, x) => a + x.onHand, 0),
      },
    };
  }

  async createInventoryItem(input: z.infer<typeof zCreateInventoryItemInput>, actor: AuthUser): Promise<InventoryItemDTO> {
    const item = await this.prisma.inventoryItem.create({
      data: {
        sku: input.sku.toUpperCase(),
        name: input.name,
        category: input.category,
        department: input.department,
        unit: input.unit,
        onHand: input.onHand,
        parLevel: input.parLevel,
        unitCostMinor: BigInt(input.unitCostMinor || '0'),
        location: input.location ?? null,
        lastCountedAt: new Date(),
      },
    });
    await this.audit.record({
      actor,
      action: 'inventory.item.create',
      entityType: 'InventoryItem',
      entityId: item.id,
      summary: `Added inventory SKU ${item.sku} (${item.name})`,
    });
    return {
      id: item.id,
      sku: item.sku,
      name: item.name,
      category: item.category,
      department: item.department,
      unit: item.unit,
      onHand: item.onHand,
      inUseOrLaundry: item.inUseOrLaundry,
      parLevel: item.parLevel,
      unitCostMinor: item.unitCostMinor.toString(),
      location: item.location,
      condition: item.condition,
      isLowStock: item.onHand <= item.parLevel,
      updatedAt: item.updatedAt.toISOString(),
    };
  }

  async recordStockMovement(input: z.infer<typeof zRecordStockMovementInput>, actor: AuthUser): Promise<StockMovementDTO> {
    const item = await this.prisma.inventoryItem.findUnique({ where: { id: input.itemId } });
    if (!item) throw notFound('Inventory item');

    let nextOnHand = item.onHand;
    let nextInUse = item.inUseOrLaundry;

    if (input.type === 'STOCK_IN') {
      nextOnHand += input.quantity;
    } else if (input.type === 'STOCK_OUT' || input.type === 'DAMAGED_LOST') {
      nextOnHand = Math.max(0, nextOnHand - input.quantity);
    } else if (input.type === 'LAUNDRY_SEND') {
      const moved = Math.min(nextOnHand, input.quantity);
      nextOnHand -= moved;
      nextInUse += moved;
    } else if (input.type === 'LAUNDRY_RETURN') {
      const returned = Math.min(nextInUse, input.quantity);
      nextInUse -= returned;
      nextOnHand += input.quantity;
    } else if (input.type === 'ADJUSTMENT') {
      nextOnHand = input.quantity;
    }

    await this.prisma.inventoryItem.update({
      where: { id: item.id },
      data: {
        onHand: nextOnHand,
        inUseOrLaundry: nextInUse,
        lastCountedAt: new Date(),
      },
    });

    const mov = await this.prisma.stockMovement.create({
      data: {
        itemId: item.id,
        type: input.type,
        quantity: input.quantity,
        balanceAfter: nextOnHand,
        department: input.department ?? item.department,
        reference: input.reference ?? null,
        notes: input.notes ?? null,
        recordedById: actor.id,
        recordedByName: actor.name,
      },
      include: { item: { select: { name: true, sku: true, category: true } } },
    });

    await this.audit.record({
      actor,
      action: 'inventory.movement',
      entityType: 'StockMovement',
      entityId: mov.id,
      summary: `${input.type} ${input.quantity} × ${item.name} (balance: ${nextOnHand})`,
    });

    return {
      id: mov.id,
      itemId: mov.itemId,
      itemName: mov.item.name,
      itemSku: mov.item.sku,
      category: mov.item.category,
      type: mov.type,
      quantity: mov.quantity,
      balanceAfter: mov.balanceAfter,
      department: mov.department,
      reference: mov.reference,
      notes: mov.notes,
      recordedByName: mov.recordedByName,
      createdAt: mov.createdAt.toISOString(),
    };
  }

  /* ───────────────────────── 5. Requisitions, Internal Comms & Devices ───────────────────────── */

  async requisitions(): Promise<RequisitionDTO[]> {
    const rows = await this.prisma.requisition.findMany({
      include: { items: true },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((r) => this.mapRequisition(r));
  }

  private mapRequisition(r: any): RequisitionDTO {
    return {
      id: r.id,
      number: r.number,
      department: r.department,
      title: r.title,
      priority: r.priority,
      status: r.status,
      currency: r.currency as CurrencyCode,
      totalEstimatedMinor: r.totalEstimatedMinor.toString(),
      notes: r.notes,
      rejectionReason: r.rejectionReason,
      requestedByName: r.requestedByName,
      managerApprovedBy: r.managerApprovedBy,
      managerApprovedAt: r.managerApprovedAt?.toISOString() ?? null,
      directorApprovedBy: r.directorApprovedBy,
      directorApprovedAt: r.directorApprovedAt?.toISOString() ?? null,
      disbursedBy: r.disbursedBy,
      disbursedAt: r.disbursedAt?.toISOString() ?? null,
      items: r.items.map((i: any) => ({
        id: i.id,
        inventoryItemId: i.inventoryItemId,
        itemName: i.itemName,
        unit: i.unit,
        quantityRequested: i.quantityRequested,
        quantityApproved: i.quantityApproved,
        estimatedUnitMinor: i.estimatedUnitMinor.toString(),
        totalEstimatedMinor: i.totalEstimatedMinor.toString(),
      })),
      createdAt: r.createdAt.toISOString(),
    };
  }

  async createRequisition(input: z.infer<typeof zCreateRequisitionInput>, actor: AuthUser): Promise<RequisitionDTO> {
    const number = await this.nextSeq('REQ');
    let totalEst = 0n;
    const items = input.items.map((i) => {
      const unitMinor = BigInt(i.estimatedUnitMinor || '0');
      const lineTotal = unitMinor * BigInt(i.quantityRequested);
      totalEst += lineTotal;
      return {
        inventoryItemId: i.inventoryItemId ?? null,
        itemName: i.itemName,
        unit: i.unit,
        quantityRequested: i.quantityRequested,
        quantityApproved: i.quantityRequested,
        estimatedUnitMinor: unitMinor,
        totalEstimatedMinor: lineTotal,
      };
    });

    const created = await this.prisma.requisition.create({
      data: {
        number,
        department: input.department,
        title: input.title,
        priority: input.priority,
        status: 'PENDING',
        currency: 'UGX',
        totalEstimatedMinor: totalEst,
        notes: input.notes ?? null,
        requestedById: actor.id,
        requestedByName: actor.name,
        items: { create: items },
      },
      include: { items: true },
    });

    await this.audit.record({
      actor,
      action: 'requisition.create',
      entityType: 'Requisition',
      entityId: created.id,
      summary: `Submitted requisition ${created.number} (${created.department}: ${created.title})`,
    });

    return this.mapRequisition(created);
  }

  async reviewRequisition(id: string, input: z.infer<typeof zReviewRequisitionInput>, actor: AuthUser): Promise<RequisitionDTO> {
    const req = await this.prisma.requisition.findUnique({ where: { id }, include: { items: true } });
    if (!req) throw notFound('Requisition');

    const now = new Date();
    let data: Record<string, unknown> = {};

    if (input.action === 'MANAGER_APPROVE') {
      data = {
        status: 'MANAGER_APPROVED',
        managerApprovedById: actor.id,
        managerApprovedBy: actor.name,
        managerApprovedAt: now,
      };
    } else if (input.action === 'DIRECTOR_APPROVE') {
      data = {
        status: 'DIRECTOR_APPROVED',
        directorApprovedById: actor.id,
        directorApprovedBy: actor.name,
        directorApprovedAt: now,
      };
    } else if (input.action === 'DISBURSE') {
      data = {
        status: 'DISBURSED',
        disbursedById: actor.id,
        disbursedBy: actor.name,
        disbursedAt: now,
      };
      // Automatically restock any linked inventory SKUs upon disbursement!
      for (const item of req.items) {
        if (item.inventoryItemId) {
          const inv = await this.prisma.inventoryItem.findUnique({ where: { id: item.inventoryItemId } });
          if (inv) {
            const qty = item.quantityApproved ?? item.quantityRequested;
            const nextOnHand = inv.onHand + qty;
            await this.prisma.inventoryItem.update({
              where: { id: inv.id },
              data: { onHand: nextOnHand },
            });
            await this.prisma.stockMovement.create({
              data: {
                itemId: inv.id,
                type: 'STOCK_IN',
                quantity: qty,
                balanceAfter: nextOnHand,
                department: req.department,
                reference: req.number,
                notes: `Requisition ${req.number} disbursed`,
                recordedById: actor.id,
                recordedByName: actor.name,
              },
            });
          }
        }
      }
    } else if (input.action === 'REJECT') {
      data = {
        status: 'REJECTED',
        rejectionReason: input.rejectionReason || 'Declined by management',
      };
    }

    const updated = await this.prisma.requisition.update({
      where: { id },
      data,
      include: { items: true },
    });

    await this.audit.record({
      actor,
      action: `requisition.${input.action.toLowerCase()}`,
      entityType: 'Requisition',
      entityId: id,
      summary: `Requisition ${req.number} → ${updated.status}`,
    });

    return this.mapRequisition(updated);
  }

  async announcements(): Promise<StaffAnnouncementDTO[]> {
    const rows = await this.prisma.staffAnnouncement.findMany({
      orderBy: [{ isPinned: 'desc' }, { createdAt: 'desc' }],
      take: 50,
    });
    return rows.map((a) => ({
      id: a.id,
      department: a.department,
      title: a.title,
      body: a.body,
      priority: a.priority,
      authorName: a.authorName,
      authorRole: a.authorRole,
      isPinned: a.isPinned,
      createdAt: a.createdAt.toISOString(),
    }));
  }

  async createAnnouncement(input: z.infer<typeof zCreateAnnouncementInput>, actor: AuthUser): Promise<StaffAnnouncementDTO> {
    const a = await this.prisma.staffAnnouncement.create({
      data: {
        department: (input.department as Department) ?? null,
        title: input.title,
        body: input.body,
        priority: input.priority,
        authorId: actor.id,
        authorName: actor.name,
        authorRole: actor.role,
        isPinned: input.isPinned,
      },
    });
    return {
      id: a.id,
      department: a.department,
      title: a.title,
      body: a.body,
      priority: a.priority,
      authorName: a.authorName,
      authorRole: a.authorRole,
      isPinned: a.isPinned,
      createdAt: a.createdAt.toISOString(),
    };
  }

  async devices(): Promise<TerminalDeviceDTO[]> {
    const rows = await this.prisma.terminalDevice.findMany({ orderBy: { code: 'asc' } });
    return rows.map((d) => ({
      id: d.id,
      code: d.code,
      name: d.name,
      department: d.department,
      kind: d.kind,
      paperSize: d.paperSize,
      ipOrPort: d.ipOrPort,
      status: d.status,
      lastSeenAt: d.lastSeenAt.toISOString(),
    }));
  }
}
