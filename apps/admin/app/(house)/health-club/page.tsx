'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  CheckCircle2, Dumbbell, LogIn, LogOut, Printer, Search, UserPlus, Users,
} from 'lucide-react';
import type {
  HealthClubAccessLogDTO,
  HealthClubDashboardDTO,
  HealthClubMembershipDTO,
  HealthClubService,
  MembershipTier,
} from '@reberon/contracts';
import { ApiError, get, patch, post } from '@/lib/api';
import { money, toMinorStr } from '@/lib/money';
import { dateTime } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Empty, PageHeader, Pill, Skeleton, Tabs } from '@/components/ui/bits';
import { Dialog } from '@/components/ui/dialog';
import { SelectInput, Switch, TextInput } from '@/components/ui/field';
import { printDocument } from '@/components/documents/documents-panel';

const SERVICE_SHORT: Record<HealthClubService, string> = {
  GYM_ONLY: 'Gym Only',
  STEAM_ONLY: 'Steam Bath',
  SAUNA_ONLY: 'Dry Sauna',
  STEAM_SAUNA: 'Steam + Sauna',
  FULL_COMBO: 'Full Combo (Gym+Steam+Sauna)',
};

const TIER_SHORT: Record<MembershipTier, string> = {
  DAILY_PASS: 'Daily Pass',
  MONTHLY: 'Monthly (30d)',
  ANNUAL: 'Annual (365d)',
  RESIDENT_GUEST: 'Room Guest',
};

const DEFAULT_PRICES: Record<string, string> = {
  'DAILY_PASS:GYM_ONLY': '25000',
  'DAILY_PASS:STEAM_ONLY': '30000',
  'DAILY_PASS:SAUNA_ONLY': '30000',
  'DAILY_PASS:STEAM_SAUNA': '45000',
  'DAILY_PASS:FULL_COMBO': '60000',
  'MONTHLY:GYM_ONLY': '250000',
  'MONTHLY:STEAM_SAUNA': '320000',
  'MONTHLY:FULL_COMBO': '450000',
  'ANNUAL:GYM_ONLY': '2400000',
  'ANNUAL:FULL_COMBO': '4200000',
};

export default function HealthClubPage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<'LOGS' | 'MEMBERS'>('LOGS');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'INSIDE' | 'TOWELS_OUT'>('ALL');
  const [search, setSearch] = useState('');
  const [checkInOpen, setCheckInOpen] = useState(false);
  const [enrollOpen, setEnrollOpen] = useState(false);
  const [reconcileLog, setReconcileLog] = useState<HealthClubAccessLogDTO | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['healthclub'],
    queryFn: () => get<HealthClubDashboardDTO>('/healthclub'),
    refetchInterval: 15000,
  });

  const stats = data?.stats;

  const filteredLogs = useMemo(() => {
    return (data?.accessLogs ?? []).filter((l) => {
      if (statusFilter === 'INSIDE' && l.checkedOutAt) return false;
      if (statusFilter === 'TOWELS_OUT' && l.gymTowelsIssued - l.gymTowelsReturned <= 0) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        return (
          l.guestName.toLowerCase().includes(q) ||
          (l.guestPhone ?? '').toLowerCase().includes(q) ||
          (l.lockerNumber ?? '').toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [data?.accessLogs, statusFilter, search]);

  const filteredMembers = useMemo(() => {
    return (data?.memberships ?? []).filter((m) => {
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return (
        m.memberName.toLowerCase().includes(q) ||
        m.membershipNo.toLowerCase().includes(q) ||
        m.memberPhone.toLowerCase().includes(q)
      );
    });
  }, [data?.memberships, search]);

  return (
    <div className="fade-in">
      <PageHeader
        title="Health Club & Spa · Gym, Steam & Sauna"
        actions={
          <div className="flex items-center gap-1.5">
            <Button
              variant="secondary"
              icon={<UserPlus className="size-3.5" />}
              onClick={() => setEnrollOpen(true)}
            >
              Enroll Member
            </Button>
            <Button
              variant="primary"
              icon={<LogIn className="size-3.5" />}
              onClick={() => setCheckInOpen(true)}
            >
              Check In Guest
            </Button>
          </div>
        }
      />

      {/* Compact 5-tile KPI Strip */}
      <div className="mb-4 grid grid-cols-2 gap-2.5 sm:grid-cols-5">
        <div className="card px-3.5 py-2.5">
          <span className="text-[11px] font-medium text-fg-muted">Inside Now</span>
          <p className="mt-0.5 text-[1.25rem] font-bold tabular">{stats?.currentlyInside ?? 0}</p>
        </div>
        <div className="card px-3.5 py-2.5">
          <span className="text-[11px] font-medium text-fg-muted">Gym Towels Out</span>
          <div className="mt-0.5 flex items-center gap-2">
            <span className="text-[1.25rem] font-bold tabular">{stats?.towelsOutNow ?? 0}</span>
            {(stats?.towelsOutNow ?? 0) > 0 && <Pill tone="amber">Out</Pill>}
          </div>
        </div>
        <div className="card px-3.5 py-2.5">
          <span className="text-[11px] font-medium text-fg-muted">Today’s Visits</span>
          <p className="mt-0.5 text-[1.25rem] font-bold tabular">{stats?.todayVisits ?? 0}</p>
        </div>
        <div className="card px-3.5 py-2.5">
          <span className="text-[11px] font-medium text-fg-muted">Active Members</span>
          <p className="mt-0.5 text-[1.25rem] font-bold tabular">{stats?.activeMembers ?? 0}</p>
        </div>
        <div className="card px-3.5 py-2.5">
          <span className="text-[11px] font-medium text-fg-muted">Today’s Revenue</span>
          <p className="mt-0.5 text-[1.25rem] font-bold tabular">
            {money(stats?.todayRevenueUGX ?? '0', 'UGX')}
          </p>
        </div>
      </div>

      <div className="card overflow-hidden">
        <Tabs
          className="px-3"
          value={tab}
          onChange={setTab}
          items={[
            {
              value: 'LOGS',
              label: 'Check-In & Towel Log',
              count: data?.accessLogs.length ?? 0,
            },
            {
              value: 'MEMBERS',
              label: 'Memberships',
              count: data?.memberships.length ?? 0,
            },
          ]}
        />

        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-surface-2/30 px-3 py-2">
          {tab === 'LOGS' ? (
            <div className="flex items-center gap-1">
              {(['ALL', 'INSIDE', 'TOWELS_OUT'] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setStatusFilter(f)}
                  className={`rounded-md px-2 py-1 text-[11.5px] font-medium transition-colors ${
                    statusFilter === f
                      ? 'bg-fg text-bg'
                      : 'text-fg-muted hover:bg-surface-2 hover:text-fg'
                  }`}
                >
                  {f === 'ALL' ? 'All Visits' : f === 'INSIDE' ? 'Inside Now' : 'Unreturned Towels'}
                </button>
              ))}
            </div>
          ) : (
            <span className="text-[11.5px] text-fg-muted">
              {filteredMembers.length} registered members
            </span>
          )}

          <label className="relative w-56">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-fg-subtle" />
            <input
              className="input !min-h-7 !py-1 pl-8 text-[12px]"
              placeholder="Search name, phone or locker…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
        </div>

        <div>
          {isLoading ? (
            <div className="p-4">
              <Skeleton className="h-52" />
            </div>
          ) : tab === 'LOGS' ? (
            !filteredLogs.length ? (
              <Empty icon={<Dumbbell className="size-4" />} title="No visits match filter" />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[820px] text-left text-[12.5px]">
                  <thead className="border-b border-line bg-surface-2/40 text-[11px] font-semibold uppercase tracking-wider text-fg-subtle">
                    <tr>
                      <th className="px-3.5 py-2">Guest</th>
                      <th className="px-3.5 py-2">Pass</th>
                      <th className="px-3.5 py-2">Facility</th>
                      <th className="px-3.5 py-2">Locker</th>
                      <th className="px-3.5 py-2">Gym Towels</th>
                      <th className="px-3.5 py-2">Gear Issued</th>
                      <th className="px-3.5 py-2 text-right">Fee</th>
                      <th className="px-3.5 py-2 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {filteredLogs.map((log) => {
                      const unreturned = log.gymTowelsIssued - log.gymTowelsReturned;
                      const isInside = !log.checkedOutAt;
                      return (
                        <tr key={log.id} className="align-middle hover:bg-surface-2/30">
                          <td className="px-3.5 py-2.5">
                            <p className="font-semibold">{log.guestName}</p>
                            <p className="text-[11px] text-fg-subtle">
                              {dateTime(log.checkedInAt)}
                              {log.guestPhone ? ` · ${log.guestPhone}` : ''}
                            </p>
                          </td>
                          <td className="px-3.5 py-2.5 whitespace-nowrap">
                            <Pill tone="neutral">{TIER_SHORT[log.tier]}</Pill>
                          </td>
                          <td className="px-3.5 py-2.5 whitespace-nowrap">
                            <Pill tone="blue">{SERVICE_SHORT[log.service]}</Pill>
                          </td>
                          <td className="px-3.5 py-2.5 font-mono text-[12px]">
                            {log.lockerNumber ? `#${log.lockerNumber}` : '—'}
                          </td>
                          <td className="px-3.5 py-2.5 whitespace-nowrap">
                            <div className="flex items-center gap-1.5">
                              <span className="font-mono text-[12px]">
                                {log.gymTowelsReturned}/{log.gymTowelsIssued}
                              </span>
                              {unreturned > 0 ? (
                                <Pill tone="amber" dot>
                                  {unreturned} out
                                </Pill>
                              ) : log.gymTowelsIssued > 0 ? (
                                <Pill tone="green">OK</Pill>
                              ) : null}
                            </div>
                          </td>
                          <td className="px-3.5 py-2.5 text-[11.5px] text-fg-muted">
                            {[
                              log.sandalsIssued && 'Sandals',
                              log.showerCapIssued && 'Cap',
                              log.ropeIssued && 'Rope',
                            ]
                              .filter(Boolean)
                              .join(', ') || '—'}
                          </td>
                          <td className="px-3.5 py-2.5 text-right font-mono tabular whitespace-nowrap">
                            {BigInt(log.amountPaidMinor) > 0n
                              ? money(log.amountPaidMinor, log.currency)
                              : 'Pass'}
                          </td>
                          <td className="px-3.5 py-2.5 text-right whitespace-nowrap">
                            <div className="inline-flex items-center gap-1">
                              {log.documentId && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  icon={<Printer className="size-3" />}
                                  onClick={() => printDocument(log.documentId!, '80MM')}
                                >
                                  80mm
                                </Button>
                              )}
                              {isInside ? (
                                <Button
                                  size="sm"
                                  variant="primary"
                                  icon={<LogOut className="size-3" />}
                                  onClick={() => setReconcileLog(log)}
                                >
                                  Check Out
                                </Button>
                              ) : (
                                <Pill tone="neutral">
                                  <CheckCircle2 className="size-3" /> Out
                                </Pill>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )
          ) : !filteredMembers.length ? (
            <Empty icon={<Users className="size-4" />} title="No memberships found" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[780px] text-left text-[12.5px]">
                <thead className="border-b border-line bg-surface-2/40 text-[11px] font-semibold uppercase tracking-wider text-fg-subtle">
                  <tr>
                    <th className="px-3.5 py-2">Member #</th>
                    <th className="px-3.5 py-2">Name & Contact</th>
                    <th className="px-3.5 py-2">Tier</th>
                    <th className="px-3.5 py-2">Access</th>
                    <th className="px-3.5 py-2">Validity</th>
                    <th className="px-3.5 py-2 text-right">Visits</th>
                    <th className="px-3.5 py-2 text-right">Amount</th>
                    <th className="px-3.5 py-2 text-right">Status & Receipt</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {filteredMembers.map((m) => (
                    <tr key={m.id} className="align-middle hover:bg-surface-2/30">
                      <td className="px-3.5 py-2.5 font-mono text-[12px] font-bold text-accent">
                        {m.membershipNo}
                      </td>
                      <td className="px-3.5 py-2.5">
                        <p className="font-semibold">{m.memberName}</p>
                        <p className="text-[11px] text-fg-subtle">
                          {m.memberPhone}
                          {m.memberEmail ? ` · ${m.memberEmail}` : ''}
                        </p>
                      </td>
                      <td className="px-3.5 py-2.5">
                        <Pill tone="neutral">{TIER_SHORT[m.tier]}</Pill>
                      </td>
                      <td className="px-3.5 py-2.5">
                        <Pill tone="blue">{SERVICE_SHORT[m.service]}</Pill>
                      </td>
                      <td className="px-3.5 py-2.5 font-mono text-[11.5px] text-fg-muted">
                        {m.startDate.slice(0, 10)} → {m.endDate.slice(0, 10)}
                      </td>
                      <td className="px-3.5 py-2.5 text-right font-mono font-semibold tabular">
                        {m.visitsCount}
                      </td>
                      <td className="px-3.5 py-2.5 text-right font-mono font-semibold tabular">
                        {money(m.amountMinor, m.currency)}
                      </td>
                      <td className="px-3.5 py-2.5 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5">
                          <Pill tone={m.isActive ? 'green' : 'neutral'} dot>
                            {m.isActive ? 'Active' : 'Expired'}
                          </Pill>
                          {m.documentId && (
                            <Button
                              size="sm"
                              variant="ghost"
                              icon={<Printer className="size-3" />}
                              onClick={() => printDocument(m.documentId!, 'A4')}
                            >
                              Receipt
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

      <CheckInDialog
        open={checkInOpen}
        onClose={() => setCheckInOpen(false)}
        memberships={data?.memberships ?? []}
        onSuccess={() => {
          setCheckInOpen(false);
          qc.invalidateQueries({ queryKey: ['healthclub'] });
          qc.invalidateQueries({ queryKey: ['inventory'] });
        }}
      />

      <EnrollMembershipDialog
        open={enrollOpen}
        onClose={() => setEnrollOpen(false)}
        onSuccess={() => {
          setEnrollOpen(false);
          qc.invalidateQueries({ queryKey: ['healthclub'] });
        }}
      />

      {reconcileLog && (
        <ReconcileCheckoutDialog
          log={reconcileLog}
          open={!!reconcileLog}
          onClose={() => setReconcileLog(null)}
          onSuccess={() => {
            setReconcileLog(null);
            qc.invalidateQueries({ queryKey: ['healthclub'] });
            qc.invalidateQueries({ queryKey: ['inventory'] });
          }}
        />
      )}
    </div>
  );
}

function CheckInDialog({
  open,
  onClose,
  memberships,
  onSuccess,
}: {
  open: boolean;
  onClose: () => void;
  memberships: HealthClubMembershipDTO[];
  onSuccess: () => void;
}) {
  const [mode, setMode] = useState<'WALK_IN' | 'MEMBER' | 'RESIDENT'>('WALK_IN');
  const [membershipId, setMembershipId] = useState('');
  const [guestName, setGuestName] = useState('');
  const [guestPhone, setGuestPhone] = useState('');
  const [service, setService] = useState<HealthClubService>('FULL_COMBO');
  const [amountMajor, setAmountMajor] = useState('60000');
  const [paymentMethod, setPaymentMethod] = useState<'CASH' | 'MOBILE_MONEY' | 'CARD'>('CASH');
  const [gymTowelsIssued, setGymTowelsIssued] = useState('1');
  const [sandalsIssued, setSandalsIssued] = useState(true);
  const [showerCapIssued, setShowerCapIssued] = useState(true);
  const [ropeIssued, setRopeIssued] = useState(false);
  const [lockerNumber, setLockerNumber] = useState('');

  const m = useMutation({
    mutationFn: () => {
      const tier: MembershipTier =
        mode === 'MEMBER' ? 'MONTHLY' : mode === 'RESIDENT' ? 'RESIDENT_GUEST' : 'DAILY_PASS';
      const amountPaidMinor = mode === 'WALK_IN' ? (toMinorStr(amountMajor, 'UGX') ?? '0') : '0';
      return post<HealthClubAccessLogDTO>('/healthclub/checkin', {
        membershipId: mode === 'MEMBER' && membershipId ? membershipId : undefined,
        guestName: guestName.trim(),
        guestPhone: guestPhone.trim() || undefined,
        service,
        tier,
        amountPaidMinor,
        currency: 'UGX',
        paymentMethod: mode === 'WALK_IN' ? paymentMethod : 'MEMBER_PASS',
        gymTowelsIssued: Number(gymTowelsIssued) || 0,
        sandalsIssued,
        showerCapIssued,
        ropeIssued,
        lockerNumber: lockerNumber.trim() || undefined,
      });
    },
    onSuccess: (log) => {
      toast.success(
        `${log.guestName} checked in`,
        log.documentId
          ? {
              action: {
                label: 'Print 80mm',
                onClick: () => printDocument(log.documentId!, '80MM'),
              },
            }
          : undefined,
      );
      onSuccess();
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Check-in failed'),
  });

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="md"
      title="Health Club Check-In"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            loading={m.isPending}
            disabled={!guestName.trim()}
            onClick={() => m.mutate()}
          >
            Check In
          </Button>
        </>
      }
    >
      <div className="grid gap-3">
        <div className="grid grid-cols-3 gap-1.5">
          {(['WALK_IN', 'MEMBER', 'RESIDENT'] as const).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => {
                setMode(k);
                if (k !== 'WALK_IN') setAmountMajor('0');
                else setAmountMajor(DEFAULT_PRICES[`DAILY_PASS:${service}`] ?? '60000');
              }}
              className={`rounded-lg border px-2.5 py-1.5 text-[12px] font-semibold ${
                mode === k ? 'border-fg bg-fg text-bg' : 'border-line bg-surface-2 text-fg-muted'
              }`}
            >
              {k === 'WALK_IN' ? 'Walk-In Pass' : k === 'MEMBER' ? 'Member' : 'Room Guest'}
            </button>
          ))}
        </div>

        {mode === 'MEMBER' && (
          <SelectInput
            label="Member"
            value={membershipId}
            onChange={(e) => {
              setMembershipId(e.target.value);
              const found = memberships.find((x) => x.id === e.target.value);
              if (found) {
                setGuestName(found.memberName);
                setGuestPhone(found.memberPhone);
                setService(found.service);
              }
            }}
          >
            <option value="">— Select member —</option>
            {memberships.map((mem) => (
              <option key={mem.id} value={mem.id}>
                {mem.membershipNo} · {mem.memberName} ({SERVICE_SHORT[mem.service]})
              </option>
            ))}
          </SelectInput>
        )}

        <div className="grid grid-cols-2 gap-2.5">
          <TextInput
            label="Guest Name"
            required
            value={guestName}
            onChange={(e) => setGuestName(e.target.value)}
          />
          <TextInput
            label="Phone"
            value={guestPhone}
            onChange={(e) => setGuestPhone(e.target.value)}
          />
        </div>

        <div className="grid grid-cols-3 gap-2.5">
          <SelectInput
            label="Facility"
            wrapClassName="col-span-2"
            value={service}
            onChange={(e) => {
              const s = e.target.value as HealthClubService;
              setService(s);
              if (mode === 'WALK_IN') {
                setAmountMajor(DEFAULT_PRICES[`DAILY_PASS:${s}`] ?? '45000');
              }
            }}
          >
            {Object.entries(SERVICE_SHORT).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </SelectInput>
          <TextInput
            label="Locker #"
            value={lockerNumber}
            onChange={(e) => setLockerNumber(e.target.value)}
            placeholder="L-14"
          />
        </div>

        {mode === 'WALK_IN' && (
          <div className="grid grid-cols-2 gap-2.5 rounded-lg border border-line bg-surface-2/40 p-2.5">
            <TextInput
              label="Pass Fee (UGX)"
              value={amountMajor}
              onChange={(e) => setAmountMajor(e.target.value)}
            />
            <SelectInput
              label="Payment"
              value={paymentMethod}
              onChange={(e) =>
                setPaymentMethod(e.target.value as 'CASH' | 'MOBILE_MONEY' | 'CARD')
              }
            >
              <option value="CASH">Cash (Auto-Receipt)</option>
              <option value="MOBILE_MONEY">Mobile Money</option>
              <option value="CARD">Card POS</option>
            </SelectInput>
          </div>
        )}

        <div className="rounded-lg border border-line p-3">
          <div className="grid grid-cols-2 items-center gap-3">
            <TextInput
              label="Gym Towels Issued (Moss)"
              type="number"
              min={0}
              max={5}
              value={gymTowelsIssued}
              onChange={(e) => setGymTowelsIssued(e.target.value)}
            />
            <div className="space-y-1.5 pt-2">
              <Switch label="Spa Sandals" checked={sandalsIssued} onChange={setSandalsIssued} />
              <Switch label="Shower Cap" checked={showerCapIssued} onChange={setShowerCapIssued} />
              <Switch label="Skipping Rope" checked={ropeIssued} onChange={setRopeIssued} />
            </div>
          </div>
        </div>
      </div>
    </Dialog>
  );
}

function EnrollMembershipDialog({
  open,
  onClose,
  onSuccess,
}: {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [memberName, setMemberName] = useState('');
  const [memberPhone, setMemberPhone] = useState('');
  const [memberEmail, setMemberEmail] = useState('');
  const [tier, setTier] = useState<MembershipTier>('MONTHLY');
  const [service, setService] = useState<HealthClubService>('FULL_COMBO');
  const [priceMajor, setPriceMajor] = useState('450000');
  const [paymentMethod, setPaymentMethod] = useState<'CASH' | 'MOBILE_MONEY' | 'CARD'>('MOBILE_MONEY');

  const m = useMutation({
    mutationFn: () =>
      post<HealthClubMembershipDTO>('/healthclub/memberships', {
        memberName: memberName.trim(),
        memberPhone: memberPhone.trim(),
        memberEmail: memberEmail.trim() || undefined,
        tier,
        service,
        amountMinor: toMinorStr(priceMajor, 'UGX') ?? '450000',
        currency: 'UGX',
        paymentMethod,
      }),
    onSuccess: (mem) => {
      toast.success(
        `Enrolled ${mem.membershipNo}`,
        mem.documentId
          ? {
              action: {
                label: 'Print Receipt',
                onClick: () => printDocument(mem.documentId!, 'A4'),
              },
            }
          : undefined,
      );
      onSuccess();
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Could not enroll member'),
  });

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="md"
      title="Enroll Health Club Member"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            loading={m.isPending}
            disabled={!memberName.trim() || !memberPhone.trim()}
            onClick={() => m.mutate()}
          >
            Enroll & Issue Receipt
          </Button>
        </>
      }
    >
      <div className="grid gap-3">
        <TextInput
          label="Full Name"
          required
          value={memberName}
          onChange={(e) => setMemberName(e.target.value)}
        />
        <div className="grid grid-cols-2 gap-2.5">
          <TextInput
            label="Phone"
            required
            placeholder="+256 77…"
            value={memberPhone}
            onChange={(e) => setMemberPhone(e.target.value)}
          />
          <TextInput
            label="Email"
            type="email"
            value={memberEmail}
            onChange={(e) => setMemberEmail(e.target.value)}
          />
        </div>
        <div className="grid grid-cols-2 gap-2.5">
          <SelectInput
            label="Tier"
            value={tier}
            onChange={(e) => {
              const t = e.target.value as MembershipTier;
              setTier(t);
              setPriceMajor(DEFAULT_PRICES[`${t}:${service}`] ?? '450000');
            }}
          >
            <option value="MONTHLY">Monthly (30 Days)</option>
            <option value="ANNUAL">Annual (365 Days)</option>
            <option value="DAILY_PASS">Single Day</option>
          </SelectInput>
          <SelectInput
            label="Facilities"
            value={service}
            onChange={(e) => {
              const s = e.target.value as HealthClubService;
              setService(s);
              setPriceMajor(DEFAULT_PRICES[`${tier}:${s}`] ?? '450000');
            }}
          >
            {Object.entries(SERVICE_SHORT).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </SelectInput>
        </div>
        <div className="grid grid-cols-2 gap-2.5">
          <TextInput
            label="Fee (UGX)"
            value={priceMajor}
            onChange={(e) => setPriceMajor(e.target.value)}
          />
          <SelectInput
            label="Payment"
            value={paymentMethod}
            onChange={(e) =>
              setPaymentMethod(e.target.value as 'CASH' | 'MOBILE_MONEY' | 'CARD')
            }
          >
            <option value="MOBILE_MONEY">Mobile Money</option>
            <option value="CASH">Cash</option>
            <option value="CARD">Card POS</option>
          </SelectInput>
        </div>
      </div>
    </Dialog>
  );
}

function ReconcileCheckoutDialog({
  log,
  open,
  onClose,
  onSuccess,
}: {
  log: HealthClubAccessLogDTO;
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [returned, setReturned] = useState(String(log.gymTowelsIssued));
  const m = useMutation({
    mutationFn: () =>
      patch(`/healthclub/access/${log.id}/checkout`, {
        gymTowelsReturned: Number(returned) || 0,
      }),
    onSuccess: () => {
      toast.success(`${log.guestName} checked out`);
      onSuccess();
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Checkout failed'),
  });

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="sm"
      title={`Check Out · ${log.guestName}`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" loading={m.isPending} onClick={() => m.mutate()}>
            Confirm Return
          </Button>
        </>
      }
    >
      <div className="grid gap-3">
        <div className="rounded-lg bg-surface-2 p-2.5 text-[12.5px]">
          <p>
            Gym Towels Issued: <strong>{log.gymTowelsIssued}</strong>
            {log.lockerNumber ? ` · Locker #${log.lockerNumber}` : ''}
          </p>
        </div>
        <TextInput
          label="Gym Towels Returned"
          type="number"
          min={0}
          max={log.gymTowelsIssued}
          value={returned}
          onChange={(e) => setReturned(e.target.value)}
        />
      </div>
    </Dialog>
  );
}
