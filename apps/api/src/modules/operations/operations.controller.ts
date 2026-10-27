import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { z } from 'zod';
import {
  zCheckInHealthClubInput,
  zCheckOutHealthClubInput,
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
  zUpdatePosOrderStatusInput,
  zUpdateQuotationStatusInput,
} from '@reberon/contracts';
import { CurrentUser, Requires, type AuthUser } from '../../common/auth.js';
import { ZodPipe } from '../../common/zod.pipe.js';
import { env } from '../../config.js';
import { DocumentsService } from '../documents/documents.service.js';
import type { Paper } from '../documents/render.js';
import { OperationsService } from './operations.service.js';

@Controller('v1/admin')
export class OperationsController {
  constructor(
    private readonly ops: OperationsService,
    private readonly docs: DocumentsService,
  ) {}

  /* ───── POS (Kitchen, Bar, Health Club, Conference) ───── */

  @Get('pos/outlets')
  @Requires('pos:operate')
  outlets() {
    return this.ops.outlets();
  }

  @Get('pos/orders')
  @Requires('pos:operate')
  orders(@Query('outletId') outletId?: string, @Query('status') status?: string) {
    return this.ops.orders({ outletId, status });
  }

  @Post('pos/orders')
  @Requires('pos:operate')
  createOrder(
    @Body(new ZodPipe(zCreatePosOrderInput)) body: z.infer<typeof zCreatePosOrderInput>,
    @CurrentUser() user: AuthUser,
  ) {
    return this.ops.createOrder(body, user);
  }

  @Patch('pos/orders/:id/status')
  @Requires('pos:operate')
  updateOrderStatus(
    @Param('id') id: string,
    @Body(new ZodPipe(zUpdatePosOrderStatusInput)) body: z.infer<typeof zUpdatePosOrderStatusInput>,
    @CurrentUser() user: AuthUser,
  ) {
    return this.ops.updateOrderStatus(id, body.status, user);
  }

  @Patch('pos/items/:id')
  @Requires('pos:operate')
  toggleItem(
    @Param('id') id: string,
    @Body(new ZodPipe(zTogglePosItemInput)) body: z.infer<typeof zTogglePosItemInput>,
    @CurrentUser() user: AuthUser,
  ) {
    return this.ops.toggleItem(id, body, user);
  }

  /* ───── Health Club & Spa (Gym, Steam, Sauna) ───── */

  @Get('healthclub')
  @Requires('healthclub:operate')
  healthClub() {
    return this.ops.healthClubDashboard();
  }

  @Post('healthclub/memberships')
  @Requires('healthclub:operate')
  createMembership(
    @Body(new ZodPipe(zCreateMembershipInput)) body: z.infer<typeof zCreateMembershipInput>,
    @CurrentUser() user: AuthUser,
  ) {
    return this.ops.createMembership(body, user);
  }

  @Post('healthclub/checkin')
  @Requires('healthclub:operate')
  checkInHealthClub(
    @Body(new ZodPipe(zCheckInHealthClubInput)) body: z.infer<typeof zCheckInHealthClubInput>,
    @CurrentUser() user: AuthUser,
  ) {
    return this.ops.checkInHealthClub(body, user);
  }

  @Patch('healthclub/access/:id/checkout')
  @Requires('healthclub:operate')
  checkOutHealthClub(
    @Param('id') id: string,
    @Body(new ZodPipe(zCheckOutHealthClubInput)) body: z.infer<typeof zCheckOutHealthClubInput>,
    @CurrentUser() user: AuthUser,
  ) {
    return this.ops.checkOutHealthClub(id, body.gymTowelsReturned, user);
  }

  /* ───── Quotations & Events (Quotation ➔ Invoice ➔ Payment ➔ Receipt) ───── */

  @Get('quotations')
  @Requires('quotations:manage')
  quotations() {
    return this.ops.quotations();
  }

  @Post('quotations')
  @Requires('quotations:manage')
  createQuotation(
    @Body(new ZodPipe(zCreateQuotationInput)) body: z.infer<typeof zCreateQuotationInput>,
    @CurrentUser() user: AuthUser,
  ) {
    return this.ops.createQuotation(body, user);
  }

  @Patch('quotations/:id/status')
  @Requires('quotations:manage')
  updateQuotationStatus(
    @Param('id') id: string,
    @Body(new ZodPipe(zUpdateQuotationStatusInput)) body: z.infer<typeof zUpdateQuotationStatusInput>,
    @CurrentUser() user: AuthUser,
  ) {
    return this.ops.updateQuotationStatus(id, body.status, user);
  }

  @Post('quotations/:id/convert')
  @HttpCode(200)
  @Requires('quotations:manage')
  convertQuotation(
    @Param('id') id: string,
    @Body(new ZodPipe(zConvertQuotationToInvoiceInput)) body: z.infer<typeof zConvertQuotationToInvoiceInput>,
    @CurrentUser() user: AuthUser,
  ) {
    return this.ops.convertQuotationToInvoice(id, body, user);
  }

  @Get('quotations/:id/print')
  @Requires('quotations:manage')
  async printQuotation(
    @Param('id') id: string,
    @Query('paper') paper: string | undefined,
    @Query('autoprint') autoprint: string | undefined,
    @Res() res: Response,
  ) {
    const p: Paper = paper?.toUpperCase() === '80MM' ? '80MM' : 'A4';
    const out = await this.docs.renderQuotationHtml(id, p, autoprint === '1');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader(
      'Content-Security-Policy',
      `default-src 'none'; style-src 'nonce-${out.nonce}'; script-src 'nonce-${out.nonce}'; img-src data: https:; base-uri 'none'; form-action 'none'; frame-ancestors 'self' ${env.WEB_URL} ${env.ADMIN_URL}`,
    );
    res.setHeader('Cache-Control', 'no-store');
    res.send(out.html);
  }

  /* ───── Inventory, Segregated Linen & Fixed Assets ───── */

  @Get('inventory')
  @Requires('inventory:manage')
  inventory() {
    return this.ops.inventoryDashboard();
  }

  @Post('inventory/items')
  @Requires('inventory:manage')
  createInventoryItem(
    @Body(new ZodPipe(zCreateInventoryItemInput)) body: z.infer<typeof zCreateInventoryItemInput>,
    @CurrentUser() user: AuthUser,
  ) {
    return this.ops.createInventoryItem(body, user);
  }

  @Post('inventory/movements')
  @Requires('inventory:manage')
  recordMovement(
    @Body(new ZodPipe(zRecordStockMovementInput)) body: z.infer<typeof zRecordStockMovementInput>,
    @CurrentUser() user: AuthUser,
  ) {
    return this.ops.recordStockMovement(body, user);
  }

  /* ───── Requisitions, Internal Comms & Devices ───── */

  @Get('requisitions')
  @Requires('requisitions:request')
  requisitions() {
    return this.ops.requisitions();
  }

  @Post('requisitions')
  @Requires('requisitions:request')
  createRequisition(
    @Body(new ZodPipe(zCreateRequisitionInput)) body: z.infer<typeof zCreateRequisitionInput>,
    @CurrentUser() user: AuthUser,
  ) {
    return this.ops.createRequisition(body, user);
  }

  @Post('requisitions/:id/review')
  @HttpCode(200)
  @Requires('requisitions:approve')
  reviewRequisition(
    @Param('id') id: string,
    @Body(new ZodPipe(zReviewRequisitionInput)) body: z.infer<typeof zReviewRequisitionInput>,
    @CurrentUser() user: AuthUser,
  ) {
    return this.ops.reviewRequisition(id, body, user);
  }

  @Get('announcements')
  @Requires('dashboard:view')
  announcements() {
    return this.ops.announcements();
  }

  @Post('announcements')
  @Requires('dashboard:view')
  createAnnouncement(
    @Body(new ZodPipe(zCreateAnnouncementInput)) body: z.infer<typeof zCreateAnnouncementInput>,
    @CurrentUser() user: AuthUser,
  ) {
    return this.ops.createAnnouncement(body, user);
  }

  @Get('devices')
  @Requires('dashboard:view')
  devices() {
    return this.ops.devices();
  }
}
