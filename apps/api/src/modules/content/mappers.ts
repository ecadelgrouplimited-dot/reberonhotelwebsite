import type {
  MediaRef, LText, LRich, RoomTypeCardDTO, FacilityDTO, FacilityDetails, ProgressDTO, DestinationCardDTO, FaqGroupDTO, AmenityDTO, SeoDTO,
} from '@reberon/contracts';
import type { MediaAsset, RoomType, Facility, ProgressUpdate, Destination, FaqGroup, FaqItem, Amenity } from '@reberon/db';
import { env } from '../../config.js';

export const lt = (v: unknown): LText => (v && typeof v === 'object' ? (v as LText) : {});
export const lr = (v: unknown): LRich | null => (v && typeof v === 'object' && Object.keys(v).length ? (v as LRich) : null);

export function mediaUrl(id: string, width = 1920) {
  return `${env.MEDIA_PUBLIC_URL}/i/${id}/${width}.webp`;
}

export function toMediaRef(m: MediaAsset): MediaRef {
  const doc = m.kind === 'DOCUMENT';
  return {
    id: m.id,
    kind: m.kind,
    url: doc ? `${env.MEDIA_PUBLIC_URL}/f/${m.id}/${encodeURIComponent(m.originalName)}` : mediaUrl(m.id),
    width: m.width,
    height: m.height,
    alt: lt(m.alt),
    caption: m.caption ? lt(m.caption) : null,
    credit: m.credit,
    isRendering: m.isRendering,
    lqip: m.lqip,
    dominantColor: m.dominantColor,
    focalX: m.focalX,
    focalY: m.focalY,
  };
}

/** Keep order, drop missing. */
export function pick(map: Map<string, MediaRef>, ids: string[]): MediaRef[] {
  return ids.map((id) => map.get(id)).filter((m): m is MediaRef => !!m);
}

export function toRoomCard(r: RoomType & { hero?: MediaAsset | null; _count?: { rooms: number } }): RoomTypeCardDTO {
  return {
    id: r.id,
    slug: r.slug,
    name: lt(r.name),
    tagline: lt(r.tagline),
    sleepsAdults: r.sleepsAdults,
    sleepsChildren: r.sleepsChildren,
    bedConfig: lt(r.bedConfig),
    sizeSqm: r.sizeSqm,
    view: r.view ? lt(r.view) : null,
    roomCount: r._count?.rooms ?? 0,
    fromPrice: { ugx: r.fromPriceUgx?.toString() ?? null, usd: r.fromPriceUsd?.toString() ?? null },
    hero: r.hero ? toMediaRef(r.hero) : null,
  };
}

export function toAmenity(a: Amenity): AmenityDTO {
  return { id: a.id, key: a.key, name: lt(a.name), icon: a.icon, category: a.category };
}

export function toFacility(f: Facility, media: Map<string, MediaRef>): FacilityDTO {
  return { id: f.id, slug: f.slug, name: lt(f.name), summary: lt(f.summary), body: lr(f.body), icon: f.icon, status: f.status, media: pick(media, f.mediaIds), details: (f.details as FacilityDetails | null) ?? null };
}

export function toProgress(p: ProgressUpdate, media: Map<string, MediaRef>): ProgressDTO {
  return {
    id: p.id,
    slug: p.slug,
    title: lt(p.title),
    body: lr(p.body),
    happenedOn: p.happenedOn.toISOString().slice(0, 10),
    milestone: p.milestone,
    percentComplete: p.percentComplete,
    media: pick(media, p.mediaIds),
  };
}

export function toDestinationCard(d: Destination & { hero?: MediaAsset | null }): DestinationCardDTO {
  return {
    id: d.id,
    slug: d.slug,
    kind: d.kind,
    name: lt(d.name),
    tagline: lt(d.tagline),
    distanceKm: d.distanceKm,
    driveMinutes: d.driveMinutes,
    hero: d.hero ? toMediaRef(d.hero) : null,
  };
}

export function toFaqGroup(g: FaqGroup & { items: FaqItem[] }): FaqGroupDTO {
  return {
    id: g.id,
    key: g.key,
    title: lt(g.title),
    items: g.items.filter((i) => i.isPublished).map((i) => ({ id: i.id, question: lt(i.question), answer: lr(i.answer) ?? {} })),
  };
}

export const toSeo = (v: unknown): SeoDTO => (v && typeof v === 'object' ? (v as SeoDTO) : {});
