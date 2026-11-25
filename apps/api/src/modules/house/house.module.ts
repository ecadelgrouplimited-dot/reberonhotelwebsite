import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { BookingModule } from '../booking/booking.module.js';
import { DocumentsModule } from '../documents/documents.module.js';
import { DeskService } from './desk.service.js';
import { RackService } from './rack.service.js';
import { GuestsService } from './guests.service.js';
import { ReportsService } from './reports.service.js';
import { FinanceService } from './finance.service.js';
import { DayCloseService } from './day-close.service.js';
import { DayCloseController, DeskController, GuestsController, LostFoundController, MaintenanceController, PublicFeedbackController, RoomsHouseController } from './house.controllers.js';
import { UpkeepService } from './upkeep.service.js';
import { PushModule } from '../push/push.module.js';

/** Movement IV — the House. */
@Module({
  imports: [NotificationsModule, BookingModule, DocumentsModule, PushModule],
  controllers: [DayCloseController, DeskController, RoomsHouseController, GuestsController, PublicFeedbackController, MaintenanceController, LostFoundController],
  providers: [DeskService, RackService, GuestsService, ReportsService, FinanceService, DayCloseService, UpkeepService],
  exports: [DayCloseService, UpkeepService],
})
export class HouseModule {}
