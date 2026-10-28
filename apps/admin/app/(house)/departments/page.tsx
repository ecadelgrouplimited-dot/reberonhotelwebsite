'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Building2,
  Plus,
  Search,
  SlidersHorizontal,
  Wallet,
  Boxes,
  ClipboardCheck,
  Edit,
  Trash2,
  CheckCircle2,
  XCircle,
  MapPin,
  UserCheck,
  ArrowUpRight,
  RefreshCw,
  FolderTree,
} from 'lucide-react';
import Link from 'next/link';
import type { HotelDepartmentDTO } from '@reberon/contracts';
import { ApiError, del, get, patch, post } from '@/lib/api';
import { useCan } from '@/lib/providers';
import { money } from '@/lib/money';
import { dateTime } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Empty, PageHeader, Pill, Skeleton } from '@/components/ui/bits';
import { Dialog } from '@/components/ui/dialog';
import { TextInput } from '@/components/ui/field';

export default function DepartmentsPage() {
  const qc = useQueryClient();
  const can = useCan();

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL');

  const [addModalOpen, setAddModalOpen] = useState(false);
  const [editingDept, setEditingDept] = useState<HotelDepartmentDTO | null>(null);

  const { data: departments, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['departments'],
    queryFn: () => get<HotelDepartmentDTO[]>('/departments'),
    refetchInterval: 30_000,
  });

  const createMutation = useMutation({
    mutationFn: (body: {
      code: string;
      name: string;
      description?: string;
      location?: string;
      headName?: string;
      monthlyBudgetMinor: string;
      isActive?: boolean;
    }) => post<HotelDepartmentDTO>('/departments', body),
    onSuccess: () => {
      toast.success('Department created successfully');
      qc.invalidateQueries({ queryKey: ['departments'] });
      setAddModalOpen(false);
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : 'Failed to create department');
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<HotelDepartmentDTO> }) =>
      patch<HotelDepartmentDTO>(`/departments/${id}`, data),
    onSuccess: () => {
      toast.success('Department updated successfully');
      qc.invalidateQueries({ queryKey: ['departments'] });
      setEditingDept(null);
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : 'Failed to update department');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => del(`/departments/${id}`),
    onSuccess: () => {
      toast.success('Department removed or deactivated');
      qc.invalidateQueries({ queryKey: ['departments'] });
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : 'Failed to remove department');
    },
  });

  const filtered = useMemo(() => {
    if (!departments) return [];
    return departments.filter((d) => {
      if (statusFilter === 'ACTIVE' && !d.isActive) return false;
      if (statusFilter === 'INACTIVE' && d.isActive) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        return (
          d.name.toLowerCase().includes(q) ||
          d.code.toLowerCase().includes(q) ||
          (d.headName && d.headName.toLowerCase().includes(q)) ||
          (d.location && d.location.toLowerCase().includes(q))
        );
      }
      return true;
    });
  }, [departments, search, statusFilter]);

  const totalBudgetMinor = useMemo(() => {
    if (!departments) return 0n;
    return departments.reduce((acc, d) => acc + BigInt(d.monthlyBudgetMinor || '0'), 0n);
  }, [departments]);

  const totalInventorySkus = useMemo(() => {
    if (!departments) return 0;
    return departments.reduce((acc, d) => acc + (d.inventoryCount || 0), 0);
  }, [departments]);

  const totalOpenReqs = useMemo(() => {
    if (!departments) return 0;
    return departments.reduce((acc, d) => acc + (d.openRequisitionsCount || 0), 0);
  }, [departments]);

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6 lg:p-8">
      {/* Header */}
      <PageHeader
        title="Departments & Cost Centers"
        description="Manage hotel operational departments, heads of department, budget allocations, and linked inventory."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/inventory/categories"
              className="inline-flex items-center gap-2 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-2 text-xs font-semibold text-neutral-800 dark:text-neutral-200 shadow-sm transition hover:bg-neutral-100 dark:hover:bg-neutral-800"
            >
              <FolderTree className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              Manage Categories
            </Link>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => refetch()}
              disabled={isFetching}
              title="Refresh list"
            >
              <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
            </Button>
            {can('inventory:manage') && (
              <Button
                variant="primary"
                size="sm"
                onClick={() => setAddModalOpen(true)}
                className="gap-2"
              >
                <Plus className="h-4 w-4" /> Add Department
              </Button>
            )}
          </div>
        }
      />

      {/* KPI Stats Overview */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-5 shadow-xs">
          <div className="flex items-center justify-between text-neutral-500 dark:text-neutral-400">
            <span className="text-xs font-semibold uppercase tracking-wider">Total Departments</span>
            <Building2 className="h-5 w-5 text-neutral-400" />
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-bold tracking-tight text-neutral-900 dark:text-neutral-100">
              {departments?.length ?? 0}
            </span>
            <span className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">
              {departments?.filter((d) => d.isActive).length ?? 0} active
            </span>
          </div>
        </div>

        <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-5 shadow-xs">
          <div className="flex items-center justify-between text-neutral-500 dark:text-neutral-400">
            <span className="text-xs font-semibold uppercase tracking-wider">Total Monthly Budget</span>
            <Wallet className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div className="mt-3">
            <span className="text-2xl font-bold tracking-tight text-neutral-900 dark:text-neutral-100">
              {money(totalBudgetMinor.toString(), 'UGX')}
            </span>
            <p className="mt-0.5 text-xs text-neutral-500">Across all operational cost centers</p>
          </div>
        </div>

        <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-5 shadow-xs">
          <div className="flex items-center justify-between text-neutral-500 dark:text-neutral-400">
            <span className="text-xs font-semibold uppercase tracking-wider">Assigned Inventory</span>
            <Boxes className="h-5 w-5 text-sky-600 dark:text-sky-400" />
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-bold tracking-tight text-neutral-900 dark:text-neutral-100">
              {totalInventorySkus}
            </span>
            <span className="text-xs text-neutral-500">total SKUs linked</span>
          </div>
        </div>

        <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-5 shadow-xs">
          <div className="flex items-center justify-between text-neutral-500 dark:text-neutral-400">
            <span className="text-xs font-semibold uppercase tracking-wider">Open Requisitions</span>
            <ClipboardCheck className="h-5 w-5 text-amber-600 dark:text-amber-400" />
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-bold tracking-tight text-neutral-900 dark:text-neutral-100">
              {totalOpenReqs}
            </span>
            <span className="text-xs text-amber-600 font-medium">pending approval</span>
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-3 shadow-xs">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by code, department name, head of department or location..."
            className="w-full rounded-xl border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 pl-10 pr-4 py-2 text-sm text-neutral-900 dark:text-neutral-100 placeholder:text-neutral-400 focus:border-neutral-400 focus:outline-none focus:ring-1 focus:ring-neutral-400 dark:focus:border-neutral-600"
          />
        </div>

        <div className="flex items-center gap-2">
          <div className="flex rounded-xl border border-neutral-200 dark:border-neutral-700 bg-neutral-100 dark:bg-neutral-800 p-1">
            <button
              onClick={() => setStatusFilter('ALL')}
              className={`rounded-lg px-3 py-1 text-xs font-semibold transition ${
                statusFilter === 'ALL'
                  ? 'bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100 shadow-xs'
                  : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900'
              }`}
            >
              All ({departments?.length ?? 0})
            </button>
            <button
              onClick={() => setStatusFilter('ACTIVE')}
              className={`rounded-lg px-3 py-1 text-xs font-semibold transition ${
                statusFilter === 'ACTIVE'
                  ? 'bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100 shadow-xs'
                  : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900'
              }`}
            >
              Active ({departments?.filter((d) => d.isActive).length ?? 0})
            </button>
            <button
              onClick={() => setStatusFilter('INACTIVE')}
              className={`rounded-lg px-3 py-1 text-xs font-semibold transition ${
                statusFilter === 'INACTIVE'
                  ? 'bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100 shadow-xs'
                  : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900'
              }`}
            >
              Inactive ({departments?.filter((d) => !d.isActive).length ?? 0})
            </button>
          </div>
        </div>
      </div>

      {/* Departments Table */}
      <div className="overflow-hidden rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 shadow-xs">
        {isLoading ? (
          <div className="p-8 space-y-4">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center">
            <Empty
              title="No departments found"
              body="No departments match your current filter or search criteria."
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-neutral-700 dark:text-neutral-300">
              <thead className="border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50/75 dark:bg-neutral-800/50 text-xs font-semibold text-neutral-500 uppercase tracking-wider">
                <tr>
                  <th className="px-6 py-3.5">Department</th>
                  <th className="px-6 py-3.5">Location</th>
                  <th className="px-6 py-3.5">Head of Department</th>
                  <th className="px-6 py-3.5">Monthly Budget</th>
                  <th className="px-6 py-3.5 text-center">Inventory</th>
                  <th className="px-6 py-3.5 text-center">Requisitions</th>
                  <th className="px-6 py-3.5">Status</th>
                  <th className="px-6 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
                {filtered.map((dept) => (
                  <tr
                    key={dept.id}
                    className="group hover:bg-neutral-50/80 dark:hover:bg-neutral-800/40 transition-colors"
                  >
                    <td className="px-6 py-4">
                      <div className="flex flex-col">
                        <span className="font-semibold text-neutral-900 dark:text-neutral-100 flex items-center gap-2">
                          {dept.name}
                          <span className="font-mono text-xs px-1.5 py-0.5 rounded bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400">
                            {dept.code}
                          </span>
                        </span>
                        {dept.description && (
                          <span className="text-xs text-neutral-500 line-clamp-1 mt-0.5">
                            {dept.description}
                          </span>
                        )}
                      </div>
                    </td>

                    <td className="px-6 py-4">
                      {dept.location ? (
                        <span className="inline-flex items-center gap-1.5 text-xs text-neutral-600 dark:text-neutral-400">
                          <MapPin className="h-3.5 w-3.5 text-neutral-400" />
                          {dept.location}
                        </span>
                      ) : (
                        <span className="text-xs text-neutral-400 italic">—</span>
                      )}
                    </td>

                    <td className="px-6 py-4">
                      {dept.headName ? (
                        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-neutral-800 dark:text-neutral-200">
                          <UserCheck className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                          {dept.headName}
                        </span>
                      ) : (
                        <span className="text-xs text-neutral-400 italic">Unassigned</span>
                      )}
                    </td>

                    <td className="px-6 py-4 font-mono font-medium text-neutral-900 dark:text-neutral-100">
                      {money(dept.monthlyBudgetMinor, dept.currency)}
                    </td>

                    <td className="px-6 py-4 text-center">
                      <Link
                        href={`/inventory?dept=${dept.code}`}
                        className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-semibold bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-700 transition"
                      >
                        <Boxes className="h-3 w-3" />
                        {dept.inventoryCount ?? 0} SKUs
                      </Link>
                    </td>

                    <td className="px-6 py-4 text-center">
                      <Link
                        href={`/requisitions?dept=${dept.code}`}
                        className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
                          (dept.openRequisitionsCount || 0) > 0
                            ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
                            : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400'
                        }`}
                      >
                        <ClipboardCheck className="h-3 w-3" />
                        {dept.openRequisitionsCount ?? 0} open
                      </Link>
                    </td>

                    <td className="px-6 py-4">
                      {dept.isActive ? (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 dark:text-emerald-400">
                          <CheckCircle2 className="h-3.5 w-3.5" /> Active
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-neutral-400">
                          <XCircle className="h-3.5 w-3.5" /> Inactive
                        </span>
                      )}
                    </td>

                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setEditingDept(dept)}
                          className="h-8 w-8 p-0 text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100"
                          title="Edit department"
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            if (confirm(`Are you sure you want to remove or deactivate ${dept.name}?`)) {
                              deleteMutation.mutate(dept.id);
                            }
                          }}
                          className="h-8 w-8 p-0 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40"
                          title="Deactivate / Delete"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create Department Modal */}
      <CreateDepartmentModal
        open={addModalOpen}
        onClose={() => setAddModalOpen(false)}
        onSubmit={(body) => createMutation.mutate(body)}
        isPending={createMutation.isPending}
      />

      {/* Edit Department Modal */}
      {editingDept && (
        <EditDepartmentModal
          department={editingDept}
          open={!!editingDept}
          onClose={() => setEditingDept(null)}
          onSubmit={(data) => updateMutation.mutate({ id: editingDept.id, data })}
          isPending={updateMutation.isPending}
        />
      )}
    </div>
  );
}

// ───────────────────────── Modals ─────────────────────────

function CreateDepartmentModal({
  open,
  onClose,
  onSubmit,
  isPending,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (body: {
    code: string;
    name: string;
    description?: string;
    location?: string;
    headName?: string;
    monthlyBudgetMinor: string;
    isActive?: boolean;
  }) => void;
  isPending: boolean;
}) {
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [location, setLocation] = useState('');
  const [headName, setHeadName] = useState('');
  const [budgetStr, setBudgetStr] = useState('5000000');
  const [description, setDescription] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error('Please enter department name');
      return;
    }
    const cleanCode = (code.trim() || name.trim())
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '_')
      .replace(/_+/g, '_');

    onSubmit({
      code: cleanCode,
      name: name.trim(),
      location: location.trim() || undefined,
      headName: headName.trim() || undefined,
      monthlyBudgetMinor: budgetStr.replace(/[^0-9]/g, '') || '0',
      description: description.trim() || undefined,
      isActive: true,
    });
  };

  return (
    <Dialog open={open} onClose={onClose} title="Add New Hotel Department">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
            Department Name *
          </label>
          <TextInput
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              if (!code) {
                setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '_'));
              }
            }}
            placeholder="e.g. Health Club & Wellness Spa"
            required
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
              Department Code *
            </label>
            <TextInput
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, ''))}
              placeholder="e.g. HEALTH_CLUB"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
              Monthly Budget (UGX)
            </label>
            <TextInput
              value={budgetStr}
              onChange={(e) => setBudgetStr(e.target.value)}
              placeholder="e.g. 5000000"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
              Operating Location
            </label>
            <TextInput
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="e.g. Ground Floor, Wellness Wing"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
              Head of Department
            </label>
            <TextInput
              value={headName}
              onChange={(e) => setHeadName(e.target.value)}
              placeholder="e.g. Grace Achieng"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
            Description & Scope
          </label>
          <textarea
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Brief scope of departmental responsibilities and facilities..."
            className="w-full rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 p-2.5 text-sm text-neutral-900 dark:text-neutral-100 placeholder:text-neutral-400 focus:border-neutral-500 focus:outline-none"
          />
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <Button variant="ghost" type="button" onClick={onClose} disabled={isPending}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" disabled={isPending}>
            {isPending ? 'Creating...' : 'Create Department'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function EditDepartmentModal({
  department,
  open,
  onClose,
  onSubmit,
  isPending,
}: {
  department: HotelDepartmentDTO;
  open: boolean;
  onClose: () => void;
  onSubmit: (data: Partial<HotelDepartmentDTO>) => void;
  isPending: boolean;
}) {
  const [name, setName] = useState(department.name);
  const [location, setLocation] = useState(department.location || '');
  const [headName, setHeadName] = useState(department.headName || '');
  const [budgetStr, setBudgetStr] = useState(department.monthlyBudgetMinor);
  const [description, setDescription] = useState(department.description || '');
  const [isActive, setIsActive] = useState(department.isActive);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error('Department name cannot be empty');
      return;
    }
    onSubmit({
      name: name.trim(),
      location: location.trim() || null,
      headName: headName.trim() || null,
      monthlyBudgetMinor: budgetStr.replace(/[^0-9]/g, '') || '0',
      description: description.trim() || null,
      isActive,
    });
  };

  return (
    <Dialog open={open} onClose={onClose} title={`Edit Department · ${department.code}`}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
            Department Name *
          </label>
          <TextInput
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
              Monthly Budget (UGX)
            </label>
            <TextInput
              value={budgetStr}
              onChange={(e) => setBudgetStr(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
              Head of Department
            </label>
            <TextInput
              value={headName}
              onChange={(e) => setHeadName(e.target.value)}
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
            Operating Location
          </label>
          <TextInput
            value={location}
            onChange={(e) => setLocation(e.target.value)}
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
            Description
          </label>
          <textarea
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 p-2.5 text-sm text-neutral-900 dark:text-neutral-100 placeholder:text-neutral-400 focus:border-neutral-500 focus:outline-none"
          />
        </div>

        <div className="flex items-center gap-3 pt-2">
          <input
            type="checkbox"
            id="dept-active"
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
            className="h-4 w-4 rounded border-neutral-300 text-neutral-900 focus:ring-neutral-400"
          />
          <label htmlFor="dept-active" className="text-sm font-medium text-neutral-800 dark:text-neutral-200">
            Active Department (visible across requisitions and inventory)
          </label>
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
