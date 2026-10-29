import { Controller, Get, Headers, Param, Query } from '@nestjs/common';
import type { DestinationDetailDTO, FacilityDetailDTO, PageDTO, Paginated, ProgressDTO, RoomTypeDetailDTO, Block } from '@reberon/contracts';
import { PrismaService } from '../../common/prisma.service.js';
import { CacheService } from '../../common/cache.service.js';
import { notFound } from '../../common/errors.js';
import { ResolverService } from './resolver.service.js';
import { ToursService } from './tours.service.js';
import { SettingsService } from './settings.service.js';
import { verifyPreviewToken } from './preview.js';
import { lt, lr, pick, toAmenity, toDestinationCard, toFacility, toFaqGroup, toMediaRef, toProgress, toRoomCard, toSeo } from './mappers.js';

const TTL = 300;
const roomInclude = { hero: true, _count: { select: { rooms: { where: { isActive: true } } } } } as const;

@Controller('v1/public')
export class PublicContentController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
    private readonly resolver: ResolverService,
    private readonly settings: SettingsService,
    private readonly tours: ToursService,
  ) {}

  @Get('site')
  site() {
    return this.cache.wrap('site', ['site', 'nav'], TTL, () => this.settings.site());
  }

  @Get('pages')
  async pageIndex() {
    return this.cache.wrap('pages:index', ['pages'], TTL, async () => {
      const [pages, rooms, dests, progress, facilities] = await Promise.all([
        this.prisma.page.findMany({ where: { status: 'PUBLISHED', deletedAt: null, kind: { not: 'SYSTEM' } }, select: { slug: true, updatedAt: true, draftSeo: true } }),
        this.prisma.roomType.findMany({ where: { status: 'PUBLISHED', deletedAt: null }, select: { slug: true, updatedAt: true } }),
        this.prisma.destination.findMany({ where: { status: 'PUBLISHED', deletedAt: null }, select: { slug: true, updatedAt: true } }),
        this.prisma.progressUpdate.findMany({ where: { status: 'PUBLISHED', deletedAt: null }, select: { slug: true, updatedAt: true } }),
        this.prisma.facility.findMany({ where: { status: { not: 'HIDDEN' }, deletedAt: null }, select: { slug: true, updatedAt: true } }),
      ]);
      return [
        ...pages.filter((p) => !toSeo(p.draftSeo).noindex).map((p) => ({ path: `/${p.slug}`, updatedAt: p.updatedAt })),
        ...rooms.map((r) => ({ path: `/rooms/${r.slug}`, updatedAt: r.updatedAt })),
        ...dests.map((d) => ({ path: `/kapchorwa/${d.slug}`, updatedAt: d.updatedAt })),
        ...progress.map((p) => ({ path: `/rising/${p.slug}`, updatedAt: p.updatedAt })),
        ...facilities.map((f) => ({ path: `/facilities/${f.slug}`, updatedAt: f.updatedAt })),
      ];
    });
  }

  /** Page by slug ("" = home; may contain slashes). Drafts with a valid preview token. */
  @Get('page')
  async page(@Query('slug') rawSlug = '', @Headers('x-preview-token') previewToken?: string): Promise<PageDTO> {
    const slug = rawSlug.replace(/^\/+|\/+$/g, '');
    const preview = verifyPreviewToken(previewToken);
    if (preview) return this.buildPage(slug, true);
    return this.cache.wrap(`page:${slug}`, [`page:${slug}`, 'pages', 'room-types', 'facilities', 'destinations', 'progress', 'faqs', 'media'], TTL, () => this.buildPage(slug, false));
  }

  private async buildPage(slug: string, preview: boolean): Promise<PageDTO> {
    const page = await this.prisma.page.findFirst({ where: { slug, deletedAt: null }, include: { publishedVersion: true } });
    if (!page) throw notFound('Page');
    if (!preview && (page.status !== 'PUBLISHED' || !page.publishedVersion)) throw notFound('Page');
    const src = preview
      ? { title: page.title, blocks: page.draftBlocks, seo: page.draftSeo, at: page.updatedAt }
      : { title: page.publishedVersion!.title, blocks: page.publishedVersion!.blocks, seo: page.publishedVersion!.seo, at: page.publishedVersion!.publishedAt };
    const { blocks, media } = await this.resolver.resolve(src.blocks as Block[]);
    const seo = toSeo(src.seo);
    if (seo.shareImageId && !media[seo.shareImageId]) Object.assign(media, Object.fromEntries(await this.resolver.mediaMap([seo.shareImageId])));
    return { id: page.id, slug: page.slug, kind: page.kind, title: lt(src.title), seo, blocks, media, publishedAt: src.at.toISOString(), isPreview: preview || undefined };
  }

  @Get('room-types')
  roomTypes() {
    return this.cache.wrap('room-types', ['room-types', 'media'], TTL, async () => {
      const rows = await this.prisma.roomType.findMany({ where: { status: 'PUBLISHED', deletedAt: null }, include: roomInclude, orderBy: { order: 'asc' } });
      return rows.map(toRoomCard);
    });
  }

  @Get('room-types/:slug')
  roomType(@Param('slug') slug: string): Promise<RoomTypeDetailDTO> {
    return this.cache.wrap(`room-type:${slug}`, [`room-type:${slug}`, 'room-types', 'media', 'tours', 'site'], TTL, async () => {
      const r = await this.prisma.roomType.findFirst({
        where: { slug, status: 'PUBLISHED', deletedAt: null },
        include: { ...roomInclude, floorPlan: true, amenities: { include: { amenity: true }, orderBy: { order: 'asc' } } },
      });
      if (!r) throw notFound('Room type');
      const [media, related] = await Promise.all([
        this.resolver.mediaMap(r.galleryIds),
        this.prisma.roomType.findMany({ where: { status: 'PUBLISHED', deletedAt: null, id: { not: r.id } }, include: roomInclude, orderBy: { order: 'asc' }, take: 3 }),
      ]);
      return {
        ...toRoomCard(r),
        description: lr(r.description),
        gallery: pick(media, r.galleryIds),
        floorPlan: r.floorPlan ? toMediaRef(r.floorPlan) : null,
        amenities: r.amenities.map((a) => toAmenity(a.amenity)),
        seo: toSeo(r.seo),
        related: related.map(toRoomCard),
        tour: await this.tours.forRoomType(r.id),
      };
    });
  }

  @Get('facilities')
  facilities() {
    return this.cache.wrap('facilities', ['facilities', 'media'], TTL, async () => {
      const rows = await this.prisma.facility.findMany({ where: { status: { not: 'HIDDEN' }, deletedAt: null }, orderBy: { order: 'asc' } });
      const media = await this.resolver.mediaMap(rows.flatMap((f) => f.mediaIds));
      return rows.map((f) => toFacility(f, media));
    });
  }

  @Get('facilities/:slug')
  async facility(@Param('slug') slug: string): Promise<FacilityDetailDTO> {
    return this.cache.wrap(`facility:${slug}`, [`facility:${slug}`, 'facilities', 'media'], TTL, async () => {
      const f = await this.prisma.facility.findFirst({ where: { slug, status: { not: 'HIDDEN' }, deletedAt: null } });
      if (!f) throw notFound('Facility');
      const relatedRows = await this.prisma.facility.findMany({
        where: { slug: { not: slug }, status: { not: 'HIDDEN' }, deletedAt: null },
        orderBy: { order: 'asc' },
        take: 3,
      });
      const allMediaIds = [...f.mediaIds, ...relatedRows.flatMap((r) => r.mediaIds)];
      const media = await this.resolver.mediaMap(allMediaIds);
      return {
        ...toFacility(f, media),
        related: relatedRows.map((r) => toFacility(r, media)),
      };
    });
  }

  @Get('destinations')
  destinations() {
    return this.cache.wrap('destinations', ['destinations', 'media'], TTL, async () => {
      const rows = await this.prisma.destination.findMany({ where: { status: 'PUBLISHED', deletedAt: null }, include: { hero: true }, orderBy: { order: 'asc' } });
      return rows.map(toDestinationCard);
    });
  }

  @Get('destinations/:slug')
  destination(@Param('slug') slug: string): Promise<DestinationDetailDTO> {
    return this.cache.wrap(`destination:${slug}`, [`destination:${slug}`, 'destinations', 'media', 'faqs', 'room-types', 'progress'], TTL, async () => {
      const d = await this.prisma.destination.findFirst({ where: { slug, status: 'PUBLISHED', deletedAt: null }, include: { hero: true, stops: { orderBy: { order: 'asc' } } } });
      if (!d) throw notFound('Destination');
      const [gallery, resolved, others] = await Promise.all([
        this.resolver.mediaMap(d.galleryIds),
        this.resolver.resolve(d.blocks as Block[]),
        this.prisma.destination.findMany({ where: { status: 'PUBLISHED', deletedAt: null, id: { not: d.id } }, include: { hero: true }, orderBy: { order: 'asc' } }),
      ]);
      return {
        ...toDestinationCard(d),
        body: lr(d.body),
        blocks: resolved.blocks,
        media: resolved.media,
        gallery: pick(gallery, d.galleryIds),
        lat: d.lat,
        lng: d.lng,
        stops: d.stops.map((s) => ({ id: s.id, name: lt(s.name), note: s.note ? lt(s.note) : null, minutesFromPrev: s.minutesFromPrev, altitude: s.altitude, lat: s.lat, lng: s.lng })),
        seo: toSeo(d.seo),
        others: others.map(toDestinationCard),
      };
    });
  }

  @Get('progress')
  progress(@Query('cursor') cursor?: string, @Query('limit') limitRaw?: string): Promise<Paginated<ProgressDTO> & { percent: number | null }> {
    const offset = Math.max(0, Number(cursor) || 0);
    const limit = Math.min(50, Math.max(1, Number(limitRaw) || 10));
    return this.cache.wrap(`progress:${offset}:${limit}`, ['progress', 'media'], TTL, async () => {
      const where = { status: 'PUBLISHED' as const, deletedAt: null };
      const [rows, total, latest] = await Promise.all([
        this.prisma.progressUpdate.findMany({ where, orderBy: { happenedOn: 'desc' }, skip: offset, take: limit }),
        this.prisma.progressUpdate.count({ where }),
        this.prisma.progressUpdate.findFirst({ where: { ...where, percentComplete: { not: null } }, orderBy: { happenedOn: 'desc' } }),
      ]);
      const media = await this.resolver.mediaMap(rows.flatMap((p) => p.mediaIds));
      return { data: rows.map((p) => toProgress(p, media)), nextCursor: offset + limit < total ? String(offset + limit) : null, total, percent: latest?.percentComplete ?? null };
    });
  }

  @Get('progress/:slug')
  progressOne(@Param('slug') slug: string) {
    return this.cache.wrap(`progress:one:${slug}`, ['progress', 'media'], TTL, async () => {
      const p = await this.prisma.progressUpdate.findFirst({ where: { slug, status: 'PUBLISHED', deletedAt: null } });
      if (!p) throw notFound('Update');
      const [media, newer, older] = await Promise.all([
        this.resolver.mediaMap(p.mediaIds),
        this.prisma.progressUpdate.findFirst({ where: { status: 'PUBLISHED', deletedAt: null, happenedOn: { gt: p.happenedOn } }, orderBy: { happenedOn: 'asc' }, select: { slug: true, title: true } }),
        this.prisma.progressUpdate.findFirst({ where: { status: 'PUBLISHED', deletedAt: null, happenedOn: { lt: p.happenedOn } }, orderBy: { happenedOn: 'desc' }, select: { slug: true, title: true } }),
      ]);
      return { ...toProgress(p, media), newer: newer && { slug: newer.slug, title: lt(newer.title) }, older: older && { slug: older.slug, title: lt(older.title) } };
    });
  }

  @Get('faqs/:key')
  faq(@Param('key') key: string) {
    return this.cache.wrap(`faq:${key}`, ['faqs'], TTL, async () => {
      const g = await this.prisma.faqGroup.findUnique({ where: { key }, include: { items: { orderBy: { order: 'asc' } } } });
      if (!g) throw notFound('FAQ group');
      return toFaqGroup(g);
    });
  }

  @Get('redirects')
  redirects() {
    return this.cache.wrap('redirects', ['redirects'], TTL, () => this.prisma.redirect.findMany({ select: { fromPath: true, toPath: true, statusCode: true } }));
  }
}
