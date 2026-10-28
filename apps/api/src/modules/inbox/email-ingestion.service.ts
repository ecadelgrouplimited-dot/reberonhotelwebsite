import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ImapFlow } from 'imapflow';
import { simpleParser, type ParsedMail } from 'mailparser';
import { referenceCode } from '@reberon/utils';
import { PrismaService } from '../../common/prisma.service.js';
import { AuditService } from '../../common/audit.service.js';
import type { AuthUser } from '../../common/auth.js';
import { IntegrationsService } from '../integrations/integrations.service.js';
import { env } from '../../config.js';

/**
 * Strips quoted history so that only the client's actual reply is preserved
 * in the conversation thread.
 */
export function cleanEmailReplyBody(raw: string): string {
  if (!raw) return '';
  let text = raw.replace(/\r\n/g, '\n');

  // Common patterns marking the beginning of the quoted original message
  const replyDelimiters = [
    /\n\s*On\s+.+?\s+wrote:\s*[\s\S]*$/i,
    /\n\s*---+\s*Original Message\s*---+[\s\S]*$/i,
    /\n\s*From:\s*.+?alerts@reberonhotel\.com[\s\S]*$/i,
    /\n\s*From:\s*.+?Reberon Hotel[\s\S]*$/i,
    /\n\s*_{8,}[\s\S]*$/,
  ];

  for (const delimiter of replyDelimiters) {
    const match = text.search(delimiter);
    if (match !== -1) {
      text = text.substring(0, match);
    }
  }

  // Remove lines beginning with ">" (quoted text)
  text = text
    .split('\n')
    .filter((line) => !line.trim().startsWith('>'))
    .join('\n');

  return text.trim();
}

@Injectable()
export class EmailIngestionService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger('EmailIngestion');
  private pollTimer: NodeJS.Timeout | null = null;
  private isSyncing = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly integrations: IntegrationsService,
    private readonly audit: AuditService,
  ) {}

  onModuleInit() {
    // Periodically poll for incoming replies every 2 minutes
    this.pollTimer = setInterval(() => {
      this.syncEmails().catch((err) => {
        this.log.debug(`Background email sync skipped or error: ${(err as Error).message}`);
      });
    }, 120_000);

    // Initial check after 15 seconds
    setTimeout(() => {
      this.syncEmails().catch(() => {});
    }, 15_000);
  }

  onModuleDestroy() {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  /**
   * Connects to IMAP mailbox, pulls new replies, matches them to existing
   * conversation threads by reference (EQ-XXXX, RES-XXXX, Q-XXXX) or email,
   * and threads the responses in the Inbox.
   */
  async syncEmails(actor?: AuthUser): Promise<{ ok: boolean; syncedCount: number; message: string }> {
    if (this.isSyncing) {
      return { ok: true, syncedCount: 0, message: 'Email sync already in progress' };
    }

    const cfg = await this.integrations.get('IMAP');
    if (!cfg) {
      return { ok: false, syncedCount: 0, message: 'IMAP incoming email is not configured' };
    }

    const v = cfg.values;
    const host = v.host || 'imap.hostinger.com';
    const port = Number(v.port || 993);
    const user = v.user || env.SMTP_USER || 'alerts@reberonhotel.com';
    const pass = v.pass || env.SMTP_PASS || '';
    const mailbox = v.mailbox || 'INBOX';

    if (!user || !pass) {
      return { ok: false, syncedCount: 0, message: 'Mailbox email and password are required' };
    }

    this.isSyncing = true;
    const client = new ImapFlow({
      host,
      port,
      secure: port === 993,
      auth: { user, pass },
      logger: false,
      clientInfo: { name: 'ReberonHotelSuite', version: '1.0.0' },
    });

    let syncedCount = 0;

    try {
      await client.connect();
      const lock = await client.getMailboxLock(mailbox);

      try {
        // Look back over the past 14 days
        const since = new Date(Date.now() - 14 * 86_400_000);
        const searchCriteria = { since };

        // Fetch recent messages
        for await (const msg of client.fetch(searchCriteria, {
          envelope: true,
          source: true,
          flags: true,
          internalDate: true,
        })) {
          const messageId = msg.envelope?.messageId || '';

          // Deduplication: check if already ingested
          if (messageId) {
            const existing = await this.prisma.message.findFirst({
              where: { channelMessageId: messageId },
            });
            if (existing) continue;
          }

          // Parse full email body and headers
          if (!msg.source) continue;
          const parsed = (await simpleParser(msg.source)) as ParsedMail;
          const fromAddress = (parsed.from?.value[0]?.address ?? '').toLowerCase().trim();
          const fromName = parsed.from?.value[0]?.name ?? fromAddress.split('@')[0] ?? 'Guest';

          // Skip outbound emails sent from ourselves
          if (
            fromAddress === user.toLowerCase() ||
            fromAddress === 'alerts@reberonhotel.com' ||
            fromAddress === (env.SMTP_USER ?? '').toLowerCase()
          ) {
            continue;
          }

          const subject = parsed.subject ?? '';
          const rawText = parsed.text || (typeof parsed.html === 'string' ? parsed.html : '') || '';
          const cleanBody = cleanEmailReplyBody(rawText) || (parsed.text ? parsed.text.trim() : '');

          if (!cleanBody && !parsed.subject) continue;

          // 1. Reference Matching: check for EQ-XXXX, RES-XXXX, Q-XXXX
          const combinedText = `${subject} ${rawText}`;
          const eqMatch = combinedText.match(/\b(EQ-[A-Z0-9]{4,12})\b/i);
          const resMatch = combinedText.match(/\b(RES-[A-Z0-9]{4,12})\b/i);
          const qMatch = combinedText.match(/\b(Q-[A-Z0-9]{4,12})\b/i);

          let targetConv = null;

          if (eqMatch) {
            const ref = eqMatch[1]!.toUpperCase();
            targetConv = await this.prisma.conversation.findUnique({
              where: { reference: ref },
              include: { contact: true },
            });
          }

          // If no EQ match but RES match, find conversation with that code in subject or contact
          if (!targetConv && resMatch) {
            const resCode = resMatch[1]!.toUpperCase();
            const res = await this.prisma.reservation.findUnique({
              where: { code: resCode },
              include: { contact: true },
            });
            if (res?.contactId) {
              targetConv = await this.prisma.conversation.findFirst({
                where: { contactId: res.contactId },
                orderBy: { lastMessageAt: 'desc' },
                include: { contact: true },
              });
            }
          }

          // 2. Fallback Matching: search by guest's from email address
          if (!targetConv && fromAddress) {
            targetConv = await this.prisma.conversation.findFirst({
              where: { contact: { email: fromAddress } },
              orderBy: { lastMessageAt: 'desc' },
              include: { contact: true },
            });
          }

          // 3. Fallback: if no active conversation exists, create a new one
          if (!targetConv) {
            const ref = referenceCode('EQ');
            targetConv = await this.prisma.$transaction(async (tx) => {
              let contact = fromAddress
                ? await tx.contact.findFirst({ where: { email: fromAddress } })
                : null;

              if (!contact) {
                contact = await tx.contact.create({
                  data: {
                    name: fromName,
                    email: fromAddress || null,
                    source: 'EMAIL',
                  },
                });
              }

              return tx.conversation.create({
                data: {
                  reference: ref,
                  contactId: contact.id,
                  channel: 'EMAIL',
                  intent: 'GENERAL',
                  status: 'NEW',
                  subject: subject.slice(0, 80) || 'Email inquiry',
                },
                include: { contact: true },
              });
            });
          }

          // Insert the reply into the conversation thread
          const msgDate = parsed.date || msg.internalDate || new Date();
          await this.prisma.$transaction(async (tx) => {
            await tx.message.create({
              data: {
                conversationId: targetConv.id,
                direction: 'INBOUND',
                body: cleanBody || (parsed.text ?? '') || '(Attachment or empty email received)',
                channelMessageId: messageId || null,
                deliveryStatus: 'email-received',
                createdAt: msgDate,
              },
            });

            await tx.conversation.update({
              where: { id: targetConv.id },
              data: {
                status: targetConv.status === 'DONE' ? 'OPEN' : 'OPEN',
                lastMessageAt: msgDate,
              },
            });
          });

          syncedCount++;
          this.log.log(
            `Threaded incoming email from ${fromAddress} into conversation ${targetConv.reference} (${targetConv.contact.name})`,
          );
        }
      } finally {
        lock.release();
      }

      await client.logout();

      const msgResult =
        syncedCount > 0
          ? `Synced ${syncedCount} new email reply${syncedCount === 1 ? '' : 'ies'} into conversation threads.`
          : 'Inbox is up to date. No new incoming replies found.';

      if (actor && syncedCount > 0) {
        await this.audit.record({
          actor,
          action: 'email.sync',
          entityType: 'Inbox',
          entityId: 'IMAP',
          summary: `Synced ${syncedCount} email replies from ${user}`,
        });
      }

      return { ok: true, syncedCount, message: msgResult };
    } catch (e) {
      const err = (e as Error).message;
      this.log.error(`IMAP sync error: ${err}`);
      return { ok: false, syncedCount: 0, message: `Could not sync email: ${err}` };
    } finally {
      this.isSyncing = false;
    }
  }
}
