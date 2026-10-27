import { Injectable, Logger } from '@nestjs/common';
import nodemailer from 'nodemailer';
import { INTEGRATIONS, type IntegrationDTO, type IntegrationKind } from '@reberon/contracts';
import type { Prisma } from '@reberon/db';
import { PrismaService } from '../../common/prisma.service.js';
import { AuditService } from '../../common/audit.service.js';
import type { AuthUser } from '../../common/auth.js';
import { badRequest, notFound } from '../../common/errors.js';
import { last4, open, seal } from '../../common/crypto.js';
import { env } from '../../config.js';
import { renderEmail } from '../notifications/email-template.js';

export interface ResolvedIntegration {
  kind: IntegrationKind;
  mode: 'TEST' | 'LIVE';
  values: Record<string, string>;
  source: 'VAULT' | 'ENVIRONMENT';
}

const PESAPAL_BASE = { TEST: 'https://cybqa.pesapal.com/pesapalv3', LIVE: 'https://pay.pesapal.com/v3' };
export const pesapalBase = (mode: 'TEST' | 'LIVE') => PESAPAL_BASE[mode];
export const africasTalkingBase = (mode: 'TEST' | 'LIVE') => (mode === 'LIVE' ? 'https://api.africastalking.com' : 'https://api.sandbox.africastalking.com');
export const GRAPH = 'https://graph.facebook.com/v21.0';

/**
 * The integrations vault. Keys are sealed at rest and only ever decrypted
 * inside the API. An enabled vault entry wins; otherwise the environment
 * (the way Movement I–II were configured) is used; otherwise "not connected".
 */
@Injectable()
export class IntegrationsService {
  private readonly log = new Logger('Integrations');
  private cache = new Map<IntegrationKind, { at: number; value: ResolvedIntegration | null }>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private fromEnv(kind: IntegrationKind): ResolvedIntegration | null {
    switch (kind) {
      case 'PESAPAL':
        return env.PAYMENT_PROVIDER === 'PESAPAL' && env.PESAPAL_CONSUMER_KEY && env.PESAPAL_CONSUMER_SECRET
          ? { kind, source: 'ENVIRONMENT', mode: env.PESAPAL_ENV === 'live' ? 'LIVE' : 'TEST', values: { consumerKey: env.PESAPAL_CONSUMER_KEY, consumerSecret: env.PESAPAL_CONSUMER_SECRET } }
          : null;
      case 'SMTP':
        return { kind, source: 'ENVIRONMENT', mode: 'LIVE', values: { host: env.SMTP_HOST, port: String(env.SMTP_PORT), user: env.SMTP_USER ?? '', pass: env.SMTP_PASS ?? '', from: env.MAIL_FROM } };
      default:
        return null;
    }
  }

  /** The configuration a driver should use right now, or null when not connected. */
  async get(kind: IntegrationKind): Promise<ResolvedIntegration | null> {
    const hit = this.cache.get(kind);
    if (hit && Date.now() - hit.at < 30_000) return hit.value;
    const row = await this.prisma.integration.findUnique({ where: { kind } });
    let value: ResolvedIntegration | null = null;
    if (row?.enabled) {
      const secrets = row.secretsEnc ? (JSON.parse(open(row.secretsEnc) ?? '{}') as Record<string, string>) : {};
      value = { kind, source: 'VAULT', mode: row.mode, values: { ...(row.config as Record<string, string>), ...secrets } };
    } else value = this.fromEnv(kind);
    this.cache.set(kind, { at: Date.now(), value });
    return value;
  }

  private dto(kind: IntegrationKind, row: Prisma.IntegrationGetPayload<object> | null, resolved: ResolvedIntegration | null): IntegrationDTO {
    const def = INTEGRATIONS.find((d) => d.kind === kind)!;
    const hints = (row?.secretHints ?? {}) as Record<string, string>;
    return {
      kind,
      enabled: row?.enabled ?? false,
      mode: row?.mode ?? 'TEST',
      config: Object.fromEntries(def.fields.filter((f) => !f.secret).map((f) => [f.name, String((row?.config as Record<string, unknown> | undefined)?.[f.name] ?? '')])),
      secrets: Object.fromEntries(def.fields.filter((f) => f.secret).map((f) => [f.name, hints[f.name] ?? null])),
      source: resolved?.source ?? 'NONE',
      lastTest: row?.lastTestAt ? { at: row.lastTestAt.toISOString(), ok: !!row.lastTestOk, message: row.lastTestMessage ?? '' } : null,
      updatedAt: row?.updatedAt.toISOString() ?? null,
    };
  }

  async list(): Promise<IntegrationDTO[]> {
    const rows = await this.prisma.integration.findMany();
    return Promise.all(INTEGRATIONS.map(async (d) => this.dto(d.kind, rows.find((r) => r.kind === d.kind) ?? null, await this.get(d.kind))));
  }

  async update(kind: IntegrationKind, input: { enabled: boolean; mode: 'TEST' | 'LIVE'; values: Record<string, string> }, actor: AuthUser) {
    const def = INTEGRATIONS.find((d) => d.kind === kind);
    if (!def) throw notFound('Integration');
    const row = await this.prisma.integration.findUnique({ where: { kind } });
    const oldSecrets = row?.secretsEnc ? (JSON.parse(open(row.secretsEnc) ?? '{}') as Record<string, string>) : {};
    const config: Record<string, string> = {};
    const secrets: Record<string, string> = { ...oldSecrets };
    for (const f of def.fields) {
      const val = input.values[f.name]?.trim();
      if (f.secret) {
        if (val) secrets[f.name] = val; // empty = keep what is stored
      } else config[f.name] = val ?? '';
    }
    if (input.enabled) {
      const missing = def.fields.filter((f) => f.required && !(f.secret ? secrets[f.name] : config[f.name]));
      if (missing.length) throw badRequest(`Fill in ${missing.map((f) => f.label.toLowerCase()).join(', ')} before switching it on`, missing.map((f) => ({ path: `values.${f.name}`, message: 'Required' })));
    }
    const hints = Object.fromEntries(Object.entries(secrets).filter(([, s]) => s).map(([k, s]) => [k, last4(s)]));
    const data = { enabled: input.enabled, mode: input.mode, config, secretsEnc: Object.keys(secrets).length ? seal(JSON.stringify(secrets)) : null, secretHints: hints, updatedById: actor.id };
    await this.prisma.integration.upsert({ where: { kind }, create: { kind, ...data }, update: data });
    this.cache.delete(kind);
    // Never write secrets to the audit log — only which fields changed.
    const changed = def.fields.filter((f) => (f.secret ? !!input.values[f.name]?.trim() : (row?.config as Record<string, string> | undefined)?.[f.name] !== config[f.name])).map((f) => f.label);
    await this.audit.record({ actor, action: 'integration.update', entityType: 'Integration', entityId: kind, summary: `${def.label}: ${input.enabled ? `on (${input.mode === 'LIVE' ? def.liveLabel : def.testLabel})` : 'off'}${changed.length ? ` · changed ${changed.join(', ')}` : ''}` });
    return this.list();
  }

  /** Talk to the provider with the stored keys and remember the answer. Never sends a real message or money. */
  async test(kind: IntegrationKind, actor: AuthUser) {
    const cfg = await this.get(kind);
    let ok = false;
    let message: string;
    try {
      if (!cfg) throw new Error('Not configured');
      message = await this.probe(cfg);
      ok = true;
    } catch (e) {
      message = (e as Error).message.slice(0, 300);
    }
    await this.prisma.integration.upsert({ where: { kind }, create: { kind, lastTestAt: new Date(), lastTestOk: ok, lastTestMessage: message }, update: { lastTestAt: new Date(), lastTestOk: ok, lastTestMessage: message } });
    await this.audit.record({ actor, action: 'integration.test', entityType: 'Integration', entityId: kind, summary: `Tested ${kind}: ${ok ? 'OK' : 'failed'}` });
    return { ok, message };
  }

  private async probe(c: ResolvedIntegration): Promise<string> {
    const v = c.values;
    const t = AbortSignal.timeout(15_000);
    switch (c.kind) {
      case 'PESAPAL': {
        const r = await fetch(`${pesapalBase(c.mode)}/api/Auth/RequestToken`, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify({ consumer_key: v.consumerKey, consumer_secret: v.consumerSecret }), signal: t });
        const j = (await r.json().catch(() => ({}))) as { token?: string; error?: { message?: string } };
        if (!j.token) throw new Error(`Pesapal refused the keys: ${j.error?.message ?? r.status}`);
        return `Pesapal accepted the keys (${c.mode === 'LIVE' ? 'live' : 'sandbox'}).`;
      }
      case 'SMS_AFRICASTALKING': {
        const r = await fetch(`${africasTalkingBase(c.mode)}/version1/user?username=${encodeURIComponent(v.username ?? '')}`, { headers: { apiKey: v.apiKey ?? '', accept: 'application/json' }, signal: t });
        if (!r.ok) throw new Error(`Africa's Talking answered ${r.status}${r.status === 401 ? ' — check the username and API key' : ''}`);
        const j = (await r.json()) as { UserData?: { balance?: string } };
        return `Connected. Balance: ${j.UserData?.balance ?? 'unknown'}.`;
      }
      case 'WHATSAPP_CLOUD': {
        const r = await fetch(`${GRAPH}/${encodeURIComponent(v.phoneNumberId ?? '')}?fields=display_phone_number,verified_name,quality_rating`, { headers: { authorization: `Bearer ${v.accessToken}` }, signal: t });
        const j = (await r.json().catch(() => ({}))) as { display_phone_number?: string; verified_name?: string; quality_rating?: string; error?: { message?: string } };
        if (!r.ok) throw new Error(`Meta answered ${r.status}: ${j.error?.message ?? 'unknown error'}`);
        return `Connected to ${j.verified_name ?? 'the business'} on ${j.display_phone_number ?? 'the number'} (quality ${j.quality_rating ?? 'unknown'}).`;
      }
      case 'SMTP': {
        const host = v.host || env.SMTP_HOST;
        const port = Number(v.port || env.SMTP_PORT || 587);
        const isLocal = host === 'localhost' || host === '127.0.0.1' || host === '::1';
        const tr = nodemailer.createTransport({
          host,
          port,
          secure: port === 465,
          auth: v.user ? { user: v.user, pass: v.pass } : undefined,
          connectionTimeout: 10_000,
          ...(isLocal ? { tls: { rejectUnauthorized: false } } : {}),
        });
        await tr.verify();
        return `The mail server at ${host}:${port} accepted the connection (From: ${v.from || env.MAIL_FROM}).`;
      }
    }
  }

  /** Send a real test email through the active SMTP configuration to verify end-to-end delivery. */
  async sendTestEmail(to: string, actor: AuthUser) {
    const cfg = await this.get('SMTP');
    if (!cfg) throw badRequest('SMTP is not configured');
    const v = cfg.values;
    const host = v.host || env.SMTP_HOST;
    const port = Number(v.port || env.SMTP_PORT || 587);
    const from = v.from || env.MAIL_FROM;
    const isLocal = host === 'localhost' || host === '127.0.0.1' || host === '::1';
    const tr = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: v.user ? { user: v.user, pass: v.pass } : undefined,
      connectionTimeout: 12_000,
      ...(isLocal ? { tls: { rejectUnauthorized: false } } : {}),
    });
    const { html, text } = renderEmail({
      to,
      subject: 'Reberon Hotel Suite — SMTP Notification Test',
      heading: 'SMTP notifications are working',
      paragraphs: [
        `Hello ${actor.name.split(' ')[0]},`,
        'This test message confirms that your Reberon Hotel Suite SMTP configuration is active and delivering outbound notifications properly.',
      ],
      facts: [
        ['Sender (From)', from],
        ['SMTP Host', `${v.host || env.SMTP_HOST}:${port}`],
        ['Configuration Source', cfg.source],
        ['Recipient', to],
      ],
      action: { label: 'Open Reberon Suite Settings', url: `${env.ADMIN_URL}/settings` },
    });
    try {
      const info = await tr.sendMail({ from, to, subject: 'Reberon Hotel Suite — SMTP Notification Test', html, text });
      const msg = `Test email sent to ${to} (${info.messageId || 'delivered'})`;
      await this.prisma.integration.upsert({
        where: { kind: 'SMTP' },
        create: { kind: 'SMTP', lastTestAt: new Date(), lastTestOk: true, lastTestMessage: msg },
        update: { lastTestAt: new Date(), lastTestOk: true, lastTestMessage: msg },
      });
      await this.audit.record({ actor, action: 'integration.test_email', entityType: 'Integration', entityId: 'SMTP', summary: `Sent test email to ${to}` });
      return { ok: true, message: msg };
    } catch (e) {
      const err = (e as Error).message.slice(0, 300);
      await this.prisma.integration.upsert({
        where: { kind: 'SMTP' },
        create: { kind: 'SMTP', lastTestAt: new Date(), lastTestOk: false, lastTestMessage: err },
        update: { lastTestAt: new Date(), lastTestOk: false, lastTestMessage: err },
      });
      return { ok: false, message: `Could not send test email: ${err}` };
    }
  }

  forget(kind?: IntegrationKind) {
    if (kind) this.cache.delete(kind);
    else this.cache.clear();
    this.log.debug('cache cleared');
  }
}
