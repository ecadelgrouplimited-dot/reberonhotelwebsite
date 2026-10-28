'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  AlertTriangle,
  Ban,
  Check,
  CheckCheck,
  ClipboardCheck,
  Download,
  ExternalLink,
  Eye,
  FileText,
  Laptop,
  Megaphone,
  PackageCheck,
  Plus,
  Printer,
  RotateCcw,
  Search,
  SlidersHorizontal,
  Trash2,
  User,
  X,
} from 'lucide-react';
import type {
  Department,
  InventoryDashboardDTO,
  InventoryItemDTO,
  RequisitionDTO,
  RequisitionStatus,
  StaffAnnouncementDTO,
  TerminalDeviceDTO,
} from '@reberon/contracts';
import { ApiError, get, post } from '@/lib/api';
import { useCan, useMe } from '@/lib/providers';
import { money, toMinorStr } from '@/lib/money';
import { dateTime } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Empty, PageHeader, Pill, Skeleton, Tabs } from '@/components/ui/bits';
import { Dialog } from '@/components/ui/dialog';
import { SelectInput, Switch, TextArea, TextInput } from '@/components/ui/field';

const STATUS_TONE: Record<RequisitionStatus, 'amber' | 'blue' | 'green' | 'neutral' | 'red'> = {
  PENDING: 'amber',
  MANAGER_APPROVED: 'blue',
  DIRECTOR_APPROVED: 'green',
  DISBURSED: 'green',
  REJECTED: 'red',
};

const PRIORITY_TONE: Record<string, 'neutral' | 'blue' | 'amber' | 'red'> = {
  LOW: 'neutral',
  NORMAL: 'blue',
  IMPORTANT: 'amber',
  HANDOVER: 'blue',
  URGENT: 'red',
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

export function printRequisition(id: string, paper: 'A4' | '80MM' = 'A4') {
  window.open(`/v1/admin/requisitions/${id}/print?paper=${paper}&autoprint=1`, '_blank', 'noopener');
}

export default function RequisitionsPage() {
  const qc = useQueryClient();
  const can = useCan();
  const me = useMe();

  const [tab, setTab] = useState<'REQUISITIONS' | 'COMMS' | 'DEVICES'>('REQUISITIONS');
  const [statusFilter, setStatusFilter] = useState<'ALL' | RequisitionStatus>('ALL');
  const [deptFilter, setDeptFilter] = useState<string>('ALL');
  const [priorityFilter, setPriorityFilter] = useState<string>('ALL');
  const [mineOnly, setMineOnly] = useState(false);
  const [search, setSearch] = useState('');

  const [newReqOpen, setNewReqOpen] = useState(false);
  const [newCommOpen, setNewCommOpen] = useState(false);
  const [selectedReq, setSelectedReq] = useState<RequisitionDTO | null>(null);
  const [rejectingReq, setRejectingReq] = useState<RequisitionDTO | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');

  const { data: requisitions, isLoading: reqLoading } = useQuery({
    queryKey: ['requisitions'],
    queryFn: () => get<RequisitionDTO[]>('/requisitions'),
    refetchInterval: 15_000,
  });

  const { data: comms, isLoading: commsLoading } = useQuery({
    queryKey: ['announcements'],
    queryFn: () => get<StaffAnnouncementDTO[]>('/announcements'),
  });

  const { data: devices, isLoading: devLoading } = useQuery({
    queryKey: ['devices'],
    queryFn: () => get<TerminalDeviceDTO[]>('/devices'),
  });

  const { data: inventory } = useQuery({
    queryKey: ['inventory'],
    queryFn: () => get<InventoryDashboardDTO>('/inventory'),
  });

  const actOnReq = useMutation({
    mutationFn: ({
      id,
      action,
      rejectionReason,
    }: {
      id: string;
      action: 'MANAGER_APPROVE' | 'DIRECTOR_APPROVE' | 'REJECT' | 'DISBURSE' | 'CANCEL';
      rejectionReason?: string;
    }) => post<RequisitionDTO>(`/requisitions/${id}/review`, { action, rejectionReason }),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['requisitions'] });
      qc.invalidateQueries({ queryKey: ['inventory'] });
      if (selectedReq?.id === r.id) setSelectedReq(r);
      setRejectingReq(null);
      setRejectionReason('');
      toast.success(`${r.number} → ${r.status.replace(/_/g, ' ')}`);
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Action failed'),
  });

  const stats = useMemo(() => {
    const list = requisitions ?? [];
    const pending = list.filter((r) => r.status === 'PENDING').length;
    const approved = list.filter((r) =>
      ['MANAGER_APPROVED', 'DIRECTOR_APPROVED'].includes(r.status),
    ).length;
    const disbursed = list.filter((r) => r.status === 'DISBURSED').length;
    const totalMinor = list
      .filter((r) => r.status !== 'REJECTED')
      .reduce((acc, r) => acc + BigInt(r.totalEstimatedMinor), 0n);
    return { pending, approved, disbursed, totalMinor };
  }, [requisitions]);

  const filteredReqs = useMemo(() => {
    return (requisitions ?? []).filter((r) => {
      if (statusFilter !== 'ALL' && r.status !== statusFilter) return false;
      if (deptFilter !== 'ALL' && r.department !== deptFilter) return false;
      if (priorityFilter !== 'ALL' && r.priority !== priorityFilter) return false;
      if (mineOnly && r.requestedById !== me.id && !r.requestedByName.toLowerCase().includes(me.name.toLowerCase())) {
        return false;
      }
      if (search.trim()) {
        const q = search.toLowerCase();
        return (
          r.number.toLowerCase().includes(q) ||
          r.title.toLowerCase().includes(q) ||
          r.requestedByName.toLowerCase().includes(q) ||
          (r.notes ?? '').toLowerCase().includes(q) ||
          r.items.some((i) => i.itemName.toLowerCase().includes(q))
        );
      }
      return true;
    });
  }, [requisitions, statusFilter, deptFilter, priorityFilter, mineOnly, search, me.id, me.name]);

  const hasActiveFilters =
    statusFilter !== 'ALL' ||
    deptFilter !== 'ALL' ||
    priorityFilter !== 'ALL' ||
    mineOnly ||
    search.trim().length > 0;

  const resetFilters = () => {
    setStatusFilter('ALL');
    setDeptFilter('ALL');
    setPriorityFilter('ALL');
    setMineOnly(false);
    setSearch('');
  };

  return (
    <div className="fade-in">
      <PageHeader
        title="Requisitions, Handover & Terminals"
        description="Departmental supplies, procurement vouchers, store restock, and device terminals"
        actions={
          <div className="flex items-center gap-2">
            {tab === 'REQUISITIONS' && can('requisitions:request') && (
              <Button
                variant="primary"
                icon={<Plus className="size-3.5" />}
                onClick={() => setNewReqOpen(true)}
              >
                New Requisition
              </Button>
            )}
            {tab === 'COMMS' && (
              <Button
                variant="primary"
                icon={<Megaphone className="size-3.5" />}
                onClick={() => setNewCommOpen(true)}
              >
                Post Shift Note
              </Button>
            )}
          </div>
        }
      />

      {/* KPI Summary Strip */}
      <div className="mb-4 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <button
          type="button"
          onClick={() => setStatusFilter(statusFilter === 'PENDING' ? 'ALL' : 'PENDING')}
          className={`card px-3.5 py-2.5 text-left transition ${
            statusFilter === 'PENDING' ? '!border-fg ring-1 ring-fg' : 'hover:border-line-strong'
          }`}
        >
          <span className="text-[11px] font-medium text-fg-muted">Pending Approval</span>
          <p className="mt-0.5 text-[1.2rem] font-bold tabular text-warning">{stats.pending}</p>
        </button>

        <button
          type="button"
          onClick={() => setStatusFilter(statusFilter === 'MANAGER_APPROVED' ? 'ALL' : 'MANAGER_APPROVED')}
          className={`card px-3.5 py-2.5 text-left transition ${
            statusFilter === 'MANAGER_APPROVED' ? '!border-fg ring-1 ring-fg' : 'hover:border-line-strong'
          }`}
        >
          <span className="text-[11px] font-medium text-fg-muted">Approved (Awaiting Issue)</span>
          <p className="mt-0.5 text-[1.2rem] font-bold tabular text-info">{stats.approved}</p>
        </button>

        <button
          type="button"
          onClick={() => setStatusFilter(statusFilter === 'DISBURSED' ? 'ALL' : 'DISBURSED')}
          className={`card px-3.5 py-2.5 text-left transition ${
            statusFilter === 'DISBURSED' ? '!border-fg ring-1 ring-fg' : 'hover:border-line-strong'
          }`}
        >
          <span className="text-[11px] font-medium text-fg-muted">Disbursed & Restocked</span>
          <p className="mt-0.5 text-[1.2rem] font-bold tabular text-success">{stats.disbursed}</p>
        </button>

        <div className="card px-3.5 py-2.5">
          <span className="text-[11px] font-medium text-fg-muted">Total Requisition Value</span>
          <p className="mt-0.5 text-[1.2rem] font-bold tabular">
            {money(stats.totalMinor.toString(), 'UGX')}
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
              value: 'REQUISITIONS',
              label: 'Requisitions',
              count: requisitions?.length ?? 0,
            },
            {
              value: 'COMMS',
              label: 'Shift Handover',
              count: comms?.length ?? 0,
            },
            {
              value: 'DEVICES',
              label: 'POS & Printers',
              count: devices?.length ?? 0,
            },
          ]}
        />

        {tab === 'REQUISITIONS' && (
          <div>
            {/* Status Tabs Header */}
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-surface-2/40 px-3 py-2">
              <div className="flex flex-wrap items-center gap-1.5">
                {(
                  [
                    { v: 'ALL', l: 'All' },
                    { v: 'PENDING', l: `Pending (${stats.pending})` },
                    { v: 'MANAGER_APPROVED', l: 'Manager Approved' },
                    { v: 'DIRECTOR_APPROVED', l: 'Director Approved' },
                    { v: 'DISBURSED', l: 'Disbursed' },
                    { v: 'REJECTED', l: 'Rejected' },
                  ] as const
                ).map((st) => (
                  <button
                    key={st.v}
                    type="button"
                    onClick={() => setStatusFilter(st.v)}
                    className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors ${
                      statusFilter === st.v
                        ? 'bg-fg text-bg'
                        : 'text-fg-muted hover:bg-surface-2 hover:text-fg'
                    }`}
                  >
                    {st.l}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-2">
                <span className="text-[11px] font-medium text-fg-muted">
                  {filteredReqs.length} record{filteredReqs.length === 1 ? '' : 's'}
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

            {/* Filter Controls Strip */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 border-b border-line bg-surface px-3 py-2 text-xs">
              {/* Quick Search */}
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-fg-subtle" />
                <input
                  className="input !h-8 !min-h-0 w-full pl-8 text-xs bg-surface-2/50"
                  placeholder="Search req #, item, requester…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>

              {/* Department Filter */}
              <div className="flex items-center gap-1.5">
                <SlidersHorizontal className="size-3.5 text-fg-subtle shrink-0" />
                <select
                  className="input !h-8 !min-h-0 w-full py-0 text-xs bg-surface-2/50"
                  value={deptFilter}
                  onChange={(e) => setDeptFilter(e.target.value)}
                  aria-label="Filter by department"
                >
                  <option value="ALL">All Departments</option>
                  <option value="KITCHEN">Kitchen</option>
                  <option value="BAR">Bar & Lounge</option>
                  <option value="HEALTH_CLUB">Health Club & Spa</option>
                  <option value="HOUSEKEEPING">Housekeeping</option>
                  <option value="FRONT_DESK">Front Desk</option>
                  <option value="CONFERENCE">Conference & Events</option>
                  <option value="MAINTENANCE">Maintenance</option>
                  <option value="ENERGY_UTILITIES">Energy & Utilities</option>
                </select>
              </div>

              {/* Priority Filter */}
              <div className="flex items-center gap-1.5">
                <AlertTriangle className="size-3.5 text-fg-subtle shrink-0" />
                <select
                  className="input !h-8 !min-h-0 w-full py-0 text-xs bg-surface-2/50"
                  value={priorityFilter}
                  onChange={(e) => setPriorityFilter(e.target.value)}
                  aria-label="Filter by priority"
                >
                  <option value="ALL">All Priorities</option>
                  <option value="URGENT">Urgent / Critical</option>
                  <option value="NORMAL">Normal</option>
                  <option value="LOW">Low</option>
                </select>
              </div>

              {/* My Requisitions Toggle */}
              <div className="flex items-center">
                <button
                  type="button"
                  onClick={() => setMineOnly(!mineOnly)}
                  className={`flex h-8 w-full items-center justify-center gap-1.5 rounded-lg border px-3 text-[11px] font-medium transition ${
                    mineOnly
                      ? 'border-fg bg-fg text-bg'
                      : 'border-line bg-surface-2/50 text-fg-muted hover:text-fg'
                  }`}
                >
                  <User className="size-3" />
                  {mineOnly ? 'Showing: My Requests Only' : 'Filter: My Requests'}
                </button>
              </div>
            </div>
          </div>
        )}

        <div>
          {tab === 'REQUISITIONS' ? (
            reqLoading ? (
              <div className="p-4">
                <Skeleton className="h-48" />
              </div>
            ) : !filteredReqs.length ? (
              <Empty
                icon={<ClipboardCheck className="size-4" />}
                title="No matching requisitions"
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
                      <th className="px-3.5 py-2">Req #</th>
                      <th className="px-3.5 py-2">Dept</th>
                      <th className="px-3.5 py-2">Title & Line Items</th>
                      <th className="px-3.5 py-2">Requested By</th>
                      <th className="px-3.5 py-2">Status & Approvals</th>
                      <th className="px-3.5 py-2 text-right">Est. Cost</th>
                      <th className="px-3.5 py-2 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {filteredReqs.map((r) => {
                      const isOwner = r.requestedById === me.id || r.requestedByName.toLowerCase().includes(me.name.toLowerCase());
                      const canApprove = can('requisitions:approve');
                      return (
                        <tr
                          key={r.id}
                          onClick={() => setSelectedReq(r)}
                          className="align-middle hover:bg-surface-2/40 transition-colors cursor-pointer"
                        >
                          <td className="px-3.5 py-2.5 font-mono text-[12px] font-semibold whitespace-nowrap">
                            <span className="hover:underline">{r.number}</span>
                            <div className="mt-0.5">
                              <Pill tone={PRIORITY_TONE[r.priority] ?? 'neutral'}>
                                {r.priority}
                              </Pill>
                            </div>
                          </td>
                          <td className="px-3.5 py-2.5 whitespace-nowrap">
                            <Pill tone="neutral">{DEPT_LABELS[r.department] ?? r.department}</Pill>
                          </td>
                          <td className="px-3.5 py-2.5">
                            <p className="font-semibold text-fg">{r.title}</p>
                            <div className="mt-1 flex flex-wrap gap-1">
                              {r.items.map((it) => (
                                <span
                                  key={it.id}
                                  className="inline-flex items-center gap-1 rounded border border-line bg-surface-2/60 px-1.5 py-0.5 text-[11px] text-fg-muted"
                                >
                                  <strong className="font-mono text-fg">
                                    {it.quantityRequested} {it.unit}
                                  </strong>{' '}
                                  {it.itemName}
                                </span>
                              ))}
                            </div>
                          </td>
                          <td className="px-3.5 py-2.5 whitespace-nowrap text-[12px]">
                            <p className="font-medium text-fg">{r.requestedByName}</p>
                            <p className="text-[11px] text-fg-subtle">{dateTime(r.createdAt)}</p>
                          </td>
                          <td className="px-3.5 py-2.5 whitespace-nowrap">
                            <Pill tone={STATUS_TONE[r.status]} dot>
                              {r.status.replace(/_/g, ' ')}
                            </Pill>
                            {(r.managerApprovedBy || r.directorApprovedBy || r.disbursedBy) && (
                              <p className="mt-0.5 text-[10.5px] text-fg-subtle">
                                {r.managerApprovedBy ? `Mgr: ${r.managerApprovedBy}` : ''}
                                {r.directorApprovedBy ? ` · Dir: ${r.directorApprovedBy}` : ''}
                                {r.disbursedBy ? ` · Issued: ${r.disbursedBy}` : ''}
                              </p>
                            )}
                            {r.rejectionReason && (
                              <p className="mt-0.5 text-[10.5px] text-danger max-w-[180px] truncate" title={r.rejectionReason}>
                                {r.rejectionReason}
                              </p>
                            )}
                          </td>
                          <td className="px-3.5 py-2.5 text-right font-mono font-semibold tabular whitespace-nowrap">
                            {money(r.totalEstimatedMinor, r.currency)}
                          </td>
                          <td
                            className="px-3.5 py-2.5 text-right whitespace-nowrap"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <div className="inline-flex items-center gap-1">
                              {/* Open Detail Modal */}
                              <Button
                                size="sm"
                                variant="secondary"
                                icon={<Eye className="size-3" />}
                                onClick={() => setSelectedReq(r)}
                              >
                                View
                              </Button>

                              {/* Print Voucher */}
                              <Button
                                size="sm"
                                variant="ghost"
                                icon={<Printer className="size-3" />}
                                title="Print A4 Voucher"
                                onClick={() => printRequisition(r.id, 'A4')}
                              />

                              {/* Manager / Director Approve Action */}
                              {canApprove && r.status === 'PENDING' && (
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  icon={<Check className="size-3" />}
                                  loading={actOnReq.isPending}
                                  onClick={() =>
                                    actOnReq.mutate({ id: r.id, action: 'MANAGER_APPROVE' })
                                  }
                                >
                                  Approve
                                </Button>
                              )}

                              {canApprove && (r.status === 'MANAGER_APPROVED' || r.status === 'DIRECTOR_APPROVED') && (
                                <Button
                                  size="sm"
                                  variant="primary"
                                  icon={<PackageCheck className="size-3" />}
                                  loading={actOnReq.isPending}
                                  onClick={() =>
                                    actOnReq.mutate({ id: r.id, action: 'DISBURSE' })
                                  }
                                >
                                  Disburse
                                </Button>
                              )}

                              {canApprove && !['DISBURSED', 'REJECTED'].includes(r.status) && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="text-danger hover:bg-danger/10"
                                  icon={<X className="size-3" />}
                                  title="Reject with reason"
                                  onClick={() => setRejectingReq(r)}
                                />
                              )}

                              {/* Requester Cancel Option */}
                              {!canApprove && isOwner && r.status === 'PENDING' && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="text-danger hover:bg-danger/10"
                                  icon={<Ban className="size-3" />}
                                  onClick={() =>
                                    actOnReq.mutate({
                                      id: r.id,
                                      action: 'CANCEL',
                                      rejectionReason: 'Cancelled by requester',
                                    })
                                  }
                                >
                                  Cancel
                                </Button>
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
          ) : tab === 'COMMS' ? (
            commsLoading ? (
              <div className="p-4">
                <Skeleton className="h-40" />
              </div>
            ) : !comms?.length ? (
              <Empty icon={<Megaphone className="size-4" />} title="No shift notes" />
            ) : (
              <div className="divide-y divide-line">
                {comms.map((c) => (
                  <div key={c.id} className="flex items-start justify-between gap-4 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        {c.isPinned && <Pill tone="amber">Pinned</Pill>}
                        <Pill tone={PRIORITY_TONE[c.priority] ?? 'neutral'}>{c.priority}</Pill>
                        <Pill tone="neutral">{c.department ? DEPT_LABELS[c.department] ?? c.department : 'ALL'}</Pill>
                        <span className="text-[13px] font-semibold">{c.title}</span>
                      </div>
                      <p className="mt-1 text-[12.5px] text-fg-muted">{c.body}</p>
                    </div>
                    <div className="shrink-0 text-right text-[11px] text-fg-subtle">
                      <p className="font-medium text-fg">{c.authorName}</p>
                      <p>{dateTime(c.createdAt)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )
          ) : devLoading ? (
            <div className="p-4">
              <Skeleton className="h-40" />
            </div>
          ) : !devices?.length ? (
            <Empty icon={<Laptop className="size-4" />} title="No terminals registered" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-[12.5px]">
                <thead className="border-b border-line bg-surface-2/40 text-[11px] font-semibold uppercase tracking-wider text-fg-subtle">
                  <tr>
                    <th className="px-3.5 py-2">Code</th>
                    <th className="px-3.5 py-2">Terminal Name</th>
                    <th className="px-3.5 py-2">Department</th>
                    <th className="px-3.5 py-2">Type</th>
                    <th className="px-3.5 py-2">Paper Format</th>
                    <th className="px-3.5 py-2">IP / Port</th>
                    <th className="px-3.5 py-2">Last Seen</th>
                    <th className="px-3.5 py-2 text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {devices.map((d) => (
                    <tr key={d.id} className="hover:bg-surface-2/30">
                      <td className="px-3.5 py-2.5 font-mono text-[12px] font-bold text-accent">
                        {d.code}
                      </td>
                      <td className="px-3.5 py-2.5 font-semibold">{d.name}</td>
                      <td className="px-3.5 py-2.5">
                        <Pill tone="neutral">{DEPT_LABELS[d.department] ?? d.department}</Pill>
                      </td>
                      <td className="px-3.5 py-2.5 text-fg-muted">{d.kind}</td>
                      <td className="px-3.5 py-2.5">
                        <Pill tone="blue">
                          <Printer className="mr-1 size-3" /> {d.paperSize}
                        </Pill>
                      </td>
                      <td className="px-3.5 py-2.5 font-mono text-[12px]">
                        {d.ipOrPort ?? 'DHCP'}
                      </td>
                      <td className="px-3.5 py-2.5 text-[11.5px] text-fg-subtle">
                        {dateTime(d.lastSeenAt)}
                      </td>
                      <td className="px-3.5 py-2.5 text-right">
                        <Pill tone={d.status === 'ONLINE' ? 'green' : 'neutral'} dot>
                          {d.status}
                        </Pill>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Requisition Detail & Approval Drawer */}
      <RequisitionDetailDialog
        req={selectedReq}
        onClose={() => setSelectedReq(null)}
        onApprove={(action, rejectionReason) => {
          if (selectedReq) {
            actOnReq.mutate({ id: selectedReq.id, action, rejectionReason });
          }
        }}
        isPending={actOnReq.isPending}
      />

      {/* Reject Modal */}
      {rejectingReq && (
        <Dialog
          open={!!rejectingReq}
          onClose={() => {
            setRejectingReq(null);
            setRejectionReason('');
          }}
          title={`Reject Requisition ${rejectingReq.number}`}
          description="Provide a clear reason for the department requester."
          footer={
            <>
              <Button variant="ghost" onClick={() => setRejectingReq(null)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                className="bg-danger hover:bg-danger/90 text-white"
                loading={actOnReq.isPending}
                disabled={!rejectionReason.trim()}
                onClick={() =>
                  actOnReq.mutate({
                    id: rejectingReq.id,
                    action: 'REJECT',
                    rejectionReason: rejectionReason.trim(),
                  })
                }
              >
                Confirm Rejection
              </Button>
            </>
          }
        >
          <div className="grid gap-3">
            <TextArea
              label="Rejection Reason"
              required
              rows={3}
              placeholder="e.g. Budget ceiling reached, alternative stock available in central store..."
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
            />
          </div>
        </Dialog>
      )}

      {/* Submit Requisition Dialog */}
      <CreateRequisitionDialog
        open={newReqOpen}
        onClose={() => setNewReqOpen(false)}
        inventoryItems={inventory?.items ?? []}
        onSuccess={() => {
          setNewReqOpen(false);
          qc.invalidateQueries({ queryKey: ['requisitions'] });
        }}
      />

      {/* Post Shift Note Dialog */}
      <CreateAnnouncementDialog
        open={newCommOpen}
        onClose={() => setNewCommOpen(false)}
        onSuccess={() => {
          setNewCommOpen(false);
          qc.invalidateQueries({ queryKey: ['announcements'] });
        }}
      />
    </div>
  );
}

/** Rich Requisition Detail Modal with Workflow Stepper, Breakdown & Actions */
function RequisitionDetailDialog({
  req,
  onClose,
  onApprove,
  isPending,
}: {
  req: RequisitionDTO | null;
  onClose: () => void;
  onApprove: (action: 'MANAGER_APPROVE' | 'DIRECTOR_APPROVE' | 'DISBURSE' | 'CANCEL' | 'REJECT', reason?: string) => void;
  isPending: boolean;
}) {
  const can = useCan();
  const me = useMe();
  if (!req) return null;

  const isOwner = req.requestedById === me.id || req.requestedByName.toLowerCase().includes(me.name.toLowerCase());
  const canApprove = can('requisitions:approve');

  return (
    <Dialog
      open={!!req}
      onClose={onClose}
      size="lg"
      title={`${req.number} · ${req.title}`}
      description={`${DEPT_LABELS[req.department] ?? req.department} · Requested by ${req.requestedByName}`}
      footer={
        <div className="flex w-full flex-wrap items-center justify-between gap-2">
          {/* Print Shortcuts */}
          <div className="flex items-center gap-1.5">
            <Button
              size="sm"
              variant="secondary"
              icon={<Printer className="size-3.5" />}
              onClick={() => printRequisition(req.id, 'A4')}
            >
              Print A4 Voucher
            </Button>
            <Button
              size="sm"
              variant="ghost"
              icon={<Printer className="size-3.5" />}
              onClick={() => printRequisition(req.id, '80MM')}
            >
              80mm Slip
            </Button>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={onClose}>
              Close
            </Button>

            {!canApprove && isOwner && req.status === 'PENDING' && (
              <Button
                variant="secondary"
                className="text-danger border-danger/30 hover:bg-danger/10"
                icon={<Ban className="size-3.5" />}
                loading={isPending}
                onClick={() => onApprove('CANCEL', 'Cancelled by requester')}
              >
                Cancel Requisition
              </Button>
            )}

            {canApprove && req.status === 'PENDING' && (
              <>
                <Button
                  variant="secondary"
                  className="text-danger border-danger/30 hover:bg-danger/10"
                  icon={<X className="size-3.5" />}
                  loading={isPending}
                  onClick={() => onApprove('REJECT', 'Declined by department head')}
                >
                  Reject
                </Button>
                <Button
                  variant="secondary"
                  icon={<Check className="size-3.5" />}
                  loading={isPending}
                  onClick={() => onApprove('MANAGER_APPROVE')}
                >
                  Manager Approve
                </Button>
              </>
            )}

            {canApprove && req.status === 'MANAGER_APPROVED' && (
              <>
                <Button
                  variant="secondary"
                  icon={<CheckCheck className="size-3.5" />}
                  loading={isPending}
                  onClick={() => onApprove('DIRECTOR_APPROVE')}
                >
                  Director Approve
                </Button>
                <Button
                  variant="primary"
                  icon={<PackageCheck className="size-3.5" />}
                  loading={isPending}
                  onClick={() => onApprove('DISBURSE')}
                >
                  Disburse & Issue
                </Button>
              </>
            )}

            {canApprove && req.status === 'DIRECTOR_APPROVED' && (
              <Button
                variant="primary"
                icon={<PackageCheck className="size-3.5" />}
                loading={isPending}
                onClick={() => onApprove('DISBURSE')}
              >
                Disburse & Restock
              </Button>
            )}
          </div>
        </div>
      }
    >
      <div className="grid gap-4 text-xs">
        {/* Status Stepper */}
        <div className="rounded-xl border border-line bg-surface-2/40 p-3.5">
          <div className="mb-2 flex items-center justify-between">
            <span className="font-semibold text-fg">Approval & Restock Workflow</span>
            <Pill tone={STATUS_TONE[req.status]} dot>
              {req.status.replace(/_/g, ' ')}
            </Pill>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 pt-2 border-t border-line text-[11px]">
            {/* 1. Initiated */}
            <div className="rounded-lg border border-line bg-surface p-2">
              <span className="font-semibold text-fg">1. Submitted</span>
              <p className="mt-0.5 text-fg-muted font-medium">{req.requestedByName}</p>
              <p className="text-[10px] text-fg-subtle">{dateTime(req.createdAt)}</p>
            </div>

            {/* 2. Manager Approval */}
            <div className={`rounded-lg border p-2 ${
              req.managerApprovedBy ? 'border-line bg-surface' : 'border-dashed border-line bg-surface-2/30 text-fg-subtle'
            }`}>
              <span className="font-semibold text-fg">2. Mgr Approval</span>
              <p className="mt-0.5 font-medium">{req.managerApprovedBy ?? 'Awaiting Review'}</p>
              <p className="text-[10px] text-fg-subtle">
                {req.managerApprovedAt ? dateTime(req.managerApprovedAt) : 'Pending'}
              </p>
            </div>

            {/* 3. Director Approval */}
            <div className={`rounded-lg border p-2 ${
              req.directorApprovedBy ? 'border-line bg-surface' : 'border-dashed border-line bg-surface-2/30 text-fg-subtle'
            }`}>
              <span className="font-semibold text-fg">3. Dir Authorization</span>
              <p className="mt-0.5 font-medium">
                {req.directorApprovedBy ?? (req.managerApprovedBy ? 'Optional / Direct' : 'Pending')}
              </p>
              <p className="text-[10px] text-fg-subtle">
                {req.directorApprovedAt ? dateTime(req.directorApprovedAt) : 'Pending'}
              </p>
            </div>

            {/* 4. Disbursed */}
            <div className={`rounded-lg border p-2 ${
              req.disbursedBy ? 'border-line bg-surface' : 'border-dashed border-line bg-surface-2/30 text-fg-subtle'
            }`}>
              <span className="font-semibold text-fg">4. Disbursed & Issued</span>
              <p className="mt-0.5 font-medium">{req.disbursedBy ?? 'Awaiting Stores'}</p>
              <p className="text-[10px] text-fg-subtle">
                {req.disbursedAt ? dateTime(req.disbursedAt) : 'Pending Issue'}
              </p>
            </div>
          </div>

          {req.rejectionReason && (
            <div className="mt-2.5 rounded-lg border border-danger/30 bg-danger/10 p-2.5 text-danger">
              <strong className="block font-semibold">Rejection / Cancellation Reason:</strong>
              <p className="mt-0.5 text-[11.5px]">{req.rejectionReason}</p>
            </div>
          )}
        </div>

        {/* Metadata Details */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 rounded-lg border border-line bg-surface p-3">
          <div>
            <span className="block text-[10.5px] font-semibold text-fg-subtle uppercase">Department</span>
            <span className="font-medium text-fg">{DEPT_LABELS[req.department] ?? req.department}</span>
          </div>
          <div>
            <span className="block text-[10.5px] font-semibold text-fg-subtle uppercase">Priority</span>
            <Pill tone={PRIORITY_TONE[req.priority] ?? 'neutral'}>{req.priority}</Pill>
          </div>
          <div>
            <span className="block text-[10.5px] font-semibold text-fg-subtle uppercase">Total Line Items</span>
            <span className="font-semibold text-fg">{req.items.length} items</span>
          </div>
          <div>
            <span className="block text-[10.5px] font-semibold text-fg-subtle uppercase">Total Estimated</span>
            <span className="font-mono font-bold text-fg">{money(req.totalEstimatedMinor, req.currency)}</span>
          </div>
        </div>

        {/* Notes / Purpose */}
        {req.notes && (
          <div className="rounded-lg border border-line bg-surface-2/50 p-3">
            <span className="block text-[10.5px] font-semibold text-fg-subtle uppercase">Justification & Purpose</span>
            <p className="mt-1 text-[12px] text-fg leading-relaxed">{req.notes}</p>
          </div>
        )}

        {/* Itemized Table */}
        <div className="rounded-lg border border-line overflow-hidden">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-line bg-surface-2/60 text-[11px] font-semibold uppercase tracking-wider text-fg-subtle">
              <tr>
                <th className="px-3 py-2 w-10 text-center">#</th>
                <th className="px-3 py-2">Item Description</th>
                <th className="px-3 py-2 text-center">Unit</th>
                <th className="px-3 py-2 text-center">Qty Req.</th>
                <th className="px-3 py-2 text-center">Qty Appr.</th>
                <th className="px-3 py-2 text-right">Unit Price</th>
                <th className="px-3 py-2 text-right">Total (UGX)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {req.items.map((it, idx) => (
                <tr key={it.id} className="hover:bg-surface-2/20">
                  <td className="px-3 py-2 text-center font-mono text-fg-subtle">{idx + 1}</td>
                  <td className="px-3 py-2 font-medium text-fg">
                    {it.itemName}
                    {it.inventoryItemId && (
                      <span className="ml-1.5 text-[10.5px] text-fg-subtle font-normal">(Central Stock SKU)</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-center text-fg-muted">{it.unit}</td>
                  <td className="px-3 py-2 text-center font-mono font-semibold">{it.quantityRequested}</td>
                  <td className="px-3 py-2 text-center font-mono font-bold text-success">
                    {it.quantityApproved ?? it.quantityRequested}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-fg-muted">
                    {money(it.estimatedUnitMinor, req.currency)}
                  </td>
                  <td className="px-3 py-2 text-right font-mono font-bold text-fg">
                    {money(it.totalEstimatedMinor, req.currency)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t border-line bg-surface-2/40 font-semibold">
              <tr>
                <td colSpan={6} className="px-3 py-2.5 text-right uppercase tracking-wider text-fg-subtle text-[11px]">
                  Estimated Grand Total:
                </td>
                <td className="px-3 py-2.5 text-right font-mono text-sm font-bold text-fg">
                  {money(req.totalEstimatedMinor, req.currency)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </Dialog>
  );
}

function CreateRequisitionDialog({
  open,
  onClose,
  inventoryItems,
  onSuccess,
}: {
  open: boolean;
  onClose: () => void;
  inventoryItems: InventoryItemDTO[];
  onSuccess: () => void;
}) {
  const [department, setDepartment] = useState<Department>('KITCHEN');
  const [title, setTitle] = useState('');
  const [priority, setPriority] = useState<'LOW' | 'NORMAL' | 'URGENT'>('NORMAL');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState([
    {
      inventoryItemId: '',
      itemName: '',
      quantityRequested: '1',
      unit: 'PIECE',
      estUnitMajor: '0',
    },
  ]);

  const totalEstimatedUGX = useMemo(() => {
    return lines.reduce((acc, l) => {
      const q = Number(l.quantityRequested) || 0;
      const p = Number(l.estUnitMajor) || 0;
      return acc + q * p;
    }, 0);
  }, [lines]);

  const m = useMutation({
    mutationFn: () =>
      post('/requisitions', {
        department,
        title: title.trim(),
        priority,
        notes: notes.trim() || undefined,
        items: lines.map((l) => ({
          inventoryItemId: l.inventoryItemId || undefined,
          itemName: l.itemName.trim(),
          quantityRequested: Number(l.quantityRequested) || 1,
          unit: l.unit.trim() || 'PIECE',
          estimatedUnitMinor: toMinorStr(l.estUnitMajor, 'UGX') ?? '0',
        })),
      }),
    onSuccess: () => {
      toast.success('Requisition submitted to management');
      onSuccess();
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Failed to submit requisition'),
  });

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="lg"
      title="Submit Department Requisition"
      description="Request store issue or external procurement for hotel operations."
      footer={
        <div className="flex w-full items-center justify-between">
          <div className="text-xs">
            <span className="text-fg-muted font-medium">Estimated Total: </span>
            <span className="font-mono font-bold text-fg text-sm">
              UGX {totalEstimatedUGX.toLocaleString('en-UG')}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button
              variant="primary"
              loading={m.isPending}
              disabled={!title.trim() || lines.some((l) => !l.itemName.trim())}
              onClick={() => m.mutate()}
            >
              Submit Requisition
            </Button>
          </div>
        </div>
      }
    >
      <div className="grid gap-3 text-xs">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
          <SelectInput
            label="Department"
            value={department}
            onChange={(e) => setDepartment(e.target.value as Department)}
          >
            <option value="KITCHEN">Kitchen</option>
            <option value="BAR">Bar & Lounge</option>
            <option value="HEALTH_CLUB">Health Club & Spa</option>
            <option value="HOUSEKEEPING">Housekeeping</option>
            <option value="FRONT_DESK">Front Desk</option>
            <option value="CONFERENCE">Conference & Events</option>
            <option value="MAINTENANCE">Maintenance</option>
            <option value="ENERGY_UTILITIES">Energy & Utilities</option>
          </SelectInput>

          <SelectInput
            label="Priority"
            value={priority}
            onChange={(e) => setPriority(e.target.value as 'LOW' | 'NORMAL' | 'URGENT')}
          >
            <option value="NORMAL">Normal</option>
            <option value="URGENT">Urgent (Restock Alert)</option>
            <option value="LOW">Low</option>
          </SelectInput>

          <TextInput
            label="Title"
            required
            placeholder="e.g. Weekly Fresh Produce Restock"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>

        <TextInput
          label="Purpose / Justification Notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="e.g. Urgent breakfast replenishment, anticipated 40-pax conference stay..."
        />

        <div className="rounded-lg border border-line p-3 bg-surface">
          <div className="mb-2 flex items-center justify-between">
            <div>
              <span className="text-[12px] font-semibold text-fg">Requested Items</span>
              <p className="text-[11px] text-fg-subtle">
                Pick from existing inventory SKUs to see current stock, or type custom items.
              </p>
            </div>
            <Button
              size="sm"
              variant="secondary"
              icon={<Plus className="size-3" />}
              onClick={() =>
                setLines((p) => [
                  ...p,
                  {
                    inventoryItemId: '',
                    itemName: '',
                    quantityRequested: '1',
                    unit: 'PIECE',
                    estUnitMajor: '0',
                  },
                ])
              }
            >
              Add Item
            </Button>
          </div>

          <div className="space-y-2">
            {lines.map((l, idx) => (
              <div
                key={idx}
                className="grid grid-cols-1 gap-2 sm:grid-cols-[12rem_1fr_4.5rem_5.5rem_6.5rem_auto] items-center"
              >
                {/* SKU Selector */}
                <select
                  className="input !h-8 !min-h-0 text-xs"
                  value={l.inventoryItemId}
                  onChange={(e) => {
                    const id = e.target.value;
                    const match = inventoryItems.find((x) => x.id === id);
                    setLines((prev) =>
                      prev.map((x, i) =>
                        i === idx
                          ? {
                              ...x,
                              inventoryItemId: id,
                              itemName: match ? match.name : x.itemName,
                              unit: match ? match.unit : x.unit,
                              estUnitMajor: match ? String(Math.round(Number(match.unitCostMinor) / 100)) : x.estUnitMajor,
                            }
                          : x,
                      ),
                    );
                  }}
                >
                  <option value="">— Custom Item —</option>
                  {inventoryItems.map((it) => (
                    <option key={it.id} value={it.id}>
                      {it.name} ({it.onHand} in stock)
                    </option>
                  ))}
                </select>

                <input
                  className="input !h-8 !min-h-0 text-xs"
                  placeholder="Item name"
                  value={l.itemName}
                  onChange={(e) =>
                    setLines((prev) =>
                      prev.map((x, i) => (i === idx ? { ...x, itemName: e.target.value } : x)),
                    )
                  }
                />

                <input
                  className="input !h-8 !min-h-0 text-xs font-mono"
                  type="number"
                  min={1}
                  placeholder="Qty"
                  value={l.quantityRequested}
                  onChange={(e) =>
                    setLines((prev) =>
                      prev.map((x, i) =>
                        i === idx ? { ...x, quantityRequested: e.target.value } : x,
                      ),
                    )
                  }
                />

                <select
                  className="input !h-8 !min-h-0 text-xs"
                  value={l.unit}
                  onChange={(e) =>
                    setLines((prev) =>
                      prev.map((x, i) => (i === idx ? { ...x, unit: e.target.value } : x)),
                    )
                  }
                >
                  <option value="PIECE">PIECE</option>
                  <option value="KG">KG</option>
                  <option value="LITRE">LITRE</option>
                  <option value="PACK">PACK</option>
                  <option value="BOX">BOX</option>
                  <option value="BOTTLE">BOTTLE</option>
                  <option value="PAIR">PAIR</option>
                  <option value="TRAY">TRAY</option>
                  <option value="BUNDLE">BUNDLE</option>
                  <option value="DOZEN">DOZEN</option>
                </select>

                <input
                  className="input !h-8 !min-h-0 text-xs font-mono"
                  placeholder="Unit UGX"
                  value={l.estUnitMajor}
                  onChange={(e) =>
                    setLines((prev) =>
                      prev.map((x, i) => (i === idx ? { ...x, estUnitMajor: e.target.value } : x)),
                    )
                  }
                />

                {lines.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setLines((p) => p.filter((_, i) => i !== idx))}
                    className="grid size-8 place-items-center rounded-md text-danger hover:bg-danger/10"
                    title="Remove item"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </Dialog>
  );
}

function CreateAnnouncementDialog({
  open,
  onClose,
  onSuccess,
}: {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [department, setDepartment] = useState<'' | Department>('');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [priority, setPriority] = useState<'NORMAL' | 'IMPORTANT' | 'HANDOVER'>('NORMAL');
  const [isPinned, setIsPinned] = useState(false);

  const m = useMutation({
    mutationFn: () =>
      post('/announcements', {
        department: department || undefined,
        title: title.trim(),
        body: body.trim(),
        priority,
        isPinned,
      }),
    onSuccess: () => {
      toast.success('Shift note posted');
      onSuccess();
    },
  });

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="md"
      title="Post Shift Note"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            loading={m.isPending}
            disabled={!title.trim() || !body.trim()}
            onClick={() => m.mutate()}
          >
            Publish
          </Button>
        </>
      }
    >
      <div className="grid gap-3">
        <div className="grid grid-cols-2 gap-2.5">
          <SelectInput
            label="Department"
            value={department}
            onChange={(e) => setDepartment(e.target.value as '' | Department)}
          >
            <option value="">All Departments</option>
            <option value="FRONT_DESK">Front Desk</option>
            <option value="KITCHEN">Kitchen</option>
            <option value="BAR">Bar & Lounge</option>
            <option value="HEALTH_CLUB">Health Club & Spa</option>
            <option value="HOUSEKEEPING">Housekeeping</option>
            <option value="CONFERENCE">Conference & Events</option>
            <option value="MAINTENANCE">Maintenance</option>
          </SelectInput>
          <SelectInput
            label="Type"
            value={priority}
            onChange={(e) =>
              setPriority(e.target.value as 'NORMAL' | 'IMPORTANT' | 'HANDOVER')
            }
          >
            <option value="NORMAL">Normal</option>
            <option value="HANDOVER">Shift Handover</option>
            <option value="IMPORTANT">Important</option>
          </SelectInput>
        </div>
        <TextInput
          label="Headline"
          required
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <TextArea
          label="Details"
          rows={3}
          required
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
        <Switch label="Pin to top" checked={isPinned} onChange={setIsPinned} />
      </div>
    </Dialog>
  );
}
