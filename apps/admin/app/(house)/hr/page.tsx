'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  ArrowRight,
  Building2,
  CalendarDays,
  CheckCircle2,
  Clock,
  CreditCard,
  DollarSign,
  Download,
  Edit,
  Eye,
  FileText,
  KeyRound,
  LogIn,
  LogOut,
  Mail,
  Phone,
  Plus,
  Printer,
  RefreshCw,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Trash2,
  UserCheck,
  UserPlus,
  Users,
  XCircle,
  Zap,
} from 'lucide-react';
import Link from 'next/link';
import type {
  HotelDepartmentDTO,
  HrDashboardDTO,
  StaffDocumentDTO,
  StaffLeaveRequestDTO,
  StaffPayrollRecordDTO,
  StaffProfileDTO,
  StaffShiftDTO,
} from '@reberon/contracts';
import { ApiError, del, get, patch, post } from '@/lib/api';
import { useCan, useMe } from '@/lib/providers';
import { money } from '@/lib/money';
import { cn } from '@/lib/cn';
import { Button } from '@/components/ui/button';
import { Empty, PageHeader, Skeleton, Tabs } from '@/components/ui/bits';
import { DeleteConfirmDialog } from '@/components/ui/delete-dialog';
import {
  AdjustPayrollModal,
  AssignSystemRoleModal,
  BulkShiftModal,
  CreateLeaveModal,
  CreateShiftModal,
  CreateStaffModal,
  EditStaffModal,
  MarkPaidModal,
  PayslipModal,
  ReviewLeaveModal,
  StaffDetailModal,
} from './hr-modals';

type HrTab = 'STAFF' | 'ROSTER' | 'LEAVE' | 'PAYROLL' | 'ANALYTICS';

function exportCsv(filename: string, headers: string[], rows: (string | number | null | undefined)[][]) {
  const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const csv = [headers.map(esc).join(','), ...rows.map((r) => r.map(esc).join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function HrPage() {
  const qc = useQueryClient();
  const can = useCan();
  const me = useMe();
  const canHrRead = can('hr:manage');
  const canHrManage = can('hr:manage');
  const isOwner = me.role === 'OWNER';
  const router = useRouter();
  const searchParams = useSearchParams();
  const tabParam = searchParams.get('tab');
  const deptParam = searchParams.get('department');
  const actionParam = searchParams.get('action');

  const [activeTab, setActiveTab] = useState<HrTab>(() => {
    if (
      tabParam === 'ROSTER' ||
      tabParam === 'LEAVE' ||
      tabParam === 'PAYROLL' ||
      tabParam === 'ANALYTICS'
    ) {
      return tabParam;
    }
    return 'STAFF';
  });

  useEffect(() => {
    if (
      tabParam === 'ROSTER' ||
      tabParam === 'LEAVE' ||
      tabParam === 'PAYROLL' ||
      tabParam === 'ANALYTICS'
    ) {
      setActiveTab(tabParam);
    } else if (!tabParam) {
      setActiveTab('STAFF');
    }
  }, [tabParam]);

  useEffect(() => {
    if (actionParam === 'add' || actionParam === 'create') {
      setCreateStaffOpen(true);
    } else if (actionParam === 'shift') {
      setCreateShiftOpen(true);
    } else if (actionParam === 'roster') {
      setBulkShiftOpen(true);
    } else if (actionParam === 'leave') {
      setCreateLeaveOpen(true);
    }
  }, [actionParam]);

  // Filters
  const [search, setSearch] = useState('');
  const [deptFilter, setDeptFilter] = useState(deptParam || 'ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [employmentFilter, setEmploymentFilter] = useState('ALL');
  const [leaveStatusFilter, setLeaveStatusFilter] = useState('ALL');
  const [shiftDateFilter, setShiftDateFilter] = useState('');

  // Modals
  const [createStaffOpen, setCreateStaffOpen] = useState(false);
  const [editingStaff, setEditingStaff] = useState<StaffProfileDTO | null>(null);
  const [viewingStaff, setViewingStaff] = useState<StaffProfileDTO | null>(null);
  const [assigningRoleStaff, setAssigningRoleStaff] = useState<StaffProfileDTO | null>(null);
  const [terminatingStaff, setTerminatingStaff] = useState<StaffProfileDTO | null>(null);

  const [createShiftOpen, setCreateShiftOpen] = useState(false);
  const [bulkShiftOpen, setBulkShiftOpen] = useState(false);
  const [createLeaveOpen, setCreateLeaveOpen] = useState(false);
  const [reviewingLeave, setReviewingLeave] = useState<StaffLeaveRequestDTO | null>(null);

  const [adjustingPayroll, setAdjustingPayroll] = useState<StaffPayrollRecordDTO | null>(null);
  const [markingPaidRecord, setMarkingPaidRecord] = useState<StaffPayrollRecordDTO | null>(null);
  const [viewingPayslip, setViewingPayslip] = useState<StaffPayrollRecordDTO | null>(null);

  const currentMonthStr = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }, []);
  const [payrollMonth, setPayrollMonth] = useState(currentMonthStr);

  // Queries
  const { data: overview } = useQuery({
    queryKey: ['hr-overview'],
    queryFn: () => get<HrDashboardDTO>('/hr/overview'),
    refetchInterval: 30_000,
    enabled: canHrRead,
  });

  const { data: departments } = useQuery({
    queryKey: ['departments'],
    queryFn: () => get<HotelDepartmentDTO[]>('/departments'),
    enabled: canHrRead,
  });

  const { data: staffList, isLoading: staffLoading, refetch: refetchStaff } = useQuery({
    queryKey: ['hr-staff', deptFilter, statusFilter],
    queryFn: () =>
      get<StaffProfileDTO[]>(
        `/hr/staff?department=${encodeURIComponent(deptFilter)}&status=${encodeURIComponent(statusFilter)}`,
      ),
    enabled: canHrRead,
  });

  const { data: shifts, isLoading: shiftsLoading, refetch: refetchShifts } = useQuery({
    queryKey: ['hr-shifts', deptFilter, shiftDateFilter],
    queryFn: () =>
      get<StaffShiftDTO[]>(
        `/hr/shifts?department=${encodeURIComponent(deptFilter)}${
          shiftDateFilter ? `&startDate=${shiftDateFilter}&endDate=${shiftDateFilter}` : ''
        }`,
      ),
    enabled: canHrRead && (activeTab === 'ROSTER' || activeTab === 'ANALYTICS'),
  });

  const { data: leaves, isLoading: leavesLoading, refetch: refetchLeaves } = useQuery({
    queryKey: ['hr-leaves', leaveStatusFilter, deptFilter],
    queryFn: () =>
      get<StaffLeaveRequestDTO[]>(
        `/hr/leaves?status=${encodeURIComponent(leaveStatusFilter)}&department=${encodeURIComponent(deptFilter)}`,
      ),
    enabled: canHrRead && activeTab === 'LEAVE',
  });

  const { data: payrollRecords, isLoading: payrollLoading, refetch: refetchPayroll } = useQuery({
    queryKey: ['hr-payroll', payrollMonth],
    queryFn: () => get<StaffPayrollRecordDTO[]>(`/hr/payroll?periodMonth=${encodeURIComponent(payrollMonth)}`),
    enabled: canHrRead && activeTab === 'PAYROLL',
  });

  const { data: allDocuments, refetch: refetchDocs } = useQuery({
    queryKey: ['hr-documents'],
    queryFn: () =>
      get<(StaffDocumentDTO & { staffName?: string; employeeNumber?: string; departmentCode?: string })[]>(
        '/hr/documents',
      ),
    enabled: canHrRead && activeTab === 'ANALYTICS',
  });

  // Filtered staff
  const filteredStaff = useMemo(() => {
    if (!staffList) return [];
    return staffList.filter((s) => {
      if (employmentFilter !== 'ALL' && s.employmentType !== employmentFilter) return false;
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return (
        s.fullName.toLowerCase().includes(q) ||
        s.employeeNumber.toLowerCase().includes(q) ||
        s.phone.toLowerCase().includes(q) ||
        (s.email && s.email.toLowerCase().includes(q)) ||
        s.jobTitle.toLowerCase().includes(q) ||
        (s.systemAccess?.roleDisplayName && s.systemAccess.roleDisplayName.toLowerCase().includes(q))
      );
    });
  }, [staffList, search, employmentFilter]);

  const linkedRolesCount = useMemo(() => {
    if (!staffList) return 0;
    return staffList.filter((s) => !!s.systemAccess).length;
  }, [staffList]);

  // Payroll Totals
  const payrollSummary = useMemo(() => {
    if (!payrollRecords || payrollRecords.length === 0) {
      return {
        gross: 0n,
        allowancesAndOt: 0n,
        paye: 0n,
        nssfEmp: 0n,
        nssfEmpr: 0n,
        net: 0n,
        paidCount: 0,
        pendingCount: 0,
      };
    }
    let gross = 0n;
    let allowancesAndOt = 0n;
    let paye = 0n;
    let nssfEmp = 0n;
    let nssfEmpr = 0n;
    let net = 0n;
    let paidCount = 0;
    let pendingCount = 0;

    for (const p of payrollRecords) {
      gross += BigInt(p.grossSalaryMinor || '0');
      allowancesAndOt += BigInt(p.overtimeMinor || '0') + BigInt(p.allowancesMinor || '0');
      paye += BigInt(p.payeTaxMinor || '0');
      nssfEmp += BigInt(p.nssfEmployeeMinor || '0');
      nssfEmpr += BigInt(p.nssfEmployerMinor || '0');
      net += BigInt(p.netSalaryMinor || '0');
      if (p.paymentStatus === 'PAID') paidCount++;
      else pendingCount++;
    }
    return { gross, allowancesAndOt, paye, nssfEmp, nssfEmpr, net, paidCount, pendingCount };
  }, [payrollRecords]);

  // Mutations
  const createStaffMutation = useMutation({
    mutationFn: (body: any) => post<StaffProfileDTO>('/hr/staff', body),
    onSuccess: () => {
      toast.success('Employee registered in HR directory');
      qc.invalidateQueries({ queryKey: ['hr-staff'] });
      qc.invalidateQueries({ queryKey: ['hr-overview'] });
      setCreateStaffOpen(false);
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Failed to create employee'),
  });

  const updateStaffMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => patch<StaffProfileDTO>(`/hr/staff/${id}`, data),
    onSuccess: () => {
      toast.success('Employee profile updated');
      qc.invalidateQueries({ queryKey: ['hr-staff'] });
      qc.invalidateQueries({ queryKey: ['hr-overview'] });
      setEditingStaff(null);
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Failed to update employee'),
  });

  const deleteStaffMutation = useMutation({
    mutationFn: (id: string) => del(`/hr/staff/${id}`),
    onSuccess: () => {
      toast.success('Employee marked as terminated and system login revoked');
      qc.invalidateQueries({ queryKey: ['hr-staff'] });
      qc.invalidateQueries({ queryKey: ['hr-overview'] });
      setTerminatingStaff(null);
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Failed to terminate employee'),
  });

  const createShiftMutation = useMutation({
    mutationFn: (body: any) => post<StaffShiftDTO>('/hr/shifts', body),
    onSuccess: () => {
      toast.success('Duty shift scheduled');
      qc.invalidateQueries({ queryKey: ['hr-shifts'] });
      qc.invalidateQueries({ queryKey: ['hr-overview'] });
      setCreateShiftOpen(false);
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Failed to schedule shift'),
  });

  const bulkShiftMutation = useMutation({
    mutationFn: (body: any) => post<{ createdCount: number }>('/hr/shifts/bulk', body),
    onSuccess: (res) => {
      toast.success(`Scheduled ${res.createdCount} duty shifts across selected staff`);
      qc.invalidateQueries({ queryKey: ['hr-shifts'] });
      qc.invalidateQueries({ queryKey: ['hr-overview'] });
      setBulkShiftOpen(false);
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Failed to generate bulk shifts'),
  });

  const updateShiftMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => patch<StaffShiftDTO>(`/hr/shifts/${id}`, data),
    onSuccess: () => {
      toast.success('Shift attendance updated');
      qc.invalidateQueries({ queryKey: ['hr-shifts'] });
      qc.invalidateQueries({ queryKey: ['hr-overview'] });
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Failed to update attendance'),
  });

  const deleteShiftMutation = useMutation({
    mutationFn: (id: string) => del(`/hr/shifts/${id}`),
    onSuccess: () => {
      toast.success('Shift removed from roster');
      qc.invalidateQueries({ queryKey: ['hr-shifts'] });
      qc.invalidateQueries({ queryKey: ['hr-overview'] });
    },
  });

  const createLeaveMutation = useMutation({
    mutationFn: (body: any) => post<StaffLeaveRequestDTO>('/hr/leaves', body),
    onSuccess: () => {
      toast.success('Leave request logged');
      qc.invalidateQueries({ queryKey: ['hr-leaves'] });
      qc.invalidateQueries({ queryKey: ['hr-overview'] });
      setCreateLeaveOpen(false);
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Failed to submit leave'),
  });

  const reviewLeaveMutation = useMutation({
    mutationFn: ({ id, action, reviewNotes }: { id: string; action: string; reviewNotes?: string }) =>
      post<StaffLeaveRequestDTO>(`/hr/leaves/${id}/review`, { action, reviewNotes }),
    onSuccess: () => {
      toast.success('Leave request reviewed');
      qc.invalidateQueries({ queryKey: ['hr-leaves'] });
      qc.invalidateQueries({ queryKey: ['hr-staff'] });
      qc.invalidateQueries({ queryKey: ['hr-overview'] });
      setReviewingLeave(null);
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Failed to review leave'),
  });

  const generatePayrollMutation = useMutation({
    mutationFn: () => post<{ count: number }>('/hr/payroll/generate', { periodMonth: payrollMonth }),
    onSuccess: (res) => {
      toast.success(`Calculated monthly payroll & URA taxes for ${res.count} staff`);
      qc.invalidateQueries({ queryKey: ['hr-payroll'] });
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Failed to generate payroll'),
  });

  const adjustPayrollMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => patch<StaffPayrollRecordDTO>(`/hr/payroll/${id}`, data),
    onSuccess: () => {
      toast.success('Payroll adjusted and statutory taxes recalculated');
      qc.invalidateQueries({ queryKey: ['hr-payroll'] });
      setAdjustingPayroll(null);
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Failed to adjust payroll'),
  });

  const updatePayrollStatusMutation = useMutation({
    mutationFn: ({ id, paymentStatus, paymentReference }: { id: string; paymentStatus: string; paymentReference?: string }) =>
      patch<StaffPayrollRecordDTO>(`/hr/payroll/${id}/status`, { paymentStatus, paymentReference }),
    onSuccess: () => {
      toast.success('Salary marked as PAID and posted to Hotel Expenses');
      qc.invalidateQueries({ queryKey: ['hr-payroll'] });
      setMarkingPaidRecord(null);
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Failed to update payroll status'),
  });

  const batchPayMutation = useMutation({
    mutationFn: () => post<{ paidCount: number; totalNetMinor: string }>('/hr/payroll/pay-all', { periodMonth: payrollMonth }),
    onSuccess: (res) => {
      toast.success(`Disbursed ${res.paidCount} pending salaries and synced with Hotel Expenses`);
      qc.invalidateQueries({ queryKey: ['hr-payroll'] });
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Failed to batch disburse payroll'),
  });

  if (!canHrRead) {
    return (
      <div className="fade-in w-full space-y-5">
        <PageHeader
          title="Human Resource Management"
          description="Confidential staff directory, shift rosters, leave requests, and payroll."
        />
        <div className="rounded-2xl border border-line bg-surface p-12 text-center shadow-xs">
          <Empty
            icon={<Users className="size-5" />}
            title="Human Resources Access Restricted"
            body="Your user account does not have permission to access confidential employee records, shift rosters, leave requests, or payroll."
          />
        </div>
      </div>
    );
  }

  return (
    <div className="fade-in w-full space-y-5">
      {/* Page Header */}
      <PageHeader
        title="Human Resource & Personnel Command"
        description="Complete 360° employee directory, system role assignment, shift & attendance clock-in, leave management, and Uganda URA PAYE & NSSF payroll."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/departments"
              className="inline-flex items-center gap-1.5 rounded-xl border border-line bg-surface px-3 py-2 text-xs font-semibold text-fg hover:bg-surface-2 transition"
            >
              <Building2 className="h-4 w-4 text-sky-600 dark:text-sky-400" />
              Departments & Budgets
            </Link>
            <Link
              href="/settings/users"
              className="inline-flex items-center gap-1.5 rounded-xl border border-line bg-surface px-3 py-2 text-xs font-semibold text-fg hover:bg-surface-2 transition"
            >
              <ShieldCheck className="h-4 w-4 text-violet-600 dark:text-violet-400" />
              Roles & Permissions
            </Link>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                refetchStaff();
                if (activeTab === 'ROSTER') refetchShifts();
                if (activeTab === 'LEAVE') refetchLeaves();
                if (activeTab === 'PAYROLL') refetchPayroll();
                if (activeTab === 'ANALYTICS') refetchDocs();
              }}
              title="Refresh"
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
            {activeTab === 'STAFF' && canHrManage && (
              <>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    if (!filteredStaff.length) return;
                    exportCsv(
                      `reberon-staff-directory-${new Date().toISOString().slice(0, 10)}.csv`,
                      [
                        'Employee Number',
                        'Full Name',
                        'Department',
                        'Job Title',
                        'System Role',
                        'Phone',
                        'Email',
                        'NIN',
                        'NSSF',
                        'TIN',
                        'Employment Type',
                        'Date Joined',
                        'Base Salary (UGX)',
                        'Payment Method',
                        'Account / MoMo',
                        'Status',
                      ],
                      filteredStaff.map((s) => [
                        s.employeeNumber,
                        s.fullName,
                        s.departmentName || s.departmentCode,
                        s.jobTitle,
                        s.systemAccess?.roleDisplayName || 'No System Role',
                        s.phone,
                        s.email || '',
                        s.nationalIdNumber || '',
                        s.nssfNumber || '',
                        s.tinNumber || '',
                        s.employmentType,
                        s.dateJoined,
                        s.baseSalaryMinor,
                        s.paymentMethod,
                        s.bankAccountNumber || s.mobileMoneyNumber || '',
                        s.status,
                      ]),
                    );
                  }}
                  className="gap-1.5"
                >
                  <Download className="h-3.5 w-3.5" /> Export CSV
                </Button>
                <Button variant="primary" size="sm" onClick={() => setCreateStaffOpen(true)} className="gap-1.5">
                  <UserPlus className="h-4 w-4" /> Add Employee
                </Button>
              </>
            )}
            {activeTab === 'ROSTER' && canHrManage && (
              <>
                <Button variant="secondary" size="sm" onClick={() => setBulkShiftOpen(true)} className="gap-1.5">
                  <CalendarDays className="h-4 w-4" /> Bulk Weekly Roster
                </Button>
                <Button variant="primary" size="sm" onClick={() => setCreateShiftOpen(true)} className="gap-1.5">
                  <Clock className="h-4 w-4" /> Assign Shift
                </Button>
              </>
            )}
            {activeTab === 'LEAVE' && canHrManage && (
              <Button variant="primary" size="sm" onClick={() => setCreateLeaveOpen(true)} className="gap-1.5">
                <CalendarDays className="h-4 w-4" /> Log Leave Request
              </Button>
            )}
            {activeTab === 'PAYROLL' && canHrManage && (
              <Button
                variant="primary"
                size="sm"
                onClick={() => generatePayrollMutation.mutate()}
                disabled={generatePayrollMutation.isPending}
                className="gap-1.5"
              >
                <DollarSign className="h-4 w-4" />
                {payrollRecords && payrollRecords.length > 0
                  ? `Recalculate ${payrollMonth} Payroll`
                  : `Generate ${payrollMonth} Payroll`}
              </Button>
            )}
          </div>
        }
      />

      {/* 1. HR Quick Actions Workspace Bar — One-click daily workflows */}
      <section
        aria-label="HR Quick Actions"
        className="rounded-2xl border border-line bg-surface p-3 shadow-2xs"
      >
        <div className="mb-2.5 flex items-center justify-between gap-2 px-0.5">
          <div className="flex items-center gap-1.5">
            <Zap className="size-3.5 text-amber-500" />
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-fg">
              HR Quick Actions & Shortcuts
            </span>
            <span className="hidden text-[11px] text-fg-muted sm:inline">
              — One-click workflows for employee profiles, rosters, leave requests and payroll
            </span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7">
          {canHrManage && (
            <button
              type="button"
              onClick={() => setCreateStaffOpen(true)}
              className="group flex flex-col justify-between gap-2 rounded-xl border border-fg bg-fg p-3 text-left text-bg shadow-xs transition-all hover:opacity-95"
            >
              <div className="flex items-center justify-between gap-1.5">
                <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-white/15 text-bg">
                  <UserPlus className="size-4" strokeWidth={2.2} />
                </span>
                <span className="rounded-full border border-white/25 bg-white/15 px-2 py-0.5 text-[10px] font-bold tabular text-bg">
                  + Add
                </span>
              </div>
              <div className="min-w-0">
                <p className="truncate text-xs font-extrabold text-bg">+ Add Employee</p>
                <p className="mt-0.5 truncate text-[10.5px] text-bg/75">New profile & terms</p>
              </div>
            </button>
          )}

          {canHrManage && (
            <button
              type="button"
              onClick={() => setCreateShiftOpen(true)}
              className="group flex flex-col justify-between gap-2 rounded-xl border border-line bg-surface-2/35 p-3 text-left text-fg transition-all hover:border-line-strong hover:bg-surface-2/80"
            >
              <div className="flex items-center justify-between gap-1.5">
                <span className="grid size-8 shrink-0 place-items-center rounded-lg border border-line/80 bg-surface text-sky-500">
                  <Clock className="size-4" strokeWidth={2.2} />
                </span>
                <ArrowRight className="size-3.5 text-fg-subtle transition-transform group-hover:translate-x-0.5" />
              </div>
              <div className="min-w-0">
                <p className="truncate text-xs font-extrabold text-fg">Assign Shift</p>
                <p className="mt-0.5 truncate text-[10.5px] text-fg-muted">Daily duty coverage</p>
              </div>
            </button>
          )}

          {canHrManage && (
            <button
              type="button"
              onClick={() => setBulkShiftOpen(true)}
              className="group flex flex-col justify-between gap-2 rounded-xl border border-line bg-surface-2/35 p-3 text-left text-fg transition-all hover:border-line-strong hover:bg-surface-2/80"
            >
              <div className="flex items-center justify-between gap-1.5">
                <span className="grid size-8 shrink-0 place-items-center rounded-lg border border-line/80 bg-surface text-indigo-500">
                  <CalendarDays className="size-4" strokeWidth={2.2} />
                </span>
                <ArrowRight className="size-3.5 text-fg-subtle transition-transform group-hover:translate-x-0.5" />
              </div>
              <div className="min-w-0">
                <p className="truncate text-xs font-extrabold text-fg">Weekly Roster</p>
                <p className="mt-0.5 truncate text-[10.5px] text-fg-muted">Bulk 7-day schedule</p>
              </div>
            </button>
          )}

          {canHrManage && (
            <button
              type="button"
              onClick={() => setCreateLeaveOpen(true)}
              className="group flex flex-col justify-between gap-2 rounded-xl border border-line bg-surface-2/35 p-3 text-left text-fg transition-all hover:border-line-strong hover:bg-surface-2/80"
            >
              <div className="flex items-center justify-between gap-1.5">
                <span className="grid size-8 shrink-0 place-items-center rounded-lg border border-line/80 bg-surface text-amber-500">
                  <CalendarDays className="size-4" strokeWidth={2.2} />
                </span>
                <ArrowRight className="size-3.5 text-fg-subtle transition-transform group-hover:translate-x-0.5" />
              </div>
              <div className="min-w-0">
                <p className="truncate text-xs font-extrabold text-fg">Log Leave</p>
                <p className="mt-0.5 truncate text-[10.5px] text-fg-muted">Annual or sick absence</p>
              </div>
            </button>
          )}

          <button
            type="button"
            onClick={() => {
              setActiveTab('LEAVE');
              setLeaveStatusFilter('PENDING');
              router.replace('/hr?tab=LEAVE', { scroll: false });
            }}
            className="group flex flex-col justify-between gap-2 rounded-xl border border-line bg-surface-2/35 p-3 text-left text-fg transition-all hover:border-line-strong hover:bg-surface-2/80"
          >
            <div className="flex items-center justify-between gap-1.5">
              <span className="grid size-8 shrink-0 place-items-center rounded-lg border border-line/80 bg-surface text-rose-500">
                <CheckCircle2 className="size-4" strokeWidth={2.2} />
              </span>
              {(overview?.pendingLeaveRequests ?? 0) > 0 ? (
                <span className="rounded-full border border-amber-500/35 bg-amber-500/12 px-2 py-0.5 text-[10px] font-bold tabular text-warning">
                  {overview?.pendingLeaveRequests} pending
                </span>
              ) : (
                <ArrowRight className="size-3.5 text-fg-subtle transition-transform group-hover:translate-x-0.5" />
              )}
            </div>
            <div className="min-w-0">
              <p className="truncate text-xs font-extrabold text-fg">Review Leaves</p>
              <p className="mt-0.5 truncate text-[10.5px] text-fg-muted">
                {(overview?.pendingLeaveRequests ?? 0) > 0
                  ? `${overview?.pendingLeaveRequests} awaiting review`
                  : 'Time-off queue clear'}
              </p>
            </div>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab('PAYROLL');
              router.replace('/hr?tab=PAYROLL', { scroll: false });
            }}
            className="group flex flex-col justify-between gap-2 rounded-xl border border-line bg-surface-2/35 p-3 text-left text-fg transition-all hover:border-line-strong hover:bg-surface-2/80"
          >
            <div className="flex items-center justify-between gap-1.5">
              <span className="grid size-8 shrink-0 place-items-center rounded-lg border border-line/80 bg-surface text-emerald-500">
                <DollarSign className="size-4" strokeWidth={2.2} />
              </span>
              {payrollSummary.pendingCount > 0 ? (
                <span className="rounded-full border border-amber-500/35 bg-amber-500/12 px-2 py-0.5 text-[10px] font-bold tabular text-warning">
                  {payrollSummary.pendingCount} unpaid
                </span>
              ) : (
                <ArrowRight className="size-3.5 text-fg-subtle transition-transform group-hover:translate-x-0.5" />
              )}
            </div>
            <div className="min-w-0">
              <p className="truncate text-xs font-extrabold text-fg">Process Payroll</p>
              <p className="mt-0.5 truncate text-[10.5px] text-fg-muted">{payrollMonth} PAYE & NSSF</p>
            </div>
          </button>

          <Link
            href="/departments"
            className="group flex flex-col justify-between gap-2 rounded-xl border border-line bg-surface-2/35 p-3 text-fg transition-all hover:border-line-strong hover:bg-surface-2/80"
          >
            <div className="flex items-center justify-between gap-1.5">
              <span className="grid size-8 shrink-0 place-items-center rounded-lg border border-line/80 bg-surface text-sky-600 dark:text-sky-400">
                <Building2 className="size-4" strokeWidth={2.2} />
              </span>
              <ArrowRight className="size-3.5 text-fg-subtle transition-transform group-hover:translate-x-0.5" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-xs font-extrabold text-fg">Departments</p>
              <p className="mt-0.5 truncate text-[10.5px] text-fg-muted">{departments?.length ?? 9} hotel cost centers</p>
            </div>
          </Link>
        </div>
      </section>

      {/* 2. Interactive KPI Overview Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
        <button
          type="button"
          onClick={() => {
            setActiveTab('STAFF');
            router.replace('/hr', { scroll: false });
          }}
          className={cn(
            'group rounded-2xl border p-4 shadow-xs text-left transition-all hover:shadow-md cursor-pointer',
            activeTab === 'STAFF'
              ? 'border-line-strong bg-surface ring-2 ring-fg/10'
              : 'border-line bg-surface hover:border-line-strong hover:bg-surface-2/40',
          )}
        >
          <div className="flex items-center justify-between text-fg-subtle">
            <span className="text-[11px] font-bold uppercase tracking-wider">Active Headcount</span>
            <Users className="h-4 w-4 text-emerald-600 transition-transform group-hover:scale-110" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-extrabold tracking-tight text-fg">
              {overview?.activeStaff ?? 0}
            </span>
            <span className="text-xs text-fg-muted">of {overview?.totalStaff ?? 0} staff</span>
          </div>
          <div className="mt-1 flex items-center justify-between text-[11px] text-fg-subtle">
            <span>Across {departments?.length ?? 9} depts</span>
            <span className="font-semibold text-accent opacity-0 transition-opacity group-hover:opacity-100">
              View Directory →
            </span>
          </div>
        </button>

        <Link
          href="/settings/users"
          className="group rounded-2xl border border-line bg-surface p-4 shadow-xs text-left transition-all hover:border-line-strong hover:bg-surface-2/40 hover:shadow-md cursor-pointer"
        >
          <div className="flex items-center justify-between text-fg-subtle">
            <span className="text-[11px] font-bold uppercase tracking-wider">System Access Linked</span>
            <ShieldCheck className="h-4 w-4 text-violet-600 transition-transform group-hover:scale-110" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-extrabold tracking-tight text-fg">{linkedRolesCount}</span>
            <span className="text-xs text-violet-600 dark:text-violet-400 font-semibold">active roles</span>
          </div>
          <div className="mt-1 flex items-center justify-between text-[11px] text-fg-subtle">
            <span>Linked to RBAC</span>
            <span className="font-semibold text-accent opacity-0 transition-opacity group-hover:opacity-100">
              Manage Roles →
            </span>
          </div>
        </Link>

        <button
          type="button"
          onClick={() => {
            setActiveTab('ROSTER');
            router.replace('/hr?tab=ROSTER', { scroll: false });
          }}
          className={cn(
            'group rounded-2xl border p-4 shadow-xs text-left transition-all hover:shadow-md cursor-pointer',
            activeTab === 'ROSTER'
              ? 'border-line-strong bg-surface ring-2 ring-fg/10'
              : 'border-line bg-surface hover:border-line-strong hover:bg-surface-2/40',
          )}
        >
          <div className="flex items-center justify-between text-fg-subtle">
            <span className="text-[11px] font-bold uppercase tracking-wider">Shifts Today</span>
            <Clock className="h-4 w-4 text-sky-600 transition-transform group-hover:scale-110" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-extrabold tracking-tight text-fg">
              {overview?.scheduledShiftsToday ?? 0}
            </span>
            <span className="text-xs text-sky-600 dark:text-sky-400 font-semibold">on duty</span>
          </div>
          <div className="mt-1 flex items-center justify-between text-[11px] text-fg-subtle">
            <span>Morning, Eve & Night</span>
            <span className="font-semibold text-accent opacity-0 transition-opacity group-hover:opacity-100">
              Open Roster →
            </span>
          </div>
        </button>

        <button
          type="button"
          onClick={() => {
            setActiveTab('LEAVE');
            router.replace('/hr?tab=LEAVE', { scroll: false });
          }}
          className={cn(
            'group rounded-2xl border p-4 shadow-xs text-left transition-all hover:shadow-md cursor-pointer',
            activeTab === 'LEAVE'
              ? 'border-line-strong bg-surface ring-2 ring-fg/10'
              : 'border-line bg-surface hover:border-line-strong hover:bg-surface-2/40',
          )}
        >
          <div className="flex items-center justify-between text-fg-subtle">
            <span className="text-[11px] font-bold uppercase tracking-wider">Leave & Absence</span>
            <CalendarDays className="h-4 w-4 text-amber-600 transition-transform group-hover:scale-110" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-extrabold tracking-tight text-fg">
              {overview?.onLeaveToday ?? 0}
            </span>
            <span className="text-xs text-amber-600 font-semibold">
              away · {overview?.pendingLeaveRequests ?? 0} pending
            </span>
          </div>
          <div className="mt-1 flex items-center justify-between text-[11px] text-fg-subtle">
            <span>Statutory 21d leave</span>
            <span className="font-semibold text-accent opacity-0 transition-opacity group-hover:opacity-100">
              Leave Queue →
            </span>
          </div>
        </button>

        <button
          type="button"
          onClick={() => {
            setActiveTab('PAYROLL');
            router.replace('/hr?tab=PAYROLL', { scroll: false });
          }}
          className={cn(
            'group rounded-2xl border p-4 shadow-xs text-left transition-all hover:shadow-md cursor-pointer',
            activeTab === 'PAYROLL'
              ? 'border-line-strong bg-surface ring-2 ring-fg/10'
              : 'border-line bg-surface hover:border-line-strong hover:bg-surface-2/40',
          )}
        >
          <div className="flex items-center justify-between text-fg-subtle">
            <span className="text-[11px] font-bold uppercase tracking-wider">Monthly Base Payroll</span>
            <DollarSign className="h-4 w-4 text-emerald-600 transition-transform group-hover:scale-110" />
          </div>
          <div className="mt-2">
            <span className="font-mono text-xl font-extrabold tracking-tight text-emerald-600 dark:text-emerald-400">
              {money(overview?.totalMonthlyPayrollMinor || '0', 'UGX')}
            </span>
          </div>
          <div className="mt-1 flex items-center justify-between text-[11px] text-fg-subtle">
            <span>Before PAYE & NSSF</span>
            <span className="font-semibold text-accent opacity-0 transition-opacity group-hover:opacity-100">
              Open Payroll →
            </span>
          </div>
        </button>
      </div>

      {/* Tabs Navigation */}
      <Tabs
        value={activeTab}
        onChange={(t) => {
          const next = t as HrTab;
          setActiveTab(next);
          router.replace(next === 'STAFF' ? '/hr' : `/hr?tab=${next}`, { scroll: false });
        }}
        items={[
          { value: 'STAFF', label: 'Employee Directory & Roles', count: staffList?.length },
          { value: 'ROSTER', label: 'Shifts & Live Attendance', count: shifts?.length },
          { value: 'LEAVE', label: 'Leave & Absence Queue', count: overview?.pendingLeaveRequests },
          { value: 'PAYROLL', label: 'Monthly Payroll, PAYE & NSSF', count: payrollRecords?.length },
          { value: 'ANALYTICS', label: 'Department Cost & Contracts', count: departments?.length },
        ]}
      />

      {/* ───────────────────────── TAB 1: EMPLOYEE DIRECTORY ───────────────────────── */}
      {activeTab === 'STAFF' && (
        <div className="space-y-4">
          <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3 rounded-2xl border border-line bg-surface p-3 shadow-xs">
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-fg-subtle" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by employee name, REB-EMP number, phone, email, job title, or system role..."
                className="w-full rounded-xl border border-line bg-surface-2/50 pl-10 pr-4 py-2 text-sm text-fg placeholder:text-fg-subtle focus:border-line-strong focus:outline-none"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {departments && departments.length > 0 && (
                <select
                  value={deptFilter}
                  onChange={(e) => setDeptFilter(e.target.value)}
                  className="rounded-xl border border-line bg-surface-2/50 px-3 py-2 text-xs font-semibold text-fg focus:outline-none"
                >
                  <option value="ALL">All Departments ({departments.length})</option>
                  {departments.map((d) => (
                    <option key={d.code} value={d.code}>
                      {d.name}
                    </option>
                  ))}
                </select>
              )}

              <select
                value={employmentFilter}
                onChange={(e) => setEmploymentFilter(e.target.value)}
                className="rounded-xl border border-line bg-surface-2/50 px-3 py-2 text-xs font-semibold text-fg focus:outline-none"
              >
                <option value="ALL">All Contract Types</option>
                <option value="FULL_TIME">Full Time</option>
                <option value="PART_TIME">Part Time</option>
                <option value="CONTRACT">Fixed Contract</option>
                <option value="PROBATION">Probation</option>
                <option value="CASUAL">Casual</option>
              </select>

              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="rounded-xl border border-line bg-surface-2/50 px-3 py-2 text-xs font-semibold text-fg focus:outline-none"
              >
                <option value="ALL">All Statuses</option>
                <option value="ACTIVE">Active</option>
                <option value="ON_LEAVE">On Leave</option>
                <option value="SUSPENDED">Suspended</option>
                <option value="TERMINATED">Terminated</option>
              </select>
            </div>
          </div>

          <div className="overflow-hidden rounded-2xl border border-line bg-surface shadow-xs">
            {staffLoading ? (
              <div className="p-8 space-y-4">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : filteredStaff.length === 0 ? (
              <div className="p-12 text-center">
                <Empty
                  title="No staff records found"
                  body="No employees match your current filter criteria. Click 'Add Employee' to onboard personnel."
                />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1220px] text-left text-xs text-fg">
                  <thead className="border-b border-line bg-surface-2/60 text-[11px] font-bold uppercase tracking-wider text-fg-subtle">
                    <tr>
                      <th className="px-4 py-3.5">Employee & ID</th>
                      <th className="px-4 py-3.5">Department & Job Title</th>
                      <th className="px-4 py-3.5">System Access Role</th>
                      <th className="px-4 py-3.5">Contact & Emergency</th>
                      <th className="px-4 py-3.5">Statutory IDs</th>
                      <th className="px-4 py-3.5">Contract & Joined</th>
                      <th className="px-4 py-3.5">Base Salary & Payout</th>
                      <th className="px-4 py-3.5">Status</th>
                      <th className="px-4 py-3.5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {filteredStaff.map((staff) => (
                      <tr key={staff.id} className="group hover:bg-surface-2/40 transition-colors">
                        <td className="px-4 py-3.5 whitespace-nowrap">
                          <div className="flex items-center gap-3">
                            <button
                              type="button"
                              onClick={() => setViewingStaff(staff)}
                              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-500/15 text-xs font-bold text-emerald-700 dark:text-emerald-300"
                            >
                              {staff.firstName[0]}
                              {staff.lastName[0]}
                            </button>
                            <div>
                              <button
                                type="button"
                                onClick={() => setViewingStaff(staff)}
                                className="font-bold text-fg hover:text-emerald-600 transition text-left block"
                              >
                                {staff.fullName}
                              </button>
                              <span className="font-mono text-[11px] text-fg-subtle">{staff.employeeNumber}</span>
                            </div>
                          </div>
                        </td>

                        <td className="px-4 py-3.5">
                          <div className="font-semibold text-fg">{staff.jobTitle}</div>
                          <div className="text-[11px] text-fg-muted">{staff.departmentName || staff.departmentCode}</div>
                        </td>

                        <td className="px-4 py-3.5 whitespace-nowrap">
                          {staff.systemAccess ? (
                            <div className="flex flex-col items-start gap-1">
                              <button
                                type="button"
                                onClick={() => canHrManage && setAssigningRoleStaff(staff)}
                                className="inline-flex items-center gap-1.5 rounded-lg border border-violet-500/30 bg-violet-500/10 px-2.5 py-1 text-[11px] font-bold text-violet-700 dark:text-violet-300 hover:bg-violet-500/20 transition"
                                title="Click to change system role"
                              >
                                <ShieldCheck className="size-3" />
                                {staff.systemAccess.roleDisplayName}
                              </button>
                              <span className="text-[10px] text-fg-subtle">
                                {staff.systemAccess.canSignIn ? '● Sign-in enabled' : '○ Staff record only'}
                              </span>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => canHrManage && setAssigningRoleStaff(staff)}
                              className="inline-flex items-center gap-1 rounded-lg border border-dashed border-line-strong px-2.5 py-1 text-[11px] font-semibold text-fg-muted hover:border-fg hover:text-fg transition"
                            >
                              <KeyRound className="size-3" /> Assign Role
                            </button>
                          )}
                        </td>

                        <td className="px-4 py-3.5 whitespace-nowrap">
                          <div className="flex flex-col gap-0.5">
                            <span className="font-medium text-fg flex items-center gap-1">
                              <Phone className="size-3 text-fg-subtle" /> {staff.phone}
                            </span>
                            {staff.email && (
                              <span className="text-[11px] text-fg-muted flex items-center gap-1">
                                <Mail className="size-3 text-fg-subtle" /> {staff.email}
                              </span>
                            )}
                            <span className="text-[10px] text-fg-subtle">
                              Kin: {staff.emergencyContactName} ({staff.emergencyContactRelation})
                            </span>
                          </div>
                        </td>

                        <td className="px-4 py-3.5 whitespace-nowrap font-mono text-[11px]">
                          <div>NIN: {staff.nationalIdNumber || '—'}</div>
                          <div className="text-fg-subtle">
                            NSSF: {staff.nssfNumber || '—'} · TIN: {staff.tinNumber || '—'}
                          </div>
                        </td>

                        <td className="px-4 py-3.5 whitespace-nowrap">
                          <div className="font-semibold text-fg">{staff.employmentType.replace('_', ' ')}</div>
                          <div className="text-[11px] text-fg-subtle">Joined {staff.dateJoined}</div>
                        </td>

                        <td className="px-4 py-3.5 whitespace-nowrap">
                          <div className="font-mono font-bold text-fg">
                            {money(staff.baseSalaryMinor, staff.currency)}
                          </div>
                          <div className="text-[11px] text-fg-subtle">
                            {staff.paymentMethod === 'BANK_TRANSFER'
                              ? staff.bankName || 'Bank Transfer'
                              : staff.paymentMethod === 'MOBILE_MONEY'
                              ? `MoMo (${staff.mobileMoneyNumber || staff.phone})`
                              : 'Cash'}
                          </div>
                        </td>

                        <td className="px-4 py-3.5 whitespace-nowrap">
                          <span
                            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
                              staff.status === 'ACTIVE'
                                ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                                : staff.status === 'ON_LEAVE'
                                ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
                                : 'bg-rose-500/15 text-rose-700 dark:text-rose-300'
                            }`}
                          >
                            {staff.status}
                          </span>
                        </td>

                        <td className="px-4 py-3.5 text-right whitespace-nowrap">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => setViewingStaff(staff)}
                              className="h-7 px-2 text-[11px]"
                              title="Open 360° Staff Dossier"
                            >
                              <Eye className="size-3.5" /> Dossier
                            </Button>
                            {canHrManage && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setEditingStaff(staff)}
                                className="h-7 w-7 p-0"
                                title="Edit profile"
                              >
                                <Edit className="size-3.5" />
                              </Button>
                            )}
                            {isOwner && staff.status !== 'TERMINATED' && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setTerminatingStaff(staff)}
                                className="h-7 w-7 p-0 text-rose-600 hover:bg-rose-500/10"
                                title="Terminate employee"
                              >
                                <Trash2 className="size-3.5" />
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ───────────────────────── TAB 2: SHIFTS & LIVE ATTENDANCE ───────────────────────── */}
      {activeTab === 'ROSTER' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-surface p-3.5 shadow-xs">
            <div>
              <h3 className="text-sm font-bold text-fg">Duty Roster & Real-Time Attendance Clock-In</h3>
              <p className="text-xs text-fg-muted">
                Mark staff Present, Late, Clocked Out, or Absent directly from the duty roster.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="date"
                value={shiftDateFilter}
                onChange={(e) => setShiftDateFilter(e.target.value)}
                className="rounded-xl border border-line bg-surface-2/50 px-3 py-1.5 text-xs font-semibold text-fg"
              />
              {shiftDateFilter && (
                <Button variant="ghost" size="sm" onClick={() => setShiftDateFilter('')}>
                  All Dates
                </Button>
              )}
              {departments && (
                <select
                  value={deptFilter}
                  onChange={(e) => setDeptFilter(e.target.value)}
                  className="rounded-xl border border-line bg-surface-2/50 px-3 py-1.5 text-xs font-semibold text-fg"
                >
                  <option value="ALL">All Departments</option>
                  {departments.map((d) => (
                    <option key={d.code} value={d.code}>
                      {d.name}
                    </option>
                  ))}
                </select>
              )}
            </div>
          </div>

          <div className="overflow-hidden rounded-2xl border border-line bg-surface shadow-xs">
            {shiftsLoading ? (
              <div className="p-8 space-y-3">
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-full" />
              </div>
            ) : !shifts || shifts.length === 0 ? (
              <div className="p-12 text-center">
                <Empty
                  title="No shifts scheduled"
                  body="Use 'Assign Shift' or 'Bulk Weekly Roster' to schedule staff coverage."
                />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1040px] text-left text-xs">
                  <thead className="border-b border-line bg-surface-2/60 text-[11px] font-bold uppercase tracking-wider text-fg-subtle">
                    <tr>
                      <th className="py-3 px-4">Staff Member</th>
                      <th className="py-3 px-4">Department</th>
                      <th className="py-3 px-4">Shift Date</th>
                      <th className="py-3 px-4">Shift Type</th>
                      <th className="py-3 px-4">Scheduled Hours</th>
                      <th className="py-3 px-4">Actual Clock-In / Out</th>
                      <th className="py-3 px-4">Attendance Status</th>
                      <th className="py-3 px-4 text-right">Live Attendance Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {shifts.map((sh) => (
                      <tr key={sh.id} className="hover:bg-surface-2/40">
                        <td className="py-3 px-4 font-bold text-fg whitespace-nowrap">
                          {sh.staffName}
                          <span className="block text-[11px] text-fg-subtle font-normal">{sh.staffJobTitle}</span>
                        </td>
                        <td className="py-3 px-4 font-medium text-fg-muted whitespace-nowrap">
                          {sh.departmentCode}
                        </td>
                        <td className="py-3 px-4 font-mono whitespace-nowrap">{sh.date}</td>
                        <td className="py-3 px-4 whitespace-nowrap">
                          <span className="rounded-md border border-line bg-surface-2 px-2 py-0.5 text-[11px] font-bold">
                            {sh.shiftType}
                          </span>
                        </td>
                        <td className="py-3 px-4 font-mono text-fg-muted whitespace-nowrap">
                          {sh.scheduledStartTime || '06:00'} – {sh.scheduledEndTime || '14:00'}
                        </td>
                        <td className="py-3 px-4 font-mono text-[11px] text-fg-muted whitespace-nowrap">
                          {sh.actualCheckIn
                            ? `In: ${new Date(sh.actualCheckIn).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                            : '—'}
                          {sh.actualCheckOut
                            ? ` · Out: ${new Date(sh.actualCheckOut).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                            : ''}
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap">
                          <span
                            className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
                              sh.attendanceStatus === 'PRESENT'
                                ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                                : sh.attendanceStatus === 'LATE'
                                ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
                                : sh.attendanceStatus === 'ABSENT'
                                ? 'bg-rose-500/15 text-rose-700 dark:text-rose-300'
                                : 'bg-surface-2 text-fg-muted'
                            }`}
                          >
                            {sh.attendanceStatus}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right whitespace-nowrap">
                          {canHrManage && (
                            <div className="flex items-center justify-end gap-1">
                              {sh.attendanceStatus !== 'PRESENT' && (
                                <Button
                                  variant="secondary"
                                  size="sm"
                                  className="h-7 px-2 text-[11px] text-emerald-700 dark:text-emerald-300"
                                  onClick={() =>
                                    updateShiftMutation.mutate({
                                      id: sh.id,
                                      data: {
                                        attendanceStatus: 'PRESENT',
                                        actualCheckIn: sh.actualCheckIn || new Date().toISOString(),
                                      },
                                    })
                                  }
                                >
                                  <LogIn className="size-3" /> Clock In
                                </Button>
                              )}
                              {sh.actualCheckIn && !sh.actualCheckOut && (
                                <Button
                                  variant="secondary"
                                  size="sm"
                                  className="h-7 px-2 text-[11px]"
                                  onClick={() =>
                                    updateShiftMutation.mutate({
                                      id: sh.id,
                                      data: { actualCheckOut: new Date().toISOString() },
                                    })
                                  }
                                >
                                  <LogOut className="size-3" /> Clock Out
                                </Button>
                              )}
                              {sh.attendanceStatus !== 'LATE' && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 px-2 text-[11px] text-amber-600"
                                  onClick={() =>
                                    updateShiftMutation.mutate({
                                      id: sh.id,
                                      data: {
                                        attendanceStatus: 'LATE',
                                        actualCheckIn: sh.actualCheckIn || new Date().toISOString(),
                                      },
                                    })
                                  }
                                >
                                  Late
                                </Button>
                              )}
                              {sh.attendanceStatus !== 'ABSENT' && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 px-2 text-[11px] text-rose-600"
                                  onClick={() =>
                                    updateShiftMutation.mutate({
                                      id: sh.id,
                                      data: { attendanceStatus: 'ABSENT' },
                                    })
                                  }
                                >
                                  Absent
                                </Button>
                              )}
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 w-7 p-0 text-fg-subtle hover:text-rose-600"
                                onClick={() => deleteShiftMutation.mutate(sh.id)}
                                title="Delete shift"
                              >
                                <Trash2 className="size-3.5" />
                              </Button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ───────────────────────── TAB 3: LEAVE & ABSENCE MANAGEMENT ───────────────────────── */}
      {activeTab === 'LEAVE' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-surface p-3.5 shadow-xs">
            <div>
              <h3 className="text-sm font-bold text-fg">Employee Leave & Absence Approval Queue</h3>
              <p className="text-xs text-fg-muted">
                Approve or reject annual, sick, maternity, paternity, and compassionate leave requests.
              </p>
            </div>
            <div className="flex items-center gap-2">
              {(['ALL', 'PENDING', 'APPROVED', 'REJECTED'] as const).map((st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => setLeaveStatusFilter(st)}
                  className={`rounded-xl px-3 py-1.5 text-xs font-bold transition ${
                    leaveStatusFilter === st
                      ? 'bg-fg text-bg'
                      : 'bg-surface-2 text-fg-muted hover:text-fg'
                  }`}
                >
                  {st}
                </button>
              ))}
            </div>
          </div>

          <div className="overflow-hidden rounded-2xl border border-line bg-surface shadow-xs">
            {leavesLoading ? (
              <div className="p-8 space-y-3">
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-full" />
              </div>
            ) : !leaves || leaves.length === 0 ? (
              <div className="p-12 text-center">
                <Empty
                  title="No leave requests"
                  body="No employee leave requests match your current filter."
                />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[980px] text-left text-xs">
                  <thead className="border-b border-line bg-surface-2/60 text-[11px] font-bold uppercase tracking-wider text-fg-subtle">
                    <tr>
                      <th className="py-3 px-4">Employee</th>
                      <th className="py-3 px-4">Leave Category</th>
                      <th className="py-3 px-4">Dates & Days</th>
                      <th className="py-3 px-4">Reason & Handover Notes</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4 text-right">Review Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {leaves.map((l) => (
                      <tr key={l.id} className="hover:bg-surface-2/40">
                        <td className="py-3 px-4 font-bold text-fg whitespace-nowrap">
                          {l.staffName}
                          <span className="block text-[11px] text-fg-subtle font-normal">{l.departmentCode}</span>
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap">
                          <span className="rounded-md border border-line bg-surface-2 px-2 py-0.5 text-[11px] font-bold">
                            {l.leaveType}
                          </span>
                        </td>
                        <td className="py-3 px-4 font-mono whitespace-nowrap">
                          {l.startDate} → {l.endDate}
                          <span className="ml-1.5 rounded bg-surface-2 px-1.5 py-0.5 text-[10px] font-bold">
                            {l.daysCount}d
                          </span>
                        </td>
                        <td className="py-3 px-4 max-w-md">
                          <div className="font-medium text-fg">{l.reason}</div>
                          {l.handoverNotes && (
                            <div className="text-[11px] text-fg-subtle mt-0.5">Handover: {l.handoverNotes}</div>
                          )}
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap">
                          <span
                            className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
                              l.status === 'APPROVED'
                                ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                                : l.status === 'REJECTED'
                                ? 'bg-rose-500/15 text-rose-700 dark:text-rose-300'
                                : 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
                            }`}
                          >
                            {l.status}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right whitespace-nowrap">
                          {l.status === 'PENDING' && canHrManage ? (
                            <Button variant="primary" size="sm" onClick={() => setReviewingLeave(l)}>
                              Review Request
                            </Button>
                          ) : (
                            <div className="text-[11px] text-fg-subtle">
                              {l.reviewedByName ? `By ${l.reviewedByName}` : 'Reviewed'}
                              {l.reviewNotes ? ` · "${l.reviewNotes}"` : ''}
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ───────────────────────── TAB 4: MONTHLY PAYROLL, PAYE & NSSF ───────────────────────── */}
      {activeTab === 'PAYROLL' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 rounded-2xl border border-line bg-surface p-4 shadow-xs">
            <div>
              <h3 className="text-sm font-bold text-fg">
                Monthly Payroll Register & Statutory Uganda URA PAYE / NSSF Returns
              </h3>
              <p className="text-xs text-fg-muted">
                Adjust overtime, bonuses, and salary advances, print official payslips, and disburse salaries with automatic Expense ledger sync.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <label className="text-xs font-bold text-fg-muted">Payroll Month:</label>
              <input
                type="month"
                value={payrollMonth}
                onChange={(e) => setPayrollMonth(e.target.value)}
                className="rounded-xl border border-line bg-surface-2/50 px-3 py-1.5 text-xs font-bold text-fg"
              />
              {payrollRecords && payrollRecords.length > 0 && (
                <>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() =>
                      exportCsv(
                        `reberon-payroll-${payrollMonth}.csv`,
                        [
                          'Employee Number',
                          'Employee Name',
                          'Department',
                          'Job Title',
                          'Base Salary',
                          'Overtime',
                          'Allowances',
                          'Gross Salary',
                          'NSSF 5% (Employee)',
                          'NSSF 10% (Employer)',
                          'URA PAYE Tax',
                          'Advances / Deductions',
                          'Net Take-Home Pay',
                          'Status',
                          'Payment Reference',
                        ],
                        payrollRecords.map((p) => [
                          p.employeeNumber,
                          p.staffName,
                          p.departmentCode,
                          p.jobTitle,
                          p.baseSalaryMinor,
                          p.overtimeMinor,
                          p.allowancesMinor,
                          p.grossSalaryMinor,
                          p.nssfEmployeeMinor,
                          p.nssfEmployerMinor,
                          p.payeTaxMinor,
                          (BigInt(p.advancesDeductionMinor || '0') + BigInt(p.otherDeductionsMinor || '0')).toString(),
                          p.netSalaryMinor,
                          p.paymentStatus,
                          p.paymentReference || '',
                        ]),
                      )
                    }
                    className="gap-1.5"
                  >
                    <Download className="size-3.5" /> Export URA / Bank CSV
                  </Button>
                  {payrollSummary.pendingCount > 0 && canHrManage && (
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => batchPayMutation.mutate()}
                      disabled={batchPayMutation.isPending}
                      className="gap-1.5"
                    >
                      <CheckCircle2 className="size-3.5" />
                      {batchPayMutation.isPending
                        ? 'Disbursing...'
                        : `Disburse All Pending (${payrollSummary.pendingCount})`}
                    </Button>
                  )}
                </>
              )}
            </div>
          </div>

          {payrollRecords && payrollRecords.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
              <div className="rounded-xl border border-line bg-surface p-3.5">
                <span className="text-[10px] font-bold uppercase text-fg-subtle">Total Gross Payroll</span>
                <div className="font-mono text-base font-extrabold text-fg mt-1">
                  {money(payrollSummary.gross.toString(), 'UGX')}
                </div>
              </div>
              <div className="rounded-xl border border-line bg-surface p-3.5">
                <span className="text-[10px] font-bold uppercase text-fg-subtle">Overtime & Allowances</span>
                <div className="font-mono text-base font-extrabold text-emerald-600 mt-1">
                  + {money(payrollSummary.allowancesAndOt.toString(), 'UGX')}
                </div>
              </div>
              <div className="rounded-xl border border-line bg-surface p-3.5">
                <span className="text-[10px] font-bold uppercase text-fg-subtle">URA PAYE Tax Liability</span>
                <div className="font-mono text-base font-extrabold text-rose-600 mt-1">
                  {money(payrollSummary.paye.toString(), 'UGX')}
                </div>
              </div>
              <div className="rounded-xl border border-line bg-surface p-3.5">
                <span className="text-[10px] font-bold uppercase text-fg-subtle">NSSF Total (5% + 10%)</span>
                <div className="font-mono text-base font-extrabold text-amber-600 mt-1">
                  {money((payrollSummary.nssfEmp + payrollSummary.nssfEmpr).toString(), 'UGX')}
                </div>
              </div>
              <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3.5">
                <span className="text-[10px] font-bold uppercase text-emerald-800 dark:text-emerald-300">
                  Total Net Take-Home ({payrollSummary.paidCount}/{payrollRecords.length} Paid)
                </span>
                <div className="font-mono text-base font-extrabold text-emerald-700 dark:text-emerald-300 mt-1">
                  {money(payrollSummary.net.toString(), 'UGX')}
                </div>
              </div>
            </div>
          )}

          <div className="overflow-hidden rounded-2xl border border-line bg-surface shadow-xs">
            {payrollLoading ? (
              <div className="p-8 space-y-4">
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-full" />
              </div>
            ) : !payrollRecords || payrollRecords.length === 0 ? (
              <div className="p-12 text-center">
                <Empty
                  title={`No payroll records generated for ${payrollMonth}`}
                  body="Click 'Generate Payroll' in the top right to compute salaries, URA PAYE taxes, and NSSF contributions."
                />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1180px] text-left text-xs">
                  <thead className="border-b border-line bg-surface-2/60 text-[11px] font-bold uppercase tracking-wider text-fg-subtle">
                    <tr>
                      <th className="py-3 px-4">Employee</th>
                      <th className="py-3 px-4">Base Salary</th>
                      <th className="py-3 px-4">+ OT / Allowances</th>
                      <th className="py-3 px-4">Gross Pay</th>
                      <th className="py-3 px-4">- NSSF (5%)</th>
                      <th className="py-3 px-4">- URA PAYE</th>
                      <th className="py-3 px-4">- Advances</th>
                      <th className="py-3 px-4">Net Take-Home</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {payrollRecords.map((p) => {
                      const extras = BigInt(p.overtimeMinor || '0') + BigInt(p.allowancesMinor || '0');
                      const deds = BigInt(p.advancesDeductionMinor || '0') + BigInt(p.otherDeductionsMinor || '0');
                      return (
                        <tr key={p.id} className="hover:bg-surface-2/40">
                          <td className="py-3 px-4 font-bold text-fg whitespace-nowrap">
                            {p.staffName}
                            <span className="block text-[11px] font-mono text-fg-subtle font-normal">
                              {p.employeeNumber} · {p.jobTitle}
                            </span>
                          </td>
                          <td className="py-3 px-4 font-mono whitespace-nowrap">
                            {money(p.baseSalaryMinor, p.currency)}
                          </td>
                          <td className="py-3 px-4 font-mono text-emerald-600 whitespace-nowrap">
                            {extras > 0n ? `+ ${money(extras.toString(), p.currency)}` : '—'}
                          </td>
                          <td className="py-3 px-4 font-mono font-bold text-fg whitespace-nowrap">
                            {money(p.grossSalaryMinor, p.currency)}
                          </td>
                          <td className="py-3 px-4 font-mono text-fg-muted whitespace-nowrap">
                            {money(p.nssfEmployeeMinor, p.currency)}
                          </td>
                          <td className="py-3 px-4 font-mono text-fg-muted whitespace-nowrap">
                            {money(p.payeTaxMinor, p.currency)}
                          </td>
                          <td className="py-3 px-4 font-mono text-rose-600 whitespace-nowrap">
                            {deds > 0n ? `- ${money(deds.toString(), p.currency)}` : '—'}
                          </td>
                          <td className="py-3 px-4 font-mono font-extrabold text-emerald-600 dark:text-emerald-400 whitespace-nowrap">
                            {money(p.netSalaryMinor, p.currency)}
                          </td>
                          <td className="py-3 px-4 whitespace-nowrap">
                            <span
                              className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
                                p.paymentStatus === 'PAID'
                                  ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                                  : 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
                              }`}
                            >
                              {p.paymentStatus}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-right whitespace-nowrap">
                            <div className="flex items-center justify-end gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 px-2 text-[11px]"
                                onClick={() => setViewingPayslip(p)}
                                title="View & Print Payslip"
                              >
                                <Printer className="size-3.5" /> Payslip
                              </Button>
                              {p.paymentStatus !== 'PAID' && canHrManage && (
                                <>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 px-2 text-[11px]"
                                    onClick={() => setAdjustingPayroll(p)}
                                  >
                                    <SlidersHorizontal className="size-3.5" /> Adjust
                                  </Button>
                                  <Button
                                    variant="secondary"
                                    size="sm"
                                    className="h-7 px-2.5 text-[11px]"
                                    onClick={() => setMarkingPaidRecord(p)}
                                  >
                                    Mark Paid
                                  </Button>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ───────────────────────── TAB 5: DEPARTMENT COST & CONTRACTS ───────────────────────── */}
      {activeTab === 'ANALYTICS' && (
        <div className="space-y-6">
          <div className="overflow-hidden rounded-2xl border border-line bg-surface shadow-xs">
            <div className="border-b border-line p-4">
              <h3 className="text-sm font-bold text-fg">Department Headcount & Monthly Salary Allocation</h3>
              <p className="text-xs text-fg-muted">
                Live breakdown of active personnel, department heads, and monthly salary commitments vs department budgets.
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[960px] text-left text-xs">
                <thead className="border-b border-line bg-surface-2/60 text-[11px] font-bold uppercase tracking-wider text-fg-subtle">
                  <tr>
                    <th className="py-3 px-4">Department</th>
                    <th className="py-3 px-4">Head of Department</th>
                    <th className="py-3 px-4 text-center">Active Staff</th>
                    <th className="py-3 px-4">Monthly Salary Commitment</th>
                    <th className="py-3 px-4">Department Budget</th>
                    <th className="py-3 px-4 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {(departments || []).map((dept) => {
                    const deptStaff = (staffList || []).filter(
                      (s) => s.departmentCode === dept.code && s.status !== 'TERMINATED',
                    );
                    const deptSalary = deptStaff.reduce(
                      (acc, s) => acc + BigInt(s.baseSalaryMinor || '0'),
                      0n,
                    );
                    return (
                      <tr key={dept.id} className="hover:bg-surface-2/40">
                        <td className="py-3 px-4 font-bold text-fg">
                          {dept.name}{' '}
                          <span className="font-mono text-[11px] text-fg-subtle font-normal">({dept.code})</span>
                        </td>
                        <td className="py-3 px-4 text-fg-muted">{dept.headName || 'Unassigned'}</td>
                        <td className="py-3 px-4 text-center font-bold">{deptStaff.length} staff</td>
                        <td className="py-3 px-4 font-mono font-bold text-emerald-600">
                          {money(deptSalary.toString(), 'UGX')}
                        </td>
                        <td className="py-3 px-4 font-mono text-fg-muted">
                          {money(dept.monthlyBudgetMinor, dept.currency)}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setDeptFilter(dept.code);
                              setActiveTab('STAFF');
                            }}
                          >
                            Filter Staff →
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="overflow-hidden rounded-2xl border border-line bg-surface shadow-xs">
            <div className="border-b border-line p-4 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-fg">Personnel Contracts & Compliance Documents Registry</h3>
                <p className="text-xs text-fg-muted">
                  Centralized register of signed employment contracts, national IDs, academic certificates, and appraisals. Open any employee’s 360° Dossier to add documents.
                </p>
              </div>
            </div>
            {!allDocuments || allDocuments.length === 0 ? (
              <div className="p-8 text-center text-xs text-fg-muted">
                No compliance documents logged yet. Click <strong>Dossier</strong> on any employee in the directory to attach contracts or IDs.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[900px] text-left text-xs">
                  <thead className="border-b border-line bg-surface-2/60 text-[11px] font-bold uppercase tracking-wider text-fg-subtle">
                    <tr>
                      <th className="py-3 px-4">Employee</th>
                      <th className="py-3 px-4">Document Title</th>
                      <th className="py-3 px-4">Category</th>
                      <th className="py-3 px-4">Expiry Date</th>
                      <th className="py-3 px-4">Notes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {allDocuments.map((doc) => (
                      <tr key={doc.id} className="hover:bg-surface-2/40">
                        <td className="py-3 px-4 font-bold text-fg">
                          {doc.staffName}{' '}
                          <span className="font-mono text-[11px] text-fg-subtle">({doc.employeeNumber})</span>
                        </td>
                        <td className="py-3 px-4 font-semibold text-fg">{doc.title}</td>
                        <td className="py-3 px-4">
                          <span className="rounded bg-surface-2 px-2 py-0.5 font-mono text-[11px]">{doc.kind}</span>
                        </td>
                        <td className="py-3 px-4 font-mono">{doc.expiryDate || 'Permanent'}</td>
                        <td className="py-3 px-4 text-fg-muted">{doc.notes || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modals */}
      <CreateStaffModal
        open={createStaffOpen}
        onClose={() => setCreateStaffOpen(false)}
        departments={departments || []}
        onSubmit={(body) => createStaffMutation.mutate(body)}
        isPending={createStaffMutation.isPending}
      />

      {editingStaff && (
        <EditStaffModal
          staff={editingStaff}
          open={!!editingStaff}
          onClose={() => setEditingStaff(null)}
          departments={departments || []}
          onSubmit={(data) => updateStaffMutation.mutate({ id: editingStaff.id, data })}
          isPending={updateStaffMutation.isPending}
        />
      )}

      {viewingStaff && (
        <StaffDetailModal
          staff={viewingStaff}
          open={!!viewingStaff}
          onClose={() => setViewingStaff(null)}
          onAssignRole={(s) => setAssigningRoleStaff(s)}
          onEdit={(s) => setEditingStaff(s)}
        />
      )}

      {assigningRoleStaff && (
        <AssignSystemRoleModal
          staff={assigningRoleStaff}
          open={!!assigningRoleStaff}
          onClose={() => setAssigningRoleStaff(null)}
        />
      )}

      <CreateShiftModal
        open={createShiftOpen}
        onClose={() => setCreateShiftOpen(false)}
        staffList={staffList || []}
        departments={departments || []}
        onSubmit={(body) => createShiftMutation.mutate(body)}
        isPending={createShiftMutation.isPending}
      />

      <BulkShiftModal
        open={bulkShiftOpen}
        onClose={() => setBulkShiftOpen(false)}
        staffList={staffList || []}
        departments={departments || []}
        onSubmit={(body) => bulkShiftMutation.mutate(body)}
        isPending={bulkShiftMutation.isPending}
      />

      <CreateLeaveModal
        open={createLeaveOpen}
        onClose={() => setCreateLeaveOpen(false)}
        staffList={staffList || []}
        onSubmit={(body) => createLeaveMutation.mutate(body)}
        isPending={createLeaveMutation.isPending}
      />

      {reviewingLeave && (
        <ReviewLeaveModal
          leave={reviewingLeave}
          open={!!reviewingLeave}
          onClose={() => setReviewingLeave(null)}
          onSubmit={(action, notes) =>
            reviewLeaveMutation.mutate({ id: reviewingLeave.id, action, reviewNotes: notes })
          }
          isPending={reviewLeaveMutation.isPending}
        />
      )}

      {adjustingPayroll && (
        <AdjustPayrollModal
          record={adjustingPayroll}
          open={!!adjustingPayroll}
          onClose={() => setAdjustingPayroll(null)}
          onSubmit={(data) => adjustPayrollMutation.mutate({ id: adjustingPayroll.id, data })}
          isPending={adjustPayrollMutation.isPending}
        />
      )}

      {markingPaidRecord && (
        <MarkPaidModal
          record={markingPaidRecord}
          open={!!markingPaidRecord}
          onClose={() => setMarkingPaidRecord(null)}
          onSubmit={(paymentReference) =>
            updatePayrollStatusMutation.mutate({
              id: markingPaidRecord.id,
              paymentStatus: 'PAID',
              paymentReference,
            })
          }
          isPending={updatePayrollStatusMutation.isPending}
        />
      )}

      {viewingPayslip && (
        <PayslipModal
          record={viewingPayslip}
          open={!!viewingPayslip}
          onClose={() => setViewingPayslip(null)}
        />
      )}

      {terminatingStaff && (
        <DeleteConfirmDialog
          open={!!terminatingStaff}
          onClose={() => setTerminatingStaff(null)}
          onConfirm={() => deleteStaffMutation.mutate(terminatingStaff.id)}
          title={`Terminate Staff Profile · ${terminatingStaff.fullName}?`}
          itemName={`${terminatingStaff.fullName} (${terminatingStaff.employeeNumber})`}
          itemType="Staff Member"
          warning={`This will mark ${terminatingStaff.fullName} as TERMINATED, revoke any linked system sign-in accounts immediately, and preserve their shift & payroll records for audit history.`}
          requireMatch="TERMINATE"
          loading={deleteStaffMutation.isPending}
        />
      )}
    </div>
  );
}
