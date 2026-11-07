import { Body, Controller, Get, Patch, Req } from '@nestjs/common';
import type { Request } from 'express';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { zSettingsPatch } from '@reberon/contracts';
import type { z } from 'zod';
import { PrismaService } from '../../common/prisma.service.js';
import { AuditService } from '../../common/audit.service.js';
import { CurrentUser, has, Requires, type AuthUser } from '../../common/auth.js';
import { ZodPipe } from '../../common/zod.pipe.js';
import { badRequest, forbidden } from '../../common/errors.js';
import { Events } from '../../common/events.js';
import { normalizePhone } from '@reberon/utils';

/** Keys that must never change from the admin (the spec fixes the timezone). */
const LOCKED = new Set(['hotel.timezone', 'push.vapid']);

@Controller('v1/admin/settings')
export class SettingsAdminController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly events: EventEmitter2,
  ) {}

  @Get()
  @Requires('settings:read')
  async list() {
    const rows = await this.prisma.setting.findMany({ orderBy: { key: 'asc' } });
    return Object.fromEntries(rows.map((r) => [r.key, { value: r.value, group: r.group, updatedAt: r.updatedAt }]));
  }

  @Patch()
  @Requires('settings:write')
  async update(@Body(new ZodPipe(zSettingsPatch)) body: z.infer<typeof zSettingsPatch>, @CurrentUser() user: AuthUser, @Req() req: Request) {
    const rows = await this.prisma.setting.findMany({ where: { key: { in: Object.keys(body) } } });
    const known = new Map(rows.map((r) => [r.key, r]));
    for (const key of Object.keys(body)) {
      const row = known.get(key);
      if (!row) throw badRequest(`Unknown setting "${key}"`);
      if (LOCKED.has(key)) throw badRequest(`"${key}" cannot be changed`);
      if (row.group === 'FEATURES' && !has(user, 'settings:features')) throw forbidden('Only the owner can change features');
    }
    if (typeof body['contact.whatsapp'] === 'string' && body['contact.whatsapp']) {
      const n = normalizePhone(body['contact.whatsapp']);
      if (!n) throw badRequest('WhatsApp number is not valid', [{ path: 'contact.whatsapp', message: 'Not a valid phone number' }]);
      body['contact.whatsapp'] = n;
    }
    await this.prisma.$transaction(async (tx) => {
      for (const [key, value] of Object.entries(body)) {
        await tx.setting.update({ where: { key }, data: { value: value as object, updatedById: user.id } });
      }
      await this.audit.record(
        { actor: user, action: 'settings.update', entityType: 'Setting', summary: `Changed ${Object.keys(body).join(', ')}`, before: Object.fromEntries(rows.map((r) => [r.key, r.value])), after: body, req },
        tx,
      );
    });
    await this.events.emitAsync(Events.ContentChanged, { tags: ['site'] });
    return this.list();
  }
}
