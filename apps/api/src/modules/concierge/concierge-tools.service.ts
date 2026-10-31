import { Injectable, Logger } from '@nestjs/common';
import type { GuestRequestKind } from '@reberon/db';
import { t } from '@reberon/contracts';
import type {
  ConciergeActivityItemDTO,
  ConciergeCardDTO,
  ConciergeDocumentItemDTO,
  ConciergeGuestDossierDTO,
  ConciergeGuestIdentityDTO,
  LText,
} from '@reberon/contracts';
import { normalizePhone, referenceCode } from '@reberon/utils';
import { PrismaService } from '../../common/prisma.service.js';
import { PricingService } from '../booking/pricing.service.js';
import { BookingService } from '../booking/booking.service.js';
import { DocumentsService } from '../documents/documents.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { env } from '../../config.js';
import { DeepSeekToolDefinition } from './deepseek.client.js';

const toLText = (v: unknown): LText => (v && typeof v === 'object' ? (v as LText) : {});
const tr = (v: unknown, fallback = ''): string => t(toLText(v)) || fallback;
const getMediaUrl = (id?: string | null) =>
  id ? `${env.MEDIA_PUBLIC_URL || 'https://reberonhotel.com/media'}/i/${id}/1280.webp` : undefined;

const isUuid = (s: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);

function roomTypeWhere(raw: string) {
  const trimmed = (raw || '').trim();
  if (!trimmed) return { id: '00000000-0000-0000-0000-000000000000' };
  if (isUuid(trimmed)) return { id: trimmed };
  const clean = trimmed
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  const prefix = clean.replace(/-suite|-king|-family|-twin/g, '');
  return {
    OR: [{ slug: clean }, ...(prefix && prefix.length >= 3 ? [{ slug: { contains: prefix } }] : [])],
  };
}

export interface ToolExecutionResult {
  toolCallId: string;
  name: string;
  output: string;
  card?: ConciergeCardDTO;
}

@Injectable()
export class ConciergeToolsService {
  private readonly log = new Logger('ConciergeTools');

  constructor(
    private readonly prisma: PrismaService,
    private readonly pricing: PricingService,
    private readonly booking: BookingService,
    private readonly documents: DocumentsService,
    private readonly notifications: NotificationsService,
  ) {}

  /* ── Build Complete Real-Time Guest Dossier Across Entire System ── */
  async buildGuestDossier(identity: ConciergeGuestIdentityDTO, syncContact = false): Promise<ConciergeGuestDossierDTO> {
    const cleanName = (identity.name || '').trim();
    const cleanPhone = (identity.phone || '').trim();
    const cleanEmail = (identity.email || '').trim().toLowerCase();
    const cleanCode = (identity.bookingCode || '').trim().toUpperCase();

    const webBase = env.WEB_URL || 'https://reberonhotel.com';
    const apiBase = env.API_URL || 'https://reberonhotel.com/api';

    // 1. Find matching Contacts
    const contactOr: Record<string, unknown>[] = [];
    if (identity.contactId && isUuid(identity.contactId)) {
      contactOr.push({ id: identity.contactId });
    }
    if (cleanPhone && cleanPhone.length >= 6) {
      const phoneDigits = cleanPhone.replace(/\D/g, '').slice(-8);
      if (phoneDigits.length >= 6) {
        contactOr.push({ phone: { contains: phoneDigits } });
      }
    }
    if (cleanEmail && cleanEmail.includes('@') && !cleanEmail.startsWith('guest@')) {
      contactOr.push({ email: { equals: cleanEmail, mode: 'insensitive' } });
    }
    if (cleanName && cleanName.length >= 3 && cleanName.toLowerCase() !== 'guest') {
      contactOr.push({ name: { equals: cleanName, mode: 'insensitive' } });
    }

    const contacts = contactOr.length
      ? await this.prisma.contact.findMany({
          where: { OR: contactOr },
          orderBy: { updatedAt: 'desc' },
          take: 10,
        })
      : [];

    const contactIds = contacts.map((c) => c.id);

    // 2. Find Reservations
    const resOr: Record<string, unknown>[] = [];
    if (contactIds.length) resOr.push({ contactId: { in: contactIds } });
    if (cleanCode && cleanCode.startsWith('RB-')) resOr.push({ code: cleanCode });
    if (cleanPhone && cleanPhone.length >= 6) {
      const phoneDigits = cleanPhone.replace(/\D/g, '').slice(-8);
      if (phoneDigits.length >= 6) {
        resOr.push({ contact: { phone: { contains: phoneDigits } } });
      }
    }
    if (cleanName && cleanName.length >= 3 && cleanName.toLowerCase() !== 'guest') {
      resOr.push({ contact: { name: { contains: cleanName, mode: 'insensitive' } } });
    }

    const dbReservations = resOr.length
      ? await this.prisma.reservation.findMany({
          where: { OR: resOr },
          include: { contact: true, rooms: true, requests: true },
          orderBy: { createdAt: 'desc' },
          take: 15,
        })
      : [];

    // Resolve primaryContact from explicit contactId, matching reservation code, or top matched contact
    const codeReservation = cleanCode ? dbReservations.find((r) => r.code === cleanCode) : undefined;
    let primaryContact =
      (identity.contactId ? contacts.find((c) => c.id === identity.contactId) : undefined) ||
      codeReservation?.contact ||
      contacts[0] ||
      dbReservations[0]?.contact;

    if (primaryContact && !contactIds.includes(primaryContact.id)) {
      contactIds.push(primaryContact.id);
    }

    // 2b. Synchronize / Update Guest Contact in Database when user updates profile or replaces placeholder "Guest"
    const isRealUserName = Boolean(cleanName && cleanName.length >= 2 && cleanName.toLowerCase() !== 'guest');
    const isRealUserEmail = Boolean(cleanEmail && cleanEmail.includes('@') && !cleanEmail.startsWith('guest@'));
    const normPhone = cleanPhone && cleanPhone.length >= 6 ? normalizePhone(cleanPhone) || cleanPhone : undefined;

    if (primaryContact) {
      const dbIsPlaceholderName = !primaryContact.name || primaryContact.name.trim().toLowerCase() === 'guest';
      const dbIsPlaceholderEmail = !primaryContact.email || primaryContact.email.toLowerCase().startsWith('guest@');

      if (syncContact || dbIsPlaceholderName || dbIsPlaceholderEmail) {
        const contactPatch: { name?: string; phone?: string; email?: string } = {};
        if (isRealUserName && (syncContact || dbIsPlaceholderName) && cleanName !== primaryContact.name) {
          contactPatch.name = cleanName;
        }
        if (normPhone && (syncContact || !primaryContact.phone) && normPhone !== primaryContact.phone) {
          contactPatch.phone = normPhone;
        }
        if (isRealUserEmail && (syncContact || dbIsPlaceholderEmail) && cleanEmail !== primaryContact.email) {
          contactPatch.email = cleanEmail;
        }

        if (Object.keys(contactPatch).length > 0) {
          try {
            primaryContact = await this.prisma.contact.update({
              where: { id: primaryContact.id },
              data: contactPatch,
            });
            for (const r of dbReservations) {
              if (r.contactId === primaryContact.id) {
                r.contact = primaryContact;
              }
            }
          } catch (err) {
            this.log.warn(
              `Could not update contact ${primaryContact.id}: ${err instanceof Error ? err.message : String(err)}`,
            );
          }
        }
      }
    } else if (syncContact && isRealUserName && (normPhone || isRealUserEmail)) {
      try {
        primaryContact = await this.prisma.contact.create({
          data: {
            name: cleanName,
            phone: normPhone ?? null,
            email: isRealUserEmail ? cleanEmail : null,
          },
        });
        contactIds.push(primaryContact.id);
      } catch (err) {
        this.log.warn(`Could not create contact for ${cleanName}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    const roomTypeIds = Array.from(new Set(dbReservations.flatMap((r) => r.rooms.map((rm) => rm.roomTypeId))));
    const roomTypesMap = new Map(
      (
        await this.prisma.roomType.findMany({
          where: { id: { in: roomTypeIds } },
          select: { id: true, name: true },
        })
      ).map((rt) => [rt.id, tr(rt.name)]),
    );

    const reservations = dbReservations.map((r) => {
      const token = this.booking.accessToken(r.code);
      const stayUrl = `${webBase}/stay?code=${r.code}&t=${encodeURIComponent(token)}`;
      const balanceMinor = r.totalMinor - r.paidMinor;
      const paymentUrl =
        balanceMinor > 0n ? `${webBase}/book/return?code=${r.code}&t=${encodeURIComponent(token)}` : undefined;
      const roomName = r.rooms[0] ? roomTypesMap.get(r.rooms[0].roomTypeId) || 'Highland Suite' : 'Highland Suite';
      const nights = Math.max(1, Math.round((r.departure.getTime() - r.arrival.getTime()) / 86_400_000));
      return {
        id: r.id,
        code: r.code,
        status: r.status,
        roomName,
        arrival: r.arrival.toISOString().slice(0, 10),
        departure: r.departure.toISOString().slice(0, 10),
        nights,
        total: `${Number(r.totalMinor).toLocaleString()} ${r.currency}`,
        paid: `${Number(r.paidMinor).toLocaleString()} ${r.currency}`,
        balance: `${Number(balanceMinor).toLocaleString()} ${r.currency}`,
        currency: r.currency,
        stayUrl,
        paymentUrl,
        createdAt: r.createdAt,
        requests: r.requests,
      };
    });

    const reservationIds = dbReservations.map((r) => r.id);
    const resCodeById = new Map(dbReservations.map((r) => [r.id, r.code]));

    // 3. Find Issued Documents (Receipts, Invoices, Refund Notes)
    const docOr: Record<string, unknown>[] = [];
    if (reservationIds.length) docOr.push({ reservationId: { in: reservationIds } });
    if (cleanCode && (cleanCode.startsWith('RCT-') || cleanCode.startsWith('INV-') || cleanCode.startsWith('RFD-'))) {
      docOr.push({ number: cleanCode });
    }
    if (cleanName && cleanName.length >= 3 && cleanName.toLowerCase() !== 'guest') {
      docOr.push({ issuedTo: { path: ['name'], string_contains: cleanName } });
    }
    if (cleanPhone && cleanPhone.length >= 6) {
      docOr.push({ issuedTo: { path: ['phone'], string_contains: cleanPhone.slice(-8) } });
    }

    const dbDocs = docOr.length
      ? await this.prisma.issuedDocument.findMany({
          where: { OR: docOr },
          orderBy: { issuedAt: 'desc' },
          take: 25,
        })
      : [];

    // Also find Quotations
    const quoOr: Record<string, unknown>[] = [];
    if (cleanCode && cleanCode.startsWith('QUO-')) quoOr.push({ number: cleanCode });
    if (cleanPhone && cleanPhone.length >= 6) {
      quoOr.push({ clientPhone: { contains: cleanPhone.replace(/\D/g, '').slice(-8) } });
    }
    if (cleanEmail && cleanEmail.includes('@')) {
      quoOr.push({ clientEmail: { equals: cleanEmail, mode: 'insensitive' } });
    }
    if (cleanName && cleanName.length >= 3 && cleanName.toLowerCase() !== 'guest') {
      quoOr.push({ clientName: { contains: cleanName, mode: 'insensitive' } });
    }

    const dbQuotations = quoOr.length
      ? await this.prisma.quotation.findMany({
          where: { OR: quoOr },
          orderBy: { createdAt: 'desc' },
          take: 10,
        })
      : [];

    const documents: ConciergeDocumentItemDTO[] = [
      ...dbDocs.map((d) => {
        const check = this.documents.checkCode(d.number);
        const resCode = d.reservationId ? resCodeById.get(d.reservationId) : undefined;
        const printUrl = resCode
          ? this.documents.publicUrl(d, resCode)
          : `${apiBase}/v1/public/documents/${d.id}?check=${encodeURIComponent(check)}`;
        return {
          id: d.id,
          kind: d.kind as 'RECEIPT' | 'INVOICE' | 'REFUND',
          number: d.number,
          amount: `${Number(d.amountMinor).toLocaleString()} ${d.currency}`,
          currency: d.currency,
          issuedAt: d.issuedAt.toISOString(),
          checkCode: check,
          reservationCode: resCode,
          status: d.voidedAt ? 'VOIDED' : 'VALID',
          printUrl,
          verifyUrl: `${webBase}/verify?number=${encodeURIComponent(d.number)}&check=${encodeURIComponent(check)}`,
        };
      }),
      ...dbQuotations.map((q) => ({
        id: q.id,
        kind: 'QUOTATION' as const,
        number: q.number,
        amount: `${Number(q.totalMinor).toLocaleString()} ${q.currency}`,
        currency: q.currency,
        issuedAt: q.createdAt.toISOString(),
        checkCode: q.checkCode,
        status: q.status,
        printUrl: `${apiBase}/v1/public/documents/quotation/${q.id}?check=${encodeURIComponent(q.checkCode)}`,
        verifyUrl: `${webBase}/verify?number=${encodeURIComponent(q.number)}&check=${encodeURIComponent(q.checkCode)}`,
      })),
    ];

    // 4. Find Recent Activities across POS, Health Club, Waitlist, Inquiries, and Guest Requests
    const activities: ConciergeActivityItemDTO[] = [];

    for (const r of reservations) {
      activities.push({
        id: `res-${r.code}`,
        kind: 'RESERVATION',
        title: `Suite Reservation · ${r.roomName}`,
        subtitle: `${r.arrival} → ${r.departure} (${r.nights} night${r.nights > 1 ? 's' : ''})`,
        reference: r.code,
        status: r.status,
        amount: r.total,
        timestamp: r.createdAt.toISOString(),
        actionUrl: r.stayUrl,
        actionLabel: 'Open Stay Voucher',
      });

      for (const req of r.requests || []) {
        activities.push({
          id: `req-${req.id}`,
          kind: 'GUEST_REQUEST',
          title: `Guest Request · ${req.kind.replace(/_/g, ' ')}`,
          subtitle: req.note || `Request for booking ${r.code}`,
          reference: r.code,
          status: req.status,
          timestamp: req.createdAt.toISOString(),
          actionUrl: r.stayUrl,
          actionLabel: 'View Stay',
        });
      }
    }

    for (const doc of documents) {
      activities.push({
        id: `doc-${doc.id}`,
        kind: doc.kind === 'QUOTATION' ? 'QUOTATION' : 'DOCUMENT',
        title: `${doc.kind === 'RECEIPT' ? 'Official Receipt' : doc.kind === 'INVOICE' ? 'Tax Invoice' : doc.kind === 'QUOTATION' ? 'Event Quotation' : 'Refund Note'}`,
        subtitle: `Check Code: ${doc.checkCode}${doc.reservationCode ? ` · Stay ${doc.reservationCode}` : ''}`,
        reference: doc.number,
        status: doc.status,
        amount: doc.amount,
        timestamp: doc.issuedAt,
        actionUrl: doc.printUrl,
        actionLabel: 'View & Print',
      });
    }

    // POS Orders (Dining / Bar / Health Club)
    const posOr: Record<string, unknown>[] = [];
    if (reservationIds.length) posOr.push({ reservationId: { in: reservationIds } });
    if (cleanPhone && cleanPhone.length >= 6) {
      posOr.push({ customerPhone: { contains: cleanPhone.replace(/\D/g, '').slice(-8) } });
    }
    if (cleanName && cleanName.length >= 3 && cleanName.toLowerCase() !== 'guest') {
      posOr.push({ customerName: { contains: cleanName, mode: 'insensitive' } });
    }

    if (posOr.length) {
      const posOrders = await this.prisma.posOrder.findMany({
        where: { OR: posOr },
        include: { outlet: true, items: true },
        orderBy: { createdAt: 'desc' },
        take: 10,
      });
      for (const po of posOrders) {
        const itemsSummary = po.items.map((i) => `${i.quantity}× ${i.itemName}`).join(', ');
        activities.push({
          id: `pos-${po.id}`,
          kind: 'POS_ORDER',
          title: `${po.outlet.name} Order`,
          subtitle: itemsSummary || po.tableOrRoom || 'Highland Dining & Bar',
          reference: po.orderNumber,
          status: po.status,
          amount: `${Number(po.totalMinor).toLocaleString()} ${po.currency}`,
          timestamp: po.createdAt.toISOString(),
        });
      }
    }

    // Health Club Memberships & Access Logs
    const hcOr: Record<string, unknown>[] = [];
    if (cleanPhone && cleanPhone.length >= 6) {
      hcOr.push({ memberPhone: { contains: cleanPhone.replace(/\D/g, '').slice(-8) } });
    }
    if (cleanName && cleanName.length >= 3 && cleanName.toLowerCase() !== 'guest') {
      hcOr.push({ memberName: { contains: cleanName, mode: 'insensitive' } });
    }
    if (hcOr.length) {
      const memberships = await this.prisma.healthClubMembership.findMany({
        where: { OR: hcOr },
        orderBy: { createdAt: 'desc' },
        take: 5,
      });
      for (const m of memberships) {
        activities.push({
          id: `hc-${m.id}`,
          kind: 'HEALTH_CLUB',
          title: `Athletic Club · ${m.tier.replace(/_/g, ' ')} (${m.service.replace(/_/g, ' ')})`,
          subtitle: `Valid until ${m.endDate.toISOString().slice(0, 10)}`,
          reference: m.membershipNo,
          status: m.isActive ? 'ACTIVE' : 'EXPIRED',
          amount: `${Number(m.amountMinor).toLocaleString()} ${m.currency}`,
          timestamp: m.createdAt.toISOString(),
        });
      }
    }

    // Priority Waitlist & Inquiries
    if (contactIds.length) {
      const waitlists = await this.prisma.waitlistEntry.findMany({
        where: { contactId: { in: contactIds } },
        orderBy: { createdAt: 'desc' },
        take: 5,
      });
      for (const w of waitlists) {
        activities.push({
          id: `wl-${w.id}`,
          kind: 'WAITLIST',
          title: `Priority Waitlist Registration`,
          subtitle: w.note || 'First-stay priority claim',
          reference: w.reference,
          status: w.status,
          timestamp: w.createdAt.toISOString(),
        });
      }

      const convos = await this.prisma.conversation.findMany({
        where: { contactId: { in: contactIds } },
        orderBy: { createdAt: 'desc' },
        take: 5,
      });
      for (const c of convos) {
        activities.push({
          id: `cn-${c.id}`,
          kind: 'INQUIRY',
          title: c.subject || `Concierge Desk Inquiry (${c.intent})`,
          subtitle: `Channel: ${c.channel}`,
          reference: c.reference,
          status: c.status,
          timestamp: c.createdAt.toISOString(),
        });
      }
    }

    // Sort activities newest first
    activities.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    const isRealDbName = Boolean(primaryContact?.name && primaryContact.name.trim().toLowerCase() !== 'guest');
    const resolvedName = syncContact
      ? isRealUserName
        ? cleanName
        : isRealDbName
          ? primaryContact!.name
          : cleanName || 'Guest'
      : isRealUserName
        ? cleanName
        : isRealDbName
          ? primaryContact!.name
          : primaryContact?.name || cleanName || 'Guest';

    const isRealDbEmail = Boolean(primaryContact?.email && !primaryContact.email.toLowerCase().startsWith('guest@'));
    const resolvedEmail = syncContact
      ? isRealUserEmail
        ? cleanEmail
        : isRealDbEmail
          ? primaryContact!.email!
          : undefined
      : isRealUserEmail
        ? cleanEmail
        : isRealDbEmail
          ? primaryContact!.email!
          : undefined;

    const resolvedPhone = syncContact
      ? normPhone || cleanPhone || primaryContact?.phone || undefined
      : primaryContact?.phone || normPhone || cleanPhone || undefined;

    const enrichedIdentity: ConciergeGuestIdentityDTO = {
      name: resolvedName,
      phone: resolvedPhone,
      email: resolvedEmail,
      bookingCode: cleanCode || reservations[0]?.code || undefined,
      contactId: primaryContact?.id || identity.contactId,
      isVip: primaryContact?.isVip || reservations.length >= 2,
      isVerified: Boolean(primaryContact || reservations.length > 0 || documents.length > 0),
      identifiedAt: identity.identifiedAt || new Date().toISOString(),
    };

    return {
      identity: enrichedIdentity,
      summary: {
        reservationsCount: reservations.length,
        documentsCount: documents.length,
        activitiesCount: activities.length,
        activeStayCode: reservations.find((r) => ['CONFIRMED', 'IN_HOUSE', 'HELD'].includes(r.status))?.code,
      },
      reservations: reservations.map(({ id: _id, createdAt: _c, requests: _req, ...rest }) => rest),
      documents,
      recentActivities: activities.slice(0, 20),
    };
  }

  getToolDefinitions(): DeepSeekToolDefinition[] {
    return [
      {
        type: 'function',
        function: {
          name: 'check_room_availability',
          description:
            'Check real-time suite availability, capacity, and nightly rates for requested stay dates at Reberon Hotel (Kapchorwa, 1,900 m).',
          parameters: {
            type: 'object',
            properties: {
              arrival: { type: 'string', description: 'Check-in date in YYYY-MM-DD format.' },
              departure: { type: 'string', description: 'Check-out date in YYYY-MM-DD format.' },
              adults: { type: 'number', description: 'Number of adult guests (default: 2).' },
              children: { type: 'number', description: 'Number of children (default: 0).' },
              currency: { type: 'string', enum: ['UGX', 'USD'], description: 'Currency code (default: UGX).' },
            },
            required: ['arrival', 'departure'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'get_room_details',
          description:
            'Get detailed specifications, bed configuration, balcony aspect, and features for a specific room type (e.g. elgon-view-king, sipi-twin, coffee-terrace-family, summit-suite).',
          parameters: {
            type: 'object',
            properties: {
              slug: {
                type: 'string',
                description: 'The room slug, e.g. "elgon-view-king", "sipi-twin", "coffee-terrace-family", "summit-suite".',
              },
            },
            required: ['slug'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'calculate_quote',
          description:
            'Calculate exact stay costs, deposit requirement (30%), taxes, and cancellation terms for a selected room type and stay dates.',
          parameters: {
            type: 'object',
            properties: {
              roomSlug: { type: 'string', description: 'Room type slug, e.g. "elgon-view-king".' },
              arrival: { type: 'string', description: 'Check-in date YYYY-MM-DD.' },
              departure: { type: 'string', description: 'Check-out date YYYY-MM-DD.' },
              adults: { type: 'number', description: 'Number of adults.' },
              children: { type: 'number', description: 'Number of children (default: 0).' },
              currency: { type: 'string', enum: ['UGX', 'USD'], description: 'Currency code (default: UGX).' },
            },
            required: ['roomSlug', 'arrival', 'departure'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'create_booking_hold',
          description:
            'Place an instant 48-hour complimentary reservation hold in the Reberon PMS and generate an official stay voucher & payment link. Uses the active guest identity automatically if name/phone are already known.',
          parameters: {
            type: 'object',
            properties: {
              roomSlug: { type: 'string', description: 'Slug of the suite to book.' },
              arrival: { type: 'string', description: 'Check-in date YYYY-MM-DD.' },
              departure: { type: 'string', description: 'Check-out date YYYY-MM-DD.' },
              adults: { type: 'number', description: 'Number of adults (default: 2).' },
              children: { type: 'number', description: 'Number of children (default: 0).' },
              guestName: { type: 'string', description: 'Full name of the guest (optional if session identity is set).' },
              phone: { type: 'string', description: 'Contact phone number (WhatsApp preferred).' },
              email: { type: 'string', description: 'Contact email address.' },
              specialRequests: { type: 'string', description: 'Special requests, dietary preferences, or arrival notes.' },
            },
            required: ['roomSlug', 'arrival', 'departure'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'lookup_reservation',
          description:
            'Look up an existing reservation by booking code (e.g. RB-XXXXX), phone, email, or the active guest session identity to check live status, room assignment, balance, and printable receipts.',
          parameters: {
            type: 'object',
            properties: {
              code: { type: 'string', description: 'Reservation reference code, e.g. "RB-JKHD5".' },
              phone: { type: 'string', description: 'Guest phone number.' },
              email: { type: 'string', description: 'Guest email address.' },
              guestName: { type: 'string', description: 'Guest name.' },
            },
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'get_my_receipts_and_invoices',
          description:
            'Fetch all official Reberon Hotel receipts (RCT-...), tax invoices (INV-...), refund notes (RFD-...), and event quotations (QUO-...) for the guest, with direct printable A4/80mm links and verification codes.',
          parameters: {
            type: 'object',
            properties: {
              code: { type: 'string', description: 'Optional booking code (RB-...) or document number (RCT-..., INV-..., QUO-...).' },
              phone: { type: 'string', description: 'Optional guest phone number.' },
              email: { type: 'string', description: 'Optional guest email.' },
              guestName: { type: 'string', description: 'Optional guest name.' },
            },
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'get_my_recent_activity',
          description:
            'Check the guest\'s most recent actions, bookings, POS restaurant orders, athletic gym visits, guest requests, waitlist entries, and documents across the entire Reberon Hotel system.',
          parameters: {
            type: 'object',
            properties: {
              guestName: { type: 'string', description: 'Guest name (optional if already identified).' },
              phone: { type: 'string', description: 'Guest phone number.' },
              email: { type: 'string', description: 'Guest email.' },
              bookingCode: { type: 'string', description: 'Optional booking or document code.' },
            },
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'verify_hotel_document',
          description:
            'Verify the authenticity of any official Reberon Hotel receipt (RCT-...), invoice (INV-...), refund note (RFD-...), or quotation (QUO-...) using its document number and optional check code.',
          parameters: {
            type: 'object',
            properties: {
              number: { type: 'string', description: 'Document number, e.g. "RCT-2026-00001", "INV-2026-00001", or "QUO-2026-00001".' },
              checkCode: { type: 'string', description: '8-character check code printed on the document, e.g. "AB12-CD34" (optional if looking up from system).' },
            },
            required: ['number'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'submit_guest_request',
          description:
            'Submit a live in-stay or pre-arrival request (Late Checkout, Mountain Guide, Airport Transfer, Extra Bed, Room Service, Add Night, or Special Request) directly into the PMS for a reservation.',
          parameters: {
            type: 'object',
            properties: {
              reservationCode: { type: 'string', description: 'Reservation code (e.g. RB-XXXXX). Optional if guest has an active reservation in session.' },
              kind: {
                type: 'string',
                enum: ['LATE_CHECKOUT', 'GUIDE', 'TRANSFER', 'EXTRA', 'ADD_NIGHT', 'OTHER'],
                description: 'Category of request.',
              },
              note: { type: 'string', description: 'Specific details of what the guest is requesting (e.g. "Late check-out at 14:00", "Private Sipi Falls ranger at 08:00").' },
            },
            required: ['kind', 'note'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'claim_priority_waitlist',
          description:
            'Register a guest for the priority first-stay list or for dates when suites are sold out.',
          parameters: {
            type: 'object',
            properties: {
              guestName: { type: 'string', description: 'Guest full name.' },
              phone: { type: 'string', description: 'Guest phone or WhatsApp.' },
              email: { type: 'string', description: 'Guest email address (optional).' },
              preferredDates: { type: 'string', description: 'Desired stay dates or month.' },
              roomTypePreference: { type: 'string', description: 'Preferred suite, e.g. "Elgon View King".' },
              notes: { type: 'string', description: 'Any special notes or party size.' },
            },
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'get_hotel_facilities',
          description:
            'Get live details on Reberon Hotel facilities: High-Altitude Athletic Gym & Health Club (steam/sauna/memberships), Highland Restaurant, The Hall (conferences/events), and Solar/Water systems.',
          parameters: {
            type: 'object',
            properties: {
              category: {
                type: 'string',
                enum: ['gym', 'dining', 'hall', 'wellness', 'all'],
                description: 'Facility category to query.',
              },
            },
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'get_local_activities',
          description:
            'Get trail guides and arrangements for Sipi Falls hikes, Mount Elgon trekking, Arabica coffee roasting tours, and championship altitude running routes.',
          parameters: {
            type: 'object',
            properties: {
              activity: {
                type: 'string',
                enum: ['sipi_falls', 'mount_elgon', 'coffee_tour', 'trail_running', 'all'],
                description: 'The highland activity to look up.',
              },
            },
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'get_weather_and_directions',
          description:
            'Get Mount Elgon altitude weather (1,900 m ASL) and paved tarmac driving directions from Kampala/Entebbe.',
          parameters: {
            type: 'object',
            properties: {},
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'request_airport_transfer',
          description:
            'Arrange private 4x4 sanctuary transfers between Entebbe International Airport (EBB), Kampala, or Mbale and Reberon Hotel Kapchorwa.',
          parameters: {
            type: 'object',
            properties: {
              pickupLocation: { type: 'string', description: 'Pickup location (e.g. "Entebbe Airport (EBB)", "Kampala", "Mbale").' },
              date: { type: 'string', description: 'Desired transfer date in YYYY-MM-DD format.' },
              passengers: { type: 'number', description: 'Number of passengers (1-6).' },
              guestName: { type: 'string', description: 'Guest name.' },
              phone: { type: 'string', description: 'Guest WhatsApp or mobile phone.' },
              flightNumber: { type: 'string', description: 'Flight number if arriving at Entebbe Airport.' },
            },
            required: ['pickupLocation'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'get_dining_and_dietary',
          description:
            'Get live restaurant POS menu items, Mount Elgon river trout specials, highland breakfast, Arabica coffee ceremony, and dietary accommodations.',
          parameters: {
            type: 'object',
            properties: {
              interest: {
                type: 'string',
                enum: ['trout', 'breakfast', 'coffee', 'dietary', 'menu', 'all'],
                description: 'Dining topic of interest.',
              },
            },
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'get_weather_and_packing_guide',
          description:
            'Get Mount Elgon altitude packing checklist, microclimate temperatures (1,900 m ASL), and road highway conditions.',
          parameters: {
            type: 'object',
            properties: {
              season: { type: 'string', description: 'Travel month or season.' },
            },
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'human_handover',
          description:
            'Connect the guest directly with Denis Mayamba & Front Desk on WhatsApp (+256 760 512 691) and log a priority desk ticket.',
          parameters: {
            type: 'object',
            properties: {
              guestName: { type: 'string', description: 'Guest name.' },
              phone: { type: 'string', description: 'Guest phone.' },
              summary: { type: 'string', description: 'Brief summary of what the guest needs.' },
            },
            required: ['summary'],
          },
        },
      },
    ];
  }

  async executeTool(
    toolCall: { id: string; name: string; args: Record<string, unknown> },
    identity?: ConciergeGuestIdentityDTO,
  ): Promise<ToolExecutionResult> {
    const mergedArgs: Record<string, unknown> = {
      ...toolCall.args,
      guestName: toolCall.args.guestName || identity?.name,
      phone: toolCall.args.phone || identity?.phone,
      email: toolCall.args.email || identity?.email,
      bookingCode: toolCall.args.bookingCode || toolCall.args.code || identity?.bookingCode,
    };

    try {
      switch (toolCall.name) {
        case 'check_room_availability':
          return await this.handleCheckAvailability(toolCall.id, mergedArgs);
        case 'get_room_details':
          return await this.handleGetRoomDetails(toolCall.id, mergedArgs);
        case 'calculate_quote':
          return await this.handleCalculateQuote(toolCall.id, mergedArgs);
        case 'create_booking_hold':
          return await this.handleCreateBookingHold(toolCall.id, mergedArgs);
        case 'lookup_reservation':
          return await this.handleLookupReservation(toolCall.id, mergedArgs, identity);
        case 'get_my_receipts_and_invoices':
          return await this.handleGetReceiptsAndInvoices(toolCall.id, mergedArgs, identity);
        case 'get_my_recent_activity':
          return await this.handleGetRecentActivity(toolCall.id, mergedArgs, identity);
        case 'verify_hotel_document':
          return await this.handleVerifyDocument(toolCall.id, mergedArgs);
        case 'submit_guest_request':
          return await this.handleSubmitGuestRequest(toolCall.id, mergedArgs, identity);
        case 'request_airport_transfer':
          return await this.handleRequestTransfer(toolCall.id, mergedArgs);
        case 'get_dining_and_dietary':
          return await this.handleGetDining(toolCall.id, mergedArgs);
        case 'get_weather_and_packing_guide':
          return await this.handleGetWeatherAndPacking(toolCall.id, mergedArgs);
        case 'claim_priority_waitlist':
          return await this.handleClaimWaitlist(toolCall.id, mergedArgs);
        case 'get_hotel_facilities':
          return await this.handleGetFacilities(toolCall.id, mergedArgs);
        case 'get_local_activities':
          return await this.handleGetActivities(toolCall.id, mergedArgs);
        case 'get_weather_and_directions':
          return await this.handleGetWeatherAndDirections(toolCall.id);
        case 'human_handover':
          return await this.handleHumanHandover(toolCall.id, mergedArgs);
        default:
          return {
            toolCallId: toolCall.id,
            name: toolCall.name,
            output: JSON.stringify({ error: `Tool ${toolCall.name} not recognised` }),
          };
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.log.error(`Error executing tool ${toolCall.name}: ${msg}`);
      return {
        toolCallId: toolCall.id,
        name: toolCall.name,
        output: JSON.stringify({ error: msg }),
      };
    }
  }

  /* ── 1. Check Room Availability ── */
  private async handleCheckAvailability(id: string, args: Record<string, unknown>): Promise<ToolExecutionResult> {
    const arrival = String(args.arrival || '');
    const departure = String(args.departure || '');
    const adults = Number(args.adults) || 2;
    const children = Number(args.children) || 0;
    const currency = (args.currency === 'USD' ? 'USD' : 'UGX') as 'UGX' | 'USD';

    if (!arrival || !departure) {
      return {
        toolCallId: id,
        name: 'check_room_availability',
        output: JSON.stringify({ error: 'Please provide arrival and departure dates in YYYY-MM-DD format.' }),
      };
    }

    const roomTypes = await this.prisma.roomType.findMany({
      where: { status: 'PUBLISHED', deletedAt: null },
      include: { hero: true },
      orderBy: { order: 'asc' },
    });

    const results = roomTypes.map((rt) => {
      const fromUgx = rt.fromPriceUgx ? `${Number(rt.fromPriceUgx).toLocaleString()} UGX` : 'Contact desk';
      const fromUsd = rt.fromPriceUsd ? `$${Number(rt.fromPriceUsd).toLocaleString()}` : '$120';
      return {
        name: tr(rt.name),
        slug: rt.slug,
        sleepsAdults: rt.sleepsAdults,
        sleepsChildren: rt.sleepsChildren,
        startingRate: currency === 'USD' ? fromUsd : fromUgx,
        rateBoth: `${fromUgx} / ${fromUsd}`,
        tagline: tr(rt.tagline),
        viewAspect: tr(rt.view, 'Panoramic Mount Elgon & Valley View'),
        status: 'Available for instant 48h hold',
      };
    });

    const first = roomTypes[0];
    const card: ConciergeCardDTO | undefined = first
      ? {
          type: 'room',
          slug: first.slug,
          name: tr(first.name),
          price: currency === 'USD' ? `$${first.fromPriceUsd || 120}` : `${Number(first.fromPriceUgx || 450000).toLocaleString()} UGX`,
          currency,
          imageUrl: getMediaUrl(first.hero?.id),
          galleryUrls: (first.galleryIds || []).slice(0, 3).map((gid: string) => getMediaUrl(gid)).filter(Boolean) as string[],
          viewAspect: tr(first.view, 'Mount Elgon Ridge View'),
          actionUrl: `/rooms/${first.slug}`,
          actionLabel: `Inspect ${tr(first.name)}`,
          secondaryActionUrl: `/book?room=${first.slug}&arrival=${arrival}&departure=${departure}`,
          secondaryActionLabel: 'Instant 48h Hold',
        }
      : undefined;

    return {
      toolCallId: id,
      name: 'check_room_availability',
      output: JSON.stringify({
        arrival,
        departure,
        adults,
        children,
        availableSuites: results,
        bookingNote: 'All suites include highland breakfast & Arabica coffee. Complimentary 48-hour holds available.',
      }),
      card,
    };
  }

  /* ── 2. Get Room Details ── */
  private async handleGetRoomDetails(id: string, args: Record<string, unknown>): Promise<ToolExecutionResult> {
    const slug = String(args.slug || '').trim().toLowerCase();
    let rt = await this.prisma.roomType.findFirst({
      where: {
        ...roomTypeWhere(slug),
        status: 'PUBLISHED',
        deletedAt: null,
      },
      include: {
        hero: true,
        amenities: { include: { amenity: true }, orderBy: { order: 'asc' } },
      },
    });

    if (!rt) {
      const allRooms = await this.prisma.roomType.findMany({
        where: { status: 'PUBLISHED', deletedAt: null },
        include: {
          hero: true,
          amenities: { include: { amenity: true }, orderBy: { order: 'asc' } },
        },
      });
      rt = allRooms.find((r) => r.slug.toLowerCase().includes(slug) || tr(r.name).toLowerCase().includes(slug)) || null;
    }

    if (!rt) {
      return {
        toolCallId: id,
        name: 'get_room_details',
        output: JSON.stringify({ error: `Room type "${slug}" was not found.` }),
      };
    }

    const amenitiesList = rt.amenities.map((a) => tr(a.amenity.name));
    const card: ConciergeCardDTO = {
      type: 'room',
      slug: rt.slug,
      name: tr(rt.name),
      price: rt.fromPriceUgx ? `${Number(rt.fromPriceUgx).toLocaleString()} UGX` : '$120',
      currency: 'UGX',
      imageUrl: getMediaUrl(rt.hero?.id),
      galleryUrls: (rt.galleryIds || []).slice(0, 3).map((gid: string) => getMediaUrl(gid)).filter(Boolean) as string[],
      viewAspect: tr(rt.view, 'Mount Elgon Ridge View'),
      bedSetup: `${rt.sleepsAdults} adults, ${rt.sleepsChildren} children`,
      actionUrl: `/book?room=${rt.slug}`,
      actionLabel: `Book ${tr(rt.name)}`,
      secondaryActionUrl: `/rooms/${rt.slug}`,
      secondaryActionLabel: 'Floor Plan & Photos',
    };

    return {
      toolCallId: id,
      name: 'get_room_details',
      output: JSON.stringify({
        name: tr(rt.name),
        slug: rt.slug,
        tagline: tr(rt.tagline),
        description: tr(rt.description),
        sleepsAdults: rt.sleepsAdults,
        sleepsChildren: rt.sleepsChildren,
        viewAspect: tr(rt.view, 'Mount Elgon Ridge View'),
        amenities: amenitiesList,
        rates: {
          ugx: rt.fromPriceUgx ? Number(rt.fromPriceUgx).toLocaleString() : null,
          usd: rt.fromPriceUsd ? Number(rt.fromPriceUsd).toLocaleString() : null,
        },
      }),
      card,
    };
  }

  /* ── 3. Calculate Quote ── */
  private async handleCalculateQuote(id: string, args: Record<string, unknown>): Promise<ToolExecutionResult> {
    const slug = String(args.roomSlug || '').trim();
    const arrival = String(args.arrival || '').trim();
    const departure = String(args.departure || '').trim();
    const currency = (args.currency === 'USD' ? 'USD' : 'UGX') as 'UGX' | 'USD';

    let rt = await this.prisma.roomType.findFirst({
      where: {
        ...roomTypeWhere(slug),
        status: 'PUBLISHED',
        deletedAt: null,
      },
    });

    if (!rt) {
      const allRooms = await this.prisma.roomType.findMany({ where: { status: 'PUBLISHED', deletedAt: null } });
      rt =
        allRooms.find(
          (r) => r.slug.toLowerCase().includes(slug.toLowerCase()) || tr(r.name).toLowerCase().includes(slug.toLowerCase()),
        ) || null;
    }

    const d1 = new Date(`${arrival}T00:00:00Z`);
    const d2 = new Date(`${departure}T00:00:00Z`);
    const nights = Math.max(1, Math.round((d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24)));

    const baseUgx = Number(rt?.fromPriceUgx || 450_000);
    const baseUsd = Number(rt?.fromPriceUsd || 120);

    const nightlyMinor = currency === 'USD' ? baseUsd : baseUgx;
    const total = nightlyMinor * nights;
    const deposit = Math.round(total * 0.3);

    const roomName = rt ? tr(rt.name) : 'Highland Suite';
    const totalStr = currency === 'USD' ? `$${total.toLocaleString()}` : `${total.toLocaleString()} UGX`;
    const depositStr = currency === 'USD' ? `$${deposit.toLocaleString()}` : `${deposit.toLocaleString()} UGX`;

    const card: ConciergeCardDTO = {
      type: 'quote',
      roomName,
      arrival,
      departure,
      nights,
      total: totalStr,
      deposit: depositStr,
      currency,
      inclusions: [
        'Farm-fresh Mount Elgon breakfast & Arabica coffee',
        '24/7 solar hot water & high-altitude tea station',
        'High-altitude athletic gym & pine running trails',
        'All regional taxes included — zero hidden charges',
      ],
      actionUrl: `/book?room=${rt?.slug || ''}&arrival=${arrival}&departure=${departure}`,
      actionLabel: 'Hold Suite at This Rate',
    };

    return {
      toolCallId: id,
      name: 'calculate_quote',
      output: JSON.stringify({
        roomName,
        nights,
        currency,
        nightlyRate: currency === 'USD' ? `$${nightlyMinor}` : `${nightlyMinor.toLocaleString()} UGX`,
        total: totalStr,
        depositRequired: depositStr,
        inclusions: card.inclusions,
      }),
      card,
    };
  }

  /* ── 4. Create Booking Hold ── */
  private async handleCreateBookingHold(id: string, args: Record<string, unknown>): Promise<ToolExecutionResult> {
    const slug = String(args.roomSlug || '').trim();
    const arrivalStr = String(args.arrival || '').trim();
    const departureStr = String(args.departure || '').trim();
    const adults = Math.max(1, Number(args.adults) || 2);
    const children = Math.max(0, Number(args.children) || 0);
    const guestName = String(args.guestName || '').trim() || 'Valued Guest';
    const phone = String(args.phone || '').trim();
    const email = String(args.email || '').trim().toLowerCase();
    const specialRequests = String(args.specialRequests || '');
    const currency = (args.currency === 'USD' ? 'USD' : 'UGX') as 'UGX' | 'USD';

    let rt = await this.prisma.roomType.findFirst({
      where: {
        ...roomTypeWhere(slug),
        status: 'PUBLISHED',
        deletedAt: null,
      },
    });

    if (!rt) {
      const allRooms = await this.prisma.roomType.findMany({ where: { status: 'PUBLISHED', deletedAt: null } });
      rt =
        allRooms.find(
          (r) => r.slug.toLowerCase().includes(slug.toLowerCase()) || tr(r.name).toLowerCase().includes(slug.toLowerCase()),
        ) || null;
    }

    if (!rt) {
      return {
        toolCallId: id,
        name: 'create_booking_hold',
        output: JSON.stringify({ error: `Selected suite "${slug}" not found in hotel catalog.` }),
      };
    }

    let ratePlan = await this.prisma.ratePlan.findFirst({
      where: { isActive: true },
      orderBy: { order: 'asc' },
    });
    if (!ratePlan) {
      ratePlan = await this.prisma.ratePlan.findFirst();
    }
    if (!ratePlan) {
      return {
        toolCallId: id,
        name: 'create_booking_hold',
        output: JSON.stringify({ error: 'No active rate plan found in system.' }),
      };
    }

    const guestEmail =
      email && email.includes('@')
        ? email
        : `${guestName.toLowerCase().replace(/[^a-z0-9]/g, '') || 'guest'}@guest.reberonhotel.com`;
    const guestPhone = phone || '+256760512691';

    try {
      const bookingResult = await this.booking.start({
        arrival: arrivalStr,
        departure: departureStr,
        adults,
        children,
        currency,
        roomTypeId: rt.id,
        ratePlanId: ratePlan.id,
        rooms: 1,
        extras: [],
        payInFull: false,
        payAtPremises: true,
        guest: {
          name: guestName,
          phone: guestPhone,
          email: guestEmail,
        },
        notes: specialRequests
          ? `Sipi Concierge AI Hold: ${specialRequests}`
          : 'Booked via Sipi Concierge AI (48-hr complimentary hold / Pay at premises)',
        consent: true,
      });

      const token = bookingResult.accessToken || this.booking.accessToken(bookingResult.code);
      const webBase = env.WEB_URL || 'https://reberonhotel.com';
      const stayUrl = `${webBase}/stay?code=${bookingResult.code}&t=${encodeURIComponent(token)}`;
      const paymentUrl = `${webBase}/book/return?code=${bookingResult.code}&t=${encodeURIComponent(token)}`;

      try {
        const contact = await this.prisma.contact.findFirst({
          where: { OR: [{ phone: guestPhone }, ...(email ? [{ email }] : [])] },
        });
        if (contact) {
          await this.prisma.conversation.create({
            data: {
              reference: referenceCode('CN'),
              contactId: contact.id,
              channel: 'WEB_FORM',
              intent: 'STAY',
              status: 'NEW',
              subject: `Concierge Agentic Hold: ${guestName} (${bookingResult.code})`,
              context: {
                source: 'Sipi Concierge AI',
                reservationCode: bookingResult.code,
                suite: tr(rt.name),
                arrival: arrivalStr,
                departure: departureStr,
                phone: guestPhone,
                email: email || null,
                notes: specialRequests || null,
              },
            },
          });
        }
      } catch (err) {
        this.log.warn(`Could not create inbox conversation for concierge booking: ${err}`);
      }

      try {
        const staffEmails =
          ((await this.prisma.setting.findUnique({ where: { key: 'notifications.staffEmails' } }))?.value as
            | string[]
            | undefined) ?? [];
        for (const staffTo of staffEmails) {
          await this.notifications.email({
            to: staffTo,
            subject: `🤖 Sipi Concierge: Reservation ${bookingResult.code} (${guestName})`,
            heading: `New Concierge Reservation: ${guestName}`,
            paragraphs: [
              `Sipi Concierge completed a confirmed reservation hold for **${guestName}**.`,
              `**Suite**: ${tr(rt.name)} | **Dates**: ${arrivalStr} to ${departureStr} (${adults} adults${children ? `, ${children} children` : ''})`,
              `**Contact**: ${guestPhone} ${email ? `| ${email}` : ''}`,
              specialRequests ? `**Special Requests**: ${specialRequests}` : 'No special requests specified.',
            ],
            facts: [
              ['Reservation Code', bookingResult.code],
              ['Status', 'CONFIRMED (Pay at premises / 48h hold)'],
              ['Suite', tr(rt.name)],
            ],
            action: {
              label: 'View in PMS Admin',
              url: `${env.ADMIN_URL || 'https://reberonhotel.com'}/reservations/${bookingResult.code}`,
            },
          });
        }
      } catch (err) {
        this.log.warn(`Could not send staff notification email: ${err}`);
      }

      const resRecord = await this.prisma.reservation.findUnique({ where: { code: bookingResult.code } });
      const totalStr = resRecord
        ? `${Number(resRecord.totalMinor).toLocaleString()} ${resRecord.currency}`
        : `${currency === 'USD' ? '$' : ''}Confirmed`;

      const card: ConciergeCardDTO = {
        type: 'reservation',
        code: bookingResult.code,
        status: 'CONFIRMED · 48-HR HOLD',
        roomName: tr(rt.name),
        arrival: arrivalStr,
        departure: departureStr,
        total: totalStr,
        currency,
        stayUrl,
        receiptUrl: stayUrl,
        paymentUrl,
        actionUrl: stayUrl,
        actionLabel: 'View & Print Stay Voucher',
        secondaryActionUrl: paymentUrl,
        secondaryActionLabel: 'Pay Deposit Online',
      };

      return {
        toolCallId: id,
        name: 'create_booking_hold',
        output: JSON.stringify({
          success: true,
          reservationCode: bookingResult.code,
          guestName,
          roomName: tr(rt.name),
          stayDates: `${arrivalStr} to ${departureStr}`,
          status: 'Confirmed & held in Reberon PMS',
          stayUrl,
          paymentUrl,
        }),
        card,
      };
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      this.log.error(`Failed to execute booking.start in concierge: ${errMsg}`);
      return {
        toolCallId: id,
        name: 'create_booking_hold',
        output: JSON.stringify({
          error: errMsg,
          guestName,
          room: tr(rt.name),
        }),
      };
    }
  }

  /* ── 5. Lookup Reservation (By Code, Phone, Email, or Guest Identity) ── */
  private async handleLookupReservation(
    id: string,
    args: Record<string, unknown>,
    identity?: ConciergeGuestIdentityDTO,
  ): Promise<ToolExecutionResult> {
    const rawCode = String(args.code || args.bookingCode || '').trim().toUpperCase();
    const phone = String(args.phone || identity?.phone || '').trim();
    const email = String(args.email || identity?.email || '').trim().toLowerCase();
    const guestName = String(args.guestName || identity?.name || '').trim();

    let reservation = null;
    if (rawCode && rawCode.startsWith('RB-')) {
      reservation = await this.prisma.reservation.findFirst({
        where: { code: rawCode },
        include: { contact: true, rooms: true, ratePlan: true },
      });
    }
    if (!reservation && phone && phone.length >= 6) {
      const digits = phone.replace(/\D/g, '').slice(-8);
      reservation = await this.prisma.reservation.findFirst({
        where: { contact: { phone: { contains: digits } } },
        include: { contact: true, rooms: true, ratePlan: true },
        orderBy: { createdAt: 'desc' },
      });
    }
    if (!reservation && email && email.includes('@')) {
      reservation = await this.prisma.reservation.findFirst({
        where: { contact: { email: { equals: email, mode: 'insensitive' } } },
        include: { contact: true, rooms: true, ratePlan: true },
        orderBy: { createdAt: 'desc' },
      });
    }
    if (!reservation && guestName && guestName.length >= 3 && guestName.toLowerCase() !== 'guest') {
      reservation = await this.prisma.reservation.findFirst({
        where: { contact: { name: { contains: guestName, mode: 'insensitive' } } },
        include: { contact: true, rooms: true, ratePlan: true },
        orderBy: { createdAt: 'desc' },
      });
    }

    if (!reservation) {
      return {
        toolCallId: id,
        name: 'lookup_reservation',
        output: JSON.stringify({
          found: false,
          message: `No reservation found matching "${rawCode || phone || guestName}". Provide a booking code (RB-XXXXX) or phone number.`,
        }),
      };
    }

    const r = reservation;
    const token = this.booking.accessToken(r.code);
    const webBase = env.WEB_URL || 'https://reberonhotel.com';
    const stayUrl = `${webBase}/stay?code=${r.code}&t=${encodeURIComponent(token)}`;
    const balanceMinor = r.totalMinor - r.paidMinor;
    const paymentUrl =
      balanceMinor > 0n ? `${webBase}/book/return?code=${r.code}&t=${encodeURIComponent(token)}` : undefined;

    const firstRoom = r.rooms[0];
    let roomName = 'Mount Elgon Suite';
    if (firstRoom) {
      const rt = await this.prisma.roomType.findUnique({ where: { id: firstRoom.roomTypeId } });
      if (rt) roomName = tr(rt.name);
    }

    const nights = Math.max(1, Math.round((r.departure.getTime() - r.arrival.getTime()) / 86_400_000));
    const arrivalStr = r.arrival.toISOString().slice(0, 10);
    const departureStr = r.departure.toISOString().slice(0, 10);

    // Also fetch any official IssuedDocuments for this reservation
    const dbDocs = await this.prisma.issuedDocument.findMany({
      where: { reservationId: r.id, voidedAt: null },
      orderBy: { issuedAt: 'desc' },
    });

    const attachedDocs: ConciergeDocumentItemDTO[] = dbDocs.map((d) => {
      const check = this.documents.checkCode(d.number);
      return {
        id: d.id,
        kind: d.kind as 'RECEIPT' | 'INVOICE' | 'REFUND',
        number: d.number,
        amount: `${Number(d.amountMinor).toLocaleString()} ${d.currency}`,
        currency: d.currency,
        issuedAt: d.issuedAt.toISOString(),
        checkCode: check,
        reservationCode: r.code,
        status: 'VALID',
        printUrl: this.documents.publicUrl(d, r.code),
        verifyUrl: `${webBase}/verify?number=${encodeURIComponent(d.number)}&check=${encodeURIComponent(check)}`,
      };
    });

    const resolvedGuestName =
      r.contact.name && r.contact.name.trim().toLowerCase() !== 'guest'
        ? r.contact.name
        : guestName && guestName.toLowerCase() !== 'guest'
          ? guestName
          : r.contact.name || 'Guest';

    const card: ConciergeCardDTO = {
      type: 'lookup',
      code: r.code,
      status: r.status,
      guestName: resolvedGuestName,
      roomName,
      arrival: arrivalStr,
      departure: departureStr,
      nights,
      total: `${Number(r.totalMinor).toLocaleString()} ${r.currency}`,
      paid: `${Number(r.paidMinor).toLocaleString()} ${r.currency}`,
      balance: `${Number(balanceMinor).toLocaleString()} ${r.currency}`,
      currency: r.currency,
      stayUrl,
      receiptUrl: attachedDocs[0]?.printUrl || stayUrl,
      paymentUrl,
      documents: attachedDocs,
      actionUrl: stayUrl,
      actionLabel: 'Open Stay Voucher & Receipts',
      secondaryActionUrl: paymentUrl,
      secondaryActionLabel: balanceMinor > 0n ? 'Pay Balance Online' : undefined,
    };

    return {
      toolCallId: id,
      name: 'lookup_reservation',
      output: JSON.stringify({
        found: true,
        code: r.code,
        status: r.status,
        guestName: resolvedGuestName,
        room: roomName,
        dates: `${arrivalStr} to ${departureStr} (${nights} nights)`,
        total: card.total,
        paid: card.paid,
        balanceDue: card.balance,
        documentsIssued: attachedDocs.map((d) => ({ number: d.number, kind: d.kind, amount: d.amount, checkCode: d.checkCode })),
        stayUrl,
      }),
      card,
    };
  }

  /* ── 6. Fetch All Guest Receipts, Invoices, Refund Notes & Quotations ── */
  private async handleGetReceiptsAndInvoices(
    id: string,
    args: Record<string, unknown>,
    identity?: ConciergeGuestIdentityDTO,
  ): Promise<ToolExecutionResult> {
    const dossier = await this.buildGuestDossier({
      name: String(args.guestName || identity?.name || 'Guest'),
      phone: String(args.phone || identity?.phone || ''),
      email: String(args.email || identity?.email || ''),
      bookingCode: String(args.code || args.bookingCode || identity?.bookingCode || ''),
    });

    const card: ConciergeCardDTO = {
      type: 'documents',
      guestName: dossier.identity.name,
      documents: dossier.documents,
      actionUrl: dossier.reservations[0]?.stayUrl || '/verify',
      actionLabel: dossier.reservations[0] ? 'Open Full Stay Portal' : 'Verify a Document',
    };

    return {
      toolCallId: id,
      name: 'get_my_receipts_and_invoices',
      output: JSON.stringify({
        guestName: dossier.identity.name,
        documentsFound: dossier.documents.length,
        documents: dossier.documents.map((d) => ({
          kind: d.kind,
          number: d.number,
          amount: d.amount,
          issuedAt: d.issuedAt.slice(0, 10),
          checkCode: d.checkCode,
          reservationCode: d.reservationCode,
          status: d.status,
        })),
        reservationsFound: dossier.reservations.map((r) => ({
          code: r.code,
          status: r.status,
          roomName: r.roomName,
          total: r.total,
          paid: r.paid,
          balance: r.balance,
        })),
      }),
      card,
    };
  }

  /* ── 7. Fetch Guest's Recent Actions & Activities Across Reberon Hotel ── */
  private async handleGetRecentActivity(
    id: string,
    args: Record<string, unknown>,
    identity?: ConciergeGuestIdentityDTO,
  ): Promise<ToolExecutionResult> {
    const dossier = await this.buildGuestDossier({
      name: String(args.guestName || identity?.name || 'Guest'),
      phone: String(args.phone || identity?.phone || ''),
      email: String(args.email || identity?.email || ''),
      bookingCode: String(args.bookingCode || args.code || identity?.bookingCode || ''),
    });

    const card: ConciergeCardDTO = {
      type: 'activity_log',
      guestName: dossier.identity.name,
      summary: {
        reservationsCount: dossier.summary.reservationsCount,
        documentsCount: dossier.summary.documentsCount,
        activitiesCount: dossier.summary.activitiesCount,
      },
      activities: dossier.recentActivities.slice(0, 8),
      documents: dossier.documents.slice(0, 5),
    };

    return {
      toolCallId: id,
      name: 'get_my_recent_activity',
      output: JSON.stringify({
        guestName: dossier.identity.name,
        isVerifiedGuest: dossier.identity.isVerified,
        summary: dossier.summary,
        recentActivities: dossier.recentActivities.slice(0, 10),
        documents: dossier.documents.slice(0, 5),
      }),
      card,
    };
  }

  /* ── 8. Verify Any Official Hotel Document (Receipt, Invoice, Quotation) ── */
  private async handleVerifyDocument(id: string, args: Record<string, unknown>): Promise<ToolExecutionResult> {
    const number = String(args.number || '').trim().toUpperCase();
    let checkCode = String(args.checkCode || '').trim().toUpperCase();
    const webBase = env.WEB_URL || 'https://reberonhotel.com';

    if (!number) {
      return {
        toolCallId: id,
        name: 'verify_hotel_document',
        output: JSON.stringify({ error: 'Please provide a document number (e.g. RCT-2026-00001 or QUO-2026-00001).' }),
      };
    }

    // If user didn't provide checkCode, look up the document in DB to verify its existence
    if (!checkCode) {
      if (number.startsWith('QUO-')) {
        const q = await this.prisma.quotation.findUnique({ where: { number } });
        if (q) checkCode = q.checkCode;
      } else {
        const d = await this.prisma.issuedDocument.findUnique({ where: { number } });
        if (d) checkCode = this.documents.checkCode(d.number);
      }
    }

    const res = checkCode ? await this.documents.verify(number, checkCode) : { valid: false as const };

    const card: ConciergeCardDTO = res.valid
      ? {
          type: 'document_verify',
          valid: true,
          kind: res.kind,
          number: res.number,
          checkCode,
          amount: `${Number(res.amountMinor).toLocaleString()} ${res.currency}`,
          issuedAt: res.issuedAt.slice(0, 10),
          voided: res.voided,
          verifyUrl: `${webBase}/verify?number=${encodeURIComponent(res.number)}&check=${encodeURIComponent(checkCode)}`,
        }
      : {
          type: 'document_verify',
          valid: false,
          number,
          checkCode: checkCode || undefined,
          verifyUrl: `${webBase}/verify`,
        };

    return {
      toolCallId: id,
      name: 'verify_hotel_document',
      output: JSON.stringify(card),
      card,
    };
  }

  /* ── 9. Submit Live In-Stay / Pre-Arrival Guest Request ── */
  private async handleSubmitGuestRequest(
    id: string,
    args: Record<string, unknown>,
    identity?: ConciergeGuestIdentityDTO,
  ): Promise<ToolExecutionResult> {
    const rawCode = String(args.reservationCode || args.bookingCode || identity?.bookingCode || '').trim().toUpperCase();
    const kindRaw = String(args.kind || 'OTHER').toUpperCase();
    const validKinds: GuestRequestKind[] = ['EXTRA', 'LATE_CHECKOUT', 'GUIDE', 'TRANSFER', 'ADD_NIGHT', 'OTHER'];
    const kind: GuestRequestKind = validKinds.includes(kindRaw as GuestRequestKind)
      ? (kindRaw as GuestRequestKind)
      : 'OTHER';
    const note = String(args.note || 'Guest service request via Sipi Concierge').trim();

    let reservation = null;
    if (rawCode && rawCode.startsWith('RB-')) {
      reservation = await this.prisma.reservation.findUnique({
        where: { code: rawCode },
        include: { contact: true },
      });
    }
    if (!reservation && identity?.phone) {
      const digits = identity.phone.replace(/\D/g, '').slice(-8);
      reservation = await this.prisma.reservation.findFirst({
        where: { contact: { phone: { contains: digits } } },
        include: { contact: true },
        orderBy: { createdAt: 'desc' },
      });
    }
    if (!reservation && identity?.name && identity.name.toLowerCase() !== 'guest') {
      reservation = await this.prisma.reservation.findFirst({
        where: { contact: { name: { contains: identity.name, mode: 'insensitive' } } },
        include: { contact: true },
        orderBy: { createdAt: 'desc' },
      });
    }

    if (!reservation) {
      return {
        toolCallId: id,
        name: 'submit_guest_request',
        output: JSON.stringify({
          success: false,
          message: 'Could not find an active reservation to attach this request to. Please provide your booking code (RB-XXXXX) or place a reservation hold first.',
        }),
      };
    }

    const created = await this.prisma.guestRequest.create({
      data: {
        reservationId: reservation.id,
        kind,
        note: `[Sipi Concierge] ${note}`,
        status: 'NEW',
      },
    });

    const token = this.booking.accessToken(reservation.code);
    const webBase = env.WEB_URL || 'https://reberonhotel.com';
    const stayUrl = `${webBase}/stay?code=${reservation.code}&t=${encodeURIComponent(token)}`;

    const card: ConciergeCardDTO = {
      type: 'guest_request',
      requestId: created.id,
      reservationCode: reservation.code,
      guestName: reservation.contact.name,
      kind: kind.replace(/_/g, ' '),
      status: 'NEW · SENT TO FRONT DESK',
      note,
      createdAt: created.createdAt.toISOString(),
      stayUrl,
    };

    return {
      toolCallId: id,
      name: 'submit_guest_request',
      output: JSON.stringify({
        success: true,
        reservationCode: reservation.code,
        requestKind: kind,
        status: 'Logged in Reberon PMS for Front Desk action',
        note,
      }),
      card,
    };
  }

  /* ── 10. Claim Priority Waitlist ── */
  private async handleClaimWaitlist(id: string, args: Record<string, unknown>): Promise<ToolExecutionResult> {
    const guestName = String(args.guestName || 'Valued Guest').trim();
    const phone = String(args.phone || '+256760512691').trim();
    const email = String(args.email || '').trim().toLowerCase();
    const preferredDates = String(args.preferredDates || 'Upcoming Season');
    const roomTypePreference = String(args.roomTypePreference || 'Any Suite');
    const notes = String(args.notes || '');

    let contact = await this.prisma.contact.findFirst({
      where: { OR: [{ phone }, ...(email ? [{ email }] : [])] },
    });
    if (!contact) {
      contact = await this.prisma.contact.create({
        data: { name: guestName, phone, email: email || null },
      });
    }

    const ref = referenceCode('WL');
    await this.prisma.waitlistEntry.create({
      data: {
        reference: ref,
        contactId: contact.id,
        note: `Sipi Concierge claim: ${preferredDates}. Suite preference: ${roomTypePreference}. Notes: ${notes}`,
        status: 'NEW',
        flexibleDates: true,
      },
    });

    const card: ConciergeCardDTO = {
      type: 'waitlist',
      reference: ref,
      guestName,
      preferredDates,
      roomType: roomTypePreference,
      actionUrl: '/rising',
      actionLabel: 'Track Sanctuary Rising',
    };

    return {
      toolCallId: id,
      name: 'claim_priority_waitlist',
      output: JSON.stringify({
        success: true,
        waitlistReference: ref,
        guestName,
        preferredDates,
      }),
      card,
    };
  }

  /* ── 11. Hotel Facilities ── */
  private async handleGetFacilities(id: string, args: Record<string, unknown>): Promise<ToolExecutionResult> {
    const category = String(args.category || 'all');
    const dbFacilities = await this.prisma.facility.findMany({
      where: { status: { not: 'HIDDEN' }, deletedAt: null },
      orderBy: { order: 'asc' },
    });

    const matched =
      category === 'all'
        ? dbFacilities
        : dbFacilities.filter((f) => f.slug.toLowerCase().includes(category.toLowerCase()));

    const target = matched[0] || dbFacilities[0];
    const card: ConciergeCardDTO | undefined = target
      ? {
          type: 'facility',
          slug: target.slug,
          name: tr(target.name),
          hours: '06:00 – 22:00',
          imageUrl: getMediaUrl(target.mediaIds?.[0]),
          galleryUrls: (target.mediaIds || []).slice(0, 3).map((mid: string) => getMediaUrl(mid)).filter(Boolean) as string[],
          features: [tr(target.summary) || 'High-altitude mountain facility'],
          actionUrl: `/facilities/${target.slug}`,
          actionLabel: `Explore ${tr(target.name)}`,
        }
      : undefined;

    return {
      toolCallId: id,
      name: 'get_hotel_facilities',
      output: JSON.stringify({
        altitude: '1,900 m on Mount Elgon ridge',
        facilities: dbFacilities.map((f) => ({
          slug: f.slug,
          name: tr(f.name),
          summary: tr(f.summary),
          url: `/facilities/${f.slug}`,
        })),
      }),
      card,
    };
  }

  /* ── 12. Local Activities ── */
  private async handleGetActivities(id: string, args: Record<string, unknown>): Promise<ToolExecutionResult> {
    const activity = String(args.activity || 'all');
    const dbDestinations = await this.prisma.destination.findMany({
      where: { status: { not: 'HIDDEN' }, deletedAt: null },
      orderBy: { order: 'asc' },
    });

    const targetDest = dbDestinations.find((d) => d.slug.includes(activity.replace(/_/g, '-'))) || dbDestinations[0];

    const card: ConciergeCardDTO | undefined = targetDest
      ? {
          type: 'activity',
          slug: targetDest.slug,
          title: tr(targetDest.name) || 'Sipi Falls Trail Guide',
          difficulty: targetDest.slug === 'mount-elgon' ? 'Challenging (High-Altitude Trek)' : 'Moderate Walk',
          duration: targetDest.slug === 'mount-elgon' ? '1 to 4 days' : '2.5 to 3.5 hours',
          bestTime: 'Morning (08:00 – 11:00)',
          notes: tr(targetDest.tagline) || 'Guided highland trail with local community rangers.',
          imageUrl: getMediaUrl(targetDest.heroMediaId),
          galleryUrls: (targetDest.galleryIds || []).slice(0, 3).map((gid: string) => getMediaUrl(gid)).filter(Boolean) as string[],
          actionUrl: `/kapchorwa/${targetDest.slug}`,
          actionLabel: `Read ${tr(targetDest.name)} Guide`,
        }
      : undefined;

    return {
      toolCallId: id,
      name: 'get_local_activities',
      output: JSON.stringify({
        activities: dbDestinations.map((d) => ({
          slug: d.slug,
          name: tr(d.name),
          tagline: tr(d.tagline),
          url: `/kapchorwa/${d.slug}`,
        })),
      }),
      card,
    };
  }

  /* ── 13. Weather & Directions ── */
  private async handleGetWeatherAndDirections(id: string): Promise<ToolExecutionResult> {
    const card: ConciergeCardDTO = {
      type: 'activity',
      slug: 'the-road',
      title: 'Scenic Escarpment Drive to Kapchorwa (295 km)',
      difficulty: 'Smooth Tarmac Highway (No 4x4 needed)',
      duration: '6 to 7 hours driving time',
      bestTime: 'Daytime driving for escarpment views',
      notes: 'Route: Kampala → Jinja (Nile Bridge) → Iganga → Mbale → Kapchorwa. Gated compound with 24/7 security.',
      actionUrl: 'https://maps.google.com/?q=Reberon+Hotel+Kapchorwa',
      actionLabel: 'Open Google Maps Route',
    };

    return {
      toolCallId: id,
      name: 'get_weather_and_directions',
      output: JSON.stringify({
        altitude: '1,900 m ASL',
        daytime: '21°C to 25°C',
        evening: '12°C to 15°C (fleece advised)',
        route: 'Kampala → Jinja → Iganga → Mbale → Kapchorwa (295 km paved tarmac).',
      }),
      card,
    };
  }

  /* ── 14. Human Handover ── */
  private async handleHumanHandover(id: string, args: Record<string, unknown>): Promise<ToolExecutionResult> {
    const guestName = String(args.guestName || 'Guest');
    const phone = String(args.phone || '');
    const summary = String(args.summary || 'Inquiry from Sipi Concierge');

    const whatsappNumber = '256760512691';
    const textMsg = encodeURIComponent(`Hello Denis & Reberon Concierge, I am ${guestName}. ${summary}`);
    const whatsappUrl = `https://wa.me/${whatsappNumber}?text=${textMsg}`;

    if (phone) {
      let contact = await this.prisma.contact.findFirst({ where: { phone } });
      if (!contact) {
        contact = await this.prisma.contact.create({ data: { name: guestName, phone } });
      }
      await this.prisma.conversation.create({
        data: {
          reference: referenceCode('CN'),
          contactId: contact.id,
          channel: 'WHATSAPP',
          intent: 'GENERAL',
          status: 'NEW',
          subject: `Concierge Handover: ${guestName}`,
          context: { summary, handoverAt: new Date().toISOString() },
        },
      });
    }

    const card: ConciergeCardDTO = {
      type: 'handover',
      phone: '+256 760 512 691',
      whatsappUrl,
      message: `Direct priority line to Denis Mayamba & Reberon Front Desk.`,
      actionUrl: whatsappUrl,
      actionLabel: 'Open WhatsApp with Denis Mayamba',
    };

    return {
      toolCallId: id,
      name: 'human_handover',
      output: JSON.stringify({
        whatsappUrl,
        conciergeNumber: '+256 760 512 691',
      }),
      card,
    };
  }

  /* ── 15. Request Airport / Sanctuary Transfer ── */
  private async handleRequestTransfer(id: string, args: Record<string, unknown>): Promise<ToolExecutionResult> {
    const pickupLocation = String(args.pickupLocation || 'Entebbe Airport (EBB)').trim();
    const date = String(args.date || '').trim() || new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    const passengers = Number(args.passengers) || 2;
    const guestName = String(args.guestName || 'Valued Guest').trim();
    const phone = String(args.phone || '').trim();
    const flightNumber = String(args.flightNumber || '').trim();

    const isMbale = pickupLocation.toLowerCase().includes('mbale');
    const travelTime = isMbale ? '1 hour 15 minutes' : '6 to 7 hours scenic drive';
    const costUgx = isMbale ? '120,000 UGX' : '450,000 UGX ($120)';

    try {
      let contact = await this.prisma.contact.findFirst({
        where: { OR: [phone ? { phone } : { id: '00000000-0000-0000-0000-000000000000' }, { name: guestName }] },
      });
      if (!contact) {
        contact = await this.prisma.contact.create({
          data: { name: guestName, phone: phone || null },
        });
      }

      await this.prisma.conversation.create({
        data: {
          reference: referenceCode('CN'),
          contactId: contact.id,
          channel: 'WEB_FORM',
          intent: 'GENERAL',
          status: 'NEW',
          subject: `Transfer Request: ${guestName} (${pickupLocation})`,
          context: {
            source: 'Sipi Concierge AI',
            pickupLocation,
            date,
            passengers,
            phone,
            flightNumber: flightNumber || null,
            estimatedCost: costUgx,
          },
        },
      });
    } catch (err) {
      this.log.warn(`Could not log transfer ticket: ${err}`);
    }

    const whatsappUrl = `https://wa.me/256760512691?text=${encodeURIComponent(
      `Hello Denis, I would like to confirm my private 4x4 transfer from ${pickupLocation} to Reberon Hotel for ${guestName} on ${date} (${passengers} passengers).`,
    )}`;

    const card: ConciergeCardDTO = {
      type: 'transfer',
      pickupLocation,
      destination: 'Reberon Hotel, Kapchorwa (1,900 m ASL)',
      vehicleType: 'Executive 4x4 Land Cruiser Prado',
      travelTime,
      estimatedCost: costUgx,
      currency: 'UGX',
      inclusions: [
        'Dedicated licensed mountain driver',
        'Chilled spring water & Kapchorwa Arabica flask',
        'Highway tolls & luggage handling included',
      ],
      notes: `Pickup on ${date} for ${passengers} passenger(s)${flightNumber ? ` · Flight: ${flightNumber}` : ''}.`,
      actionUrl: whatsappUrl,
      actionLabel: 'Confirm Transfer with Denis',
    };

    return {
      toolCallId: id,
      name: 'request_airport_transfer',
      output: JSON.stringify({
        confirmedInquiry: true,
        pickupLocation,
        travelTime,
        cost: costUgx,
      }),
      card,
    };
  }

  /* ── 16. Dining & Live POS Menu Intelligence ── */
  private async handleGetDining(id: string, _args: Record<string, unknown>): Promise<ToolExecutionResult> {
    const posItems = await this.prisma.posItem.findMany({
      where: { isAvailable: true },
      include: { category: true },
      orderBy: { priceMinorUGX: 'desc' },
      take: 8,
    });

    const menuItems = posItems.map((item) => ({
      name: item.name,
      category: item.category.name,
      price: `${Number(item.priceMinorUGX).toLocaleString()} UGX`,
    }));

    const card: ConciergeCardDTO = {
      type: 'dining',
      venue: 'Highland Restaurant & Arabica Coffee Terrace',
      cuisine: 'High-Altitude Ugandan & Mountain Trout Fusion',
      hours: '06:30 – 22:00 Daily',
      highlights: [
        'Pan-seared Mount Elgon River Trout with mountain herbs & lemon beurre blanc',
        'Single-origin Kapchorwa Arabica coffee roasted daily at 1,900 m',
        'Highland farm eggs, organic millet crumbles & endurance athlete plates',
      ],
      dietaryOptions: ['Halal Certified', 'Vegetarian & Vegan', 'Gluten-Free', 'Athlete Nutrition'],
      menuItems: menuItems.length > 0 ? menuItems : undefined,
      coffeeExperience: 'Single-origin specialty Arabica (1,800–2,200 m) — pour-over, Chemex & terrace roasting.',
      actionUrl: '/facilities/restaurant',
      actionLabel: 'Explore Dining & Terrace',
    };

    return {
      toolCallId: id,
      name: 'get_dining_and_dietary',
      output: JSON.stringify({
        venue: card.venue,
        hours: card.hours,
        highlights: card.highlights,
        liveMenuSample: menuItems,
      }),
      card,
    };
  }

  /* ── 17. Weather & Packing Guidance ── */
  private async handleGetWeatherAndPacking(id: string, _args: Record<string, unknown>): Promise<ToolExecutionResult> {
    const card: ConciergeCardDTO = {
      type: 'weather',
      altitude: '1,900 m ASL (Kapchorwa Northern Escarpment)',
      temperatureRange: 'Day 21°C–25°C · Night 12°C–15°C',
      dayClimate: 'Crisp mountain sunshine & alpine breeze',
      nightClimate: 'Cool highland air — terrace fire bowls lit nightly',
      packingChecklist: [
        'Warm fleece or knit sweater for 12°C evenings',
        'Trail running shoes or hiking boots for Sipi Falls',
        'Lightweight waterproof rain shell for waterfall mist',
        'UV sunglasses & SPF sunscreen (high-altitude sun)',
      ],
      routeStatus: '100% paved tarmac highway from Kampala / Jinja / Mbale to hotel gate.',
      actionUrl: '/kapchorwa/the-road',
      actionLabel: 'Highway Route Guide',
    };

    return {
      toolCallId: id,
      name: 'get_weather_and_packing_guide',
      output: JSON.stringify(card),
      card,
    };
  }
}
