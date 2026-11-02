import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import {
  zAdjustPayrollInput,
  zAssignStaffSystemRoleInput,
  zBatchPayPayrollInput,
  zBulkCreateShiftsInput,
  zCreateLeaveRequestInput,
  zCreateShiftInput,
  zCreateStaffDocumentInput,
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
  @Requires('hr:manage')
  overview() {
    return this.hr.overview();
  }

  /* ───── Staff Profiles ───── */

  @Get('staff')
  @Requires('hr:manage')
  listStaff(
    @Query('search') search?: string,
    @Query('department') department?: string,
    @Query('status') status?: string,
    @Query('employmentType') employmentType?: string,
  ) {
    return this.hr.listStaff({ search, department, status, employmentType });
  }

  @Get('staff/:id')
  @Requires('hr:manage')
  getStaff(@Param('id') id: string) {
    return this.hr.getStaff(id);
  }

  @Post('staff')
  @Requires('hr:manage')
  createStaff(
    @Body(new ZodPipe(zCreateStaffInput)) body: z.infer<typeof zCreateStaffInput>,
    @CurrentUser() user: AuthUser,
  ) {
    return this.hr.createStaff(body, user);
  }

  @Patch('staff/:id')
  @Requires('hr:manage')
  updateStaff(
    @Param('id') id: string,
    @Body(new ZodPipe(zUpdateStaffInput)) body: z.infer<typeof zUpdateStaffInput>,
    @CurrentUser() user: AuthUser,
  ) {
    return this.hr.updateStaff(id, body, user);
  }

  @Delete('staff/:id')
  @Requires('hr:manage')
  deleteStaff(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.hr.deleteStaff(id, user);
  }

  @Post('staff/:id/system-role')
  @Requires('hr:manage')
  assignSystemRole(
    @Param('id') id: string,
    @Body(new ZodPipe(zAssignStaffSystemRoleInput)) body: z.infer<typeof zAssignStaffSystemRoleInput>,
    @CurrentUser() user: AuthUser,
  ) {
    return this.hr.assignSystemRole(id, body, user);
  }

  /* ───── Staff Documents & Contracts ───── */

  @Get('documents')
  @Requires('hr:manage')
  listDocuments(@Query('staffId') staffId?: string) {
    return this.hr.listDocuments(staffId);
  }

  @Post('staff/:id/documents')
  @Requires('hr:manage')
  addDocument(
    @Param('id') staffId: string,
    @Body(new ZodPipe(zCreateStaffDocumentInput)) body: z.infer<typeof zCreateStaffDocumentInput>,
    @CurrentUser() user: AuthUser,
  ) {
    return this.hr.addDocument(staffId, body, user);
  }

  @Delete('documents/:docId')
  @Requires('hr:manage')
  deleteDocument(@Param('docId') docId: string, @CurrentUser() user: AuthUser) {
    return this.hr.deleteDocument(docId, user);
  }

  /* ───── Shift Rosters & Daily Attendance ───── */

  @Get('shifts')
  @Requires('hr:manage')
  listShifts(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('department') department?: string,
    @Query('staffId') staffId?: string,
  ) {
    return this.hr.listShifts({ startDate, endDate, department, staffId });
  }

  @Post('shifts')
  @Requires('hr:manage')
  createShift(
    @Body(new ZodPipe(zCreateShiftInput)) body: z.infer<typeof zCreateShiftInput>,
    @CurrentUser() user: AuthUser,
  ) {
    return this.hr.createShift(body, user);
  }

  @Post('shifts/bulk')
  @Requires('hr:manage')
  bulkCreateShifts(
    @Body(new ZodPipe(zBulkCreateShiftsInput)) body: z.infer<typeof zBulkCreateShiftsInput>,
    @CurrentUser() user: AuthUser,
  ) {
    return this.hr.bulkCreateShifts(body, user);
  }

  @Patch('shifts/:id')
  @Requires('hr:manage')
  updateShift(
    @Param('id') id: string,
    @Body(new ZodPipe(zUpdateShiftInput)) body: z.infer<typeof zUpdateShiftInput>,
    @CurrentUser() user: AuthUser,
  ) {
    return this.hr.updateShift(id, body, user);
  }

  @Delete('shifts/:id')
  @Requires('hr:manage')
  deleteShift(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.hr.deleteShift(id, user);
  }

  /* ───── Leave Management ───── */

  @Get('leaves')
  @Requires('hr:manage')
  listLeaveRequests(
    @Query('status') status?: string,
    @Query('department') department?: string,
    @Query('staffId') staffId?: string,
  ) {
    return this.hr.listLeaveRequests({ status, department, staffId });
  }

  @Post('leaves')
  @Requires('hr:manage')
  createLeaveRequest(
    @Body(new ZodPipe(zCreateLeaveRequestInput)) body: z.infer<typeof zCreateLeaveRequestInput>,
    @CurrentUser() user: AuthUser,
  ) {
    return this.hr.createLeaveRequest(body, user);
  }

  @Post('leaves/:id/review')
  @Requires('hr:manage')
  reviewLeaveRequest(
    @Param('id') id: string,
    @Body(new ZodPipe(zReviewLeaveRequestInput)) body: z.infer<typeof zReviewLeaveRequestInput>,
    @CurrentUser() user: AuthUser,
  ) {
    return this.hr.reviewLeaveRequest(id, body, user);
  }

  /* ───── Payroll ───── */

  @Get('payroll')
  @Requires('hr:manage')
  listPayroll(
    @Query('periodMonth') periodMonth?: string,
    @Query('paymentStatus') paymentStatus?: string,
  ) {
    return this.hr.listPayroll({ periodMonth, paymentStatus });
  }

  @Post('payroll/generate')
  @Requires('hr:manage')
  generatePayroll(
    @Body(new ZodPipe(zGeneratePayrollInput)) body: z.infer<typeof zGeneratePayrollInput>,
    @CurrentUser() user: AuthUser,
  ) {
    return this.hr.generatePayroll(body, user);
  }

  @Post('payroll/pay-all')
  @Requires('hr:manage')
  batchPayPayroll(
    @Body(new ZodPipe(zBatchPayPayrollInput)) body: z.infer<typeof zBatchPayPayrollInput>,
    @CurrentUser() user: AuthUser,
  ) {
    return this.hr.batchPayPayroll(body, user);
  }

  @Patch('payroll/:id')
  @Requires('hr:manage')
  adjustPayroll(
    @Param('id') id: string,
    @Body(new ZodPipe(zAdjustPayrollInput)) body: z.infer<typeof zAdjustPayrollInput>,
    @CurrentUser() user: AuthUser,
  ) {
    return this.hr.adjustPayroll(id, body, user);
  }

  @Patch('payroll/:id/status')
  @Requires('hr:manage')
  updatePayrollStatus(
    @Param('id') id: string,
    @Body(new ZodPipe(zUpdatePayrollStatusInput)) body: z.infer<typeof zUpdatePayrollStatusInput>,
    @CurrentUser() user: AuthUser,
  ) {
    return this.hr.updatePayrollStatus(id, body, user);
  }
}
