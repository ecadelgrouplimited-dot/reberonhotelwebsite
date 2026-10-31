import { Body, Controller, Get, HttpCode, Param, Post, Query, Res } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { z } from 'zod';
import { zDocumentQuery, zSendDocumentInput, zVoidDocumentInput } from '@reberon/contracts';
import { CurrentUser, Requires, type AuthUser } from '../../common/auth.js';
import { ZodPipe } from '../../common/zod.pipe.js';
import { notFound } from '../../common/errors.js';
import { PrismaService } from '../../common/prisma.service.js';
import { stayToken } from '../../common/stay-token.js';
import { env } from '../../config.js';
import { DocumentsService } from './documents.service.js';
import type { Paper } from './render.js';

const paperOf = (p?: string, fallback: Paper = 'A4'): Paper => (p ? (p.toUpperCase() === '80MM' ? '80MM' : 'A4') : fallback);

/** The page is ours alone: only its own inline style and script (by nonce) may run. */
function sendHtml(res: Response, out: { html: string; nonce: string }) {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Content-Security-Policy', `default-src 'none'; style-src 'nonce-${out.nonce}'; script-src 'nonce-${out.nonce}'; img-src data: https:; base-uri 'none'; form-action 'none'; frame-ancestors 'self' ${env.WEB_URL} ${env.ADMIN_URL}`);
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Robots-Tag', 'noindex');
  res.send(out.html);
}

@Controller('v1/admin')
export class DocumentsAdminController {
  constructor(private readonly docs: DocumentsService) {}

  @Get('documents')
  @Requires('receipts:read')
  register(@Query(new ZodPipe(zDocumentQuery)) q: z.infer<typeof zDocumentQuery>) {
    return this.docs.register(q);
  }

  @Get('documents.csv')
  @Requires('receipts:read')
  async csv(@Query(new ZodPipe(zDocumentQuery)) q: z.infer<typeof zDocumentQuery>, @Res() res: Response) {
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="reberon-documents-${q.from ?? 'all'}-${q.to ?? 'now'}.csv"`);
    res.send(`﻿${await this.docs.csv(q)}`);
  }

  /** Opening it to print counts as a print (the second one says COPY 2). */
  @Get('documents/:id/print')
  @Requires('receipts:read')
  async print(@Param('id') id: string, @Query('paper') paper: string | undefined, @Query('autoprint') autoprint: string | undefined, @CurrentUser() user: AuthUser, @Res() res: Response) {
    sendHtml(res, await this.docs.html(id, { paper: paperOf(paper, await this.docs.defaultPaper()), autoprint: autoprint === '1', countPrint: true, actor: user }));
  }

  @Post('documents/:id/send')
  @HttpCode(200)
  @Requires('receipts:issue')
  send(@Param('id') id: string, @Body(new ZodPipe(zSendDocumentInput)) body: z.infer<typeof zSendDocumentInput>, @CurrentUser() user: AuthUser) {
    return this.docs.send(id, body.channel, user);
  }

  @Post('documents/:id/void')
  @HttpCode(200)
  @Requires('receipts:void')
  void(@Param('id') id: string, @Body(new ZodPipe(zVoidDocumentInput)) body: z.infer<typeof zVoidDocumentInput>, @CurrentUser() user: AuthUser) {
    return this.docs.void(id, body, user);
  }

  @Post('reservations/:id/invoice')
  @HttpCode(200)
  @Requires('receipts:issue')
  async invoice(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    const doc = await this.docs.invoice(id, user);
    return (await this.docs.dtos([doc]))[0];
  }

  /** The live bill, unnumbered: "statement of account — not a receipt". */
  @Get('reservations/:id/statement')
  @Requires('receipts:read')
  async statement(@Param('id') id: string, @Query('paper') paper: string | undefined, @Res() res: Response) {
    sendHtml(res, await this.docs.statement(id, paperOf(paper)));
  }

  @Post('documents/backfill')
  @HttpCode(200)
  @Requires('users:manage')
  backfill(@CurrentUser() user: AuthUser) {
    return this.docs.backfill(user);
  }

  /** Issue an official numbered standalone receipt or invoice directly from the Receipts & Invoices register. */
  @Post('documents/direct')
  @HttpCode(201)
  @Requires('receipts:issue')
  async issueDirect(
    @Body(
      new ZodPipe(
        z.object({
          kind: z.enum(['RECEIPT', 'INVOICE']),
          currency: z.enum(['UGX', 'USD']).default('UGX'),
          issuedToName: z.string().trim().min(2).max(160),
          issuedToPhone: z.string().trim().max(40).optional(),
          issuedToEmail: z.string().trim().email().max(160).optional().or(z.literal('')),
          description: z.string().trim().min(2).max(240),
          amountMinor: z.string().regex(/^\d+$/),
          paymentMethod: z.string().trim().max(40).optional(),
          paymentReference: z.string().trim().max(80).optional(),
          note: z.string().trim().max(300).optional(),
        }),
      ),
    )
    body: {
      kind: 'RECEIPT' | 'INVOICE';
      currency: 'UGX' | 'USD';
      issuedToName: string;
      issuedToPhone?: string;
      issuedToEmail?: string;
      description: string;
      amountMinor: string;
      paymentMethod?: string;
      paymentReference?: string;
      note?: string;
    },
    @CurrentUser() user: AuthUser,
  ) {
    const todayIso = new Date().toISOString().slice(0, 10);
    const amount = BigInt(body.amountMinor);
    const doc = await this.docs.issueDirectDocument({
      kind: body.kind,
      currency: body.currency,
      amountMinor: amount,
      issuedTo: {
        name: body.issuedToName,
        phone: body.issuedToPhone || null,
        email: body.issuedToEmail || null,
      },
      lines: [
        {
          date: todayIso,
          description: body.description,
          amountMinor: amount.toString(),
        },
      ],
      payment:
        body.kind === 'RECEIPT'
          ? {
              method: (body.paymentMethod || 'CASH').replace(/_/g, ' '),
              reference: body.paymentReference || null,
              purpose: body.description,
            }
          : null,
      note: body.note || null,
      actor: { id: user.id, name: user.name },
    });
    return (await this.docs.dtos([doc]))[0];
  }
}

@Controller('v1/public/documents')
export class PublicDocumentsController {
  constructor(
    private readonly docs: DocumentsService,
    private readonly prisma: PrismaService,
  ) {}

  /** Anyone holding a receipt can check it is genuine: number + check code. */
  @Get('verify')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  verify(@Query('number') number = '', @Query('check') check = '') {
    return this.docs.verify(number, check);
  }

  /** The guest's own copy, reached from their stay link or verified check code. Never counts as a print. */
  @Get('quotation/:id')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  async quotation(@Param('id') id: string, @Query('check') check = '', @Query('paper') paper: string | undefined, @Res() res: Response) {
    const quo = /^[0-9a-f-]{36}$/i.test(id) ? await this.prisma.quotation.findUnique({ where: { id }, select: { id: true, checkCode: true } }) : null;
    if (!quo || quo.checkCode.toUpperCase() !== check.trim().toUpperCase()) throw notFound('Quotation');
    sendHtml(res, await this.docs.renderQuotationHtml(id, paperOf(paper), false));
  }

  /** The guest's own copy, reached from their stay link or check code. Never counts as a print. */
  @Get(':id')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  async one(
    @Param('id') id: string,
    @Query('code') code = '',
    @Query('t') t = '',
    @Query('check') check = '',
    @Query('paper') paper: string | undefined,
    @Res() res: Response,
  ) {
    const doc = /^[0-9a-f-]{36}$/i.test(id)
      ? await this.prisma.issuedDocument.findUnique({ where: { id }, select: { id: true, number: true, reservationId: true } })
      : null;
    if (!doc) throw notFound('Document');

    const cleanCheck = check.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    const expectedCheck = this.docs.checkCode(doc.number).replace(/[^A-Z0-9]/g, '');
    const validByCheck = Boolean(cleanCheck && expectedCheck === cleanCheck);
    let validByStayToken = false;
    if (doc.reservationId && code && t) {
      const r = await this.prisma.reservation.findUnique({ where: { id: doc.reservationId }, select: { code: true } });
      if (r && r.code === code && t === stayToken(code)) {
        validByStayToken = true;
      }
    }
    if (!validByCheck && !validByStayToken) throw notFound('Document');
    sendHtml(
      res,
      await this.docs.html(id, {
        paper: paperOf(paper),
        autoprint: false,
        countPrint: false,
        publicToken: validByStayToken ? { code, t } : undefined,
      }),
    );
  }
}
