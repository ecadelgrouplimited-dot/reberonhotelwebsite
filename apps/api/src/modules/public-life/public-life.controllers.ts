import { Body, Controller, Delete, Get, Headers, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query, Res, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import type { z } from 'zod';
import {
  CV_MAX_BYTES,
  zApplicationInput,
  zApplicationNoteInput,
  zApplicationRatingInput,
  zApplicationStatusInput,
  zEventInput,
  zJobInput,
  zRegistrationAdminInput,
  zRegistrationStatusInput,
  zRsvpInput,
} from '@reberon/contracts';
import { CurrentUser, Requires, type AuthUser } from '../../common/auth.js';
import { ZodPipe } from '../../common/zod.pipe.js';
import { RedisService } from '../../common/redis.service.js';
import { idempotent } from '../../common/idempotency.js';
import { badRequest } from '../../common/errors.js';
import { verifyTurnstile } from '../inbox/public.controller.js';
import { EventsService } from './events.service.js';
import { CareersService } from './careers.service.js';

/* ───────────────────────── public ───────────────────────── */

@Controller('v1/public/events')
export class PublicEventsController {
  constructor(
    private readonly events: EventsService,
    private readonly redis: RedisService,
  ) {}

  @Get()
  list() {
    return this.events.publicList();
  }

  /** Manage a booking from the link in the confirmation email. */
  @Get('rsvp/:token')
  manage(@Param('token') token: string) {
    return this.events.manageView(token);
  }

  @Post('rsvp/:token/cancel')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  cancel(@Param('token') token: string) {
    return this.events.cancelByToken(token);
  }

  @Get(':slug')
  one(@Param('slug') slug: string) {
    return this.events.publicDetail(slug);
  }

  @Get(':slug/calendar.ics')
  async ics(@Param('slug') slug: string, @Res() res: Response) {
    const f = await this.events.publicIcs(slug);
    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${f.filename}"`);
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.send(f.body);
  }

  @Post(':slug/rsvp')
  @HttpCode(201)
  @Throttle({ default: { limit: 6, ttl: 60_000 } })
  async rsvp(@Param('slug') slug: string, @Body(new ZodPipe(zRsvpInput)) body: z.infer<typeof zRsvpInput>, @Headers('idempotency-key') key?: string, @Headers('x-turnstile-token') turnstile?: string) {
    await verifyTurnstile(turnstile);
    return idempotent(this.redis, `rsvp:${slug}`, key, () => this.events.rsvp(slug, body));
  }
}

@Controller('v1/public/careers')
export class PublicCareersController {
  constructor(
    private readonly careers: CareersService,
    private readonly redis: RedisService,
  ) {}

  @Get()
  list() {
    return this.careers.publicList();
  }

  @Get(':slug')
  one(@Param('slug') slug: string) {
    return this.careers.publicDetail(slug);
  }

  /** `slug` = "open" for an open application not tied to a role. Multipart: fields + optional `cv`. */
  @Post(':slug/apply')
  @HttpCode(201)
  @Throttle({ default: { limit: 10, ttl: 10 * 60_000 } })
  @UseInterceptors(FileInterceptor('cv', { limits: { fileSize: CV_MAX_BYTES + 1, files: 1, fields: 20 } }))
  async apply(
    @Param('slug') slug: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body(new ZodPipe(zApplicationInput)) body: z.infer<typeof zApplicationInput>,
    @Headers('idempotency-key') key?: string,
    @Headers('x-turnstile-token') turnstile?: string,
  ) {
    await verifyTurnstile(turnstile);
    return idempotent(this.redis, `apply:${slug}`, key, () => this.careers.apply(slug === 'open' ? null : slug, body, file));
  }
}

/* ───────────────────────── House ───────────────────────── */

@Controller('v1/admin/events')
export class AdminEventsController {
  constructor(private readonly events: EventsService) {}

  @Get()
  @Requires('content:read')
  list() {
    return this.events.adminList();
  }

  @Get(':id')
  @Requires('content:read')
  one(@Param('id', ParseUUIDPipe) id: string) {
    return this.events.adminGet(id);
  }

  @Post()
  @Requires('content:write')
  create(@Body(new ZodPipe(zEventInput)) body: z.infer<typeof zEventInput>, @CurrentUser() user: AuthUser) {
    return this.events.create(body, user);
  }

  @Patch(':id')
  @Requires('content:write')
  update(@Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(zEventInput)) body: z.infer<typeof zEventInput>, @CurrentUser() user: AuthUser) {
    return this.events.update(id, body, user);
  }

  @Delete(':id')
  @HttpCode(204)
  @Requires('content:write', 'records:delete')
  async remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    await this.events.remove(id, user);
  }

  @Get(':id/registrations')
  @Requires('events:manage')
  registrations(@Param('id', ParseUUIDPipe) id: string) {
    return this.events.registrations(id);
  }

  @Post(':id/registrations')
  @Requires('events:manage')
  add(@Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(zRegistrationAdminInput)) body: z.infer<typeof zRegistrationAdminInput>, @Query('force') force: string | undefined, @CurrentUser() user: AuthUser) {
    return this.events.addRegistration(id, body, force === '1', user);
  }

  @Post('registrations/:regId/status')
  @HttpCode(200)
  @Requires('events:manage')
  status(@Param('regId', ParseUUIDPipe) regId: string, @Body(new ZodPipe(zRegistrationStatusInput)) body: z.infer<typeof zRegistrationStatusInput>, @CurrentUser() user: AuthUser) {
    return this.events.setRegistrationStatus(regId, body.status, user);
  }

  @Get(':id/registrations.csv')
  @Requires('events:manage')
  async csv(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser, @Res() res: Response) {
    const f = await this.events.csv(id, user);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${f.filename}"`);
    res.send(f.body);
  }
}

@Controller('v1/admin/careers')
export class AdminCareersController {
  constructor(private readonly careers: CareersService) {}

  @Get()
  @Requires('careers:manage')
  overview() {
    return this.careers.overview();
  }

  @Get('jobs/:id')
  @Requires('careers:manage')
  job(@Param('id', ParseUUIDPipe) id: string) {
    return this.careers.adminGetJob(id);
  }

  @Post('jobs')
  @Requires('careers:manage')
  createJob(@Body(new ZodPipe(zJobInput)) body: z.infer<typeof zJobInput>, @CurrentUser() user: AuthUser) {
    return this.careers.createJob(body, user);
  }

  @Patch('jobs/:id')
  @Requires('careers:manage')
  updateJob(@Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(zJobInput)) body: z.infer<typeof zJobInput>, @CurrentUser() user: AuthUser) {
    return this.careers.updateJob(id, body, user);
  }

  @Delete('jobs/:id')
  @HttpCode(204)
  @Requires('careers:manage', 'records:delete')
  async removeJob(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    await this.careers.removeJob(id, user);
  }

  @Get('applications/:id')
  @Requires('careers:manage')
  application(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.careers.getApplication(id, user);
  }

  @Post('applications/:id/status')
  @HttpCode(200)
  @Requires('careers:manage')
  status(@Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(zApplicationStatusInput)) body: z.infer<typeof zApplicationStatusInput>, @CurrentUser() user: AuthUser) {
    return this.careers.setStatus(id, body, user);
  }

  @Post('applications/:id/notes')
  @Requires('careers:manage')
  note(@Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(zApplicationNoteInput)) body: z.infer<typeof zApplicationNoteInput>, @CurrentUser() user: AuthUser) {
    return this.careers.addNote(id, body.body, user);
  }

  @Post('applications/:id/rating')
  @HttpCode(200)
  @Requires('careers:manage')
  rate(@Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(zApplicationRatingInput)) body: z.infer<typeof zApplicationRatingInput>, @CurrentUser() user: AuthUser) {
    return this.careers.rate(id, body.rating, user);
  }

  @Post('applications/:id/hired')
  @HttpCode(200)
  @Requires('careers:manage')
  hired(@Param('id', ParseUUIDPipe) id: string, @Body() body: { staffProfileId?: string }, @CurrentUser() user: AuthUser) {
    if (!body?.staffProfileId || !/^[0-9a-f-]{36}$/i.test(body.staffProfileId)) throw badRequest('Pick the staff profile');
    return this.careers.linkStaff(id, body.staffProfileId, user);
  }

  /** The CV, served privately: inline for preview (PDF) or as a download. */
  @Get('applications/:id/cv')
  @Requires('careers:manage')
  async cv(@Param('id', ParseUUIDPipe) id: string, @Query('download') download: string | undefined, @CurrentUser() user: AuthUser, @Res() res: Response) {
    const f = await this.careers.cv(id, user);
    res.setHeader('Content-Type', f.mime);
    res.setHeader('Content-Disposition', `${download === '1' || f.mime !== 'application/pdf' ? 'attachment' : 'inline'}; filename="${f.name.replace(/"/g, '')}"`);
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'self'; sandbox");
    res.send(f.body);
  }
}
