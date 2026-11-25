import { Module } from '@nestjs/common';
import { ContentModule } from '../content/content.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { AdminConsentController, PublicConsentController } from './consent.controller.js';
import { AdminCareersController, AdminEventsController, PublicCareersController, PublicEventsController } from './public-life.controllers.js';
import { EventsService } from './events.service.js';
import { CareersService } from './careers.service.js';

/** The public life of the hotel: cookie consent, events, careers. */
@Module({
  imports: [ContentModule, NotificationsModule],
  controllers: [PublicConsentController, AdminConsentController, PublicEventsController, PublicCareersController, AdminEventsController, AdminCareersController],
  providers: [EventsService, CareersService],
  exports: [EventsService, CareersService],
})
export class PublicLifeModule {}
