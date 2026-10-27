import { Injectable } from '@nestjs/common';
import type {
  CurrencyCode,
  Department,
  HealthClubAccessLogDTO,
  HealthClubDashboardDTO,
  HealthClubMembershipDTO,
  InventoryDashboardDTO,
  InventoryItemDTO,
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
  zCheckInHealthClubInput,
  zConvertQuotationToInvoiceInput,
  zCreateAnnouncementInput,
  zCreateInventoryItemInput,
  zCreateMembershipInput,
  zCreatePosOrderInput,
  zCreateQuotationInput,
  zCreateRequisitionInput,
  zRecordStockMovementInput,
  zReviewRequisitionInput,
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
      documentId: r.documentId,
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

    // If charging to Room Folio, verify reservation and append FolioLine
    let folioLineId: string | null = null;
    let guestName = input.customerName || 'Walk-in Guest';
    let guestPhone = input.customerPhone || null;

    if (input.paymentMethod === 'ROOM_FOLIO') {
      if (!input.reservationId) throw badRequest('Select an active room reservation to charge to a room folio');
      const res = await this.prisma.reservation.findUnique({
        where: { id: input.reservationId },
        include: { contact: true, folio: true },
      });
      if (!res || !res.folio) throw notFound('Reservation folio');
      guestName = res.contact.name;
      guestPhone = res.contact.phone;
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

    // Issue official numbered receipt if settled immediately (Cash, MoMo, Card, Bank)
    let documentId: string | null = null;
    if (input.paymentMethod !== 'ROOM_FOLIO' && total > 0n) {
      const todayIso = new Date().toISOString().slice(0, 10);
      const doc = await this.docs.issueDirectDocument({
        kind: 'RECEIPT',
        reservationId: input.reservationId ?? null,
        currency: input.currency,
        amountMinor: total,
        issuedTo: { name: guestName, phone: guestPhone, email: null },
        lines: orderLines.map((l) => ({
          date: todayIso,
          description: `${l.quantity} × ${l.itemName}`,
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

    const defaultStatus = input.status ?? (outlet.type === 'KITCHEN' ? 'PREPARING' : 'COMPLETED');

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
      summary: `${outlet.name} order ${orderNumber} (${input.paymentMethod})`,
    });

    return this.mapOrder(created);
  }

  async updateOrderStatus(id: string, status: PosOrderDTO['status'], actor: AuthUser): Promise<PosOrderDTO> {
    const updated = await this.prisma.posOrder.update({
      where: { id },
      data: { status },
      include: { outlet: true, items: true },
    });
    await this.audit.record({
      actor,
      action: 'pos.order.status',
      entityType: 'PosOrder',
      entityId: id,
      summary: `Order ${updated.orderNumber} marked ${status}`,
    });
    return this.mapOrder(updated);
  }

  async toggleItem(id: string, input: z.infer<typeof zTogglePosItemInput>, actor: AuthUser) {
    const item = await this.prisma.posItem.update({
      where: { id },
      data: {
        isAvailable: input.isAvailable,
        ...(input.priceMinorUGX ? { priceMinorUGX: BigInt(input.priceMinorUGX) } : {}),
        ...(input.priceMinorUSD !== undefined
          ? { priceMinorUSD: input.priceMinorUSD ? BigInt(input.priceMinorUSD) : null }
          : {}),
      },
    });
    await this.audit.record({
      actor,
      action: 'pos.item.update',
      entityType: 'PosItem',
      entityId: id,
      summary: `${item.name} availability set to ${item.isAvailable}`,
    });
    return { id: item.id, isAvailable: item.isAvailable };
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
