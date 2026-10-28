import { z } from 'zod';
import type { CurrencyCode } from './booking.js';

// ───────────────────────── HR Enums & Constants ─────────────────────────

export const STAFF_EMPLOYMENT_TYPES = [
  'FULL_TIME',
  'PART_TIME',
  'CONTRACT',
  'PROBATION',
  'CASUAL',
] as const;
export type StaffEmploymentType = (typeof STAFF_EMPLOYMENT_TYPES)[number];

export const STAFF_STATUSES = ['ACTIVE', 'ON_LEAVE', 'SUSPENDED', 'TERMINATED'] as const;
export type StaffStatus = (typeof STAFF_STATUSES)[number];

export const STAFF_GENDERS = ['MALE', 'FEMALE', 'OTHER'] as const;
export type StaffGender = (typeof STAFF_GENDERS)[number];

export const STAFF_PAYMENT_METHODS = ['BANK_TRANSFER', 'MOBILE_MONEY', 'CASH'] as const;
export type StaffPaymentMethod = (typeof STAFF_PAYMENT_METHODS)[number];

export const SHIFT_TYPES = ['MORNING', 'EVENING', 'NIGHT', 'FULL_DAY', 'OFF'] as const;
export type ShiftType = (typeof SHIFT_TYPES)[number];

export const ATTENDANCE_STATUSES = ['SCHEDULED', 'PRESENT', 'LATE', 'ABSENT', 'ON_LEAVE', 'EXCUSED'] as const;
export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number];

export const LEAVE_TYPES = ['ANNUAL', 'SICK', 'MATERNITY', 'PATERNITY', 'COMPASSIONATE', 'UNPAID', 'STUDY'] as const;
export type LeaveType = (typeof LEAVE_TYPES)[number];

export const LEAVE_STATUSES = ['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'] as const;
export type LeaveStatus = (typeof LEAVE_STATUSES)[number];

export const PAYROLL_STATUSES = ['DRAFT', 'VERIFIED', 'PAID'] as const;
export type PayrollStatus = (typeof PAYROLL_STATUSES)[number];

// ───────────────────────── DTOs ─────────────────────────

export interface StaffProfileDTO {
  id: string;
  employeeNumber: string;
  userId: string | null;
  firstName: string;
  lastName: string;
  otherNames: string | null;
  fullName: string;
  gender: StaffGender;
  dateOfBirth: string | null;
  nationalIdNumber: string | null;
  phone: string;
  alternatePhone: string | null;
  email: string | null;
  residenceAddress: string | null;
  emergencyContactName: string;
  emergencyContactPhone: string;
  emergencyContactRelation: string;
  departmentCode: string;
  departmentName?: string | null;
  jobTitle: string;
  employmentType: StaffEmploymentType;
  dateJoined: string;
  contractEndDate: string | null;
  baseSalaryMinor: string;
  currency: CurrencyCode;
  paymentMethod: StaffPaymentMethod;
  bankName: string | null;
  bankAccountNumber: string | null;
  mobileMoneyNumber: string | null;
  nssfNumber: string | null;
  tinNumber: string | null;
  status: StaffStatus;
  avatarUrl: string | null;
  notes: string | null;
  isSeed: boolean;
  activeShiftsCount?: number;
  pendingLeavesCount?: number;
  createdAt: string;
  updatedAt: string;
}

export interface StaffShiftDTO {
  id: string;
  staffId: string;
  staffName?: string;
  staffJobTitle?: string;
  departmentCode: string;
  date: string; // YYYY-MM-DD
  shiftType: ShiftType;
  scheduledStartTime: string | null;
  scheduledEndTime: string | null;
  actualCheckIn: string | null;
  actualCheckOut: string | null;
  attendanceStatus: AttendanceStatus;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface StaffLeaveRequestDTO {
  id: string;
  staffId: string;
  staffName?: string;
  departmentCode?: string;
  leaveType: LeaveType;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  daysCount: number;
  reason: string;
  handoverNotes: string | null;
  status: LeaveStatus;
  reviewedById: string | null;
  reviewedByName: string | null;
  reviewNotes: string | null;
  reviewedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface StaffPayrollRecordDTO {
  id: string;
  staffId: string;
  staffName?: string;
  employeeNumber?: string;
  departmentCode?: string;
  jobTitle?: string;
  periodMonth: string; // YYYY-MM
  baseSalaryMinor: string;
  overtimeMinor: string;
  allowancesMinor: string;
  grossSalaryMinor: string;
  payeTaxMinor: string;
  nssfEmployeeMinor: string;
  nssfEmployerMinor: string;
  advancesDeductionMinor: string;
  otherDeductionsMinor: string;
  netSalaryMinor: string;
  currency: CurrencyCode;
  paymentStatus: PayrollStatus;
  paymentReference: string | null;
  paidAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface StaffDocumentDTO {
  id: string;
  staffId: string;
  title: string;
  kind: string;
  fileUrl: string;
  expiryDate: string | null;
  notes: string | null;
  createdAt: string;
}

export interface HrDashboardDTO {
  totalStaff: number;
  activeStaff: number;
  onLeaveToday: number;
  scheduledShiftsToday: number;
  pendingLeaveRequests: number;
  totalMonthlyPayrollMinor: string;
  departmentHeadcounts: Record<string, number>;
}

// ───────────────────────── Zod Validation Inputs ─────────────────────────

export const zCreateStaffInput = z.object({
  employeeNumber: z.string().trim().min(2).max(40).optional(),
  userId: z.string().uuid().optional().nullable(),
  firstName: z.string().trim().min(2).max(80),
  lastName: z.string().trim().min(2).max(80),
  otherNames: z.string().trim().max(80).optional().nullable(),
  gender: z.enum(STAFF_GENDERS).default('OTHER'),
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}/).optional().nullable(),
  nationalIdNumber: z.string().trim().max(50).optional().nullable(),
  phone: z.string().trim().min(5).max(30),
  alternatePhone: z.string().trim().max(30).optional().nullable(),
  email: z.string().trim().email().optional().nullable(),
  residenceAddress: z.string().trim().max(180).optional().nullable(),
  emergencyContactName: z.string().trim().min(2).max(100),
  emergencyContactPhone: z.string().trim().min(5).max(30),
  emergencyContactRelation: z.string().trim().max(60).default('NEXT_OF_KIN'),
  departmentCode: z.string().trim().min(2).max(60),
  jobTitle: z.string().trim().min(2).max(100),
  employmentType: z.enum(STAFF_EMPLOYMENT_TYPES).default('FULL_TIME'),
  dateJoined: z.string().regex(/^\d{4}-\d{2}-\d{2}/).optional(),
  contractEndDate: z.string().regex(/^\d{4}-\d{2}-\d{2}/).optional().nullable(),
  baseSalaryMinor: z.string().regex(/^\d+$/).default('0'),
  currency: z.enum(['UGX', 'USD']).default('UGX'),
  paymentMethod: z.enum(STAFF_PAYMENT_METHODS).default('BANK_TRANSFER'),
  bankName: z.string().trim().max(80).optional().nullable(),
  bankAccountNumber: z.string().trim().max(60).optional().nullable(),
  mobileMoneyNumber: z.string().trim().max(30).optional().nullable(),
  nssfNumber: z.string().trim().max(40).optional().nullable(),
  tinNumber: z.string().trim().max(40).optional().nullable(),
  status: z.enum(STAFF_STATUSES).default('ACTIVE'),
  avatarUrl: z.string().url().optional().nullable(),
  notes: z.string().trim().max(500).optional().nullable(),
});

export const zUpdateStaffInput = z.object({
  firstName: z.string().trim().min(2).max(80).optional(),
  lastName: z.string().trim().min(2).max(80).optional(),
  otherNames: z.string().trim().max(80).optional().nullable(),
  gender: z.enum(STAFF_GENDERS).optional(),
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}/).optional().nullable(),
  nationalIdNumber: z.string().trim().max(50).optional().nullable(),
  phone: z.string().trim().min(5).max(30).optional(),
  alternatePhone: z.string().trim().max(30).optional().nullable(),
  email: z.string().trim().email().optional().nullable(),
  residenceAddress: z.string().trim().max(180).optional().nullable(),
  emergencyContactName: z.string().trim().min(2).max(100).optional(),
  emergencyContactPhone: z.string().trim().min(5).max(30).optional(),
  emergencyContactRelation: z.string().trim().max(60).optional(),
  departmentCode: z.string().trim().min(2).max(60).optional(),
  jobTitle: z.string().trim().min(2).max(100).optional(),
  employmentType: z.enum(STAFF_EMPLOYMENT_TYPES).optional(),
  dateJoined: z.string().regex(/^\d{4}-\d{2}-\d{2}/).optional(),
  contractEndDate: z.string().regex(/^\d{4}-\d{2}-\d{2}/).optional().nullable(),
  baseSalaryMinor: z.string().regex(/^\d+$/).optional(),
  currency: z.enum(['UGX', 'USD']).optional(),
  paymentMethod: z.enum(STAFF_PAYMENT_METHODS).optional(),
  bankName: z.string().trim().max(80).optional().nullable(),
  bankAccountNumber: z.string().trim().max(60).optional().nullable(),
  mobileMoneyNumber: z.string().trim().max(30).optional().nullable(),
  nssfNumber: z.string().trim().max(40).optional().nullable(),
  tinNumber: z.string().trim().max(40).optional().nullable(),
  status: z.enum(STAFF_STATUSES).optional(),
  avatarUrl: z.string().url().optional().nullable(),
  notes: z.string().trim().max(500).optional().nullable(),
});

export const zCreateShiftInput = z.object({
  staffId: z.string().uuid(),
  departmentCode: z.string().trim().min(2).max(60),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}/),
  shiftType: z.enum(SHIFT_TYPES).default('MORNING'),
  scheduledStartTime: z.string().trim().max(10).optional().nullable(),
  scheduledEndTime: z.string().trim().max(10).optional().nullable(),
  attendanceStatus: z.enum(ATTENDANCE_STATUSES).default('SCHEDULED'),
  notes: z.string().trim().max(300).optional().nullable(),
});

export const zUpdateShiftInput = z.object({
  shiftType: z.enum(SHIFT_TYPES).optional(),
  scheduledStartTime: z.string().trim().max(10).optional().nullable(),
  scheduledEndTime: z.string().trim().max(10).optional().nullable(),
  attendanceStatus: z.enum(ATTENDANCE_STATUSES).optional(),
  actualCheckIn: z.string().optional().nullable(),
  actualCheckOut: z.string().optional().nullable(),
  notes: z.string().trim().max(300).optional().nullable(),
});

export const zCreateLeaveRequestInput = z.object({
  staffId: z.string().uuid(),
  leaveType: z.enum(LEAVE_TYPES).default('ANNUAL'),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}/),
  daysCount: z.number().int().min(1).default(1),
  reason: z.string().trim().min(3).max(500),
  handoverNotes: z.string().trim().max(500).optional().nullable(),
});

export const zReviewLeaveRequestInput = z.object({
  action: z.enum(['APPROVE', 'REJECT', 'CANCEL']),
  reviewNotes: z.string().trim().max(500).optional().nullable(),
});

export const zGeneratePayrollInput = z.object({
  periodMonth: z.string().regex(/^\d{4}-\d{2}$/), // YYYY-MM
  staffIds: z.array(z.string().uuid()).optional(), // optional subset, defaults to all active staff
});

export const zUpdatePayrollStatusInput = z.object({
  paymentStatus: z.enum(PAYROLL_STATUSES),
  paymentReference: z.string().trim().max(100).optional().nullable(),
});
