import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Queue, Worker } from 'bullmq';
import nodemailer, { type Transporter } from 'nodemailer';
import { RedisService } from '../../common/redis.service.js';
import { env } from '../../config.js';
import { renderEmail, type EmailContent } from './email-template.js';
import { IntegrationsService } from '../integrations/integrations.service.js';

const QUEUE = 'notifications';

/**
 * Outbound messages go through a queue so a slow or failing mail server never
 * blocks a guest's form submission. Retries with backoff.
 */
@Injectable()
export class NotificationsService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger('Notifications');
  private queue!: Queue;
  private worker!: Worker;
  private transport: { key: string; t: Transporter; from: string } | null = null;

  constructor(
    private readonly redis: RedisService,
    private readonly integrations: IntegrationsService,
  ) {}

  /** SMTP from the vault when set there, else the environment. Rebuilt when the settings change. */
  private async mailer() {
    const c = await this.integrations.get('SMTP');
    const v = c?.values ?? {};
    const key = JSON.stringify([v.host, v.port, v.user, v.pass, v.from]);
    if (this.transport?.key !== key) {
      const port = Number(v.port || env.SMTP_PORT);
      this.transport = {
        key,
        from: v.from || env.MAIL_FROM,
        t: nodemailer.createTransport({
          host: v.host || env.SMTP_HOST,
          port,
          secure: port === 465,
          auth: v.user ? { user: v.user, pass: v.pass } : undefined,
        }),
      };
    }
    return this.transport;
  }

  onModuleInit() {
    const connection = this.redis.bullConnection();
    this.queue = new Queue(QUEUE, { connection, defaultJobOptions: { attempts: 5, backoff: { type: 'exponential', delay: 10_000 }, removeOnComplete: 500, removeOnFail: 1000 } });
    this.worker = new Worker(
      QUEUE,
      async (job) => {
        if (job.name === 'email') {
          const c = job.data as EmailContent;
          const { html, text } = renderEmail(c);
          const m = await this.mailer();
          await m.t.sendMail({ from: m.from, to: c.to, replyTo: c.replyTo, subject: c.subject, html, text });
          this.log.log(`email sent: "${c.subject}" → ${c.to}`);
        }
      },
      { connection, concurrency: 4 },
    );
    this.worker.on('failed', (job, err) => this.log.warn(`job ${job?.id} failed: ${err.message}`));
  }

  /** Send immediately (the caller owns retries). */
  async sendNow(c: EmailContent) {
    const { html, text } = renderEmail(c);
    const m = await this.mailer();
    const info = await m.t.sendMail({ from: m.from, to: c.to, replyTo: c.replyTo, subject: c.subject, html, text });
    return String(info.messageId ?? '');
  }

  async email(content: EmailContent) {
    await this.queue.add('email', content);
  }

  async onModuleDestroy() {
    await this.worker?.close();
    await this.queue?.close();
  }
}
