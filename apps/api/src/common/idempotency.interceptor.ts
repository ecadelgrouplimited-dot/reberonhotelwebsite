import { Injectable, type CallHandler, type ExecutionContext, type NestInterceptor } from '@nestjs/common';
import type { Request } from 'express';
import { from, lastValueFrom, type Observable } from 'rxjs';
import { RedisService } from './redis.service.js';
import { idempotent } from './idempotency.js';

/**
 * Every admin write may carry an Idempotency-Key. The House app stamps one on
 * each change; when a phone that was offline replays its outbox (or a flaky
 * connection loses the response), the same key returns the first result
 * instead of booking, charging or paying twice.
 */
@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(private readonly redis: RedisService) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (ctx.getType() !== 'http') return next.handle();
    const req = ctx.switchToHttp().getRequest<Request & { user?: { id: string } }>();
    const key = req.header('idempotency-key');
    if (!key || req.method === 'GET' || !req.path.startsWith('/v1/admin/') || req.path.startsWith('/v1/admin/auth/')) return next.handle();
    const scope = `admin:${req.user?.id ?? req.ip}:${req.method}:${req.path}`;
    return from(idempotent(this.redis, scope, key, () => lastValueFrom(next.handle(), { defaultValue: null })));
  }
}
