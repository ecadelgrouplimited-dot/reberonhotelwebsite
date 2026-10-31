'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Users,
  UserPlus,
  Search,
  Calendar,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  FileText,
  DollarSign,
  Building2,
  Phone,
  Mail,
  MapPin,
  CreditCard,
  Printer,
  ChevronRight,
  Filter,
  RefreshCw,
  Edit,
  Trash2,
  Eye,
  CalendarDays,
  ShieldCheck,
  Briefcase,
  UserCheck,
  Download,
  AlertTriangle,
} from 'lucide-react';
import Link from 'next/link';
import type {
  HrDashboardDTO,
  HotelDepartmentDTO,
  StaffLeaveRequestDTO,
  StaffPayrollRecordDTO,
  StaffProfileDTO,
  StaffShiftDTO,
} from '@reberon/contracts';
import { ApiError, del, get, patch, post } from '@/lib/api';
import { useCan, useMe } from '@/lib/providers';
import { money } from '@/lib/money';
import { dateTime } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Empty, PageHeader, Pill, Skeleton, Tabs } from '@/components/ui/bits';
import { Dialog } from '@/components/ui/dialog';
import { DeleteConfirmDialog } from '@/components/ui/delete-dialog';
import { SelectInput, TextInput } from '@/components/ui/field';

type HrTab = 'STAFF' | 'ROSTER' | 'LEAVE' | 'PAYROLL';

export default function HrPage() {
  const qc = useQueryClient();
  const can = useCan();
  const me = useMe();
  const isOwner = me.role === 'OWNER';
  const router = useRouter();
  const searchParams = useSearchParams();
  const tabParam = searchParams.get('tab');

  const [activeTab, setActiveTab] = useState<HrTab>(() => {
    if (tabParam === 'ROSTER' || tabParam === 'LEAVE' || tabParam === 'PAYROLL') return tabParam;
    return 'STAFF';
  });

  useEffect(() => {
    if (tabParam === 'ROSTER' || tabParam === 'LEAVE' || tabParam === 'PAYROLL') {
      setActiveTab(tabParam);
    } else if (!tabParam) {
      setActiveTab('STAFF');
    }
  }, [tabParam]);
  const [terminatingStaff, setTerminatingStaff] = useState<StaffProfileDTO | null>(null);

  // Staff filters
  const [search, setSearch] = useState('');
  const [deptFilter, setDeptFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');

  // Modals state
  const [createStaffOpen, setCreateStaffOpen] = useState(false);
  const [editingStaff, setEditingStaff] = useState<StaffProfileDTO | null>(null);
  const [viewingStaff, setViewingStaff] = useState<StaffProfileDTO | null>(null);

  const [createShiftOpen, setCreateShiftOpen] = useState(false);
  const [createLeaveOpen, setCreateLeaveOpen] = useState(false);
  const [reviewingLeave, setReviewingLeave] = useState<StaffLeaveRequestDTO | null>(null);
  const [viewingPayslip, setViewingPayslip] = useState<StaffPayrollRecordDTO | null>(null);

  // Queries
  const { data: overview, isLoading: overviewLoading } = useQuery({
    queryKey: ['hr-overview'],
    queryFn: () => get<HrDashboardDTO>('/hr/overview'),
    refetchInterval: 30_000,
  });

  const { data: departments } = useQuery({
    queryKey: ['departments'],
    queryFn: () => get<HotelDepartmentDTO[]>('/departments'),
  });

  const { data: staffList, isLoading: staffLoading, refetch: refetchStaff } = useQuery({
    queryKey: ['hr-staff', deptFilter, statusFilter],
    queryFn: () =>
      get<StaffProfileDTO[]>(
        `/hr/staff?department=${encodeURIComponent(deptFilter)}&status=${encodeURIComponent(statusFilter)}`,
      ),
  });

  const { data: shifts, isLoading: shiftsLoading, refetch: refetchShifts } = useQuery({
    queryKey: ['hr-shifts', deptFilter],
    queryFn: () => get<StaffShiftDTO[]>(`/hr/shifts?department=${encodeURIComponent(deptFilter)}`),
    enabled: activeTab === 'ROSTER',
  });

  const { data: leaves, isLoading: leavesLoading, refetch: refetchLeaves } = useQuery({
    queryKey: ['hr-leaves'],
    queryFn: () => get<StaffLeaveRequestDTO[]>('/hr/leaves'),
    enabled: activeTab === 'LEAVE',
  });

  const currentMonthStr = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }, []);

  const [payrollMonth, setPayrollMonth] = useState(currentMonthStr);

  const { data: payrollRecords, isLoading: payrollLoading, refetch: refetchPayroll } = useQuery({
    queryKey: ['hr-payroll', payrollMonth],
    queryFn: () => get<StaffPayrollRecordDTO[]>(`/hr/payroll?periodMonth=${encodeURIComponent(payrollMonth)}`),
    enabled: activeTab === 'PAYROLL',
  });

  // Filtered staff
  const filteredStaff = useMemo(() => {
    if (!staffList) return [];
    if (!search.trim()) return staffList;
    const q = search.toLowerCase();
    return staffList.filter(
      (s) =>
        s.fullName.toLowerCase().includes(q) ||
        s.employeeNumber.toLowerCase().includes(q) ||
        s.phone.toLowerCase().includes(q) ||
        s.jobTitle.toLowerCase().includes(q),
    );
  }, [staffList, search]);

  // Mutations
  const createStaffMutation = useMutation({
    mutationFn: (body: any) => post<StaffProfileDTO>('/hr/staff', body),
    onSuccess: () => {
      toast.success('Staff profile created successfully');
      qc.invalidateQueries({ queryKey: ['hr-staff'] });
      qc.invalidateQueries({ queryKey: ['hr-overview'] });
      setCreateStaffOpen(false);
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Failed to create staff'),
  });

  const updateStaffMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => patch<StaffProfileDTO>(`/hr/staff/${id}`, data),
    onSuccess: () => {
      toast.success('Staff profile updated successfully');
      qc.invalidateQueries({ queryKey: ['hr-staff'] });
      qc.invalidateQueries({ queryKey: ['hr-overview'] });
      setEditingStaff(null);
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Failed to update staff'),
  });

  const deleteStaffMutation = useMutation({
    mutationFn: (id: string) => del(`/hr/staff/${id}`),
    onSuccess: () => {
      toast.success('Staff member marked as terminated');
      qc.invalidateQueries({ queryKey: ['hr-staff'] });
      qc.invalidateQueries({ queryKey: ['hr-overview'] });
      setTerminatingStaff(null);
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Failed to terminate staff'),
  });

  const createShiftMutation = useMutation({
    mutationFn: (body: any) => post<StaffShiftDTO>('/hr/shifts', body),
    onSuccess: () => {
      toast.success('Shift assigned successfully');
      qc.invalidateQueries({ queryKey: ['hr-shifts'] });
      qc.invalidateQueries({ queryKey: ['hr-overview'] });
      setCreateShiftOpen(false);
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Failed to create shift'),
  });

  const createLeaveMutation = useMutation({
    mutationFn: (body: any) => post<StaffLeaveRequestDTO>('/hr/leaves', body),
    onSuccess: () => {
      toast.success('Leave request submitted successfully');
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
      toast.success('Leave request updated successfully');
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
      toast.success(`Generated payroll for ${res.count} staff members`);
      qc.invalidateQueries({ queryKey: ['hr-payroll'] });
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Failed to generate payroll'),
  });

  const updatePayrollStatusMutation = useMutation({
    mutationFn: ({ id, paymentStatus, paymentReference }: { id: string; paymentStatus: string; paymentReference?: string }) =>
      patch<StaffPayrollRecordDTO>(`/hr/payroll/${id}/status`, { paymentStatus, paymentReference }),
    onSuccess: () => {
      toast.success('Payroll status updated and synchronized with expenses');
      qc.invalidateQueries({ queryKey: ['hr-payroll'] });
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Failed to update payroll'),
  });

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6 lg:p-8">
      {/* Page Header */}
      <PageHeader
        title="Human Resource Management"
        description="Comprehensive personnel directory, shift rostering, attendance, leave approvals, and statutory Uganda PAYE & NSSF payroll."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/departments"
              className="inline-flex items-center gap-1.5 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-2 text-xs font-semibold text-neutral-800 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition"
            >
              <Building2 className="h-4 w-4 text-sky-600 dark:text-sky-400" />
              Departments
            </Link>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                refetchStaff();
                if (activeTab === 'ROSTER') refetchShifts();
                if (activeTab === 'LEAVE') refetchLeaves();
                if (activeTab === 'PAYROLL') refetchPayroll();
              }}
              title="Refresh"
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
            {activeTab === 'STAFF' && (
              <Button
                variant="primary"
                size="sm"
                onClick={() => setCreateStaffOpen(true)}
                className="gap-2"
              >
                <UserPlus className="h-4 w-4" /> Add Employee
              </Button>
            )}
            {activeTab === 'ROSTER' && (
              <Button
                variant="primary"
                size="sm"
                onClick={() => setCreateShiftOpen(true)}
                className="gap-2"
              >
                <Clock className="h-4 w-4" /> Assign Shift
              </Button>
            )}
            {activeTab === 'LEAVE' && (
              <Button
                variant="primary"
                size="sm"
                onClick={() => setCreateLeaveOpen(true)}
                className="gap-2"
              >
                <CalendarDays className="h-4 w-4" /> New Leave Request
              </Button>
            )}
            {activeTab === 'PAYROLL' && (
              <Button
                variant="primary"
                size="sm"
                onClick={() => generatePayrollMutation.mutate()}
                disabled={generatePayrollMutation.isPending}
                className="gap-2"
              >
                <DollarSign className="h-4 w-4" /> Generate {payrollMonth} Payroll
              </Button>
            )}
          </div>
        }
      />

      {/* KPI Overview Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-5 shadow-xs">
          <div className="flex items-center justify-between text-neutral-500 dark:text-neutral-400">
            <span className="text-xs font-semibold uppercase tracking-wider">Total Headcount</span>
            <Users className="h-5 w-5 text-neutral-400" />
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-bold tracking-tight text-neutral-900 dark:text-neutral-100">
              {overview?.activeStaff ?? 0}
            </span>
            <span className="text-xs text-neutral-500">active ({overview?.totalStaff ?? 0} total)</span>
          </div>
        </div>

        <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-5 shadow-xs">
          <div className="flex items-center justify-between text-neutral-500 dark:text-neutral-400">
            <span className="text-xs font-semibold uppercase tracking-wider">On Leave Today</span>
            <CalendarDays className="h-5 w-5 text-amber-600 dark:text-amber-400" />
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-bold tracking-tight text-neutral-900 dark:text-neutral-100">
              {overview?.onLeaveToday ?? 0}
            </span>
            <span className="text-xs text-amber-600 font-medium">staff away</span>
          </div>
        </div>

        <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-5 shadow-xs">
          <div className="flex items-center justify-between text-neutral-500 dark:text-neutral-400">
            <span className="text-xs font-semibold uppercase tracking-wider">Shifts Scheduled</span>
            <Clock className="h-5 w-5 text-sky-600 dark:text-sky-400" />
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-bold tracking-tight text-neutral-900 dark:text-neutral-100">
              {overview?.scheduledShiftsToday ?? 0}
            </span>
            <span className="text-xs text-neutral-500">coverage today</span>
          </div>
        </div>

        <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-5 shadow-xs">
          <div className="flex items-center justify-between text-neutral-500 dark:text-neutral-400">
            <span className="text-xs font-semibold uppercase tracking-wider">Monthly Base Payroll</span>
            <DollarSign className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div className="mt-3">
            <span className="text-2xl font-bold tracking-tight text-neutral-900 dark:text-neutral-100">
              {money(overview?.totalMonthlyPayrollMinor || '0', 'UGX')}
            </span>
            <p className="mt-0.5 text-xs text-neutral-500">UGX active commitments</p>
          </div>
        </div>
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
          { value: 'STAFF', label: 'Employee Directory', count: staffList?.length },
          { value: 'ROSTER', label: 'Shifts & Attendance', count: shifts?.length },
          { value: 'LEAVE', label: 'Leave Requests', count: overview?.pendingLeaveRequests },
          { value: 'PAYROLL', label: 'Monthly Payroll & Taxes', count: payrollRecords?.length },
        ]}
      />

      {/* TAB 1: STAFF DIRECTORY */}
      {activeTab === 'STAFF' && (
        <div className="space-y-4">
          {/* Search & Filter Bar */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-3 shadow-xs">
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search staff by name, employee number, phone, job title..."
                className="w-full rounded-xl border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 pl-10 pr-4 py-2 text-sm text-neutral-900 dark:text-neutral-100 placeholder:text-neutral-400 focus:border-neutral-400 focus:outline-none"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {departments && departments.length > 0 && (
                <select
                  value={deptFilter}
                  onChange={(e) => setDeptFilter(e.target.value)}
                  className="rounded-xl border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 px-3 py-2 text-xs font-semibold text-neutral-800 dark:text-neutral-200 focus:outline-none"
                >
                  <option value="ALL">All Departments</option>
                  {departments.map((d) => (
                    <option key={d.code} value={d.code}>
                      {d.name}
                    </option>
                  ))}
                </select>
              )}

              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="rounded-xl border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 px-3 py-2 text-xs font-semibold text-neutral-800 dark:text-neutral-200 focus:outline-none"
              >
                <option value="ALL">All Statuses</option>
                <option value="ACTIVE">Active</option>
                <option value="ON_LEAVE">On Leave</option>
                <option value="SUSPENDED">Suspended</option>
                <option value="TERMINATED">Terminated</option>
              </select>
            </div>
          </div>

          {/* Staff Table */}
          <div className="overflow-hidden rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 shadow-xs">
            {staffLoading ? (
              <div className="p-8 space-y-4">
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-full" />
              </div>
            ) : filteredStaff.length === 0 ? (
              <div className="p-12 text-center">
                <Empty
                  title="No staff records found"
                  body="No employees match your search or filter criteria. Click 'Add Employee' to register staff."
                />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm text-neutral-700 dark:text-neutral-300">
                  <thead className="border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50/75 dark:bg-neutral-800/50 text-xs font-semibold text-neutral-500 uppercase tracking-wider">
                    <tr>
                      <th className="px-6 py-3.5">Employee</th>
                      <th className="px-6 py-3.5">Department & Role</th>
                      <th className="px-6 py-3.5">Contact</th>
                      <th className="px-6 py-3.5">Type & Joined</th>
                      <th className="px-6 py-3.5">Base Salary</th>
                      <th className="px-6 py-3.5">Status</th>
                      <th className="px-6 py-3.5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
                    {filteredStaff.map((staff) => (
                      <tr
                        key={staff.id}
                        className="group hover:bg-neutral-50/80 dark:hover:bg-neutral-800/40 transition-colors"
                      >
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-neutral-100 dark:bg-neutral-800 text-xs font-bold text-neutral-700 dark:text-neutral-300">
                              {staff.firstName[0]}
                              {staff.lastName[0]}
                            </div>
                            <div>
                              <span className="font-semibold text-neutral-900 dark:text-neutral-100 block">
                                {staff.fullName}
                              </span>
                              <span className="font-mono text-xs text-neutral-400">
                                {staff.employeeNumber}
                              </span>
                            </div>
                          </div>
                        </td>

                        <td className="px-6 py-4">
                          <div className="flex flex-col">
                            <span className="font-medium text-neutral-800 dark:text-neutral-200">
                              {staff.jobTitle}
                            </span>
                            <span className="text-xs text-neutral-500">
                              {staff.departmentName || staff.departmentCode}
                            </span>
                          </div>
                        </td>

                        <td className="px-6 py-4">
                          <div className="flex flex-col text-xs text-neutral-600 dark:text-neutral-400 gap-0.5">
                            <span className="flex items-center gap-1">
                              <Phone className="h-3 w-3 text-neutral-400" />
                              {staff.phone}
                            </span>
                            {staff.email && (
                              <span className="flex items-center gap-1 text-neutral-400">
                                <Mail className="h-3 w-3" />
                                {staff.email}
                              </span>
                            )}
                          </div>
                        </td>

                        <td className="px-6 py-4">
                          <div className="flex flex-col text-xs">
                            <span className="font-medium text-neutral-800 dark:text-neutral-200">
                              {staff.employmentType.replace('_', ' ')}
                            </span>
                            <span className="text-neutral-400">Since {staff.dateJoined}</span>
                          </div>
                        </td>

                        <td className="px-6 py-4 font-mono font-medium text-neutral-900 dark:text-neutral-100">
                          {money(staff.baseSalaryMinor, staff.currency)}
                        </td>

                        <td className="px-6 py-4">
                          <span
                            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${
                              staff.status === 'ACTIVE'
                                ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300'
                                : staff.status === 'ON_LEAVE'
                                ? 'bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300'
                                : 'bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400'
                            }`}
                          >
                            {staff.status}
                          </span>
                        </td>

                        <td className="px-6 py-4 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setViewingStaff(staff)}
                              className="h-8 w-8 p-0 text-neutral-600 hover:text-neutral-900"
                              title="View dossier"
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setEditingStaff(staff)}
                              className="h-8 w-8 p-0 text-neutral-600 hover:text-neutral-900"
                              title="Edit profile"
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            {isOwner && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setTerminatingStaff(staff)}
                                className="h-8 w-8 p-0 text-rose-600 hover:bg-rose-50"
                                title="Terminate (Owner only)"
                              >
                                <Trash2 className="h-4 w-4" />
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

      {/* TAB 2: SHIFTS & ATTENDANCE */}
      {activeTab === 'ROSTER' && (
        <div className="space-y-4">
          <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-4 shadow-xs">
            <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100 mb-2">
              Scheduled Shift Coverage & Duty Rosters
            </h3>
            <p className="text-xs text-neutral-500 mb-4">
              Track morning, evening, night, and off duty schedules by hotel department and log daily arrival/departure attendance.
            </p>

            {shiftsLoading ? (
              <div className="space-y-3">
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-full" />
              </div>
            ) : !shifts || shifts.length === 0 ? (
              <Empty
                title="No shifts scheduled"
                body="No shifts have been scheduled for this period. Click 'Assign Shift' to build the duty roster."
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-neutral-200 dark:border-neutral-800 text-xs font-semibold text-neutral-500 uppercase">
                    <tr>
                      <th className="py-2.5 px-4">Staff Member</th>
                      <th className="py-2.5 px-4">Department</th>
                      <th className="py-2.5 px-4">Date</th>
                      <th className="py-2.5 px-4">Shift Type</th>
                      <th className="py-2.5 px-4">Hours</th>
                      <th className="py-2.5 px-4">Attendance</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
                    {shifts.map((sh) => (
                      <tr key={sh.id}>
                        <td className="py-3 px-4 font-medium text-neutral-900 dark:text-neutral-100">
                          {sh.staffName}
                          <span className="block text-xs text-neutral-400 font-normal">
                            {sh.staffJobTitle}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-xs font-medium text-neutral-600 dark:text-neutral-400">
                          {sh.departmentCode}
                        </td>
                        <td className="py-3 px-4 font-mono text-xs">{sh.date}</td>
                        <td className="py-3 px-4">
                          <span className="rounded-md border px-2 py-0.5 text-xs font-semibold bg-neutral-50 dark:bg-neutral-800">
                            {sh.shiftType}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-xs font-mono text-neutral-500">
                          {sh.scheduledStartTime || '08:00'} - {sh.scheduledEndTime || '17:00'}
                        </td>
                        <td className="py-3 px-4">
                          <span
                            className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                              sh.attendanceStatus === 'PRESENT'
                                ? 'bg-emerald-100 text-emerald-800'
                                : sh.attendanceStatus === 'LATE'
                                ? 'bg-amber-100 text-amber-800'
                                : sh.attendanceStatus === 'ABSENT'
                                ? 'bg-rose-100 text-rose-800'
                                : 'bg-neutral-100 text-neutral-700'
                            }`}
                          >
                            {sh.attendanceStatus}
                          </span>
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

      {/* TAB 3: LEAVE MANAGEMENT */}
      {activeTab === 'LEAVE' && (
        <div className="space-y-4">
          <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-4 shadow-xs">
            <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100 mb-2">
              Absence & Leave Approval Queue
            </h3>
            <p className="text-xs text-neutral-500 mb-4">
              Review and approve annual, sick, compassionate, and maternity leaves submitted by hotel personnel.
            </p>

            {leavesLoading ? (
              <div className="space-y-3">
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-full" />
              </div>
            ) : !leaves || leaves.length === 0 ? (
              <Empty
                title="No leave requests"
                body="There are no active or pending leave requests from hotel personnel."
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-neutral-200 dark:border-neutral-800 text-xs font-semibold text-neutral-500 uppercase">
                    <tr>
                      <th className="py-2.5 px-4">Employee</th>
                      <th className="py-2.5 px-4">Leave Type</th>
                      <th className="py-2.5 px-4">Duration</th>
                      <th className="py-2.5 px-4">Reason</th>
                      <th className="py-2.5 px-4">Status</th>
                      <th className="py-2.5 px-4 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
                    {leaves.map((l) => (
                      <tr key={l.id}>
                        <td className="py-3 px-4 font-semibold text-neutral-900 dark:text-neutral-100">
                          {l.staffName}
                          <span className="block text-xs text-neutral-400 font-normal">
                            {l.departmentCode}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <span className="rounded-md border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 px-2 py-0.5 text-xs font-medium">
                            {l.leaveType}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-xs font-mono">
                          {l.startDate} to {l.endDate} ({l.daysCount} days)
                        </td>
                        <td className="py-3 px-4 text-xs text-neutral-600 dark:text-neutral-300 max-w-xs truncate">
                          {l.reason}
                        </td>
                        <td className="py-3 px-4">
                          <span
                            className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                              l.status === 'APPROVED'
                                ? 'bg-emerald-100 text-emerald-800'
                                : l.status === 'REJECTED'
                                ? 'bg-rose-100 text-rose-800'
                                : 'bg-amber-100 text-amber-800'
                            }`}
                          >
                            {l.status}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right">
                          {l.status === 'PENDING' ? (
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => setReviewingLeave(l)}
                            >
                              Review
                            </Button>
                          ) : (
                            <span className="text-xs text-neutral-400 italic">
                              Reviewed by {l.reviewedByName || 'Manager'}
                            </span>
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

      {/* TAB 4: PAYROLL & STATUTORY DEDUCTIONS */}
      {activeTab === 'PAYROLL' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-4 shadow-xs">
            <div>
              <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                Monthly Payroll & Uganda Tax / NSSF Deductions
              </h3>
              <p className="text-xs text-neutral-500">
                Automatic calculation of PAYE and NSSF (5% Employee / 10% Employer) under Uganda Revenue Authority guidelines.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <label className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                Period:
              </label>
              <input
                type="month"
                value={payrollMonth}
                onChange={(e) => setPayrollMonth(e.target.value)}
                className="rounded-xl border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 px-3 py-1.5 text-xs font-semibold text-neutral-800 dark:text-neutral-200 focus:outline-none"
              />
            </div>
          </div>

          <div className="overflow-hidden rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 shadow-xs">
            {payrollLoading ? (
              <div className="p-8 space-y-4">
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-full" />
              </div>
            ) : !payrollRecords || payrollRecords.length === 0 ? (
              <div className="p-12 text-center">
                <Empty
                  title={`No payroll records generated for ${payrollMonth}`}
                  body="Click 'Generate Payroll' in the top right to calculate monthly wages, PAYE taxes, and NSSF."
                />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50/75 dark:bg-neutral-800/50 text-xs font-semibold text-neutral-500 uppercase">
                    <tr>
                      <th className="py-3 px-4">Employee</th>
                      <th className="py-3 px-4">Base / Gross</th>
                      <th className="py-3 px-4">NSSF (5% Emp)</th>
                      <th className="py-3 px-4">NSSF (10% Empr)</th>
                      <th className="py-3 px-4">PAYE Tax</th>
                      <th className="py-3 px-4">Net Salary</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
                    {payrollRecords.map((p) => (
                      <tr key={p.id}>
                        <td className="py-3 px-4 font-semibold text-neutral-900 dark:text-neutral-100">
                          {p.staffName}
                          <span className="block text-xs font-mono text-neutral-400">
                            {p.employeeNumber} · {p.jobTitle}
                          </span>
                        </td>
                        <td className="py-3 px-4 font-mono font-medium text-neutral-800 dark:text-neutral-200">
                          {money(p.grossSalaryMinor, p.currency)}
                        </td>
                        <td className="py-3 px-4 font-mono text-neutral-600 dark:text-neutral-400 text-xs">
                          {money(p.nssfEmployeeMinor, p.currency)}
                        </td>
                        <td className="py-3 px-4 font-mono text-neutral-600 dark:text-neutral-400 text-xs">
                          {money(p.nssfEmployerMinor, p.currency)}
                        </td>
                        <td className="py-3 px-4 font-mono text-neutral-600 dark:text-neutral-400 text-xs">
                          {money(p.payeTaxMinor, p.currency)}
                        </td>
                        <td className="py-3 px-4 font-mono font-bold text-emerald-600 dark:text-emerald-400">
                          {money(p.netSalaryMinor, p.currency)}
                        </td>
                        <td className="py-3 px-4">
                          <span
                            className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                              p.paymentStatus === 'PAID'
                                ? 'bg-emerald-100 text-emerald-800'
                                : 'bg-neutral-100 text-neutral-700'
                            }`}
                          >
                            {p.paymentStatus}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setViewingPayslip(p)}
                              title="Print Payslip"
                            >
                              <Printer className="h-4 w-4" />
                            </Button>
                            {p.paymentStatus !== 'PAID' && (
                              <Button
                                variant="secondary"
                                size="sm"
                                onClick={() => {
                                  const ref = prompt('Enter payment bank / MoMo reference:');
                                  if (ref !== null) {
                                    updatePayrollStatusMutation.mutate({
                                      id: p.id,
                                      paymentStatus: 'PAID',
                                      paymentReference: ref || undefined,
                                    });
                                  }
                                }}
                              >
                                Mark Paid
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

      {viewingPayslip && (
        <PayslipModal
          record={viewingPayslip}
          open={!!viewingPayslip}
          onClose={() => setViewingPayslip(null)}
        />
      )}

      {/* Terminate Staff Confirmation Prompt */}
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

// ───────────────────────── Modal Components ─────────────────────────

function CreateStaffModal({
  open,
  onClose,
  departments,
  onSubmit,
  isPending,
}: {
  open: boolean;
  onClose: () => void;
  departments: HotelDepartmentDTO[];
  onSubmit: (body: any) => void;
  isPending: boolean;
}) {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [otherNames, setOtherNames] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [nationalId, setNationalId] = useState('');
  const [departmentCode, setDepartmentCode] = useState(departments[0]?.code || 'FRONT_DESK');
  const [jobTitle, setJobTitle] = useState('');
  const [employmentType, setEmploymentType] = useState('FULL_TIME');
  const [salaryStr, setSalaryStr] = useState('1200000');
  const [paymentMethod, setPaymentMethod] = useState('BANK_TRANSFER');
  const [bankName, setBankName] = useState('Stanbic Bank Uganda');
  const [bankAccountNumber, setBankAccountNumber] = useState('');
  const [mobileMoneyNumber, setMobileMoneyNumber] = useState('');
  const [emergencyName, setEmergencyName] = useState('');
  const [emergencyPhone, setEmergencyPhone] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!firstName.trim() || !lastName.trim() || !phone.trim() || !jobTitle.trim() || !emergencyName.trim()) {
      toast.error('Please fill in all required fields');
      return;
    }
    onSubmit({
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      otherNames: otherNames.trim() || undefined,
      phone: phone.trim(),
      email: email.trim() || undefined,
      nationalIdNumber: nationalId.trim() || undefined,
      departmentCode,
      jobTitle: jobTitle.trim(),
      employmentType,
      baseSalaryMinor: salaryStr.replace(/[^0-9]/g, '') || '0',
      currency: 'UGX',
      paymentMethod,
      bankName: bankName.trim() || undefined,
      bankAccountNumber: bankAccountNumber.trim() || undefined,
      mobileMoneyNumber: mobileMoneyNumber.trim() || undefined,
      emergencyContactName: emergencyName.trim(),
      emergencyContactPhone: emergencyPhone.trim() || phone.trim(),
      status: 'ACTIVE',
    });
  };

  return (
    <Dialog open={open} onClose={onClose} title="Add New Hotel Employee">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
              First Name *
            </label>
            <TextInput value={firstName} onChange={(e) => setFirstName(e.target.value)} required />
          </div>
          <div>
            <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
              Last Name *
            </label>
            <TextInput value={lastName} onChange={(e) => setLastName(e.target.value)} required />
          </div>
          <div>
            <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
              Other Names
            </label>
            <TextInput value={otherNames} onChange={(e) => setOtherNames(e.target.value)} />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
              Phone Number *
            </label>
            <TextInput value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+256..." required />
          </div>
          <div>
            <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
              Email Address
            </label>
            <TextInput type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
              NIN / Passport
            </label>
            <TextInput value={nationalId} onChange={(e) => setNationalId(e.target.value)} placeholder="CF..." />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
              Department *
            </label>
            <SelectInput value={departmentCode} onChange={(e) => setDepartmentCode(e.target.value)}>
              {departments.map((d) => (
                <option key={d.code} value={d.code}>
                  {d.name}
                </option>
              ))}
            </SelectInput>
          </div>
          <div>
            <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
              Job Title *
            </label>
            <TextInput value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} placeholder="e.g. Front Desk Lead" required />
          </div>
          <div>
            <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
              Employment Type
            </label>
            <SelectInput value={employmentType} onChange={(e) => setEmploymentType(e.target.value)}>
              <option value="FULL_TIME">Full Time</option>
              <option value="PART_TIME">Part Time</option>
              <option value="CONTRACT">Contract</option>
              <option value="PROBATION">Probation</option>
              <option value="CASUAL">Casual</option>
            </SelectInput>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
              Monthly Base Salary (UGX) *
            </label>
            <TextInput value={salaryStr} onChange={(e) => setSalaryStr(e.target.value)} required />
          </div>
          <div>
            <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
              Payment Method
            </label>
            <SelectInput value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
              <option value="BANK_TRANSFER">Bank Transfer</option>
              <option value="MOBILE_MONEY">Mobile Money</option>
              <option value="CASH">Cash</option>
            </SelectInput>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
              Bank / Provider Name
            </label>
            <TextInput value={bankName} onChange={(e) => setBankName(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
              Account / MoMo Number
            </label>
            <TextInput
              value={paymentMethod === 'MOBILE_MONEY' ? mobileMoneyNumber : bankAccountNumber}
              onChange={(e) =>
                paymentMethod === 'MOBILE_MONEY'
                  ? setMobileMoneyNumber(e.target.value)
                  : setBankAccountNumber(e.target.value)
              }
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-neutral-100 dark:border-neutral-800">
          <div>
            <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
              Emergency Contact Name *
            </label>
            <TextInput value={emergencyName} onChange={(e) => setEmergencyName(e.target.value)} required />
          </div>
          <div>
            <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
              Emergency Contact Phone
            </label>
            <TextInput value={emergencyPhone} onChange={(e) => setEmergencyPhone(e.target.value)} />
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <Button variant="ghost" type="button" onClick={onClose} disabled={isPending}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" disabled={isPending}>
            {isPending ? 'Saving...' : 'Register Employee'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function EditStaffModal({
  staff,
  open,
  onClose,
  departments,
  onSubmit,
  isPending,
}: {
  staff: StaffProfileDTO;
  open: boolean;
  onClose: () => void;
  departments: HotelDepartmentDTO[];
  onSubmit: (data: any) => void;
  isPending: boolean;
}) {
  const [firstName, setFirstName] = useState(staff.firstName);
  const [lastName, setLastName] = useState(staff.lastName);
  const [phone, setPhone] = useState(staff.phone);
  const [email, setEmail] = useState(staff.email || '');
  const [jobTitle, setJobTitle] = useState(staff.jobTitle);
  const [departmentCode, setDepartmentCode] = useState(staff.departmentCode);
  const [salaryStr, setSalaryStr] = useState(staff.baseSalaryMinor);
  const [status, setStatus] = useState(staff.status);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      phone: phone.trim(),
      email: email.trim() || null,
      jobTitle: jobTitle.trim(),
      departmentCode,
      baseSalaryMinor: salaryStr.replace(/[^0-9]/g, '') || '0',
      status,
    });
  };

  return (
    <Dialog open={open} onClose={onClose} title={`Edit Profile · ${staff.employeeNumber}`}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
              First Name
            </label>
            <TextInput value={firstName} onChange={(e) => setFirstName(e.target.value)} required />
          </div>
          <div>
            <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
              Last Name
            </label>
            <TextInput value={lastName} onChange={(e) => setLastName(e.target.value)} required />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
              Phone
            </label>
            <TextInput value={phone} onChange={(e) => setPhone(e.target.value)} required />
          </div>
          <div>
            <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
              Email
            </label>
            <TextInput value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
              Department
            </label>
            <SelectInput value={departmentCode} onChange={(e) => setDepartmentCode(e.target.value)}>
              {departments.map((d) => (
                <option key={d.code} value={d.code}>
                  {d.name}
                </option>
              ))}
            </SelectInput>
          </div>
          <div>
            <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
              Job Title
            </label>
            <TextInput value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} required />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
              Base Salary (UGX)
            </label>
            <TextInput value={salaryStr} onChange={(e) => setSalaryStr(e.target.value)} required />
          </div>
          <div>
            <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
              Status
            </label>
            <SelectInput value={status} onChange={(e) => setStatus(e.target.value as any)}>
              <option value="ACTIVE">Active</option>
              <option value="ON_LEAVE">On Leave</option>
              <option value="SUSPENDED">Suspended</option>
              <option value="TERMINATED">Terminated</option>
            </SelectInput>
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <Button variant="ghost" type="button" onClick={onClose} disabled={isPending}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" disabled={isPending}>
            {isPending ? 'Saving...' : 'Save Changes'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function StaffDetailModal({
  staff,
  open,
  onClose,
}: {
  staff: StaffProfileDTO;
  open: boolean;
  onClose: () => void;
}) {
  return (
    <Dialog open={open} onClose={onClose} title={`Staff Dossier · ${staff.fullName}`}>
      <div className="space-y-4 text-sm text-neutral-800 dark:text-neutral-200">
        <div className="flex items-center gap-4 rounded-xl border border-neutral-200 dark:border-neutral-800 p-4 bg-neutral-50 dark:bg-neutral-800/50">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-neutral-200 dark:bg-neutral-700 text-lg font-bold">
            {staff.firstName[0]}
            {staff.lastName[0]}
          </div>
          <div>
            <h3 className="text-base font-bold text-neutral-900 dark:text-neutral-100">
              {staff.fullName}
            </h3>
            <p className="text-xs text-neutral-500 font-mono">
              {staff.employeeNumber} · {staff.jobTitle} ({staff.departmentName || staff.departmentCode})
            </p>
            <span className="inline-block mt-1 text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-medium">
              {staff.status} · {staff.employmentType}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 text-xs">
          <div>
            <span className="text-neutral-400 block">Phone</span>
            <span className="font-semibold">{staff.phone}</span>
          </div>
          <div>
            <span className="text-neutral-400 block">Email</span>
            <span className="font-semibold">{staff.email || 'None'}</span>
          </div>
          <div>
            <span className="text-neutral-400 block">NIN / National ID</span>
            <span className="font-semibold">{staff.nationalIdNumber || 'Not provided'}</span>
          </div>
          <div>
            <span className="text-neutral-400 block">Date Joined</span>
            <span className="font-semibold">{staff.dateJoined}</span>
          </div>
          <div>
            <span className="text-neutral-400 block">Base Monthly Salary</span>
            <span className="font-semibold text-emerald-600 dark:text-emerald-400 font-mono">
              {money(staff.baseSalaryMinor, staff.currency)}
            </span>
          </div>
          <div>
            <span className="text-neutral-400 block">Payment Method</span>
            <span className="font-semibold">{staff.paymentMethod}</span>
          </div>
          <div>
            <span className="text-neutral-400 block">Bank / MoMo Provider</span>
            <span className="font-semibold">{staff.bankName || 'Standard'}</span>
          </div>
          <div>
            <span className="text-neutral-400 block">Account Number</span>
            <span className="font-semibold font-mono">{staff.bankAccountNumber || staff.mobileMoneyNumber || 'None'}</span>
          </div>
        </div>

        <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 p-3 bg-neutral-50 dark:bg-neutral-800/40 text-xs">
          <span className="font-semibold block mb-1 text-neutral-900 dark:text-neutral-100">
            Emergency Contact
          </span>
          <p className="text-neutral-600 dark:text-neutral-400">
            {staff.emergencyContactName} ({staff.emergencyContactRelation}) · {staff.emergencyContactPhone}
          </p>
        </div>

        <div className="mt-4 flex justify-end">
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

function CreateShiftModal({
  open,
  onClose,
  staffList,
  departments,
  onSubmit,
  isPending,
}: {
  open: boolean;
  onClose: () => void;
  staffList: StaffProfileDTO[];
  departments: HotelDepartmentDTO[];
  onSubmit: (body: any) => void;
  isPending: boolean;
}) {
  const [staffId, setStaffId] = useState(staffList[0]?.id || '');
  const [departmentCode, setDepartmentCode] = useState(departments[0]?.code || 'FRONT_DESK');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [shiftType, setShiftType] = useState('MORNING');
  const [startTime, setStartTime] = useState('06:00');
  const [endTime, setEndTime] = useState('14:00');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      staffId,
      departmentCode,
      date,
      shiftType,
      scheduledStartTime: startTime,
      scheduledEndTime: endTime,
      attendanceStatus: 'SCHEDULED',
    });
  };

  return (
    <Dialog open={open} onClose={onClose} title="Assign Department Shift">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
            Staff Member *
          </label>
          <SelectInput value={staffId} onChange={(e) => setStaffId(e.target.value)}>
            {staffList.map((s) => (
              <option key={s.id} value={s.id}>
                {s.fullName} ({s.jobTitle})
              </option>
            ))}
          </SelectInput>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
              Department *
            </label>
            <SelectInput value={departmentCode} onChange={(e) => setDepartmentCode(e.target.value)}>
              {departments.map((d) => (
                <option key={d.code} value={d.code}>
                  {d.name}
                </option>
              ))}
            </SelectInput>
          </div>

          <div>
            <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
              Date *
            </label>
            <TextInput type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
              Shift Type
            </label>
            <SelectInput value={shiftType} onChange={(e) => setShiftType(e.target.value)}>
              <option value="MORNING">Morning</option>
              <option value="EVENING">Evening</option>
              <option value="NIGHT">Night</option>
              <option value="FULL_DAY">Full Day</option>
              <option value="OFF">Off Duty</option>
            </SelectInput>
          </div>
          <div>
            <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
              Start Time
            </label>
            <TextInput value={startTime} onChange={(e) => setStartTime(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
              End Time
            </label>
            <TextInput value={endTime} onChange={(e) => setEndTime(e.target.value)} />
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <Button variant="ghost" type="button" onClick={onClose} disabled={isPending}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" disabled={isPending}>
            {isPending ? 'Assigning...' : 'Assign Shift'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function CreateLeaveModal({
  open,
  onClose,
  staffList,
  onSubmit,
  isPending,
}: {
  open: boolean;
  onClose: () => void;
  staffList: StaffProfileDTO[];
  onSubmit: (body: any) => void;
  isPending: boolean;
}) {
  const [staffId, setStaffId] = useState(staffList[0]?.id || '');
  const [leaveType, setLeaveType] = useState('ANNUAL');
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState(new Date().toISOString().slice(0, 10));
  const [daysCount, setDaysCount] = useState(1);
  const [reason, setReason] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason.trim()) {
      toast.error('Please enter leave reason');
      return;
    }
    onSubmit({
      staffId,
      leaveType,
      startDate,
      endDate,
      daysCount: Number(daysCount) || 1,
      reason: reason.trim(),
    });
  };

  return (
    <Dialog open={open} onClose={onClose} title="Submit Leave Request">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
            Staff Member *
          </label>
          <SelectInput value={staffId} onChange={(e) => setStaffId(e.target.value)}>
            {staffList.map((s) => (
              <option key={s.id} value={s.id}>
                {s.fullName} ({s.departmentName || s.departmentCode})
              </option>
            ))}
          </SelectInput>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
              Leave Type
            </label>
            <SelectInput value={leaveType} onChange={(e) => setLeaveType(e.target.value)}>
              <option value="ANNUAL">Annual Leave</option>
              <option value="SICK">Sick Leave</option>
              <option value="COMPASSIONATE">Compassionate Leave</option>
              <option value="MATERNITY">Maternity Leave</option>
              <option value="PATERNITY">Paternity Leave</option>
              <option value="UNPAID">Unpaid Leave</option>
            </SelectInput>
          </div>
          <div>
            <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
              Days Count
            </label>
            <TextInput
              type="number"
              min={1}
              value={daysCount}
              onChange={(e) => setDaysCount(parseInt(e.target.value) || 1)}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
              Start Date
            </label>
            <TextInput type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} required />
          </div>
          <div>
            <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
              End Date
            </label>
            <TextInput type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} required />
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
            Reason *
          </label>
          <textarea
            rows={2}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="w-full rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 p-2.5 text-sm text-neutral-900 dark:text-neutral-100 placeholder:text-neutral-400 focus:outline-none"
            placeholder="Reason for absence..."
            required
          />
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <Button variant="ghost" type="button" onClick={onClose} disabled={isPending}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" disabled={isPending}>
            {isPending ? 'Submitting...' : 'Submit Request'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function ReviewLeaveModal({
  leave,
  open,
  onClose,
  onSubmit,
  isPending,
}: {
  leave: StaffLeaveRequestDTO;
  open: boolean;
  onClose: () => void;
  onSubmit: (action: string, notes?: string) => void;
  isPending: boolean;
}) {
  const [notes, setNotes] = useState('');

  return (
    <Dialog open={open} onClose={onClose} title="Review Leave Request">
      <div className="space-y-4 text-sm text-neutral-800 dark:text-neutral-200">
        <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 p-3 bg-neutral-50 dark:bg-neutral-800/40 text-xs space-y-1">
          <p>
            <span className="font-semibold text-neutral-900 dark:text-neutral-100">Employee:</span> {leave.staffName}
          </p>
          <p>
            <span className="font-semibold text-neutral-900 dark:text-neutral-100">Leave Type:</span> {leave.leaveType}
          </p>
          <p>
            <span className="font-semibold text-neutral-900 dark:text-neutral-100">Duration:</span> {leave.startDate} to {leave.endDate} ({leave.daysCount} days)
          </p>
          <p>
            <span className="font-semibold text-neutral-900 dark:text-neutral-100">Reason:</span> {leave.reason}
          </p>
        </div>

        <div>
          <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
            Reviewer Remarks / Notes
          </label>
          <textarea
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="w-full rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 p-2.5 text-sm text-neutral-900 dark:text-neutral-100 placeholder:text-neutral-400 focus:outline-none"
            placeholder="Approval conditions, relief coverage..."
          />
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={isPending}>
            Cancel
          </Button>
          <Button
            variant="ghost"
            onClick={() => onSubmit('REJECT', notes)}
            disabled={isPending}
            className="text-rose-600 hover:bg-rose-50"
          >
            Reject
          </Button>
          <Button
            variant="primary"
            onClick={() => onSubmit('APPROVE', notes)}
            disabled={isPending}
          >
            Approve Leave
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

function PayslipModal({
  record,
  open,
  onClose,
}: {
  record: StaffPayrollRecordDTO;
  open: boolean;
  onClose: () => void;
}) {
  return (
    <Dialog open={open} onClose={onClose} title={`Pay Voucher · ${record.periodMonth}`}>
      <div className="space-y-4 text-sm text-neutral-800 dark:text-neutral-200">
        <div className="border-b border-neutral-200 dark:border-neutral-800 pb-3">
          <h2 className="text-base font-bold text-neutral-900 dark:text-neutral-100">
            Reberon Hotel Ltd
          </h2>
          <p className="text-xs text-neutral-500">
            Staff Compensation & Statutory Payslip · {record.periodMonth}
          </p>
          <p className="text-xs font-mono text-neutral-500 mt-1">
            Employee: {record.staffName} ({record.employeeNumber}) · {record.jobTitle}
          </p>
        </div>

        <div className="space-y-2 text-xs">
          <div className="flex justify-between py-1 border-b border-neutral-100 dark:border-neutral-800">
            <span className="text-neutral-500">Basic Salary</span>
            <span className="font-mono font-semibold">{money(record.baseSalaryMinor, record.currency)}</span>
          </div>
          <div className="flex justify-between py-1 border-b border-neutral-100 dark:border-neutral-800">
            <span className="text-neutral-500">Gross Salary</span>
            <span className="font-mono font-semibold">{money(record.grossSalaryMinor, record.currency)}</span>
          </div>
          <div className="flex justify-between py-1 border-b border-neutral-100 dark:border-neutral-800 text-rose-600 dark:text-rose-400">
            <span>Less: NSSF Employee (5%)</span>
            <span className="font-mono">- {money(record.nssfEmployeeMinor, record.currency)}</span>
          </div>
          <div className="flex justify-between py-1 border-b border-neutral-100 dark:border-neutral-800 text-rose-600 dark:text-rose-400">
            <span>Less: PAYE Income Tax (URA)</span>
            <span className="font-mono">- {money(record.payeTaxMinor, record.currency)}</span>
          </div>
          <div className="flex justify-between py-2 font-bold text-sm text-emerald-700 dark:text-emerald-400">
            <span>Net Take-Home Pay</span>
            <span className="font-mono">{money(record.netSalaryMinor, record.currency)}</span>
          </div>
          <div className="flex justify-between py-1 text-neutral-400 text-[11px]">
            <span>NSSF Employer Contribution (10%)</span>
            <span className="font-mono">{money(record.nssfEmployerMinor, record.currency)}</span>
          </div>
        </div>

        <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 p-2.5 bg-neutral-50 dark:bg-neutral-800/40 text-xs flex justify-between items-center">
          <div>
            <span className="text-neutral-400 block">Payment Status</span>
            <span className="font-bold text-neutral-900 dark:text-neutral-100">{record.paymentStatus}</span>
          </div>
          {record.paymentReference && (
            <div className="text-right">
              <span className="text-neutral-400 block">Reference</span>
              <span className="font-mono font-semibold">{record.paymentReference}</span>
            </div>
          )}
        </div>

        <div className="mt-4 flex justify-between items-center">
          <Button variant="ghost" size="sm" onClick={() => window.print()} className="gap-1.5">
            <Printer className="h-4 w-4" /> Print Payslip
          </Button>
          <Button variant="secondary" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
