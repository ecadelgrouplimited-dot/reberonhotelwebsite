'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Check, CheckCheck, ClipboardCheck, Laptop, Megaphone, PackageCheck, Plus, Printer, Search, Trash2, X,
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
import { useCan } from '@/lib/providers';
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

export default function RequisitionsPage() {
  const qc = useQueryClient();
  const can = useCan();
  const [tab, setTab] = useState<'REQUISITIONS' | 'COMMS' | 'DEVICES'>('REQUISITIONS');
  const [statusFilter, setStatusFilter] = useState<'ALL' | RequisitionStatus>('ALL');
  const [deptFilter, setDeptFilter] = useState<string>('ALL');
  const [search, setSearch] = useState('');
  const [newReqOpen, setNewReqOpen] = useState(false);
  const [newCommOpen, setNewCommOpen] = useState(false);

  const { data: requisitions, isLoading: reqLoading } = useQuery({
    queryKey: ['requisitions'],
    queryFn: () => get<RequisitionDTO[]>('/requisitions'),
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
    }: {
      id: string;
      action: 'MANAGER_APPROVE' | 'DIRECTOR_APPROVE' | 'REJECT' | 'DISBURSE';
    }) => post<RequisitionDTO>(`/requisitions/${id}/review`, { action }),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['requisitions'] });
      qc.invalidateQueries({ queryKey: ['inventory'] });
      toast.success(`${r.number} → ${r.status}`);
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
      if (search.trim()) {
        const q = search.toLowerCase();
        return (
          r.number.toLowerCase().includes(q) ||
          r.title.toLowerCase().includes(q) ||
          r.requestedByName.toLowerCase().includes(q) ||
          r.items.some((i) => i.itemName.toLowerCase().includes(q))
        );
      }
      return true;
    });
  }, [requisitions, statusFilter, deptFilter, search]);

  return (
    <div className="fade-in">
      <PageHeader
        title="Requisitions, Handover & Terminals"
        actions={
          <div className="flex items-center gap-2">
            {tab === 'REQUISITIONS' && (
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

      {/* Compact KPI Strip */}
      <div className="mb-4 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <div className="card px-3.5 py-2.5">
          <span className="text-[11px] font-medium text-fg-muted">Pending Approval</span>
          <p className="mt-0.5 text-[1.2rem] font-bold tabular">{stats.pending}</p>
        </div>
        <div className="card px-3.5 py-2.5">
          <span className="text-[11px] font-medium text-fg-muted">Approved (Awaiting Issue)</span>
          <p className="mt-0.5 text-[1.2rem] font-bold tabular text-info">{stats.approved}</p>
        </div>
        <div className="card px-3.5 py-2.5">
          <span className="text-[11px] font-medium text-fg-muted">Disbursed & Restocked</span>
          <p className="mt-0.5 text-[1.2rem] font-bold tabular text-success">{stats.disbursed}</p>
        </div>
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
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-surface-2/30 px-3 py-2">
            <div className="flex flex-wrap items-center gap-1.5">
              {(['ALL', 'PENDING', 'MANAGER_APPROVED', 'DIRECTOR_APPROVED', 'DISBURSED'] as const).map(
                (st) => (
                  <button
                    key={st}
                    type="button"
                    onClick={() => setStatusFilter(st)}
                    className={`rounded-md px-2 py-1 text-[11.5px] font-medium transition-colors ${
                      statusFilter === st
                        ? 'bg-fg text-bg'
                        : 'text-fg-muted hover:bg-surface-2 hover:text-fg'
                    }`}
                  >
                    {st === 'ALL' ? 'All' : st.replace('_', ' ')}
                  </button>
                ),
              )}
            </div>
            <div className="flex items-center gap-2">
              <select
                className="input !min-h-7 !w-36 !py-1 text-[12px]"
                value={deptFilter}
                onChange={(e) => setDeptFilter(e.target.value)}
              >
                <option value="ALL">All Departments</option>
                <option value="HEALTH_CLUB">HEALTH_CLUB</option>
                <option value="KITCHEN">KITCHEN</option>
                <option value="BAR">BAR</option>
                <option value="HOUSEKEEPING">HOUSEKEEPING</option>
                <option value="CONFERENCE">CONFERENCE</option>
                <option value="FRONT_DESK">FRONT_DESK</option>
                <option value="MAINTENANCE">MAINTENANCE</option>
              </select>
              <label className="relative w-52">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-fg-subtle" />
                <input
                  className="input !min-h-7 !py-1 pl-8 text-[12px]"
                  placeholder="Search req # or item…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </label>
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
                    {filteredReqs.map((r) => (
                      <tr key={r.id} className="align-middle hover:bg-surface-2/30">
                        <td className="px-3.5 py-2.5 font-mono text-[12px] font-semibold whitespace-nowrap">
                          {r.number}
                          <div className="mt-0.5">
                            <Pill tone={PRIORITY_TONE[r.priority] ?? 'neutral'}>{r.priority}</Pill>
                          </div>
                        </td>
                        <td className="px-3.5 py-2.5 whitespace-nowrap">
                          <Pill tone="neutral">{r.department}</Pill>
                        </td>
                        <td className="px-3.5 py-2.5">
                          <p className="font-semibold text-fg">{r.title}</p>
                          <div className="mt-1 flex flex-wrap gap-1">
                            {r.items.map((it) => (
                              <span
                                key={it.id}
                                className="inline-flex items-center gap-1 rounded border border-line bg-surface-2 px-1.5 py-0.5 text-[11px] text-fg-muted"
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
                          <p className="font-medium">{r.requestedByName}</p>
                          <p className="text-[11px] text-fg-subtle">{dateTime(r.createdAt)}</p>
                        </td>
                        <td className="px-3.5 py-2.5 whitespace-nowrap">
                          <Pill tone={STATUS_TONE[r.status]} dot>
                            {r.status.replace('_', ' ')}
                          </Pill>
                          {(r.managerApprovedBy || r.directorApprovedBy) && (
                            <p className="mt-0.5 text-[10.5px] text-fg-subtle">
                              {r.managerApprovedBy ? `Mgr: ${r.managerApprovedBy}` : ''}
                              {r.directorApprovedBy ? ` · Dir: ${r.directorApprovedBy}` : ''}
                            </p>
                          )}
                        </td>
                        <td className="px-3.5 py-2.5 text-right font-mono font-semibold tabular whitespace-nowrap">
                          {money(r.totalEstimatedMinor, r.currency)}
                        </td>
                        <td className="px-3.5 py-2.5 text-right whitespace-nowrap">
                          {can('requisitions:approve') &&
                          !['DISBURSED', 'REJECTED'].includes(r.status) ? (
                            <div className="inline-flex items-center gap-1">
                              {r.status === 'PENDING' && (
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  icon={<Check className="size-3" />}
                                  loading={actOnReq.isPending}
                                  onClick={() =>
                                    actOnReq.mutate({ id: r.id, action: 'MANAGER_APPROVE' })
                                  }
                                >
                                  Mgr Approve
                                </Button>
                              )}
                              {(r.status === 'PENDING' || r.status === 'MANAGER_APPROVED') && (
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  icon={<CheckCheck className="size-3" />}
                                  loading={actOnReq.isPending}
                                  onClick={() =>
                                    actOnReq.mutate({ id: r.id, action: 'DIRECTOR_APPROVE' })
                                  }
                                >
                                  Dir Approve
                                </Button>
                              )}
                              {(r.status === 'MANAGER_APPROVED' ||
                                r.status === 'DIRECTOR_APPROVED') && (
                                <Button
                                  size="sm"
                                  variant="primary"
                                  icon={<PackageCheck className="size-3" />}
                                  loading={actOnReq.isPending}
                                  onClick={() => actOnReq.mutate({ id: r.id, action: 'DISBURSE' })}
                                >
                                  Disburse
                                </Button>
                              )}
                              <Button
                                size="sm"
                                variant="ghost"
                                className="text-danger hover:bg-danger/10"
                                icon={<X className="size-3" />}
                                loading={actOnReq.isPending}
                                onClick={() => actOnReq.mutate({ id: r.id, action: 'REJECT' })}
                              />
                            </div>
                          ) : (
                            <span className="text-[11px] text-fg-subtle">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
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
                        <Pill tone="neutral">{c.department ?? 'ALL'}</Pill>
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
                        <Pill tone="neutral">{d.department}</Pill>
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

      <CreateRequisitionDialog
        open={newReqOpen}
        onClose={() => setNewReqOpen(false)}
        inventoryItems={inventory?.items ?? []}
        onSuccess={() => {
          setNewReqOpen(false);
          qc.invalidateQueries({ queryKey: ['requisitions'] });
        }}
      />

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
  const [department, setDepartment] = useState<Department>('HEALTH_CLUB');
  const [title, setTitle] = useState('');
  const [priority, setPriority] = useState<'LOW' | 'NORMAL' | 'URGENT'>('NORMAL');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState([
    {
      inventoryItemId: '',
      itemName: 'Disposable Non-Slip Spa Sandals (Pairs)',
      quantityRequested: '50',
      unit: 'PAIR',
      estUnitMajor: '3500',
    },
  ]);

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
      toast.success('Requisition submitted');
      onSuccess();
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Failed to submit requisition'),
  });

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="lg"
      title="New Department Requisition"
      footer={
        <>
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
        </>
      }
    >
      <div className="grid gap-3">
        <div className="grid grid-cols-3 gap-2.5">
          <SelectInput
            label="Department"
            value={department}
            onChange={(e) => setDepartment(e.target.value as Department)}
          >
            <option value="HEALTH_CLUB">HEALTH_CLUB</option>
            <option value="KITCHEN">KITCHEN</option>
            <option value="BAR">BAR</option>
            <option value="HOUSEKEEPING">HOUSEKEEPING</option>
            <option value="CONFERENCE">CONFERENCE</option>
            <option value="FRONT_DESK">FRONT_DESK</option>
            <option value="MAINTENANCE">MAINTENANCE</option>
          </SelectInput>
          <SelectInput
            label="Priority"
            value={priority}
            onChange={(e) => setPriority(e.target.value as 'LOW' | 'NORMAL' | 'URGENT')}
          >
            <option value="LOW">LOW</option>
            <option value="NORMAL">NORMAL</option>
            <option value="URGENT">URGENT</option>
          </SelectInput>
          <TextInput
            label="Title"
            required
            placeholder="e.g. Weekly Consumables Restock"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>

        <TextInput
          label="Notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Optional justification…"
        />

        <div className="rounded-lg border border-line p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[12px] font-semibold">Line Items</span>
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
                    quantityRequested: '10',
                    unit: 'PIECE',
                    estUnitMajor: '5000',
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
                className="grid grid-cols-1 gap-2 sm:grid-cols-[11rem_1fr_4.5rem_5.5rem_7rem_auto]"
              >
                <select
                  className="input"
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
                              estUnitMajor: match ? match.unitCostMinor : x.estUnitMajor,
                            }
                          : x,
                      ),
                    );
                  }}
                >
                  <option value="">— Custom item —</option>
                  {inventoryItems.map((it) => (
                    <option key={it.id} value={it.id}>
                      {it.sku} · {it.name}
                    </option>
                  ))}
                </select>
                <input
                  className="input"
                  placeholder="Item name"
                  value={l.itemName}
                  onChange={(e) =>
                    setLines((prev) =>
                      prev.map((x, i) => (i === idx ? { ...x, itemName: e.target.value } : x)),
                    )
                  }
                />
                <input
                  className="input"
                  type="number"
                  min={1}
                  value={l.quantityRequested}
                  onChange={(e) =>
                    setLines((prev) =>
                      prev.map((x, i) =>
                        i === idx ? { ...x, quantityRequested: e.target.value } : x,
                      ),
                    )
                  }
                />
                <input
                  className="input"
                  placeholder="Unit"
                  value={l.unit}
                  onChange={(e) =>
                    setLines((prev) =>
                      prev.map((x, i) => (i === idx ? { ...x, unit: e.target.value } : x)),
                    )
                  }
                />
                <input
                  className="input"
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
            <option value="FRONT_DESK">FRONT_DESK</option>
            <option value="KITCHEN">KITCHEN</option>
            <option value="BAR">BAR</option>
            <option value="HEALTH_CLUB">HEALTH_CLUB</option>
            <option value="HOUSEKEEPING">HOUSEKEEPING</option>
            <option value="CONFERENCE">CONFERENCE</option>
            <option value="MAINTENANCE">MAINTENANCE</option>
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
