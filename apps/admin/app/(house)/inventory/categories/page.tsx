'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Boxes,
  Building2,
  CheckCircle2,
  Edit,
  FolderTree,
  Plus,
  RefreshCw,
  Search,
  Tag,
  Trash2,
  XCircle,
  ArrowLeft,
  Layers,
  Wallet,
} from 'lucide-react';
import Link from 'next/link';
import type { HotelDepartmentDTO, ItemCategoryDTO } from '@reberon/contracts';
import { ApiError, del, get, patch, post } from '@/lib/api';
import { useCan, useMe } from '@/lib/providers';
import { money } from '@/lib/money';
import { Button } from '@/components/ui/button';
import { Empty, PageHeader, Skeleton } from '@/components/ui/bits';
import { Dialog } from '@/components/ui/dialog';
import { DeleteConfirmDialog } from '@/components/ui/delete-dialog';
import { SelectInput, TextInput } from '@/components/ui/field';

const TONE_CLASSES: Record<string, string> = {
  neutral: 'bg-neutral-100 text-neutral-800 dark:bg-neutral-800 dark:text-neutral-200 border-neutral-300 dark:border-neutral-700',
  emerald: 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800',
  sky: 'bg-sky-50 text-sky-800 dark:bg-sky-950/60 dark:text-sky-300 border-sky-300 dark:border-sky-800',
  rose: 'bg-rose-50 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300 border-rose-300 dark:border-rose-800',
  amber: 'bg-amber-50 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border-amber-300 dark:border-amber-800',
  indigo: 'bg-indigo-50 text-indigo-800 dark:bg-indigo-950/60 dark:text-indigo-300 border-indigo-300 dark:border-indigo-800',
  violet: 'bg-violet-50 text-violet-800 dark:bg-violet-950/60 dark:text-violet-300 border-violet-300 dark:border-violet-800',
};

const COMMON_UNITS = ['PIECE', 'KG', 'LITER', 'BOTTLE', 'PACK', 'BOX', 'CAN', 'ROLL', 'PAIR', 'UNIT'];

export default function ItemCategoriesPage() {
  const qc = useQueryClient();
  const can = useCan();
  const me = useMe();
  const isOwner = me.role === 'OWNER';

  const [search, setSearch] = useState('');
  const [deptFilter, setDeptFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL');

  const [addModalOpen, setAddModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<ItemCategoryDTO | null>(null);
  const [deletingCategory, setDeletingCategory] = useState<ItemCategoryDTO | null>(null);

  const { data: categories, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['item-categories'],
    queryFn: () => get<ItemCategoryDTO[]>('/inventory/categories'),
    refetchInterval: 30_000,
  });

  const { data: departments } = useQuery({
    queryKey: ['departments'],
    queryFn: () => get<HotelDepartmentDTO[]>('/departments'),
  });

  const createMutation = useMutation({
    mutationFn: (body: {
      code: string;
      name: string;
      description?: string;
      defaultUnit: string;
      defaultParLevel: number;
      departmentCode?: string;
      tone?: string;
      isActive?: boolean;
    }) => post<ItemCategoryDTO>('/inventory/categories', body),
    onSuccess: () => {
      toast.success('Category created successfully');
      qc.invalidateQueries({ queryKey: ['item-categories'] });
      qc.invalidateQueries({ queryKey: ['inventory'] });
      setAddModalOpen(false);
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : 'Failed to create category');
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<ItemCategoryDTO> }) =>
      patch<ItemCategoryDTO>(`/inventory/categories/${id}`, data),
    onSuccess: () => {
      toast.success('Category updated successfully');
      qc.invalidateQueries({ queryKey: ['item-categories'] });
      qc.invalidateQueries({ queryKey: ['inventory'] });
      setEditingCategory(null);
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : 'Failed to update category');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => del(`/inventory/categories/${id}`),
    onSuccess: () => {
      toast.success('Category removed or deactivated');
      qc.invalidateQueries({ queryKey: ['item-categories'] });
      qc.invalidateQueries({ queryKey: ['inventory'] });
      setDeletingCategory(null);
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : 'Failed to remove category');
    },
  });

  const filtered = useMemo(() => {
    if (!categories) return [];
    return categories.filter((c) => {
      if (statusFilter === 'ACTIVE' && !c.isActive) return false;
      if (statusFilter === 'INACTIVE' && c.isActive) return false;
      if (deptFilter !== 'ALL' && c.departmentCode !== deptFilter) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        return (
          c.name.toLowerCase().includes(q) ||
          c.code.toLowerCase().includes(q) ||
          (c.departmentName && c.departmentName.toLowerCase().includes(q)) ||
          c.defaultUnit.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [categories, search, statusFilter, deptFilter]);

  const totalItems = useMemo(() => {
    if (!categories) return 0;
    return categories.reduce((acc, c) => acc + (c.itemCount || 0), 0);
  }, [categories]);

  const totalValuationMinor = useMemo(() => {
    if (!categories) return 0n;
    return categories.reduce((acc, c) => acc + BigInt(c.totalValueMinor || '0'), 0n);
  }, [categories]);

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6 lg:p-8">
      {/* Back button and breadcrumb */}
      <div className="flex items-center gap-2 text-xs text-neutral-500">
        <Link
          href="/inventory"
          className="inline-flex items-center gap-1 font-medium hover:text-neutral-900 dark:hover:text-neutral-100 transition"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back to Inventory & Linen
        </Link>
        <span>/</span>
        <span className="font-semibold text-neutral-800 dark:text-neutral-200">Categories</span>
      </div>

      {/* Header */}
      <PageHeader
        title="Inventory Categories"
        description="Configure stock classification, measurement units, default par thresholds, department alignment and color codes."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/departments"
              className="inline-flex items-center gap-2 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-2 text-xs font-semibold text-neutral-800 dark:text-neutral-200 shadow-sm transition hover:bg-neutral-100 dark:hover:bg-neutral-800"
            >
              <Building2 className="h-4 w-4 text-sky-600 dark:text-sky-400" />
              Manage Departments
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
                <Plus className="h-4 w-4" /> Add Category
              </Button>
            )}
          </div>
        }
      />

      {/* KPI Stats Overview */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-5 shadow-xs">
          <div className="flex items-center justify-between text-neutral-500 dark:text-neutral-400">
            <span className="text-xs font-semibold uppercase tracking-wider">Active Categories</span>
            <FolderTree className="h-5 w-5 text-neutral-400" />
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-bold tracking-tight text-neutral-900 dark:text-neutral-100">
              {categories?.filter((c) => c.isActive).length ?? 0}
            </span>
            <span className="text-xs text-neutral-500">of {categories?.length ?? 0} total</span>
          </div>
        </div>

        <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-5 shadow-xs">
          <div className="flex items-center justify-between text-neutral-500 dark:text-neutral-400">
            <span className="text-xs font-semibold uppercase tracking-wider">Total Stocked Items</span>
            <Boxes className="h-5 w-5 text-sky-600 dark:text-sky-400" />
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-bold tracking-tight text-neutral-900 dark:text-neutral-100">
              {totalItems}
            </span>
            <span className="text-xs text-neutral-500">SKUs tracked</span>
          </div>
        </div>

        <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-5 shadow-xs">
          <div className="flex items-center justify-between text-neutral-500 dark:text-neutral-400">
            <span className="text-xs font-semibold uppercase tracking-wider">Total Category Valuation</span>
            <Wallet className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div className="mt-3">
            <span className="text-2xl font-bold tracking-tight text-neutral-900 dark:text-neutral-100">
              {money(totalValuationMinor.toString(), 'UGX')}
            </span>
            <p className="mt-0.5 text-xs text-neutral-500">Asset & inventory value</p>
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
            placeholder="Search categories by name, code, department..."
            className="w-full rounded-xl border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 pl-10 pr-4 py-2 text-sm text-neutral-900 dark:text-neutral-100 placeholder:text-neutral-400 focus:border-neutral-400 focus:outline-none focus:ring-1 focus:ring-neutral-400 dark:focus:border-neutral-600"
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

          <div className="flex rounded-xl border border-neutral-200 dark:border-neutral-700 bg-neutral-100 dark:bg-neutral-800 p-1">
            <button
              onClick={() => setStatusFilter('ALL')}
              className={`rounded-lg px-3 py-1 text-xs font-semibold transition ${
                statusFilter === 'ALL'
                  ? 'bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100 shadow-xs'
                  : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900'
              }`}
            >
              All ({categories?.length ?? 0})
            </button>
            <button
              onClick={() => setStatusFilter('ACTIVE')}
              className={`rounded-lg px-3 py-1 text-xs font-semibold transition ${
                statusFilter === 'ACTIVE'
                  ? 'bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100 shadow-xs'
                  : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900'
              }`}
            >
              Active ({categories?.filter((c) => c.isActive).length ?? 0})
            </button>
            <button
              onClick={() => setStatusFilter('INACTIVE')}
              className={`rounded-lg px-3 py-1 text-xs font-semibold transition ${
                statusFilter === 'INACTIVE'
                  ? 'bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100 shadow-xs'
                  : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900'
              }`}
            >
              Inactive ({categories?.filter((c) => !c.isActive).length ?? 0})
            </button>
          </div>
        </div>
      </div>

      {/* Categories Table */}
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
              title="No categories found"
              body="No categories match your search or department filter."
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-neutral-700 dark:text-neutral-300">
              <thead className="border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50/75 dark:bg-neutral-800/50 text-xs font-semibold text-neutral-500 uppercase tracking-wider">
                <tr>
                  <th className="px-6 py-3.5">Category</th>
                  <th className="px-6 py-3.5">Assigned Department</th>
                  <th className="px-6 py-3.5">Default Unit</th>
                  <th className="px-6 py-3.5">Default Par</th>
                  <th className="px-6 py-3.5 text-center">Items</th>
                  <th className="px-6 py-3.5">Total Valuation</th>
                  <th className="px-6 py-3.5">Status</th>
                  <th className="px-6 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
                {filtered.map((cat) => (
                  <tr
                    key={cat.id}
                    className="group hover:bg-neutral-50/80 dark:hover:bg-neutral-800/40 transition-colors"
                  >
                    <td className="px-6 py-4">
                      <div className="flex flex-col">
                        <span className="font-semibold text-neutral-900 dark:text-neutral-100 flex items-center gap-2">
                          <span
                            className={`inline-block border px-2 py-0.5 text-xs font-semibold rounded-lg ${
                              TONE_CLASSES[cat.tone] ?? TONE_CLASSES.neutral
                            }`}
                          >
                            {cat.name}
                          </span>
                          <span className="font-mono text-xs text-neutral-400">
                            {cat.code}
                          </span>
                        </span>
                        {cat.description && (
                          <span className="text-xs text-neutral-500 line-clamp-1 mt-1">
                            {cat.description}
                          </span>
                        )}
                      </div>
                    </td>

                    <td className="px-6 py-4">
                      {cat.departmentCode ? (
                        <Link
                          href={`/departments`}
                          className="inline-flex items-center gap-1.5 text-xs font-medium text-neutral-700 dark:text-neutral-300 hover:text-sky-600 transition"
                        >
                          <Building2 className="h-3.5 w-3.5 text-neutral-400" />
                          {cat.departmentName || cat.departmentCode}
                        </Link>
                      ) : (
                        <span className="text-xs text-neutral-400 italic">Global / Shared</span>
                      )}
                    </td>

                    <td className="px-6 py-4 font-mono text-xs font-medium text-neutral-700 dark:text-neutral-300">
                      {cat.defaultUnit}
                    </td>

                    <td className="px-6 py-4 font-mono text-xs font-medium text-neutral-700 dark:text-neutral-300">
                      {cat.defaultParLevel}
                    </td>

                    <td className="px-6 py-4 text-center">
                      <Link
                        href={`/inventory`}
                        className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-semibold bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-700 transition"
                      >
                        <Boxes className="h-3 w-3" />
                        {cat.itemCount ?? 0} SKUs
                      </Link>
                    </td>

                    <td className="px-6 py-4 font-mono font-medium text-neutral-900 dark:text-neutral-100">
                      {money(cat.totalValueMinor || '0', 'UGX')}
                    </td>

                    <td className="px-6 py-4">
                      {cat.isActive ? (
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
                          onClick={() => setEditingCategory(cat)}
                          className="h-8 w-8 p-0 text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100"
                          title="Edit category"
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        {isOwner && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setDeletingCategory(cat)}
                            className="h-8 w-8 p-0 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40"
                            title="Delete category (Owner only)"
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

      {/* Create Category Modal */}
      <CreateCategoryModal
        open={addModalOpen}
        onClose={() => setAddModalOpen(false)}
        departments={departments || []}
        onSubmit={(body) => createMutation.mutate(body)}
        isPending={createMutation.isPending}
      />

      {/* Edit Category Modal */}
      {editingCategory && (
        <EditCategoryModal
          category={editingCategory}
          open={!!editingCategory}
          onClose={() => setEditingCategory(null)}
          departments={departments || []}
          onSubmit={(data) => updateMutation.mutate({ id: editingCategory.id, data })}
          isPending={updateMutation.isPending}
        />
      )}

      {/* Delete Category Confirmation Prompt */}
      {deletingCategory && (
        <DeleteConfirmDialog
          open={!!deletingCategory}
          onClose={() => setDeletingCategory(null)}
          onConfirm={() => deleteMutation.mutate(deletingCategory.id)}
          title={`Delete Category · ${deletingCategory.name}?`}
          itemName={deletingCategory.name}
          itemType="Inventory Category"
          warning={`Deleting this category will remove it from future requisition and stock forms. If any existing items belong to "${deletingCategory.name}", it will be safely deactivated to preserve historical auditing.`}
          requireMatch="DELETE"
          loading={deleteMutation.isPending}
        />
      )}
    </div>
  );
}

// ───────────────────────── Modals ─────────────────────────

function CreateCategoryModal({
  open,
  onClose,
  departments,
  onSubmit,
  isPending,
}: {
  open: boolean;
  onClose: () => void;
  departments: HotelDepartmentDTO[];
  onSubmit: (body: {
    code: string;
    name: string;
    description?: string;
    defaultUnit: string;
    defaultParLevel: number;
    departmentCode?: string;
    tone?: string;
    isActive?: boolean;
  }) => void;
  isPending: boolean;
}) {
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [defaultUnit, setDefaultUnit] = useState('PIECE');
  const [defaultParLevel, setDefaultParLevel] = useState(10);
  const [departmentCode, setDepartmentCode] = useState(departments[0]?.code || '');
  const [tone, setTone] = useState('neutral');
  const [description, setDescription] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error('Please enter category name');
      return;
    }
    const cleanCode = (code.trim() || name.trim())
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '_')
      .replace(/_+/g, '_');

    onSubmit({
      code: cleanCode,
      name: name.trim(),
      defaultUnit: defaultUnit.trim() || 'PIECE',
      defaultParLevel: Number(defaultParLevel) || 10,
      departmentCode: departmentCode.trim() || undefined,
      tone,
      description: description.trim() || undefined,
      isActive: true,
    });
  };

  return (
    <Dialog open={open} onClose={onClose} title="Add New Item Category">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
            Category Name *
          </label>
          <TextInput
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              if (!code) {
                setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '_'));
              }
            }}
            placeholder="e.g. Health Club Amenities & Toiletries"
            required
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
              Category Code *
            </label>
            <TextInput
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, ''))}
              placeholder="e.g. HEALTH_AMENITIES"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
              Assigned Department
            </label>
            <SelectInput
              value={departmentCode}
              onChange={(e) => setDepartmentCode(e.target.value)}
            >
              <option value="">Global / Shared</option>
              {departments.map((d) => (
                <option key={d.code} value={d.code}>
                  {d.name} ({d.code})
                </option>
              ))}
            </SelectInput>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
              Default Unit
            </label>
            <SelectInput
              value={defaultUnit}
              onChange={(e) => setDefaultUnit(e.target.value)}
            >
              {COMMON_UNITS.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </SelectInput>
          </div>

          <div>
            <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
              Default Par Level
            </label>
            <TextInput
              type="number"
              min={0}
              value={defaultParLevel}
              onChange={(e) => setDefaultParLevel(parseInt(e.target.value) || 0)}
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
              Badge Tone
            </label>
            <SelectInput
              value={tone}
              onChange={(e) => setTone(e.target.value)}
            >
              <option value="neutral">Neutral (Slate)</option>
              <option value="emerald">Emerald (Food/Green)</option>
              <option value="sky">Sky (Linen/Blue)</option>
              <option value="rose">Rose (Beverage/Red)</option>
              <option value="amber">Amber (Consumables/Gold)</option>
              <option value="indigo">Indigo (Housekeeping)</option>
              <option value="violet">Violet (Fixed Assets)</option>
            </SelectInput>
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
            Description
          </label>
          <textarea
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Items covered by this category..."
            className="w-full rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 p-2.5 text-sm text-neutral-900 dark:text-neutral-100 placeholder:text-neutral-400 focus:border-neutral-500 focus:outline-none"
          />
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <Button variant="ghost" type="button" onClick={onClose} disabled={isPending}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" disabled={isPending}>
            {isPending ? 'Creating...' : 'Create Category'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function EditCategoryModal({
  category,
  open,
  onClose,
  departments,
  onSubmit,
  isPending,
}: {
  category: ItemCategoryDTO;
  open: boolean;
  onClose: () => void;
  departments: HotelDepartmentDTO[];
  onSubmit: (data: Partial<ItemCategoryDTO>) => void;
  isPending: boolean;
}) {
  const [name, setName] = useState(category.name);
  const [defaultUnit, setDefaultUnit] = useState(category.defaultUnit);
  const [defaultParLevel, setDefaultParLevel] = useState(category.defaultParLevel);
  const [departmentCode, setDepartmentCode] = useState(category.departmentCode || '');
  const [tone, setTone] = useState(category.tone || 'neutral');
  const [description, setDescription] = useState(category.description || '');
  const [isActive, setIsActive] = useState(category.isActive);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error('Category name cannot be empty');
      return;
    }
    onSubmit({
      name: name.trim(),
      defaultUnit: defaultUnit.trim() || 'PIECE',
      defaultParLevel: Number(defaultParLevel) || 10,
      departmentCode: departmentCode.trim() || null,
      tone,
      description: description.trim() || null,
      isActive,
    });
  };

  return (
    <Dialog open={open} onClose={onClose} title={`Edit Category · ${category.code}`}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
            Category Name *
          </label>
          <TextInput
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
              Assigned Department
            </label>
            <SelectInput
              value={departmentCode}
              onChange={(e) => setDepartmentCode(e.target.value)}
            >
              <option value="">Global / Shared</option>
              {departments.map((d) => (
                <option key={d.code} value={d.code}>
                  {d.name} ({d.code})
                </option>
              ))}
            </SelectInput>
          </div>

          <div>
            <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
              Default Unit
            </label>
            <SelectInput
              value={defaultUnit}
              onChange={(e) => setDefaultUnit(e.target.value)}
            >
              {COMMON_UNITS.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </SelectInput>
          </div>

          <div>
            <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
              Default Par Level
            </label>
            <TextInput
              type="number"
              min={0}
              value={defaultParLevel}
              onChange={(e) => setDefaultParLevel(parseInt(e.target.value) || 0)}
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
            Badge Tone
          </label>
          <SelectInput
            value={tone}
            onChange={(e) => setTone(e.target.value)}
          >
            <option value="neutral">Neutral (Slate)</option>
            <option value="emerald">Emerald (Food/Green)</option>
            <option value="sky">Sky (Linen/Blue)</option>
            <option value="rose">Rose (Beverage/Red)</option>
            <option value="amber">Amber (Consumables/Gold)</option>
            <option value="indigo">Indigo (Housekeeping)</option>
            <option value="violet">Violet (Fixed Assets)</option>
          </SelectInput>
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
            id="cat-active"
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
            className="h-4 w-4 rounded border-neutral-300 text-neutral-900 focus:ring-neutral-400"
          />
          <label htmlFor="cat-active" className="text-sm font-medium text-neutral-800 dark:text-neutral-200">
            Active Category (available when adding and cataloging SKUs)
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
