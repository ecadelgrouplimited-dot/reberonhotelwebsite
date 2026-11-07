'use client';
import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Plus, Receipt, Search, Trash2 } from 'lucide-react';
import type { Department, ExpenseCategory, ExpenseDTO, ExpensePaymentMethod, HouseReportDTO } from '@reberon/contracts';
import { ApiError, del, get, post } from '@/lib/api';
import { money, toMinorStr } from '@/lib/money';
import { exportToCsv } from '@/lib/export-csv';
import { Button } from '@/components/ui/button';
import { Empty, Section, Skeleton } from '@/components/ui/bits';
import { Dialog } from '@/components/ui/dialog';
import { SelectInput, TextArea, TextInput } from '@/components/ui/field';
import { StatTile } from '@/components/charts/charts';

const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Kampala' }).format(new Date());

export const DEPT_LABELS: Record<string, string> = {
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

export const CATEGORY_LABELS: Record<string, string> = {
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

export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  CASH: 'Cash at Premises',
  MOMO_MTN: 'MTN Mobile Money',
  MOMO_AIRTEL: 'Airtel Money',
  BANK_TRANSFER: 'Bank Transfer / Wire',
  CHEQUE: 'Bank Cheque',
  CARD: 'Credit / Debit Card',
};

/** Expense ledger, cost drivers and the record-expense dialog (moved out of the reports page unchanged). */
export function ExpensesPanel({ from, to, r, canManageExpenses, modalOpen, setModalOpen }: { from: string; to: string; r: HouseReportDTO; canManageExpenses: boolean; modalOpen: boolean; setModalOpen: (v: boolean) => void }) {
  const qc = useQueryClient();
  const expenseModalOpen = modalOpen;
  const setExpenseModalOpen = setModalOpen;
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
      qc.invalidateQueries({ queryKey: ['finance'] });
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
      qc.invalidateQueries({ queryKey: ['finance'] });
      qc.invalidateQueries({ queryKey: ['expenses'] });
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : (e as Error).message),
  });

  const ugx = (m?: string) => money(m ?? '0', 'UGX');

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

  const exportLedger = () =>
    exportToCsv(
      `reberon-expenses-${from}-to-${to}.csv`,
      ['Number', 'Date', 'Department', 'Category', 'Title', 'Vendor', 'Payment Method', 'Reference', 'Currency', 'Amount', 'Recorded By'],
      filteredExpenses.map((e) => [e.number, e.date, DEPT_LABELS[e.department] ?? e.department, CATEGORY_LABELS[e.category] ?? e.category, e.title, e.vendor ?? '', PAYMENT_METHOD_LABELS[e.paymentMethod] ?? e.paymentMethod, e.referenceNumber ?? '', e.currency, money(e.amountMinor, e.currency), e.recordedByName ?? '']),
    );

  return (
    <>
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
      <div className="no-print flex justify-end"><Button size="sm" variant="secondary" disabled={!filteredExpenses.length} onClick={exportLedger}>Export ledger CSV</Button></div>
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
    </>
  );
}
