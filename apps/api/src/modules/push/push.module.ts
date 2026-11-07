import { Module } from '@nestjs/common';
import { PushController } from './push.controller.js';
import { PushService } from './push.service.js';

/** Web Push for the installed House app. */
@Module({ controllers: [PushController], providers: [PushService], exports: [PushService] })
export class PushModule {}
