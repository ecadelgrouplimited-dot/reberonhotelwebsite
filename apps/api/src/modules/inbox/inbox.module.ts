import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { InboxService } from './inbox.service.js';
import { EmailIngestionService } from './email-ingestion.service.js';
import { PublicInboxController } from './public.controller.js';
import { ConversationsController, DashboardController, WaitlistController } from './admin.controller.js';

@Module({
  imports: [NotificationsModule],
  controllers: [PublicInboxController, ConversationsController, WaitlistController, DashboardController],
  providers: [InboxService, EmailIngestionService],
  exports: [InboxService, EmailIngestionService],
})
export class InboxModule {}
