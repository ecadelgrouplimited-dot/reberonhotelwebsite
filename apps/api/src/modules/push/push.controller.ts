import { Body, Controller, Get, HttpCode, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { z } from 'zod';
import { CurrentUser, type AuthUser } from '../../common/auth.js';
import { ZodPipe } from '../../common/zod.pipe.js';
import { AuditService } from '../../common/audit.service.js';
import { PushService } from './push.service.js';

const zSubscription = z.object({
  endpoint: z.string().url().max(1000),
  keys: z.object({ p256dh: z.string().min(10).max(200), auth: z.string().min(8).max(100) }),
});
const zEndpoint = z.object({ endpoint: z.string().url().max(1000) });

/** Each signed-in person manages their own devices; no special permission needed. */
@Controller('v1/admin/push')
export class PushController {
  constructor(
    private readonly push: PushService,
    private readonly audit: AuditService,
  ) {}

  @Get('public-key')
  async publicKey() {
    return { publicKey: (await this.push.vapid()).publicKey };
  }

  @Get('devices')
  devices(@CurrentUser() user: AuthUser) {
    return this.push.devices(user.id);
  }

  @Post('subscribe')
  @HttpCode(200)
  async subscribe(@Body(new ZodPipe(zSubscription)) body: z.infer<typeof zSubscription>, @CurrentUser() user: AuthUser, @Req() req: Request) {
    await this.push.subscribe(user.id, body, req.headers['user-agent']);
    await this.audit.record({ actor: user, action: 'push.subscribe', entityType: 'PushSubscription', summary: 'Turned on notifications on a device', req });
    return { ok: true };
  }

  @Post('unsubscribe')
  @HttpCode(200)
  async unsubscribe(@Body(new ZodPipe(zEndpoint)) body: z.infer<typeof zEndpoint>, @CurrentUser() user: AuthUser, @Req() req: Request) {
    await this.push.unsubscribe(user.id, body.endpoint);
    await this.audit.record({ actor: user, action: 'push.unsubscribe', entityType: 'PushSubscription', summary: 'Turned off notifications on a device', req });
    return { ok: true };
  }

  @Post('test')
  @HttpCode(200)
  async test(@CurrentUser() user: AuthUser) {
    return this.push.sendToUsers([user.id], { title: 'Reberon notifications are on', body: `This device will now alert ${user.name.split(' ')[0]} about bookings, check-outs, rooms and the POS — even when the app is closed.`, url: '/', tag: 'push-test', urgency: 'NORMAL' });
  }
}
