'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Check, EyeOff, Frown, Globe, Meh, MessageCircleHeart, Search, Smile } from 'lucide-react';
import type { FeedbackDTO } from '@reberon/contracts';
import { ApiError, get, post } from '@/lib/api';
import { useCan } from '@/lib/providers';
import { dateRange, dateShort } from '@/lib/format';
import { cn } from '@/lib/cn';
import { Button } from '@/components/ui/button';
import { Empty, PageHeader, Pill, Skeleton } from '@/components/ui/bits';
import { useConfirm } from '@/components/ui/confirm';

const FACE = {
  GOOD: { icon: Smile, label: 'Good', tone: 'green' as const, cls: 'text-success bg-success/10' },
  OK: { icon: Meh, label: 'OK', tone: 'amber' as const, cls: 'text-warning bg-warning/10' },
  BAD: { icon: Frown, label: 'Issue', tone: 'red' as const, cls: 'text-danger bg-danger/10' },
} as const;

export default function FeedbackPage() {
  const qc = useQueryClient();
  const can = useCan();
  const confirm = useConfirm();
  const [filter, setFilter] = useState('open');
  const [q, setQ] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['feedback', filter],
    queryFn: () => get<FeedbackDTO[]>(`/feedback${filter === 'all' ? '' : `?filter=${filter}`}`),
  });
  const all = useQuery({ queryKey: ['feedback', 'all'], queryFn: () => get<FeedbackDTO[]>('/feedback') });

  const act = useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'handled' | 'publish' | 'unpublish' }) => post(`/feedback/${id}/${action}`),
    onSuccess: (_, v) => {
      qc.invalidateQueries({ queryKey: ['feedback'] });
      toast.success(v.action === 'publish' ? 'Published to website' : v.action === 'unpublish' ? 'Unpublished from website' : 'Marked resolved');
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Could not save'),
  });

  const allRows = all.data ?? [];
  const counts = { GOOD: 0, OK: 0, BAD: 0 };
  for (const f of allRows) counts[f.score]++;
  const total = counts.GOOD + counts.OK + counts.BAD;
  const unresolvedCount = allRows.filter((f) => f.score !== 'GOOD' && !f.handledAt).length;
  const publishedCount = allRows.filter((f) => f.published).length;

  const term = q.trim().toLowerCase();
  const shown = (data ?? []).filter((f) => {
    if (!term) return true;
    const hay = `${f.guest.name} ${f.guest.country ?? ''} ${f.reservation.code} ${f.comment ?? ''}`.toLowerCase();
    return hay.includes(term);
  });

  return (
    <div className="fade-in">
      <PageHeader
        title="Guest Feedback"
        description="Post-stay satisfaction scores, issue resolution, and website testimonials"
      />

      {/* Compact 5-KPI Strip */}
      <div className="mb-4 grid grid-cols-2 gap-2.5 sm:grid-cols-5">
        <div className="card p-3">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-fg-subtle">Satisfaction</span>
          <div className="mt-1 flex items-baseline gap-1.5">
            <span className="text-lg font-bold tabular text-success">{total > 0 ? `${Math.round((counts.GOOD / total) * 100)}%` : '—'}</span>
            <span className="text-[11px] text-fg-muted">{total} responses</span>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setFilter('open')}
          className={cn('card flex flex-col items-start justify-between p-3 text-left transition', filter === 'open' ? '!border-fg ring-1 ring-fg' : 'hover:border-line-strong')}
        >
          <span className="text-[11px] font-semibold uppercase tracking-wider text-fg-subtle">Open Issues</span>
          <span className={cn('mt-1 text-lg font-bold leading-none tabular', unresolvedCount > 0 ? 'text-danger' : 'text-fg')}>{unresolvedCount}</span>
        </button>
        <div className="card p-3">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-fg-subtle">Good / OK / Bad</span>
          <div className="mt-1 flex items-center gap-2 text-xs font-mono font-bold tabular">
            <span className="text-success">{counts.GOOD}</span>
            <span className="text-fg-subtle">/</span>
            <span className="text-warning">{counts.OK}</span>
            <span className="text-fg-subtle">/</span>
            <span className="text-danger">{counts.BAD}</span>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setFilter('public')}
          className={cn('card flex flex-col items-start justify-between p-3 text-left transition', filter === 'public' ? '!border-fg ring-1 ring-fg' : 'hover:border-line-strong')}
        >
          <span className="text-[11px] font-semibold uppercase tracking-wider text-fg-subtle">Quotable</span>
          <span className="mt-1 text-lg font-bold leading-none tabular text-info">{allRows.filter((f) => f.allowPublic).length}</span>
        </button>
        <div className="card p-3">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-fg-subtle">Live on Website</span>
          <span className="mt-1 block text-lg font-bold leading-none tabular">{publishedCount}</span>
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-surface-2/40 px-3 py-2">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex rounded-lg border border-line bg-surface p-0.5 text-[11px]">
              {([
                ['open', `Needs Action (${unresolvedCount})`],
                ['public', 'Quotable'],
                ['all', `All (${total})`],
              ] as const).map(([v, l]) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setFilter(v)}
                  className={cn('rounded-md px-2.5 py-1 font-medium transition', filter === v ? 'bg-fg text-bg' : 'text-fg-muted hover:text-fg')}
                >
                  {l}
                </button>
              ))}
            </div>
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-fg-subtle" />
              <input
                className="input !h-7 !min-h-0 w-56 pl-8 text-xs"
                placeholder="Search guest, booking, comment..."
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </div>
          </div>
          <span className="text-[11px] font-medium text-fg-muted">{shown.length} item{shown.length === 1 ? '' : 's'}</span>
        </div>

        {isLoading ? (
          <div className="p-4"><Skeleton className="h-40" /></div>
        ) : !shown.length ? (
          <Empty icon={<MessageCircleHeart className="size-4" />} title={filter === 'open' ? 'No unresolved feedback' : 'No feedback records'} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-line bg-surface-2/50 text-[11px] font-semibold uppercase tracking-wider text-fg-subtle">
                <tr>
                  <th className="px-3 py-2">Rating</th>
                  <th className="px-3 py-2">Guest</th>
                  <th className="px-3 py-2">Stay</th>
                  <th className="px-3 py-2">Comment</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Submitted</th>
                  {can('feedback:manage') && <th className="px-3 py-2 text-right">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {shown.map((f) => {
                  const F = FACE[f.score];
                  return (
                    <tr key={f.id} className="hover:bg-surface-2/40 transition-colors">
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        <Pill tone={F.tone}>
                          <F.icon className="size-3" /> {F.label}
                        </Pill>
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        <Link href={`/guests/${f.guest.id}`} className="font-semibold text-fg hover:underline">{f.guest.name}</Link>
                        {f.guest.country && <span className="block text-[11px] text-fg-muted">{f.guest.country}</span>}
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        <Link href={`/reservations/${f.reservation.id}`} className="font-mono font-semibold hover:underline">{f.reservation.code}</Link>
                        <span className="block text-[11px] text-fg-muted">{dateRange(f.reservation.arrival, f.reservation.departure)}</span>
                      </td>
                      <td className="px-3 py-2.5 max-w-md">
                        {f.comment ? <p className="text-fg leading-snug">“{f.comment}”</p> : <span className="text-fg-subtle">Rating only</span>}
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        <div className="flex flex-wrap gap-1">
                          {f.published && <Pill tone="dark"><Globe className="size-2.5" /> Published</Pill>}
                          {!f.published && f.allowPublic && <Pill tone="green">Quotable</Pill>}
                          {f.handledAt && f.score !== 'GOOD' && <Pill>Resolved {dateShort(f.handledAt)}</Pill>}
                          {!f.handledAt && f.score !== 'GOOD' && <Pill tone="amber">Open Issue</Pill>}
                        </div>
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap text-fg-muted tabular">
                        {dateShort(f.createdAt)}
                      </td>
                      {can('feedback:manage') && (
                        <td className="px-3 py-2.5 text-right whitespace-nowrap">
                          <div className="inline-flex items-center justify-end gap-1">
                            {!f.handledAt && f.score !== 'GOOD' && (
                              <Button
                                size="sm"
                                variant="primary"
                                icon={<Check className="size-3" />}
                                loading={act.isPending && act.variables?.id === f.id}
                                onClick={() => act.mutate({ id: f.id, action: 'handled' })}
                              >
                                Resolve
                              </Button>
                            )}
                            {f.allowPublic && f.comment && !f.published && (
                              <Button
                                size="sm"
                                variant="dark"
                                icon={<Globe className="size-3" />}
                                onClick={async () => {
                                  if (await confirm({ title: 'Publish testimonial to website?', body: `Quote by ${f.guest.name.split(' ')[0]} will appear on public pages.`, confirm: 'Publish' })) {
                                    act.mutate({ id: f.id, action: 'publish' });
                                  }
                                }}
                              >
                                Publish
                              </Button>
                            )}
                            {f.published && (
                              <Button
                                size="sm"
                                variant="ghost"
                                icon={<EyeOff className="size-3" />}
                                onClick={() => act.mutate({ id: f.id, action: 'unpublish' })}
                              >
                                Unpublish
                              </Button>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
