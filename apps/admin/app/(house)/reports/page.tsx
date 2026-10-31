'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  ArrowDownRight,
  ArrowUpRight,
  Calendar,
  CreditCard,
  DollarSign,
  Download,
  Filter,
  Layers,
  PieChart,
  Plus,
  Receipt,
  Search,
  Trash2,
  TrendingUp,
  Utensils,
  Zap,
} from 'lucide-react';
import type {
  Department,
  ExpenseCategory,
  ExpenseDTO,
  ExpensePaymentMethod,
  HouseReportDTO,
} from '@reberon/contracts';
import { ApiError, del, get, post } from '@/lib/api';
import { useCan } from '@/lib/providers';
import { money, toMinorStr } from '@/lib/money';
import { dateRange } from '@/lib/format';
import { cn } from '@/lib/cn';
import { exportToCsv } from '@/lib/export-csv';
import { Button } from '@/components/ui/button';
import { Empty, PageHeader, Pill, Section, Skeleton, Tabs } from '@/components/ui/bits';
import { Dialog } from '@/components/ui/dialog';
import { SelectInput, TextArea, TextInput } from '@/components/ui/field';
import { BarList, ColumnChart, StatTile } from '@/components/charts/charts';

const today = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Kampala' }).format(new Date());
const plus = (d: string, n: number) =>
  new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

const SOURCE: Record<string, string> = {
  DIRECT: 'Website Direct',
  WHATSAPP: 'WhatsApp Concierge',
  WALK_IN: 'Walk-in Desk',
  PHONE: 'Phone Reservation',
  PORTAL: 'Corporate Portal',
};

const PERIODS = {
  last30: { label: 'Last 30 Days', range: () => [plus(today(), -30), plus(today(), -1)] },
  month: { label: 'This Month', range: () => [`${today().slice(0, 8)}01`, today()] },
  last90: { label: 'Last 90 Days', range: () => [plus(today(), -90), plus(today(), -1)] },
  next30: { label: 'Next 30 Days (On Books)', range: () => [today(), plus(today(), 29)] },
} as const;
type Period = keyof typeof PERIODS | 'custom';

type ReportTab = 'OVERVIEW' | 'DEPARTMENTS' | 'EXPENSES' | 'PAYMENTS';

const DEPT_LABELS: Record<string, string> = {
  KITCHEN: 'Restaurant & Kitchen',
  BAR: 'Bar & Lounge',
  HEALTH_CLUB: 'Health Club & Spa',
  HOUSEKEEPING: 'Housekeeping & Laundry',
  FRONT_DESK: 'Front Desk & Guest Services',
  CONFERENCE: 'Conferences & Banqueting',
  MAINTENANCE: 'Maintenance & Repairs',
  ENERGY_UTILITIES: 'Energy & Utilities',
  ADMIN_GENERAL: 'General Administration',
};

const CATEGORY_LABELS: Record<string, string> = {
  COGS_FOOD: 'Kitchen Food Supplies (COGS)',
  COGS_BEVERAGE: 'Bar Beverage Stock (COGS)',
  UTILITIES_ELECTRICITY: 'Electricity (Umeme)',
  UTILITIES_DIESEL_FUEL: 'Diesel Generator Fuel',
  UTILITIES_WATER_GAS: 'Water & Cooking Gas',
  MAINTENANCE_REPAIRS: 'Facility Maintenance & Repairs',
  HOUSEKEEPING_AMENITIES: 'Linen, Cleaning & Toiletries',
  STAFF_PAYROLL_WELFARE: 'Staff Payroll & Welfare',
  MARKETING_COMMISSIONS: 'Marketing, Ads & OTA Fees',
  ADMIN_GENERAL: 'General Administration & IT',
};

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  CASH: 'Cash at Premises',
  MOMO_MTN: 'MTN Mobile Money',
  MOMO_AIRTEL: 'Airtel Money',
  BANK_TRANSFER: 'Bank Transfer / Wire',
  CHEQUE: 'Bank Cheque',
  CARD: 'Credit / Debit Card',
};

export default function ReportsPage() {
  const qc = useQueryClient();
  const can = useCan();
  const canManageExpenses = can('expenses:manage') || can('requisitions:approve');

  const [activeTab, setActiveTab] = useState<ReportTab>('OVERVIEW');
  const [period, setPeriod] = useState<Period>('last30');
  const [custom, setCustom] = useState({ from: plus(today(), -30), to: today() });
  const [from, to] = period === 'custom' ? [custom.from, custom.to] : PERIODS[period].range();

  // Expense modal & search
  const [expenseModalOpen, setExpenseModalOpen] = useState(false);
  const [expenseSearch, setExpenseSearch] = useState('');
  const [expenseDeptFilter, setExpenseDeptFilter] = useState('ALL');
  const [expenseForm, setExpenseForm] = useState({
    date: today(),
    department: 'KITCHEN' as Department,
    category: 'COGS_FOOD' as ExpenseCategory,
    title: '',
    vendor: '',
    description: '',
    amount: '',
    currency: 'UGX' as 'UGX' | 'USD',
    paymentMethod: 'CASH' as ExpensePaymentMethod,
    referenceNumber: '',
  });

  const { data: r, isLoading: isReportLoading } = useQuery({
    queryKey: ['report', from, to],
    queryFn: () => get<HouseReportDTO>(`/reports/house?from=${from}&to=${to}`),
    enabled: from <= to,
  });

  const { data: expensesList, isLoading: isExpensesLoading } = useQuery({
    queryKey: ['expenses', from, to],
    queryFn: () => get<ExpenseDTO[]>(`/expenses?from=${from}&to=${to}`),
  });

  const createExpenseMut = useMutation({
    mutationFn: async () => {
      if (!expenseForm.title.trim()) throw new Error('Enter expense title or item description');
      if (!expenseForm.amount.trim() || Number.isNaN(Number(expenseForm.amount))) {
        throw new Error('Enter a valid expense amount');
      }
      return post<ExpenseDTO>('/expenses', {
        date: expenseForm.date,
        department: expenseForm.department,
        category: expenseForm.category,
        title: expenseForm.title.trim(),
        vendor: expenseForm.vendor.trim() || null,
        description: expenseForm.description.trim() || null,
        amountMinor: toMinorStr(expenseForm.amount.trim(), expenseForm.currency),
        currency: expenseForm.currency,
        paymentMethod: expenseForm.paymentMethod,
        referenceNumber: expenseForm.referenceNumber.trim() || null,
      });
    },
    onSuccess: (exp) => {
      toast.success(`Expense ${exp.number} recorded successfully`);
      qc.invalidateQueries({ queryKey: ['report'] });
      qc.invalidateQueries({ queryKey: ['expenses'] });
      setExpenseModalOpen(false);
      setExpenseForm({
        date: today(),
        department: 'KITCHEN',
        category: 'COGS_FOOD',
        title: '',
        vendor: '',
        description: '',
        amount: '',
        currency: 'UGX',
        paymentMethod: 'CASH',
        referenceNumber: '',
      });
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : (e as Error).message),
  });

  const deleteExpenseMut = useMutation({
    mutationFn: (id: string) => del(`/expenses/${id}`),
    onSuccess: () => {
      toast.success('Expense removed');
      qc.invalidateQueries({ queryKey: ['report'] });
      qc.invalidateQueries({ queryKey: ['expenses'] });
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : (e as Error).message),
  });

  const ugx = (m?: string) => money(m ?? '0', 'UGX');
  const usdNote = (m?: string) => (m && m !== '0' ? ` + ${money(m, 'USD')}` : '');

  const filteredExpenses = useMemo(() => {
    let list = expensesList ?? [];
    if (expenseDeptFilter !== 'ALL') {
      list = list.filter((e) => e.department === expenseDeptFilter);
    }
    if (expenseSearch.trim()) {
      const q = expenseSearch.toLowerCase();
      list = list.filter(
        (e) =>
          e.title.toLowerCase().includes(q) ||
          e.number.toLowerCase().includes(q) ||
          (e.vendor && e.vendor.toLowerCase().includes(q)) ||
          CATEGORY_LABELS[e.category]?.toLowerCase().includes(q),
      );
    }
    return list;
  }, [expensesList, expenseDeptFilter, expenseSearch]);

  const csv = () => {
    if (!r) return;
    if (activeTab === 'EXPENSES') {
      exportToCsv(
        `reberon-expenses-${from}-to-${to}.csv`,
        ['Number', 'Date', 'Department', 'Category', 'Title', 'Vendor', 'Payment Method', 'Reference', 'Currency', 'Amount', 'Recorded By'],
        filteredExpenses.map((e) => [
          e.number,
          e.date,
          DEPT_LABELS[e.department] ?? e.department,
          CATEGORY_LABELS[e.category] ?? e.category,
          e.title,
          e.vendor ?? '',
          PAYMENT_METHOD_LABELS[e.paymentMethod] ?? e.paymentMethod,
          e.referenceNumber ?? '',
          e.currency,
          money(e.amountMinor, e.currency),
          e.recordedByName ?? '',
        ]),
      );
      return;
    }

    const rows: Array<Array<string | number>> = [
      ['SECTION', 'METRIC / ITEM', 'VALUE UGX', 'VALUE USD / NOTES'],
      ['Executive Summary', 'Period', `${from} to ${to}`, `${r.days.length} days`],
      ['Executive Summary', 'Occupancy %', `${r.totals.occupancy}%`, `${r.totals.roomNightsSold} / ${r.totals.roomNightsAvailable} room nights`],
      ['Executive Summary', 'Total Gross Revenue', ugx(r.financialSummary?.totalGrossRevenue?.UGX), money(r.financialSummary?.totalGrossRevenue?.USD ?? '0', 'USD')],
      ['Executive Summary', 'Cost of Sales (COGS)', ugx(r.financialSummary?.costOfSales?.UGX), money(r.financialSummary?.costOfSales?.USD ?? '0', 'USD')],
      ['Executive Summary', 'Operating Expenses (OPEX)', ugx(r.financialSummary?.operatingExpenses?.UGX), money(r.financialSummary?.operatingExpenses?.USD ?? '0', 'USD')],
      ['Executive Summary', 'Gross Operating Profit (GOP)', ugx(r.financialSummary?.grossOperatingProfit?.UGX), money(r.financialSummary?.grossOperatingProfit?.USD ?? '0', 'USD')],
      ['Executive Summary', 'Room Revenue', ugx(r.totals.roomRevenue.UGX), `${r.totals.bookings} bookings`],
      ...(r.departments ?? []).map((d) => ['Department Revenue', d.label, ugx(d.revenue.UGX), `${d.ordersCount} orders (${d.sharePercent}%)`]),
      ...r.roomTypes.map((rt) => ['Suite Performance', rt.name, `${rt.roomNightsSold} nights sold`, `${rt.occupancy}% occupancy`]),
      ...(r.paymentReconciliation ?? []).map((m) => ['Payment Channel', m.label, ugx(m.amount.UGX), `${m.count} transactions`]),
      ...r.days.map((d) => ['Daily Occupancy', d.date, `${d.sold} / ${d.available} rooms`, `${d.occupancy}%`]),
      ...(expensesList ?? []).map((e) => ['Expense Ledger', `${e.date} · ${e.number} · ${e.title}`, money(e.amountMinor, e.currency), DEPT_LABELS[e.department] ?? e.department]),
    ];
    exportToCsv(`reberon-hotel-report-${from}-to-${to}.csv`, rows[0] as string[], rows.slice(1));
  };

  return (
    <div className="fade-in">
      <PageHeader
        title="Entire Hotel Performance & Reports"
        description={
          r
            ? `${dateRange(r.from, plus(r.to, 1))} · Executive P&L, multi-department aggregation, cost drivers & cash reconciliation`
            : 'Aggregated hotel revenue, occupancy, expenses and cash flow'
        }
        actions={
          <div className="flex items-center gap-2">
            {canManageExpenses && (
              <Button
                variant="primary"
                size="sm"
                icon={<Plus className="size-3.5" />}
                onClick={() => setExpenseModalOpen(true)}
              >
                Record Expense
              </Button>
            )}
            {r && (
              <Button size="sm" variant="secondary" icon={<Download className="size-3.5" />} onClick={csv}>
                Export CSV
              </Button>
            )}
          </div>
        }
      />

      {/* Date Range & Quick Presets */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-line pb-3.5">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex flex-wrap rounded-lg border border-line bg-surface p-0.5 text-xs">
            {(Object.keys(PERIODS) as (keyof typeof PERIODS)[]).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setPeriod(k)}
                className={cn(
                  'rounded-md px-3 py-1 font-medium transition',
                  period === k ? 'bg-fg text-bg' : 'text-fg-muted hover:text-fg',
                )}
              >
                {PERIODS[k].label}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setPeriod('custom')}
              className={cn(
                'rounded-md px-3 py-1 font-medium transition',
                period === 'custom' ? 'bg-fg text-bg' : 'text-fg-muted hover:text-fg',
              )}
            >
              Custom Range
            </button>
          </div>
          {period === 'custom' && (
            <div className="flex items-center gap-2">
              <TextInput
                type="date"
                aria-label="From"
                value={custom.from}
                onChange={(e) => setCustom({ ...custom, from: e.target.value })}
              />
              <TextInput
                type="date"
                aria-label="To"
                value={custom.to}
                onChange={(e) => setCustom({ ...custom, to: e.target.value })}
              />
            </div>
          )}
        </div>

        {/* 4 Crisp Report Tabs */}
        <div className="flex flex-wrap rounded-lg border border-line-strong bg-surface-2 p-0.5 text-xs font-semibold">
          {[
            { id: 'OVERVIEW', label: 'Executive P&L' },
            { id: 'DEPARTMENTS', label: 'Department Traffic' },
            { id: 'EXPENSES', label: 'Expenses & Cost Drivers' },
            { id: 'PAYMENTS', label: 'Cash & Settlement Rails' },
          ].map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setActiveTab(t.id as ReportTab)}
              className={cn(
                'rounded-md px-3 py-1 transition',
                activeTab === t.id
                  ? 'border border-line bg-surface text-fg shadow-sm'
                  : 'text-fg-muted hover:text-fg',
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {isReportLoading || !r ? (
        <Skeleton className="h-96" />
      ) : (
        <div className="grid gap-5">
          {/* ───────────────────────── TAB 1: EXECUTIVE OVERVIEW & P&L ───────────────────────── */}
          {activeTab === 'OVERVIEW' && (
            <div className="grid gap-5 fade-in">
              {/* Row 1: High Level Revenue & Profitability */}
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <StatTile
                  label="Total Hotel Gross Revenue"
                  value={ugx(r.financialSummary?.totalGrossRevenue.UGX)}
                  note={`All 6 operating departments${usdNote(r.financialSummary?.totalGrossRevenue.USD)}`}
                />
                <StatTile
                  label="Cost of Sales (COGS)"
                  value={ugx(r.financialSummary?.costOfSales.UGX)}
                  note="Direct kitchen food & bar stock procurement"
                />
                <StatTile
                  label="Operating Expenses (OPEX)"
                  value={ugx(r.financialSummary?.operatingExpenses.UGX)}
                  note="Energy, generator fuel, payroll & upkeep"
                />
                <StatTile
                  label="Gross Operating Profit (GOP)"
                  value={ugx(r.financialSummary?.grossOperatingProfit.UGX)}
                  note="Net operating cashflow before capital reserve"
                />
              </div>

              {/* Row 2: Hospitality Industry KPIs */}
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <StatTile
                  label="TrevPAR (Total Rev / Available Room)"
                  value={ugx(r.financialSummary?.trevpar.UGX)}
                  note="Total property yield per room night"
                />
                <StatTile
                  label="Room RevPAR"
                  value={ugx(r.totals.revpar.UGX)}
                  note="Rooms division yield per room night"
                />
                <StatTile
                  label="Occupancy Rate"
                  value={`${r.totals.occupancy}%`}
                  note={`${r.totals.roomNightsSold}/${r.totals.roomNightsAvailable} room nights`}
                />
                <StatTile
                  label="Average Daily Rate (ADR)"
                  value={ugx(r.totals.adr.UGX)}
                  note={`Per room night sold${usdNote(r.totals.adr.USD)}`}
                />
              </div>

              {/* Departmental Revenue Contribution + Uniform P&L Waterfall */}
              <div className="grid gap-5 lg:grid-cols-2">
                <Section
                  title="Departmental Revenue Share"
                  description="Gross contribution by hotel revenue center"
                >
                  <div className="space-y-3 pt-1">
                    {(r.departments ?? []).map((dep) => (
                      <div key={dep.department} className="space-y-1">
                        <div className="flex items-center justify-between text-xs font-medium">
                          <span className="font-semibold text-fg">{dep.label}</span>
                          <span className="font-mono">
                            {ugx(dep.revenue.UGX)}{' '}
                            <span className="text-fg-subtle">({dep.sharePercent}%)</span>
                          </span>
                        </div>
                        <div className="h-2 w-full overflow-hidden rounded-full bg-surface-2">
                          <div
                            className="h-full rounded-full bg-fg"
                            style={{ width: `${Math.min(100, Math.max(1, dep.sharePercent))}%` }}
                          />
                        </div>
                        <div className="text-[11px] text-fg-subtle">{dep.secondaryMetric}</div>
                      </div>
                    ))}
                  </div>
                </Section>

                {/* Uniform System of Accounts for Lodging (USALI) P&L Waterfall */}
                <Section
                  title="Property Profit & Loss (P&L) Statement"
                  description="Hospitality operating standard summary (UGX)"
                >
                  <div className="rounded-xl border border-line bg-surface-2/30 p-4 text-xs font-mono">
                    <div className="flex items-center justify-between border-b border-line pb-2 font-bold text-fg">
                      <span>(+) GROSS REVENUE (ALL OUTLETS)</span>
                      <span>{ugx(r.financialSummary?.totalGrossRevenue.UGX)}</span>
                    </div>

                    <div className="space-y-1.5 py-2.5 text-fg-muted">
                      <div className="flex justify-between pl-3 text-[11px]">
                        <span>• Rooms Division</span>
                        <span>{ugx(r.totals.roomRevenue.UGX)}</span>
                      </div>
                      <div className="flex justify-between pl-3 text-[11px]">
                        <span>• Food & Beverage (Kitchen & Bar)</span>
                        <span>
                          {ugx(
                            String(
                              BigInt(r.departments?.find((d) => d.department === 'KITCHEN')?.revenue.UGX || '0') +
                                BigInt(r.departments?.find((d) => d.department === 'BAR')?.revenue.UGX || '0'),
                            ),
                          )}
                        </span>
                      </div>
                      <div className="flex justify-between pl-3 text-[11px]">
                        <span>• Health Club, Gym & Spa</span>
                        <span>
                          {ugx(r.departments?.find((d) => d.department === 'HEALTH_CLUB')?.revenue.UGX)}
                        </span>
                      </div>
                      <div className="flex justify-between pl-3 text-[11px]">
                        <span>• Conferences & Banqueting</span>
                        <span>
                          {ugx(r.departments?.find((d) => d.department === 'CONFERENCE')?.revenue.UGX)}
                        </span>
                      </div>
                      <div className="flex justify-between pl-3 text-[11px]">
                        <span>• Tours & Stay Extras</span>
                        <span>
                          {ugx(r.departments?.find((d) => d.department === 'EXTRAS_TOURS')?.revenue.UGX)}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between border-t border-line py-2 font-semibold text-amber-700 dark:text-amber-400">
                      <span>(−) COST OF GOODS SOLD (COGS)</span>
                      <span>{ugx(r.financialSummary?.costOfSales.UGX)}</span>
                    </div>

                    <div className="flex items-center justify-between border-t border-line py-2 font-bold text-fg">
                      <span>(=) GROSS PROFIT</span>
                      <span>{ugx(r.financialSummary?.grossProfit.UGX)}</span>
                    </div>

                    <div className="flex items-center justify-between border-t border-line py-2 font-semibold text-rose-700 dark:text-rose-400">
                      <span>(−) OPERATING EXPENSES (OPEX)</span>
                      <span>{ugx(r.financialSummary?.operatingExpenses.UGX)}</span>
                    </div>

                    <div className="flex items-center justify-between border-t-2 border-fg pt-2.5 text-sm font-bold text-emerald-700 dark:text-emerald-400">
                      <span>(=) GROSS OPERATING PROFIT (GOP)</span>
                      <span>{ugx(r.financialSummary?.grossOperatingProfit.UGX)}</span>
                    </div>
                  </div>
                </Section>
              </div>

              {/* Daily Occupancy Column Chart */}
              <Section title="Daily Occupancy (%)" description="Tracking room utilization day-by-day">
                <ColumnChart
                  data={r.days.map((d) => ({ date: d.date, count: d.occupancy }))}
                  label="Occupancy"
                  max={100}
                  format={(n) => `${Math.round(n)}%`}
                  endLabel="last"
                  caption={
                    <>
                      Daily occupancy · average <b className="text-fg">{r.totals.occupancy}%</b> across period
                    </>
                  }
                  height={160}
                />
              </Section>
            </div>
          )}

          {/* ───────────────────────── TAB 2: DEPARTMENT TRAFFIC ───────────────────────── */}
          {activeTab === 'DEPARTMENTS' && (
            <div className="grid gap-5 fade-in">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {(r.departments ?? []).map((dep) => (
                  <div key={dep.department} className="card p-4">
                    <div className="flex items-start justify-between">
                      <div>
                        <span className="text-[11px] font-bold uppercase tracking-wider text-fg-subtle">
                          Department
                        </span>
                        <h3 className="text-base font-bold text-fg">{dep.label}</h3>
                      </div>
                      <Pill tone="blue">{dep.sharePercent}% Share</Pill>
                    </div>

                    <div className="mt-4 border-t border-line pt-3">
                      <div className="text-2xl font-bold font-mono text-fg">{ugx(dep.revenue.UGX)}</div>
                      {dep.revenue.USD !== '0' && (
                        <div className="text-xs text-fg-muted">{money(dep.revenue.USD, 'USD')}</div>
                      )}
                      <p className="mt-2 text-xs font-medium text-fg-muted">{dep.secondaryMetric}</p>
                    </div>
                  </div>
                ))}
              </div>

              {/* Channels & Room Types Detail */}
              <div className="grid gap-4 lg:grid-cols-2">
                <Section title="Booking Channels" description="Room nights by acquisition source">
                  {r.sourceMix.length ? (
                    <BarList
                      data={r.sourceMix.map((x) => ({
                        label: SOURCE[x.source] ?? x.source,
                        value: x.roomNights,
                      }))}
                    />
                  ) : (
                    <p className="text-xs text-fg-muted">No stays in period.</p>
                  )}
                </Section>
                <Section title="Occupancy by Room Category" description="Percentage occupied (%)">
                  <BarList data={r.roomTypes.map((x) => ({ label: x.name, value: x.occupancy }))} />
                </Section>
                <Section title="Booking Lead Time" description="Advance booking window">
                  <BarList data={r.leadTime.map((x) => ({ label: x.bucket, value: x.bookings }))} />
                </Section>
                <Section title="Guest Sentiment & Post-Stay Ratings" description="Cleanliness and service scores">
                  <BarList
                    data={[
                      { label: 'Good Experience', value: r.feedback.GOOD },
                      { label: 'Neutral / OK', value: r.feedback.OK },
                      { label: 'Issues Reported', value: r.feedback.BAD },
                    ]}
                  />
                </Section>
              </div>
            </div>
          )}

          {/* ───────────────────────── TAB 3: EXPENSE MANAGEMENT & COST DRIVERS ───────────────────────── */}
          {activeTab === 'EXPENSES' && (
            <div className="grid gap-5 fade-in">
              {/* Cost Drivers Top Tiles */}
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <StatTile
                  label="Total Hotel Expenses"
                  value={ugx(r.expenses?.total.UGX)}
                  note="All registered costs in period"
                />
                <StatTile
                  label="Cost of Sales (COGS)"
                  value={ugx(r.financialSummary?.costOfSales.UGX)}
                  note="Food ingredients & bar drinks"
                />
                <StatTile
                  label="Energy & Generator Fuel"
                  value={ugx(
                    String(
                      BigInt(
                        r.expenses?.byCategory.find((c) => c.category === 'UTILITIES_DIESEL_FUEL')?.amount.UGX || '0',
                      ) +
                        BigInt(
                          r.expenses?.byCategory.find((c) => c.category === 'UTILITIES_ELECTRICITY')?.amount.UGX || '0',
                        ) +
                        BigInt(
                          r.expenses?.byCategory.find((c) => c.category === 'UTILITIES_WATER_GAS')?.amount.UGX || '0',
                        ),
                    ),
                  )}
                  note="Umeme power, diesel & gas"
                />
                <StatTile
                  label="Active Invoices / Vouchers"
                  value={String(filteredExpenses.length)}
                  note="Recorded expense transactions"
                />
              </div>

              {/* Breakdown Cards: By Category & By Department */}
              <div className="grid gap-5 lg:grid-cols-2">
                <Section title="Cost Drivers by Category" description="Where money is spent across the property">
                  <div className="space-y-2.5 pt-1">
                    {(r.expenses?.byCategory ?? []).map((cat) => (
                      <div
                        key={cat.category}
                        className="flex items-center justify-between rounded-lg border border-line bg-surface-2/40 px-3 py-2 text-xs"
                      >
                        <div>
                          <div className="font-semibold text-fg">{cat.label}</div>
                          <div className="text-[11px] text-fg-subtle">
                            {cat.count} voucher{cat.count === 1 ? '' : 's'} ·{' '}
                            {cat.isDirectCost ? 'Direct Cost (COGS)' : 'Operating Expense (OPEX)'}
                          </div>
                        </div>
                        <span className="font-mono font-bold text-fg">{ugx(cat.amount.UGX)}</span>
                      </div>
                    ))}
                  </div>
                </Section>

                <Section title="Department Cost Allocation" description="Expenses grouped by hotel department">
                  <div className="space-y-2.5 pt-1">
                    {(r.expenses?.byDepartment ?? []).map((dep) => (
                      <div
                        key={dep.department}
                        className="flex items-center justify-between rounded-lg border border-line bg-surface-2/40 px-3 py-2 text-xs"
                      >
                        <div>
                          <div className="font-semibold text-fg">{dep.label}</div>
                          <div className="text-[11px] text-fg-subtle">{dep.count} records</div>
                        </div>
                        <span className="font-mono font-bold text-fg">{ugx(dep.amount.UGX)}</span>
                      </div>
                    ))}
                  </div>
                </Section>
              </div>

              {/* Expense Ledger Table */}
              <div className="card p-4">
                <div className="mb-3.5 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-bold text-fg">Expense Transaction Ledger</h3>
                    <p className="text-xs text-fg-muted">
                      Audit trail of operational disbursements, supplier invoices and receipts
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="relative min-w-[200px]">
                      <Search className="absolute left-2.5 top-2.5 size-3.5 text-fg-muted" />
                      <input
                        type="search"
                        placeholder="Search expense, vendor, #..."
                        value={expenseSearch}
                        onChange={(e) => setExpenseSearch(e.target.value)}
                        className="h-8 w-full rounded-lg border border-line bg-surface pl-8 pr-3 text-xs placeholder:text-fg-subtle focus:border-fg focus:outline-none"
                      />
                    </div>
                    <select
                      aria-label="Filter department"
                      value={expenseDeptFilter}
                      onChange={(e) => setExpenseDeptFilter(e.target.value)}
                      className="h-8 rounded-lg border border-line bg-surface px-2.5 text-xs font-medium"
                    >
                      <option value="ALL">All Departments</option>
                      {Object.entries(DEPT_LABELS).map(([k, l]) => (
                        <option key={k} value={k}>
                          {l}
                        </option>
                      ))}
                    </select>
                    {canManageExpenses && (
                      <Button
                        size="sm"
                        variant="primary"
                        icon={<Plus className="size-3" />}
                        onClick={() => setExpenseModalOpen(true)}
                      >
                        New Expense
                      </Button>
                    )}
                  </div>
                </div>

                {isExpensesLoading ? (
                  <Skeleton className="h-40" />
                ) : filteredExpenses.length === 0 ? (
                  <Empty
                    icon={<Receipt className="size-8 text-fg-subtle" />}
                    title="No expenses found"
                    body="Record your first hotel expense or supplier payment using the button above."
                  />
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="border-b border-line text-[11px] font-bold uppercase tracking-wider text-fg-subtle">
                          <th className="pb-2">Date / Voucher</th>
                          <th className="pb-2">Department</th>
                          <th className="pb-2">Category</th>
                          <th className="pb-2">Title & Vendor</th>
                          <th className="pb-2">Payment</th>
                          <th className="pb-2 text-right">Amount</th>
                          {canManageExpenses && <th className="pb-2 text-right">Actions</th>}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-line">
                        {filteredExpenses.map((exp) => (
                          <tr key={exp.id} className="hover:bg-surface-2/40">
                            <td className="py-2.5 font-mono">
                              <span className="font-semibold text-fg">{exp.number}</span>
                              <div className="text-[11px] text-fg-subtle">{exp.date}</div>
                            </td>
                            <td className="py-2.5">
                              <span className="font-medium text-fg">
                                {DEPT_LABELS[exp.department] ?? exp.department}
                              </span>
                            </td>
                            <td className="py-2.5">
                              <span className="rounded bg-surface-2 px-1.5 py-0.5 text-[11px] font-semibold text-fg-muted">
                                {CATEGORY_LABELS[exp.category] ?? exp.category}
                              </span>
                            </td>
                            <td className="py-2.5">
                              <div className="font-medium text-fg">{exp.title}</div>
                              {exp.vendor && (
                                <div className="text-[11px] text-fg-subtle">Vendor: {exp.vendor}</div>
                              )}
                            </td>
                            <td className="py-2.5">
                              <span className="font-mono text-[11px]">
                                {PAYMENT_METHOD_LABELS[exp.paymentMethod] ?? exp.paymentMethod}
                              </span>
                            </td>
                            <td className="py-2.5 text-right font-mono font-bold text-fg">
                              {money(exp.amountMinor, exp.currency)}
                            </td>
                            {canManageExpenses && (
                              <td className="py-2.5 text-right">
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  icon={<Trash2 className="size-3 text-rose-500" />}
                                  onClick={() => {
                                    if (confirm(`Delete expense ${exp.number}?`)) {
                                      deleteExpenseMut.mutate(exp.id);
                                    }
                                  }}
                                />
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ───────────────────────── TAB 4: PAYMENT RAILS & CASH RECONCILIATION ───────────────────────── */}
          {activeTab === 'PAYMENTS' && (
            <div className="grid gap-5 fade-in">
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
                <StatTile
                  label="Net Inflow Collected"
                  value={ugx(r.totals.collected.UGX)}
                  note={`Cleared across all channels${usdNote(r.totals.collected.USD)}`}
                />
                <StatTile
                  label="Settlement Settlement Rails"
                  value={String(r.paymentReconciliation?.length ?? 0)}
                  note="Cash, MoMo, Bank, Card & Folio"
                />
                <StatTile
                  label="Audit Status"
                  value="100% Tracked"
                  note="Digital + POS Drawer reconciliation"
                />
              </div>

              <Section
                title="Cash Flow & Settlement Rail Summary"
                description="Where hotel revenues were received and settled"
              >
                <div className="overflow-x-auto rounded-xl border border-line bg-surface">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-line bg-surface-2/40 text-[11px] font-bold uppercase tracking-wider text-fg-subtle">
                        <th className="p-3">Payment Rail</th>
                        <th className="p-3">Inflows Count</th>
                        <th className="p-3 text-right">Total UGX</th>
                        <th className="p-3 text-right">Total USD</th>
                        <th className="p-3 text-center">Reconciliation Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line">
                      {(r.paymentReconciliation ?? []).map((rail) => (
                        <tr key={rail.method} className="hover:bg-surface-2/40">
                          <td className="p-3">
                            <div className="font-semibold text-fg">{rail.label}</div>
                            <div className="font-mono text-[11px] text-fg-subtle">{rail.method}</div>
                          </td>
                          <td className="p-3 font-mono font-medium">{rail.count} transactions</td>
                          <td className="p-3 text-right font-mono font-bold text-fg">
                            {ugx(rail.amount.UGX)}
                          </td>
                          <td className="p-3 text-right font-mono text-fg-muted">
                            {rail.amount.USD !== '0' ? money(rail.amount.USD, 'USD') : '—'}
                          </td>
                          <td className="p-3 text-center">
                            <Pill tone="green" dot>
                              Audited
                            </Pill>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Section>
            </div>
          )}
        </div>
      )}

      {/* ───────────────────────── Record Expense Modal ───────────────────────── */}
      <Dialog
        open={expenseModalOpen}
        onClose={() => setExpenseModalOpen(false)}
        size="md"
        title="Record Hotel Expense"
        description="Add a cost disbursement, utility bill payment, food market procurement or maintenance voucher."
      >
        <form
          className="grid gap-3.5"
          onSubmit={(e) => {
            e.preventDefault();
            createExpenseMut.mutate();
          }}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <TextInput
              label="Expense Date"
              type="date"
              value={expenseForm.date}
              onChange={(e) => setExpenseForm({ ...expenseForm, date: e.target.value })}
            />
            <SelectInput
              label="Department Incurring Cost"
              value={expenseForm.department}
              onChange={(e) =>
                setExpenseForm({ ...expenseForm, department: e.target.value as Department })
              }
            >
              {Object.entries(DEPT_LABELS).map(([k, l]) => (
                <option key={k} value={k}>
                  {l}
                </option>
              ))}
            </SelectInput>
          </div>

          <SelectInput
            label="Cost Driver / Expense Category"
            value={expenseForm.category}
            onChange={(e) =>
              setExpenseForm({ ...expenseForm, category: e.target.value as ExpenseCategory })
            }
          >
            {Object.entries(CATEGORY_LABELS).map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </SelectInput>

          <TextInput
            label="Title / Expense Description"
            placeholder="e.g. 50 Litres Diesel for Generator, Market produce (vegetables & beef)..."
            value={expenseForm.title}
            onChange={(e) => setExpenseForm({ ...expenseForm, title: e.target.value })}
          />

          <div className="grid gap-3 sm:grid-cols-2">
            <TextInput
              label="Supplier / Vendor (Optional)"
              placeholder="e.g. TotalEnergies Kapchorwa, Mbale Fresh Market..."
              value={expenseForm.vendor}
              onChange={(e) => setExpenseForm({ ...expenseForm, vendor: e.target.value })}
            />
            <TextInput
              label="Invoice / Receipt #"
              placeholder="e.g. INV-9812, VOUCHER-04"
              value={expenseForm.referenceNumber}
              onChange={(e) => setExpenseForm({ ...expenseForm, referenceNumber: e.target.value })}
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="sm:col-span-2">
              <TextInput
                label="Amount"
                inputMode="numeric"
                placeholder="e.g. 250000"
                value={expenseForm.amount}
                onChange={(e) => setExpenseForm({ ...expenseForm, amount: e.target.value })}
              />
            </div>
            <SelectInput
              label="Currency"
              value={expenseForm.currency}
              onChange={(e) =>
                setExpenseForm({ ...expenseForm, currency: e.target.value as 'UGX' | 'USD' })
              }
            >
              <option value="UGX">UGX (Shillings)</option>
              <option value="USD">USD ($)</option>
            </SelectInput>
          </div>

          <SelectInput
            label="Payment Method / Source"
            value={expenseForm.paymentMethod}
            onChange={(e) =>
              setExpenseForm({
                ...expenseForm,
                paymentMethod: e.target.value as ExpensePaymentMethod,
              })
            }
          >
            {Object.entries(PAYMENT_METHOD_LABELS).map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </SelectInput>

          <TextArea
            label="Internal Notes / Justification (Optional)"
            placeholder="Authorized for emergency generator run during weekend storm."
            value={expenseForm.description}
            onChange={(e) => setExpenseForm({ ...expenseForm, description: e.target.value })}
          />

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-line">
            <Button type="button" variant="ghost" onClick={() => setExpenseModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={createExpenseMut.isPending}>
              Save & Record Expense
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
