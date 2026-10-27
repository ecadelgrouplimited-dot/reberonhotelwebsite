'use client';
import { Fragment, useState } from 'react';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { ChevronDown, Lock, Search, ShieldAlert } from 'lucide-react';
import type { UserDTO } from '@reberon/contracts';
import { get } from '@/lib/api';
import { useCan } from '@/lib/providers';
import { dateTime } from '@/lib/format';
import { cn } from '@/lib/cn';
import { Button } from '@/components/ui/button';
import { PageHeader, Pill, Skeleton } from '@/components/ui/bits';

type Row = { id: string; actor: { name: string } | null; actorType: string; action: string; entityType: string; entityId: string | null; summary: string | null; before: unknown; after: unknown; ip: string | null; createdAt: string };

export default function AuditPage() {
  const can = useCan();
  const allowed = can('audit:read');
  const [q, setQ] = useState('');
  const [actor, setActor] = useState('');
  const [area, setArea] = useState('');
  const [open, setOpen] = useState<string | null>(null);

  const users = useQuery({ queryKey: ['users'], queryFn: () => get<UserDTO[]>('/users'), enabled: allowed });
  const qs = new URLSearchParams({ limit: '50', ...(q ? { q } : {}), ...(actor ? { actorId: actor } : {}), ...(area ? { action: area } : {}) });
  const log = useInfiniteQuery({
    queryKey: ['audit', qs.toString()],
    queryFn: ({ pageParam }) => get<{ data: Row[]; nextCursor: string | null; total: number }>(`/audit?${qs}${pageParam ? `&cursor=${pageParam}` : ''}`),
    initialPageParam: '',
    getNextPageParam: (p) => p.nextCursor,
    enabled: allowed,
  });

  if (!allowed) {
    return (
      <div className="fade-in max-w-xl py-12">
        <div className="card p-6 text-center">
          <ShieldAlert className="mx-auto mb-3 size-8 text-danger" />
          <h1 className="text-base font-bold">Directors & Managers Only</h1>
          <p className="mt-1 text-xs text-fg-muted">
            The system audit log contains private management and security records and is restricted to Directors and Hotel Managers.
          </p>
          <div className="mt-4">
            <Button size="sm" href="/" variant="primary">
              Return to Today Dashboard
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const rows = log.data?.pages.flatMap((p) => p.data) ?? [];
  return (
    <div className="fade-in">
      <PageHeader
        title="System Audit Log"
        description="Private security & management trail · Visible to Directors and Managers only. Append-only record."
        actions={
          <Pill tone="amber" className="gap-1">
            <Lock className="size-3" /> Directors & Managers Only
          </Pill>
        }
      />
      <div className="mb-4 flex flex-wrap gap-2">
        <label className="relative min-w-60 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-subtle" />
          <input className="input pl-9" placeholder="Search actions, staff or summaries…" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        <select className="input !w-auto" value={actor} onChange={(e) => setActor(e.target.value)} aria-label="Person">
          <option value="">All staff</option>
          {users.data?.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </select>
        <select className="input !w-auto" value={area} onChange={(e) => setArea(e.target.value)} aria-label="Area">
          <option value="">All modules</option>
          <option value="user">People & Passwords</option>
          <option value="auth">Sign-ins</option>
          <option value="booking">Reservations & Stays</option>
          <option value="payment">Payments</option>
          <option value="receipt">Receipts & Invoices</option>
          <option value="pos">POS: Kitchen & Bar</option>
          <option value="healthclub">Health Club & Spa</option>
          <option value="quotation">Event Quotations</option>
          <option value="inventory">Inventory & Linen</option>
          <option value="requisition">Requisitions</option>
          <option value="settings">Settings & Integrations</option>
          <option value="page">Website Pages</option>
          <option value="room_type">Room Types</option>
          <option value="conversation">Inbox</option>
          <option value="waitlist">First-stay list</option>
          <option value="media">Media</option>
        </select>
      </div>
      <div className="card overflow-hidden">
        <table className="w-full text-[13px]">
          <tbody className="divide-y divide-line">
            {log.isLoading && (
              <tr>
                <td className="p-4">
                  <Skeleton className="h-40" />
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <Fragment key={r.id}>
                <tr className={cn('cursor-pointer hover:bg-surface-2/50', open === r.id && 'bg-surface-2/50')} onClick={() => setOpen(open === r.id ? null : r.id)}>
                  <td className="w-40 whitespace-nowrap px-4 py-2.5 tabular text-fg-subtle">{dateTime(r.createdAt)}</td>
                  <td className="w-40 px-4 py-2.5 font-medium">{r.actor?.name ?? (r.actorType === 'GUEST' ? 'Website guest' : 'System')}</td>
                  <td className="px-4 py-2.5 text-fg-muted">{r.summary}</td>
                  <td className="hidden px-4 py-2.5 md:table-cell">
                    <Pill>{r.action}</Pill>
                  </td>
                  <td className="w-8 px-2">
                    <ChevronDown className={cn('size-4 text-fg-subtle transition-transform', open === r.id && 'rotate-180')} />
                  </td>
                </tr>
                {open === r.id && (
                  <tr>
                    <td colSpan={5} className="bg-surface-2/40 px-4 py-3">
                      <div className="grid gap-3 md:grid-cols-2">
                        <pre className="scrollbar-thin max-h-60 overflow-auto rounded-lg bg-surface p-3 font-mono text-[11.5px]">
                          <span className="text-fg-subtle">before</span>
                          {'\n'}
                          {JSON.stringify(r.before, null, 2) ?? '—'}
                        </pre>
                        <pre className="scrollbar-thin max-h-60 overflow-auto rounded-lg bg-surface p-3 font-mono text-[11.5px]">
                          <span className="text-fg-subtle">after</span>
                          {'\n'}
                          {JSON.stringify(r.after, null, 2) ?? '—'}
                        </pre>
                      </div>
                      <p className="mt-2 font-mono text-[11px] text-fg-subtle">
                        {r.entityType} {r.entityId} · {r.ip ?? 'no ip'}
                      </p>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
      {log.hasNextPage && (
        <div className="mt-4 text-center">
          <Button loading={log.isFetchingNextPage} onClick={() => log.fetchNextPage()}>
            Older entries
          </Button>
        </div>
      )}
    </div>
  );
}
