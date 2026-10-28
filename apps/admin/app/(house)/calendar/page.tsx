'use client';

import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Ban, Calendar as CalendarIcon, Check, ChevronLeft, ChevronRight, Copy, Edit3,
  Gift, Layers, Lock, Percent, Plus, SlidersHorizontal, Sparkles, Trash2, Unlock, X,
} from 'lucide-react';
import { EXTRA_KINDS, EXTRA_UNITS, MEAL_PLANS } from '@reberon/contracts';
import { ApiError, del, get, patch, post, put } from '@/lib/api';
import { useCan } from '@/lib/providers';
import { money, toMinorStr } from '@/lib/money';
import { cn } from '@/lib/cn';
import { Button } from '@/components/ui/button';
import { Empty, PageHeader, Pill, Section, Skeleton, Status, Tabs } from '@/components/ui/bits';
import { Dialog } from '@/components/ui/dialog';
import { SelectInput, TextInput } from '@/components/ui/field';

type Day = {
  date: string;
  total: number;
  sold: number;
  held: number;
  blocked: number;
  stopSell: boolean;
  closedToArrival: boolean;
  minStay: number | null;
  note: string | null;
  rates: Record<string, { UGX: string | null; USD: string | null }>;
};

type RoomTypeRow = {
  id: string;
  name: { en?: string };
  rooms: number;
  fromPriceUgx?: string | null;
  fromPriceUsd?: string | null;
  days: Day[];
};

type Cal = {
  dates: string[];
  ratePlans: { id: string; code: string; name: { en?: string }; isActive?: boolean }[];
  roomTypes: RoomTypeRow[];
};

type RatePlanFull = {
  id: string;
  code: string;
  name: { en?: string };
  description: { en?: string };
  mealPlan: 'RO' | 'BB' | 'HB' | 'FB';
  minNights: number;
  depositPercent: number;
  cancellationPolicyId: string | null;
  isActive: boolean;
  isPublic: boolean;
  cancellationPolicy?: { id: string; name: { en?: string } } | null;
  _count?: { reservations: number };
};

type CancellationPolicy = {
  id: string;
  name: { en?: string };
  isDefault: boolean;
};

type ExtraRow = {
  id: string;
  slug: string;
  name: { en?: string };
  summary?: { en?: string };
  kind: string;
  unit: string;
  priceUgx: string;
  priceUsd: string | null;
  isExperience: boolean;
  status: 'DRAFT' | 'PUBLISHED' | 'HIDDEN';
};

type PackageRow = {
  id: string;
  slug: string;
  name: { en?: string };
  summary?: { en?: string };
  nights: number;
  priceUgx: string | null;
  priceUsd: string | null;
  inclusions?: { en?: string }[];
  status: 'DRAFT' | 'PUBLISHED' | 'HIDDEN';
};

const MEAL_LABELS: Record<string, string> = {
  RO: 'Room Only (RO)',
  BB: 'Bed & Breakfast (BB)',
  HB: 'Half Board (HB)',
  FB: 'Full Board (FB)',
};

const UNIT_LABELS: Record<string, string> = {
  PER_STAY: 'Per Stay',
  PER_NIGHT: 'Per Night',
  PER_PERSON: 'Per Person',
  PER_TRIP: 'Per Trip',
};

const iso = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (s: string, n: number) =>
  iso(new Date(Date.parse(`${s}T00:00:00Z`) + n * 86_400_000));
const DOW = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

const compact = (minor: string | null, cur: 'UGX' | 'USD') => {
  if (!minor) return '—';
  const v = cur === 'USD' ? Number(minor) / 100 : Number(minor);
  return cur === 'USD'
    ? `$${Math.round(v)}`
    : v >= 1_000_000
      ? `${(v / 1_000_000).toFixed(2).replace(/\.?0+$/, '')}M`
      : `${Math.round(v / 1000)}k`;
};

const minorToDisplayInput = (minor: string | null | undefined, cur: 'UGX' | 'USD') => {
  if (!minor) return '';
  return cur === 'USD' ? String(Number(minor) / 100) : String(Number(minor));
};

export default function CalendarPage() {
  const qc = useQueryClient();
  const can = useCan();
  const canWrite = can('rates:write');

  const [activeTab, setActiveTab] = useState<'calendar' | 'plans' | 'packages'>('calendar');
  const [from, setFrom] = useState(iso(new Date()));
  const [daysCount, setDaysCount] = useState<14 | 28 | 45>(28);
  const [planId, setPlanId] = useState('');
  const [cur, setCur] = useState<'UGX' | 'USD'>('UGX');

  // Selection state for Calendar cells
  const [sel, setSel] = useState<{ rows: string[]; a: number; b: number } | null>(null);
  const [dragging, setDragging] = useState(false);

  // Bulk Rate & Availability Wizard Modal
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkPresetMode, setBulkPresetMode] = useState<'RATES' | 'BLOCK'>('RATES');

  // Rate Plan Modal
  const [planModalOpen, setPlanModalOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState<RatePlanFull | null>(null);
  const [planForm, setPlanForm] = useState({
    code: '',
    nameEn: '',
    descEn: '',
    mealPlan: 'BB' as 'RO' | 'BB' | 'HB' | 'FB',
    minNights: '1',
    depositPercent: '30',
    cancellationPolicyId: '',
    isActive: true,
    isPublic: true,
  });

  // Queries
  const { data, isLoading } = useQuery({
    queryKey: ['calendar', from, daysCount],
    queryFn: () => get<Cal>(`/calendar?from=${from}&days=${daysCount}`),
  });

  const { data: ratePlansFull } = useQuery({
    queryKey: ['rate-plans'],
    queryFn: () => get<RatePlanFull[]>('/rate-plans'),
  });

  const { data: policies } = useQuery({
    queryKey: ['cancellation-policies'],
    queryFn: () => get<CancellationPolicy[]>('/cancellation-policies'),
  });

  const { data: extras } = useQuery({
    queryKey: ['sellables', 'extras'],
    queryFn: () => get<ExtraRow[]>('/extras'),
  });

  const { data: packages } = useQuery({
    queryKey: ['sellables', 'packages'],
    queryFn: () => get<PackageRow[]>('/packages'),
  });

  useEffect(() => {
    if (data && !planId) setPlanId(data.ratePlans[0]?.id ?? '');
  }, [data, planId]);

  useEffect(() => {
    const up = () => setDragging(false);
    window.addEventListener('mouseup', up);
    return () => window.removeEventListener('mouseup', up);
  }, []);

  const lo = sel ? Math.min(sel.a, sel.b) : -1;
  const hi = sel ? Math.max(sel.a, sel.b) : -1;
  const inSel = (row: string, i: number) =>
    !!sel && sel.rows.includes(row) && i >= lo && i <= hi;

  const plan = data?.ratePlans.find((p) => p.id === planId);

  const totals = useMemo(
    () =>
      data?.dates.map((d, i) => {
        let free = 0;
        let total = 0;
        let closed = 0;
        for (const rt of data.roomTypes) {
          const x = rt.days[i]!;
          total += x.total;
          if (x.stopSell) closed += 1;
          free += x.stopSell ? 0 : Math.max(0, x.total - x.sold - x.held - x.blocked);
        }
        return {
          d,
          free,
          total,
          closed,
          occ: total ? Math.round(((total - free) / total) * 100) : 0,
        };
      }),
    [data],
  );

  const kpiStats = useMemo(() => {
    if (!totals?.length || !data) {
      return { avgOcc: 0, todayFree: 0, todayTotal: 0, closedCells: 0 };
    }
    const avgOcc = Math.round(totals.reduce((s, t) => s + t.occ, 0) / totals.length);
    const todayStat = totals[0] ?? { free: 0, total: 0 };
    let closedCells = 0;
    for (const rt of data.roomTypes) {
      for (const d of rt.days) if (d.stopSell || d.blocked > 0) closedCells += 1;
    }
    return {
      avgOcc,
      todayFree: todayStat.free,
      todayTotal: todayStat.total,
      closedCells,
    };
  }, [totals, data]);

  // Quick month jump pills (current month + next 5 months)
  const monthJumps = useMemo(() => {
    const now = new Date();
    return Array.from({ length: 6 }, (_, idx) => {
      const dt = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + idx, 1));
      const dateStr = idx === 0 ? iso(now) : iso(dt);
      const label = dt.toLocaleString('en-GB', {
        month: 'short',
        year: '2-digit',
        timeZone: 'UTC',
      });
      return { label, dateStr, monthPrefix: iso(dt).slice(0, 7) };
    });
  }, []);

  // Rate Plan CRUD
  const openCreatePlan = () => {
    setEditingPlan(null);
    setPlanForm({
      code: '',
      nameEn: '',
      descEn: '',
      mealPlan: 'BB',
      minNights: '1',
      depositPercent: '30',
      cancellationPolicyId: policies?.find((p) => p.isDefault)?.id ?? policies?.[0]?.id ?? '',
      isActive: true,
      isPublic: true,
    });
    setPlanModalOpen(true);
  };

  const openEditPlan = (p: RatePlanFull) => {
    setEditingPlan(p);
    setPlanForm({
      code: p.code,
      nameEn: p.name?.en ?? '',
      descEn: p.description?.en ?? '',
      mealPlan: p.mealPlan,
      minNights: String(p.minNights),
      depositPercent: String(p.depositPercent),
      cancellationPolicyId: p.cancellationPolicyId ?? '',
      isActive: p.isActive,
      isPublic: p.isPublic,
    });
    setPlanModalOpen(true);
  };

  const savePlanMut = useMutation({
    mutationFn: () => {
      const payload = {
        code: planForm.code.trim().toUpperCase(),
        name: { en: planForm.nameEn.trim() },
        description: { en: planForm.descEn.trim() },
        mealPlan: planForm.mealPlan,
        minNights: Math.max(1, Number(planForm.minNights) || 1),
        depositPercent: Math.min(100, Math.max(0, Number(planForm.depositPercent) || 0)),
        cancellationPolicyId: planForm.cancellationPolicyId || null,
        isActive: planForm.isActive,
        isPublic: planForm.isPublic,
      };
      if (editingPlan) {
        return patch(`/rate-plans/${editingPlan.id}`, payload);
      }
      return post('/rate-plans', payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['rate-plans'] });
      qc.invalidateQueries({ queryKey: ['calendar'] });
      setPlanModalOpen(false);
      toast.success(editingPlan ? 'Rate plan updated' : 'Rate plan created');
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Could not save rate plan'),
  });

  const deletePlanMut = useMutation({
    mutationFn: (id: string) => del(`/rate-plans/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['rate-plans'] });
      qc.invalidateQueries({ queryKey: ['calendar'] });
      setPlanModalOpen(false);
      toast.success('Rate plan removed');
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Could not remove rate plan'),
  });

  // Get first selected cell's existing values to prefill EditPanel
  const selectedSample = useMemo(() => {
    if (!sel || !data) return null;
    const rt = data.roomTypes.find((r) => r.id === sel.rows[0]);
    const dayCell = rt?.days[lo];
    if (!rt || !dayCell) return null;
    const cellRate = dayCell.rates[planId];
    return {
      ugx: minorToDisplayInput(cellRate?.UGX ?? rt.fromPriceUgx, 'UGX'),
      usd: minorToDisplayInput(cellRate?.USD ?? rt.fromPriceUsd, 'USD'),
      baseUgx: minorToDisplayInput(rt.fromPriceUgx, 'UGX'),
      baseUsd: minorToDisplayInput(rt.fromPriceUsd, 'USD'),
      stopSell: dayCell.stopSell,
      closedToArrival: dayCell.closedToArrival,
      minStay: dayCell.minStay ? String(dayCell.minStay) : '',
      blocked: dayCell.blocked ? String(dayCell.blocked) : '',
      note: dayCell.note ?? '',
    };
  }, [sel, data, lo, planId]);

  return (
    <div className="fade-in">
      <PageHeader
        title="Calendar, Rates & Packages"
        description="Manage room inventory, seasonal & weekend rates, meal-plan rate tiers, and stay packages."
        actions={
          canWrite && (
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                icon={<Lock className="size-3.5" />}
                onClick={() => {
                  setBulkPresetMode('BLOCK');
                  setBulkOpen(true);
                }}
              >
                Block / Close Dates
              </Button>
              <Button
                variant="secondary"
                size="sm"
                icon={<SlidersHorizontal className="size-3.5" />}
                onClick={() => {
                  setBulkPresetMode('RATES');
                  setBulkOpen(true);
                }}
              >
                Bulk Rate Wizard
              </Button>
              <Button
                variant="primary"
                size="sm"
                icon={<Plus className="size-3.5" />}
                onClick={openCreatePlan}
              >
                New Rate Plan
              </Button>
            </div>
          )
        }
      />

      {/* Compact Summary Strip */}
      <div className="mb-4 grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        <div className="card px-3.5 py-2.5">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-fg-subtle">
            Rooms Free (First Night)
          </p>
          <p className="mt-1 font-mono text-lg font-bold tabular">
            {kpiStats.todayFree} <span className="text-xs font-normal text-fg-muted">/ {kpiStats.todayTotal} rooms</span>
          </p>
        </div>
        <div className="card px-3.5 py-2.5">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-fg-subtle">
            Window Occupancy ({daysCount}d)
          </p>
          <p className="mt-1 font-mono text-lg font-bold tabular">{kpiStats.avgOcc}%</p>
        </div>
        <div className="card px-3.5 py-2.5">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-fg-subtle">
            Active Rate Plans
          </p>
          <p className="mt-1 font-mono text-lg font-bold tabular">
            {ratePlansFull?.filter((p) => p.isActive).length ?? data?.ratePlans.length ?? 0}
          </p>
        </div>
        <div className="card px-3.5 py-2.5">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-fg-subtle">
            Packages & Extras
          </p>
          <p className="mt-1 font-mono text-lg font-bold tabular">
            {(packages?.length ?? 0) + (extras?.length ?? 0)}{' '}
            <span className="text-xs font-normal text-fg-muted">active items</span>
          </p>
        </div>
      </div>

      <Tabs
        className="mb-4"
        value={activeTab}
        onChange={setActiveTab}
        items={[
          { value: 'calendar', label: 'Availability & Rate Grid' },
          {
            value: 'plans',
            label: 'Rate Plans & Base Matrix',
            count: ratePlansFull?.length ?? data?.ratePlans.length,
          },
          {
            value: 'packages',
            label: 'Packages & Stay Extras',
            count: (packages?.length ?? 0) + (extras?.length ?? 0),
          },
        ]}
      />

      {activeTab === 'calendar' && (
        <div className="space-y-3">
          {/* Calendar Controls Bar */}
          <div className="card flex flex-wrap items-center justify-between gap-2.5 p-3">
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-semibold text-fg-muted">Rate Plan:</span>
                <select
                  className="input !min-h-8 !w-auto !py-1 text-xs font-semibold"
                  value={planId}
                  onChange={(e) => setPlanId(e.target.value)}
                  aria-label="Rate plan"
                >
                  {data?.ratePlans.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name.en} ({p.code})
                    </option>
                  ))}
                </select>
              </div>

              <div className="inline-flex rounded-lg border border-line-strong bg-surface-2 p-0.5 text-xs font-semibold">
                {(['UGX', 'USD'] as const).map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setCur(c)}
                    className={cn(
                      'rounded-md px-2.5 py-1 transition',
                      cur === c ? 'bg-surface text-fg shadow-2xs' : 'text-fg-muted hover:text-fg',
                    )}
                  >
                    {c}
                  </button>
                ))}
              </div>

              <div className="inline-flex rounded-lg border border-line-strong bg-surface-2 p-0.5 text-xs font-semibold">
                {([14, 28, 45] as const).map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => {
                      setDaysCount(d);
                      setSel(null);
                    }}
                    className={cn(
                      'rounded-md px-2 py-1 transition',
                      daysCount === d ? 'bg-surface text-fg shadow-2xs' : 'text-fg-muted hover:text-fg',
                    )}
                  >
                    {d}d
                  </button>
                ))}
              </div>
            </div>

            {/* Month Pills & Date Jump */}
            <div className="flex flex-wrap items-center gap-1.5">
              <div className="hidden items-center gap-1 xl:flex">
                {monthJumps.map((m) => (
                  <button
                    key={m.label}
                    type="button"
                    onClick={() => {
                      setFrom(m.dateStr);
                      setSel(null);
                    }}
                    className={cn(
                      'rounded-md border px-2 py-1 text-[11px] font-semibold transition',
                      from.startsWith(m.monthPrefix)
                        ? 'border-fg bg-fg text-bg'
                        : 'border-line bg-surface text-fg-muted hover:text-fg',
                    )}
                  >
                    {m.label}
                  </button>
                ))}
              </div>

              <input
                type="date"
                className="input !min-h-8 !w-auto !py-1 text-xs"
                value={from}
                onChange={(e) => {
                  if (e.target.value) {
                    setFrom(e.target.value);
                    setSel(null);
                  }
                }}
                aria-label="Jump to date"
              />
              <Button
                size="icon"
                aria-label="Earlier"
                onClick={() => {
                  setFrom(addDays(from, -daysCount));
                  setSel(null);
                }}
              >
                <ChevronLeft className="size-4" />
              </Button>
              <Button
                size="sm"
                onClick={() => {
                  setFrom(iso(new Date()));
                  setSel(null);
                }}
              >
                Today
              </Button>
              <Button
                size="icon"
                aria-label="Later"
                onClick={() => {
                  setFrom(addDays(from, daysCount));
                  setSel(null);
                }}
              >
                <ChevronRight className="size-4" />
              </Button>
            </div>
          </div>

          {isLoading || !data ? (
            <Skeleton className="h-96" />
          ) : (
            <div className="card overflow-x-auto select-none">
              <table className="w-full border-separate border-spacing-0 text-[12px]">
                <thead>
                  <tr>
                    <th className="sticky left-0 z-20 min-w-52 border-b border-r border-line bg-surface px-3.5 py-2.5 text-left">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold">
                          {new Date(`${from}T12:00:00Z`).toLocaleString('en-GB', {
                            month: 'long',
                            year: 'numeric',
                            timeZone: 'UTC',
                          })}
                        </span>
                        {canWrite && (
                          <button
                            type="button"
                            onClick={() =>
                              setSel({
                                rows: data.roomTypes.map((r) => r.id),
                                a: 0,
                                b: data.dates.length - 1,
                              })
                            }
                            className="rounded border border-line-strong bg-surface-2 px-1.5 py-0.5 text-[10.5px] font-semibold text-fg hover:bg-fg hover:text-bg"
                            title="Select all rooms & dates in view"
                          >
                            Select All
                          </button>
                        )}
                      </div>
                    </th>
                    {data.dates.map((d, colIdx) => {
                      const dt = new Date(`${d}T12:00:00Z`);
                      const wk = [5, 6].includes(dt.getUTCDay());
                      const isToday = d === iso(new Date());
                      return (
                        <th
                          key={d}
                          onClick={() => {
                            if (!canWrite) return;
                            setSel({
                              rows: data.roomTypes.map((r) => r.id),
                              a: colIdx,
                              b: colIdx,
                            });
                          }}
                          title="Click to edit all room types for this date"
                          className={cn(
                            'min-w-[3.6rem] cursor-pointer border-b border-line px-1 py-1.5 text-center font-medium transition hover:bg-surface-2',
                            wk && 'bg-surface-2/60',
                            isToday && 'bg-fg text-bg',
                          )}
                        >
                          <span
                            className={cn(
                              'block text-[10px] uppercase',
                              isToday ? 'text-bg/80' : 'text-fg-subtle',
                            )}
                          >
                            {DOW[dt.getUTCDay()]}
                          </span>
                          <span className="font-mono font-bold tabular">{dt.getUTCDate()}</span>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {data.roomTypes.map((rt) => (
                    <tr key={rt.id} className="group">
                      <th className="sticky left-0 z-10 border-b border-r border-line bg-surface px-3.5 py-2.5 text-left">
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <span className="block truncate font-semibold text-fg">
                              {rt.name.en}
                            </span>
                            <span className="text-[11px] font-normal text-fg-subtle">
                              {rt.rooms} room{rt.rooms === 1 ? '' : 's'} · Base{' '}
                              {compact(
                                cur === 'USD' ? (rt.fromPriceUsd ?? null) : (rt.fromPriceUgx ?? null),
                                cur,
                              )}
                            </span>
                          </div>
                          {canWrite && (
                            <button
                              type="button"
                              onClick={() =>
                                setSel({
                                  rows: [rt.id],
                                  a: 0,
                                  b: data.dates.length - 1,
                                })
                              }
                              className="shrink-0 rounded border border-line bg-surface-2 px-1.5 py-0.5 text-[10px] font-semibold text-fg-muted hover:border-fg hover:text-fg"
                              title={`Select all ${daysCount} nights for ${rt.name.en}`}
                            >
                              Row
                            </button>
                          )}
                        </div>
                      </th>
                      {rt.days.map((x, i) => {
                        const free = x.stopSell
                          ? 0
                          : Math.max(0, x.total - x.sold - x.held - x.blocked);
                        const ratio = x.total ? free / x.total : 0;
                        const wk = [5, 6].includes(new Date(`${x.date}T12:00:00Z`).getUTCDay());
                        const price = x.rates[planId]?.[cur] ?? null;
                        const selected = inSel(rt.id, i);
                        return (
                          <td
                            key={x.date}
                            onMouseDown={() => {
                              if (!canWrite) return;
                              setDragging(true);
                              setSel({ rows: [rt.id], a: i, b: i });
                            }}
                            onMouseEnter={() =>
                              dragging &&
                              sel &&
                              setSel({
                                rows: sel.rows.includes(rt.id)
                                  ? sel.rows
                                  : [...sel.rows, rt.id],
                                a: sel.a,
                                b: i,
                              })
                            }
                            title={`${x.date}: ${free} of ${x.total} free · ${x.sold} sold · ${x.held} held · ${x.blocked} blocked${x.minStay ? ` · min ${x.minStay} nights` : ''}${x.note ? ` · ${x.note}` : ''}`}
                            className={cn(
                              'relative h-14 cursor-pointer border-b border-l border-line px-1 text-center align-middle transition-colors hover:bg-surface-2',
                              wk && 'bg-surface-2/40',
                              selected && '!bg-surface-2 outline-2 -outline-offset-2 outline-fg',
                            )}
                            style={
                              x.stopSell
                                ? {
                                    backgroundImage:
                                      'repeating-linear-gradient(135deg, transparent 0 5px, color-mix(in oklab, var(--danger) 14%, transparent) 5px 7px)',
                                  }
                                : undefined
                            }
                          >
                            <span
                              className={cn(
                                'mx-auto block w-fit rounded px-1.5 py-0.5 text-[10.5px] font-bold tabular',
                                x.stopSell
                                  ? 'bg-danger/15 text-danger'
                                  : ratio === 0
                                    ? 'bg-danger/15 text-danger'
                                    : ratio < 0.5
                                      ? 'bg-warning/15 text-warning'
                                      : 'bg-success/15 text-success',
                              )}
                            >
                              {x.stopSell ? 'Closed' : `${free}/${x.total}`}
                            </span>
                            <span
                              className={cn(
                                'mt-1 block font-mono text-[11.5px] font-semibold tabular',
                                price ? 'text-fg' : 'text-fg-subtle',
                              )}
                            >
                              {compact(price, cur)}
                            </span>
                            {(x.minStay || x.closedToArrival || x.blocked > 0) && (
                              <span className="absolute right-0.5 top-0.5 rounded bg-surface-2 px-0.5 font-mono text-[9px] font-bold text-fg-muted">
                                {x.closedToArrival ? '⇥' : ''}
                                {x.minStay ? `${x.minStay}n` : ''}
                                {x.blocked > 0 ? `·${x.blocked}b` : ''}
                              </span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                  <tr className="bg-surface-2/40">
                    <th className="sticky left-0 z-10 border-r border-line bg-surface px-3.5 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-fg-subtle">
                      Daily Occupancy
                    </th>
                    {totals?.map((tt) => (
                      <td
                        key={tt.d}
                        className="border-l border-line/60 px-1 py-2 text-center font-mono text-[11px] font-semibold tabular text-fg-muted"
                      >
                        {tt.occ}%
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-fg-muted">
            <p>
              <strong>Tip:</strong> Click any cell, drag across dates, click <strong>Row</strong> to select a whole room type, or click a <strong>Date Header</strong> to edit all rooms on that day.
            </p>
            <p>
              <code>⇥</code> = No arrivals · <code>2n</code> = Min stay · <code>1b</code> = Blocked room
            </p>
          </div>
        </div>
      )}

      {activeTab === 'plans' && (
        <div className="space-y-4">
          {/* Standard Rates Matrix & Quick Apply */}
          <Section
            title="Room Types & Rate Plans Overview"
            description="Compare standard room rates and quickly apply seasonal or plan rates across any date period."
            actions={
              canWrite && (
                <Button
                  size="sm"
                  variant="primary"
                  icon={<SlidersHorizontal className="size-3.5" />}
                  onClick={() => {
                    setBulkPresetMode('RATES');
                    setBulkOpen(true);
                  }}
                >
                  Bulk Set Rates Across Dates
                </Button>
              )
            }
          >
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-line bg-surface-2/50 text-[11px] font-semibold uppercase tracking-wider text-fg-subtle">
                  <tr>
                    <th className="px-3.5 py-2.5">Room Category</th>
                    <th className="px-3.5 py-2.5">Physical Rooms</th>
                    <th className="px-3.5 py-2.5">Base Rate (UGX)</th>
                    <th className="px-3.5 py-2.5">Base Rate (USD)</th>
                    {data?.ratePlans.map((rp) => (
                      <th key={rp.id} className="px-3.5 py-2.5">
                        {rp.name.en} ({rp.code})
                      </th>
                    ))}
                    <th className="px-3.5 py-2.5 text-right">Quick Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {data?.roomTypes.map((rt) => {
                    const todayCell = rt.days[0];
                    return (
                      <tr key={rt.id} className="hover:bg-surface-2/30">
                        <td className="px-3.5 py-3 font-semibold text-fg">{rt.name.en}</td>
                        <td className="px-3.5 py-3 font-mono">{rt.rooms} rooms</td>
                        <td className="px-3.5 py-3 font-mono font-semibold">
                          {rt.fromPriceUgx ? money(rt.fromPriceUgx, 'UGX') : '—'}
                        </td>
                        <td className="px-3.5 py-3 font-mono font-semibold">
                          {rt.fromPriceUsd ? money(rt.fromPriceUsd, 'USD') : '—'}
                        </td>
                        {data.ratePlans.map((rp) => {
                          const r = todayCell?.rates[rp.id];
                          return (
                            <td key={rp.id} className="px-3.5 py-3 font-mono">
                              <span className="block font-semibold">
                                {r?.UGX ? money(r.UGX, 'UGX') : '—'}
                              </span>
                              {r?.USD && (
                                <span className="text-[11px] text-fg-muted">
                                  {money(r.USD, 'USD')}
                                </span>
                              )}
                            </td>
                          );
                        })}
                        <td className="px-3.5 py-3 text-right">
                          {canWrite && (
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => {
                                setActiveTab('calendar');
                                setSel({
                                  rows: [rt.id],
                                  a: 0,
                                  b: (data?.dates.length ?? 1) - 1,
                                });
                              }}
                            >
                              Edit Window Rates
                            </Button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Section>

          {/* Rate Plans Directory */}
          <Section
            title="Rate Plans & Meal Tiers"
            description="Configure Bed & Breakfast, Half Board, Full Board, Room Only and special corporate or promotional rate plans."
            actions={
              canWrite && (
                <Button
                  size="sm"
                  variant="primary"
                  icon={<Plus className="size-3.5" />}
                  onClick={openCreatePlan}
                >
                  New Rate Plan
                </Button>
              )
            }
          >
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {(ratePlansFull ?? []).map((rp) => (
                <div
                  key={rp.id}
                  className="card flex flex-col justify-between p-4 transition hover:border-line-strong"
                >
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <span className="rounded border border-line-strong bg-surface-2 px-1.5 py-0.5 font-mono text-[11px] font-bold">
                          {rp.code}
                        </span>
                        <h3 className="mt-1.5 text-sm font-bold text-fg">{rp.name?.en}</h3>
                      </div>
                      <Pill tone={rp.isActive ? 'green' : 'neutral'} dot>
                        {rp.isActive ? 'Active' : 'Inactive'}
                      </Pill>
                    </div>
                    {rp.description?.en && (
                      <p className="mt-1 text-xs text-fg-muted">{rp.description.en}</p>
                    )}

                    <dl className="mt-3 grid grid-cols-2 gap-2 border-t border-line pt-2.5 text-xs">
                      <div>
                        <dt className="text-[11px] text-fg-subtle">Meal Plan</dt>
                        <dd className="font-semibold">{MEAL_LABELS[rp.mealPlan] ?? rp.mealPlan}</dd>
                      </div>
                      <div>
                        <dt className="text-[11px] text-fg-subtle">Deposit Required</dt>
                        <dd className="font-mono font-semibold">{rp.depositPercent}%</dd>
                      </div>
                      <div>
                        <dt className="text-[11px] text-fg-subtle">Min Stay</dt>
                        <dd className="font-mono font-semibold">
                          {rp.minNights} night{rp.minNights === 1 ? '' : 's'}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-[11px] text-fg-subtle">Visibility</dt>
                        <dd className="font-semibold">
                          {rp.isPublic ? 'Public Website & Desk' : 'Front Desk Only'}
                        </dd>
                      </div>
                    </dl>
                  </div>

                  {canWrite && (
                    <div className="mt-3 flex items-center justify-between border-t border-line pt-2.5">
                      <span className="text-[11px] text-fg-subtle">
                        {rp._count?.reservations ?? 0} bookings
                      </span>
                      <div className="flex items-center gap-1.5">
                        <Button
                          size="sm"
                          variant="secondary"
                          icon={<Edit3 className="size-3" />}
                          onClick={() => openEditPlan(rp)}
                        >
                          Edit Plan
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </Section>
        </div>
      )}

      {activeTab === 'packages' && (
        <PackagesAndExtrasManager
          canWrite={canWrite}
          extras={extras ?? []}
          packages={packages ?? []}
          onRefresh={() => qc.invalidateQueries({ queryKey: ['sellables'] })}
        />
      )}

      {/* Floating / Drawer Selection Editor for Calendar Grid */}
      {sel && data && selectedSample && (
        <EditPanel
          sel={{ rows: sel.rows, from: data.dates[lo]!, to: data.dates[hi]! }}
          sample={selectedSample}
          planId={planId}
          planName={plan?.name.en ?? ''}
          allPlans={data.ratePlans}
          names={Object.fromEntries(data.roomTypes.map((r) => [r.id, r.name.en ?? '']))}
          onClose={() => setSel(null)}
          onDone={() => {
            qc.invalidateQueries({ queryKey: ['calendar'] });
            setSel(null);
          }}
        />
      )}

      {/* Bulk Rate & Availability Wizard Modal */}
      {data && (
        <BulkRateWizardModal
          open={bulkOpen}
          initialMode={bulkPresetMode}
          onClose={() => setBulkOpen(false)}
          roomTypes={data.roomTypes}
          ratePlans={data.ratePlans}
          defaultPlanId={planId || data.ratePlans[0]?.id || ''}
          onDone={() => {
            qc.invalidateQueries({ queryKey: ['calendar'] });
            setBulkOpen(false);
          }}
        />
      )}

      {/* Create / Edit Rate Plan Modal */}
      <Dialog
        open={planModalOpen}
        onClose={() => setPlanModalOpen(false)}
        size="md"
        title={editingPlan ? `Edit Rate Plan · ${editingPlan.name?.en}` : 'Create Rate Plan'}
        description="Define meal inclusions, deposit rules, minimum nights and website visibility."
      >
        <form
          className="grid gap-3.5"
          onSubmit={(e) => {
            e.preventDefault();
            savePlanMut.mutate();
          }}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <TextInput
              label="Plan Code (Short ID)"
              placeholder="e.g. BB, HB, FB, CORP"
              value={planForm.code}
              onChange={(e) => setPlanForm({ ...planForm, code: e.target.value.toUpperCase() })}
            />
            <SelectInput
              label="Meal Plan Included"
              value={planForm.mealPlan}
              onChange={(e) =>
                setPlanForm({
                  ...planForm,
                  mealPlan: e.target.value as 'RO' | 'BB' | 'HB' | 'FB',
                })
              }
            >
              {MEAL_PLANS.map((mp) => (
                <option key={mp} value={mp}>
                  {MEAL_LABELS[mp] ?? mp}
                </option>
              ))}
            </SelectInput>
          </div>

          <TextInput
            label="Rate Plan Name"
            placeholder="e.g. Half Board (Breakfast & Dinner)"
            value={planForm.nameEn}
            onChange={(e) => setPlanForm({ ...planForm, nameEn: e.target.value })}
          />

          <TextInput
            label="Guest Description"
            placeholder="Includes Highland breakfast and three-course evening dinner."
            value={planForm.descEn}
            onChange={(e) => setPlanForm({ ...planForm, descEn: e.target.value })}
          />

          <div className="grid gap-3 sm:grid-cols-3">
            <TextInput
              label="Minimum Stay (Nights)"
              inputMode="numeric"
              value={planForm.minNights}
              onChange={(e) => setPlanForm({ ...planForm, minNights: e.target.value })}
            />
            <TextInput
              label="Deposit Required (%)"
              inputMode="numeric"
              value={planForm.depositPercent}
              onChange={(e) => setPlanForm({ ...planForm, depositPercent: e.target.value })}
            />
            <SelectInput
              label="Cancellation Policy"
              value={planForm.cancellationPolicyId}
              onChange={(e) =>
                setPlanForm({ ...planForm, cancellationPolicyId: e.target.value })
              }
            >
              <option value="">Default policy</option>
              {(policies ?? []).map((cp) => (
                <option key={cp.id} value={cp.id}>
                  {cp.name?.en ?? 'Policy'}
                </option>
              ))}
            </SelectInput>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex items-center gap-2 rounded-lg border border-line bg-surface-2/50 px-3 py-2 text-xs font-medium">
              <input
                type="checkbox"
                checked={planForm.isActive}
                onChange={(e) => setPlanForm({ ...planForm, isActive: e.target.checked })}
              />
              Active (Can be booked)
            </label>
            <label className="flex items-center gap-2 rounded-lg border border-line bg-surface-2/50 px-3 py-2 text-xs font-medium">
              <input
                type="checkbox"
                checked={planForm.isPublic}
                onChange={(e) => setPlanForm({ ...planForm, isPublic: e.target.checked })}
              />
              Visible on Public Website
            </label>
          </div>

          <div className="flex items-center justify-between pt-2">
            {editingPlan ? (
              <Button
                type="button"
                variant="danger"
                size="sm"
                loading={deletePlanMut.isPending}
                onClick={() => deletePlanMut.mutate(editingPlan.id)}
              >
                Delete / Archive Plan
              </Button>
            ) : (
              <span />
            )}
            <div className="flex items-center gap-2">
              <Button type="button" variant="ghost" onClick={() => setPlanModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" loading={savePlanMut.isPending}>
                {editingPlan ? 'Save Rate Plan' : 'Create Rate Plan'}
              </Button>
            </div>
          </div>
        </form>
      </Dialog>
    </div>
  );
}

/* ───────────────────────── Pre-Filled Selection Editor Panel ───────────────────────── */

function EditPanel({
  sel,
  sample,
  planId,
  planName,
  allPlans,
  names,
  onClose,
  onDone,
}: {
  sel: { rows: string[]; from: string; to: string };
  sample: {
    ugx: string;
    usd: string;
    baseUgx: string;
    baseUsd: string;
    stopSell: boolean;
    closedToArrival: boolean;
    minStay: string;
    blocked: string;
    note: string;
  };
  planId: string;
  planName: string;
  allPlans: { id: string; code: string; name: { en?: string } }[];
  names: Record<string, string>;
  onClose: () => void;
  onDone: () => void;
}) {
  const [ugx, setUgx] = useState(sample.ugx);
  const [usd, setUsd] = useState(sample.usd);
  const [applyAllPlans, setApplyAllPlans] = useState(false);
  const [weekdays, setWeekdays] = useState([0, 1, 2, 3, 4, 5, 6]);
  const [stopSell, setStopSell] = useState<boolean | null>(null);
  const [cta, setCta] = useState<boolean | null>(null);
  const [minStay, setMinStay] = useState(sample.minStay);
  const [blocked, setBlocked] = useState(sample.blocked);
  const [note, setNote] = useState(sample.note);

  useEffect(() => {
    setUgx(sample.ugx);
    setUsd(sample.usd);
    setMinStay(sample.minStay);
    setBlocked(sample.blocked);
    setNote(sample.note);
    setStopSell(null);
    setCta(null);
  }, [sel.from, sel.to, sel.rows.join(','), planId]);

  const nights = Math.round((Date.parse(sel.to) - Date.parse(sel.from)) / 86_400_000) + 1;

  const adjustByPercent = (pct: number) => {
    if (ugx && !Number.isNaN(Number(ugx))) {
      const nextUgx = Math.round((Number(ugx) * (100 + pct)) / 100 / 1000) * 1000;
      setUgx(String(nextUgx));
    }
    if (usd && !Number.isNaN(Number(usd))) {
      const nextUsd = Math.round((Number(usd) * (100 + pct)) / 100);
      setUsd(String(nextUsd));
    }
  };

  const m = useMutation({
    mutationFn: async () => {
      const u = ugx.trim() ? toMinorStr(ugx.trim(), 'UGX') : undefined;
      const d = usd.trim() ? toMinorStr(usd.trim(), 'USD') : undefined;
      const out: string[] = [];
      const targetPlans = applyAllPlans ? allPlans.map((p) => p.id) : [planId];

      if (u || d) {
        let totalUpdated = 0;
        for (const pid of targetPlans) {
          const r = await put<{ updated: number }>('/rates', {
            ratePlanId: pid,
            roomTypeIds: sel.rows,
            from: sel.from,
            to: sel.to,
            weekdays,
            ...(u ? { ugx: u } : {}),
            ...(d ? { usd: d } : {}),
          });
          totalUpdated += r.updated;
        }
        out.push(`${totalUpdated} rate cells`);
      }
      if (
        stopSell !== null ||
        cta !== null ||
        minStay !== sample.minStay ||
        blocked !== sample.blocked ||
        note !== sample.note
      ) {
        const r = await patch<{ updated: number }>('/inventory', {
          roomTypeIds: sel.rows,
          from: sel.from,
          to: sel.to,
          ...(stopSell !== null ? { stopSell } : {}),
          ...(cta !== null ? { closedToArrival: cta } : {}),
          ...(minStay !== sample.minStay
            ? { minStay: !minStay || minStay === '1' ? null : Number(minStay) }
            : {}),
          ...(blocked !== sample.blocked ? { blockedRooms: Number(blocked) || 0 } : {}),
          ...(note !== sample.note ? { note: note.trim() || null } : {}),
        });
        out.push(`${r.updated} inventory nights`);
      }
      if (!out.length) throw new Error('Change a price or availability setting first');
      return out.join(' and ');
    },
    onSuccess: (s) => {
      toast.success(`Updated ${s}`);
      onDone();
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : (e as Error).message),
  });

  const Tri = ({
    label,
    value,
    set,
  }: {
    label: string;
    value: boolean | null;
    set: (v: boolean | null) => void;
  }) => (
    <div className="flex items-center justify-between gap-3 text-xs">
      <span className="font-medium">{label}</span>
      <span className="inline-flex rounded-lg border border-line-strong bg-surface-2 p-0.5 text-[11px] font-semibold">
        {(
          [
            [null, 'Keep'],
            [true, 'Yes'],
            [false, 'No'],
          ] as const
        ).map(([v, l]) => (
          <button
            key={l}
            type="button"
            onClick={() => set(v)}
            className={cn(
              'rounded-md px-2.5 py-1',
              value === v ? 'bg-fg text-bg' : 'text-fg-muted hover:text-fg',
            )}
          >
            {l}
          </button>
        ))}
      </span>
    </div>
  );

  return (
    <div className="fixed inset-x-3 bottom-3 z-40 mx-auto max-w-4xl rounded-2xl border border-line-strong bg-surface p-5 shadow-[var(--shadow-lift)] fade-in">
      <div className="mb-3.5 flex flex-wrap items-start justify-between gap-3 border-b border-line pb-3">
        <div>
          <p className="text-sm font-bold">
            Editing {nights} night{nights > 1 ? 's' : ''} ({sel.from} → {sel.to})
          </p>
          <p className="text-xs text-fg-muted">
            Rooms: <strong>{sel.rows.map((r) => names[r]).join(', ')}</strong> · Plan:{' '}
            <strong>{applyAllPlans ? 'All Rate Plans' : planName}</strong>
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="grid size-8 place-items-center rounded-full hover:bg-surface-2"
        >
          <X className="size-4" />
        </button>
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        {/* Left: Pricing & Quick % Adjustments */}
        <div className="grid content-start gap-3">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-bold uppercase tracking-wider text-fg-subtle">
              Nightly Rate ({applyAllPlans ? 'All Plans' : planName})
            </p>
            <label className="flex items-center gap-1.5 text-[11px] font-semibold">
              <input
                type="checkbox"
                checked={applyAllPlans}
                onChange={(e) => setApplyAllPlans(e.target.checked)}
              />
              Apply to all rate plans
            </label>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <TextInput
              label="UGX per night"
              inputMode="numeric"
              placeholder="e.g. 250000"
              value={ugx}
              onChange={(e) => setUgx(e.target.value)}
            />
            <TextInput
              label="USD per night"
              inputMode="decimal"
              placeholder="e.g. 70"
              value={usd}
              onChange={(e) => setUsd(e.target.value)}
            />
          </div>

          {/* Quick % Adjusters */}
          <div className="flex flex-wrap items-center gap-1">
            <span className="mr-1 text-[11px] font-semibold text-fg-muted">Quick adjust:</span>
            {[-15, -10, +10, +15, +20].map((pct) => (
              <button
                key={pct}
                type="button"
                onClick={() => adjustByPercent(pct)}
                className="rounded border border-line-strong bg-surface-2 px-2 py-0.5 font-mono text-[11px] font-semibold hover:bg-fg hover:text-bg"
              >
                {pct > 0 ? `+${pct}%` : `${pct}%`}
              </button>
            ))}
            {sample.baseUgx && (
              <button
                type="button"
                onClick={() => {
                  setUgx(sample.baseUgx);
                  setUsd(sample.baseUsd);
                }}
                className="rounded border border-line bg-surface-2 px-2 py-0.5 text-[11px] font-semibold text-fg-muted hover:text-fg"
              >
                Base Rate
              </button>
            )}
          </div>

          {/* Days of Week Filter */}
          <div>
            <div className="mb-1.5 flex items-center justify-between text-[11px]">
              <span className="font-semibold text-fg-muted">Apply to Days:</span>
              <div className="flex gap-1.5">
                <button
                  type="button"
                  onClick={() => setWeekdays([0, 1, 2, 3, 4, 5, 6])}
                  className="font-semibold underline"
                >
                  All
                </button>
                <button
                  type="button"
                  onClick={() => setWeekdays([0, 1, 2, 3, 4])}
                  className="font-semibold underline"
                >
                  Weekdays
                </button>
                <button
                  type="button"
                  onClick={() => setWeekdays([5, 6])}
                  className="font-semibold underline"
                >
                  Fri–Sat
                </button>
              </div>
            </div>
            <div className="flex flex-wrap gap-1">
              {DOW.map((d, i) => (
                <button
                  key={d}
                  type="button"
                  onClick={() =>
                    setWeekdays(
                      weekdays.includes(i)
                        ? weekdays.filter((x) => x !== i)
                        : [...weekdays, i],
                    )
                  }
                  className={cn(
                    'rounded-md border px-2.5 py-1 text-xs font-semibold transition',
                    weekdays.includes(i)
                      ? 'border-fg bg-fg text-bg'
                      : 'border-line bg-surface text-fg-muted',
                  )}
                >
                  {d}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Right: Inventory & Restrictions */}
        <div className="grid content-start gap-2.5">
          <p className="text-[11px] font-bold uppercase tracking-wider text-fg-subtle">
            Availability & Restrictions
          </p>
          <Tri label="Stop selling (Close room)" value={stopSell} set={setStopSell} />
          <Tri label="Closed to arrival (No check-in)" value={cta} set={setCta} />
          <div className="grid grid-cols-2 gap-2.5">
            <TextInput
              label="Minimum stay (nights)"
              inputMode="numeric"
              placeholder="1"
              value={minStay}
              onChange={(e) => setMinStay(e.target.value)}
            />
            <TextInput
              label="Blocked rooms"
              inputMode="numeric"
              placeholder="0"
              value={blocked}
              onChange={(e) => setBlocked(e.target.value)}
            />
          </div>
          <TextInput
            label="Date Note (Internal)"
            placeholder="e.g. Marathon weekend, maintenance…"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between border-t border-line pt-3">
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="secondary"
            icon={<Lock className="size-3.5" />}
            onClick={() => setStopSell(true)}
          >
            Quick Close Dates
          </Button>
          <Button
            size="sm"
            variant="secondary"
            icon={<Unlock className="size-3.5" />}
            onClick={() => {
              setStopSell(false);
              setBlocked('0');
            }}
          >
            Re-Open Dates
          </Button>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" loading={m.isPending} onClick={() => m.mutate()}>
            Apply Changes
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ───────────────────────── Bulk Rate & Season Wizard Modal ───────────────────────── */

function BulkRateWizardModal({
  open,
  initialMode,
  onClose,
  roomTypes,
  ratePlans,
  defaultPlanId,
  onDone,
}: {
  open: boolean;
  initialMode: 'RATES' | 'BLOCK';
  onClose: () => void;
  roomTypes: RoomTypeRow[];
  ratePlans: { id: string; code: string; name: { en?: string } }[];
  defaultPlanId: string;
  onDone: () => void;
}) {
  const today = iso(new Date());
  const [fromDate, setFromDate] = useState(today);
  const [toDate, setToDate] = useState(addDays(today, 30));
  const [selectedRooms, setSelectedRooms] = useState<string[]>(roomTypes.map((r) => r.id));
  const [selectedPlanId, setSelectedPlanId] = useState<string>(defaultPlanId || 'ALL');
  const [weekdays, setWeekdays] = useState([0, 1, 2, 3, 4, 5, 6]);
  const [ugx, setUgx] = useState('');
  const [usd, setUsd] = useState('');
  const [stopSell, setStopSell] = useState<boolean | null>(initialMode === 'BLOCK' ? true : null);
  const [minStay, setMinStay] = useState('');
  const [blocked, setBlocked] = useState('');
  const [note, setNote] = useState('');

  useEffect(() => {
    if (open) {
      setSelectedRooms(roomTypes.map((r) => r.id));
      setSelectedPlanId(defaultPlanId || ratePlans[0]?.id || 'ALL');
      setStopSell(initialMode === 'BLOCK' ? true : null);
    }
  }, [open, initialMode, roomTypes, defaultPlanId, ratePlans]);

  const applyRangePreset = (daysAhead: number) => {
    setFromDate(today);
    setToDate(addDays(today, daysAhead));
  };

  const toggleRoom = (id: string) => {
    setSelectedRooms((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const m = useMutation({
    mutationFn: async () => {
      if (!selectedRooms.length) throw new Error('Select at least one room category');
      const u = ugx.trim() ? toMinorStr(ugx.trim(), 'UGX') : undefined;
      const d = usd.trim() ? toMinorStr(usd.trim(), 'USD') : undefined;
      const out: string[] = [];

      if (u || d) {
        const planIds =
          selectedPlanId === 'ALL' ? ratePlans.map((p) => p.id) : [selectedPlanId];
        let count = 0;
        for (const pid of planIds) {
          const r = await put<{ updated: number }>('/rates', {
            ratePlanId: pid,
            roomTypeIds: selectedRooms,
            from: fromDate,
            to: toDate,
            weekdays,
            ...(u ? { ugx: u } : {}),
            ...(d ? { usd: d } : {}),
          });
          count += r.updated;
        }
        out.push(`${count} prices`);
      }

      if (stopSell !== null || minStay.trim() || blocked.trim() || note.trim()) {
        const r = await patch<{ updated: number }>('/inventory', {
          roomTypeIds: selectedRooms,
          from: fromDate,
          to: toDate,
          ...(stopSell !== null ? { stopSell } : {}),
          ...(minStay.trim()
            ? { minStay: minStay.trim() === '1' ? null : Number(minStay.trim()) }
            : {}),
          ...(blocked.trim() ? { blockedRooms: Number(blocked.trim()) } : {}),
          ...(note.trim() ? { note: note.trim() } : {}),
        });
        out.push(`${r.updated} inventory nights`);
      }

      if (!out.length) throw new Error('Enter a price or availability restriction to apply');
      return out.join(' and ');
    },
    onSuccess: (msg) => {
      toast.success(`Bulk update complete: ${msg}`);
      onDone();
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : (e as Error).message),
  });

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="lg"
      title={
        initialMode === 'BLOCK'
          ? 'Block Rooms or Close Dates'
          : 'Bulk Rate & Season Manager'
      }
      description="Apply weekday/weekend prices, seasonal rates or room closures across any date range without dragging."
    >
      <div className="grid gap-4">
        {/* 1. Date Range + Quick Presets */}
        <div className="rounded-xl border border-line bg-surface-2/40 p-3.5">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-fg-subtle">
              1. Date Range
            </span>
            <div className="flex flex-wrap gap-1">
              {[
                ['Next 14d', 14],
                ['Next 30d', 30],
                ['Next 90d', 90],
                ['Next 6 Months', 180],
                ['Full Year (365d)', 365],
              ].map(([label, days]) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => applyRangePreset(Number(days))}
                  className="rounded border border-line-strong bg-surface px-2 py-0.5 text-[11px] font-semibold hover:bg-fg hover:text-bg"
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <TextInput
              label="From Date"
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
            />
            <TextInput
              label="To Date (Inclusive)"
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
            />
          </div>
        </div>

        {/* 2. Room Categories */}
        <div className="rounded-xl border border-line bg-surface-2/40 p-3.5">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-fg-subtle">
              2. Room Categories ({selectedRooms.length} selected)
            </span>
            <button
              type="button"
              onClick={() =>
                setSelectedRooms(
                  selectedRooms.length === roomTypes.length
                    ? []
                    : roomTypes.map((r) => r.id),
                )
              }
              className="text-xs font-semibold underline"
            >
              {selectedRooms.length === roomTypes.length ? 'Clear all' : 'Select all'}
            </button>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {roomTypes.map((rt) => {
              const checked = selectedRooms.includes(rt.id);
              return (
                <label
                  key={rt.id}
                  className={cn(
                    'flex cursor-pointer items-center justify-between rounded-lg border px-3 py-2 text-xs transition',
                    checked
                      ? 'border-fg bg-surface font-semibold'
                      : 'border-line bg-surface/50 text-fg-muted',
                  )}
                >
                  <span className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleRoom(rt.id)}
                    />
                    {rt.name.en}
                  </span>
                  <span className="font-mono text-[11px] text-fg-subtle">
                    Base: {compact(rt.fromPriceUgx ?? null, 'UGX')}
                  </span>
                </label>
              );
            })}
          </div>
        </div>

        {/* 3. Rates & Days of Week */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-xl border border-line bg-surface-2/40 p-3.5">
            <span className="mb-2 block text-xs font-bold uppercase tracking-wider text-fg-subtle">
              3. Rate Plan & Nightly Price
            </span>
            <div className="grid gap-2.5">
              <SelectInput
                label="Target Rate Plan"
                value={selectedPlanId}
                onChange={(e) => setSelectedPlanId(e.target.value)}
              >
                <option value="ALL">All Rate Plans</option>
                {ratePlans.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name.en} ({p.code})
                  </option>
                ))}
              </SelectInput>
              <div className="grid grid-cols-2 gap-2">
                <TextInput
                  label="Price (UGX)"
                  inputMode="numeric"
                  placeholder="e.g. 250000"
                  value={ugx}
                  onChange={(e) => setUgx(e.target.value)}
                />
                <TextInput
                  label="Price (USD)"
                  inputMode="decimal"
                  placeholder="e.g. 70"
                  value={usd}
                  onChange={(e) => setUsd(e.target.value)}
                />
              </div>
              <div>
                <div className="mb-1 flex items-center justify-between text-[11px]">
                  <span className="font-semibold text-fg-muted">Days of Week</span>
                  <div className="flex gap-1.5">
                    <button
                      type="button"
                      onClick={() => setWeekdays([0, 1, 2, 3, 4, 5, 6])}
                      className="underline"
                    >
                      All
                    </button>
                    <button
                      type="button"
                      onClick={() => setWeekdays([0, 1, 2, 3, 4])}
                      className="underline"
                    >
                      Sun–Thu
                    </button>
                    <button
                      type="button"
                      onClick={() => setWeekdays([5, 6])}
                      className="underline"
                    >
                      Fri–Sat
                    </button>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1">
                  {DOW.map((d, i) => (
                    <button
                      key={d}
                      type="button"
                      onClick={() =>
                        setWeekdays(
                          weekdays.includes(i)
                            ? weekdays.filter((x) => x !== i)
                            : [...weekdays, i],
                        )
                      }
                      className={cn(
                        'rounded border px-2 py-0.5 text-[11px] font-semibold',
                        weekdays.includes(i)
                          ? 'border-fg bg-fg text-bg'
                          : 'border-line bg-surface text-fg-muted',
                      )}
                    >
                      {d}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* 4. Restrictions & Room Blocking */}
          <div className="rounded-xl border border-line bg-surface-2/40 p-3.5">
            <span className="mb-2 block text-xs font-bold uppercase tracking-wider text-fg-subtle">
              4. Inventory & Restrictions
            </span>
            <div className="grid gap-2.5">
              <SelectInput
                label="Sale Status (Stop-Sell)"
                value={stopSell === null ? 'KEEP' : stopSell ? 'CLOSE' : 'OPEN'}
                onChange={(e) =>
                  setStopSell(
                    e.target.value === 'KEEP' ? null : e.target.value === 'CLOSE',
                  )
                }
              >
                <option value="KEEP">Keep current status</option>
                <option value="OPEN">Open for sale</option>
                <option value="CLOSE">Stop selling (Close dates)</option>
              </SelectInput>
              <div className="grid grid-cols-2 gap-2">
                <TextInput
                  label="Min Stay (Nights)"
                  inputMode="numeric"
                  placeholder="e.g. 2"
                  value={minStay}
                  onChange={(e) => setMinStay(e.target.value)}
                />
                <TextInput
                  label="Blocked Rooms"
                  inputMode="numeric"
                  placeholder="e.g. 1"
                  value={blocked}
                  onChange={(e) => setBlocked(e.target.value)}
                />
              </div>
              <TextInput
                label="Reason / Date Note"
                placeholder="e.g. Peak festive season, maintenance…"
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" loading={m.isPending} onClick={() => m.mutate()}>
            Apply Bulk Update
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

/* ───────────────────────── Packages & Stay Extras Manager ───────────────────────── */

export function PackagesAndExtrasManager({
  canWrite,
  extras,
  packages,
  onRefresh,
}: {
  canWrite: boolean;
  extras: ExtraRow[];
  packages: PackageRow[];
  onRefresh: () => void;
}) {
  const [extraModal, setExtraModal] = useState<ExtraRow | 'new' | null>(null);
  const [pkgModal, setPkgModal] = useState<PackageRow | 'new' | null>(null);

  const [ef, setEf] = useState({
    nameEn: '',
    slug: '',
    summaryEn: '',
    kind: 'OTHER',
    unit: 'PER_STAY',
    priceUgx: '',
    priceUsd: '',
    isExperience: false,
    status: 'PUBLISHED' as 'DRAFT' | 'PUBLISHED' | 'HIDDEN',
  });

  const [pf, setPf] = useState({
    nameEn: '',
    slug: '',
    summaryEn: '',
    nights: '2',
    priceUgx: '',
    priceUsd: '',
    inclusionsText: '',
    status: 'PUBLISHED' as 'DRAFT' | 'PUBLISHED' | 'HIDDEN',
  });

  const slugify = (s: string) =>
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');

  const openExtra = (r: ExtraRow | 'new') => {
    setExtraModal(r);
    if (r === 'new') {
      setEf({
        nameEn: '',
        slug: '',
        summaryEn: '',
        kind: 'EXPERIENCE',
        unit: 'PER_PERSON',
        priceUgx: '',
        priceUsd: '',
        isExperience: true,
        status: 'PUBLISHED',
      });
    } else {
      setEf({
        nameEn: r.name?.en ?? '',
        slug: r.slug,
        summaryEn: r.summary?.en ?? '',
        kind: r.kind,
        unit: r.unit,
        priceUgx: minorToDisplayInput(r.priceUgx, 'UGX'),
        priceUsd: minorToDisplayInput(r.priceUsd, 'USD'),
        isExperience: r.isExperience,
        status: r.status,
      });
    }
  };

  const openPkg = (r: PackageRow | 'new') => {
    setPkgModal(r);
    if (r === 'new') {
      setPf({
        nameEn: '',
        slug: '',
        summaryEn: '',
        nights: '2',
        priceUgx: '',
        priceUsd: '',
        inclusionsText: 'Guided Sipi Falls hike\nFull Highland breakfast & dinner\nPrivate coffee roasting session',
        status: 'PUBLISHED',
      });
    } else {
      setPf({
        nameEn: r.name?.en ?? '',
        slug: r.slug,
        summaryEn: r.summary?.en ?? '',
        nights: String(r.nights),
        priceUgx: minorToDisplayInput(r.priceUgx, 'UGX'),
        priceUsd: minorToDisplayInput(r.priceUsd, 'USD'),
        inclusionsText: (r.inclusions ?? [])
          .map((inc) => inc.en ?? '')
          .filter(Boolean)
          .join('\n'),
        status: r.status,
      });
    }
  };

  const saveExtraMut = useMutation({
    mutationFn: () => {
      const payload = {
        name: { en: ef.nameEn.trim() },
        slug: ef.slug.trim() || slugify(ef.nameEn),
        summary: { en: ef.summaryEn.trim() },
        kind: ef.kind,
        unit: ef.unit,
        priceUgx: toMinorStr(ef.priceUgx.trim() || '0', 'UGX'),
        priceUsd: ef.priceUsd.trim() ? toMinorStr(ef.priceUsd.trim(), 'USD') : null,
        isExperience: ef.isExperience,
        status: ef.status,
      };
      if (extraModal === 'new') return post('/extras', payload);
      return patch(`/extras/${(extraModal as ExtraRow).id}`, payload);
    },
    onSuccess: () => {
      toast.success('Extra saved');
      setExtraModal(null);
      onRefresh();
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Could not save extra'),
  });

  const deleteExtraMut = useMutation({
    mutationFn: (id: string) => del(`/extras/${id}`),
    onSuccess: () => {
      toast.success('Extra deleted');
      setExtraModal(null);
      onRefresh();
    },
  });

  const savePkgMut = useMutation({
    mutationFn: () => {
      const inclusions = pf.inclusionsText
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
        .map((en) => ({ en }));
      const payload = {
        name: { en: pf.nameEn.trim() },
        slug: pf.slug.trim() || slugify(pf.nameEn),
        summary: { en: pf.summaryEn.trim() },
        nights: Math.max(1, Number(pf.nights) || 1),
        priceUgx: pf.priceUgx.trim() ? toMinorStr(pf.priceUgx.trim(), 'UGX') : null,
        priceUsd: pf.priceUsd.trim() ? toMinorStr(pf.priceUsd.trim(), 'USD') : null,
        inclusions,
        status: pf.status,
      };
      if (pkgModal === 'new') return post('/packages', payload);
      return patch(`/packages/${(pkgModal as PackageRow).id}`, payload);
    },
    onSuccess: () => {
      toast.success('Package saved');
      setPkgModal(null);
      onRefresh();
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Could not save package'),
  });

  const deletePkgMut = useMutation({
    mutationFn: (id: string) => del(`/packages/${id}`),
    onSuccess: () => {
      toast.success('Package deleted');
      setPkgModal(null);
      onRefresh();
    },
  });

  return (
    <div className="grid gap-4">
      {/* 1. Curated Multi-Night Stay Packages */}
      <Section
        title="Stay Packages & Bundles"
        description="Multi-night bundles with included meals, guided hikes or spa treatments."
        actions={
          canWrite && (
            <Button
              size="sm"
              variant="primary"
              icon={<Plus className="size-3.5" />}
              onClick={() => openPkg('new')}
            >
              New Package
            </Button>
          )
        }
      >
        {!packages.length ? (
          <Empty icon={<Gift className="size-4" />} title="No packages created yet" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-line bg-surface-2/50 text-[11px] font-semibold uppercase tracking-wider text-fg-subtle">
                <tr>
                  <th className="px-3.5 py-2.5">Package Name</th>
                  <th className="px-3.5 py-2.5">Duration</th>
                  <th className="px-3.5 py-2.5">Added Price (UGX)</th>
                  <th className="px-3.5 py-2.5">Added Price (USD)</th>
                  <th className="px-3.5 py-2.5">Status</th>
                  <th className="px-3.5 py-2.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {packages.map((p) => (
                  <tr key={p.id} className="hover:bg-surface-2/30">
                    <td className="px-3.5 py-3">
                      <p className="font-semibold text-fg">{p.name?.en}</p>
                      {p.summary?.en && (
                        <p className="line-clamp-1 text-[11px] text-fg-muted">{p.summary.en}</p>
                      )}
                    </td>
                    <td className="px-3.5 py-3 font-mono font-semibold">
                      {p.nights} night{p.nights === 1 ? '' : 's'}
                    </td>
                    <td className="px-3.5 py-3 font-mono font-semibold">
                      {p.priceUgx ? money(p.priceUgx, 'UGX') : '—'}
                    </td>
                    <td className="px-3.5 py-3 font-mono font-semibold">
                      {p.priceUsd ? money(p.priceUsd, 'USD') : '—'}
                    </td>
                    <td className="px-3.5 py-3">
                      <Status value={p.status} />
                    </td>
                    <td className="px-3.5 py-3 text-right">
                      <Button size="sm" variant="secondary" onClick={() => openPkg(p)}>
                        Edit
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      {/* 2. Stay Add-Ons & Checkout Extras */}
      <Section
        title="Stay Extras & Experiences"
        description="Optional add-ons guests or front-desk staff can attach to a reservation (transfers, guided walks, extra bed)."
        actions={
          canWrite && (
            <Button
              size="sm"
              variant="primary"
              icon={<Plus className="size-3.5" />}
              onClick={() => openExtra('new')}
            >
              New Extra
            </Button>
          )
        }
      >
        {!extras.length ? (
          <Empty icon={<Sparkles className="size-4" />} title="No extras configured" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-line bg-surface-2/50 text-[11px] font-semibold uppercase tracking-wider text-fg-subtle">
                <tr>
                  <th className="px-3.5 py-2.5">Extra / Experience</th>
                  <th className="px-3.5 py-2.5">Category & Billing Unit</th>
                  <th className="px-3.5 py-2.5">Price (UGX)</th>
                  <th className="px-3.5 py-2.5">Price (USD)</th>
                  <th className="px-3.5 py-2.5">Status</th>
                  <th className="px-3.5 py-2.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {extras.map((e) => (
                  <tr key={e.id} className="hover:bg-surface-2/30">
                    <td className="px-3.5 py-3">
                      <p className="font-semibold text-fg">{e.name?.en}</p>
                      {e.summary?.en && (
                        <p className="line-clamp-1 text-[11px] text-fg-muted">{e.summary.en}</p>
                      )}
                    </td>
                    <td className="px-3.5 py-3">
                      <span className="capitalize">{e.kind.toLowerCase().replace('_', ' ')}</span> ·{' '}
                      <span className="text-fg-muted">{UNIT_LABELS[e.unit] ?? e.unit}</span>
                    </td>
                    <td className="px-3.5 py-3 font-mono font-semibold">
                      {e.priceUgx ? money(e.priceUgx, 'UGX') : '—'}
                    </td>
                    <td className="px-3.5 py-3 font-mono font-semibold">
                      {e.priceUsd ? money(e.priceUsd, 'USD') : '—'}
                    </td>
                    <td className="px-3.5 py-3">
                      <Status value={e.status} />
                    </td>
                    <td className="px-3.5 py-3 text-right">
                      <Button size="sm" variant="secondary" onClick={() => openExtra(e)}>
                        Edit
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      {/* Extra Modal */}
      <Dialog
        open={!!extraModal}
        onClose={() => setExtraModal(null)}
        size="md"
        title={extraModal === 'new' ? 'New Stay Extra / Add-On' : `Edit Extra · ${ef.nameEn}`}
      >
        <form
          className="grid gap-3.5"
          onSubmit={(e) => {
            e.preventDefault();
            saveExtraMut.mutate();
          }}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <TextInput
              label="Extra Name"
              placeholder="e.g. Sipi Falls Guided Sunset Hike"
              value={ef.nameEn}
              onChange={(e) =>
                setEf({
                  ...ef,
                  nameEn: e.target.value,
                  slug: extraModal === 'new' ? slugify(e.target.value) : ef.slug,
                })
              }
            />
            <TextInput
              label="Slug (Short ID)"
              placeholder="sipi-falls-hike"
              value={ef.slug}
              onChange={(e) => setEf({ ...ef, slug: e.target.value })}
            />
          </div>

          <TextInput
            label="Summary for Guests"
            placeholder="Private guide, park fees and packed highland refreshments included."
            value={ef.summaryEn}
            onChange={(e) => setEf({ ...ef, summaryEn: e.target.value })}
          />

          <div className="grid gap-3 sm:grid-cols-2">
            <SelectInput
              label="Category"
              value={ef.kind}
              onChange={(e) => setEf({ ...ef, kind: e.target.value })}
            >
              {EXTRA_KINDS.map((k) => (
                <option key={k} value={k}>
                  {k.replace('_', ' ')}
                </option>
              ))}
            </SelectInput>
            <SelectInput
              label="How It Is Charged"
              value={ef.unit}
              onChange={(e) => setEf({ ...ef, unit: e.target.value })}
            >
              {EXTRA_UNITS.map((u) => (
                <option key={u} value={u}>
                  {UNIT_LABELS[u] ?? u}
                </option>
              ))}
            </SelectInput>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <TextInput
              label="Price (UGX)"
              inputMode="numeric"
              placeholder="e.g. 85000"
              value={ef.priceUgx}
              onChange={(e) => setEf({ ...ef, priceUgx: e.target.value })}
            />
            <TextInput
              label="Price (USD Optional)"
              inputMode="decimal"
              placeholder="e.g. 25"
              value={ef.priceUsd}
              onChange={(e) => setEf({ ...ef, priceUsd: e.target.value })}
            />
            <SelectInput
              label="Visibility"
              value={ef.status}
              onChange={(e) =>
                setEf({
                  ...ef,
                  status: e.target.value as 'DRAFT' | 'PUBLISHED' | 'HIDDEN',
                })
              }
            >
              <option value="PUBLISHED">Offered at Checkout</option>
              <option value="HIDDEN">Hidden</option>
            </SelectInput>
          </div>

          <label className="flex items-center gap-2 rounded-lg border border-line bg-surface-2/50 px-3 py-2 text-xs font-medium">
            <input
              type="checkbox"
              checked={ef.isExperience}
              onChange={(e) => setEf({ ...ef, isExperience: e.target.checked })}
            />
            Highlight as a Signature Highland Experience (guided walk, coffee tour, waterfall trek)
          </label>

          <div className="flex items-center justify-between pt-2">
            {extraModal && extraModal !== 'new' ? (
              <Button
                type="button"
                variant="danger"
                size="sm"
                loading={deleteExtraMut.isPending}
                onClick={() => deleteExtraMut.mutate((extraModal as ExtraRow).id)}
              >
                Delete Extra
              </Button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button type="button" variant="ghost" onClick={() => setExtraModal(null)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" loading={saveExtraMut.isPending}>
                Save Extra
              </Button>
            </div>
          </div>
        </form>
      </Dialog>

      {/* Package Modal */}
      <Dialog
        open={!!pkgModal}
        onClose={() => setPkgModal(null)}
        size="md"
        title={pkgModal === 'new' ? 'New Stay Package' : `Edit Package · ${pf.nameEn}`}
      >
        <form
          className="grid gap-3.5"
          onSubmit={(e) => {
            e.preventDefault();
            savePkgMut.mutate();
          }}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <TextInput
              label="Package Name"
              placeholder="e.g. Mount Elgon Weekend Escape"
              value={pf.nameEn}
              onChange={(e) =>
                setPf({
                  ...pf,
                  nameEn: e.target.value,
                  slug: pkgModal === 'new' ? slugify(e.target.value) : pf.slug,
                })
              }
            />
            <TextInput
              label="Slug (Address)"
              placeholder="elgon-weekend-escape"
              value={pf.slug}
              onChange={(e) => setPf({ ...pf, slug: e.target.value })}
            />
          </div>

          <TextInput
            label="Package Summary"
            placeholder="Two nights of highland calm with guided Sipi trek and private dining."
            value={pf.summaryEn}
            onChange={(e) => setPf({ ...pf, summaryEn: e.target.value })}
          />

          <div className="grid gap-3 sm:grid-cols-4">
            <TextInput
              label="Nights"
              inputMode="numeric"
              value={pf.nights}
              onChange={(e) => setPf({ ...pf, nights: e.target.value })}
            />
            <TextInput
              label="Added Price (UGX)"
              inputMode="numeric"
              placeholder="e.g. 220000"
              value={pf.priceUgx}
              onChange={(e) => setPf({ ...pf, priceUgx: e.target.value })}
            />
            <TextInput
              label="Added Price (USD)"
              inputMode="decimal"
              placeholder="e.g. 65"
              value={pf.priceUsd}
              onChange={(e) => setPf({ ...pf, priceUsd: e.target.value })}
            />
            <SelectInput
              label="Status"
              value={pf.status}
              onChange={(e) =>
                setPf({
                  ...pf,
                  status: e.target.value as 'DRAFT' | 'PUBLISHED' | 'HIDDEN',
                })
              }
            >
              <option value="PUBLISHED">Published</option>
              <option value="DRAFT">Draft</option>
              <option value="HIDDEN">Hidden</option>
            </SelectInput>
          </div>

          <label className="grid gap-1">
            <span className="label">Included Highlights (One per line)</span>
            <textarea
              className="input"
              rows={4}
              placeholder="Guided Sipi Falls hike&#10;Evening fireplace dinner&#10;Airport / Mbale transfer"
              value={pf.inclusionsText}
              onChange={(e) => setPf({ ...pf, inclusionsText: e.target.value })}
            />
          </label>

          <div className="flex items-center justify-between pt-2">
            {pkgModal && pkgModal !== 'new' ? (
              <Button
                type="button"
                variant="danger"
                size="sm"
                loading={deletePkgMut.isPending}
                onClick={() => deletePkgMut.mutate((pkgModal as PackageRow).id)}
              >
                Delete Package
              </Button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button type="button" variant="ghost" onClick={() => setPkgModal(null)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" loading={savePkgMut.isPending}>
                Save Package
              </Button>
            </div>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
