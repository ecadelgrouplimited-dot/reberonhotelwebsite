'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeftRight,
  BedDouble,
  Boxes,
  Building2,
  Calendar,
  Check,
  ClipboardCheck,
  Download,
  Dumbbell,
  Edit,
  Eye,
  FolderTree,
  History,
  MapPin,
  PackagePlus,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  SlidersHorizontal,
  Trash2,
  TrendingUp,
  Wallet,
  X,
} from 'lucide-react';
import Link from 'next/link';
import type {
  Department,
  InventoryCategory,
  InventoryDashboardDTO,
  InventoryItemDTO,
  StockMovementDTO,
  StockMovementType,
} from '@reberon/contracts';
import { ApiError, del, get, patch, post } from '@/lib/api';
import { useCan, useMe } from '@/lib/providers';
import { money, toMinorStr } from '@/lib/money';
import { dateTime } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Empty, PageHeader, Pill, Skeleton, Tabs } from '@/components/ui/bits';
import { Dialog } from '@/components/ui/dialog';
import { DeleteConfirmDialog } from '@/components/ui/delete-dialog';
import { SelectInput, TextInput } from '@/components/ui/field';

const CATEGORY_SHORT: Record<InventoryCategory, string> = {
  LINEN_GYM: 'Gym Linen (Moss)',
  LINEN_ROOM: 'Room Linen (White)',
  CONSUMABLE: 'Consumable & Toiletries',
  BEVERAGE: 'Beverage & Bar',
  FOOD_KITCHEN: 'Kitchen Provisions',
  FIXED_ASSET: 'Fixed Asset & Equipment',
};

const MOVEMENT_LABELS: Record<StockMovementType, string> = {
  STOCK_IN: 'Stock In',
  STOCK_OUT: 'Stock Out',
  LAUNDRY_SEND: 'To Laundry',
  LAUNDRY_RETURN: 'From Laundry',
  DAMAGED_LOST: 'Damaged / Lost',
  ADJUSTMENT: 'Adjustment / Count',
};

const DEPT_LABELS: Record<string, string> = {
  KITCHEN: 'Kitchen',
  BAR: 'Bar & Lounge',
  HEALTH_CLUB: 'Health Club & Spa',
  HOUSEKEEPING: 'Housekeeping',
  FRONT_DESK: 'Front Desk',
  CONFERENCE: 'Conference & Events',
  MAINTENANCE: 'Maintenance',
  ENERGY_UTILITIES: 'Energy & Utilities',
};

export default function InventoryPage() {
  const qc = useQueryClient();
  const can = useCan();
  const me = useMe();
  const isOwner = me.role === 'OWNER';

  const [tab, setTab] = useState<'ALL' | InventoryCategory | 'MOVEMENTS'>('ALL');
  const [deptFilter, setDeptFilter] = useState<string>('ALL');
  const [stockStatusFilter, setStockStatusFilter] = useState<string>('ALL');
  const [search, setSearch] = useState('');

  const [selectedItem, setSelectedItem] = useState<InventoryItemDTO | null>(null);
  const [editingItem, setEditingItem] = useState<InventoryItemDTO | null>(null);
  const [countingItem, setCountingItem] = useState<InventoryItemDTO | null>(null);
  const [moveItem, setMoveItem] = useState<InventoryItemDTO | null>(null);
  const [deletingItem, setDeletingItem] = useState<InventoryItemDTO | null>(null);
  const [newSkuOpen, setNewSkuOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['inventory'],
    queryFn: () => get<InventoryDashboardDTO>('/inventory'),
    refetchInterval: 30_000,
  });

  const quickMove = useMutation({
    mutationFn: (p: { itemId: string; type: StockMovementType; quantity: number; notes: string }) =>
      post('/inventory/movements', p),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['inventory'] });
      toast.success('Stock movement recorded');
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Update failed'),
  });

  const deleteItemMut = useMutation({
    mutationFn: (id: string) => del(`/inventory/items/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['inventory'] });
      setSelectedItem(null);
      setDeletingItem(null);
      toast.success('SKU permanently removed');
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Delete failed'),
  });

  const sum = data?.summary;
  const items = data?.items ?? [];

  const totalInventoryValuationMinor = useMemo(() => {
    return items.reduce((acc, i) => acc + BigInt(i.onHand) * BigInt(i.unitCostMinor), 0n);
  }, [items]);

  const filteredItems = useMemo(() => {
    return items.filter((it) => {
      if (tab !== 'ALL' && tab !== 'MOVEMENTS' && it.category !== tab) return false;
      if (deptFilter !== 'ALL' && it.department !== deptFilter) return false;
      if (stockStatusFilter === 'LOW' && !it.isLowStock) return false;
      if (stockStatusFilter === 'OUT' && it.onHand > 0) return false;
      if (stockStatusFilter === 'LAUNDRY' && it.inUseOrLaundry <= 0) return false;

      if (search.trim()) {
        const q = search.toLowerCase();
        return (
          it.name.toLowerCase().includes(q) ||
          it.sku.toLowerCase().includes(q) ||
          it.department.toLowerCase().includes(q) ||
          (it.location ?? '').toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [items, tab, deptFilter, stockStatusFilter, search]);

  const hasActiveFilters =
    tab !== 'ALL' || deptFilter !== 'ALL' || stockStatusFilter !== 'ALL' || search.trim().length > 0;

  const resetFilters = () => {
    setTab('ALL');
    setDeptFilter('ALL');
    setStockStatusFilter('ALL');
    setSearch('');
  };

  const exportCsv = () => {
    if (!filteredItems.length) return;
    const rows = [
      ['SKU', 'Name', 'Category', 'Department', 'Location', 'OnHand', 'InLaundry', 'ParLevel', 'Unit', 'UnitCostUGX', 'TotalValueUGX', 'Condition'],
      ...filteredItems.map((i) => [
        i.sku,
        `"${i.name.replace(/"/g, '""')}"`,
        CATEGORY_SHORT[i.category] ?? i.category,
        i.department,
        `"${(i.location ?? '').replace(/"/g, '""')}"`,
        i.onHand,
        i.inUseOrLaundry,
        i.parLevel,
        i.unit,
        Number(BigInt(i.unitCostMinor) / 100n),
        Number((BigInt(i.onHand) * BigInt(i.unitCostMinor)) / 100n),
        i.condition,
      ]),
    ];
    const blob = new Blob([rows.map((r) => r.join(',')).join('\n')], { type: 'text/csv' });
    const a = Object.assign(document.createElement('a'), {
      href: URL.createObjectURL(blob),
      download: `reberon-inventory-${new Date().toISOString().slice(0, 10)}.csv`,
    });
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="fade-in">
      <PageHeader
        title="Inventory, Linen & Assets"
        description="Central warehouse, departmental stock, laundry par tracking, and physical stock takes"
        actions={
          <div className="flex flex-wrap items-center gap-1.5">
            <Link
              href="/inventory/categories"
              className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-2.5 py-1.5 text-xs font-semibold text-neutral-800 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition"
            >
              <FolderTree className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
              Categories
            </Link>
            <Link
              href="/departments"
              className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-2.5 py-1.5 text-xs font-semibold text-neutral-800 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition"
            >
              <Building2 className="h-3.5 w-3.5 text-sky-600 dark:text-sky-400" />
              Departments
            </Link>
            <Button size="sm" variant="ghost" icon={<Download className="size-3.5" />} onClick={exportCsv}>
              CSV Export
            </Button>
            {can('inventory:manage') && (
              <>
                <Button
                  size="sm"
                  variant="secondary"
                  icon={<PackagePlus className="size-3.5" />}
                  onClick={() => setNewSkuOpen(true)}
                >
                  Add SKU
                </Button>
                <Button
                  size="sm"
                  variant="primary"
                  icon={<ArrowLeftRight className="size-3.5" />}
                  onClick={() => setMoveItem(items[0] ?? null)}
                >
                  Record Movement
                </Button>
              </>
            )}
          </div>
        }
      />

      {/* 4-KPI Overview Strip */}
      <div className="mb-4 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        {/* Total Stock Valuation */}
        <div className="card px-3.5 py-2.5">
          <span className="flex items-center gap-1 text-[11px] font-medium text-fg-muted">
            <Wallet className="size-3 text-fg-subtle" /> Total Asset Value
          </span>
          <p className="mt-0.5 text-[1.2rem] font-bold tabular text-fg">
            {money(totalInventoryValuationMinor.toString(), 'UGX')}
          </p>
        </div>

        {/* Linen Tracking */}
        <div className="card px-3.5 py-2.5 border-l-3 border-l-info">
          <span className="flex items-center gap-1 text-[11px] font-semibold text-info">
            <BedDouble className="size-3" /> Linen in Circulation
          </span>
          <p className="mt-0.5 text-[1.2rem] font-bold tabular">
            {(sum?.roomTowelsClean ?? 0) + (sum?.gymTowelsClean ?? 0)}{' '}
            <span className="text-[11px] font-normal text-fg-muted">
              clean · {(sum?.roomTowelsInUseOrLaundry ?? 0) + (sum?.gymTowelsInUseOrLaundry ?? 0)} in laundry
            </span>
          </p>
        </div>

        {/* Low Stock Alerts */}
        <button
          type="button"
          onClick={() => setStockStatusFilter(stockStatusFilter === 'LOW' ? 'ALL' : 'LOW')}
          className={`card flex items-center justify-between px-3.5 py-2.5 text-left transition ${
            stockStatusFilter === 'LOW' ? '!border-warning ring-1 ring-warning' : 'hover:border-line-strong'
          }`}
        >
          <div>
            <span className="text-[11px] font-medium text-fg-muted">Low-Stock SKUs</span>
            <p className="mt-0.5 text-[1.2rem] font-bold tabular text-warning">{sum?.lowStockCount ?? 0}</p>
          </div>
          {(sum?.lowStockCount ?? 0) > 0 ? (
            <Pill tone="amber" dot>
              {stockStatusFilter === 'LOW' ? 'Filtered' : 'Action Needed'}
            </Pill>
          ) : (
            <Pill tone="green">Adequate</Pill>
          )}
        </button>

        {/* Fixed Assets */}
        <div className="card px-3.5 py-2.5">
          <span className="flex items-center gap-1 text-[11px] font-medium text-fg-muted">
            <Boxes className="size-3 text-fg-subtle" /> Tracked Fixed Assets
          </span>
          <p className="mt-0.5 text-[1.2rem] font-bold tabular">
            {sum?.totalFixedAssets ?? 0} units
          </p>
        </div>
      </div>

      <div className="card overflow-hidden">
        {/* Category Tabs */}
        <Tabs
          className="px-3"
          value={tab}
          onChange={setTab}
          items={[
            { value: 'ALL', label: 'All SKUs', count: items.length },
            {
              value: 'LINEN_GYM',
              label: 'Gym Linen',
              count: items.filter((i) => i.category === 'LINEN_GYM').length,
            },
            {
              value: 'LINEN_ROOM',
              label: 'Room Linen',
              count: items.filter((i) => i.category === 'LINEN_ROOM').length,
            },
            {
              value: 'CONSUMABLE',
              label: 'Consumables',
              count: items.filter((i) => i.category === 'CONSUMABLE').length,
            },
            {
              value: 'BEVERAGE',
              label: 'Beverages',
              count: items.filter((i) => i.category === 'BEVERAGE').length,
            },
            {
              value: 'FOOD_KITCHEN',
              label: 'Kitchen Store',
              count: items.filter((i) => i.category === 'FOOD_KITCHEN').length,
            },
            {
              value: 'FIXED_ASSET',
              label: 'Fixed Assets',
              count: items.filter((i) => i.category === 'FIXED_ASSET').length,
            },
            {
              value: 'MOVEMENTS',
              label: 'Stock Ledger',
              count: data?.movements.length ?? 0,
            },
          ]}
        />

        {tab !== 'MOVEMENTS' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 border-b border-line bg-surface-2/30 px-3 py-2 text-xs">
            {/* Quick Search */}
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-fg-subtle" />
              <input
                className="input !h-8 !min-h-0 w-full pl-8 text-xs bg-surface"
                placeholder="Search SKU, item, store location…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            {/* Department Dropdown */}
            <div className="flex items-center gap-1.5">
              <SlidersHorizontal className="size-3.5 text-fg-subtle shrink-0" />
              <select
                className="input !h-8 !min-h-0 w-full py-0 text-xs bg-surface"
                value={deptFilter}
                onChange={(e) => setDeptFilter(e.target.value)}
                aria-label="Filter by department"
              >
                <option value="ALL">All Departments</option>
                <option value="HEALTH_CLUB">Health Club & Spa</option>
                <option value="HOUSEKEEPING">Housekeeping</option>
                <option value="KITCHEN">Kitchen</option>
                <option value="BAR">Bar & Lounge</option>
                <option value="CONFERENCE">Conference & Events</option>
                <option value="FRONT_DESK">Front Desk</option>
                <option value="MAINTENANCE">Maintenance</option>
              </select>
            </div>

            {/* Stock Level Filter */}
            <div className="flex items-center gap-1.5">
              <AlertTriangle className="size-3.5 text-fg-subtle shrink-0" />
              <select
                className="input !h-8 !min-h-0 w-full py-0 text-xs bg-surface"
                value={stockStatusFilter}
                onChange={(e) => setStockStatusFilter(e.target.value)}
                aria-label="Filter by stock health"
              >
                <option value="ALL">All Stock Levels</option>
                <option value="LOW">Below Par Level (Restock Needed)</option>
                <option value="OUT">Out of Stock (0 On-Hand)</option>
                <option value="LAUNDRY">In Laundry / In Transit</option>
              </select>
            </div>

            {/* Match Counter & Reset */}
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11.5px] font-medium text-fg-muted">
                {filteredItems.length} item{filteredItems.length === 1 ? '' : 's'} matching
              </span>
              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={resetFilters}
                  className="inline-flex items-center gap-1 text-[11px] font-medium text-fg-subtle hover:text-fg transition-colors"
                >
                  <RotateCcw className="size-3" /> Reset
                </button>
              )}
            </div>
          </div>
        )}

        <div>
          {isLoading ? (
            <div className="p-4">
              <Skeleton className="h-56" />
            </div>
          ) : tab === 'MOVEMENTS' ? (
            !data?.movements.length ? (
              <Empty icon={<RefreshCw className="size-4" />} title="No stock movements recorded" />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-[12.5px]">
                  <thead className="border-b border-line bg-surface-2/40 text-[11px] font-semibold uppercase tracking-wider text-fg-subtle">
                    <tr>
                      <th className="px-3.5 py-2">Time</th>
                      <th className="px-3.5 py-2">SKU</th>
                      <th className="px-3.5 py-2">Item</th>
                      <th className="px-3.5 py-2">Movement</th>
                      <th className="px-3.5 py-2 text-right">Qty</th>
                      <th className="px-3.5 py-2 text-right">Bal After</th>
                      <th className="px-3.5 py-2">Reference / Note</th>
                      <th className="px-3.5 py-2 text-right">Staff</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {data.movements.map((m) => (
                      <tr key={m.id} className="hover:bg-surface-2/30">
                        <td className="px-3.5 py-2 text-[11.5px] text-fg-muted whitespace-nowrap">
                          {dateTime(m.createdAt)}
                        </td>
                        <td className="px-3.5 py-2 font-mono text-[11.5px] text-fg-subtle">
                          {m.itemSku}
                        </td>
                        <td className="px-3.5 py-2 font-medium">{m.itemName}</td>
                        <td className="px-3.5 py-2">
                          <Pill
                            tone={
                              m.type === 'STOCK_IN' || m.type === 'LAUNDRY_RETURN'
                                ? 'green'
                                : m.type === 'DAMAGED_LOST'
                                  ? 'red'
                                  : m.type === 'ADJUSTMENT'
                                    ? 'blue'
                                    : 'amber'
                            }
                          >
                            {MOVEMENT_LABELS[m.type]}
                          </Pill>
                        </td>
                        <td className="px-3.5 py-2 text-right font-mono font-bold tabular">
                          {m.quantity}
                        </td>
                        <td className="px-3.5 py-2 text-right font-mono tabular text-fg-muted">
                          {m.balanceAfter}
                        </td>
                        <td className="px-3.5 py-2 text-[12px] text-fg-muted">
                          {m.notes ?? m.reference ?? '—'}
                        </td>
                        <td className="px-3.5 py-2 text-right text-[11.5px] text-fg-subtle">
                          {m.recordedByName ?? 'System'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          ) : !filteredItems.length ? (
            <Empty
              icon={<Boxes className="size-4" />}
              title="No matching SKUs"
              action={
                hasActiveFilters ? (
                  <Button size="sm" variant="secondary" onClick={resetFilters}>
                    Clear Filters
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[880px] text-left text-[12.5px]">
                <thead className="border-b border-line bg-surface-2/40 text-[11px] font-semibold uppercase tracking-wider text-fg-subtle">
                  <tr>
                    <th className="px-3.5 py-2">SKU</th>
                    <th className="px-3.5 py-2">Item Name & Location</th>
                    <th className="px-3.5 py-2">Category</th>
                    <th className="px-3.5 py-2">Dept</th>
                    <th className="px-3.5 py-2 text-right">On-Hand</th>
                    <th className="px-3.5 py-2 text-right">Laundry / In-Use</th>
                    <th className="px-3.5 py-2 text-right">Par Level</th>
                    <th className="px-3.5 py-2 text-right">Unit Cost</th>
                    <th className="px-3.5 py-2 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {filteredItems.map((it) => {
                    const isLinen = it.category === 'LINEN_GYM' || it.category === 'LINEN_ROOM';
                    return (
                      <tr
                        key={it.id}
                        onClick={() => setSelectedItem(it)}
                        className="align-middle hover:bg-surface-2/40 transition-colors cursor-pointer"
                      >
                        <td className="px-3.5 py-2 font-mono text-[11.5px] font-semibold text-fg-subtle whitespace-nowrap">
                          <span className="hover:underline">{it.sku}</span>
                        </td>
                        <td className="px-3.5 py-2">
                          <div className="flex items-center gap-1.5">
                            <span className="font-semibold text-fg">{it.name}</span>
                            {it.isLowStock && (
                              <Pill tone="amber" dot>
                                Below Par
                              </Pill>
                            )}
                            {it.onHand === 0 && (
                              <Pill tone="red" dot>
                                Out of Stock
                              </Pill>
                            )}
                          </div>
                          {it.location && (
                            <div className="flex items-center gap-1 text-[11px] text-fg-subtle mt-0.5">
                              <MapPin className="size-2.5" />
                              <span>{it.location}</span>
                            </div>
                          )}
                        </td>
                        <td className="px-3.5 py-2 whitespace-nowrap">
                          <Pill
                            tone={
                              it.category === 'LINEN_GYM'
                                ? 'green'
                                : it.category === 'LINEN_ROOM'
                                  ? 'blue'
                                  : 'neutral'
                            }
                          >
                            {CATEGORY_SHORT[it.category] ?? it.category}
                          </Pill>
                        </td>
                        <td className="px-3.5 py-2 text-[11.5px] text-fg-muted whitespace-nowrap">
                          {DEPT_LABELS[it.department] ?? it.department}
                        </td>
                        <td className="px-3.5 py-2 text-right font-mono text-[13px] font-bold tabular whitespace-nowrap">
                          <span className={it.isLowStock ? 'text-warning' : 'text-fg'}>
                            {it.onHand}
                          </span>{' '}
                          <span className="font-sans text-[10.5px] font-normal text-fg-subtle">
                            {it.unit}
                          </span>
                        </td>
                        <td className="px-3.5 py-2 text-right font-mono tabular text-fg-muted whitespace-nowrap">
                          {it.inUseOrLaundry > 0 ? `${it.inUseOrLaundry}` : '—'}
                        </td>
                        <td className="px-3.5 py-2 text-right font-mono tabular text-fg-subtle whitespace-nowrap">
                          {it.category === 'FIXED_ASSET' ? '—' : it.parLevel}
                        </td>
                        <td className="px-3.5 py-2 text-right font-mono tabular whitespace-nowrap">
                          {money(it.unitCostMinor, 'UGX')}
                        </td>
                        <td
                          className="px-3.5 py-2 text-right whitespace-nowrap"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="inline-flex items-center gap-1">
                            {/* View / Manage Drawer */}
                            <Button
                              size="sm"
                              variant="secondary"
                              icon={<Eye className="size-3" />}
                              onClick={() => setSelectedItem(it)}
                            >
                              Manage
                            </Button>

                            {/* Quick Laundry Return */}
                            {isLinen && it.inUseOrLaundry >= 5 && (
                              <Button
                                size="sm"
                                variant="ghost"
                                title="Return 5 clean from laundry"
                                onClick={() =>
                                  quickMove.mutate({
                                    itemId: it.id,
                                    type: 'LAUNDRY_RETURN',
                                    quantity: 5,
                                    notes: 'Quick laundry return',
                                  })
                                }
                              >
                                +5 Clean
                              </Button>
                            )}

                            {/* Quick Restock */}
                            {it.category !== 'FIXED_ASSET' && (
                              <Button
                                size="sm"
                                variant="ghost"
                                icon={<Plus className="size-3" />}
                                title="Quick restock +10"
                                onClick={() =>
                                  quickMove.mutate({
                                    itemId: it.id,
                                    type: 'STOCK_IN',
                                    quantity: 10,
                                    notes: 'Quick restock',
                                  })
                                }
                              >
                                10
                              </Button>
                            )}

                            {/* Move Modal */}
                            <Button
                              size="sm"
                              variant="ghost"
                              icon={<ArrowLeftRight className="size-3" />}
                              onClick={() => setMoveItem(it)}
                              title="Record stock movement"
                            />

                            {/* Owner Delete Action */}
                            {isOwner && (
                              <Button
                                size="sm"
                                variant="danger"
                                icon={<Trash2 className="size-3" />}
                                onClick={() => setDeletingItem(it)}
                                title="Delete SKU (Owner only)"
                              />
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

      {/* Item Detail & Full Stock Management Drawer */}
      <ItemDetailDialog
        item={selectedItem}
        onClose={() => setSelectedItem(null)}
        onEdit={(it) => {
          setSelectedItem(null);
          setEditingItem(it);
        }}
        onCount={(it) => {
          setSelectedItem(null);
          setCountingItem(it);
        }}
        onMove={(it) => {
          setSelectedItem(null);
          setMoveItem(it);
        }}
        onRequestDelete={(it) => {
          setSelectedItem(null);
          setDeletingItem(it);
        }}
        isOwner={isOwner}
      />

      {deletingItem && (
        <DeleteConfirmDialog
          open={!!deletingItem}
          onClose={() => setDeletingItem(null)}
          onConfirm={() => deleteItemMut.mutate(deletingItem.id)}
          title={`Delete SKU · ${deletingItem.sku}?`}
          itemName={`${deletingItem.sku} (${deletingItem.name})`}
          itemType="Inventory SKU"
          warning={`This will permanently remove ${deletingItem.sku} from inventory records and department allocations.`}
          requireMatch="DELETE"
          loading={deleteItemMut.isPending}
        />
      )}

      {/* Edit SKU Dialog */}
      {editingItem && (
        <EditInventoryItemDialog
          item={editingItem}
          open={!!editingItem}
          onClose={() => setEditingItem(null)}
          onSuccess={() => {
            setEditingItem(null);
            qc.invalidateQueries({ queryKey: ['inventory'] });
          }}
        />
      )}

      {/* Physical Stock Take / Reconciliation Dialog */}
      {countingItem && (
        <StockCountDialog
          item={countingItem}
          open={!!countingItem}
          onClose={() => setCountingItem(null)}
          onSuccess={() => {
            setCountingItem(null);
            qc.invalidateQueries({ queryKey: ['inventory'] });
          }}
        />
      )}

      {/* Record Movement Dialog */}
      {moveItem && (
        <RecordMovementDialog
          items={items}
          initialItem={moveItem}
          open={!!moveItem}
          onClose={() => setMoveItem(null)}
          onSuccess={() => {
            setMoveItem(null);
            qc.invalidateQueries({ queryKey: ['inventory'] });
          }}
        />
      )}

      {/* Create New SKU Dialog */}
      <CreateInventoryItemDialog
        open={newSkuOpen}
        onClose={() => setNewSkuOpen(false)}
        onSuccess={() => {
          setNewSkuOpen(false);
          qc.invalidateQueries({ queryKey: ['inventory'] });
        }}
      />
    </div>
  );
}

/** Comprehensive Item Detail Drawer with Live Stock Gauge, Valuation, and History */
function ItemDetailDialog({
  item,
  onClose,
  onEdit,
  onCount,
  onMove,
  onRequestDelete,
  isOwner,
}: {
  item: InventoryItemDTO | null;
  onClose: () => void;
  onEdit: (it: InventoryItemDTO) => void;
  onCount: (it: InventoryItemDTO) => void;
  onMove: (it: InventoryItemDTO) => void;
  onRequestDelete: (it: InventoryItemDTO) => void;
  isOwner: boolean;
}) {
  const can = useCan();
  const itemId = item?.id;

  const { data: movements, isLoading } = useQuery({
    queryKey: ['inventory', 'movements', itemId],
    queryFn: () => get<StockMovementDTO[]>(`/inventory/items/${itemId}/movements`),
    enabled: !!itemId,
  });

  if (!item) return null;

  const totalOnHandValueMinor = BigInt(item.onHand) * BigInt(item.unitCostMinor);
  const totalCirculation = item.onHand + item.inUseOrLaundry;
  const parPct = item.parLevel > 0 ? Math.min(100, Math.round((item.onHand / item.parLevel) * 100)) : 100;

  return (
    <Dialog
      open={!!item}
      onClose={onClose}
      size="lg"
      title={`${item.sku} · ${item.name}`}
      description={`${CATEGORY_SHORT[item.category] ?? item.category} · ${DEPT_LABELS[item.department] ?? item.department}`}
      footer={
        <div className="flex w-full flex-wrap items-center justify-between gap-2">
          {isOwner ? (
            <Button
              variant="danger"
              icon={<Trash2 className="size-3.5" />}
              onClick={() => onRequestDelete(item)}
            >
              Delete SKU
            </Button>
          ) : <div />}

          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={onClose}>
              Close
            </Button>
            {can('inventory:manage') && (
              <>
                <Button
                  variant="secondary"
                  icon={<ClipboardCheck className="size-3.5" />}
                  onClick={() => onCount(item)}
                >
                  Count Stock
                </Button>
                <Button
                  variant="secondary"
                  icon={<ArrowLeftRight className="size-3.5" />}
                  onClick={() => onMove(item)}
                >
                  Move / Laundry
                </Button>
                <Button
                  variant="primary"
                  icon={<Edit className="size-3.5" />}
                  onClick={() => onEdit(item)}
                >
                  Edit SKU
                </Button>
              </>
            )}
          </div>
        </div>
      }
    >
      <div className="grid gap-4 text-xs">
        {/* KPI Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 rounded-xl border border-line bg-surface p-3.5">
          <div>
            <span className="block text-[10.5px] font-semibold text-fg-subtle uppercase">On-Hand Stock</span>
            <span className="font-mono text-lg font-bold text-fg">
              {item.onHand} <span className="font-sans text-xs font-normal text-fg-muted">{item.unit}</span>
            </span>
          </div>

          <div>
            <span className="block text-[10.5px] font-semibold text-fg-subtle uppercase">In Laundry / Use</span>
            <span className="font-mono text-lg font-bold text-fg">
              {item.inUseOrLaundry} <span className="font-sans text-xs font-normal text-fg-muted">{item.unit}</span>
            </span>
          </div>

          <div>
            <span className="block text-[10.5px] font-semibold text-fg-subtle uppercase">Total In Circulation</span>
            <span className="font-mono text-lg font-bold text-fg">
              {totalCirculation} <span className="font-sans text-xs font-normal text-fg-muted">{item.unit}</span>
            </span>
          </div>

          <div>
            <span className="block text-[10.5px] font-semibold text-fg-subtle uppercase">Stock Valuation</span>
            <span className="font-mono text-lg font-bold text-fg">
              {money(totalOnHandValueMinor.toString(), 'UGX')}
            </span>
          </div>
        </div>

        {/* Par Level Health & Location */}
        <div className="rounded-xl border border-line bg-surface-2/40 p-3.5">
          <div className="flex items-center justify-between mb-2">
            <div>
              <span className="font-semibold text-fg">Stock Health vs Par Level</span>
              <p className="text-[11px] text-fg-subtle">
                Par Level: {item.parLevel} {item.unit} · Target safety buffer for uninterrupted service
              </p>
            </div>
            <Pill tone={item.isLowStock ? 'amber' : 'green'} dot>
              {item.isLowStock ? 'Restock Recommended' : 'Stocked Sufficiently'}
            </Pill>
          </div>

          {/* Progress Bar */}
          <div className="h-2 w-full rounded-full bg-surface border border-line overflow-hidden">
            <div
              className={`h-full transition-all duration-500 ${
                item.isLowStock ? 'bg-warning' : 'bg-success'
              }`}
              style={{ width: `${parPct}%` }}
            />
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-3 pt-3 border-t border-line text-[11px]">
            <div>
              <span className="text-fg-subtle">Store Location:</span>{' '}
              <strong className="text-fg">{item.location || 'Central Store'}</strong>
            </div>
            <div>
              <span className="text-fg-subtle">Unit Purchase Cost:</span>{' '}
              <strong className="font-mono text-fg">{money(item.unitCostMinor, 'UGX')}</strong>
            </div>
            <div>
              <span className="text-fg-subtle">Condition:</span>{' '}
              <strong className="text-fg">{item.condition}</strong>
            </div>
          </div>
        </div>

        {/* Item Stock Ledger History */}
        <div className="rounded-xl border border-line overflow-hidden">
          <div className="border-b border-line bg-surface px-3 py-2 flex items-center justify-between">
            <div className="flex items-center gap-1.5 font-semibold text-fg text-xs">
              <History className="size-3.5 text-fg-subtle" />
              <span>SKU Stock Ledger History</span>
            </div>
            <span className="text-[11px] text-fg-subtle">Recent movements</span>
          </div>

          {isLoading ? (
            <div className="p-3">
              <Skeleton className="h-24" />
            </div>
          ) : !movements?.length ? (
            <div className="p-4 text-center text-fg-muted text-[11.5px]">No movements recorded yet.</div>
          ) : (
            <div className="max-h-60 overflow-y-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-line bg-surface-2/40 text-[10.5px] font-semibold uppercase text-fg-subtle">
                  <tr>
                    <th className="px-3 py-1.5">Date</th>
                    <th className="px-3 py-1.5">Type</th>
                    <th className="px-3 py-1.5 text-right">Qty</th>
                    <th className="px-3 py-1.5 text-right">Bal After</th>
                    <th className="px-3 py-1.5">Reference / Notes</th>
                    <th className="px-3 py-1.5 text-right">Staff</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line text-[11.5px]">
                  {movements.map((m) => (
                    <tr key={m.id} className="hover:bg-surface-2/20">
                      <td className="px-3 py-1.5 font-mono text-fg-subtle whitespace-nowrap">
                        {dateTime(m.createdAt)}
                      </td>
                      <td className="px-3 py-1.5 whitespace-nowrap">
                        <Pill
                          tone={
                            m.type === 'STOCK_IN' || m.type === 'LAUNDRY_RETURN'
                              ? 'green'
                              : m.type === 'DAMAGED_LOST'
                                ? 'red'
                                : m.type === 'ADJUSTMENT'
                                  ? 'blue'
                                  : 'amber'
                          }
                        >
                          {MOVEMENT_LABELS[m.type]}
                        </Pill>
                      </td>
                      <td className="px-3 py-1.5 text-right font-mono font-bold">{m.quantity}</td>
                      <td className="px-3 py-1.5 text-right font-mono text-fg-muted">{m.balanceAfter}</td>
                      <td className="px-3 py-1.5 text-fg-muted truncate max-w-[160px]" title={m.notes ?? ''}>
                        {m.notes ?? m.reference ?? '—'}
                      </td>
                      <td className="px-3 py-1.5 text-right text-fg-subtle whitespace-nowrap">
                        {m.recordedByName ?? 'System'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </Dialog>
  );
}

/** Physical Stock Take / Reconciliation Dialog */
function StockCountDialog({
  item,
  open,
  onClose,
  onSuccess,
}: {
  item: InventoryItemDTO;
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [actualCount, setActualCount] = useState(String(item.onHand));
  const [notes, setNotes] = useState('');

  const countNum = Number(actualCount) || 0;
  const diff = countNum - item.onHand;

  const m = useMutation({
    mutationFn: () =>
      post(`/inventory/items/${item.id}/adjust`, {
        actualCount: countNum,
        notes: notes.trim() || undefined,
      }),
    onSuccess: () => {
      toast.success(`Physical count updated: ${item.onHand} → ${countNum}`);
      onSuccess();
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Stock count adjustment failed'),
  });

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="md"
      title={`Physical Stock Take · ${item.sku}`}
      description={`Enter the actual counted on-hand quantity for ${item.name}`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" loading={m.isPending} onClick={() => m.mutate()}>
            Save Physical Count
          </Button>
        </>
      }
    >
      <div className="grid gap-3 text-xs">
        <div className="grid grid-cols-2 gap-2.5 rounded-lg border border-line bg-surface-2/40 p-3">
          <div>
            <span className="block text-[11px] text-fg-subtle">Recorded On-Hand:</span>
            <span className="font-mono text-base font-bold text-fg">
              {item.onHand} {item.unit}
            </span>
          </div>

          <div>
            <span className="block text-[11px] text-fg-subtle">Discrepancy:</span>
            <span
              className={`font-mono text-base font-bold ${
                diff === 0 ? 'text-success' : diff > 0 ? 'text-info' : 'text-danger'
              }`}
            >
              {diff > 0 ? `+${diff}` : diff} {item.unit}
            </span>
          </div>
        </div>

        <TextInput
          label={`Actual Counted On-Hand (${item.unit})`}
          required
          type="number"
          min={0}
          value={actualCount}
          onChange={(e) => setActualCount(e.target.value)}
        />

        <TextInput
          label="Audit / Discrepancy Reason"
          placeholder="e.g. Month-end physical stock audit, broken bottle discarded, etc."
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>
    </Dialog>
  );
}

/** Edit SKU Attributes Dialog */
function EditInventoryItemDialog({
  item,
  open,
  onClose,
  onSuccess,
}: {
  item: InventoryItemDTO;
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [name, setName] = useState(item.name);
  const [category, setCategory] = useState<InventoryCategory>(item.category);
  const [department, setDepartment] = useState<Department>(item.department);
  const [unit, setUnit] = useState(item.unit);
  const [parLevel, setParLevel] = useState(String(item.parLevel));
  const [unitCostMajor, setUnitCostMajor] = useState(
    String(Math.round(Number(item.unitCostMinor) / 100)),
  );
  const [location, setLocation] = useState(item.location ?? '');
  const [condition, setCondition] = useState(item.condition ?? 'GOOD');

  const m = useMutation({
    mutationFn: () =>
      patch(`/inventory/items/${item.id}`, {
        name: name.trim(),
        category,
        department,
        unit: unit.trim(),
        parLevel: Number(parLevel) || 0,
        unitCostMinor: toMinorStr(unitCostMajor, 'UGX') ?? '0',
        location: location.trim() || null,
        condition: condition.trim(),
      }),
    onSuccess: () => {
      toast.success(`SKU ${item.sku} updated`);
      onSuccess();
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Could not update item'),
  });

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="md"
      title={`Edit SKU · ${item.sku}`}
      description="Update category, department, target par level, or store location"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            loading={m.isPending}
            disabled={!name.trim()}
            onClick={() => m.mutate()}
          >
            Save Changes
          </Button>
        </>
      }
    >
      <div className="grid gap-3 text-xs">
        <TextInput
          label="Item Name"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
        />

        <div className="grid grid-cols-2 gap-2.5">
          <SelectInput
            label="Category"
            value={category}
            onChange={(e) => setCategory(e.target.value as InventoryCategory)}
          >
            {Object.entries(CATEGORY_SHORT).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </SelectInput>

          <SelectInput
            label="Department"
            value={department}
            onChange={(e) => setDepartment(e.target.value as Department)}
          >
            <option value="HEALTH_CLUB">Health Club & Spa</option>
            <option value="HOUSEKEEPING">Housekeeping</option>
            <option value="KITCHEN">Kitchen</option>
            <option value="BAR">Bar & Lounge</option>
            <option value="CONFERENCE">Conference & Events</option>
            <option value="FRONT_DESK">Front Desk</option>
            <option value="MAINTENANCE">Maintenance</option>
            <option value="ENERGY_UTILITIES">Energy & Utilities</option>
          </SelectInput>
        </div>

        <div className="grid grid-cols-3 gap-2.5">
          <TextInput label="Unit" value={unit} onChange={(e) => setUnit(e.target.value)} />
          <TextInput
            label="Par Level"
            type="number"
            value={parLevel}
            onChange={(e) => setParLevel(e.target.value)}
          />
          <TextInput
            label="Unit Cost (UGX)"
            type="number"
            value={unitCostMajor}
            onChange={(e) => setUnitCostMajor(e.target.value)}
          />
        </div>

        <div className="grid grid-cols-2 gap-2.5">
          <TextInput
            label="Store / Shelf Location"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="e.g. Linen Closet 2nd Floor"
          />
          <SelectInput
            label="Condition"
            value={condition}
            onChange={(e) => setCondition(e.target.value)}
          >
            <option value="GOOD">Good / Ready</option>
            <option value="FAIR">Fair / Normal Wear</option>
            <option value="NEEDS_REPAIR">Needs Repair</option>
            <option value="DISCARD">Pending Discard</option>
          </SelectInput>
        </div>
      </div>
    </Dialog>
  );
}

/** Record Movement & Laundry Dialog */
function RecordMovementDialog({
  items,
  initialItem,
  open,
  onClose,
  onSuccess,
}: {
  items: InventoryItemDTO[];
  initialItem: InventoryItemDTO;
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [itemId, setItemId] = useState(initialItem.id);
  const [type, setType] = useState<StockMovementType>('STOCK_IN');
  const [quantity, setQuantity] = useState('10');
  const [notes, setNotes] = useState('');

  const selected = items.find((x) => x.id === itemId) ?? initialItem;

  const m = useMutation({
    mutationFn: () =>
      post('/inventory/movements', {
        itemId,
        type,
        quantity: Number(quantity) || 1,
        notes: notes.trim() || undefined,
      }),
    onSuccess: () => {
      toast.success(`Recorded ${MOVEMENT_LABELS[type]} for ${selected.name}`);
      onSuccess();
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Could not record movement'),
  });

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="md"
      title="Record Stock Movement"
      description="Stock receipt, issuance to department, laundry turnover, or breakage"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" loading={m.isPending} onClick={() => m.mutate()}>
            Save Movement
          </Button>
        </>
      }
    >
      <div className="grid gap-3 text-xs">
        <SelectInput
          label="Inventory SKU"
          value={itemId}
          onChange={(e) => setItemId(e.target.value)}
        >
          {items.map((it) => (
            <option key={it.id} value={it.id}>
              {it.sku} · {it.name} ({it.onHand} {it.unit} on-hand)
            </option>
          ))}
        </SelectInput>

        <div className="grid grid-cols-2 gap-2.5">
          <SelectInput
            label="Movement Type"
            value={type}
            onChange={(e) => setType(e.target.value as StockMovementType)}
          >
            {Object.entries(MOVEMENT_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </SelectInput>

          <TextInput
            label={`Quantity (${selected.unit})`}
            type="number"
            min={1}
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
          />
        </div>

        <TextInput
          label="Reference / Invoice / Laundry Batch"
          placeholder="e.g. Delivery note #8812, laundry batch #14..."
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>
    </Dialog>
  );
}

/** Create New SKU / Asset Dialog */
function CreateInventoryItemDialog({
  open,
  onClose,
  onSuccess,
}: {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [sku, setSku] = useState('');
  const [name, setName] = useState('');
  const [category, setCategory] = useState<InventoryCategory>('CONSUMABLE');
  const [department, setDepartment] = useState<Department>('HOUSEKEEPING');
  const [unit, setUnit] = useState('PIECE');
  const [onHand, setOnHand] = useState('50');
  const [parLevel, setParLevel] = useState('20');
  const [unitCostMajor, setUnitCostMajor] = useState('5000');
  const [location, setLocation] = useState('');

  const m = useMutation({
    mutationFn: () =>
      post('/inventory/items', {
        sku: sku.trim().toUpperCase(),
        name: name.trim(),
        category,
        department,
        unit,
        onHand: Number(onHand) || 0,
        parLevel: Number(parLevel) || 0,
        unitCostMinor: toMinorStr(unitCostMajor, 'UGX') ?? '0',
        location: location.trim() || undefined,
      }),
    onSuccess: () => {
      toast.success(`Added SKU ${sku.toUpperCase()}`);
      onSuccess();
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Could not create item'),
  });

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="md"
      title="Add SKU / Asset"
      description="Create a new tracked inventory item, linen SKU, or fixed asset."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            loading={m.isPending}
            disabled={!sku.trim() || !name.trim()}
            onClick={() => m.mutate()}
          >
            Create SKU
          </Button>
        </>
      }
    >
      <div className="grid gap-3 text-xs">
        <div className="grid grid-cols-2 gap-2.5">
          <TextInput
            label="SKU Code"
            required
            placeholder="e.g. RM-TWL-03"
            value={sku}
            onChange={(e) => setSku(e.target.value)}
          />
          <SelectInput
            label="Category"
            value={category}
            onChange={(e) => setCategory(e.target.value as InventoryCategory)}
          >
            {Object.entries(CATEGORY_SHORT).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </SelectInput>
        </div>

        <TextInput
          label="Item Name"
          required
          placeholder="e.g. Luxury Velvet Bathrobe"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />

        <div className="grid grid-cols-3 gap-2.5">
          <SelectInput
            label="Department"
            value={department}
            onChange={(e) => setDepartment(e.target.value as Department)}
          >
            <option value="HOUSEKEEPING">Housekeeping</option>
            <option value="KITCHEN">Kitchen</option>
            <option value="BAR">Bar & Lounge</option>
            <option value="HEALTH_CLUB">Health Club & Spa</option>
            <option value="CONFERENCE">Conference & Events</option>
            <option value="FRONT_DESK">Front Desk</option>
            <option value="MAINTENANCE">Maintenance</option>
            <option value="ENERGY_UTILITIES">Energy & Utilities</option>
          </SelectInput>

          <TextInput label="Unit" value={unit} onChange={(e) => setUnit(e.target.value)} />

          <TextInput
            label="Unit Cost (UGX)"
            type="number"
            value={unitCostMajor}
            onChange={(e) => setUnitCostMajor(e.target.value)}
          />
        </div>

        <div className="grid grid-cols-3 gap-2.5">
          <TextInput
            label="Initial On-Hand"
            type="number"
            value={onHand}
            onChange={(e) => setOnHand(e.target.value)}
          />

          <TextInput
            label="Par Level"
            type="number"
            value={parLevel}
            onChange={(e) => setParLevel(e.target.value)}
          />

          <TextInput
            label="Store Location"
            placeholder="e.g. Main Linen Room"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
          />
        </div>
      </div>
    </Dialog>
  );
}
