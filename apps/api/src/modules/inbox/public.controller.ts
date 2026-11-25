import { Body, Controller, Headers, HttpCode, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { zEnquiryInput, zWaitlistInput, zWhatsappIntentInput } from '@reberon/contracts';
import type { z } from 'zod';
import { referenceCode, whatsappLink, formatDate } from '@reberon/utils';
import { t } from '@reberon/contracts';
import { ZodPipe } from '../../common/zod.pipe.js';
import { RedisService } from '../../common/redis.service.js';
import { PrismaService } from '../../common/prisma.service.js';
import { AuditService } from '../../common/audit.service.js';
import { idempotent } from '../../common/idempotency.js';
import { badRequest } from '../../common/errors.js';
import { env } from '../../config.js';
import { InboxService } from './inbox.service.js';

export async function verifyTurnstile(token: string | undefined) {
  if (!env.TURNSTILE_SECRET) return;
  const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    body: new URLSearchParams({ secret: env.TURNSTILE_SECRET, response: token ?? '' }),
  }).then((r) => r.json() as Promise<{ success: boolean }>);
  if (!res.success) throw badRequest('We could not confirm you are a person. Please try again.');
}

@Controller('v1/public')
export class PublicInboxController {
  constructor(
    private readonly inbox: InboxService,
    private readonly redis: RedisService,
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  @Post('enquiries')
  @HttpCode(201)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async enquiry(@Body(new ZodPipe(zEnquiryInput)) body: z.infer<typeof zEnquiryInput>, @Headers('idempotency-key') key?: string, @Headers('x-turnstile-token') turnstile?: string) {
    await verifyTurnstile(turnstile);
    return idempotent(this.redis, 'enquiry', key, () => this.inbox.createEnquiry(body));
  }

  @Post('waitlist')
  @HttpCode(201)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async waitlist(@Body(new ZodPipe(zWaitlistInput)) body: z.infer<typeof zWaitlistInput>, @Headers('idempotency-key') key?: string, @Headers('x-turnstile-token') turnstile?: string) {
    await verifyTurnstile(turnstile);
    return idempotent(this.redis, 'waitlist', key, () => this.inbox.createWaitlist(body));
  }

  /** Builds the wa.me link with context (M10) and logs the intent so the desk can match the chat. */
  @Post('whatsapp-intent')
  @HttpCode(200)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  async whatsapp(@Body(new ZodPipe(zWhatsappIntentInput)) body: z.infer<typeof zWhatsappIntentInput>) {
    const [wa, room] = await Promise.all([
      this.prisma.setting.findUnique({ where: { key: 'contact.whatsapp' } }),
      body.roomTypeSlug ? this.prisma.roomType.findUnique({ where: { slug: body.roomTypeSlug }, select: { name: true } }) : null,
    ]);
    const number = wa?.value as string | null;
    if (!number) throw badRequest('WhatsApp is not set up yet');
    const ref = referenceCode('WA');
    const parts = [body.message ?? 'Hello Reberon Hotel,'];
    if (room) parts.push(`I am interested in the ${t(room.name as Record<string, string>)}.`);
    if (body.arrival) parts.push(`Dates: ${formatDate(body.arrival)}${body.departure ? ` to ${formatDate(body.departure)}` : ''}.`);
    parts.push(`(ref ${ref})`);
    await this.audit.record({ actorType: 'GUEST', action: 'whatsapp.intent', entityType: 'WhatsAppIntent', entityId: ref, summary: `Click-to-chat from ${body.pagePath ?? 'site'}`, after: body });
    return { ref, waUrl: whatsappLink(number, parts.join(' ')) };
  }
}
