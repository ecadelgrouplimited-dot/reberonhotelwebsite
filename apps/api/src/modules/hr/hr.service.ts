import { Injectable } from '@nestjs/common';
import type {
  HrDashboardDTO,
  StaffDocumentDTO,
  StaffLeaveRequestDTO,
  StaffPayrollRecordDTO,
  StaffProfileDTO,
  StaffShiftDTO,
} from '@reberon/contracts';
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
import { PrismaService } from '../../common/prisma.service.js';
import { AuditService } from '../../common/audit.service.js';
import { type AuthUser } from '../../common/auth.js';
import { badRequest, forbidden, notFound } from '../../common/errors.js';

@Injectable()
export class HrService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private async generateEmployeeNumber(): Promise<string> {
    const count = await this.prisma.staffProfile.count();
    return `REB-EMP-${String(count + 1).padStart(3, '0')}`;
  }

  async ensureDefaultStaff(): Promise<void> {
    const count = await this.prisma.staffProfile.count();
    if (count > 0) return;

    const users = await this.prisma.user.findMany({
      select: { id: true, email: true },
    });
    const userByEmail = new Map<string, string>();
    for (const u of users) {
      if (u.email) userByEmail.set(u.email.toLowerCase(), u.id);
    }

    const defaultStaff = [
      {
        employeeNumber: 'REB-EMP-001',
        firstName: 'Denis',
        lastName: 'Mayamba',
        email: 'owner@reberonhotel.com',
        phone: '+256700000101',
        nationalIdNumber: 'CM8602910398KL',
        departmentCode: 'ADMIN_GENERAL',
        jobTitle: 'Managing Director & Owner',
        employmentType: 'FULL_TIME',
        baseSalaryMinor: 8500000n,
        paymentMethod: 'BANK_TRANSFER',
        bankName: 'Stanbic Bank Uganda',
        bankAccountNumber: '9030018274619',
        emergencyContactName: 'Wilson Ecaat',
        emergencyContactPhone: '+256700000102',
        emergencyContactRelation: 'CO_DIRECTOR',
      },
      {
        employeeNumber: 'REB-EMP-002',
        firstName: 'Grace',
        lastName: 'Chemutai',
        email: 'manager@reberonhotel.com',
        phone: '+256700000103',
        nationalIdNumber: 'CF9001827364MA',
        departmentCode: 'ADMIN_GENERAL',
        jobTitle: 'General Manager',
        employmentType: 'FULL_TIME',
        baseSalaryMinor: 6000000n,
        paymentMethod: 'BANK_TRANSFER',
        bankName: 'Standard Chartered Uganda',
        bankAccountNumber: '0102847192800',
        emergencyContactName: 'David Chemutai',
        emergencyContactPhone: '+256772182930',
        emergencyContactRelation: 'SPOUSE',
      },
      {
        employeeNumber: 'REB-EMP-003',
        firstName: 'Brian',
        lastName: 'Cheptoek',
        email: 'desk@reberonhotel.com',
        phone: '+256700000104',
        nationalIdNumber: 'CM9304819283KA',
        departmentCode: 'FRONT_DESK',
        jobTitle: 'Front Desk Supervisor',
        employmentType: 'FULL_TIME',
        baseSalaryMinor: 2400000n,
        paymentMethod: 'MOBILE_MONEY',
        mobileMoneyNumber: '+256700000104',
        emergencyContactName: 'Betty Cheptoek',
        emergencyContactPhone: '+256773829102',
        emergencyContactRelation: 'SISTER',
      },
      {
        employeeNumber: 'REB-EMP-004',
        firstName: 'Joan',
        lastName: 'Nekesa',
        email: 'relief.desk@reberonhotel.com',
        phone: '+256700000113',
        nationalIdNumber: 'CF9502938471TR',
        departmentCode: 'FRONT_DESK',
        jobTitle: 'Guest Relations Officer',
        employmentType: 'FULL_TIME',
        baseSalaryMinor: 1800000n,
        paymentMethod: 'MOBILE_MONEY',
        mobileMoneyNumber: '+256700000113',
        emergencyContactName: 'Peter Nekesa',
        emergencyContactPhone: '+256782910394',
        emergencyContactRelation: 'BROTHER',
      },
      {
        employeeNumber: 'REB-EMP-005',
        firstName: 'Chef Isaac',
        lastName: 'Mangusho',
        email: 'kitchen@reberonhotel.com',
        phone: '+256700000106',
        nationalIdNumber: 'CM8801928374MB',
        departmentCode: 'KITCHEN',
        jobTitle: 'Executive Head Chef',
        employmentType: 'FULL_TIME',
        baseSalaryMinor: 4500000n,
        paymentMethod: 'BANK_TRANSFER',
        bankName: 'Centenary Bank',
        bankAccountNumber: '3100293847',
        emergencyContactName: 'Amina Mangusho',
        emergencyContactPhone: '+256774910293',
        emergencyContactRelation: 'SPOUSE',
      },
      {
        employeeNumber: 'REB-EMP-006',
        firstName: 'Chef Michael',
        lastName: 'Mukasa',
        email: 'chef.michael@reberonhotel.com',
        phone: '+256700000114',
        nationalIdNumber: 'CM9103829102KL',
        departmentCode: 'KITCHEN',
        jobTitle: 'Sous Chef & Pastry Lead',
        employmentType: 'FULL_TIME',
        baseSalaryMinor: 2800000n,
        paymentMethod: 'MOBILE_MONEY',
        mobileMoneyNumber: '+256700000114',
        emergencyContactName: 'Florence Mukasa',
        emergencyContactPhone: '+256701928374',
        emergencyContactRelation: 'MOTHER',
      },
      {
        employeeNumber: 'REB-EMP-007',
        firstName: 'Samuel',
        lastName: 'Kiprop',
        email: 'bar@reberonhotel.com',
        phone: '+256700000105',
        nationalIdNumber: 'CM9203948172KP',
        departmentCode: 'BAR',
        jobTitle: 'Head Mixologist & Beverage Manager',
        employmentType: 'FULL_TIME',
        baseSalaryMinor: 2600000n,
        paymentMethod: 'MOBILE_MONEY',
        mobileMoneyNumber: '+256700000105',
        emergencyContactName: 'Stella Kiprop',
        emergencyContactPhone: '+256782019283',
        emergencyContactRelation: 'SPOUSE',
      },
      {
        employeeNumber: 'REB-EMP-008',
        firstName: 'Denis',
        lastName: 'Kato',
        email: 'denis.kato@reberonhotel.com',
        phone: '+256700000115',
        nationalIdNumber: 'CM9402918273KA',
        departmentCode: 'BAR',
        jobTitle: 'Lounge Barista & Sommelier',
        employmentType: 'FULL_TIME',
        baseSalaryMinor: 2000000n,
        paymentMethod: 'MOBILE_MONEY',
        mobileMoneyNumber: '+256700000115',
        emergencyContactName: 'Paul Kato',
        emergencyContactPhone: '+256752019283',
        emergencyContactRelation: 'BROTHER',
      },
      {
        employeeNumber: 'REB-EMP-009',
        firstName: 'Coach Daniel',
        lastName: 'Cherop',
        email: 'gym@reberonhotel.com',
        phone: '+256700000107',
        nationalIdNumber: 'CM8902819203CH',
        departmentCode: 'HEALTH_CLUB',
        jobTitle: 'Health Club, Gym & Spa Director',
        employmentType: 'FULL_TIME',
        baseSalaryMinor: 3000000n,
        paymentMethod: 'BANK_TRANSFER',
        bankName: 'Absa Bank Uganda',
        bankAccountNumber: '6002938471',
        emergencyContactName: 'Gloria Cherop',
        emergencyContactPhone: '+256773910293',
        emergencyContactRelation: 'SPOUSE',
      },
      {
        employeeNumber: 'REB-EMP-010',
        firstName: 'Sarah',
        lastName: 'Chelangat',
        email: 'housekeeping@reberonhotel.com',
        phone: '+256700000110',
        nationalIdNumber: 'CF9102837461KP',
        departmentCode: 'HOUSEKEEPING',
        jobTitle: 'Executive Housekeeper',
        employmentType: 'FULL_TIME',
        baseSalaryMinor: 2800000n,
        paymentMethod: 'BANK_TRANSFER',
        bankName: 'Stanbic Bank Uganda',
        bankAccountNumber: '9030029182741',
        emergencyContactName: 'James Chelangat',
        emergencyContactPhone: '+256701928301',
        emergencyContactRelation: 'BROTHER',
      },
      {
        employeeNumber: 'REB-EMP-011',
        firstName: 'Esther',
        lastName: 'Chebet',
        phone: '+256700000111',
        nationalIdNumber: 'CF9601928374KP',
        departmentCode: 'HOUSEKEEPING',
        jobTitle: 'Senior Linen & Room Attendant',
        employmentType: 'FULL_TIME',
        baseSalaryMinor: 1500000n,
        paymentMethod: 'MOBILE_MONEY',
        mobileMoneyNumber: '+256700000111',
        emergencyContactName: 'Rose Chebet',
        emergencyContactPhone: '+256772910293',
        emergencyContactRelation: 'MOTHER',
      },
      {
        employeeNumber: 'REB-EMP-012',
        firstName: 'Patrick',
        lastName: 'Ochieng',
        email: 'events@reberonhotel.com',
        phone: '+256700000116',
        nationalIdNumber: 'CM8702918273JG',
        departmentCode: 'CONFERENCE',
        jobTitle: 'Events & Conference Manager',
        employmentType: 'FULL_TIME',
        baseSalaryMinor: 3500000n,
        paymentMethod: 'BANK_TRANSFER',
        bankName: 'dfcu Bank',
        bankAccountNumber: '0182736451928',
        emergencyContactName: 'Brenda Ochieng',
        emergencyContactPhone: '+256782910394',
        emergencyContactRelation: 'SPOUSE',
      },
      {
        employeeNumber: 'REB-EMP-013',
        firstName: 'Eng. David',
        lastName: 'Ssemwogerere',
        email: 'engineering@reberonhotel.com',
        phone: '+256700000117',
        nationalIdNumber: 'CM8501928374MK',
        departmentCode: 'MAINTENANCE',
        jobTitle: 'Chief Facilities Engineer',
        employmentType: 'FULL_TIME',
        baseSalaryMinor: 4200000n,
        paymentMethod: 'BANK_TRANSFER',
        bankName: 'Stanbic Bank Uganda',
        bankAccountNumber: '9030038192837',
        emergencyContactName: 'Ruth Ssemwogerere',
        emergencyContactPhone: '+256772819203',
        emergencyContactRelation: 'SPOUSE',
      },
      {
        employeeNumber: 'REB-EMP-014',
        firstName: 'Eng. Isaac',
        lastName: 'Tumusiime',
        email: 'utilities@reberonhotel.com',
        phone: '+256700000118',
        nationalIdNumber: 'CM8802918273MB',
        departmentCode: 'ENERGY_UTILITIES',
        jobTitle: 'Power & Utilities Lead',
        employmentType: 'FULL_TIME',
        baseSalaryMinor: 3800000n,
        paymentMethod: 'BANK_TRANSFER',
        bankName: 'Centenary Bank',
        bankAccountNumber: '3100284719',
        emergencyContactName: 'Hellen Tumusiime',
        emergencyContactPhone: '+256701829384',
        emergencyContactRelation: 'SPOUSE',
      },
      {
        employeeNumber: 'REB-EMP-015',
        firstName: 'Moses',
        lastName: 'Kiprotich',
        phone: '+256700000112',
        nationalIdNumber: 'CM9401928374KP',
        departmentCode: 'MAINTENANCE',
        jobTitle: 'Security & Safety Lead',
        employmentType: 'FULL_TIME',
        baseSalaryMinor: 1600000n,
        paymentMethod: 'MOBILE_MONEY',
        mobileMoneyNumber: '+256700000112',
        emergencyContactName: 'Jane Kiprotich',
        emergencyContactPhone: '+256774819203',
        emergencyContactRelation: 'SISTER',
      },
    ];

    const staffMap = new Map<string, string>();
    for (const s of defaultStaff) {
      const uId = s.email ? userByEmail.get(s.email.toLowerCase()) : null;
      const created = await this.prisma.staffProfile.upsert({
        where: { employeeNumber: s.employeeNumber },
        update: {},
        create: {
          employeeNumber: s.employeeNumber,
          userId: uId || null,
          firstName: s.firstName,
          lastName: s.lastName,
          phone: s.phone,
          email: s.email || null,
          nationalIdNumber: s.nationalIdNumber,
          departmentCode: s.departmentCode,
          jobTitle: s.jobTitle,
          employmentType: s.employmentType,
          dateJoined: new Date('2026-01-15'),
          baseSalaryMinor: s.baseSalaryMinor,
          currency: 'UGX',
          paymentMethod: s.paymentMethod,
          bankName: (s as any).bankName || null,
          bankAccountNumber: (s as any).bankAccountNumber || null,
          mobileMoneyNumber: (s as any).mobileMoneyNumber || null,
          emergencyContactName: s.emergencyContactName,
          emergencyContactPhone: s.emergencyContactPhone,
          emergencyContactRelation: s.emergencyContactRelation,
          status: 'ACTIVE',
          isSeed: true,
        },
      });
      staffMap.set(s.employeeNumber, created.id);
    }

    const deptHeadMapping: Record<string, string> = {
      ADMIN_GENERAL: 'REB-EMP-002',
      FRONT_DESK: 'REB-EMP-003',
      KITCHEN: 'REB-EMP-005',
      BAR: 'REB-EMP-007',
      HEALTH_CLUB: 'REB-EMP-009',
      HOUSEKEEPING: 'REB-EMP-010',
      CONFERENCE: 'REB-EMP-012',
      MAINTENANCE: 'REB-EMP-013',
      ENERGY_UTILITIES: 'REB-EMP-014',
    };

    for (const [deptCode, empNo] of Object.entries(deptHeadMapping)) {
      const staffId = staffMap.get(empNo);
      if (staffId) {
        const staff = await this.prisma.staffProfile.findUnique({ where: { id: staffId } });
        if (staff) {
          await this.prisma.hotelDepartment.updateMany({
            where: { code: deptCode },
            data: {
              headStaffId: staff.id,
              headName: `${staff.firstName} ${staff.lastName}`,
            },
          });
        }
      }
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const shiftData = [
      { empNo: 'REB-EMP-003', dept: 'FRONT_DESK', shiftType: 'MORNING', start: '06:00', end: '14:00' },
      { empNo: 'REB-EMP-004', dept: 'FRONT_DESK', shiftType: 'EVENING', start: '14:00', end: '22:00' },
      { empNo: 'REB-EMP-005', dept: 'KITCHEN', shiftType: 'MORNING', start: '06:00', end: '15:00' },
      { empNo: 'REB-EMP-006', dept: 'KITCHEN', shiftType: 'EVENING', start: '14:00', end: '22:30' },
      { empNo: 'REB-EMP-007', dept: 'BAR', shiftType: 'EVENING', start: '16:00', end: '00:00' },
      { empNo: 'REB-EMP-009', dept: 'HEALTH_CLUB', shiftType: 'FULL_DAY', start: '06:00', end: '18:00' },
      { empNo: 'REB-EMP-010', dept: 'HOUSEKEEPING', shiftType: 'MORNING', start: '07:30', end: '16:00' },
      { empNo: 'REB-EMP-011', dept: 'HOUSEKEEPING', shiftType: 'MORNING', start: '07:30', end: '16:00' },
      { empNo: 'REB-EMP-015', dept: 'MAINTENANCE', shiftType: 'NIGHT', start: '22:00', end: '06:00' },
    ];

    for (const sh of shiftData) {
      const sId = staffMap.get(sh.empNo);
      if (sId) {
        await this.prisma.staffShift.create({
          data: {
            staffId: sId,
            departmentCode: sh.dept,
            date: today,
            shiftType: sh.shiftType,
            scheduledStartTime: sh.start,
            scheduledEndTime: sh.end,
            attendanceStatus: 'SCHEDULED',
          },
        });
      }
    }
  }

  /* ───────────────────────── 1. HR Overview & Metrics ───────────────────────── */

  async overview(): Promise<HrDashboardDTO> {
    await this.ensureDefaultStaff();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const [allStaff, shiftsToday, pendingLeaves] = await Promise.all([
      this.prisma.staffProfile.findMany({
        select: { id: true, status: true, departmentCode: true, baseSalaryMinor: true },
      }),
      this.prisma.staffShift.findMany({
        where: {
          date: { gte: today, lt: tomorrow },
        },
        select: { id: true, attendanceStatus: true },
      }),
      this.prisma.staffLeaveRequest.count({
        where: { status: 'PENDING' },
      }),
    ]);

    const activeStaff = allStaff.filter((s) => s.status === 'ACTIVE');
    const onLeaveToday = allStaff.filter((s) => s.status === 'ON_LEAVE').length;
    const scheduledShiftsToday = shiftsToday.length;

    const totalMonthlyPayrollMinor = activeStaff.reduce(
      (sum, s) => sum + BigInt(s.baseSalaryMinor),
      0n,
    );

    const departmentHeadcounts: Record<string, number> = {};
    for (const s of activeStaff) {
      departmentHeadcounts[s.departmentCode] = (departmentHeadcounts[s.departmentCode] || 0) + 1;
    }

    return {
      totalStaff: allStaff.length,
      activeStaff: activeStaff.length,
      onLeaveToday,
      scheduledShiftsToday,
      pendingLeaveRequests: pendingLeaves,
      totalMonthlyPayrollMinor: totalMonthlyPayrollMinor.toString(),
      departmentHeadcounts,
    };
  }

  /* ───────────────────────── 2. Staff Profiles ───────────────────────── */

  async listStaff(filters?: {
    search?: string;
    department?: string;
    status?: string;
    employmentType?: string;
  }): Promise<StaffProfileDTO[]> {
    await this.ensureDefaultStaff();
    const where: Record<string, unknown> = {};

    if (filters?.department && filters.department !== 'ALL') {
      where.departmentCode = filters.department;
    }
    if (filters?.status && filters.status !== 'ALL') {
      where.status = filters.status;
    }
    if (filters?.employmentType && filters.employmentType !== 'ALL') {
      where.employmentType = filters.employmentType;
    }

    if (filters?.search?.trim()) {
      const q = filters.search.trim();
      where.OR = [
        { firstName: { contains: q, mode: 'insensitive' } },
        { lastName: { contains: q, mode: 'insensitive' } },
        { employeeNumber: { contains: q, mode: 'insensitive' } },
        { phone: { contains: q, mode: 'insensitive' } },
        { jobTitle: { contains: q, mode: 'insensitive' } },
      ];
    }

    const [staffList, departments] = await Promise.all([
      this.prisma.staffProfile.findMany({
        where,
        orderBy: [{ status: 'asc' }, { firstName: 'asc' }, { lastName: 'asc' }],
        include: {
          _count: {
            select: {
              shifts: true,
              leaveRequests: { where: { status: 'PENDING' } },
            },
          },
        },
      }),
      this.prisma.hotelDepartment.findMany({ select: { code: true, name: true } }),
    ]);

    const deptMap = new Map<string, string>(departments.map((d) => [d.code, d.name]));

    return staffList.map((s) => ({
      id: s.id,
      employeeNumber: s.employeeNumber,
      userId: s.userId,
      firstName: s.firstName,
      lastName: s.lastName,
      otherNames: s.otherNames,
      fullName: [s.firstName, s.lastName, s.otherNames].filter(Boolean).join(' '),
      gender: s.gender as any,
      dateOfBirth: s.dateOfBirth?.toISOString().slice(0, 10) ?? null,
      nationalIdNumber: s.nationalIdNumber,
      phone: s.phone,
      alternatePhone: s.alternatePhone,
      email: s.email,
      residenceAddress: s.residenceAddress,
      emergencyContactName: s.emergencyContactName,
      emergencyContactPhone: s.emergencyContactPhone,
      emergencyContactRelation: s.emergencyContactRelation,
      departmentCode: s.departmentCode,
      departmentName: deptMap.get(s.departmentCode) ?? s.departmentCode,
      jobTitle: s.jobTitle,
      employmentType: s.employmentType as any,
      dateJoined: s.dateJoined.toISOString().slice(0, 10),
      contractEndDate: s.contractEndDate?.toISOString().slice(0, 10) ?? null,
      baseSalaryMinor: s.baseSalaryMinor.toString(),
      currency: s.currency as any,
      paymentMethod: s.paymentMethod as any,
      bankName: s.bankName,
      bankAccountNumber: s.bankAccountNumber,
      mobileMoneyNumber: s.mobileMoneyNumber,
      nssfNumber: s.nssfNumber,
      tinNumber: s.tinNumber,
      status: s.status as any,
      avatarUrl: s.avatarUrl,
      notes: s.notes,
      isSeed: s.isSeed,
      activeShiftsCount: s._count.shifts,
      pendingLeavesCount: s._count.leaveRequests,
      createdAt: s.createdAt.toISOString(),
      updatedAt: s.updatedAt.toISOString(),
    }));
  }

  async getStaff(id: string): Promise<StaffProfileDTO & {
    shifts: StaffShiftDTO[];
    leaveRequests: StaffLeaveRequestDTO[];
    payrollRecords: StaffPayrollRecordDTO[];
    documents: StaffDocumentDTO[];
  }> {
    const staff = await this.prisma.staffProfile.findUnique({
      where: { id },
      include: {
        shifts: { orderBy: { date: 'desc' }, take: 10 },
        leaveRequests: { orderBy: { startDate: 'desc' }, take: 5 },
        payrollRecords: { orderBy: { periodMonth: 'desc' }, take: 6 },
        documents: { orderBy: { createdAt: 'desc' } },
      },
    });
    if (!staff) throw notFound('Staff Profile');

    const dept = await this.prisma.hotelDepartment.findUnique({
      where: { code: staff.departmentCode },
      select: { name: true },
    });

    return {
      id: staff.id,
      employeeNumber: staff.employeeNumber,
      userId: staff.userId,
      firstName: staff.firstName,
      lastName: staff.lastName,
      otherNames: staff.otherNames,
      fullName: [staff.firstName, staff.lastName, staff.otherNames].filter(Boolean).join(' '),
      gender: staff.gender as any,
      dateOfBirth: staff.dateOfBirth?.toISOString().slice(0, 10) ?? null,
      nationalIdNumber: staff.nationalIdNumber,
      phone: staff.phone,
      alternatePhone: staff.alternatePhone,
      email: staff.email,
      residenceAddress: staff.residenceAddress,
      emergencyContactName: staff.emergencyContactName,
      emergencyContactPhone: staff.emergencyContactPhone,
      emergencyContactRelation: staff.emergencyContactRelation,
      departmentCode: staff.departmentCode,
      departmentName: dept?.name ?? staff.departmentCode,
      jobTitle: staff.jobTitle,
      employmentType: staff.employmentType as any,
      dateJoined: staff.dateJoined.toISOString().slice(0, 10),
      contractEndDate: staff.contractEndDate?.toISOString().slice(0, 10) ?? null,
      baseSalaryMinor: staff.baseSalaryMinor.toString(),
      currency: staff.currency as any,
      paymentMethod: staff.paymentMethod as any,
      bankName: staff.bankName,
      bankAccountNumber: staff.bankAccountNumber,
      mobileMoneyNumber: staff.mobileMoneyNumber,
      nssfNumber: staff.nssfNumber,
      tinNumber: staff.tinNumber,
      status: staff.status as any,
      avatarUrl: staff.avatarUrl,
      notes: staff.notes,
      isSeed: staff.isSeed,
      createdAt: staff.createdAt.toISOString(),
      updatedAt: staff.updatedAt.toISOString(),
      shifts: staff.shifts.map((sh) => ({
        id: sh.id,
        staffId: sh.staffId,
        departmentCode: sh.departmentCode,
        date: sh.date.toISOString().slice(0, 10),
        shiftType: sh.shiftType as any,
        scheduledStartTime: sh.scheduledStartTime,
        scheduledEndTime: sh.scheduledEndTime,
        actualCheckIn: sh.actualCheckIn?.toISOString() ?? null,
        actualCheckOut: sh.actualCheckOut?.toISOString() ?? null,
        attendanceStatus: sh.attendanceStatus as any,
        notes: sh.notes,
        createdAt: sh.createdAt.toISOString(),
        updatedAt: sh.updatedAt.toISOString(),
      })),
      leaveRequests: staff.leaveRequests.map((l) => ({
        id: l.id,
        staffId: l.staffId,
        leaveType: l.leaveType as any,
        startDate: l.startDate.toISOString().slice(0, 10),
        endDate: l.endDate.toISOString().slice(0, 10),
        daysCount: l.daysCount,
        reason: l.reason,
        handoverNotes: l.handoverNotes,
        status: l.status as any,
        reviewedById: l.reviewedById,
        reviewedByName: l.reviewedByName,
        reviewNotes: l.reviewNotes,
        reviewedAt: l.reviewedAt?.toISOString() ?? null,
        createdAt: l.createdAt.toISOString(),
        updatedAt: l.updatedAt.toISOString(),
      })),
      payrollRecords: staff.payrollRecords.map((p) => ({
        id: p.id,
        staffId: p.staffId,
        periodMonth: p.periodMonth,
        baseSalaryMinor: p.baseSalaryMinor.toString(),
        overtimeMinor: p.overtimeMinor.toString(),
        allowancesMinor: p.allowancesMinor.toString(),
        grossSalaryMinor: p.grossSalaryMinor.toString(),
        payeTaxMinor: p.payeTaxMinor.toString(),
        nssfEmployeeMinor: p.nssfEmployeeMinor.toString(),
        nssfEmployerMinor: p.nssfEmployerMinor.toString(),
        advancesDeductionMinor: p.advancesDeductionMinor.toString(),
        otherDeductionsMinor: p.otherDeductionsMinor.toString(),
        netSalaryMinor: p.netSalaryMinor.toString(),
        currency: p.currency as any,
        paymentStatus: p.paymentStatus as any,
        paymentReference: p.paymentReference,
        paidAt: p.paidAt?.toISOString() ?? null,
        createdAt: p.createdAt.toISOString(),
        updatedAt: p.updatedAt.toISOString(),
      })),
      documents: staff.documents.map((d) => ({
        id: d.id,
        staffId: d.staffId,
        title: d.title,
        kind: d.kind,
        fileUrl: d.fileUrl,
        expiryDate: d.expiryDate?.toISOString().slice(0, 10) ?? null,
        notes: d.notes,
        createdAt: d.createdAt.toISOString(),
      })),
    };
  }

  async createStaff(input: z.infer<typeof zCreateStaffInput>, actor: AuthUser): Promise<StaffProfileDTO> {
    const employeeNumber = input.employeeNumber?.trim() || (await this.generateEmployeeNumber());

    const existing = await this.prisma.staffProfile.findUnique({ where: { employeeNumber } });
    if (existing) {
      throw badRequest(`Staff with employee number "${employeeNumber}" already exists.`);
    }

    const created = await this.prisma.staffProfile.create({
      data: {
        employeeNumber,
        userId: input.userId ?? null,
        firstName: input.firstName.trim(),
        lastName: input.lastName.trim(),
        otherNames: input.otherNames?.trim() || null,
        gender: input.gender ?? 'OTHER',
        dateOfBirth: input.dateOfBirth ? new Date(input.dateOfBirth) : null,
        nationalIdNumber: input.nationalIdNumber?.trim() || null,
        phone: input.phone.trim(),
        alternatePhone: input.alternatePhone?.trim() || null,
        email: input.email?.trim() || null,
        residenceAddress: input.residenceAddress?.trim() || null,
        emergencyContactName: input.emergencyContactName.trim(),
        emergencyContactPhone: input.emergencyContactPhone.trim(),
        emergencyContactRelation: input.emergencyContactRelation?.trim() || 'NEXT_OF_KIN',
        departmentCode: input.departmentCode.trim(),
        jobTitle: input.jobTitle.trim(),
        employmentType: input.employmentType ?? 'FULL_TIME',
        dateJoined: input.dateJoined ? new Date(input.dateJoined) : new Date(),
        contractEndDate: input.contractEndDate ? new Date(input.contractEndDate) : null,
        baseSalaryMinor: BigInt(input.baseSalaryMinor || '0'),
        currency: (input.currency as any) || 'UGX',
        paymentMethod: input.paymentMethod ?? 'BANK_TRANSFER',
        bankName: input.bankName?.trim() || null,
        bankAccountNumber: input.bankAccountNumber?.trim() || null,
        mobileMoneyNumber: input.mobileMoneyNumber?.trim() || null,
        nssfNumber: input.nssfNumber?.trim() || null,
        tinNumber: input.tinNumber?.trim() || null,
        status: input.status ?? 'ACTIVE',
        avatarUrl: input.avatarUrl || null,
        notes: input.notes?.trim() || null,
      },
    });

    await this.audit.record({
      actor,
      action: 'staff.create',
      entityType: 'StaffProfile',
      entityId: created.id,
      summary: `Created staff profile ${created.firstName} ${created.lastName} (${created.employeeNumber}) · ${created.jobTitle}`,
    });

    return {
      id: created.id,
      employeeNumber: created.employeeNumber,
      userId: created.userId,
      firstName: created.firstName,
      lastName: created.lastName,
      otherNames: created.otherNames,
      fullName: [created.firstName, created.lastName, created.otherNames].filter(Boolean).join(' '),
      gender: created.gender as any,
      dateOfBirth: created.dateOfBirth?.toISOString().slice(0, 10) ?? null,
      nationalIdNumber: created.nationalIdNumber,
      phone: created.phone,
      alternatePhone: created.alternatePhone,
      email: created.email,
      residenceAddress: created.residenceAddress,
      emergencyContactName: created.emergencyContactName,
      emergencyContactPhone: created.emergencyContactPhone,
      emergencyContactRelation: created.emergencyContactRelation,
      departmentCode: created.departmentCode,
      jobTitle: created.jobTitle,
      employmentType: created.employmentType as any,
      dateJoined: created.dateJoined.toISOString().slice(0, 10),
      contractEndDate: created.contractEndDate?.toISOString().slice(0, 10) ?? null,
      baseSalaryMinor: created.baseSalaryMinor.toString(),
      currency: created.currency as any,
      paymentMethod: created.paymentMethod as any,
      bankName: created.bankName,
      bankAccountNumber: created.bankAccountNumber,
      mobileMoneyNumber: created.mobileMoneyNumber,
      nssfNumber: created.nssfNumber,
      tinNumber: created.tinNumber,
      status: created.status as any,
      avatarUrl: created.avatarUrl,
      notes: created.notes,
      isSeed: created.isSeed,
      createdAt: created.createdAt.toISOString(),
      updatedAt: created.updatedAt.toISOString(),
    };
  }

  async updateStaff(
    id: string,
    input: z.infer<typeof zUpdateStaffInput>,
    actor: AuthUser,
  ): Promise<StaffProfileDTO> {
    const existing = await this.prisma.staffProfile.findUnique({ where: { id } });
    if (!existing) throw notFound('Staff Profile');

    const data: Record<string, unknown> = {};
    if (input.firstName !== undefined) data.firstName = input.firstName.trim();
    if (input.lastName !== undefined) data.lastName = input.lastName.trim();
    if (input.otherNames !== undefined) data.otherNames = input.otherNames?.trim() || null;
    if (input.gender !== undefined) data.gender = input.gender;
    if (input.dateOfBirth !== undefined) data.dateOfBirth = input.dateOfBirth ? new Date(input.dateOfBirth) : null;
    if (input.nationalIdNumber !== undefined) data.nationalIdNumber = input.nationalIdNumber?.trim() || null;
    if (input.phone !== undefined) data.phone = input.phone.trim();
    if (input.alternatePhone !== undefined) data.alternatePhone = input.alternatePhone?.trim() || null;
    if (input.email !== undefined) data.email = input.email?.trim() || null;
    if (input.residenceAddress !== undefined) data.residenceAddress = input.residenceAddress?.trim() || null;
    if (input.emergencyContactName !== undefined) data.emergencyContactName = input.emergencyContactName.trim();
    if (input.emergencyContactPhone !== undefined) data.emergencyContactPhone = input.emergencyContactPhone.trim();
    if (input.emergencyContactRelation !== undefined) data.emergencyContactRelation = input.emergencyContactRelation.trim();
    if (input.departmentCode !== undefined) data.departmentCode = input.departmentCode.trim();
    if (input.jobTitle !== undefined) data.jobTitle = input.jobTitle.trim();
    if (input.employmentType !== undefined) data.employmentType = input.employmentType;
    if (input.dateJoined !== undefined) data.dateJoined = new Date(input.dateJoined);
    if (input.contractEndDate !== undefined) data.contractEndDate = input.contractEndDate ? new Date(input.contractEndDate) : null;
    if (input.baseSalaryMinor !== undefined) data.baseSalaryMinor = BigInt(input.baseSalaryMinor);
    if (input.currency !== undefined) data.currency = input.currency;
    if (input.paymentMethod !== undefined) data.paymentMethod = input.paymentMethod;
    if (input.bankName !== undefined) data.bankName = input.bankName?.trim() || null;
    if (input.bankAccountNumber !== undefined) data.bankAccountNumber = input.bankAccountNumber?.trim() || null;
    if (input.mobileMoneyNumber !== undefined) data.mobileMoneyNumber = input.mobileMoneyNumber?.trim() || null;
    if (input.nssfNumber !== undefined) data.nssfNumber = input.nssfNumber?.trim() || null;
    if (input.tinNumber !== undefined) data.tinNumber = input.tinNumber?.trim() || null;
    if (input.status !== undefined) data.status = input.status;
    if (input.avatarUrl !== undefined) data.avatarUrl = input.avatarUrl || null;
    if (input.notes !== undefined) data.notes = input.notes?.trim() || null;

    const updated = await this.prisma.staffProfile.update({
      where: { id },
      data,
    });

    await this.audit.record({
      actor,
      action: 'staff.update',
      entityType: 'StaffProfile',
      entityId: updated.id,
      summary: `Updated staff profile ${updated.firstName} ${updated.lastName} (${updated.employeeNumber})`,
    });

    return {
      id: updated.id,
      employeeNumber: updated.employeeNumber,
      userId: updated.userId,
      firstName: updated.firstName,
      lastName: updated.lastName,
      otherNames: updated.otherNames,
      fullName: [updated.firstName, updated.lastName, updated.otherNames].filter(Boolean).join(' '),
      gender: updated.gender as any,
      dateOfBirth: updated.dateOfBirth?.toISOString().slice(0, 10) ?? null,
      nationalIdNumber: updated.nationalIdNumber,
      phone: updated.phone,
      alternatePhone: updated.alternatePhone,
      email: updated.email,
      residenceAddress: updated.residenceAddress,
      emergencyContactName: updated.emergencyContactName,
      emergencyContactPhone: updated.emergencyContactPhone,
      emergencyContactRelation: updated.emergencyContactRelation,
      departmentCode: updated.departmentCode,
      jobTitle: updated.jobTitle,
      employmentType: updated.employmentType as any,
      dateJoined: updated.dateJoined.toISOString().slice(0, 10),
      contractEndDate: updated.contractEndDate?.toISOString().slice(0, 10) ?? null,
      baseSalaryMinor: updated.baseSalaryMinor.toString(),
      currency: updated.currency as any,
      paymentMethod: updated.paymentMethod as any,
      bankName: updated.bankName,
      bankAccountNumber: updated.bankAccountNumber,
      mobileMoneyNumber: updated.mobileMoneyNumber,
      nssfNumber: updated.nssfNumber,
      tinNumber: updated.tinNumber,
      status: updated.status as any,
      avatarUrl: updated.avatarUrl,
      notes: updated.notes,
      isSeed: updated.isSeed,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
    };
  }

  async deleteStaff(id: string, actor: AuthUser): Promise<{ ok: boolean }> {
    if (actor.role !== 'OWNER') throw forbidden('Only the hotel owner can terminate or delete staff profiles');
    const existing = await this.prisma.staffProfile.findUnique({ where: { id } });
    if (!existing) throw notFound('Staff Profile');

    // Soft-deactivate by setting status to TERMINATED
    await this.prisma.staffProfile.update({
      where: { id },
      data: { status: 'TERMINATED' },
    });

    // If linked to a system User account, deactivate sign-in
    if (existing.userId) {
      await this.prisma.user.update({
        where: { id: existing.userId },
        data: { canSignIn: false, status: 'DISABLED' },
      });
    }

    await this.audit.record({
      actor,
      action: 'staff.terminate',
      entityType: 'StaffProfile',
      entityId: id,
      summary: `Terminated staff profile ${existing.firstName} ${existing.lastName} (${existing.employeeNumber})`,
    });

    return { ok: true };
  }

  /* ───────────────────────── 3. Shift Rosters & Daily Attendance ───────────────────────── */

  async listShifts(filters?: {
    startDate?: string;
    endDate?: string;
    department?: string;
    staffId?: string;
  }): Promise<StaffShiftDTO[]> {
    const where: Record<string, unknown> = {};

    if (filters?.startDate || filters?.endDate) {
      where.date = {
        ...(filters.startDate ? { gte: new Date(filters.startDate) } : {}),
        ...(filters.endDate ? { lte: new Date(filters.endDate) } : {}),
      };
    }
    if (filters?.department && filters.department !== 'ALL') {
      where.departmentCode = filters.department;
    }
    if (filters?.staffId) {
      where.staffId = filters.staffId;
    }

    const shifts = await this.prisma.staffShift.findMany({
      where,
      include: {
        staff: {
          select: { firstName: true, lastName: true, jobTitle: true },
        },
      },
      orderBy: [{ date: 'asc' }, { scheduledStartTime: 'asc' }],
    });

    return shifts.map((sh) => ({
      id: sh.id,
      staffId: sh.staffId,
      staffName: `${sh.staff.firstName} ${sh.staff.lastName}`,
      staffJobTitle: sh.staff.jobTitle,
      departmentCode: sh.departmentCode,
      date: sh.date.toISOString().slice(0, 10),
      shiftType: sh.shiftType as any,
      scheduledStartTime: sh.scheduledStartTime,
      scheduledEndTime: sh.scheduledEndTime,
      actualCheckIn: sh.actualCheckIn?.toISOString() ?? null,
      actualCheckOut: sh.actualCheckOut?.toISOString() ?? null,
      attendanceStatus: sh.attendanceStatus as any,
      notes: sh.notes,
      createdAt: sh.createdAt.toISOString(),
      updatedAt: sh.updatedAt.toISOString(),
    }));
  }

  async createShift(input: z.infer<typeof zCreateShiftInput>, actor: AuthUser): Promise<StaffShiftDTO> {
    const staff = await this.prisma.staffProfile.findUnique({ where: { id: input.staffId } });
    if (!staff) throw notFound('Staff Profile');

    const dateObj = new Date(input.date);

    const shift = await this.prisma.staffShift.create({
      data: {
        staffId: input.staffId,
        departmentCode: input.departmentCode,
        date: dateObj,
        shiftType: input.shiftType ?? 'MORNING',
        scheduledStartTime: input.scheduledStartTime || null,
        scheduledEndTime: input.scheduledEndTime || null,
        attendanceStatus: input.attendanceStatus ?? 'SCHEDULED',
        notes: input.notes?.trim() || null,
      },
    });

    return {
      id: shift.id,
      staffId: shift.staffId,
      staffName: `${staff.firstName} ${staff.lastName}`,
      staffJobTitle: staff.jobTitle,
      departmentCode: shift.departmentCode,
      date: shift.date.toISOString().slice(0, 10),
      shiftType: shift.shiftType as any,
      scheduledStartTime: shift.scheduledStartTime,
      scheduledEndTime: shift.scheduledEndTime,
      actualCheckIn: null,
      actualCheckOut: null,
      attendanceStatus: shift.attendanceStatus as any,
      notes: shift.notes,
      createdAt: shift.createdAt.toISOString(),
      updatedAt: shift.updatedAt.toISOString(),
    };
  }

  async updateShift(
    id: string,
    input: z.infer<typeof zUpdateShiftInput>,
    actor: AuthUser,
  ): Promise<StaffShiftDTO> {
    const existing = await this.prisma.staffShift.findUnique({
      where: { id },
      include: { staff: true },
    });
    if (!existing) throw notFound('Staff Shift');

    const data: Record<string, unknown> = {};
    if (input.shiftType !== undefined) data.shiftType = input.shiftType;
    if (input.scheduledStartTime !== undefined) data.scheduledStartTime = input.scheduledStartTime;
    if (input.scheduledEndTime !== undefined) data.scheduledEndTime = input.scheduledEndTime;
    if (input.attendanceStatus !== undefined) data.attendanceStatus = input.attendanceStatus;
    if (input.actualCheckIn !== undefined) data.actualCheckIn = input.actualCheckIn ? new Date(input.actualCheckIn) : null;
    if (input.actualCheckOut !== undefined) data.actualCheckOut = input.actualCheckOut ? new Date(input.actualCheckOut) : null;
    if (input.notes !== undefined) data.notes = input.notes?.trim() || null;

    const updated = await this.prisma.staffShift.update({
      where: { id },
      data,
      include: { staff: true },
    });

    return {
      id: updated.id,
      staffId: updated.staffId,
      staffName: `${updated.staff.firstName} ${updated.staff.lastName}`,
      staffJobTitle: updated.staff.jobTitle,
      departmentCode: updated.departmentCode,
      date: updated.date.toISOString().slice(0, 10),
      shiftType: updated.shiftType as any,
      scheduledStartTime: updated.scheduledStartTime,
      scheduledEndTime: updated.scheduledEndTime,
      actualCheckIn: updated.actualCheckIn?.toISOString() ?? null,
      actualCheckOut: updated.actualCheckOut?.toISOString() ?? null,
      attendanceStatus: updated.attendanceStatus as any,
      notes: updated.notes,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
    };
  }

  /* ───────────────────────── 4. Leave & Absence Management ───────────────────────── */

  async listLeaveRequests(filters?: {
    status?: string;
    department?: string;
    staffId?: string;
  }): Promise<StaffLeaveRequestDTO[]> {
    const where: Record<string, unknown> = {};

    if (filters?.status && filters.status !== 'ALL') {
      where.status = filters.status;
    }
    if (filters?.staffId) {
      where.staffId = filters.staffId;
    }
    if (filters?.department && filters.department !== 'ALL') {
      where.staff = { departmentCode: filters.department };
    }

    const leaves = await this.prisma.staffLeaveRequest.findMany({
      where,
      include: {
        staff: {
          select: { firstName: true, lastName: true, departmentCode: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return leaves.map((l) => ({
      id: l.id,
      staffId: l.staffId,
      staffName: `${l.staff.firstName} ${l.staff.lastName}`,
      departmentCode: l.staff.departmentCode,
      leaveType: l.leaveType as any,
      startDate: l.startDate.toISOString().slice(0, 10),
      endDate: l.endDate.toISOString().slice(0, 10),
      daysCount: l.daysCount,
      reason: l.reason,
      handoverNotes: l.handoverNotes,
      status: l.status as any,
      reviewedById: l.reviewedById,
      reviewedByName: l.reviewedByName,
      reviewNotes: l.reviewNotes,
      reviewedAt: l.reviewedAt?.toISOString() ?? null,
      createdAt: l.createdAt.toISOString(),
      updatedAt: l.updatedAt.toISOString(),
    }));
  }

  async createLeaveRequest(
    input: z.infer<typeof zCreateLeaveRequestInput>,
    actor: AuthUser,
  ): Promise<StaffLeaveRequestDTO> {
    const staff = await this.prisma.staffProfile.findUnique({ where: { id: input.staffId } });
    if (!staff) throw notFound('Staff Profile');

    const start = new Date(input.startDate);
    const end = new Date(input.endDate);
    if (end < start) {
      throw badRequest('Leave end date cannot be earlier than start date');
    }

    const leave = await this.prisma.staffLeaveRequest.create({
      data: {
        staffId: input.staffId,
        leaveType: input.leaveType,
        startDate: start,
        endDate: end,
        daysCount: input.daysCount,
        reason: input.reason.trim(),
        handoverNotes: input.handoverNotes?.trim() || null,
        status: 'PENDING',
      },
    });

    await this.audit.record({
      actor,
      action: 'leave.request',
      entityType: 'StaffLeaveRequest',
      entityId: leave.id,
      summary: `Submitted leave request for ${staff.firstName} ${staff.lastName} (${input.daysCount} days · ${input.leaveType})`,
    });

    return {
      id: leave.id,
      staffId: leave.staffId,
      staffName: `${staff.firstName} ${staff.lastName}`,
      departmentCode: staff.departmentCode,
      leaveType: leave.leaveType as any,
      startDate: leave.startDate.toISOString().slice(0, 10),
      endDate: leave.endDate.toISOString().slice(0, 10),
      daysCount: leave.daysCount,
      reason: leave.reason,
      handoverNotes: leave.handoverNotes,
      status: leave.status as any,
      reviewedById: null,
      reviewedByName: null,
      reviewNotes: null,
      reviewedAt: null,
      createdAt: leave.createdAt.toISOString(),
      updatedAt: leave.updatedAt.toISOString(),
    };
  }

  async reviewLeaveRequest(
    id: string,
    input: z.infer<typeof zReviewLeaveRequestInput>,
    actor: AuthUser,
  ): Promise<StaffLeaveRequestDTO> {
    const leave = await this.prisma.staffLeaveRequest.findUnique({
      where: { id },
      include: { staff: true },
    });
    if (!leave) throw notFound('Leave Request');

    let nextStatus: string;
    if (input.action === 'APPROVE') nextStatus = 'APPROVED';
    else if (input.action === 'REJECT') nextStatus = 'REJECTED';
    else nextStatus = 'CANCELLED';

    const updated = await this.prisma.staffLeaveRequest.update({
      where: { id },
      data: {
        status: nextStatus,
        reviewedById: actor.id,
        reviewedByName: actor.name,
        reviewNotes: input.reviewNotes?.trim() || null,
        reviewedAt: new Date(),
      },
      include: { staff: true },
    });

    // If approved, update staff status if starting today
    if (nextStatus === 'APPROVED') {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (updated.startDate <= today && updated.endDate >= today) {
        await this.prisma.staffProfile.update({
          where: { id: updated.staffId },
          data: { status: 'ON_LEAVE' },
        });
      }
    }

    await this.audit.record({
      actor,
      action: `leave.${nextStatus.toLowerCase()}`,
      entityType: 'StaffLeaveRequest',
      entityId: updated.id,
      summary: `${nextStatus} leave request for ${updated.staff.firstName} ${updated.staff.lastName}`,
    });

    return {
      id: updated.id,
      staffId: updated.staffId,
      staffName: `${updated.staff.firstName} ${updated.staff.lastName}`,
      departmentCode: updated.staff.departmentCode,
      leaveType: updated.leaveType as any,
      startDate: updated.startDate.toISOString().slice(0, 10),
      endDate: updated.endDate.toISOString().slice(0, 10),
      daysCount: updated.daysCount,
      reason: updated.reason,
      handoverNotes: updated.handoverNotes,
      status: updated.status as any,
      reviewedById: updated.reviewedById,
      reviewedByName: updated.reviewedByName,
      reviewNotes: updated.reviewNotes,
      reviewedAt: updated.reviewedAt?.toISOString() ?? null,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
    };
  }

  /* ───────────────────────── 5. Payroll & Uganda Tax / NSSF Calculations ───────────────────────── */

  /**
   * Uganda Standard PAYE Monthly Bracket Calculation:
   * 0 - 235,000 UGX: Nil
   * 235,001 - 335,000 UGX: 10%
   * 335,001 - 410,000 UGX: 20%
   * > 410,000 UGX: 30% (+ 10% on portion exceeding 10,000,000 UGX)
   */
  private calculatePayeTax(grossUgx: bigint): bigint {
    const gross = Number(grossUgx);
    if (gross <= 235_000) return 0n;

    let tax = 0;
    if (gross > 235_000 && gross <= 335_000) {
      tax = (gross - 235_000) * 0.1;
    } else if (gross > 335_000 && gross <= 410_000) {
      tax = 10_000 + (gross - 335_000) * 0.2;
    } else if (gross > 410_000) {
      tax = 25_000 + (gross - 410_000) * 0.3;
      if (gross > 10_000_000) {
        tax += (gross - 10_000_000) * 0.1;
      }
    }

    return BigInt(Math.round(tax));
  }

  async listPayroll(filters?: { periodMonth?: string; paymentStatus?: string }): Promise<StaffPayrollRecordDTO[]> {
    const where: Record<string, unknown> = {};
    if (filters?.periodMonth) where.periodMonth = filters.periodMonth;
    if (filters?.paymentStatus && filters.paymentStatus !== 'ALL') where.paymentStatus = filters.paymentStatus;

    const records = await this.prisma.staffPayrollRecord.findMany({
      where,
      include: {
        staff: {
          select: { firstName: true, lastName: true, employeeNumber: true, departmentCode: true, jobTitle: true },
        },
      },
      orderBy: [{ periodMonth: 'desc' }, { staff: { firstName: 'asc' } }],
    });

    return records.map((p) => ({
      id: p.id,
      staffId: p.staffId,
      staffName: `${p.staff.firstName} ${p.staff.lastName}`,
      employeeNumber: p.staff.employeeNumber,
      departmentCode: p.staff.departmentCode,
      jobTitle: p.staff.jobTitle,
      periodMonth: p.periodMonth,
      baseSalaryMinor: p.baseSalaryMinor.toString(),
      overtimeMinor: p.overtimeMinor.toString(),
      allowancesMinor: p.allowancesMinor.toString(),
      grossSalaryMinor: p.grossSalaryMinor.toString(),
      payeTaxMinor: p.payeTaxMinor.toString(),
      nssfEmployeeMinor: p.nssfEmployeeMinor.toString(),
      nssfEmployerMinor: p.nssfEmployerMinor.toString(),
      advancesDeductionMinor: p.advancesDeductionMinor.toString(),
      otherDeductionsMinor: p.otherDeductionsMinor.toString(),
      netSalaryMinor: p.netSalaryMinor.toString(),
      currency: p.currency as any,
      paymentStatus: p.paymentStatus as any,
      paymentReference: p.paymentReference,
      paidAt: p.paidAt?.toISOString() ?? null,
      createdAt: p.createdAt.toISOString(),
      updatedAt: p.updatedAt.toISOString(),
    }));
  }

  async generatePayroll(input: z.infer<typeof zGeneratePayrollInput>, actor: AuthUser): Promise<{ count: number }> {
    const staffWhere: Record<string, unknown> = {
      status: { in: ['ACTIVE', 'ON_LEAVE'] },
    };
    if (input.staffIds && input.staffIds.length > 0) {
      staffWhere.id = { in: input.staffIds };
    }

    const staffMembers = await this.prisma.staffProfile.findMany({ where: staffWhere });

    let createdCount = 0;
    for (const s of staffMembers) {
      const base = s.baseSalaryMinor;
      const overtime = 0n;
      const allowances = 0n;
      const gross = base + overtime + allowances;

      // NSSF 5% employee, 10% employer
      const nssfEmp = (gross * 5n) / 100n;
      const nssfEmpr = (gross * 10n) / 100n;

      // PAYE tax on taxable pay
      const paye = this.calculatePayeTax(gross);

      const advances = 0n;
      const other = 0n;
      const totalDeductions = nssfEmp + paye + advances + other;
      const net = gross > totalDeductions ? gross - totalDeductions : 0n;

      await this.prisma.staffPayrollRecord.upsert({
        where: {
          staffId_periodMonth: {
            staffId: s.id,
            periodMonth: input.periodMonth,
          },
        },
        update: {
          baseSalaryMinor: base,
          overtimeMinor: overtime,
          allowancesMinor: allowances,
          grossSalaryMinor: gross,
          payeTaxMinor: paye,
          nssfEmployeeMinor: nssfEmp,
          nssfEmployerMinor: nssfEmpr,
          advancesDeductionMinor: advances,
          otherDeductionsMinor: other,
          netSalaryMinor: net,
        },
        create: {
          staffId: s.id,
          periodMonth: input.periodMonth,
          baseSalaryMinor: base,
          overtimeMinor: overtime,
          allowancesMinor: allowances,
          grossSalaryMinor: gross,
          payeTaxMinor: paye,
          nssfEmployeeMinor: nssfEmp,
          nssfEmployerMinor: nssfEmpr,
          advancesDeductionMinor: advances,
          otherDeductionsMinor: other,
          netSalaryMinor: net,
          currency: s.currency,
          paymentStatus: 'DRAFT',
        },
      });
      createdCount++;
    }

    await this.audit.record({
      actor,
      action: 'payroll.generate',
      entityType: 'StaffPayrollRecord',
      entityId: input.periodMonth,
      summary: `Generated monthly payroll for ${input.periodMonth} across ${createdCount} staff members`,
    });

    return { count: createdCount };
  }

  async updatePayrollStatus(
    id: string,
    input: z.infer<typeof zUpdatePayrollStatusInput>,
    actor: AuthUser,
  ): Promise<StaffPayrollRecordDTO> {
    const record = await this.prisma.staffPayrollRecord.findUnique({
      where: { id },
      include: { staff: true },
    });
    if (!record) throw notFound('Payroll Record');

    const isNowPaid = input.paymentStatus === 'PAID' && record.paymentStatus !== 'PAID';

    const updated = await this.prisma.staffPayrollRecord.update({
      where: { id },
      data: {
        paymentStatus: input.paymentStatus,
        paymentReference: input.paymentReference ?? null,
        paidAt: isNowPaid ? new Date() : record.paidAt,
      },
      include: { staff: true },
    });

    // If marked as PAID, automatically record in hotel Expenses under STAFF_PAYROLL_WELFARE!
    if (isNowPaid) {
      const expCount = await this.prisma.expense.count();
      const expNum = `EXP-${new Date().getFullYear()}-${String(expCount + 1).padStart(4, '0')}`;

      await this.prisma.expense.create({
        data: {
          number: expNum,
          date: new Date(),
          department: updated.staff.departmentCode as any,
          category: 'STAFF_PAYROLL_WELFARE' as any,
          title: `Salary Payment · ${updated.staff.firstName} ${updated.staff.lastName} (${updated.periodMonth})`,
          description: `Disbursed Net Pay of ${updated.netSalaryMinor.toString()} ${updated.currency} to ${updated.staff.paymentMethod}`,
          vendor: `${updated.staff.firstName} ${updated.staff.lastName}`,
          amountMinor: updated.netSalaryMinor,
          currency: updated.currency,
          paymentMethod: updated.staff.paymentMethod === 'MOBILE_MONEY' ? 'MOBILE_MONEY' : 'BANK_TRANSFER' as any,
          referenceNumber: input.paymentReference ?? null,
          recordedById: actor.id,
          recordedByName: actor.name,
        },
      });
    }

    await this.audit.record({
      actor,
      action: `payroll.${input.paymentStatus.toLowerCase()}`,
      entityType: 'StaffPayrollRecord',
      entityId: updated.id,
      summary: `Updated payroll record status to ${input.paymentStatus} for ${updated.staff.firstName} ${updated.staff.lastName} (${updated.periodMonth})`,
    });

    return {
      id: updated.id,
      staffId: updated.staffId,
      staffName: `${updated.staff.firstName} ${updated.staff.lastName}`,
      employeeNumber: updated.staff.employeeNumber,
      departmentCode: updated.staff.departmentCode,
      jobTitle: updated.staff.jobTitle,
      periodMonth: updated.periodMonth,
      baseSalaryMinor: updated.baseSalaryMinor.toString(),
      overtimeMinor: updated.overtimeMinor.toString(),
      allowancesMinor: updated.allowancesMinor.toString(),
      grossSalaryMinor: updated.grossSalaryMinor.toString(),
      payeTaxMinor: updated.payeTaxMinor.toString(),
      nssfEmployeeMinor: updated.nssfEmployeeMinor.toString(),
      nssfEmployerMinor: updated.nssfEmployerMinor.toString(),
      advancesDeductionMinor: updated.advancesDeductionMinor.toString(),
      otherDeductionsMinor: updated.otherDeductionsMinor.toString(),
      netSalaryMinor: updated.netSalaryMinor.toString(),
      currency: updated.currency as any,
      paymentStatus: updated.paymentStatus as any,
      paymentReference: updated.paymentReference,
      paidAt: updated.paidAt?.toISOString() ?? null,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
    };
  }
}
