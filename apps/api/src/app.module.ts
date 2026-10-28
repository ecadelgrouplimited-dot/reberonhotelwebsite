import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule } from '@nestjs/throttler';
import { AppThrottlerGuard } from './common/throttler.guard.js';
import { CommonModule } from './common/common.module.js';
import { AdminGuard } from './common/auth.js';
import { ProblemFilter } from './common/problem.filter.js';
import { ContentModule } from './modules/content/content.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { NotificationsModule } from './modules/notifications/notifications.module.js';
import { InboxModule } from './modules/inbox/inbox.module.js';
import { MediaModule } from './modules/media/media.module.js';
import { BookingModule } from './modules/booking/booking.module.js';
import { HouseModule } from './modules/house/house.module.js';
import { IntegrationsModule } from './modules/integrations/integrations.module.js';
import { OperationsModule } from './modules/operations/operations.module.js';
import { HrModule } from './modules/hr/hr.module.js';
import { HealthController } from './modules/health.controller.js';

@Module({
  imports: [
    EventEmitterModule.forRoot(),
    ScheduleModule.forRoot(),
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 300 }]),
    CommonModule,
    IntegrationsModule,
    NotificationsModule,
    ContentModule,
    AuthModule,
    InboxModule,
    MediaModule,
    BookingModule,
    HouseModule,
    OperationsModule,
    HrModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_GUARD, useClass: AppThrottlerGuard },
    { provide: APP_GUARD, useClass: AdminGuard },
    { provide: APP_FILTER, useClass: ProblemFilter },
  ],
})
export class AppModule {}
