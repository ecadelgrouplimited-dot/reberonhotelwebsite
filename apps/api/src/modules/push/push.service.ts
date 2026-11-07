import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import webpush from 'web-push';
import type { Prisma } from '@reberon/db';
import { PrismaService } from '../../common/prisma.service.js';
import { env } from '../../config.js';
import { open, seal } from '../../common/crypto.js';
import { Events, type AuditRecordedEvent } from '../../common/events.js';
import { hrefForAction, loadNotificationRules, ruleIdForAction } from '../../common/notification-rules.js';

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
  tag?: string;
  urgency?: 'CRITICAL' | 'HIGH' | 'NORMAL' | 'LOW';
  category?: string;
  sound?: string;
  ts?: string;
}

/** Actions that never need to wake anyone's phone. */
const QUIET = /^(auth\.|settings\.|media\.|page\.|content\.|users?\.session|push\.)/;

/**
 * Web Push to the installed House app. The same owner-edited alert rules that
 * drive the in-app pop-ups decide who gets woken up — never the person who did it.
 */
@Injectable()
export class PushService {
  private readonly log = new Logger('Push');
  private keys: Promise<{ publicKey: string; privateKey: string }> | null = null;

  constructor(private readonly prisma: PrismaService) {}

  /** VAPID keys: from env, or generated once and kept sealed in settings. */
  vapid() {
    this.keys ??= (async () => {
      if (env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY) return { publicKey: env.VAPID_PUBLIC_KEY, privateKey: env.VAPID_PRIVATE_KEY };
      const row = await this.prisma.setting.findUnique({ where: { key: 'push.vapid' } });
      const v = row?.value as { publicKey?: string; privateKeySealed?: string } | undefined;
      const priv = v?.privateKeySealed ? open(v.privateKeySealed) : null;
      if (v?.publicKey && priv) return { publicKey: v.publicKey, privateKey: priv };
      const k = webpush.generateVAPIDKeys();
      await this.prisma.setting.upsert({
        where: { key: 'push.vapid' },
        create: { key: 'push.vapid', group: 'NOTIFICATIONS', value: { publicKey: k.publicKey, privateKeySealed: seal(k.privateKey) } as Prisma.InputJsonValue },
        update: { value: { publicKey: k.publicKey, privateKeySealed: seal(k.privateKey) } as Prisma.InputJsonValue },
      });
      this.log.log('generated a VAPID key pair for Web Push');
      return k;
    })().catch((e) => {
      this.keys = null;
      throw e;
    });
    return this.keys;
  }

  async subscribe(userId: string, sub: { endpoint: string; keys: { p256dh: string; auth: string } }, userAgent?: string) {
    await this.prisma.pushSubscription.upsert({
      where: { endpoint: sub.endpoint },
      create: { userId, endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth, userAgent: userAgent?.slice(0, 300) },
      update: { userId, p256dh: sub.keys.p256dh, auth: sub.keys.auth, userAgent: userAgent?.slice(0, 300), failures: 0 },
    });
  }

  async unsubscribe(userId: string, endpoint: string) {
    await this.prisma.pushSubscription.deleteMany({ where: { userId, endpoint } });
  }

  async devices(userId: string) {
    return this.prisma.pushSubscription.findMany({ where: { userId }, select: { id: true, userAgent: true, createdAt: true, lastSuccessAt: true }, orderBy: { createdAt: 'desc' } });
  }

  /** Send to every device of these users. Dead subscriptions (404/410) are removed. */
  async sendToUsers(userIds: string[], payload: PushPayload) {
    if (!userIds.length) return { sent: 0, failed: 0 };
    const subs = await this.prisma.pushSubscription.findMany({ where: { userId: { in: userIds } } });
    if (!subs.length) return { sent: 0, failed: 0 };
    const { publicKey, privateKey } = await this.vapid();
    const body = JSON.stringify({ ...payload, ts: payload.ts ?? new Date().toISOString() });
    let sent = 0;
    let failed = 0;
    await Promise.all(
      subs.map(async (s) => {
        try {
          await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, body, {
            TTL: payload.urgency === 'CRITICAL' ? 6 * 3600 : 3600,
            urgency: payload.urgency === 'CRITICAL' ? 'high' : payload.urgency === 'HIGH' ? 'normal' : 'low',
            topic: payload.tag?.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 32) || undefined,
            vapidDetails: { subject: env.VAPID_SUBJECT, publicKey, privateKey },
          });
          sent += 1;
          await this.prisma.pushSubscription.update({ where: { id: s.id }, data: { lastSuccessAt: new Date(), failures: 0 } });
        } catch (e) {
          failed += 1;
          const status = (e as { statusCode?: number }).statusCode;
          if (status === 404 || status === 410 || s.failures >= 9) await this.prisma.pushSubscription.delete({ where: { id: s.id } }).catch(() => undefined);
          else await this.prisma.pushSubscription.update({ where: { id: s.id }, data: { failures: { increment: 1 } } }).catch(() => undefined);
          this.log.warn(`push to ${s.id} failed (${status ?? (e as Error).message})`);
        }
      }),
    );
    return { sent, failed };
  }

  @OnEvent(Events.AuditRecorded, { async: true })
  async onAudit(ev: AuditRecordedEvent) {
    try {
      if (QUIET.test(ev.action)) return;
      if (!(await this.prisma.pushSubscription.count())) return;
      const rules = await loadNotificationRules(this.prisma);
      const ruleId = ruleIdForAction(ev.action);
      const rule = rules.find((r) => r.id === ruleId);
      if (!rule || !rule.popupEnabled) return;
      const users = await this.prisma.user.findMany({
        where: { status: 'ACTIVE', deletedAt: null, OR: [{ role: { in: rule.roles as never[] } }, { id: { in: rule.recipientUserIds } }] },
        select: { id: true },
      });
      const to = users.map((u) => u.id).filter((id) => id !== ev.actorId);
      await this.sendToUsers(to, {
        title: rule.label,
        body: [ev.summary ?? ev.action, ev.actorName ? `— ${ev.actorName}` : ''].filter(Boolean).join(' '),
        url: hrefForAction(ev.action, ev.entityType, ev.entityId),
        tag: `${ruleId}-${ev.entityId ?? ev.action}`,
        urgency: rule.urgency as PushPayload['urgency'],
        category: rule.category,
        sound: rule.soundEnabled ? rule.soundTone : undefined,
      });
    } catch (e) {
      this.log.error(`push fan-out for ${ev.action}: ${(e as Error).message}`);
    }
  }
}
