'use client';
import { useState, useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Mail, MessageSquare, RotateCcw, Search, SlidersHorizontal } from 'lucide-react';
import type { MessageChannel, OutboundMessageDTO } from '@reberon/contracts';
import { get, post } from '@/lib/api';
import { useCan } from '@/lib/providers';
import { Button } from '@/components/ui/button';
import { Empty, PageHeader, Skeleton, Tabs } from '@/components/ui/bits';
import { MessageRow } from '@/components/messages/message-row';

export default function SentMessagesPage() {
  const qc = useQueryClient();
  const can = useCan();
  const [status, setStatus] = useState('');
  const [channel, setChannel] = useState<string>('ALL');
  const [q, setQ] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['outbox', status],
    queryFn: () => get<OutboundMessageDTO[]>(`/messages${status ? `?status=${status}` : ''}`),
    refetchInterval: 15_000,
  });

  const retry = useMutation({
    mutationFn: (id: string) => post<OutboundMessageDTO>(`/messages/${id}/retry`),
    onSuccess: (m) => {
      qc.invalidateQueries({ queryKey: ['outbox'] });
      m.status === 'SENT' ? toast.success('Sent') : toast.message(m.error ?? 'Still not sent');
    },
  });

  const filtered = useMemo(() => {
    if (!data) return [];
    let list = data;
    if (channel !== 'ALL') {
      list = list.filter((m) => m.channel === channel);
    }
    if (q.trim()) {
      const term = q.trim().toLowerCase();
      list = list.filter(
        (m) =>
          m.to.toLowerCase().includes(term) ||
          (m.subject && m.subject.toLowerCase().includes(term)) ||
          m.body.toLowerCase().includes(term) ||
          (m.reservation?.code && m.reservation.code.toLowerCase().includes(term)) ||
          (m.sentBy && m.sentBy.toLowerCase().includes(term)),
      );
    }
    return list;
  }, [data, channel, q]);

  const hasFilters = status !== '' || channel !== 'ALL' || q.trim().length > 0;

  return (
    <div className="fade-in">
      <PageHeader
        title="Sent messages"
        description="Every email, SMS and WhatsApp the house sent a guest — click any message to view details or jump into the conversation thread."
      />
      <div className="card overflow-hidden">
        {/* Status Tabs & Reset */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-surface px-3 py-1">
          <Tabs
            className="!border-b-0"
            value={status}
            onChange={setStatus}
            items={[
              { value: '', label: 'Everything' },
              { value: 'NOT_CONNECTED', label: 'Waiting for a person' },
              { value: 'FAILED', label: 'Failed' },
              { value: 'SENT', label: 'Sent' },
            ]}
          />
          {hasFilters && (
            <button
              type="button"
              onClick={() => {
                setStatus('');
                setChannel('ALL');
                setQ('');
              }}
              className="inline-flex items-center gap-1 text-[11px] font-medium text-fg-subtle hover:text-fg transition-colors"
            >
              <RotateCcw className="size-3" /> Reset filters
            </button>
          )}
        </div>

        {/* Filter bar: Search & Channel */}
        <div className="flex flex-wrap items-center gap-2.5 border-b border-line bg-surface-2/40 px-3 py-2 text-xs">
          <div className="relative min-w-[240px] flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-fg-subtle" />
            <input
              className="input !h-8 !min-h-0 w-full pl-8 text-xs bg-surface"
              placeholder="Search recipient, reservation code, text..."
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>

          <div className="flex items-center gap-1.5">
            <SlidersHorizontal className="size-3.5 text-fg-subtle" />
            <select
              value={channel}
              onChange={(e) => setChannel(e.target.value)}
              className="input !h-8 !min-h-0 py-0 text-xs bg-surface"
              aria-label="Filter messages by delivery channel"
            >
              <option value="ALL">All Channels</option>
              <option value="EMAIL">Email</option>
              <option value="WHATSAPP">WhatsApp</option>
              <option value="SMS">SMS</option>
            </select>
          </div>

          <span className="text-[11px] font-medium text-fg-muted ml-auto">
            {filtered.length} message{filtered.length === 1 ? '' : 's'}
          </span>
        </div>

        <ul className="divide-y divide-line p-2">
          {isLoading &&
            Array.from({ length: 5 }, (_, i) => (
              <li key={i} className="p-4">
                <Skeleton className="h-6" />
              </li>
            ))}
          {filtered.map((m) => (
            <MessageRow
              key={m.id}
              m={m}
              onRetry={can('bookings:write') ? () => retry.mutate(m.id) : undefined}
            />
          ))}
        </ul>

        {!isLoading && !filtered.length && (
          <Empty
            icon={<Mail className="size-5" />}
            title="No messages found"
            body={hasFilters ? 'Try adjusting your search query or channel filter.' : 'Messages appear as bookings are confirmed, guests arrive and leave.'}
            action={
              hasFilters ? (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    setStatus('');
                    setChannel('ALL');
                    setQ('');
                  }}
                >
                  Clear Filters
                </Button>
              ) : undefined
            }
          />
        )}
      </div>
    </div>
  );
}
