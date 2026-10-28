import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import {
  zCreateLeaveRequestInput,
  zCreateShiftInput,
  zCreateStaffInput,
  zGeneratePayrollInput,
  zReviewLeaveRequestInput,
  zUpdatePayrollStatusInput,
  zUpdateShiftInput,
  zUpdateStaffInput,
} from '@reberon/contracts';
import { CurrentUser, Requires, type AuthUser } from '../../common/auth.js';
import { ZodPipe } from '../../common/zod.pipe.js';
import { HrService } from './hr.service.js';

@Controller('v1/admin/hr')
export class HrController {
  constructor(private readonly hr: HrService) {}

  /* ───── Overview ───── */

  @Get('overview')
  @Requires('inventory:manage')
  overview() {
    return this.hr.overview();
  }

  /* ───── Staff Profiles ───── */

  @Get('staff')
  @Requires('inventory:manage')
  listStaff(
    @Query('search') search?: string,
    @Query('department') department?: string,
    @Query('status') status?: string,
    @Query('employmentType') employmentType?: string,
  ) {
    return this.hr.listStaff({ search, department, status, employmentType });
  }

  @Get('staff/:id')
  @Requires('inventory:manage')
  getStaff(@Param('id') id: string) {
    return this.hr.getStaff(id);
  }

  @Post('staff')
  @Requires('inventory:manage')
  createStaff(
    @Body(new ZodPipe(zCreateStaffInput)) body: z.infer<typeof zCreateStaffInput>,
    @CurrentUser() user: AuthUser,
  ) {
    return this.hr.createStaff(body, user);
  }

  @Patch('staff/:id')
  @Requires('inventory:manage')
  updateStaff(
    @Param('id') id: string,
    @Body(new ZodPipe(zUpdateStaffInput)) body: z.infer<typeof zUpdateStaffInput>,
    @CurrentUser() user: AuthUser,
  ) {
    return this.hr.updateStaff(id, body, user);
  }

  @Delete('staff/:id')
  @Requires('inventory:manage')
  deleteStaff(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.hr.deleteStaff(id, user);
  }

  /* ───── Shift Rosters & Daily Attendance ───── */

  @Get('shifts')
  @Requires('inventory:manage')
  listShifts(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('department') department?: string,
    @Query('staffId') staffId?: string,
  ) {
    return this.hr.listShifts({ startDate, endDate, department, staffId });
  }

  @Post('shifts')
  @Requires('inventory:manage')
  createShift(
    @Body(new ZodPipe(zCreateShiftInput)) body: z.infer<typeof zCreateShiftInput>,
    @CurrentUser() user: AuthUser,
  ) {
    return this.hr.createShift(body, user);
  }

  @Patch('shifts/:id')
  @Requires('inventory:manage')
  updateShift(
    @Param('id') id: string,
    @Body(new ZodPipe(zUpdateShiftInput)) body: z.infer<typeof zUpdateShiftInput>,
    @CurrentUser() user: AuthUser,
  ) {
    return this.hr.updateShift(id, body, user);
  }

  /* ───── Leave Management ───── */

  @Get('leaves')
  @Requires('inventory:manage')
  listLeaveRequests(
    @Query('status') status?: string,
    @Query('department') department?: string,
    @Query('staffId') staffId?: string,
  ) {
    return this.hr.listLeaveRequests({ status, department, staffId });
  }

  @Post('leaves')
  @Requires('inventory:manage')
  createLeaveRequest(
    @Body(new ZodPipe(zCreateLeaveRequestInput)) body: z.infer<typeof zCreateLeaveRequestInput>,
    @CurrentUser() user: AuthUser,
  ) {
    return this.hr.createLeaveRequest(body, user);
  }

  @Post('leaves/:id/review')
  @Requires('inventory:manage')
  reviewLeaveRequest(
    @Param('id') id: string,
    @Body(new ZodPipe(zReviewLeaveRequestInput)) body: z.infer<typeof zReviewLeaveRequestInput>,
    @CurrentUser() user: AuthUser,
  ) {
    return this.hr.reviewLeaveRequest(id, body, user);
  }

  /* ───── Payroll ───── */

  @Get('payroll')
  @Requires('inventory:manage')
  listPayroll(
    @Query('periodMonth') periodMonth?: string,
    @Query('paymentStatus') paymentStatus?: string,
  ) {
    return this.hr.listPayroll({ periodMonth, paymentStatus });
  }

  @Post('payroll/generate')
  @Requires('inventory:manage')
  generatePayroll(
    @Body(new ZodPipe(zGeneratePayrollInput)) body: z.infer<typeof zGeneratePayrollInput>,
    @CurrentUser() user: AuthUser,
  ) {
    return this.hr.generatePayroll(body, user);
  }

  @Patch('payroll/:id/status')
  @Requires('inventory:manage')
  updatePayrollStatus(
    @Param('id') id: string,
    @Body(new ZodPipe(zUpdatePayrollStatusInput)) body: z.infer<typeof zUpdatePayrollStatusInput>,
    @CurrentUser() user: AuthUser,
  ) {
    return this.hr.updatePayrollStatus(id, body, user);
  }
}
