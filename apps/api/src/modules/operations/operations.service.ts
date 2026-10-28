import { randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type {
  CurrencyCode,
  Department,
  ExpenseDTO,
  HealthClubAccessLogDTO,
  HealthClubDashboardDTO,
  HealthClubMembershipDTO,
  HotelDepartmentDTO,
  InventoryDashboardDTO,
  InventoryItemDTO,
  ItemCategoryDTO,
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
  zAdjustStockCountInput,
  zCheckInHealthClubInput,
  zConvertQuotationToInvoiceInput,
  zCreateAnnouncementInput,
  zCreateCategoryInput,
  zCreateDepartmentInput,
  zCreateExpenseInput,
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
  zUpdateCategoryInput,
  zUpdateDepartmentInput,
  zUpdateInventoryItemInput,
} from '@reberon/contracts';
import { PrismaService } from '../../common/prisma.service.js';
import { AuditService } from '../../common/audit.service.js';
import { has, type AuthUser } from '../../common/auth.js';
import { badRequest, forbidden, notFound } from '../../common/errors.js';
import { DocumentsService } from '../documents/documents.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';

@Injectable()
export class OperationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly docs: DocumentsService,
    private readonly notifications: NotificationsService,
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
    const totalValuationMinor = items.reduce(
      (sum, i) => sum + BigInt(i.onHand) * BigInt(i.unitCostMinor),
      0n,
    );

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
        totalInventoryValueMinor: totalValuationMinor.toString(),
        totalActiveSkus: items.length,
      },
    };
  }

  async createInventoryItem(input: z.infer<typeof zCreateInventoryItemInput>, actor: AuthUser): Promise<InventoryItemDTO> {
    const item = await this.prisma.inventoryItem.create({
      data: {
        sku: input.sku.toUpperCase(),
        name: input.name,
        category: input.category as any,
        department: input.department as any,
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

  async updateInventoryItem(id: string, input: z.infer<typeof zUpdateInventoryItemInput>, actor: AuthUser): Promise<InventoryItemDTO> {
    const existing = await this.prisma.inventoryItem.findUnique({ where: { id } });
    if (!existing) throw notFound('Inventory Item');

    const data: Record<string, unknown> = {};
    if (input.name !== undefined) data.name = input.name;
    if (input.category !== undefined) data.category = input.category;
    if (input.department !== undefined) data.department = input.department;
    if (input.unit !== undefined) data.unit = input.unit;
    if (input.parLevel !== undefined) data.parLevel = input.parLevel;
    if (input.unitCostMinor !== undefined) data.unitCostMinor = BigInt(input.unitCostMinor);
    if (input.location !== undefined) data.location = input.location;
    if (input.condition !== undefined) data.condition = input.condition;

    const item = await this.prisma.inventoryItem.update({
      where: { id },
      data,
    });

    await this.audit.record({
      actor,
      action: 'inventory.item.update',
      entityType: 'InventoryItem',
      entityId: item.id,
      summary: `Updated inventory SKU ${item.sku} (${item.name})`,
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
      isLowStock: item.category !== 'FIXED_ASSET' && item.onHand <= item.parLevel,
      updatedAt: item.updatedAt.toISOString(),
    };
  }

  async deleteInventoryItem(id: string, actor: AuthUser): Promise<{ ok: boolean }> {
    const existing = await this.prisma.inventoryItem.findUnique({ where: { id } });
    if (!existing) throw notFound('Inventory Item');

    await this.prisma.inventoryItem.delete({ where: { id } });

    await this.audit.record({
      actor,
      action: 'inventory.item.delete',
      entityType: 'InventoryItem',
      entityId: id,
      summary: `Deleted inventory SKU ${existing.sku} (${existing.name})`,
    });

    return { ok: true };
  }

  async adjustStockCount(id: string, input: z.infer<typeof zAdjustStockCountInput>, actor: AuthUser): Promise<InventoryItemDTO> {
    const item = await this.prisma.inventoryItem.findUnique({ where: { id } });
    if (!item) throw notFound('Inventory Item');

    const previousCount = item.onHand;
    const diff = input.actualCount - previousCount;

    const updated = await this.prisma.inventoryItem.update({
      where: { id },
      data: {
        onHand: input.actualCount,
        lastCountedAt: new Date(),
      },
    });

    const notes = input.notes || (diff >= 0 ? `Physical stock count surplus (+${diff})` : `Physical stock count deficit (${diff})`);

    await this.prisma.stockMovement.create({
      data: {
        itemId: item.id,
        type: 'ADJUSTMENT',
        quantity: Math.abs(diff),
        balanceAfter: input.actualCount,
        department: item.department,
        reference: 'STOCK_COUNT',
        notes,
        recordedById: actor.id,
        recordedByName: actor.name,
      },
    });

    await this.audit.record({
      actor,
      action: 'inventory.item.adjust',
      entityType: 'InventoryItem',
      entityId: id,
      summary: `Physical count for ${item.sku}: ${previousCount} → ${input.actualCount} (${notes})`,
    });

    return {
      id: updated.id,
      sku: updated.sku,
      name: updated.name,
      category: updated.category,
      department: updated.department,
      unit: updated.unit,
      onHand: updated.onHand,
      inUseOrLaundry: updated.inUseOrLaundry,
      parLevel: updated.parLevel,
      unitCostMinor: updated.unitCostMinor.toString(),
      location: updated.location,
      condition: updated.condition,
      isLowStock: updated.category !== 'FIXED_ASSET' && updated.onHand <= updated.parLevel,
      updatedAt: updated.updatedAt.toISOString(),
    };
  }

  async getItemMovements(id: string): Promise<StockMovementDTO[]> {
    const movements = await this.prisma.stockMovement.findMany({
      where: { itemId: id },
      include: { item: { select: { name: true, sku: true, category: true } } },
      orderBy: { createdAt: 'desc' },
      take: 60,
    });
    return movements.map((m) => ({
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
    }));
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

  async requisitions(q?: Record<string, string>, actor?: AuthUser): Promise<RequisitionDTO[]> {
    const where: any = {};
    if (q?.department && q.department !== 'ALL') {
      where.department = q.department;
    }
    if (q?.status && q.status !== 'ALL') {
      where.status = q.status;
    }
    if (q?.priority && q.priority !== 'ALL') {
      where.priority = q.priority;
    }
    if (q?.mine === '1' && actor) {
      where.requestedById = actor.id;
    }
    if (q?.q) {
      const term = q.q.trim();
      where.OR = [
        { number: { contains: term, mode: 'insensitive' } },
        { title: { contains: term, mode: 'insensitive' } },
        { requestedByName: { contains: term, mode: 'insensitive' } },
        { notes: { contains: term, mode: 'insensitive' } },
        { items: { some: { itemName: { contains: term, mode: 'insensitive' } } } },
      ];
    }
    const rows = await this.prisma.requisition.findMany({
      where,
      include: { items: true },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((r) => this.mapRequisition(r));
  }

  async getRequisition(id: string): Promise<RequisitionDTO> {
    const req = await this.prisma.requisition.findUnique({
      where: { id },
      include: { items: true },
    });
    if (!req) throw notFound('Requisition');
    return this.mapRequisition(req);
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
      requestedById: r.requestedById,
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
        department: input.department as any,
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

    // Notify managers & directors via email if urgent or high priority
    if (input.priority === 'URGENT') {
      try {
        const managers = await this.prisma.user.findMany({
          where: { role: { in: ['OWNER', 'MANAGER'] }, status: 'ACTIVE' },
          select: { email: true, name: true },
        });
        const estUgx = Number(totalEst).toLocaleString('en-UG');
        for (const m of managers) {
          if (m.email) {
            await this.notifications.email({
              to: m.email,
              subject: `[URGENT REQUISITION] ${created.number} · ${created.department}: ${created.title}`,
              heading: `Urgent Requisition: ${created.number}`,
              paragraphs: [
                `${actor.name} submitted an urgent requisition for ${created.department}.`,
                `Title: ${created.title}`,
                `Items: ${items.map((it) => `${it.quantityRequested} ${it.unit} ${it.itemName}`).join(', ')}`,
              ],
              facts: [
                ['Department', created.department],
                ['Requested By', actor.name],
                ['Estimated Total', `UGX ${estUgx}`],
              ],
              action: { label: 'Review Requisition', url: `${process.env.ADMIN_URL || 'https://reberonhotel.com:8443'}/requisitions` },
            }).catch(() => {});
          }
        }
      } catch (err) {
        // Notification logging should not block requisition creation
      }
    }

    return this.mapRequisition(created);
  }

  async reviewRequisition(id: string, input: z.infer<typeof zReviewRequisitionInput>, actor: AuthUser): Promise<RequisitionDTO> {
    const req = await this.prisma.requisition.findUnique({ where: { id }, include: { items: true } });
    if (!req) throw notFound('Requisition');

    const now = new Date();
    let data: Record<string, unknown> = {};

    if (input.action === 'CANCEL') {
      const isOwner = req.requestedById === actor.id;
      const canApprove = has(actor, 'requisitions:approve');
      if (!isOwner && !canApprove) {
        throw forbidden('You can only cancel your own pending requisition');
      }
      if (req.status !== 'PENDING') {
        throw badRequest('Only pending requisitions can be cancelled');
      }
      data = {
        status: 'REJECTED',
        rejectionReason: input.rejectionReason || 'Cancelled by requester',
      };
    } else {
      if (!has(actor, 'requisitions:approve')) {
        throw forbidden('Manager approval permission required');
      }

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
        // Automatically restock any linked inventory SKUs upon disbursement
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
    }

    // Apply approved quantities if provided
    if (input.approvedQuantities && Object.keys(input.approvedQuantities).length > 0) {
      for (const [itemId, qty] of Object.entries(input.approvedQuantities)) {
        await this.prisma.requisitionItem.updateMany({
          where: { id: itemId, requisitionId: id },
          data: { quantityApproved: qty },
        });
      }
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

    // Notify requester if email is known
    if (req.requestedById && ['MANAGER_APPROVED', 'DIRECTOR_APPROVED', 'DISBURSED', 'REJECTED'].includes(updated.status)) {
      try {
        const requester = await this.prisma.user.findUnique({ where: { id: req.requestedById } });
        if (requester?.email) {
          const statusLabel = updated.status.replace(/_/g, ' ');
          await this.notifications.email({
            to: requester.email,
            subject: `Requisition ${req.number} is now ${statusLabel}`,
            heading: `Requisition Update: ${req.number}`,
            paragraphs: [
              `Hello ${requester.name},`,
              `Your requisition ${req.number} (${req.title}) for department ${req.department} has been updated to ${statusLabel}.`,
              ...(updated.rejectionReason ? [`Reason: ${updated.rejectionReason}`] : []),
              `Reviewed by ${actor.name} on ${now.toLocaleDateString('en-GB')}.`,
            ],
            facts: [
              ['Requisition #', req.number],
              ['Status', statusLabel],
              ['Department', req.department],
            ],
            action: { label: 'View Requisition', url: `${process.env.ADMIN_URL || 'https://reberonhotel.com:8443'}/requisitions` },
          }).catch(() => {});
        }
      } catch (err) {}
    }

    return this.mapRequisition(updated);
  }

  async renderRequisitionPrintHtml(id: string, paper: 'A4' | '80MM', autoprint: boolean) {
    const req = await this.prisma.requisition.findUnique({
      where: { id },
      include: { items: true },
    });
    if (!req) throw notFound('Requisition');

    const nonce = randomBytes(16).toString('base64');
    const esc = (s: string | null | undefined) =>
      String(s ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    const fmtMoney = (minor: bigint | string, curr: string) =>
      `${curr} ${Number(minor).toLocaleString('en-UG')}`;

    const dateStr = new Intl.DateTimeFormat('en-GB', {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: 'Africa/Kampala',
    }).format(req.createdAt);

    const isA4 = paper === 'A4';
    const statusTone = req.status === 'DISBURSED' ? '#15803d' : req.status === 'REJECTED' ? '#b91c1c' : '#b45309';

    const itemsHtml = req.items
      .map((it, idx) => {
        const qtyAppr = it.quantityApproved ?? it.quantityRequested;
        if (isA4) {
          return `<tr>
            <td style="padding: 7px 10px; border-bottom: 1px solid #e5e7eb; text-align: center; font-family: monospace;">${idx + 1}</td>
            <td style="padding: 7px 10px; border-bottom: 1px solid #e5e7eb;">
              <strong>${esc(it.itemName)}</strong>
            </td>
            <td style="padding: 7px 10px; border-bottom: 1px solid #e5e7eb; text-align: center;">${esc(it.unit)}</td>
            <td style="padding: 7px 10px; border-bottom: 1px solid #e5e7eb; text-align: center; font-family: monospace; font-weight: 700;">${it.quantityRequested}</td>
            <td style="padding: 7px 10px; border-bottom: 1px solid #e5e7eb; text-align: center; font-family: monospace; font-weight: 700; color: #15803d;">${qtyAppr}</td>
            <td style="padding: 7px 10px; border-bottom: 1px solid #e5e7eb; text-align: right; font-family: monospace;">${fmtMoney(it.estimatedUnitMinor, req.currency)}</td>
            <td style="padding: 7px 10px; border-bottom: 1px solid #e5e7eb; text-align: right; font-family: monospace; font-weight: 700;">${fmtMoney(it.totalEstimatedMinor, req.currency)}</td>
          </tr>`;
        }
        return `<tr>
          <td style="padding: 4px 0; border-bottom: 1px dotted #888; font-weight: 800; width: 18%;">${it.quantityRequested} ${esc(it.unit)}</td>
          <td style="padding: 4px 0; border-bottom: 1px dotted #888;">
            <div><strong>${esc(it.itemName)}</strong></div>
            <div style="font-size: 10px; color: #444;">Appr: ${qtyAppr} | @ ${fmtMoney(it.estimatedUnitMinor, req.currency)}</div>
          </td>
          <td style="padding: 4px 0; border-bottom: 1px dotted #888; text-align: right; font-weight: 700;">${fmtMoney(it.totalEstimatedMinor, req.currency)}</td>
        </tr>`;
      })
      .join('');

    const html = isA4
      ? `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${esc(req.number)} · Requisition Voucher</title>
  <style nonce="${nonce}">
    @page { size: A4; margin: 15mm; }
    * { box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      color: #111827;
      margin: 0;
      padding: 0;
      font-size: 13px;
      line-height: 1.5;
    }
    .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #111827; padding-bottom: 14px; margin-bottom: 18px; }
    .brand h1 { margin: 0; font-size: 20px; font-weight: 800; letter-spacing: 0.05em; text-transform: uppercase; }
    .brand p { margin: 2px 0 0 0; color: #4b5563; font-size: 12px; }
    .doc-meta { text-align: right; }
    .doc-title { font-size: 15px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em; margin: 0; }
    .doc-num { font-size: 16px; font-weight: 800; font-family: monospace; color: #0284c7; margin: 2px 0 0 0; }
    .status-badge { display: inline-block; margin-top: 5px; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 700; text-transform: uppercase; background: #f3f4f6; color: ${statusTone}; border: 1px solid ${statusTone}; }
    .grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 6px; padding: 12px; margin-bottom: 18px; }
    .grid .field label { display: block; font-size: 10px; font-weight: 700; text-transform: uppercase; color: #6b7280; margin-bottom: 2px; }
    .grid .field span { font-size: 12.5px; font-weight: 600; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 18px; }
    th { background: #f3f4f6; padding: 8px 10px; text-align: left; font-size: 11px; font-weight: 700; text-transform: uppercase; border-bottom: 2px solid #d1d5db; color: #374151; }
    .total-card { display: flex; justify-content: flex-end; margin-bottom: 24px; }
    .total-box { min-width: 260px; background: #f9fafb; border: 1.5px solid #111827; border-radius: 6px; padding: 10px 14px; }
    .total-box .line { display: flex; justify-content: space-between; font-size: 14px; font-weight: 800; }
    .sign-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; margin-top: 30px; }
    .sign-box { border: 1px solid #d1d5db; border-radius: 6px; padding: 10px; min-height: 85px; display: flex; flex-direction: column; justify-content: space-between; }
    .sign-title { font-size: 10.5px; font-weight: 700; text-transform: uppercase; color: #4b5563; border-bottom: 1px dashed #e5e7eb; padding-bottom: 4px; }
    .sign-name { font-size: 11.5px; font-weight: 600; color: #111827; }
    .sign-line { border-top: 1px solid #9ca3af; margin-top: 25px; padding-top: 3px; font-size: 10px; color: #6b7280; display: flex; justify-content: space-between; }
    .no-print { text-align: center; margin-bottom: 20px; }
    .btn { padding: 8px 18px; background: #111827; color: #fff; border: 0; border-radius: 6px; font-weight: 700; cursor: pointer; }
    @media print { .no-print { display: none; } }
  </style>
</head>
<body>
  <div class="no-print">
    <button class="btn" id="pbtn">Print Requisition Voucher (A4)</button>
  </div>

  <div class="header">
    <div class="brand">
      <h1>Reberon Hotel & Resort</h1>
      <p>Kapchorwa HQ · Mount Elgon, Uganda · Finance & Operations</p>
    </div>
    <div class="doc-meta">
      <div class="doc-title">Internal Requisition Voucher</div>
      <div class="doc-num">${esc(req.number)}</div>
      <div class="status-badge">${esc(req.status.replace(/_/g, ' '))}</div>
    </div>
  </div>

  <div class="grid">
    <div class="field">
      <label>Department</label>
      <span>${esc(req.department)}</span>
    </div>
    <div class="field">
      <label>Date & Time</label>
      <span>${dateStr}</span>
    </div>
    <div class="field">
      <label>Requested By</label>
      <span>${esc(req.requestedByName)}</span>
    </div>
    <div class="field">
      <label>Priority</label>
      <span>${esc(req.priority)}</span>
    </div>
  </div>

  ${req.notes ? `<div style="background: #fffbeb; border: 1px solid #fef3c7; border-radius: 6px; padding: 10px 14px; margin-bottom: 18px; font-size: 12px;"><strong>Purpose / Justification:</strong> ${esc(req.notes)}</div>` : ''}

  <table>
    <thead>
      <tr>
        <th style="width: 40px; text-align: center;">#</th>
        <th>Item Description</th>
        <th style="width: 70px; text-align: center;">Unit</th>
        <th style="width: 80px; text-align: center;">Qty Req.</th>
        <th style="width: 80px; text-align: center;">Qty Appr.</th>
        <th style="width: 120px; text-align: right;">Unit Price</th>
        <th style="width: 130px; text-align: right;">Total Amount</th>
      </tr>
    </thead>
    <tbody>
      ${itemsHtml}
    </tbody>
  </table>

  <div class="total-card">
    <div class="total-box">
      <div class="line">
        <span>Grand Total:</span>
        <span>${fmtMoney(req.totalEstimatedMinor, req.currency)}</span>
      </div>
    </div>
  </div>

  <div class="sign-grid">
    <div class="sign-box">
      <div class="sign-title">1. Initiated / Requested By</div>
      <div class="sign-name">${esc(req.requestedByName)}</div>
      <div class="sign-line"><span>Signature</span> <span>Date: ${new Date(req.createdAt).toLocaleDateString('en-GB')}</span></div>
    </div>
    <div class="sign-box">
      <div class="sign-title">2. Head of Dept / Manager</div>
      <div class="sign-name">${req.managerApprovedBy ? esc(req.managerApprovedBy) : 'Pending Review'}</div>
      <div class="sign-line"><span>Signature</span> <span>Date: ${req.managerApprovedAt ? new Date(req.managerApprovedAt).toLocaleDateString('en-GB') : '__________'}</span></div>
    </div>
    <div class="sign-box">
      <div class="sign-title">3. Director / GM Authorization</div>
      <div class="sign-name">${req.directorApprovedBy ? esc(req.directorApprovedBy) : (req.managerApprovedBy ? 'Authorized' : 'Pending')}</div>
      <div class="sign-line"><span>Signature</span> <span>Date: ${req.directorApprovedAt ? new Date(req.directorApprovedAt).toLocaleDateString('en-GB') : '__________'}</span></div>
    </div>
    <div class="sign-box">
      <div class="sign-title">4. Stores / Disbursed By</div>
      <div class="sign-name">${req.disbursedBy ? esc(req.disbursedBy) : 'Pending Issue'}</div>
      <div class="sign-line"><span>Signature</span> <span>Date: ${req.disbursedAt ? new Date(req.disbursedAt).toLocaleDateString('en-GB') : '__________'}</span></div>
    </div>
    <div class="sign-box" style="grid-column: span 2;">
      <div class="sign-title">5. Goods Received In Good Order By Department</div>
      <div class="sign-name">Name: ____________________________________________________</div>
      <div class="sign-line"><span>Recipient Signature: _______________________</span> <span>Date: ____ / ____ / 2026</span></div>
    </div>
  </div>

  <script nonce="${nonce}">
    document.getElementById('pbtn')?.addEventListener('click', () => window.print());
    ${autoprint ? 'window.addEventListener("load", () => setTimeout(() => window.print(), 150));' : ''}
  </script>
</body>
</html>`
      : `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${esc(req.number)} · Requisition Slip</title>
  <style nonce="${nonce}">
    @page { size: 80mm auto; margin: 4mm; }
    * { box-sizing: border-box; }
    body {
      font-family: ui-monospace, 'Cascadia Mono', 'Courier New', monospace;
      width: 72mm;
      margin: 0 auto;
      padding: 2mm 0;
      color: #000;
      font-size: 11.5px;
      line-height: 1.35;
    }
    .hdr { text-align: center; border-bottom: 2px dashed #000; padding-bottom: 6px; margin-bottom: 6px; }
    .brand { font-size: 14px; font-weight: 800; text-transform: uppercase; }
    .sub { font-size: 10px; margin-top: 2px; }
    .badge { display: inline-block; margin-top: 4px; padding: 2px 6px; border: 1.5px solid #000; font-size: 11px; font-weight: 800; }
    .meta { font-size: 11px; border-bottom: 1px dashed #000; padding-bottom: 6px; margin-bottom: 6px; }
    .meta div { display: flex; justify-content: space-between; margin: 2px 0; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 6px; }
    .totals { border-top: 2px dashed #000; padding-top: 6px; margin-top: 4px; font-size: 12.5px; font-weight: 800; display: flex; justify-content: space-between; }
    .sig { border-top: 1px dashed #000; margin-top: 8px; padding-top: 6px; font-size: 10.5px; }
    .sig div { margin: 4px 0; }
    .no-print { text-align: center; margin-bottom: 10px; }
    .btn { padding: 6px 14px; background: #111; color: #fff; border: 0; border-radius: 4px; font-weight: 700; cursor: pointer; }
    @media print { .no-print { display: none; } }
  </style>
</head>
<body>
  <div class="no-print">
    <button class="btn" id="pbtn">Print 80mm Voucher</button>
  </div>
  <div class="hdr">
    <div class="brand">Reberon Hotel</div>
    <div class="sub">Store Requisition & Issue Slip</div>
    <div class="badge">${esc(req.number)}</div>
  </div>
  <div class="meta">
    <div><span>Dept:</span> <strong>${esc(req.department)}</strong></div>
    <div><span>Date:</span> <span>${dateStr}</span></div>
    <div><span>Req By:</span> <span>${esc(req.requestedByName)}</span></div>
    <div><span>Status:</span> <strong>${esc(req.status)}</strong></div>
    ${req.notes ? `<div><span>Note:</span> <span>${esc(req.notes)}</span></div>` : ''}
  </div>
  <table>
    <tbody>
      ${itemsHtml}
    </tbody>
  </table>
  <div class="totals">
    <span>Total Est:</span>
    <span>${fmtMoney(req.totalEstimatedMinor, req.currency)}</span>
  </div>
  <div class="sig">
    <div>Req: ${esc(req.requestedByName)}</div>
    <div>Mgr: ${req.managerApprovedBy ? esc(req.managerApprovedBy) : '__________'}</div>
    <div>Store Issue: ${req.disbursedBy ? esc(req.disbursedBy) : '__________'}</div>
    <div>Recv Sig: ________________________</div>
  </div>
  <script nonce="${nonce}">
    document.getElementById('pbtn')?.addEventListener('click', () => window.print());
    ${autoprint ? 'window.addEventListener("load", () => setTimeout(() => window.print(), 150));' : ''}
  </script>
</body>
</html>`;

    return { html };
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
        department: (input.department as any) ?? null,
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

  /* ───── Expenses & Cost Drivers ───── */

  async expenses(from?: string, to?: string): Promise<ExpenseDTO[]> {
    const where: any = {};
    if (from || to) {
      where.date = {};
      if (from) where.date.gte = new Date(`${from}T00:00:00.000Z`);
      if (to) where.date.lt = new Date(new Date(`${to}T00:00:00.000Z`).getTime() + 86_400_000);
    }
    const rows = await this.prisma.expense.findMany({
      where,
      orderBy: { date: 'desc' },
      take: 200,
    });
    return rows.map((e) => ({
      id: e.id,
      number: e.number,
      date: e.date.toISOString().slice(0, 10),
      department: e.department,
      category: e.category,
      title: e.title,
      description: e.description,
      vendor: e.vendor,
      amountMinor: e.amountMinor.toString(),
      currency: e.currency as 'UGX' | 'USD',
      paymentMethod: e.paymentMethod,
      referenceNumber: e.referenceNumber,
      receiptUrl: e.receiptUrl,
      recordedByName: e.recordedByName,
      status: e.status,
      createdAt: e.createdAt.toISOString(),
    }));
  }

  async createExpense(
    input: z.infer<typeof zCreateExpenseInput>,
    actor: AuthUser,
  ): Promise<ExpenseDTO> {
    const count = await this.prisma.expense.count();
    const dateObj = input.date ? new Date(`${input.date}T12:00:00.000Z`) : new Date();
    const num = `EXP-${dateObj.getFullYear()}-${String(count + 1).padStart(4, '0')}`;
    const exp = await this.prisma.expense.create({
      data: {
        number: num,
        date: dateObj,
        department: input.department as any,
        category: input.category as any,
        title: input.title,
        description: input.description ?? null,
        vendor: input.vendor ?? null,
        amountMinor: BigInt(input.amountMinor),
        currency: input.currency as any,
        paymentMethod: input.paymentMethod as any,
        referenceNumber: input.referenceNumber ?? null,
        receiptUrl: input.receiptUrl ?? null,
        recordedById: actor.id,
        recordedByName: actor.name,
      },
    });

    await this.audit.record({
      actor,
      action: 'expense.create',
      entityType: 'Expense',
      entityId: exp.id,
      summary: `Recorded expense ${exp.number} · ${exp.title} (${exp.amountMinor.toString()} ${exp.currency})`,
    });

    return {
      id: exp.id,
      number: exp.number,
      date: exp.date.toISOString().slice(0, 10),
      department: exp.department,
      category: exp.category,
      title: exp.title,
      description: exp.description,
      vendor: exp.vendor,
      amountMinor: exp.amountMinor.toString(),
      currency: exp.currency as 'UGX' | 'USD',
      paymentMethod: exp.paymentMethod,
      referenceNumber: exp.referenceNumber,
      receiptUrl: exp.receiptUrl,
      recordedByName: exp.recordedByName,
      status: exp.status,
      createdAt: exp.createdAt.toISOString(),
    };
  }

  async deleteExpense(id: string, actor: AuthUser) {
    const exp = await this.prisma.expense.findUnique({ where: { id } });
    if (!exp) throw notFound('Expense');
    await this.prisma.expense.delete({ where: { id } });
    await this.audit.record({
      actor,
      action: 'expense.delete',
      entityType: 'Expense',
      entityId: id,
      summary: `Deleted expense ${exp.number} · ${exp.title}`,
    });
    return { ok: true };
  }

  /* ───────────────────────── Hotel Departments & Cost Centers ───────────────────────── */

  private async ensureDefaultDepartments(): Promise<void> {
    const count = await this.prisma.hotelDepartment.count();
    if (count > 0) return;

    const defaults = [
      { code: 'FRONT_DESK', name: 'Front Desk & Reception', location: 'Ground Floor, Main Lobby', headName: 'Sarah Namatovu', sortOrder: 1 },
      { code: 'KITCHEN', name: 'Kitchen & Main Restaurant', location: 'Main Building Kitchen', headName: 'Chef Michael Mukasa', sortOrder: 2 },
      { code: 'BAR', name: 'Bar & Lounge Terrace', location: 'Ground Floor & Pool Deck', headName: 'Denis Kato', sortOrder: 3 },
      { code: 'HEALTH_CLUB', name: 'Health Club, Gym & Spa', location: 'Wellness Wing', headName: 'Grace Achieng', sortOrder: 4 },
      { code: 'HOUSEKEEPING', name: 'Housekeeping & Laundry', location: 'Service Area Level 1', headName: 'Agnes Nabirye', sortOrder: 5 },
      { code: 'CONFERENCE', name: 'Conferences & Events', location: 'Conference Center Wing', headName: 'Patrick Ochieng', sortOrder: 6 },
      { code: 'MAINTENANCE', name: 'Maintenance & Facilities', location: 'Engineering Workshop', headName: 'Eng. David Ssemwogerere', sortOrder: 7 },
      { code: 'ENERGY_UTILITIES', name: 'Energy & Utilities', location: 'Substation & Power Plant', headName: 'Eng. Isaac Tumusiime', sortOrder: 8 },
      { code: 'ADMIN_GENERAL', name: 'Administration & Operations', location: 'Executive Offices', headName: 'General Manager', sortOrder: 9 },
    ];

    for (const d of defaults) {
      await this.prisma.hotelDepartment.upsert({
        where: { code: d.code },
        update: {},
        create: {
          code: d.code,
          name: d.name,
          slug: d.code.toLowerCase().replace(/_/g, '-'),
          location: d.location,
          headName: d.headName,
          sortOrder: d.sortOrder,
          monthlyBudgetMinor: 5000000n,
          currency: 'UGX',
          isSeed: true,
          isActive: true,
        },
      });
    }
  }

  async listDepartments(): Promise<HotelDepartmentDTO[]> {
    await this.ensureDefaultDepartments();
    const departments = await this.prisma.hotelDepartment.findMany({
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });

    const [itemsByDept, reqsByDept, staffByDept, staffProfiles] = await Promise.all([
      this.prisma.inventoryItem.groupBy({
        by: ['department'],
        _count: { _all: true },
      }),
      this.prisma.requisition.groupBy({
        by: ['department'],
        where: { status: { in: ['PENDING', 'MANAGER_APPROVED'] } },
        _count: { _all: true },
      }),
      this.prisma.staffProfile.groupBy({
        by: ['departmentCode'],
        where: { status: 'ACTIVE' },
        _count: { _all: true },
      }),
      this.prisma.staffProfile.findMany({
        select: { id: true, firstName: true, lastName: true },
      }),
    ]);

    const itemsCountMap = new Map<string, number>();
    for (const row of itemsByDept) {
      itemsCountMap.set(row.department, row._count._all);
    }
    const reqsCountMap = new Map<string, number>();
    for (const row of reqsByDept) {
      reqsCountMap.set(row.department, row._count._all);
    }
    const staffCountMap = new Map<string, number>();
    for (const row of staffByDept) {
      staffCountMap.set(row.departmentCode, row._count._all);
    }
    const staffNameMap = new Map<string, string>();
    for (const s of staffProfiles) {
      staffNameMap.set(s.id, `${s.firstName} ${s.lastName}`);
    }

    return departments.map((d) => ({
      id: d.id,
      code: d.code,
      name: d.name,
      slug: d.slug,
      description: d.description,
      location: d.location,
      headStaffId: d.headStaffId,
      headName: d.headStaffId ? (staffNameMap.get(d.headStaffId) ?? d.headName) : d.headName,
      headUserId: d.headUserId,
      monthlyBudgetMinor: (d.monthlyBudgetMinor ?? 0n).toString(),
      currency: d.currency as 'UGX' | 'USD',
      isActive: d.isActive,
      sortOrder: d.sortOrder,
      isSeed: d.isSeed,
      staffCount: staffCountMap.get(d.code) ?? 0,
      inventoryCount: itemsCountMap.get(d.code) ?? 0,
      openRequisitionsCount: reqsCountMap.get(d.code) ?? 0,
      createdAt: d.createdAt.toISOString(),
      updatedAt: d.updatedAt.toISOString(),
    }));
  }

  async createDepartment(input: z.infer<typeof zCreateDepartmentInput>, actor: AuthUser): Promise<HotelDepartmentDTO> {
    const code = input.code.trim().toUpperCase().replace(/\s+/g, '_');
    const existing = await this.prisma.hotelDepartment.findUnique({ where: { code } });
    if (existing) {
      throw badRequest(`A department with code "${code}" already exists.`);
    }

    let headName = input.headName?.trim() || null;
    let headStaffId = input.headStaffId || null;
    if (headStaffId) {
      const staff = await this.prisma.staffProfile.findUnique({ where: { id: headStaffId } });
      if (staff) headName = `${staff.firstName} ${staff.lastName}`;
    }

    const dept = await this.prisma.hotelDepartment.create({
      data: {
        code,
        name: input.name.trim(),
        slug: code.toLowerCase().replace(/_/g, '-'),
        description: input.description?.trim() || null,
        location: input.location?.trim() || null,
        headStaffId,
        headName,
        headUserId: input.headUserId || null,
        monthlyBudgetMinor: input.monthlyBudgetMinor ? BigInt(input.monthlyBudgetMinor) : 0n,
        currency: (input.currency as 'UGX' | 'USD') || 'UGX',
        isActive: input.isActive ?? true,
        sortOrder: input.sortOrder ?? 0,
        isSeed: false,
      },
    });

    await this.audit.record({
      actor,
      action: 'department.create',
      entityType: 'HotelDepartment',
      entityId: dept.id,
      summary: `Created hotel department ${dept.name} (${dept.code})`,
    });

    return {
      id: dept.id,
      code: dept.code,
      name: dept.name,
      slug: dept.slug,
      description: dept.description,
      location: dept.location,
      headStaffId: dept.headStaffId,
      headName: dept.headName,
      headUserId: dept.headUserId,
      monthlyBudgetMinor: (dept.monthlyBudgetMinor ?? 0n).toString(),
      currency: dept.currency as 'UGX' | 'USD',
      isActive: dept.isActive,
      sortOrder: dept.sortOrder,
      isSeed: dept.isSeed,
      staffCount: 0,
      inventoryCount: 0,
      openRequisitionsCount: 0,
      createdAt: dept.createdAt.toISOString(),
      updatedAt: dept.updatedAt.toISOString(),
    };
  }

  async updateDepartment(
    id: string,
    input: z.infer<typeof zUpdateDepartmentInput>,
    actor: AuthUser,
  ): Promise<HotelDepartmentDTO> {
    const existing = await this.prisma.hotelDepartment.findUnique({ where: { id } });
    if (!existing) throw notFound('HotelDepartment');

    let headName = input.headName !== undefined ? input.headName?.trim() || null : undefined;
    let headStaffId = input.headStaffId !== undefined ? input.headStaffId : undefined;
    if (headStaffId) {
      const staff = await this.prisma.staffProfile.findUnique({ where: { id: headStaffId } });
      if (staff) headName = `${staff.firstName} ${staff.lastName}`;
    } else if (headStaffId === null) {
      headName = null;
    }

    const updated = await this.prisma.hotelDepartment.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name.trim() } : {}),
        ...(input.description !== undefined ? { description: input.description?.trim() || null } : {}),
        ...(input.location !== undefined ? { location: input.location?.trim() || null } : {}),
        ...(headStaffId !== undefined ? { headStaffId } : {}),
        ...(headName !== undefined ? { headName } : {}),
        ...(input.headUserId !== undefined ? { headUserId: input.headUserId || null } : {}),
        ...(input.monthlyBudgetMinor !== undefined ? { monthlyBudgetMinor: BigInt(input.monthlyBudgetMinor) } : {}),
        ...(input.currency !== undefined ? { currency: input.currency as 'UGX' | 'USD' } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
        ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
      },
    });

    await this.audit.record({
      actor,
      action: 'department.update',
      entityType: 'HotelDepartment',
      entityId: updated.id,
      summary: `Updated department ${updated.name} (${updated.code})`,
    });

    const [inventoryCount, openRequisitionsCount, staffCount] = await Promise.all([
      this.prisma.inventoryItem.count({ where: { department: updated.code as any } }),
      this.prisma.requisition.count({
        where: { department: updated.code as any, status: { in: ['PENDING', 'MANAGER_APPROVED'] } },
      }),
      this.prisma.staffProfile.count({ where: { departmentCode: updated.code, status: 'ACTIVE' } }),
    ]);

    return {
      id: updated.id,
      code: updated.code,
      name: updated.name,
      slug: updated.slug,
      description: updated.description,
      location: updated.location,
      headStaffId: updated.headStaffId,
      headName: updated.headName,
      headUserId: updated.headUserId,
      monthlyBudgetMinor: (updated.monthlyBudgetMinor ?? 0n).toString(),
      currency: updated.currency as 'UGX' | 'USD',
      isActive: updated.isActive,
      sortOrder: updated.sortOrder,
      isSeed: updated.isSeed,
      staffCount,
      inventoryCount,
      openRequisitionsCount,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
    };
  }

  async deleteDepartment(id: string, actor: AuthUser): Promise<{ ok: boolean }> {
    const existing = await this.prisma.hotelDepartment.findUnique({ where: { id } });
    if (!existing) throw notFound('HotelDepartment');

    const itemsCount = await this.prisma.inventoryItem.count({ where: { department: existing.code as any } });
    if (itemsCount > 0) {
      await this.prisma.hotelDepartment.update({
        where: { id },
        data: { isActive: false },
      });
      await this.audit.record({
        actor,
        action: 'department.deactivate',
        entityType: 'HotelDepartment',
        entityId: id,
        summary: `Deactivated department ${existing.name} because it has ${itemsCount} inventory items attached`,
      });
      return { ok: true };
    }

    await this.prisma.hotelDepartment.delete({ where: { id } });
    await this.audit.record({
      actor,
      action: 'department.delete',
      entityType: 'HotelDepartment',
      entityId: id,
      summary: `Deleted department ${existing.name} (${existing.code})`,
    });
    return { ok: true };
  }

  /* ───────────────────────── Item Categories ───────────────────────── */

  private async ensureDefaultItemCategories(): Promise<void> {
    const count = await this.prisma.itemCategory.count();
    if (count > 0) return;

    const defaults = [
      { code: 'LINEN_GYM', name: 'Gym & Spa Towels', defaultUnit: 'PIECE', defaultParLevel: 50, departmentCode: 'HEALTH_CLUB', tone: 'sky', sortOrder: 1 },
      { code: 'LINEN_ROOM', name: 'Room Linen & Bath Towels', defaultUnit: 'PIECE', defaultParLevel: 80, departmentCode: 'HOUSEKEEPING', tone: 'indigo', sortOrder: 2 },
      { code: 'CONSUMABLE', name: 'Guest & Cleaning Consumables', defaultUnit: 'BOX', defaultParLevel: 25, departmentCode: 'HOUSEKEEPING', tone: 'amber', sortOrder: 3 },
      { code: 'BEVERAGE', name: 'Beverages, Wines & Spirits', defaultUnit: 'BOTTLE', defaultParLevel: 30, departmentCode: 'BAR', tone: 'rose', sortOrder: 4 },
      { code: 'FOOD_KITCHEN', name: 'Kitchen Foodstuffs & Perishables', defaultUnit: 'KG', defaultParLevel: 40, departmentCode: 'KITCHEN', tone: 'emerald', sortOrder: 5 },
      { code: 'FIXED_ASSET', name: 'Fixed Assets, Furniture & Fixtures', defaultUnit: 'UNIT', defaultParLevel: 5, departmentCode: 'MAINTENANCE', tone: 'violet', sortOrder: 6 },
    ];

    for (const c of defaults) {
      await this.prisma.itemCategory.upsert({
        where: { code: c.code },
        update: {},
        create: {
          code: c.code,
          name: c.name,
          slug: c.code.toLowerCase().replace(/_/g, '-'),
          defaultUnit: c.defaultUnit,
          defaultParLevel: c.defaultParLevel,
          departmentCode: c.departmentCode,
          tone: c.tone,
          sortOrder: c.sortOrder,
          isSeed: true,
          isActive: true,
        },
      });
    }
  }

  async listItemCategories(): Promise<ItemCategoryDTO[]> {
    await this.ensureDefaultItemCategories();
    const categories = await this.prisma.itemCategory.findMany({
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });

    const items = await this.prisma.inventoryItem.findMany({
      select: { category: true, onHand: true, unitCostMinor: true },
    });

    const countMap = new Map<string, number>();
    const valueMap = new Map<string, bigint>();

    for (const item of items) {
      countMap.set(item.category, (countMap.get(item.category) ?? 0) + 1);
      const val = BigInt(item.onHand) * BigInt(item.unitCostMinor);
      valueMap.set(item.category, (valueMap.get(item.category) ?? 0n) + val);
    }

    const departments = await this.prisma.hotelDepartment.findMany({ select: { code: true, name: true } });
    const deptNameMap = new Map<string, string>(departments.map((d) => [d.code, d.name]));

    return categories.map((c) => ({
      id: c.id,
      code: c.code,
      name: c.name,
      slug: c.slug,
      description: c.description,
      defaultUnit: c.defaultUnit,
      defaultParLevel: c.defaultParLevel,
      departmentCode: c.departmentCode,
      departmentName: c.departmentCode ? (deptNameMap.get(c.departmentCode) ?? c.departmentCode) : null,
      tone: c.tone,
      isActive: c.isActive,
      sortOrder: c.sortOrder,
      isSeed: c.isSeed,
      itemCount: countMap.get(c.code) ?? 0,
      totalValueMinor: (valueMap.get(c.code) ?? 0n).toString(),
      createdAt: c.createdAt.toISOString(),
      updatedAt: c.updatedAt.toISOString(),
    }));
  }

  async createItemCategory(input: z.infer<typeof zCreateCategoryInput>, actor: AuthUser): Promise<ItemCategoryDTO> {
    const code = input.code.trim().toUpperCase().replace(/\s+/g, '_');
    const existing = await this.prisma.itemCategory.findUnique({ where: { code } });
    if (existing) {
      throw badRequest(`An item category with code "${code}" already exists.`);
    }

    const cat = await this.prisma.itemCategory.create({
      data: {
        code,
        name: input.name.trim(),
        slug: code.toLowerCase().replace(/_/g, '-'),
        description: input.description?.trim() || null,
        defaultUnit: input.defaultUnit?.trim() || 'PIECE',
        defaultParLevel: input.defaultParLevel ?? 10,
        departmentCode: input.departmentCode?.trim() || null,
        tone: input.tone?.trim() || 'neutral',
        isActive: input.isActive ?? true,
        sortOrder: input.sortOrder ?? 0,
        isSeed: false,
      },
    });

    await this.audit.record({
      actor,
      action: 'category.create',
      entityType: 'ItemCategory',
      entityId: cat.id,
      summary: `Created item category ${cat.name} (${cat.code})`,
    });

    return {
      id: cat.id,
      code: cat.code,
      name: cat.name,
      slug: cat.slug,
      description: cat.description,
      defaultUnit: cat.defaultUnit,
      defaultParLevel: cat.defaultParLevel,
      departmentCode: cat.departmentCode,
      tone: cat.tone,
      isActive: cat.isActive,
      sortOrder: cat.sortOrder,
      isSeed: cat.isSeed,
      itemCount: 0,
      totalValueMinor: '0',
      createdAt: cat.createdAt.toISOString(),
      updatedAt: cat.updatedAt.toISOString(),
    };
  }

  async updateItemCategory(
    id: string,
    input: z.infer<typeof zUpdateCategoryInput>,
    actor: AuthUser,
  ): Promise<ItemCategoryDTO> {
    const existing = await this.prisma.itemCategory.findUnique({ where: { id } });
    if (!existing) throw notFound('ItemCategory');

    const updated = await this.prisma.itemCategory.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name.trim() } : {}),
        ...(input.description !== undefined ? { description: input.description?.trim() || null } : {}),
        ...(input.defaultUnit !== undefined ? { defaultUnit: input.defaultUnit.trim() } : {}),
        ...(input.defaultParLevel !== undefined ? { defaultParLevel: input.defaultParLevel } : {}),
        ...(input.departmentCode !== undefined ? { departmentCode: input.departmentCode?.trim() || null } : {}),
        ...(input.tone !== undefined ? { tone: input.tone.trim() } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
        ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
      },
    });

    await this.audit.record({
      actor,
      action: 'category.update',
      entityType: 'ItemCategory',
      entityId: updated.id,
      summary: `Updated item category ${updated.name} (${updated.code})`,
    });

    const items = await this.prisma.inventoryItem.findMany({
      where: { category: updated.code as any },
      select: { onHand: true, unitCostMinor: true },
    });
    const totalVal = items.reduce((sum, i) => sum + BigInt(i.onHand) * BigInt(i.unitCostMinor), 0n);

    return {
      id: updated.id,
      code: updated.code,
      name: updated.name,
      slug: updated.slug,
      description: updated.description,
      defaultUnit: updated.defaultUnit,
      defaultParLevel: updated.defaultParLevel,
      departmentCode: updated.departmentCode,
      tone: updated.tone,
      isActive: updated.isActive,
      sortOrder: updated.sortOrder,
      isSeed: updated.isSeed,
      itemCount: items.length,
      totalValueMinor: totalVal.toString(),
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
    };
  }

  async deleteItemCategory(id: string, actor: AuthUser): Promise<{ ok: boolean }> {
    const existing = await this.prisma.itemCategory.findUnique({ where: { id } });
    if (!existing) throw notFound('ItemCategory');

    const count = await this.prisma.inventoryItem.count({ where: { category: existing.code as any } });
    if (count > 0) {
      await this.prisma.itemCategory.update({
        where: { id },
        data: { isActive: false },
      });
      await this.audit.record({
        actor,
        action: 'category.deactivate',
        entityType: 'ItemCategory',
        entityId: id,
        summary: `Deactivated item category ${existing.name} because it has ${count} items attached`,
      });
      return { ok: true };
    }

    await this.prisma.itemCategory.delete({ where: { id } });
    await this.audit.record({
      actor,
      action: 'category.delete',
      entityType: 'ItemCategory',
      entityId: id,
      summary: `Deleted category ${existing.name} (${existing.code})`,
    });
    return { ok: true };
  }
}
