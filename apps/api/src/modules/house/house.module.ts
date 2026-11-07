import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { BookingModule } from '../booking/booking.module.js';
import { DocumentsModule } from '../documents/documents.module.js';
import { DeskService } from './desk.service.js';
import { RackService } from './rack.service.js';
import { GuestsService } from './guests.service.js';
import { ReportsService } from './reports.service.js';
import { FinanceService } from './finance.service.js';
import { DeskController, GuestsController, PublicFeedbackController, RoomsHouseController } from './house.controllers.js';

/** Movement IV — the House. */
@Module({
  imports: [NotificationsModule, BookingModule, DocumentsModule],
  controllers: [DeskController, RoomsHouseController, GuestsController, PublicFeedbackController],
  providers: [DeskService, RackService, GuestsService, ReportsService, FinanceService],
})
export class HouseModule {}
