import { Injectable, Optional } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Events, type AuditRecordedEvent } from './events.js';
import type { Request } from 'express';
import type { Prisma } from '@reberon/db';
import { PrismaService } from './prisma.service.js';
import type { AuthUser } from './auth.js';

const REDACT = /password|token|secret|hash/i;

function clean(v: unknown): Prisma.InputJsonValue | undefined {
  if (v === undefined || v === null) return undefined;
  return JSON.parse(
    JSON.stringify(v, (k, val) => (REDACT.test(k) ? '[redacted]' : typeof val === 'bigint' ? val.toString() : val)),
  ) as Prisma.InputJsonValue;
}

export interface AuditEntry {
  actor?: AuthUser | null;
  actorType?: 'USER' | 'SYSTEM' | 'GUEST' | 'WEBHOOK';
  action: string;
  entityType: string;
  entityId?: string | null;
  summary?: string;
  before?: unknown;
  after?: unknown;
  req?: Request;
}

@Injectable()
export class AuditService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly events?: EventEmitter2,
  ) {}

  async record(e: AuditEntry, tx: Prisma.TransactionClient = this.prisma) {
    await tx.auditLog.create({
      data: {
        actorId: e.actor?.id,
        actorType: e.actorType ?? (e.actor ? 'USER' : 'SYSTEM'),
        action: e.action,
        entityType: e.entityType,
        entityId: e.entityId ?? undefined,
        summary: e.summary,
        before: clean(e.before),
        after: clean(e.after),
        ip: e.req?.ip,
        userAgent: e.req?.headers['user-agent']?.slice(0, 300),
      },
    });
    // Fan-out (Web Push) runs after the response; a push failure never fails the action.
    const ev: AuditRecordedEvent = { action: e.action, entityType: e.entityType, entityId: e.entityId ?? null, summary: e.summary ?? null, actorId: e.actor?.id ?? null, actorName: e.actor?.name ?? null };
    setImmediate(() => this.events?.emit(Events.AuditRecorded, ev));
  }
}
