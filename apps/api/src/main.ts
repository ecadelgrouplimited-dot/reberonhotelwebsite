import 'reflect-metadata';
import { env } from './config.js';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Logger } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import compression from 'compression';
import express from 'express';
import { resolve } from 'node:path';
import { LocalStorage } from '@reberon/media';
import { AppModule } from './app.module.js';

// Money is bigint in the database; it leaves the API as a string.
(BigInt.prototype as unknown as { toJSON: () => string }).toJSON = function (this: bigint) {
  return this.toString();
};

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: false });
  app.set('trust proxy', 1);
  app.disable('x-powered-by');
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(compression());
  app.use(cookieParser());
  app.use('/v1/webhooks', express.urlencoded({ extended: false }));
  app.enableCors({
    origin: [env.WEB_URL, env.ADMIN_URL],
    credentials: true,
    allowedHeaders: ['content-type', 'x-reberon-client', 'if-match', 'idempotency-key', 'x-turnstile-token', 'x-preview-token'],
    exposedHeaders: ['content-disposition'],
  });

  // Public media variants: ids are immutable, so cache hard.
  const storage = new LocalStorage();
  app.use('/media', express.static(resolve(storage.root, 'public'), { immutable: true, maxAge: '365d', fallthrough: false }));

  app.enableShutdownHooks();
  await app.listen(env.PORT);
  new Logger('Bootstrap').log(`API ready on ${env.API_URL} (media from ${storage.root})`);
}
bootstrap();
