'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  ArrowLeftRight, BedDouble, Boxes, Download, Dumbbell, PackagePlus, Plus, RefreshCw, Search,
} from 'lucide-react';
import type {
  Department,
  InventoryCategory,
  InventoryDashboardDTO,
  InventoryItemDTO,
  StockMovementType,
} from '@reberon/contracts';
import { ApiError, get, post } from '@/lib/api';
import { money, toMinorStr } from '@/lib/money';
import { dateTime } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Empty, PageHeader, Pill, Skeleton, Tabs } from '@/components/ui/bits';
import { Dialog } from '@/components/ui/dialog';
import { SelectInput, TextInput } from '@/components/ui/field';

const CATEGORY_SHORT: Record<InventoryCategory, string> = {
  LINEN_GYM: 'Gym Linen (Moss)',
  LINEN_ROOM: 'Room Linen (White)',
  CONSUMABLE: 'Consumable',
  BEVERAGE: 'Beverage',
  FOOD_KITCHEN: 'Kitchen Store',
  FIXED_ASSET: 'Fixed Asset',
};

const MOVEMENT_LABELS: Record<StockMovementType, string> = {
  STOCK_IN: 'Stock In',
  STOCK_OUT: 'Stock Out',
  LAUNDRY_SEND: 'To Laundry',
  LAUNDRY_RETURN: 'From Laundry',
  DAMAGED_LOST: 'Damaged / Lost',
  ADJUSTMENT: 'Adjustment',
};

export default function InventoryPage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<'ALL' | InventoryCategory | 'MOVEMENTS'>('ALL');
  const [deptFilter, setDeptFilter] = useState<string>('ALL');
  const [lowOnly, setLowOnly] = useState(false);
  const [search, setSearch] = useState('');
  const [moveItem, setMoveItem] = useState<InventoryItemDTO | null>(null);
  const [newSkuOpen, setNewSkuOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['inventory'],
    queryFn: () => get<InventoryDashboardDTO>('/inventory'),
  });

  const quickMove = useMutation({
    mutationFn: (p: { itemId: string; type: StockMovementType; quantity: number; notes: string }) =>
      post('/inventory/movements', p),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['inventory'] });
      toast.success('Stock updated');
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Update failed'),
  });

  const sum = data?.summary;

  const filteredItems = (data?.items ?? []).filter((it) => {
    if (tab !== 'ALL' && tab !== 'MOVEMENTS' && it.category !== tab) return false;
    if (deptFilter !== 'ALL' && it.department !== deptFilter) return false;
    if (lowOnly && !it.isLowStock) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return (
        it.name.toLowerCase().includes(q) ||
        it.sku.toLowerCase().includes(q) ||
        it.department.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const exportCsv = () => {
    if (!filteredItems.length) return;
    const rows = [
      ['SKU', 'Name', 'Category', 'Department', 'OnHand', 'InLaundry', 'ParLevel', 'Unit', 'UnitCostUGX'],
      ...filteredItems.map((i) => [
        i.sku,
        `"${i.name.replace(/"/g, '""')}"`,
        i.category,
        i.department,
        i.onHand,
        i.inUseOrLaundry,
        i.parLevel,
        i.unit,
        i.unitCostMinor,
      ]),
    ];
    const blob = new Blob([rows.map((r) => r.join(',')).join('\n')], { type: 'text/csv' });
    const a = Object.assign(document.createElement('a'), {
      href: URL.createObjectURL(blob),
      download: 'reberon-inventory.csv',
    });
    a.click();
  };

  return (
    <div className="fade-in">
      <PageHeader
        title="Inventory, Linen & Assets"
        actions={
          <div className="flex items-center gap-1.5">
            <Button size="md" variant="ghost" icon={<Download className="size-3.5" />} onClick={exportCsv}>
              CSV
            </Button>
            <Button
              size="md"
              variant="secondary"
              icon={<PackagePlus className="size-3.5" />}
              onClick={() => setNewSkuOpen(true)}
            >
              Add SKU
            </Button>
            <Button
              size="md"
              variant="primary"
              icon={<ArrowLeftRight className="size-3.5" />}
              onClick={() => setMoveItem(data?.items[0] ?? null)}
            >
              Stock / Laundry Move
            </Button>
          </div>
        }
      />

      {/* Compact 4-tile KPI Strip */}
      <div className="mb-4 grid grid-cols-2 gap-2.5 md:grid-cols-4">
        <div className="card flex items-center justify-between border-l-3 border-l-moss-700 px-3.5 py-2.5">
          <div>
            <span className="flex items-center gap-1 text-[11px] font-semibold text-moss-700">
              <Dumbbell className="size-3" /> Gym Towels (Moss)
            </span>
            <p className="mt-0.5 text-[1.2rem] font-bold tabular">
              {sum?.gymTowelsClean ?? 0}{' '}
              <span className="text-[11px] font-normal text-fg-muted">
                clean · {sum?.gymTowelsInUseOrLaundry ?? 0} laundry
              </span>
            </p>
          </div>
          <Pill tone="green">Gym Only</Pill>
        </div>

        <div className="card flex items-center justify-between border-l-3 border-l-info px-3.5 py-2.5">
          <div>
            <span className="flex items-center gap-1 text-[11px] font-semibold text-info">
              <BedDouble className="size-3" /> Room Towels (White)
            </span>
            <p className="mt-0.5 text-[1.2rem] font-bold tabular">
              {sum?.roomTowelsClean ?? 0}{' '}
              <span className="text-[11px] font-normal text-fg-muted">
                clean · {sum?.roomTowelsInUseOrLaundry ?? 0} laundry
              </span>
            </p>
          </div>
          <Pill tone="blue">Rooms Only</Pill>
        </div>

        <button
          type="button"
          onClick={() => setLowOnly(!lowOnly)}
          className={`card flex items-center justify-between px-3.5 py-2.5 text-left transition ${
            lowOnly ? 'ring-1 ring-warning' : ''
          }`}
        >
          <div>
            <span className="text-[11px] font-medium text-fg-muted">Low-Stock SKUs</span>
            <p className="mt-0.5 text-[1.2rem] font-bold tabular">{sum?.lowStockCount ?? 0}</p>
          </div>
          {(sum?.lowStockCount ?? 0) > 0 ? (
            <Pill tone="amber" dot>
              {lowOnly ? 'Filtered' : 'Below Par'}
            </Pill>
          ) : (
            <Pill tone="green">OK</Pill>
          )}
        </button>

        <div className="card flex items-center justify-between px-3.5 py-2.5">
          <div>
            <span className="text-[11px] font-medium text-fg-muted">Fixed Assets</span>
            <p className="mt-0.5 text-[1.2rem] font-bold tabular">{sum?.totalFixedAssets ?? 0} units</p>
          </div>
          <Pill tone="neutral">Tracked</Pill>
        </div>
      </div>

      <div className="card overflow-hidden">
        <Tabs
          className="px-3"
          value={tab}
          onChange={setTab}
          items={[
            { value: 'ALL', label: 'All SKUs', count: data?.items.length ?? 0 },
            {
              value: 'LINEN_GYM',
              label: 'Gym Linen',
              count: (data?.items ?? []).filter((i) => i.category === 'LINEN_GYM').length,
            },
            {
              value: 'LINEN_ROOM',
              label: 'Room Linen',
              count: (data?.items ?? []).filter((i) => i.category === 'LINEN_ROOM').length,
            },
            {
              value: 'CONSUMABLE',
              label: 'Consumables',
              count: (data?.items ?? []).filter((i) => i.category === 'CONSUMABLE').length,
            },
            {
              value: 'BEVERAGE',
              label: 'Beverages',
              count: (data?.items ?? []).filter((i) => i.category === 'BEVERAGE').length,
            },
            {
              value: 'FOOD_KITCHEN',
              label: 'Kitchen Store',
              count: (data?.items ?? []).filter((i) => i.category === 'FOOD_KITCHEN').length,
            },
            {
              value: 'FIXED_ASSET',
              label: 'Fixed Assets',
              count: (data?.items ?? []).filter((i) => i.category === 'FIXED_ASSET').length,
            },
            {
              value: 'MOVEMENTS',
              label: 'Ledger',
              count: data?.movements.length ?? 0,
            },
          ]}
        />

        {tab !== 'MOVEMENTS' && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-surface-2/30 px-3 py-2">
            <div className="flex items-center gap-2">
              <label className="relative w-64">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-fg-subtle" />
                <input
                  className="input !min-h-7 !py-1 pl-8 text-[12px]"
                  placeholder="Search SKU, item or location…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </label>
              <select
                className="input !min-h-7 !w-38 !py-1 text-[12px]"
                value={deptFilter}
                onChange={(e) => setDeptFilter(e.target.value)}
              >
                <option value="ALL">All Departments</option>
                <option value="HEALTH_CLUB">HEALTH_CLUB</option>
                <option value="HOUSEKEEPING">HOUSEKEEPING</option>
                <option value="KITCHEN">KITCHEN</option>
                <option value="BAR">BAR</option>
                <option value="CONFERENCE">CONFERENCE</option>
              </select>
              {lowOnly && (
                <Button size="sm" variant="ghost" onClick={() => setLowOnly(false)}>
                  Clear Low-Stock Filter
                </Button>
              )}
            </div>
            <span className="text-[11.5px] text-fg-muted">{filteredItems.length} items</span>
          </div>
        )}

        <div>
          {isLoading ? (
            <div className="p-4">
              <Skeleton className="h-56" />
            </div>
          ) : tab === 'MOVEMENTS' ? (
            !data?.movements.length ? (
              <Empty icon={<RefreshCw className="size-4" />} title="No stock movements" />
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
            <Empty icon={<Boxes className="size-4" />} title="No matching SKUs" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px] text-left text-[12.5px]">
                <thead className="border-b border-line bg-surface-2/40 text-[11px] font-semibold uppercase tracking-wider text-fg-subtle">
                  <tr>
                    <th className="px-3.5 py-2">SKU</th>
                    <th className="px-3.5 py-2">Item Name</th>
                    <th className="px-3.5 py-2">Category</th>
                    <th className="px-3.5 py-2">Dept</th>
                    <th className="px-3.5 py-2 text-right">On-Hand</th>
                    <th className="px-3.5 py-2 text-right">Laundry / Use</th>
                    <th className="px-3.5 py-2 text-right">Par</th>
                    <th className="px-3.5 py-2 text-right">Unit Cost</th>
                    <th className="px-3.5 py-2 text-right">Quick Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {filteredItems.map((it) => {
                    const isLinen = it.category === 'LINEN_GYM' || it.category === 'LINEN_ROOM';
                    return (
                      <tr key={it.id} className="align-middle hover:bg-surface-2/30">
                        <td className="px-3.5 py-2 font-mono text-[11.5px] font-semibold text-fg-subtle whitespace-nowrap">
                          {it.sku}
                        </td>
                        <td className="px-3.5 py-2">
                          <div className="flex items-center gap-1.5">
                            <span className="font-semibold text-fg">{it.name}</span>
                            {it.isLowStock && (
                              <Pill tone="amber" dot>
                                Low
                              </Pill>
                            )}
                          </div>
                          {it.location && (
                            <span className="text-[11px] text-fg-subtle">{it.location}</span>
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
                            {CATEGORY_SHORT[it.category]}
                          </Pill>
                        </td>
                        <td className="px-3.5 py-2 text-[11.5px] text-fg-muted whitespace-nowrap">
                          {it.department}
                        </td>
                        <td className="px-3.5 py-2 text-right font-mono text-[13px] font-bold tabular whitespace-nowrap">
                          {it.onHand}{' '}
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
                        <td className="px-3.5 py-2 text-right whitespace-nowrap">
                          <div className="inline-flex items-center gap-1">
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
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => setMoveItem(it)}
                            >
                              Move
                            </Button>
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

      {moveItem && (
        <RecordMovementDialog
          items={data?.items ?? []}
          initialItem={moveItem}
          open={!!moveItem}
          onClose={() => setMoveItem(null)}
          onSuccess={() => {
            setMoveItem(null);
            qc.invalidateQueries({ queryKey: ['inventory'] });
          }}
        />
      )}

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
      title="Stock / Laundry Movement"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" loading={m.isPending} onClick={() => m.mutate()}>
            Save
          </Button>
        </>
      }
    >
      <div className="grid gap-3">
        <SelectInput
          label="SKU"
          value={itemId}
          onChange={(e) => setItemId(e.target.value)}
        >
          {items.map((it) => (
            <option key={it.id} value={it.id}>
              {it.sku} · {it.name} ({it.onHand} {it.unit})
            </option>
          ))}
        </SelectInput>

        <div className="grid grid-cols-2 gap-2.5">
          <SelectInput
            label="Movement"
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
            label={`Qty (${selected.unit})`}
            type="number"
            min={1}
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
          />
        </div>

        <TextInput
          label="Reference / Note"
          placeholder="Supplier delivery or laundry batch…"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>
    </Dialog>
  );
}

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
  const [department, setDepartment] = useState<Department>('HEALTH_CLUB');
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
      <div className="grid gap-3">
        <div className="grid grid-cols-2 gap-2.5">
          <TextInput
            label="SKU Code"
            required
            placeholder="CONS-SPA-OIL"
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
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <div className="grid grid-cols-3 gap-2.5">
          <SelectInput
            label="Department"
            value={department}
            onChange={(e) => setDepartment(e.target.value as Department)}
          >
            <option value="HEALTH_CLUB">HEALTH_CLUB</option>
            <option value="HOUSEKEEPING">HOUSEKEEPING</option>
            <option value="KITCHEN">KITCHEN</option>
            <option value="BAR">BAR</option>
            <option value="CONFERENCE">CONFERENCE</option>
            <option value="FRONT_DESK">FRONT_DESK</option>
            <option value="MAINTENANCE">MAINTENANCE</option>
          </SelectInput>
          <TextInput label="Unit" value={unit} onChange={(e) => setUnit(e.target.value)} />
          <TextInput
            label="Unit Cost (UGX)"
            value={unitCostMajor}
            onChange={(e) => setUnitCostMajor(e.target.value)}
          />
        </div>
        <div className="grid grid-cols-3 gap-2.5">
          <TextInput
            label="On-Hand"
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
            label="Location"
            placeholder="Store B2"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
          />
        </div>
      </div>
    </Dialog>
  );
}
