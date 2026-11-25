import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { Throttle } from '@nestjs/throttler';
import { z } from 'zod';
import {
  zAssignRoomsInput, zCheckInInput, zCheckOutInput, zFeedbackInput, zFolioChargeInput, zGuestMergeInput, zGuestPatch,
  zHkStatusInput, zHkTaskCreateInput, zHkTaskPatch, zMoveRoomInput, zNoShowInput, zReportQuery, zFinanceQuery, zBriefQuery, zRoomBlockInput,
  zRoomCreateInput, zRoomUpdateInput, zDayCloseInput,
  zLostItemCreate, zLostItemDispose, zLostItemPatch, zLostItemReturn,
  zWorkOrderCreate, zWorkOrderNote, zWorkOrderOutOfService, zWorkOrderPatch, zWorkOrderStatus,
} from '@reberon/contracts';
import { hotelToday } from '@reberon/utils';
import { CurrentUser, Requires, type AuthUser } from '../../common/auth.js';
import { ZodPipe } from '../../common/zod.pipe.js';
import { notFound } from '../../common/errors.js';
import { BookingService } from '../booking/booking.service.js';
import { DeskService } from './desk.service.js';
import { RackService } from './rack.service.js';
import { GuestsService } from './guests.service.js';
import { ReportsService } from './reports.service.js';
import { FinanceService } from './finance.service.js';
import { DayCloseService } from './day-close.service.js';
import { UpkeepService } from './upkeep.service.js';
import { sendDocument } from '../documents/letterhead.js';

const dateParam = (d?: string) => (d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : hotelToday());

@Controller('v1/admin/desk')
export class DeskController {
  constructor(private readonly desk: DeskService) {}

  @Get()
  @Requires('desk:operate')
  board(@Query('date') date?: string) {
    return this.desk.board(dateParam(date));
  }

  @Get('reservations/:id/rooms')
  @Requires('desk:operate')
  options(@Param('id') id: string) {
    return this.desk.options(id);
  }

  @Post('reservations/:id/assign')
  @HttpCode(200)
  @Requires('desk:operate')
  assign(@Param('id') id: string, @Body(new ZodPipe(zAssignRoomsInput)) body: z.infer<typeof zAssignRoomsInput>, @CurrentUser() user: AuthUser) {
    return this.desk.assign(id, body, user);
  }

  @Post('reservations/:id/check-in')
  @HttpCode(200)
  @Requires('desk:operate')
  checkIn(@Param('id') id: string, @Body(new ZodPipe(zCheckInInput)) body: z.infer<typeof zCheckInInput>, @CurrentUser() user: AuthUser) {
    return this.desk.checkIn(id, body, user);
  }

  @Post('reservations/:id/check-out')
  @HttpCode(200)
  @Requires('desk:operate')
  checkOut(@Param('id') id: string, @Body(new ZodPipe(zCheckOutInput)) body: z.infer<typeof zCheckOutInput>, @CurrentUser() user: AuthUser) {
    return this.desk.checkOut(id, body, user);
  }

  @Post('reservations/:id/no-show')
  @HttpCode(200)
  @Requires('desk:operate')
  noShow(@Param('id') id: string, @Body(new ZodPipe(zNoShowInput)) body: z.infer<typeof zNoShowInput>, @CurrentUser() user: AuthUser) {
    return this.desk.noShow(id, body.note, user);
  }

  @Post('reservations/:id/move')
  @HttpCode(200)
  @Requires('desk:operate')
  move(@Param('id') id: string, @Body(new ZodPipe(zMoveRoomInput)) body: z.infer<typeof zMoveRoomInput>, @CurrentUser() user: AuthUser) {
    return this.desk.move(id, body, user);
  }

  @Post('reservations/:id/charges')
  @HttpCode(200)
  @Requires('desk:operate')
  charge(@Param('id') id: string, @Body(new ZodPipe(zFolioChargeInput)) body: z.infer<typeof zFolioChargeInput>, @CurrentUser() user: AuthUser) {
    return this.desk.charge(id, body, user);
  }

  @Patch('requests/:id')
  @Requires('desk:operate')
  patchRequest(@Param('id') id: string, @Body() body: { status: 'ACCEPTED' | 'DONE' | 'DECLINED' }, @CurrentUser() user: AuthUser) {
    return this.desk.patchGuestRequest(id, body.status, user);
  }
}

@Controller('v1/admin')
export class RoomsHouseController {
  constructor(private readonly rack: RackService) {}

  @Get('rack')
  @Requires('rooms:status')
  rackView(@Query('date') date?: string) {
    return this.rack.rack(dateParam(date));
  }

  @Get('room-types-list')
  @Requires('rooms:status')
  roomTypesList() {
    return this.rack.roomTypes();
  }

  @Post('rooms')
  @Requires('rooms:manage')
  createRoom(@Body(new ZodPipe(zRoomCreateInput)) body: z.infer<typeof zRoomCreateInput>, @CurrentUser() user: AuthUser) {
    return this.rack.createRoom(body, user);
  }

  @Patch('rooms/:id')
  @Requires('rooms:manage')
  updateRoom(@Param('id') id: string, @Body(new ZodPipe(zRoomUpdateInput)) body: z.infer<typeof zRoomUpdateInput>, @CurrentUser() user: AuthUser) {
    return this.rack.updateRoom(id, body, user);
  }

  @Delete('rooms/:id')
  @HttpCode(200)
  @Requires('rooms:manage')
  deleteRoom(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.rack.deleteRoom(id, user);
  }

  @Patch('rack/:roomId/status')
  @Requires('rooms:status')
  status(@Param('roomId') roomId: string, @Body(new ZodPipe(zHkStatusInput)) body: z.infer<typeof zHkStatusInput>, @CurrentUser() user: AuthUser) {
    return this.rack.setStatus(roomId, body.status, body.note, user);
  }

  @Get('housekeeping')
  @Requires('rooms:status')
  board(@Query('date') date?: string) {
    return this.rack.board(dateParam(date));
  }

  @Post('housekeeping/tasks')
  @Requires('rooms:status')
  createTask(@Body(new ZodPipe(zHkTaskCreateInput)) body: z.infer<typeof zHkTaskCreateInput>, @CurrentUser() user: AuthUser) {
    return this.rack.createTask(body, user);
  }

  @Post('housekeeping/sync')
  @HttpCode(200)
  @Requires('rooms:status')
  async syncHousekeeping(@Body() body?: { date?: string }) {
    const d = dateParam(body?.date);
    await this.rack.syncToday(d);
    return this.rack.board(d);
  }

  @Patch('housekeeping/tasks/:id')
  @Requires('rooms:status')
  patchTask(@Param('id') id: string, @Body(new ZodPipe(zHkTaskPatch)) body: z.infer<typeof zHkTaskPatch>, @CurrentUser() user: AuthUser) {
    return this.rack.patchTask(id, body, user);
  }

  @Delete('housekeeping/tasks/:id')
  @HttpCode(200)
  @Requires('rooms:status')
  deleteTask(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.rack.deleteTask(id, user);
  }

  @Get('room-blocks')
  @Requires('rooms:status')
  blocks() {
    return this.rack.blocks();
  }

  @Post('room-blocks')
  @Requires('rooms:manage')
  block(@Body(new ZodPipe(zRoomBlockInput)) body: z.infer<typeof zRoomBlockInput>, @CurrentUser() user: AuthUser) {
    return this.rack.block(body, user);
  }

  @Delete('room-blocks/:id')
  @Requires('rooms:manage')
  release(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.rack.releaseBlock(id, user);
  }
}

@Controller('v1/admin')
export class GuestsController {
  constructor(
    private readonly guests: GuestsService,
    private readonly reports: ReportsService,
    private readonly finance: FinanceService,
  ) {}

  @Get('guests')
  @Requires('guests:read')
  list(@Query('q') q: string | undefined, @Query('filter') filter: string | undefined, @CurrentUser() user: AuthUser) {
    return this.guests.list({ q, filter }, user);
  }

  @Get('guests/:id')
  @Requires('guests:read')
  profile(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.guests.profile(id, user);
  }

  @Patch('guests/:id')
  @Requires('guests:write')
  update(@Param('id') id: string, @Body(new ZodPipe(zGuestPatch)) body: z.infer<typeof zGuestPatch>, @CurrentUser() user: AuthUser) {
    return this.guests.update(id, body, user);
  }

  @Delete('guests/:id')
  @HttpCode(200)
  @Requires('guests:write')
  remove(@Param('id') id: string, @Body() body: { reason?: string } | undefined, @CurrentUser() user: AuthUser) {
    return this.guests.delete(id, body?.reason, user);
  }

  @Post('guests/merge')
  @HttpCode(200)
  @Requires('guests:merge')
  merge(@Body(new ZodPipe(zGuestMergeInput)) body: z.infer<typeof zGuestMergeInput>, @CurrentUser() user: AuthUser) {
    return this.guests.merge(body.keepId, body.mergeId, user);
  }

  @Get('feedback')
  @Requires('guests:read')
  feedback(@Query('filter') filter?: string) {
    return this.guests.feedback(filter);
  }

  @Post('feedback/:id/handled')
  @HttpCode(200)
  @Requires('feedback:manage')
  handled(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.guests.handleFeedback(id, user);
  }

  @Post('feedback/:id/publish')
  @HttpCode(200)
  @Requires('feedback:manage')
  publish(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.guests.publishFeedback(id, user);
  }

  @Post('feedback/:id/unpublish')
  @HttpCode(200)
  @Requires('feedback:manage')
  unpublish(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.guests.unpublishFeedback(id, user);
  }

  @Get('reports/house')
  @Requires('reports:read')
  report(@Query(new ZodPipe(zReportQuery)) q: z.infer<typeof zReportQuery>) {
    return this.reports.house(q.from, q.to);
  }

  @Get('reports/finance')
  @Requires('reports:read')
  financeReport(@Query(new ZodPipe(zFinanceQuery)) q: z.infer<typeof zFinanceQuery>) {
    return this.finance.finance(q.from, q.to, q.compare);
  }

  @Post('owner/brief/send')
  @HttpCode(200)
  @Requires('settings:features')
  async sendBrief() {
    return { ok: true, sent: await this.finance.sendBrief() };
  }

  @Get('owner/brief/insights')
  @Requires('reports:read')
  briefInsights(@Query(new ZodPipe(zBriefQuery)) q: z.infer<typeof zBriefQuery>) {
    return this.finance.briefInsights(q.date);
  }
}

@Controller('v1/public')
export class PublicFeedbackController {
  constructor(
    private readonly guests: GuestsService,
    private readonly booking: BookingService,
  ) {}

  @Post('bookings/:code/feedback')
  @HttpCode(200)
  @Throttle({ default: { limit: 6, ttl: 60_000 } })
  submit(@Param('code') code: string, @Body(new ZodPipe(zFeedbackInput)) body: z.infer<typeof zFeedbackInput>) {
    if (!this.booking.verifyAccess(code, body.t)) throw notFound('Booking');
    return this.guests.submitFeedback(code, body);
  }
}

/** Close the day (night audit): the checks, the figures, the sign-off and its printed report. */
@Controller('v1/admin/day-close')
export class DayCloseController {
  constructor(private readonly days: DayCloseService) {}

  @Get()
  @Requires('day:close')
  get(@Query('date') date?: string) {
    return this.days.get(dateParam(date));
  }

  @Get('history')
  @Requires('day:close')
  history(@Query('days') days?: string) {
    return this.days.history(Number(days) || 14);
  }

  @Post()
  @Requires('day:close')
  close(@Body(new ZodPipe(zDayCloseInput)) body: z.infer<typeof zDayCloseInput>, @CurrentUser() user: AuthUser) {
    return this.days.close(body, user);
  }

  @Delete(':date')
  @Requires('day:close', 'records:delete')
  reopen(@Param('date') date: string, @CurrentUser() user: AuthUser) {
    return this.days.reopen(date, user);
  }

  @Get(':date/print')
  @Requires('day:close')
  async print(@Param('date') date: string, @Query('autoprint') autoprint: string | undefined, @Res() res: Response) {
    sendDocument(res, await this.days.print(date, { autoprint: autoprint === '1' }));
  }
}

/** Maintenance: anyone may report and follow a fault; managing it needs maintenance:manage (checked per action in the service). */
@Controller('v1/admin/maintenance')
export class MaintenanceController {
  constructor(private readonly upkeep: UpkeepService) {}

  @Get()
  @Requires('maintenance:report')
  list(@CurrentUser() user: AuthUser) {
    return this.upkeep.listWorkOrders(user);
  }

  @Get(':id')
  @Requires('maintenance:report')
  one(@Param('id', ParseUUIDPipe) id: string) {
    return this.upkeep.getWorkOrder(id);
  }

  @Post()
  @Requires('maintenance:report')
  create(@Body(new ZodPipe(zWorkOrderCreate)) body: z.infer<typeof zWorkOrderCreate>, @CurrentUser() user: AuthUser) {
    return this.upkeep.createWorkOrder(body, user);
  }

  @Patch(':id')
  @Requires('maintenance:report')
  patch(@Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(zWorkOrderPatch)) body: z.infer<typeof zWorkOrderPatch>, @CurrentUser() user: AuthUser) {
    return this.upkeep.patchWorkOrder(id, body, user);
  }

  @Post(':id/status')
  @Requires('maintenance:report')
  status(@Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(zWorkOrderStatus)) body: z.infer<typeof zWorkOrderStatus>, @CurrentUser() user: AuthUser) {
    return this.upkeep.setWorkOrderStatus(id, body, user);
  }

  @Post(':id/notes')
  @Requires('maintenance:report')
  note(@Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(zWorkOrderNote)) body: z.infer<typeof zWorkOrderNote>, @CurrentUser() user: AuthUser) {
    return this.upkeep.addWorkOrderNote(id, body.body, user);
  }

  @Post(':id/out-of-service')
  @Requires('maintenance:manage')
  outOfService(@Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(zWorkOrderOutOfService)) body: z.infer<typeof zWorkOrderOutOfService>, @CurrentUser() user: AuthUser) {
    return this.upkeep.outOfService(id, body, user);
  }

  @Delete(':id/out-of-service')
  @Requires('maintenance:manage')
  backInService(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.upkeep.backInService(id, user);
  }
}

@Controller('v1/admin/lost-found')
export class LostFoundController {
  constructor(private readonly upkeep: UpkeepService) {}

  @Get()
  @Requires('lostfound:manage')
  list() {
    return this.upkeep.listLost();
  }

  @Get('likely-owners')
  @Requires('lostfound:manage')
  likely(@Query('roomId', ParseUUIDPipe) roomId: string, @Query('date') date: string) {
    return this.upkeep.likelyOwners(roomId, date);
  }

  @Post()
  @Requires('lostfound:manage')
  create(@Body(new ZodPipe(zLostItemCreate)) body: z.infer<typeof zLostItemCreate>, @CurrentUser() user: AuthUser) {
    return this.upkeep.createLost(body, user);
  }

  @Patch(':id')
  @Requires('lostfound:manage')
  patch(@Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(zLostItemPatch)) body: z.infer<typeof zLostItemPatch>, @CurrentUser() user: AuthUser) {
    return this.upkeep.patchLost(id, body, user);
  }

  @Post(':id/return')
  @Requires('lostfound:manage')
  giveBack(@Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(zLostItemReturn)) body: z.infer<typeof zLostItemReturn>, @CurrentUser() user: AuthUser) {
    return this.upkeep.returnLost(id, body, user);
  }

  @Post(':id/dispose')
  @Requires('lostfound:manage')
  dispose(@Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(zLostItemDispose)) body: z.infer<typeof zLostItemDispose>, @CurrentUser() user: AuthUser) {
    return this.upkeep.disposeLost(id, body, user);
  }

  @Get(':id/tag')
  @Requires('lostfound:manage')
  async tag(@Param('id', ParseUUIDPipe) id: string, @Res() res: Response) {
    sendDocument(res, await this.upkeep.lostTag(id));
  }
}
