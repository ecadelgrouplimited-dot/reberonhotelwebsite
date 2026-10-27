import { Injectable } from '@nestjs/common';
import type { NavItemDTO, NavMenuKey, SiteDTO } from '@reberon/contracts';
import { NAV_MENUS } from '@reberon/contracts';
import type { NavigationItem } from '@reberon/db';
import { PrismaService } from '../../common/prisma.service.js';
import { ResolverService } from './resolver.service.js';
import { lt } from './mappers.js';

@Injectable()
export class SettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly resolver: ResolverService,
  ) {}

  async all(): Promise<Record<string, unknown>> {
    const rows = await this.prisma.setting.findMany();
    return Object.fromEntries(rows.map((r) => [r.key, r.value]));
  }

  async navigation(): Promise<Record<NavMenuKey, NavItemDTO[]>> {
    const items = await this.prisma.navigationItem.findMany({ where: { isVisible: true }, orderBy: { order: 'asc' } });
    const [pages, rooms, dests] = await Promise.all([
      this.prisma.page.findMany({ where: { id: { in: ids(items, 'PAGE') } }, select: { id: true, slug: true } }),
      this.prisma.roomType.findMany({ where: { id: { in: ids(items, 'ROOM_TYPE') } }, select: { id: true, slug: true } }),
      this.prisma.destination.findMany({ where: { id: { in: ids(items, 'DESTINATION') } }, select: { id: true, slug: true } }),
    ]);
    const hrefFor = (i: NavigationItem) => {
      if (i.target === 'URL') return i.url ?? '/';
      if (i.target === 'PAGE') return `/${pages.find((p) => p.id === i.targetId)?.slug ?? ''}`;
      if (i.target === 'ROOM_TYPE') return `/rooms/${rooms.find((p) => p.id === i.targetId)?.slug ?? ''}`;
      return `/kapchorwa/${dests.find((p) => p.id === i.targetId)?.slug ?? ''}`;
    };
    const build = (parentId: string | null, menu: NavMenuKey): NavItemDTO[] =>
      items
        .filter((i) => i.menu === menu && i.parentId === parentId)
        .map((i) => ({ id: i.id, label: lt(i.label), href: hrefFor(i), children: build(i.id, menu) }));
    return Object.fromEntries(NAV_MENUS.map((m) => [m, build(null, m)])) as Record<NavMenuKey, NavItemDTO[]>;
  }

  async site(): Promise<SiteDTO> {
    const s = await this.all();
    const get = <T>(k: string, fallback: T) => (s[k] ?? fallback) as T;
    const media = await this.resolver.mediaMap([get<string | null>('hotel.logoId', null), get<string | null>('seo.shareImageId', null)].filter(Boolean) as string[]);
    return {
      name: get('hotel.name', 'Reberon Hotel'),
      tagline: lt(s['hotel.tagline']),
      logo: media.get(get('hotel.logoId', '')) ?? null,
      contact: {
        phones: get<string[]>('contact.phones', []),
        whatsapp: get<string | null>('contact.whatsapp', null),
        email: get<string | null>('contact.email', null),
        address: lt(s['contact.address']),
        geo: get<{ lat: number; lng: number } | null>('contact.geo', null),
        hours: lt(s['contact.hours']),
        responsePromise: lt(s['contact.responsePromise']),
      },
      social: Object.fromEntries(Object.entries(get<Record<string, string>>('social', {})).filter(([, v]) => !!v)),
      currencies: get('hotel.currencies', ['UGX']),
      defaultCurrency: get('hotel.defaultCurrency', 'UGX'),
      checkInTime: get('hotel.checkInTime', '14:00'),
      checkOutTime: get('hotel.checkOutTime', '10:30'),
      openingLabel: lt(s['hotel.openingLabel']),
      features: {
        bookingEnabled: get('features.bookingEnabled', false),
        waitlistEnabled: get('features.waitlistEnabled', true),
        progressEnabled: get('features.progressEnabled', true),
        toursEnabled: get('features.toursEnabled', false),
        maintenanceMode: get('features.maintenanceMode', true),
      },
      seo: {
        titleTemplate: get('seo.titleTemplate', '%s · Reberon Hotel'),
        defaultTitle: get('seo.defaultTitle', 'Reberon Hotel'),
        defaultDescription: lt(s['seo.defaultDescription']),
        shareImage: media.get(get('seo.shareImageId', '')) ?? null,
      },
      footerNote: lt(s['hotel.footerNote']),
      nav: await this.navigation(),
    };
  }
}

function ids(items: NavigationItem[], target: NavigationItem['target']) {
  return items.filter((i) => i.target === target && i.targetId).map((i) => i.targetId!);
}
