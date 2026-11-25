import { Body, Controller, Get, HttpCode, Post, Query, Req } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import type { z } from 'zod';
import { CONSENT_VERSION, zConsentInput, type ConsentStatsDTO } from '@reberon/contracts';
import { PrismaService } from '../../common/prisma.service.js';
import { Public, Requires } from '../../common/auth.js';
import { ZodPipe } from '../../common/zod.pipe.js';

/** Enough of an address to show a real visitor made the choice — not enough to identify them. */
export function ipPrefix(ip: string | undefined) {
  if (!ip) return null;
  const v4 = ip.replace(/^::ffff:/, '');
  if (/^\d+\.\d+\.\d+\.\d+$/.test(v4)) return `${v4.split('.').slice(0, 3).join('.')}.0`;
  if (ip.includes(':')) return `${ip.split(':').slice(0, 4).join(':')}::`;
  return null;
}

@Controller('v1/public/consent')
export class PublicConsentController {
  constructor(private readonly prisma: PrismaService) {}

  /** Each choice is kept as proof of consent (anonymous id, choices, version, time). */
  @Public()
  @Post()
  @HttpCode(204)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  async record(@Body(new ZodPipe(zConsentInput)) body: z.infer<typeof zConsentInput>, @Req() req: Request) {
    await this.prisma.consentRecord.create({
      data: {
        visitorId: body.id,
        version: body.version,
        preferences: body.choices.preferences,
        analytics: body.choices.analytics,
        media: body.choices.media,
        method: body.method,
        path: body.path?.split('?')[0]?.slice(0, 200) ?? null,
        ipPrefix: ipPrefix(req.ip),
        userAgent: req.headers['user-agent']?.slice(0, 300) ?? null,
      },
    });
  }
}

@Controller('v1/admin/consent')
export class AdminConsentController {
  constructor(private readonly prisma: PrismaService) {}

  /** How visitors answer the cookie banner — totals only, no personal data. */
  @Get('stats')
  @Requires('settings:read')
  async stats(@Query('days') daysRaw?: string): Promise<ConsentStatsDTO> {
    const days = Math.min(365, Math.max(1, Number(daysRaw) || 30));
    const since = new Date(Date.now() - days * 86_400_000);
    // The latest choice of each visitor in the window.
    const rows = await this.prisma.$queryRaw<{ method: string; preferences: boolean; analytics: boolean; media: boolean }[]>`
      SELECT DISTINCT ON ("visitorId") method, preferences, analytics, media
      FROM "ConsentRecord" WHERE "createdAt" >= ${since}
      ORDER BY "visitorId", "createdAt" DESC`;
    const count = (m: string) => rows.filter((r) => r.method === m).length;
    return {
      days,
      total: rows.length,
      acceptAll: count('accept_all'),
      rejectAll: count('reject_all'),
      custom: count('custom'),
      gpc: count('gpc'),
      byCategory: { preferences: rows.filter((r) => r.preferences).length, analytics: rows.filter((r) => r.analytics).length, media: rows.filter((r) => r.media).length },
      version: CONSENT_VERSION,
    };
  }
}
