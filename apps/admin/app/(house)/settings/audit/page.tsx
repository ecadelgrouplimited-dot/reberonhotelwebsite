'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Download, Search, ShieldCheck } from 'lucide-react';
import type { AuditLogDTO } from '@reberon/contracts';
import { get } from '@/lib/api';
import { useMe } from '@/lib/providers';
import { dateTime } from '@/lib/format';
import { exportToCsv } from '@/lib/export-csv';
import { Button } from '@/components/ui/button';
import { Empty, PageHeader, Pill, Skeleton } from '@/components/ui/bits';

type ExtendedAuditRow = AuditLogDTO & {
  actor: { id: string; name: string; role?: string } | null;
};

export default function AuditPage() {
  const me = useMe();
  const isOwner = me.role === 'OWNER';

  const [q, setQ] = useState('');
  const [action, setAction] = useState('');
  const [entityType, setEntityType] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['audit', q, action, entityType],
    queryFn: () => {
      const p = new URLSearchParams();
      if (q) p.set('q', q);
      if (action) p.set('action', action);
      if (entityType) p.set('entityType', entityType);
      p.set('limit', '150');
      return get<{ data: ExtendedAuditRow[]; total: number }>(`/audit?${p.toString()}`);
    },
    enabled: isOwner,
  });

  if (!isOwner) {
    return (
      <div className="fade-in">
        <Empty
          icon={<ShieldCheck className="size-5" />}
          title="Super Admin Exclusive Access"
          body="The system audit and deletion log is strictly visible only to the Hotel Owner (Super Admin)."
        />
      </div>
    );
  }

  const rows = data?.data ?? [];

  const handleExportCsv = () => {
    if (!rows.length) return;
    exportToCsv(
      `reberon-audit-log-${new Date().toISOString().slice(0, 10)}.csv`,
      ['Timestamp', 'Actor', 'Actor Role', 'Action', 'Entity Type', 'Entity ID', 'Summary', 'IP Address', 'Before Snapshot', 'After Snapshot'],
      rows.map((a) => [
        a.createdAt,
        a.actor?.name ?? a.actorType.toLowerCase(),
        a.actor?.role ?? a.actorType,
        a.action,
        a.entityType ?? '',
        a.entityId ?? '',
        a.summary ?? '',
        a.ip ?? '',
        a.before ? JSON.stringify(a.before) : '',
        a.after ? JSON.stringify(a.after) : '',
      ]),
    );
  };

  return (
    <div className="fade-in space-y-4">
      <PageHeader
        crumbs={[{ label: 'Settings', href: '/settings' }, { label: 'Audit log' }]}
        title="Super Admin System & Deletion Audit Log"
        description={`${data?.total ?? 0} immutable entries · Strictly visible only to the Hotel Owner (Super Admin)`}
        actions={
          <Button
            size="sm"
            variant="secondary"
            disabled={!rows.length}
            onClick={handleExportCsv}
            icon={<Download className="size-3.5" />}
          >
            Export Audit CSV
          </Button>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-52 max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-subtle" />
          <input
            className="input pl-9 text-xs"
            placeholder="Search summary, guest name, booking code..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <select
          className="input w-48 text-xs"
          value={entityType}
          onChange={(e) => setEntityType(e.target.value)}
        >
          <option value="">All Entity Types</option>
          <option value="Reservation">Reservations</option>
          <option value="Contact">Guests & Profiles</option>
          <option value="IssuedDocument">Receipts & Invoices</option>
          <option value="WaitlistEntry">Waitlist</option>
          <option value="Conversation">Inbox Threads</option>
          <option value="User">Staff Users</option>
        </select>
        <select
          className="input w-48 text-xs"
          value={action}
          onChange={(e) => setAction(e.target.value)}
        >
          <option value="">All Actions</option>
          <option value="guest.">Guest Edits & Deletions</option>
          <option value="reservation.">Reservation Actions & Deletions</option>
          <option value="payment.">Payments & Refunds</option>
          <option value="waitlist.">Waitlist Actions</option>
          <option value="page.">Website CMS</option>
          <option value="user.">Staff & Access</option>
          <option value="auth.">Logins & Security</option>
        </select>
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-line bg-surface-2/60 text-[11px] font-semibold uppercase tracking-wider text-fg-subtle">
              <tr>
                <th className="px-4 py-2.5">When</th>
                <th className="px-4 py-2.5">Who</th>
                <th className="px-4 py-2.5">Action</th>
                <th className="px-4 py-2.5">Summary & Snapshot</th>
                <th className="px-4 py-2.5">IP</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {isLoading &&
                Array.from({ length: 8 }, (_, i) => (
                  <tr key={i}>
                    <td colSpan={5} className="px-4 py-3">
                      <Skeleton className="h-5" />
                    </td>
                  </tr>
                ))}
              {rows.map((a) => (
                <tr key={a.id} className="align-top hover:bg-surface-2/30">
                  <td className="whitespace-nowrap px-4 py-2.5 tabular text-fg-muted">
                    {dateTime(a.createdAt)}
                  </td>
                  <td className="px-4 py-2.5">
                    <span className="font-semibold text-fg">
                      {a.actor?.name ?? a.actorType.toLowerCase()}
                    </span>
                    {a.actor?.role && (
                      <span className="ml-1.5 rounded border border-line bg-surface-2 px-1.5 py-0.5 font-mono text-[10px] text-fg-muted">
                        {a.actor.role}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    <Pill
                      tone={
                        a.action.includes('delete')
                          ? 'red'
                          : a.action.includes('update') || a.action.includes('cancel')
                            ? 'amber'
                            : 'neutral'
                      }
                      dot
                      className="font-mono"
                    >
                      {a.action}
                    </Pill>
                  </td>
                  <td className="px-4 py-2.5 text-fg">
                    <div>{a.summary ?? '—'}</div>
                    {Boolean(a.before || a.after) && (
                      <details className="mt-1 text-[11px] text-fg-muted">
                        <summary className="cursor-pointer font-medium hover:text-fg">
                          View recorded before/after details
                        </summary>
                        <pre className="mt-1 max-h-40 overflow-auto rounded-lg border border-line bg-surface-2 p-2 font-mono text-[10.5px] text-fg">
                          {JSON.stringify({ before: a.before, after: a.after }, null, 2)}
                        </pre>
                      </details>
                    )}
                  </td>
                  <td className="px-4 py-2.5 font-mono text-[11px] text-fg-subtle">{a.ip ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!isLoading && !rows.length && <Empty title="No matching audit entries" />}
        </div>
      </div>
    </div>
  );
}
