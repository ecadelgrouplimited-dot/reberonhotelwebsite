'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Download,
  Edit3,
  ExternalLink,
  History,
  Plus,
  Search,
  ShieldAlert,
  Star,
  Trash2,
} from 'lucide-react';
import type { GuestSummaryDTO } from '@reberon/contracts';
import { del, get, patch } from '@/lib/api';
import { useCan, useMe } from '@/lib/providers';
import { ago, dateShort } from '@/lib/format';
import { money } from '@/lib/money';
import { exportToCsv } from '@/lib/export-csv';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Empty, PageHeader, Pill, Section, Skeleton } from '@/components/ui/bits';
import { Dialog } from '@/components/ui/dialog';

interface AuditRow {
  id: string;
  actor: { id: string; name: string; role?: string } | null;
  actorType: string;
  action: string;
  entityType: string | null;
  entityId: string | null;
  summary: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  createdAt: string;
}

export default function GuestsPage() {
  const router = useRouter();
  const me = useMe();
  const can = useCan();
  const qc = useQueryClient();

  const isOwner = me.role === 'OWNER';
  const canDeleteGuest = me.role === 'OWNER' || me.role === 'MANAGER';
  const canEditGuest = can('guests:write');
  const moneyOk = can('payments:record');

  const [q, setQ] = useState('');
  const [filter, setFilter] = useState('');
  const [showAuditLog, setShowAuditLog] = useState(false);

  // Quick Edit Guest Modal State
  const [editTarget, setEditTarget] = useState<GuestSummaryDTO | null>(null);
  const [editForm, setEditForm] = useState({
    name: '',
    phone: '',
    email: '',
    country: '',
    tags: '',
    isVip: false,
  });

  // Delete Guest Modal State
  const [deleteTarget, setDeleteTarget] = useState<GuestSummaryDTO | null>(null);
  const [deleteReason, setDeleteReason] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['guests', q, filter],
    queryFn: () => {
      const p = new URLSearchParams();
      if (q) p.set('q', q);
      if (filter) p.set('filter', filter);
      return get<{ data: GuestSummaryDTO[]; total: number }>(`/guests?${p}`);
    },
  });

  // Super Admin Exclusive Guest Audit Trail
  const { data: guestAudit } = useQuery({
    queryKey: ['audit-guests'],
    queryFn: () => get<{ data: AuditRow[]; total: number }>('/audit?entityType=Contact&limit=40'),
    enabled: isOwner && showAuditLog,
  });

  const editMut = useMutation({
    mutationFn: () => {
      if (!editTarget) throw new Error('No guest selected');
      return patch(`/guests/${editTarget.id}`, {
        name: editForm.name.trim(),
        phone: editForm.phone.trim() || null,
        email: editForm.email.trim() || null,
        country: editForm.country.trim().toUpperCase().slice(0, 2) || null,
        tags: editForm.tags
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean),
        isVip: editForm.isVip,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['guests'] });
      qc.invalidateQueries({ queryKey: ['audit-guests'] });
      toast.success('Guest profile updated');
      setEditTarget(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      del<{ ok: boolean; name: string }>(`/guests/${id}`, { reason }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['guests'] });
      qc.invalidateQueries({ queryKey: ['reservations'] });
      qc.invalidateQueries({ queryKey: ['audit-guests'] });
      qc.invalidateQueries({ queryKey: ['admin-pulse'] });
      toast.success(`Guest "${res?.name ?? ''}" deleted`);
      setDeleteTarget(null);
      setDeleteReason('');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rows = data?.data ?? [];
  const vipCount = rows.filter((g) => g.isVip).length;
  const returningCount = rows.filter((g) => g.stays >= 2).length;
  const upcomingCount = rows.filter((g) => g.nextStay).length;

  const openEditModal = (g: GuestSummaryDTO) => {
    setEditTarget(g);
    setEditForm({
      name: g.name,
      phone: g.phone ?? '',
      email: g.email ?? '',
      country: g.country ?? '',
      tags: g.tags.join(', '),
      isVip: g.isVip,
    });
  };

  const exportCsv = () => {
    if (!rows.length) return;
    exportToCsv(
      `reberon-guests-${new Date().toISOString().slice(0, 10)}.csv`,
      ['Name', 'Phone', 'Email', 'Country', 'VIP', 'Stays', 'Nights', 'Last Stay', 'Next Stay', 'Spent UGX', 'Spent USD', 'Tags'],
      rows.map((g) => [
        g.name,
        g.phone ?? '',
        g.email ?? '',
        g.country ?? '',
        g.isVip ? 'Yes' : 'No',
        g.stays,
        g.nights,
        g.lastStay ?? '',
        g.nextStay ?? '',
        g.spent?.UGX ?? '0',
        g.spent?.USD ?? '0',
        g.tags.join('; '),
      ]),
    );
  };

  return (
    <div className="fade-in space-y-4">
      <PageHeader
        title="Guest Directory"
        description={`${data?.total ?? 0} guest profiles · Stay history, VIP status, and lifetime spend`}
        actions={
          <>
            {isOwner && (
              <Button
                size="sm"
                variant={showAuditLog ? 'primary' : 'secondary'}
                onClick={() => setShowAuditLog((v) => !v)}
                icon={<History className="size-3.5" />}
              >
                Owner Guest Audit Log
              </Button>
            )}
            <Button
              size="sm"
              variant="secondary"
              disabled={!rows.length}
              onClick={exportCsv}
              icon={<Download className="size-3.5" />}
            >
              Export CSV
            </Button>
            {can('bookings:write') && (
              <Button size="sm" variant="primary" href="/reservations/new" icon={<Plus className="size-3.5" />}>
                New Booking
              </Button>
            )}
          </>
        }
      />

      {/* Super Admin (OWNER) Exclusive Guest Edit & Deletion Audit Log */}
      {isOwner && showAuditLog && (
        <Section
          title="Super Admin Guest Profile & Deletion Audit Log"
          description="Strictly visible only to the Super Admin (Owner) — records every guest profile edit, merge, or deletion performed by Managers or Staff"
        >
          {!guestAudit?.data.length ? (
            <p className="py-4 text-center text-xs text-fg-muted">No guest profile audit entries recorded yet.</p>
          ) : (
            <div className="max-h-72 overflow-y-auto divide-y divide-line text-xs">
              {guestAudit.data.map((log) => (
                <div key={log.id} className="flex flex-wrap items-start justify-between gap-2 py-2.5 first:pt-0 last:pb-0">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <Pill tone={log.action.includes('delete') ? 'red' : log.action.includes('update') ? 'amber' : 'neutral'} dot>
                        {log.action}
                      </Pill>
                      <span className="font-semibold text-fg">{log.summary ?? log.action}</span>
                    </div>
                    <p className="mt-0.5 text-[11px] text-fg-muted">
                      Performed by: <strong className="text-fg">{log.actor?.name ?? log.actorType}</strong>
                      {log.actor?.role ? ` (${log.actor.role})` : ''}
                      {log.before && typeof log.before.reason === 'string' ? ` · Reason: "${log.before.reason}"` : ''}
                    </p>
                  </div>
                  <span className="font-mono text-[11px] text-fg-subtle">{ago(log.createdAt)}</span>
                </div>
              ))}
            </div>
          )}
        </Section>
      )}

      {/* Summary KPI Cards — Clean Monochromatic Theme */}
      <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        <button
          type="button"
          onClick={() => setFilter('')}
          className={`card p-3.5 text-left transition ${filter === '' ? 'ring-1 ring-fg' : 'hover:bg-surface-2/40'}`}
        >
          <p className="text-[11px] font-semibold uppercase tracking-wider text-fg-muted">Total Guests</p>
          <p className="mt-1 text-xl font-bold tabular text-fg">{data?.total ?? 0}</p>
        </button>
        <button
          type="button"
          onClick={() => setFilter('returning')}
          className={`card p-3.5 text-left transition ${filter === 'returning' ? 'ring-1 ring-fg' : 'hover:bg-surface-2/40'}`}
        >
          <p className="text-[11px] font-semibold uppercase tracking-wider text-fg-muted">Returning Regulars</p>
          <p className="mt-1 text-xl font-bold tabular text-fg">{returningCount}</p>
        </button>
        <button
          type="button"
          onClick={() => setFilter('vip')}
          className={`card p-3.5 text-left transition ${filter === 'vip' ? 'ring-1 ring-fg' : 'hover:bg-surface-2/40'}`}
        >
          <p className="text-[11px] font-semibold uppercase tracking-wider text-fg-muted">VIP Guests</p>
          <p className="mt-1 text-xl font-bold tabular text-fg">{vipCount}</p>
        </button>
        <div className="card p-3.5">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-fg-muted">Upcoming Stays</p>
          <p className="mt-1 text-xl font-bold tabular text-fg">{upcomingCount}</p>
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-surface-2/40 px-3 py-2">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex rounded-lg border border-line bg-surface p-0.5 text-[11px]">
              {(
                [
                  ['', 'All Guests'],
                  ['returning', 'Returning (2+)'],
                  ['vip', 'VIP Only'],
                ] as const
              ).map(([v, l]) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setFilter(v)}
                  className={`rounded-md px-2.5 py-1 font-medium ${filter === v ? 'bg-fg text-bg' : 'text-fg-muted hover:text-fg'}`}
                >
                  {l}
                </button>
              ))}
            </div>
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-fg-subtle" />
              <input
                className="input !h-8 !min-h-0 w-60 pl-8 text-xs"
                placeholder="Name, phone, email, or RB- code..."
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </div>
          </div>
          <span className="text-[11px] text-fg-muted">{rows.length} records</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-line bg-surface-2/50 text-[11px] font-semibold uppercase tracking-wider text-fg-subtle">
              <tr>
                <th className="px-3 py-2">Guest</th>
                <th className="px-3 py-2">Contact</th>
                <th className="px-3 py-2">Country</th>
                <th className="px-3 py-2">Tags</th>
                <th className="px-3 py-2 text-right">Stays</th>
                <th className="px-3 py-2 text-right">Nights</th>
                <th className="px-3 py-2">Last Stay</th>
                <th className="px-3 py-2">Next Stay</th>
                {moneyOk && <th className="px-3 py-2 text-right">Lifetime Spend</th>}
                <th className="px-3 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {isLoading &&
                Array.from({ length: 6 }, (_, i) => (
                  <tr key={i}>
                    <td colSpan={10} className="px-3 py-2.5">
                      <Skeleton className="h-5" />
                    </td>
                  </tr>
                ))}
              {rows.map((g) => {
                const spent = g.spent
                  ? [
                      BigInt(g.spent.UGX) > 0n && money(g.spent.UGX, 'UGX'),
                      BigInt(g.spent.USD) > 0n && money(g.spent.USD, 'USD'),
                    ]
                      .filter(Boolean)
                      .join(' + ') || 'UGX 0'
                  : '';
                return (
                  <tr
                    key={g.id}
                    className="cursor-pointer hover:bg-surface-2/40 transition-colors"
                    onClick={() => router.push(`/guests/${g.id}`)}
                  >
                    <td className="px-3 py-2.5 font-semibold">
                      <span className="inline-flex items-center gap-1.5">
                        <Link
                          href={`/guests/${g.id}`}
                          className="hover:underline text-fg"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {g.name}
                        </Link>
                        {g.isVip && (
                          <Pill tone="dark">
                            <Star className="size-2.5 fill-current" /> VIP
                          </Pill>
                        )}
                        {g.stays >= 2 && <Pill tone="neutral">Regular</Pill>}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-fg-muted">
                      {[g.phone, g.email].filter(Boolean).join(' · ') || '—'}
                    </td>
                    <td className="px-3 py-2.5 text-fg-muted">{g.country ?? '—'}</td>
                    <td className="px-3 py-2.5">
                      <span className="inline-flex flex-wrap gap-1">
                        {g.tags.length > 0 ? (
                          g.tags.map((t) => <Pill key={t}>{t}</Pill>)
                        ) : (
                          <span className="text-fg-subtle">—</span>
                        )}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-right font-semibold tabular">{g.stays}</td>
                    <td className="px-3 py-2.5 text-right tabular text-fg-muted">{g.nights}</td>
                    <td className="px-3 py-2.5 text-fg-muted whitespace-nowrap">
                      {g.lastStay ? dateShort(g.lastStay) : '—'}
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      {g.nextStay ? (
                        <span className="inline-flex items-center gap-1.5 font-medium text-fg">
                          <span className="size-1.5 rounded-full bg-emerald-500" />
                          {dateShort(g.nextStay)}
                        </span>
                      ) : (
                        <span className="text-fg-subtle">—</span>
                      )}
                    </td>
                    {moneyOk && (
                      <td className="px-3 py-2.5 text-right font-mono tabular whitespace-nowrap text-fg">
                        {spent}
                      </td>
                    )}
                    <td className="px-3 py-2.5 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                      <div className="inline-flex items-center gap-1">
                        <Link
                          href={`/guests/${g.id}`}
                          className="inline-flex items-center gap-1 rounded-md border border-line px-2 py-1 text-[11px] font-medium hover:bg-surface-2 transition-colors"
                        >
                          View <ExternalLink className="size-3" />
                        </Link>
                        {canEditGuest && (
                          <button
                            type="button"
                            onClick={() => openEditModal(g)}
                            title="Quick edit guest profile"
                            className="inline-flex items-center justify-center rounded-md border border-line p-1.5 text-fg-muted hover:bg-surface-2 hover:text-fg transition-colors"
                          >
                            <Edit3 className="size-3.5" />
                          </button>
                        )}
                        {canDeleteGuest && (
                          <button
                            type="button"
                            onClick={() => {
                              setDeleteTarget(g);
                              setDeleteReason('');
                            }}
                            title="Delete guest profile (Owner / Manager)"
                            className="inline-flex items-center justify-center rounded-md border border-line p-1.5 text-fg-muted hover:border-danger/40 hover:bg-danger/10 hover:text-danger transition-colors"
                          >
                            <Trash2 className="size-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!isLoading && !rows.length && <Empty title="No guests match your search" />}
        </div>
      </div>

      {/* Quick Edit Guest Modal */}
      <Dialog
        open={!!editTarget}
        onClose={() => setEditTarget(null)}
        title={`Edit Guest — ${editTarget?.name ?? ''}`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              loading={editMut.isPending}
              disabled={!editForm.name.trim()}
              onClick={() => editMut.mutate()}
            >
              Save Changes
            </Button>
          </>
        }
      >
        <div className="space-y-3 text-xs">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="block">
              <span className="label">Full Name *</span>
              <input
                className="input"
                value={editForm.name}
                onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
              />
            </label>
            <label className="block">
              <span className="label">Phone Number</span>
              <input
                className="input"
                placeholder="+256 7..."
                value={editForm.phone}
                onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
              />
            </label>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="block">
              <span className="label">Email Address</span>
              <input
                type="email"
                className="input"
                value={editForm.email}
                onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
              />
            </label>
            <label className="block">
              <span className="label">Country (2-letter ISO)</span>
              <input
                className="input uppercase"
                maxLength={2}
                placeholder="UG"
                value={editForm.country}
                onChange={(e) => setEditForm({ ...editForm, country: e.target.value })}
              />
            </label>
          </div>
          <label className="block">
            <span className="label">Tags (comma separated)</span>
            <input
              className="input"
              placeholder="returning, coffee, vegetarian"
              value={editForm.tags}
              onChange={(e) => setEditForm({ ...editForm, tags: e.target.value })}
            />
          </label>
          <label className="flex items-center gap-2 pt-1 cursor-pointer">
            <input
              type="checkbox"
              checked={editForm.isVip}
              onChange={(e) => setEditForm({ ...editForm, isVip: e.target.checked })}
              className="size-4 rounded border-line"
            />
            <span className="font-medium text-fg">Mark as VIP Guest</span>
          </label>
        </div>
      </Dialog>

      {/* Delete Guest Modal (Owner & Manager) */}
      <Dialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title={`Delete Guest Profile — ${deleteTarget?.name ?? ''}`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              loading={deleteMut.isPending}
              onClick={() =>
                deleteTarget &&
                deleteMut.mutate({
                  id: deleteTarget.id,
                  reason: deleteReason.trim() || `Guest profile deleted by ${me.role}`,
                })
              }
            >
              Delete Guest Profile
            </Button>
          </>
        }
      >
        {deleteTarget && (
          <div className="space-y-3 text-xs">
            <div className="flex items-start gap-2.5 rounded-lg border border-line bg-surface-2 p-3">
              <ShieldAlert className="size-4 text-danger shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="font-semibold text-fg">
                  Permanent Guest Profile Deletion (Logged to Super Admin Audit Trail)
                </p>
                <p className="text-fg-muted">
                  Deleting <strong className="text-fg">{deleteTarget.name}</strong> (
                  {[deleteTarget.phone, deleteTarget.email].filter(Boolean).join(' · ') || 'no contact'}) will remove their profile and associated booking records. This action and your reason are recorded in the Super Admin Audit Log.
                </p>
              </div>
            </div>
            <label className="block">
              <span className="label">Reason for deletion (visible to Super Admin)</span>
              <input
                className="input"
                placeholder="e.g. Duplicate test guest or erroneous walk-in profile"
                value={deleteReason}
                onChange={(e) => setDeleteReason(e.target.value)}
              />
            </label>
          </div>
        )}
      </Dialog>
    </div>
  );
}
