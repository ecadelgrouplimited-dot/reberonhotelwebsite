import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { z } from 'zod';
import {
  zAssignRoomsInput, zCheckInInput, zCheckOutInput, zFeedbackInput, zFolioChargeInput, zGuestMergeInput, zGuestPatch, zHkStatusInput, zHkTaskPatch,
  zMoveRoomInput, zNoShowInput, zReportQuery, zRoomBlockInput,
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
}

@Controller('v1/admin')
export class RoomsHouseController {
  constructor(private readonly rack: RackService) {}

  @Get('rack')
  @Requires('rooms:status')
  rackView(@Query('date') date?: string) {
    return this.rack.rack(dateParam(date));
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

  @Patch('housekeeping/tasks/:id')
  @Requires('rooms:status')
  patchTask(@Param('id') id: string, @Body(new ZodPipe(zHkTaskPatch)) body: z.infer<typeof zHkTaskPatch>, @CurrentUser() user: AuthUser) {
    return this.rack.patchTask(id, body, user);
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
