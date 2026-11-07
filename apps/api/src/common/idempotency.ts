import type { RedisService } from './redis.service.js';

/**
 * Replays the stored result when the same Idempotency-Key arrives again
 * (a phone on a bad network retrying a form post must not create two enquiries).
 */
export async function idempotent<T>(redis: RedisService, scope: string, key: string | undefined, fn: () => Promise<T>): Promise<T> {
  if (!key || key.length > 100) return fn();
  const k = `idem:${scope}:${key}`;
  const hit = await redis.client.get(k);
  if (hit && hit !== 'pending') return JSON.parse(hit) as T;
  const claimed = await redis.client.set(k, 'pending', 'EX', 60, 'NX');
  if (!claimed) {
    // Another request with this key is in flight; wait briefly for its result.
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 250));
      const v = await redis.client.get(k);
      if (v && v !== 'pending') return JSON.parse(v) as T;
    }
  }
  let result: T;
  try {
    result = await fn();
  } catch (e) {
    await redis.client.del(k);
    throw e;
  }
  // Remembering the answer must never turn a success into a failure.
  try {
    await redis.client.set(k, JSON.stringify(result ?? null, (_k, v) => (typeof v === 'bigint' ? v.toString() : v)), 'EX', 86_400);
  } catch {
    await redis.client.del(k).catch(() => undefined);
  }
  return result;
}
