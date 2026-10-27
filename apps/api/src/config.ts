import { config as loadEnv } from 'dotenv';
import { resolve } from 'node:path';
import { z } from 'zod';
import { repoRoot } from '@reberon/media';

loadEnv({ path: resolve(repoRoot(), '.env'), quiet: true });

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(4000),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  API_URL: z.string().url().default('http://localhost:4000'),
  WEB_URL: z.string().url().default('http://localhost:3000'),
  /** How the API reaches the website from inside the server (Docker: http://web:3000). Defaults to WEB_URL. */
  WEB_INTERNAL_URL: z.string().url().optional(),
  ADMIN_URL: z.string().url().default('http://localhost:3001'),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  REVALIDATE_SECRET: z.string().min(16),
  PREVIEW_SECRET: z.string().min(16),
  /** Encrypts guest ID numbers at rest. Falls back to a key derived from JWT_SECRET in development. */
  DATA_KEY: z.string().min(32).optional(),
  /** "true"/"1" only — z.coerce.boolean() would read the string "false" as true. */
  COOKIE_SECURE: z.string().default('false').transform((v) => v === 'true' || v === '1'),
  STORAGE_DRIVER: z.enum(['local']).default('local'),
  STORAGE_LOCAL_DIR: z.string().default('./storage'),
  MEDIA_PUBLIC_URL: z.string().url().default('http://localhost:4000/media'),
  SMTP_HOST: z.string().default('localhost'),
  SMTP_PORT: z.coerce.number().default(1025),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  MAIL_FROM: z.string().default('Reberon Hotel <alerts@reberonhotel.com>'),
  TURNSTILE_SECRET: z.string().optional(),
  /** TEST = simulated payments (never in production). PESAPAL = real money. */
  PAYMENT_PROVIDER: z.enum(['TEST', 'PESAPAL']).default('TEST'),
  PESAPAL_ENV: z.enum(['sandbox', 'live']).default('sandbox'),
  PESAPAL_CONSUMER_KEY: z.string().optional(),
  PESAPAL_CONSUMER_SECRET: z.string().optional(),
  BOOKING_HOLD_MINUTES: z.coerce.number().int().min(5).max(120).default(20),
});

// A blank line in an env file means "not set", not "empty string".
const parsed = schema.safeParse(Object.fromEntries(Object.entries(process.env).filter(([, v]) => v !== '')));
if (!parsed.success) {
  console.error('Invalid environment:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}
if (parsed.data.NODE_ENV === 'production' && !parsed.data.DATA_KEY) {
  console.error('Set DATA_KEY in production: it encrypts guest ID numbers and the integrations vault.');
  process.exit(1);
}
if (parsed.data.NODE_ENV === 'production' && /dev-only|change-me/.test(parsed.data.JWT_SECRET + parsed.data.REVALIDATE_SECRET)) {
  console.error('Refusing to start in production with development secrets.');
  process.exit(1);
}

export const env = parsed.data;
export type Env = typeof env;
