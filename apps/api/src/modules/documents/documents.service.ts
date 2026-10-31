import { Injectable, Logger } from '@nestjs/common';
import { createHmac, randomBytes } from 'node:crypto';
import type { DocumentData, DocumentKind, DocumentLine, DocumentRegisterDTO, IssuedDocumentDTO, MessageChannel, OutboundMessageDTO } from '@reberon/contracts';
import { DOCUMENT_LABEL, DOCUMENT_PREFIX, t } from '@reberon/contracts';
import { formatMoney, type Currency } from '@reberon/utils';
import type { IssuedDocument, Prisma } from '@reberon/db';
import { PrismaService } from '../../common/prisma.service.js';
import { AuditService } from '../../common/audit.service.js';
import type { AuthUser } from '../../common/auth.js';
import { badRequest, conflict, notFound } from '../../common/errors.js';
import { stayToken } from '../../common/stay-token.js';
import { env } from '../../config.js';
import { lt } from '../content/mappers.js';
import { MessagingService } from '../notifications/messaging.service.js';
import { amountInWords } from './words.js';
import { renderDocument, type Paper } from './render.js';

type Tx = Prisma.TransactionClient;
const iso = (d: Date) => d.toISOString().slice(0, 10);
const METHOD: Record<string, string> = { MOBILE_MONEY: 'Mobile money', CARD: 'Card', CASH: 'Cash', BANK: 'Bank transfer', UNKNOWN: 'Payment' };
const PURPOSE: Record<string, string> = { DEPOSIT: 'Deposit', BALANCE: 'Balance', FULL: 'Payment in full', EXTRA: 'Extras' };

/**
 * Receipts, refund notes and invoices. Numbers are gap-free per kind and year
 * (the counter moves inside the same transaction as the document). A document
 * never changes after issue; a mistake is voided and a corrected one issued.
 */
@Injectable()
export class DocumentsService {
  private readonly log = new Logger('Documents');

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly messaging: MessagingService,
  ) {}

  /* ───────── numbering and checks ───────── */

  private async nextNumber(tx: Tx, kind: DocumentKind, at: Date) {
    const year = Number(new Intl.DateTimeFormat('en-CA', { year: 'numeric', timeZone: 'Africa/Kampala' }).format(at));
    const series = `${DOCUMENT_PREFIX[kind]}-${year}`;
    const [row] = await tx.$queryRaw<{ n: number }[]>`
      INSERT INTO "DocumentSequence" (series, next) VALUES (${series}, 2)
      ON CONFLICT (series) DO UPDATE SET next = "DocumentSequence".next + 1
      RETURNING next - 1 AS n`;
    const seq = Number(row!.n);
    return { year, seq, number: `${series}-${String(seq).padStart(5, '0')}` };
  }

  /** A short code printed on the document; only this server can produce it, so a forged receipt fails. */
  checkCode(number: string) {
    const h = createHmac('sha256', env.DATA_KEY ?? env.JWT_SECRET).update(`doc:${number}`).digest('hex').toUpperCase();
    return `${h.slice(0, 4)}-${h.slice(4, 8)}`;
  }

  async defaultPaper(): Promise<Paper> {
    return (await this.prisma.setting.findUnique({ where: { key: 'receipts.paper' } }))?.value === '80MM' ? '80MM' : 'A4';
  }

  /* ───────── the facts printed on every document ───────── */

  private async hotel() {
    const keys = ['hotel.name', 'hotel.legalName', 'contact.address', 'contact.phones', 'contact.email', 'contact.whatsapp', 'receipts.tin', 'receipts.footer', 'receipts.vatRegistered'];
    const s = Object.fromEntries((await this.prisma.setting.findMany({ where: { key: { in: keys } } })).map((r) => [r.key, r.value]));
    const text = (v: unknown) => (typeof v === 'string' ? v : t(lt(v))) || null;
    return {
      hotel: {
        name: text(s['hotel.name']) ?? 'Reberon Hotel',
        legalName: text(s['hotel.legalName']),
        tin: text(s['receipts.tin']),
        address: text(s['contact.address']),
        phone: (s['contact.phones'] as string[] | undefined)?.[0] ?? null,
        email: text(s['contact.email']),
        whatsapp: text(s['contact.whatsapp']),
      },
      footer: text(s['receipts.footer']),
      vatRegistered: s['receipts.vatRegistered'] === true,
    };
  }

  private async context(tx: Tx, reservationId: string) {
    const r = await tx.reservation.findUniqueOrThrow({ where: { id: reservationId }, include: { contact: true, rooms: true, folio: { include: { lines: { orderBy: { createdAt: 'asc' } } } } } });
    const types = await tx.roomType.findMany({ where: { id: { in: r.rooms.map((x) => x.roomTypeId) } }, select: { id: true, name: true } });
    const nights = Math.round((r.departure.getTime() - r.arrival.getTime()) / 86_400_000);
    return {
      r,
      reservation: {
        code: r.code,
        arrival: iso(r.arrival),
        departure: iso(r.departure),
        nights,
        room: r.rooms.map((x) => `${x.quantity > 1 ? `${x.quantity} × ` : ''}${t(lt(types.find((y) => y.id === x.roomTypeId)?.name))}`).join(', '),
        guests: `${r.adults} adult${r.adults > 1 ? 's' : ''}${r.children ? `, ${r.children} child${r.children > 1 ? 'ren' : ''}` : ''}`,
      },
      issuedTo: { name: r.contact.name, phone: r.contact.phone, email: r.contact.email },
    };
  }

  private async vat(amountMinor: bigint, registered: boolean) {
    if (!registered) return null;
    const rule = await this.prisma.taxRule.findFirst({ where: { isActive: true, inclusive: true } });
    if (!rule) return null;
    const rate = Number(rule.ratePercent);
    // Inclusive: VAT = gross × rate ÷ (100 + rate), rounded to the currency's unit.
    const included = (amountMinor * BigInt(Math.round(rate * 100))) / BigInt(Math.round((100 + rate) * 100));
    return { ratePercent: rate, includedMinor: included.toString() };
  }

  private async create(tx: Tx, kind: DocumentKind, o: { reservationId: string | null; paymentIntentId?: string; folioLineId?: string; currency: 'UGX' | 'USD'; amountMinor: bigint; issuedTo: IssuedDocumentDTO['issuedTo']; data: DocumentData; issuedById: string | null; issuedAt?: Date; replacesId?: string; isSeed?: boolean }) {
    const at = o.issuedAt ?? new Date();
    const n = await this.nextNumber(tx, kind, at);
    return tx.issuedDocument.create({
      data: { kind, ...n, reservationId: o.reservationId, paymentIntentId: o.paymentIntentId ?? null, folioLineId: o.folioLineId ?? null, currency: o.currency, amountMinor: o.amountMinor, issuedTo: o.issuedTo, data: o.data as unknown as Prisma.InputJsonValue, issuedAt: at, issuedById: o.issuedById, replacesId: o.replacesId ?? null, isSeed: o.isSeed ?? false },
    });
  }

  /* ───────── issuing ───────── */

  /** The receipt for a successful payment. Safe to call twice: one receipt per payment. */
  async forPayment(paymentIntentId: string, actor: { id: string; name: string } | null, opts: { issuedAt?: Date; send?: boolean } = {}) {
    const existing = await this.prisma.issuedDocument.findUnique({ where: { paymentIntentId } });
    if (existing) return existing;
    const p = await this.prisma.paymentIntent.findUnique({ where: { id: paymentIntentId } });
    if (!p || p.status !== 'SUCCEEDED') throw badRequest('Only a received payment gets a receipt');
    const h = await this.hotel();
    let doc: IssuedDocument;
    try {
      doc = await this.prisma.$transaction(async (tx) => {
        const c = await this.context(tx, p.reservationId);
        // Balance right after this payment: everything charged minus everything received up to it.
        const lines = c.r.folio?.lines ?? [];
        const idx = lines.findIndex((l) => l.paymentId === p.id);
        const upTo = idx >= 0 ? lines.slice(0, idx + 1) : lines;
        const balance = upTo.reduce((a, l) => a + l.amountMinor, 0n);
        const who = actor?.name ?? (p.provider === 'MANUAL' ? null : 'Online payment');
        const data: DocumentData = {
          title: 'Receipt',
          hotel: h.hotel,
          reservation: c.reservation,
          payment: { method: METHOD[p.method] ?? p.method, reference: p.confirmationCode ?? p.merchantReference, purpose: `${PURPOSE[p.purpose] ?? 'Payment'} for booking ${c.r.code}`, at: (p.paidAt ?? new Date()).toISOString() },
          lines: [],
          payments: [],
          totals: { chargesMinor: c.r.totalMinor.toString(), paidMinor: c.r.paidMinor.toString(), balanceMinor: balance.toString() },
          vat: null,
          amountInWords: amountInWords(p.amountMinor, p.currency),
          issuedBy: who,
          footer: h.footer,
          note: null,
        };
        return this.create(tx, 'RECEIPT', { reservationId: p.reservationId, paymentIntentId: p.id, currency: p.currency, amountMinor: p.amountMinor, issuedTo: c.issuedTo, data, issuedById: actor?.id ?? null, issuedAt: opts.issuedAt ?? p.paidAt ?? undefined, isSeed: c.r.isSeed });
      });
    } catch (e) {
      // Two callers raced for the same payment: the other one won, which is fine.
      if ((e as { code?: string }).code === 'P2002') return this.prisma.issuedDocument.findUniqueOrThrow({ where: { paymentIntentId } });
      throw e;
    }
    if (opts.send) await this.send(doc.id, 'EMAIL', null).catch((e) => this.log.warn(`receipt ${doc.number} not emailed: ${(e as Error).message}`));
    return doc;
  }

  /** The refund note for a refund line on the folio. */
  async forRefund(folioLineId: string, actor: { id: string; name: string } | null, issuedAt?: Date) {
    const existing = await this.prisma.issuedDocument.findUnique({ where: { folioLineId } });
    if (existing) return existing;
    const line = await this.prisma.folioLine.findUniqueOrThrow({ where: { id: folioLineId }, include: { folio: true } });
    if (line.kind !== 'REFUND') throw badRequest('Not a refund');
    const h = await this.hotel();
    return this.prisma.$transaction(async (tx) => {
      const c = await this.context(tx, line.folio.reservationId);
      const data: DocumentData = {
        title: 'Refund note',
        hotel: h.hotel,
        reservation: c.reservation,
        payment: { method: line.description.replace(/^Refund — /, ''), reference: null, purpose: `Refund for booking ${c.r.code}`, at: line.createdAt.toISOString() },
        lines: [],
        payments: [],
        totals: { chargesMinor: c.r.totalMinor.toString(), paidMinor: c.r.paidMinor.toString(), balanceMinor: (c.r.totalMinor - c.r.paidMinor).toString() },
        vat: null,
        amountInWords: amountInWords(line.amountMinor, line.folio.currency),
        issuedBy: actor?.name ?? null,
        footer: h.footer,
        note: null,
      };
      return this.create(tx, 'REFUND', { reservationId: c.r.id, folioLineId: line.id, currency: line.folio.currency, amountMinor: line.amountMinor, issuedTo: c.issuedTo, data, issuedById: actor?.id ?? null, issuedAt: issuedAt ?? line.createdAt, isSeed: c.r.isSeed });
    });
  }

  private async billData(tx: Tx, reservationId: string, title: string, issuedBy: string | null) {
    const h = await this.hotel();
    const c = await this.context(tx, reservationId);
    const all = c.r.folio?.lines ?? [];
    const toLine = (l: (typeof all)[number]): DocumentLine => ({ date: iso(l.date), description: l.description, amountMinor: l.amountMinor.toString() });
    const charges = all.filter((l) => !['PAYMENT', 'REFUND'].includes(l.kind));
    const pays = all.filter((l) => ['PAYMENT', 'REFUND'].includes(l.kind));
    const chargesTotal = charges.reduce((a, l) => a + l.amountMinor, 0n);
    const balance = all.reduce((a, l) => a + l.amountMinor, 0n);
    const data: DocumentData = {
      title,
      hotel: h.hotel,
      reservation: c.reservation,
      payment: null,
      lines: charges.map(toLine),
      payments: pays.map(toLine),
      totals: { chargesMinor: chargesTotal.toString(), paidMinor: (chargesTotal - balance).toString(), balanceMinor: balance.toString() },
      vat: await this.vat(chargesTotal, h.vatRegistered),
      amountInWords: amountInWords(chargesTotal, c.r.currency),
      issuedBy,
      footer: h.footer,
      note: null,
    };
    return { c, data, chargesTotal };
  }

  /** The numbered final bill (at check-out, or on request once the stay is over). */
  async invoice(reservationId: string, actor: { id: string; name: string } | null, issuedAt?: Date) {
    const existing = await this.prisma.issuedDocument.findFirst({ where: { reservationId, kind: 'INVOICE', voidedAt: null } });
    if (existing) return existing;
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Reservation" WHERE id = ${reservationId}::uuid FOR UPDATE`;
      const again = await tx.issuedDocument.findFirst({ where: { reservationId, kind: 'INVOICE', voidedAt: null } });
      if (again) return again;
      const { c, data, chargesTotal } = await this.billData(tx, reservationId, 'Invoice', actor?.name ?? null);
      if (!['IN_HOUSE', 'CHECKED_OUT', 'NO_SHOW', 'CANCELLED'].includes(c.r.status)) throw badRequest('An invoice is issued at check-out. Print a statement before that.');
      return this.create(tx, 'INVOICE', { reservationId, currency: c.r.currency, amountMinor: chargesTotal, issuedTo: c.issuedTo, data, issuedById: actor?.id ?? null, issuedAt, isSeed: c.r.isSeed });
    });
  }

  /* ───────── corrections ───────── */

  async void(id: string, input: { reason: string; reissue: boolean; issuedToName?: string }, actor: AuthUser) {
    const doc = await this.prisma.issuedDocument.findUnique({ where: { id } });
    if (!doc) throw notFound('Document');
    if (doc.voidedAt) throw conflict('Already voided');
    const replacement = await this.prisma.$transaction(async (tx) => {
      // The unique links move to the replacement, so "one receipt per payment" still holds.
      await tx.issuedDocument.update({ where: { id }, data: { voidedAt: new Date(), voidedById: actor.id, voidReason: input.reason, paymentIntentId: null, folioLineId: null } });
      if (!input.reissue) return null;
      const issuedTo = { ...(doc.issuedTo as IssuedDocumentDTO['issuedTo']), ...(input.issuedToName ? { name: input.issuedToName } : {}) };
      const data = { ...(doc.data as unknown as DocumentData), issuedBy: actor.name, note: `Replaces ${doc.number}.` };
      return this.create(tx, doc.kind, { reservationId: doc.reservationId, paymentIntentId: doc.paymentIntentId ?? undefined, folioLineId: doc.folioLineId ?? undefined, currency: doc.currency, amountMinor: doc.amountMinor, issuedTo, data, issuedById: actor.id, replacesId: doc.id });
    });
    await this.audit.record({ actor, action: 'document.void', entityType: 'IssuedDocument', entityId: id, summary: `Voided ${doc.number}: ${input.reason}${replacement ? ` — replaced by ${replacement.number}` : ''}` });
    return { voided: doc.number, replacement: replacement ? (await this.dtos([replacement]))[0]! : null };
  }

  /* ───────── views ───────── */

  async dtos(rows: IssuedDocument[]): Promise<IssuedDocumentDTO[]> {
    const users = new Map((await this.prisma.user.findMany({ where: { id: { in: rows.flatMap((r) => [r.issuedById, r.voidedById]).filter((x): x is string => !!x) } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]));
    const res = new Map((await this.prisma.reservation.findMany({ where: { id: { in: rows.map((r) => r.reservationId).filter((x): x is string => !!x) } }, select: { id: true, code: true } })).map((r) => [r.id, r.code]));
    const replaced = new Map((await this.prisma.issuedDocument.findMany({ where: { id: { in: rows.map((r) => r.replacesId).filter((x): x is string => !!x) } }, select: { id: true, number: true } })).map((r) => [r.id, r.number]));
    return rows.map((d) => ({
      id: d.id,
      kind: d.kind,
      number: d.number,
      currency: d.currency,
      amountMinor: d.amountMinor.toString(),
      issuedTo: d.issuedTo as IssuedDocumentDTO['issuedTo'],
      issuedAt: d.issuedAt.toISOString(),
      issuedBy: d.issuedById ? (users.get(d.issuedById) ?? null) : ((d.data as unknown as DocumentData).issuedBy ?? null),
      reservation: d.reservationId ? { id: d.reservationId, code: res.get(d.reservationId) ?? '' } : null,
      voided: d.voidedAt ? { at: d.voidedAt.toISOString(), by: d.voidedById ? (users.get(d.voidedById) ?? null) : null, reason: d.voidReason ?? '' } : null,
      replacesNumber: d.replacesId ? (replaced.get(d.replacesId) ?? null) : null,
      printCount: d.printCount,
      sentAt: d.sentAt?.toISOString() ?? null,
      checkCode: this.checkCode(d.number),
    }));
  }

  async register(q: { kind?: DocumentKind; from?: string; to?: string; q?: string; reservationId?: string }): Promise<DocumentRegisterDTO> {
    const where: Prisma.IssuedDocumentWhereInput = {};
    if (q.kind) where.kind = q.kind;
    if (q.reservationId) where.reservationId = q.reservationId;
    if (q.from || q.to) where.issuedAt = { ...(q.from ? { gte: new Date(`${q.from}T00:00:00+03:00`) } : {}), ...(q.to ? { lt: new Date(new Date(`${q.to}T00:00:00+03:00`).getTime() + 86_400_000) } : {}) };
    if (q.q) {
      const term = q.q.trim();
      const res = await this.prisma.reservation.findMany({ where: { OR: [{ code: { contains: term.toUpperCase() } }, { contact: { name: { contains: term, mode: 'insensitive' } } }] }, select: { id: true }, take: 200 });
      where.OR = [{ number: { contains: term.toUpperCase() } }, { reservationId: { in: res.map((r) => r.id) } }];
    }
    const rows = await this.prisma.issuedDocument.findMany({ where, orderBy: [{ issuedAt: 'desc' }, { seq: 'desc' }], take: 500 });
    const totals = { RECEIPT: { UGX: 0n, USD: 0n, count: 0 }, REFUND: { UGX: 0n, USD: 0n, count: 0 }, INVOICE: { UGX: 0n, USD: 0n, count: 0 } };
    for (const d of rows) {
      if (d.voidedAt) continue;
      totals[d.kind][d.currency] += d.amountMinor;
      totals[d.kind].count++;
    }
    const out = Object.fromEntries(Object.entries(totals).map(([k, v]) => [k, { UGX: v.UGX.toString(), USD: v.USD.toString(), count: v.count }])) as DocumentRegisterDTO['totals'];
    return { data: await this.dtos(rows), totals: out };
  }

  async csv(q: Parameters<DocumentsService['register']>[0]) {
    const { data } = await this.register(q);
    const cell = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const head = ['Number', 'Kind', 'Issued (Kampala)', 'Booking', 'Issued to', 'Currency', 'Amount', 'Status', 'Issued by', 'Check code'];
    const lines = data.map((d) => [
      d.number, DOCUMENT_LABEL[d.kind], new Intl.DateTimeFormat('en-GB', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Africa/Kampala' }).format(new Date(d.issuedAt)), d.reservation?.code ?? '', d.issuedTo.name, d.currency,
      d.currency === 'USD' ? (Number(d.amountMinor) / 100).toFixed(2) : d.amountMinor, d.voided ? `Voided: ${d.voided.reason}` : 'Valid', d.issuedBy ?? '', d.checkCode,
    ].map(cell).join(','));
    return [head.map(cell).join(','), ...lines].join('\r\n');
  }

  /** HTML for printing. Admin prints count as copies; the guest's own view does not. */
  async html(id: string, o: { paper: Paper; autoprint: boolean; countPrint: boolean; actor?: AuthUser | null; publicToken?: { code: string; t: string } }) {
    const doc = await this.prisma.issuedDocument.findUnique({ where: { id } });
    if (!doc) throw notFound('Document');
    const copy = doc.printCount;
    if (o.countPrint) {
      await this.prisma.issuedDocument.update({ where: { id }, data: { printCount: { increment: 1 }, lastPrintedAt: new Date() } });
      if (o.actor) await this.audit.record({ actor: o.actor, action: 'document.print', entityType: 'IssuedDocument', entityId: id, summary: `Printed ${doc.number}${copy ? ` (copy ${copy + 1})` : ''}` });
    }
    const nonce = randomBytes(12).toString('base64');
    const other = o.paper === '80MM' ? 'A4' : '80MM';
    const check = this.checkCode(doc.number);
    const altPaperUrl = o.publicToken
      ? `?code=${encodeURIComponent(o.publicToken.code)}&t=${encodeURIComponent(o.publicToken.t)}&paper=${other}`
      : `?check=${encodeURIComponent(check)}&paper=${other}`;
    return {
      nonce,
      html: renderDocument({
        kind: doc.kind, number: doc.number, issuedAt: doc.issuedAt.toISOString(), currency: doc.currency, amountMinor: doc.amountMinor.toString(),
        issuedTo: doc.issuedTo as IssuedDocumentDTO['issuedTo'], data: doc.data as unknown as DocumentData, checkCode: check,
        voided: doc.voidedAt ? { at: doc.voidedAt.toISOString(), reason: doc.voidReason ?? '' } : null,
        copy: o.countPrint ? copy : 0, paper: o.paper, autoprint: o.autoprint, nonce, verifyUrl: `${env.WEB_URL.replace(/^https?:\/\//, '')}/verify`, altPaperUrl,
      }),
    };
  }

  /** An unnumbered statement of the live bill: "not a receipt". */
  async statement(reservationId: string, paper: Paper) {
    const { c, data } = await this.prisma.$transaction((tx) => this.billData(tx, reservationId, 'Statement of account', null));
    const nonce = randomBytes(12).toString('base64');
    return {
      nonce,
      html: renderDocument({
        kind: 'STATEMENT',
        number: c.r.code,
        issuedAt: new Date().toISOString(),
        currency: c.r.currency,
        amountMinor: data.totals.chargesMinor,
        issuedTo: c.issuedTo,
        data,
        checkCode: null,
        voided: null,
        copy: 0,
        paper,
        autoprint: false,
        nonce,
        verifyUrl: null,
        qrUrlOverride: `${env.WEB_URL}/stay?code=${encodeURIComponent(c.r.code)}`,
        altPaperUrl: `?paper=${paper === '80MM' ? 'A4' : '80MM'}`,
      }),
    };
  }

  publicUrl(doc: { id: string }, code: string) {
    return `${env.API_URL}/v1/public/documents/${doc.id}?code=${encodeURIComponent(code)}&t=${stayToken(code)}`;
  }

  /** Send the document's link to the guest on one channel. */
  async send(id: string, channel: MessageChannel, actor: AuthUser | null): Promise<OutboundMessageDTO | null> {
    const doc = await this.prisma.issuedDocument.findUnique({ where: { id } });
    if (!doc?.reservationId) throw notFound('Document');
    if (doc.voidedAt) throw badRequest('This document was voided; send its replacement');
    const r = await this.prisma.reservation.findUniqueOrThrow({ where: { id: doc.reservationId }, select: { code: true } });
    const money = formatMoney(doc.amountMinor, doc.currency as Currency).replace(/\.00$/, '');
    const rows = await this.messaging.forReservation('document.issued', doc.reservationId, { documentName: `${DOCUMENT_LABEL[doc.kind].toLowerCase()} ${doc.number}`, amount: money, documentLink: this.publicUrl(doc, r.code) }, { channels: [channel], sentBy: actor });
    if (!rows.length) throw badRequest(`The guest has no ${channel === 'EMAIL' ? 'email address' : 'phone number'}, or this message is switched off`);
    await this.prisma.issuedDocument.update({ where: { id }, data: { sentAt: new Date() } });
    if (actor) await this.audit.record({ actor, action: 'document.send', entityType: 'IssuedDocument', entityId: id, summary: `Sent ${doc.number} by ${channel.toLowerCase()}` });
    return (await this.messaging.outbox({ id: rows[0]!.id }))[0] ?? null;
  }

  /** For the guest's stay page. */
  async forGuest(reservationId: string, code: string) {
    const rows = await this.prisma.issuedDocument.findMany({ where: { reservationId, voidedAt: null }, orderBy: { issuedAt: 'asc' } });
    return rows.map((d) => ({ kind: d.kind, number: d.number, amountMinor: d.amountMinor.toString(), issuedAt: d.issuedAt.toISOString(), url: this.publicUrl(d, code) }));
  }

  /** Public check: is this receipt real? Only confirms what the holder already has. */
  async verify(number: string, check: string) {
    const cleanNo = number.trim().toUpperCase();
    const cleanCheck = check.trim().toUpperCase();
    if (cleanNo.startsWith('QUO-')) {
      const quo = await this.prisma.quotation.findUnique({ where: { number: cleanNo } });
      if (!quo || quo.checkCode.toUpperCase() !== cleanCheck) return { valid: false as const };
      return {
        valid: true as const,
        kind: 'Quotation',
        number: quo.number,
        checkCode: quo.checkCode,
        issuedToName: quo.clientOrganization ? `${quo.clientName} (${quo.clientOrganization})` : quo.clientName,
        summary: quo.eventTitle,
        issuedAt: quo.createdAt.toISOString(),
        currency: quo.currency,
        amountMinor: quo.totalMinor.toString(),
        voided: quo.status === 'DECLINED' || quo.status === 'EXPIRED',
        publicPrintUrl: `${env.API_URL}/v1/public/documents/quotation/${quo.id}?check=${encodeURIComponent(quo.checkCode)}`,
      };
    }
    const doc = await this.prisma.issuedDocument.findUnique({ where: { number: cleanNo } });
    if (!doc || this.checkCode(doc.number) !== cleanCheck) return { valid: false as const };
    const issuedTo = doc.issuedTo as IssuedDocumentDTO['issuedTo'];
    const docData = doc.data as unknown as DocumentData;
    return {
      valid: true as const,
      kind: DOCUMENT_LABEL[doc.kind],
      number: doc.number,
      checkCode: cleanCheck,
      issuedToName: issuedTo?.name ?? 'Guest',
      summary: docData?.payment?.purpose ?? docData?.reservation?.room ?? docData?.note ?? DOCUMENT_LABEL[doc.kind],
      issuedAt: doc.issuedAt.toISOString(),
      currency: doc.currency,
      amountMinor: doc.amountMinor.toString(),
      voided: !!doc.voidedAt,
      publicPrintUrl: `${env.API_URL}/v1/public/documents/${doc.id}?check=${encodeURIComponent(cleanCheck)}`,
    };
  }

  /** Issue a numbered receipt or invoice directly for POS, Health Club or Converted Quotations. */
  async issueDirectDocument(o: {
    kind: DocumentKind;
    reservationId?: string | null;
    currency: 'UGX' | 'USD';
    amountMinor: bigint;
    issuedTo: { name: string; phone: string | null; email: string | null };
    lines: DocumentLine[];
    payments?: DocumentLine[];
    payment?: { method: string; reference: string | null; purpose: string } | null;
    balanceMinor?: bigint;
    note?: string | null;
    actor: { id: string; name: string } | null;
  }) {
    const h = await this.hotel();
    const now = new Date();
    const vat = o.kind === 'INVOICE' ? await this.vat(o.amountMinor, h.vatRegistered) : null;
    const paidMinor = o.kind === 'RECEIPT' ? o.amountMinor : (o.payments ?? []).reduce((a, p) => a + BigInt(p.amountMinor), 0n);
    const balanceMinor = o.balanceMinor ?? (o.kind === 'RECEIPT' ? 0n : o.amountMinor - paidMinor);
    const data: DocumentData = {
      title: DOCUMENT_LABEL[o.kind],
      hotel: h.hotel,
      reservation: null,
      payment: o.payment ? { ...o.payment, at: now.toISOString() } : null,
      lines: o.lines,
      payments: o.payments ?? [],
      totals: {
        chargesMinor: o.amountMinor.toString(),
        paidMinor: paidMinor.toString(),
        balanceMinor: balanceMinor.toString(),
      },
      vat,
      amountInWords: amountInWords(o.amountMinor, o.currency),
      issuedBy: o.actor?.name ?? 'Reberon Front Desk',
      footer: h.footer,
      note: o.note ?? null,
    };
    return this.prisma.$transaction((tx) =>
      this.create(tx, o.kind, {
        reservationId: o.reservationId ?? null,
        currency: o.currency,
        amountMinor: o.amountMinor,
        issuedTo: o.issuedTo,
        data,
        issuedById: o.actor?.id ?? null,
      }),
    );
  }

  /** Printable HTML for a Quotation (A4 or 80mm) with QR code verification. */
  async renderQuotationHtml(quotationId: string, paper: Paper, autoprint = false) {
    const quo = await this.prisma.quotation.findUnique({ where: { id: quotationId }, include: { lines: { orderBy: { sortOrder: 'asc' } } } });
    if (!quo) throw notFound('Quotation');
    const h = await this.hotel();
    const vat = await this.vat(quo.totalMinor, h.vatRegistered);
    const dateStr = iso(quo.eventDate ?? quo.createdAt);
    const lines: DocumentLine[] = quo.lines.map((l) => ({
      date: dateStr,
      description: `${l.description} (${l.quantity} × ${l.unit})`,
      amountMinor: l.totalMinor.toString(),
    }));
    if (quo.discountMinor > 0n) {
      lines.push({
        date: dateStr,
        description: 'Agreed Package Discount',
        amountMinor: (-quo.discountMinor).toString(),
      });
    }
    const data: DocumentData = {
      title: 'Quotation',
      hotel: h.hotel,
      reservation: quo.eventTitle
        ? {
            code: quo.eventType,
            arrival: iso(quo.eventDate ?? quo.createdAt),
            departure: iso(quo.endDate ?? quo.eventDate ?? quo.validUntil),
            nights: 1,
            room: quo.hallSetup || 'Sipi Grand Hall & Grounds',
            guests: quo.attendees ? `${quo.attendees} attendees · ${quo.eventTitle}` : quo.eventTitle,
          }
        : null,
      payment: null,
      lines,
      payments: [],
      totals: {
        chargesMinor: quo.totalMinor.toString(),
        paidMinor: '0',
        balanceMinor: quo.totalMinor.toString(),
      },
      vat,
      amountInWords: amountInWords(quo.totalMinor, quo.currency as 'UGX' | 'USD'),
      issuedBy: quo.createdByName ?? 'Reberon Events & Reservations',
      footer: quo.terms ?? h.footer,
      note: [quo.notes, `Valid until ${new Intl.DateTimeFormat('en-GB', { dateStyle: 'long', timeZone: 'UTC' }).format(quo.validUntil)}`].filter(Boolean).join(' — '),
    };
    const nonce = randomBytes(12).toString('base64');
    return {
      nonce,
      html: renderDocument({
        kind: 'QUOTATION',
        number: quo.number,
        issuedAt: quo.createdAt.toISOString(),
        currency: quo.currency,
        amountMinor: quo.totalMinor.toString(),
        issuedTo: {
          name: quo.clientOrganization ? `${quo.clientName} (${quo.clientOrganization})` : quo.clientName,
          phone: quo.clientPhone,
          email: quo.clientEmail,
        },
        data,
        checkCode: quo.checkCode,
        voided: quo.status === 'DECLINED' ? { at: quo.updatedAt.toISOString(), reason: 'Declined' } : null,
        copy: 0,
        paper,
        autoprint,
        nonce,
        verifyUrl: `${env.WEB_URL.replace(/^https?:\/\//, '')}/verify`,
        altPaperUrl: `?paper=${paper === '80MM' ? 'A4' : '80MM'}`,
      }),
    };
  }

  /**
   * Issue documents for history that has none (demo data, or bookings taken
   * before receipts existed). Oldest first so numbers follow the calendar.
   */
  async backfill(actor: AuthUser) {
    const pays = await this.prisma.paymentIntent.findMany({ where: { status: 'SUCCEEDED' }, orderBy: { paidAt: 'asc' }, select: { id: true } });
    let receipts = 0;
    for (const p of pays) {
      if (await this.prisma.issuedDocument.count({ where: { paymentIntentId: p.id } })) continue;
      await this.forPayment(p.id, null);
      receipts++;
    }
    const refunds = await this.prisma.folioLine.findMany({ where: { kind: 'REFUND' }, orderBy: { createdAt: 'asc' }, select: { id: true } });
    let notes = 0;
    for (const l of refunds) {
      if (await this.prisma.issuedDocument.count({ where: { folioLineId: l.id } })) continue;
      await this.forRefund(l.id, null);
      notes++;
    }
    const out = await this.prisma.reservation.findMany({ where: { status: 'CHECKED_OUT' }, orderBy: { checkedOutAt: 'asc' }, select: { id: true, checkedOutAt: true } });
    let invoices = 0;
    for (const r of out) {
      if (await this.prisma.issuedDocument.count({ where: { reservationId: r.id, kind: 'INVOICE' } })) continue;
      await this.invoice(r.id, null, r.checkedOutAt ?? undefined);
      invoices++;
    }
    await this.audit.record({ actor, action: 'document.backfill', entityType: 'IssuedDocument', summary: `Issued ${receipts} receipts, ${notes} refund notes and ${invoices} invoices for past bookings` });
    return { receipts, refundNotes: notes, invoices };
  }

}
