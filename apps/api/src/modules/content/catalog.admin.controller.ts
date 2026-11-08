import { Body, Controller, Delete, Get, HttpCode, Injectable, Param, Patch, Post, Put, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { z } from 'zod';
import {
  zRoomTypeInput, zAmenityInput, zFacilityInput, zDestinationInput, zProgressInput, zFaqGroupInput, zFaqItemInput,
  zRedirectInput, zNavigationInput, zReorderInput, type NavItemInput, NAV_MENUS, type NavMenuKey,
} from '@reberon/contracts';
import { slugify } from '@reberon/utils';
import { Prisma } from '@reberon/db';
import { PrismaService } from '../../common/prisma.service.js';
import { AuditService } from '../../common/audit.service.js';
import { CurrentUser, Requires, type AuthUser } from '../../common/auth.js';
import { ZodPipe } from '../../common/zod.pipe.js';
import { badRequest, notFound } from '../../common/errors.js';
import { Events } from '../../common/events.js';
import { ResolverService } from './resolver.service.js';
import { lt, pick, toMediaRef } from './mappers.js';

const partial = <T extends z.ZodObject>(s: T) => s.partial();

@Injectable()
export class ContentOps {
  constructor(
    private readonly audit: AuditService,
    private readonly events: EventEmitter2,
  ) {}
  async done(user: AuthUser, req: Request, action: string, entityType: string, entityId: string, summary: string, tags: string[], after?: unknown) {
    await this.audit.record({ actor: user, action, entityType, entityId, summary, after, req });
    await this.events.emitAsync(Events.ContentChanged, { tags });
  }
}

async function reorder(tx: PrismaService, model: 'roomType' | 'facility' | 'destination' | 'amenity' | 'faqItem', ids: string[]) {
  await tx.$transaction(ids.map((id, order) => (tx[model] as unknown as { update: (a: object) => Prisma.PrismaPromise<unknown> }).update({ where: { id }, data: { order } })));
}

/* ───────────── Room types & amenities ───────────── */

@Controller('v1/admin')
export class RoomsAdminController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly resolver: ResolverService,
    private readonly ops: ContentOps,
  ) {}

  @Get('room-types')
  @Requires('content:read')
  async list() {
    const rows = await this.prisma.roomType.findMany({
      where: { deletedAt: null },
      include: { hero: true, _count: { select: { rooms: true, waitlist: true } } },
      orderBy: { order: 'asc' },
    });
    return rows.map((r) => ({
      id: r.id, slug: r.slug, name: lt(r.name), tagline: lt(r.tagline), status: r.status, order: r.order,
      sleepsAdults: r.sleepsAdults, sleepsChildren: r.sleepsChildren, sizeSqm: r.sizeSqm,
      fromPriceUgx: r.fromPriceUgx?.toString() ?? null, fromPriceUsd: r.fromPriceUsd?.toString() ?? null,
      hero: r.hero ? toMediaRef(r.hero) : null, roomCount: r._count.rooms, waitlistCount: r._count.waitlist, updatedAt: r.updatedAt,
    }));
  }

  @Get('room-types/:id')
  @Requires('content:read')
  async get(@Param('id') id: string) {
    const r = await this.prisma.roomType.findFirst({ where: { id, deletedAt: null }, include: { amenities: { orderBy: { order: 'asc' } }, rooms: { orderBy: { number: 'asc' } } } });
    if (!r) throw notFound('Room type');
    const media = await this.resolver.mediaMap([...r.galleryIds, r.heroMediaId, r.floorPlanMediaId].filter(Boolean) as string[]);
    return {
      ...r,
      fromPriceUgx: r.fromPriceUgx?.toString() ?? null,
      fromPriceUsd: r.fromPriceUsd?.toString() ?? null,
      amenityIds: r.amenities.map((a) => a.amenityId),
      amenities: undefined,
      media: Object.fromEntries(media),
      gallery: pick(media, r.galleryIds),
    };
  }

  private data(body: Partial<z.infer<typeof zRoomTypeInput>>) {
    const { amenityIds: _a, ...rest } = body;
    return rest as Prisma.RoomTypeUncheckedUpdateInput;
  }

  @Post('room-types')
  @Requires('content:write')
  async create(@Body(new ZodPipe(zRoomTypeInput)) body: z.infer<typeof zRoomTypeInput>, @CurrentUser() user: AuthUser, @Req() req: Request) {
    const order = await this.prisma.roomType.count();
    const r = await this.prisma.roomType.create({
      data: {
        ...(this.data(body) as Prisma.RoomTypeUncheckedCreateInput),
        order,
        amenities: { create: body.amenityIds.map((amenityId, i) => ({ amenityId, order: i })) },
      },
    });
    await this.ops.done(user, req, 'room_type.create', 'RoomType', r.id, `Created ${r.slug}`, ['room-types']);
    return this.get(r.id);
  }

  @Patch('room-types/:id')
  @Requires('content:write')
  async update(@Param('id') id: string, @Body(new ZodPipe(partial(zRoomTypeInput))) body: Partial<z.infer<typeof zRoomTypeInput>>, @CurrentUser() user: AuthUser, @Req() req: Request) {
    const before = await this.prisma.roomType.findFirst({ where: { id, deletedAt: null } });
    if (!before) throw notFound('Room type');
    await this.prisma.$transaction(async (tx) => {
      await tx.roomType.update({ where: { id }, data: this.data(body) });
      if (body.amenityIds) {
        await tx.roomTypeAmenity.deleteMany({ where: { roomTypeId: id } });
        await tx.roomTypeAmenity.createMany({ data: body.amenityIds.map((amenityId, i) => ({ roomTypeId: id, amenityId, order: i })) });
      }
    });
    await this.ops.done(user, req, 'room_type.update', 'RoomType', id, `Updated ${body.slug ?? before.slug}`, ['room-types', `room-type:${before.slug}`], body);
    return this.get(id);
  }

  @Delete('room-types/:id')
  @HttpCode(204)
  @Requires('content:write')
  async remove(@Param('id') id: string, @CurrentUser() user: AuthUser, @Req() req: Request) {
    const r = await this.prisma.roomType.findFirst({ where: { id, deletedAt: null }, include: { _count: { select: { rooms: true } } } });
    if (!r) throw notFound('Room type');
    if (r._count.rooms) throw badRequest(`${r._count.rooms} physical rooms use this type. Hide it instead, or move the rooms first.`);
    await this.prisma.roomType.update({ where: { id }, data: { deletedAt: new Date(), status: 'HIDDEN', slug: `${r.slug}--deleted-${Date.now()}` } });
    await this.ops.done(user, req, 'room_type.delete', 'RoomType', id, `Deleted ${r.slug}`, ['room-types', `room-type:${r.slug}`]);
  }

  @Post('room-types/reorder')
  @Requires('content:write')
  async reorder(@Body(new ZodPipe(zReorderInput)) body: z.infer<typeof zReorderInput>, @CurrentUser() user: AuthUser, @Req() req: Request) {
    await reorder(this.prisma, 'roomType', body.ids);
    await this.ops.done(user, req, 'room_type.reorder', 'RoomType', body.ids[0]!, 'Reordered room types', ['room-types']);
    return { ok: true };
  }

  @Get('amenities')
  @Requires('content:read')
  async amenities() {
    const rows = await this.prisma.amenity.findMany({ orderBy: [{ category: 'asc' }, { order: 'asc' }], include: { _count: { select: { roomTypes: true } } } });
    return rows.map((a) => ({ ...a, usage: a._count.roomTypes, _count: undefined }));
  }

  @Post('amenities')
  @Requires('content:write')
  async createAmenity(@Body(new ZodPipe(zAmenityInput)) body: z.infer<typeof zAmenityInput>, @CurrentUser() user: AuthUser, @Req() req: Request) {
    const a = await this.prisma.amenity.create({ data: { ...body, order: await this.prisma.amenity.count() } });
    await this.ops.done(user, req, 'amenity.create', 'Amenity', a.id, `Created amenity ${a.key}`, ['room-types']);
    return a;
  }

  @Patch('amenities/:id')
  @Requires('content:write')
  async updateAmenity(@Param('id') id: string, @Body(new ZodPipe(partial(zAmenityInput))) body: Partial<z.infer<typeof zAmenityInput>>, @CurrentUser() user: AuthUser, @Req() req: Request) {
    const a = await this.prisma.amenity.update({ where: { id }, data: body });
    await this.ops.done(user, req, 'amenity.update', 'Amenity', id, `Updated amenity ${a.key}`, ['room-types']);
    return a;
  }

  @Delete('amenities/:id')
  @HttpCode(204)
  @Requires('content:write')
  async deleteAmenity(@Param('id') id: string, @CurrentUser() user: AuthUser, @Req() req: Request) {
    const a = await this.prisma.amenity.delete({ where: { id } });
    await this.ops.done(user, req, 'amenity.delete', 'Amenity', id, `Deleted amenity ${a.key}`, ['room-types']);
  }
}

/* ───────────── Facilities ───────────── */

@Controller('v1/admin/facilities')
export class FacilitiesAdminController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly resolver: ResolverService,
    private readonly ops: ContentOps,
  ) {}

  @Get()
  @Requires('content:read')
  async list() {
    const rows = await this.prisma.facility.findMany({ where: { deletedAt: null }, orderBy: { order: 'asc' } });
    const media = await this.resolver.mediaMap(rows.flatMap((f) => f.mediaIds));
    return rows.map((f) => ({ ...f, media: pick(media, f.mediaIds) }));
  }

  @Get(':id')
  @Requires('content:read')
  async get(@Param('id') id: string) {
    const f = await this.prisma.facility.findFirst({ where: { id, deletedAt: null } });
    if (!f) throw notFound('Facility');
    const media = await this.resolver.mediaMap(f.mediaIds);
    return { ...f, media: pick(media, f.mediaIds) };
  }

  @Post()
  @Requires('content:write')
  async create(@Body(new ZodPipe(zFacilityInput)) body: z.infer<typeof zFacilityInput>, @CurrentUser() user: AuthUser, @Req() req: Request) {
    const { details, ...rest } = body;
    const f = await this.prisma.facility.create({ data: { ...(rest as Prisma.FacilityCreateInput), details: details ?? Prisma.DbNull, order: await this.prisma.facility.count() } });
    await this.ops.done(user, req, 'facility.create', 'Facility', f.id, `Created ${f.slug}`, ['facilities']);
    return this.get(f.id);
  }

  @Patch(':id')
  @Requires('content:write')
  async update(@Param('id') id: string, @Body(new ZodPipe(partial(zFacilityInput))) body: Partial<z.infer<typeof zFacilityInput>>, @CurrentUser() user: AuthUser, @Req() req: Request) {
    const { details, ...rest } = body;
    const f = await this.prisma.facility.update({ where: { id }, data: { ...(rest as Prisma.FacilityUpdateInput), ...(details !== undefined ? { details: details ?? Prisma.DbNull } : {}) } });
    await this.ops.done(user, req, 'facility.update', 'Facility', id, `Updated ${f.slug}`, ['facilities'], body);
    return this.get(id);
  }

  @Delete(':id')
  @HttpCode(204)
  @Requires('content:write')
  async remove(@Param('id') id: string, @CurrentUser() user: AuthUser, @Req() req: Request) {
    const f = await this.prisma.facility.update({ where: { id }, data: { deletedAt: new Date(), slug: `deleted-${Date.now()}` } });
    await this.ops.done(user, req, 'facility.delete', 'Facility', id, `Deleted facility`, ['facilities'], { id: f.id });
  }

  @Post('reorder')
  @Requires('content:write')
  async reorder(@Body(new ZodPipe(zReorderInput)) body: z.infer<typeof zReorderInput>, @CurrentUser() user: AuthUser, @Req() req: Request) {
    await reorder(this.prisma, 'facility', body.ids);
    await this.ops.done(user, req, 'facility.reorder', 'Facility', body.ids[0]!, 'Reordered facilities', ['facilities']);
    return { ok: true };
  }
}

/* ───────────── Destinations ───────────── */

@Controller('v1/admin/destinations')
export class DestinationsAdminController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly resolver: ResolverService,
    private readonly ops: ContentOps,
  ) {}

  @Get()
  @Requires('content:read')
  async list() {
    const rows = await this.prisma.destination.findMany({ where: { deletedAt: null }, include: { hero: true, _count: { select: { stops: true } } }, orderBy: { order: 'asc' } });
    return rows.map((d) => ({ id: d.id, slug: d.slug, kind: d.kind, name: lt(d.name), tagline: lt(d.tagline), status: d.status, hero: d.hero ? toMediaRef(d.hero) : null, stops: d._count.stops, updatedAt: d.updatedAt }));
  }

  @Get(':id')
  @Requires('content:read')
  async get(@Param('id') id: string) {
    const d = await this.prisma.destination.findFirst({ where: { id, deletedAt: null }, include: { stops: { orderBy: { order: 'asc' } } } });
    if (!d) throw notFound('Destination');
    const media = await this.resolver.mediaMap([...d.galleryIds, d.heroMediaId].filter(Boolean) as string[]);
    return { ...d, media: Object.fromEntries(media) };
  }

  private async write(id: string | null, body: Partial<z.infer<typeof zDestinationInput>>) {
    const { stops, blocks, ...rest } = body;
    return this.prisma.$transaction(async (tx) => {
      const data = { ...rest, ...(blocks ? { blocks: blocks as object[] } : {}) } as Prisma.DestinationUncheckedCreateInput;
      const d = id
        ? await tx.destination.update({ where: { id }, data })
        : await tx.destination.create({ data: { ...data, order: await tx.destination.count() } });
      if (stops) {
        await tx.routeStop.deleteMany({ where: { destinationId: d.id } });
        await tx.routeStop.createMany({
          data: stops.map((s, order) => ({ destinationId: d.id, order, name: s.name, note: s.note ?? undefined, minutesFromPrev: s.minutesFromPrev, altitude: s.altitude, lat: s.lat, lng: s.lng })),
        });
      }
      return d;
    });
  }

  @Post()
  @Requires('content:write')
  async create(@Body(new ZodPipe(zDestinationInput)) body: z.infer<typeof zDestinationInput>, @CurrentUser() user: AuthUser, @Req() req: Request) {
    const d = await this.write(null, body);
    await this.ops.done(user, req, 'destination.create', 'Destination', d.id, `Created ${d.slug}`, ['destinations']);
    return this.get(d.id);
  }

  @Patch(':id')
  @Requires('content:write')
  async update(@Param('id') id: string, @Body(new ZodPipe(partial(zDestinationInput))) body: Partial<z.infer<typeof zDestinationInput>>, @CurrentUser() user: AuthUser, @Req() req: Request) {
    const before = await this.prisma.destination.findFirst({ where: { id, deletedAt: null } });
    if (!before) throw notFound('Destination');
    const d = await this.write(id, body);
    await this.ops.done(user, req, 'destination.update', 'Destination', id, `Updated ${d.slug}`, ['destinations', `destination:${before.slug}`]);
    return this.get(id);
  }

  @Delete(':id')
  @HttpCode(204)
  @Requires('content:write')
  async remove(@Param('id') id: string, @CurrentUser() user: AuthUser, @Req() req: Request) {
    const d = await this.prisma.destination.findFirst({ where: { id, deletedAt: null } });
    if (!d) throw notFound('Destination');
    await this.prisma.destination.update({ where: { id }, data: { deletedAt: new Date(), status: 'HIDDEN', slug: `${d.slug}--deleted-${Date.now()}` } });
    await this.ops.done(user, req, 'destination.delete', 'Destination', id, `Deleted ${d.slug}`, ['destinations', `destination:${d.slug}`]);
  }

  @Post('reorder')
  @Requires('content:write')
  async reorder(@Body(new ZodPipe(zReorderInput)) body: z.infer<typeof zReorderInput>, @CurrentUser() user: AuthUser, @Req() req: Request) {
    await reorder(this.prisma, 'destination', body.ids);
    await this.ops.done(user, req, 'destination.reorder', 'Destination', body.ids[0]!, 'Reordered destinations', ['destinations']);
    return { ok: true };
  }
}

/* ───────────── Progress ("Watch the hotel rise") ───────────── */

@Controller('v1/admin/progress')
export class ProgressAdminController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly resolver: ResolverService,
    private readonly ops: ContentOps,
  ) {}

  @Get()
  @Requires('content:read')
  async list() {
    const rows = await this.prisma.progressUpdate.findMany({ where: { deletedAt: null }, orderBy: { happenedOn: 'desc' } });
    const media = await this.resolver.mediaMap(rows.flatMap((p) => p.mediaIds.slice(0, 1)));
    return rows.map((p) => ({ ...p, happenedOn: p.happenedOn.toISOString().slice(0, 10), cover: media.get(p.mediaIds[0] ?? '') ?? null }));
  }

  @Get(':id')
  @Requires('content:read')
  async get(@Param('id') id: string) {
    const p = await this.prisma.progressUpdate.findFirst({ where: { id, deletedAt: null } });
    if (!p) throw notFound('Update');
    const media = await this.resolver.mediaMap(p.mediaIds);
    return { ...p, happenedOn: p.happenedOn.toISOString().slice(0, 10), media: pick(media, p.mediaIds) };
  }

  private data(body: Partial<z.infer<typeof zProgressInput>>) {
    return { ...body, ...(body.happenedOn ? { happenedOn: new Date(`${body.happenedOn}T00:00:00Z`) } : {}) } as Prisma.ProgressUpdateUncheckedCreateInput;
  }

  @Post()
  @Requires('content:write')
  async create(@Body(new ZodPipe(zProgressInput)) body: z.infer<typeof zProgressInput>, @CurrentUser() user: AuthUser, @Req() req: Request) {
    let slug = body.slug ?? slugify(body.title.en ?? Object.values(body.title)[0] ?? 'update');
    if (await this.prisma.progressUpdate.findUnique({ where: { slug } })) slug = `${slug}-${body.happenedOn}`;
    const p = await this.prisma.progressUpdate.create({ data: { ...this.data(body), slug } });
    await this.ops.done(user, req, 'progress.create', 'ProgressUpdate', p.id, `Posted "${slug}"`, ['progress']);
    return this.get(p.id);
  }

  @Patch(':id')
  @Requires('content:write')
  async update(@Param('id') id: string, @Body(new ZodPipe(partial(zProgressInput))) body: Partial<z.infer<typeof zProgressInput>>, @CurrentUser() user: AuthUser, @Req() req: Request) {
    const p = await this.prisma.progressUpdate.update({ where: { id }, data: this.data(body) });
    await this.ops.done(user, req, 'progress.update', 'ProgressUpdate', id, `Updated "${p.slug}"`, ['progress']);
    return this.get(id);
  }

  @Delete(':id')
  @HttpCode(204)
  @Requires('content:write')
  async remove(@Param('id') id: string, @CurrentUser() user: AuthUser, @Req() req: Request) {
    const p = await this.prisma.progressUpdate.findFirst({ where: { id, deletedAt: null } });
    if (!p) throw notFound('Update');
    await this.prisma.progressUpdate.update({ where: { id }, data: { deletedAt: new Date(), slug: `${p.slug}--deleted-${Date.now()}` } });
    await this.ops.done(user, req, 'progress.delete', 'ProgressUpdate', id, `Deleted "${p.slug}"`, ['progress']);
  }
}

/* ───────────── FAQs ───────────── */

@Controller('v1/admin')
export class FaqAdminController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ops: ContentOps,
  ) {}

  @Get('faq-groups')
  @Requires('content:read')
  groups() {
    return this.prisma.faqGroup.findMany({ include: { items: { orderBy: { order: 'asc' } } }, orderBy: { createdAt: 'asc' } });
  }

  @Post('faq-groups')
  @Requires('content:write')
  async createGroup(@Body(new ZodPipe(zFaqGroupInput)) body: z.infer<typeof zFaqGroupInput>, @CurrentUser() user: AuthUser, @Req() req: Request) {
    const g = await this.prisma.faqGroup.create({ data: body });
    await this.ops.done(user, req, 'faq_group.create', 'FaqGroup', g.id, `Created FAQ group ${g.key}`, ['faqs']);
    return g;
  }

  @Patch('faq-groups/:id')
  @Requires('content:write')
  async updateGroup(@Param('id') id: string, @Body(new ZodPipe(partial(zFaqGroupInput))) body: Partial<z.infer<typeof zFaqGroupInput>>, @CurrentUser() user: AuthUser, @Req() req: Request) {
    const g = await this.prisma.faqGroup.update({ where: { id }, data: body });
    await this.ops.done(user, req, 'faq_group.update', 'FaqGroup', id, `Updated FAQ group ${g.key}`, ['faqs']);
    return g;
  }

  @Delete('faq-groups/:id')
  @HttpCode(204)
  @Requires('content:write')
  async deleteGroup(@Param('id') id: string, @CurrentUser() user: AuthUser, @Req() req: Request) {
    const g = await this.prisma.faqGroup.delete({ where: { id } });
    await this.ops.done(user, req, 'faq_group.delete', 'FaqGroup', id, `Deleted FAQ group ${g.key}`, ['faqs']);
  }

  @Post('faq-items')
  @Requires('content:write')
  async createItem(@Body(new ZodPipe(zFaqItemInput)) body: z.infer<typeof zFaqItemInput>, @CurrentUser() user: AuthUser, @Req() req: Request) {
    const order = await this.prisma.faqItem.count({ where: { groupId: body.groupId } });
    const i = await this.prisma.faqItem.create({ data: { ...body, order } });
    await this.ops.done(user, req, 'faq_item.create', 'FaqItem', i.id, 'Added a question', ['faqs']);
    return i;
  }

  @Patch('faq-items/:id')
  @Requires('content:write')
  async updateItem(@Param('id') id: string, @Body(new ZodPipe(partial(zFaqItemInput))) body: Partial<z.infer<typeof zFaqItemInput>>, @CurrentUser() user: AuthUser, @Req() req: Request) {
    const i = await this.prisma.faqItem.update({ where: { id }, data: body });
    await this.ops.done(user, req, 'faq_item.update', 'FaqItem', id, 'Edited a question', ['faqs']);
    return i;
  }

  @Delete('faq-items/:id')
  @HttpCode(204)
  @Requires('content:write')
  async deleteItem(@Param('id') id: string, @CurrentUser() user: AuthUser, @Req() req: Request) {
    await this.prisma.faqItem.delete({ where: { id } });
    await this.ops.done(user, req, 'faq_item.delete', 'FaqItem', id, 'Deleted a question', ['faqs']);
  }

  @Post('faq-items/reorder')
  @Requires('content:write')
  async reorderItems(@Body(new ZodPipe(zReorderInput)) body: z.infer<typeof zReorderInput>, @CurrentUser() user: AuthUser, @Req() req: Request) {
    await reorder(this.prisma, 'faqItem', body.ids);
    await this.ops.done(user, req, 'faq_item.reorder', 'FaqItem', body.ids[0]!, 'Reordered questions', ['faqs']);
    return { ok: true };
  }
}

/* ───────────── Redirects & navigation ───────────── */

@Controller('v1/admin')
export class SiteStructureAdminController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ops: ContentOps,
  ) {}

  @Get('redirects')
  @Requires('content:read')
  redirects() {
    return this.prisma.redirect.findMany({ orderBy: { createdAt: 'desc' } });
  }

  @Post('redirects')
  @Requires('content:write')
  async createRedirect(@Body(new ZodPipe(zRedirectInput)) body: z.infer<typeof zRedirectInput>, @CurrentUser() user: AuthUser, @Req() req: Request) {
    if (body.fromPath === body.toPath) throw badRequest('A redirect cannot point to itself');
    const r = await this.prisma.redirect.create({ data: body });
    await this.ops.done(user, req, 'redirect.create', 'Redirect', r.id, `${r.fromPath} → ${r.toPath}`, ['redirects']);
    return r;
  }

  @Delete('redirects/:id')
  @HttpCode(204)
  @Requires('content:write')
  async deleteRedirect(@Param('id') id: string, @CurrentUser() user: AuthUser, @Req() req: Request) {
    const r = await this.prisma.redirect.delete({ where: { id } });
    await this.ops.done(user, req, 'redirect.delete', 'Redirect', id, `Removed ${r.fromPath}`, ['redirects']);
  }

  @Get('navigation')
  @Requires('content:read')
  async navigation(@Query('menu') menu?: NavMenuKey) {
    const rows = await this.prisma.navigationItem.findMany({ where: menu ? { menu } : {}, orderBy: { order: 'asc' } });
    const tree = (m: NavMenuKey, parentId: string | null): unknown[] =>
      rows.filter((r) => r.menu === m && r.parentId === parentId).map((r) => ({ ...r, children: tree(m, r.id) }));
    return Object.fromEntries(NAV_MENUS.map((m) => [m, tree(m, null)]));
  }

  @Put('navigation/:menu')
  @Requires('content:write')
  async saveNavigation(@Param('menu') menu: NavMenuKey, @Body(new ZodPipe(zNavigationInput)) body: z.infer<typeof zNavigationInput>, @CurrentUser() user: AuthUser, @Req() req: Request) {
    if (!NAV_MENUS.includes(menu)) throw notFound('Menu');
    await this.prisma.$transaction(async (tx) => {
      await tx.navigationItem.deleteMany({ where: { menu } });
      const insert = async (items: NavItemInput[], parentId: string | null) => {
        for (const [order, it] of items.entries()) {
          const row = await tx.navigationItem.create({
            data: { menu, parentId, order, label: it.label, target: it.target, targetId: it.targetId ?? null, url: it.url ?? null, isVisible: it.isVisible ?? true },
          });
          if (it.children?.length) await insert(it.children, row.id);
        }
      };
      await insert(body.items, null);
    });
    await this.ops.done(user, req, 'navigation.update', 'Navigation', menu, `Saved ${menu.toLowerCase()} menu`, ['nav', 'site']);
    return this.navigation(menu);
  }
}
