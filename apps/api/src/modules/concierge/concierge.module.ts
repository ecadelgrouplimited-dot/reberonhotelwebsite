import { Module } from '@nestjs/common';
import { BookingModule } from '../booking/booking.module.js';
import { DocumentsModule } from '../documents/documents.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { ConciergeController } from './concierge.controller.js';
import { ConciergeService } from './concierge.service.js';
import { DeepSeekClient } from './deepseek.client.js';
import { ConciergeToolsService } from './concierge-tools.service.js';

@Module({
  imports: [BookingModule, DocumentsModule, NotificationsModule],
  controllers: [ConciergeController],
  providers: [ConciergeService, DeepSeekClient, ConciergeToolsService],
  exports: [ConciergeService, DeepSeekClient],
})
export class ConciergeModule {}
