'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  ArrowLeft, BedDouble, CalendarDays, CheckCheck, Globe, ListPlus, Mail, MessageSquareText, Phone, Plus, RefreshCw, Search, Send, StickyNote, UserRound, Users,
} from 'lucide-react';
import type { ConversationDetailDTO, ConversationSummaryDTO, Paginated, UserDTO } from '@reberon/contracts';
import { whatsappLink } from '@reberon/utils';
import { ApiError, get, patch, post } from '@/lib/api';
import { useCan, useMe } from '@/lib/providers';
import { ago, dateRange, dateTime } from '@/lib/format';
import { cn } from '@/lib/cn';
import { Button } from '@/components/ui/button';
import { Empty, Pill, Skeleton, Status, Tabs, Kbd } from '@/components/ui/bits';
import { SelectInput } from '@/components/ui/field';
import { NewConversation } from './new-conversation';

const CHANNEL: Record<string, { label: string; icon: typeof Globe }> = {
  WEB_FORM: { label: 'Website', icon: Globe },
  WHATSAPP: { label: 'WhatsApp', icon: MessageSquareText },
  EMAIL: { label: 'Email', icon: Mail },
  PHONE: { label: 'Phone', icon: Phone },
};
const INTENT: Record<string, string> = { STAY: 'A stay', EVENT: 'Event / hall', GROUP: 'Group', GENERAL: 'General', WAITLIST: 'First stay' };

type ListResponse = Paginated<ConversationSummaryDTO> & { counts: Record<string, number> };

function initials(n: string) {
  return n.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase();
}

export function Inbox({ selectedId }: { selectedId: string | null }) {
  const [status, setStatus] = useState<'active' | 'NEW' | 'DONE' | 'SPAM' | ''>('active');
  const [assignee, setAssignee] = useState('');
  const [channel, setChannel] = useState('');
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  const [creating, setCreating] = useState(false);
  const router = useRouter();
  const can = useCan();
  const qc = useQueryClient();

  const syncEmailsMut = useMutation({
    mutationFn: () => post<{ ok: boolean; syncedCount: number; message: string }>('/conversations/sync-email'),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['conversations'] });
      if (selectedId) qc.invalidateQueries({ queryKey: ['conversation', selectedId] });
      if (res.syncedCount > 0) {
        toast.success(res.message);
      } else {
        toast.info(res.message);
      }
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : 'Could not sync emails');
    },
  });

  useEffect(() => {
    // Background auto-sync when the inbox is open
    const timer = setInterval(() => {
      syncEmailsMut.mutate();
    }, 90_000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const id = setTimeout(() => setDebounced(q), 250);
    return () => clearTimeout(id);
  }, [q]);

  const params = new URLSearchParams({ limit: '60', ...(status ? { status } : {}), ...(assignee ? { assignee } : {}), ...(channel ? { channel } : {}), ...(debounced ? { q: debounced } : {}) });
  const list = useQuery({ queryKey: ['conversations', params.toString()], queryFn: () => get<ListResponse>(`/conversations?${params}`), refetchInterval: 30_000 });
  const counts = list.data?.counts ?? {};
  const rows = list.data?.data ?? [];

  // j / k to move through the list
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest('input,textarea,select,[contenteditable]')) return;
      if (e.key !== 'j' && e.key !== 'k') return;
      const i = rows.findIndex((r) => r.id === selectedId);
      const next = rows[e.key === 'j' ? Math.min(rows.length - 1, i + 1) : Math.max(0, i - 1)];
      if (next) router.push(`/inbox/${next.id}`);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [rows, selectedId, router]);

  return (
    <div className="fade-in -mx-4 -my-6 grid h-[calc(100dvh-4rem)] overflow-hidden sm:-mx-6 lg:-mx-8 lg:-my-8 lg:grid-cols-[23rem_1fr]">
      <section className={cn('flex min-h-0 flex-col border-r border-line bg-surface', selectedId && 'hidden lg:flex')}>
        <div className="border-b border-line p-4">
          <div className="mb-3 flex items-center justify-between">
            <h1 className="display text-[1.5rem]">Inbox</h1>
            <div className="flex items-center gap-1.5">
              <Button
                size="sm"
                variant="secondary"
                loading={syncEmailsMut.isPending}
                icon={<RefreshCw className={cn('size-3.5', syncEmailsMut.isPending && 'animate-spin')} />}
                title="Sync incoming email replies from alerts@reberonhotel.com"
                onClick={() => syncEmailsMut.mutate()}
              >
                Sync Email
              </Button>
              {can('inbox:write') && (
                <Button size="sm" icon={<Plus className="size-3.5" />} onClick={() => setCreating(true)}>
                  Log a chat
                </Button>
              )}
            </div>
          </div>
          <label className="relative block">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-subtle" />
            <input className="input pl-9" placeholder="Name, phone, EQ-reference…" value={q} onChange={(e) => setQ(e.target.value)} />
          </label>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <select className="input !min-h-8 !py-1 text-[12.5px]" value={assignee} onChange={(e) => setAssignee(e.target.value)} aria-label="Assignee">
              <option value="">Everyone</option>
              <option value="me">Assigned to me</option>
              <option value="none">Unassigned</option>
            </select>
            <select className="input !min-h-8 !py-1 text-[12.5px]" value={channel} onChange={(e) => setChannel(e.target.value)} aria-label="Channel">
              <option value="">All channels</option>
              {Object.entries(CHANNEL).map(([k, v]) => (
                <option key={k} value={k}>{v.label}</option>
              ))}
            </select>
          </div>
        </div>
        <Tabs
          className="px-2"
          value={status}
          onChange={setStatus}
          items={[
            { value: 'active', label: 'Active', count: (counts.NEW ?? 0) + (counts.OPEN ?? 0) + (counts.WAITING_GUEST ?? 0) },
            { value: 'NEW', label: 'New', count: counts.NEW ?? 0 },
            { value: 'DONE', label: 'Done' },
            { value: 'SPAM', label: 'Spam' },
          ]}
        />
        <ul className="scrollbar-thin min-h-0 flex-1 overflow-y-auto">
          {list.isLoading &&
            Array.from({ length: 8 }, (_, i) => (
              <li key={i} className="flex gap-3 border-b border-line p-4">
                <Skeleton className="size-9 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-3.5 w-1/2" />
                  <Skeleton className="h-3 w-4/5" />
                </div>
              </li>
            ))}
          {!list.isLoading && !rows.length && <Empty icon={<CheckCheck className="size-5" />} title="Nothing here" body="When a guest writes from the website or you log a WhatsApp chat, it lands in this list." />}
          {rows.map((c) => {
            const Icon = CHANNEL[c.channel]?.icon ?? Globe;
            return (
              <li key={c.id}>
                <Link href={`/inbox/${c.id}`} className={cn('relative flex gap-3 border-b border-line px-4 py-3.5 transition-colors', c.id === selectedId ? 'bg-surface-2' : 'hover:bg-surface-2/60')}>
                  {c.unread && <span className="absolute left-1.5 top-5 size-1.5 rounded-full bg-accent" aria-label="Unread" />}
                  <span className="relative grid size-9 shrink-0 place-items-center rounded-full bg-moss-700/10 text-[12px] font-semibold text-brand">
                    {initials(c.contact.name)}
                    <span className="absolute -bottom-0.5 -right-0.5 grid size-4 place-items-center rounded-full bg-surface ring-1 ring-line">
                      <Icon className="size-2.5 text-fg-muted" />
                    </span>
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline gap-2">
                      <span className={cn('truncate', c.unread ? 'font-semibold' : 'font-medium')}>{c.contact.name}</span>
                      <span className="ml-auto shrink-0 text-[11px] text-fg-subtle">{ago(c.lastMessageAt)}</span>
                    </span>
                    <span className="mt-0.5 block truncate text-[12.5px] text-fg-muted">{c.preview}</span>
                    <span className="mt-1.5 flex items-center gap-1.5">
                      <Status value={c.status} />
                      <Pill>{INTENT[c.intent]}</Pill>
                      {c.assignee && <span className="ml-auto truncate text-[11px] text-fg-subtle">{c.assignee.name.split(' ')[0]}</span>}
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
        <p className="hidden border-t border-line px-4 py-2 text-[11px] text-fg-subtle lg:block">
          <Kbd>j</Kbd> <Kbd>k</Kbd> to move · {list.data?.total ?? 0} conversations
        </p>
      </section>
      <section className={cn('min-h-0 bg-bg', !selectedId && 'hidden lg:block')}>
        {selectedId ? <Thread id={selectedId} /> : <Empty icon={<MessageSquareText className="size-5" />} title="Choose a conversation" body="Every enquiry, from every channel, in one list." />}
      </section>
      <NewConversation open={creating} onClose={() => setCreating(false)} />
    </div>
  );
}

function Thread({ id }: { id: string }) {
  const qc = useQueryClient();
  const me = useMe();
  const can = useCan();
  const [body, setBody] = useState('');
  const [mode, setMode] = useState<'REPLY' | 'NOTE'>('REPLY');
  const endRef = useRef<HTMLDivElement>(null);
  const { data: c, isLoading } = useQuery({ queryKey: ['conversation', id], queryFn: () => get<ConversationDetailDTO>(`/conversations/${id}`) });
  const staff = useQuery({ queryKey: ['users'], queryFn: () => get<UserDTO[]>('/users') });

  useEffect(() => {
    qc.invalidateQueries({ queryKey: ['badge', 'inbox'] });
  }, [id, qc]);
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [c?.messages.length]);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['conversation', id] });
    qc.invalidateQueries({ queryKey: ['conversations'] });
  };
  const update = useMutation({
    mutationFn: (p: Record<string, unknown>) => patch(`/conversations/${id}`, p),
    onSuccess: refresh,
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Could not update'),
  });
  const send = useMutation({
    mutationFn: () => post<{ waUrl?: string; delivery?: string }>(`/conversations/${id}/messages`, { body, kind: mode }),
    onSuccess: (r) => {
      setBody('');
      refresh();
      if (r.waUrl) {
        window.open(r.waUrl, '_blank', 'noopener');
        toast.success('Saved. WhatsApp opened with your reply — press send there.');
      } else toast.success(mode === 'NOTE' ? 'Note added' : r.delivery === 'email' ? 'Reply emailed' : 'Reply saved');
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Could not send'),
  });
  const toWaitlist = useMutation({
    mutationFn: () => post<{ reference: string }>(`/conversations/${id}/waitlist`),
    onSuccess: (r) => {
      toast.success(`Added to the first-stay list (${r.reference})`);
      refresh();
    },
  });

  if (isLoading || !c) {
    return (
      <div className="grid gap-4 p-6">
        <Skeleton className="h-8 w-72" />
        <Skeleton className="h-24" />
        <Skeleton className="h-24 w-2/3" />
      </div>
    );
  }
  const ctx = c.context as Record<string, string | number | undefined>;
  const Icon = CHANNEL[c.channel]?.icon ?? Globe;
  const replyChannel = c.contact.email && c.channel !== 'WHATSAPP' ? `Email to ${c.contact.email}` : c.contact.phone ? 'Opens WhatsApp with your reply' : 'Saved to the thread';

  return (
    <div className="grid h-full min-h-0 xl:grid-cols-[1fr_19rem]">
      <div className="flex min-h-0 flex-col">
        <header className="flex flex-wrap items-center gap-3 border-b border-line bg-surface px-5 py-3">
          <Link href="/inbox" className="grid size-8 place-items-center rounded-full hover:bg-surface-2 lg:hidden" aria-label="Back">
            <ArrowLeft className="size-4" />
          </Link>
          <div className="min-w-[14rem] flex-1">
            <h2 className="flex items-center gap-2 truncate text-[15px] font-semibold">
              {c.contact.name} <span className="font-mono text-[11.5px] font-normal text-fg-subtle">{c.reference}</span>
            </h2>
            <p className="flex items-center gap-1.5 text-[12px] text-fg-muted">
              <Icon className="size-3.5" /> {CHANNEL[c.channel]?.label} · started {dateTime(c.createdAt)}
            </p>
          </div>
          {can('inbox:write') && (
            <div className="flex flex-wrap items-center gap-2">
              <select className="input !min-h-8 !w-auto !py-1 text-[12.5px]" value={c.assignee?.id ?? ''} onChange={(e) => update.mutate({ assigneeId: e.target.value || null })} aria-label="Assign">
                <option value="">Unassigned</option>
                {staff.data?.filter((u) => u.status === 'ACTIVE' && u.role !== 'HOUSEKEEPING').map((u) => (
                  <option key={u.id} value={u.id}>{u.id === me.id ? `Me (${u.name.split(' ')[0]})` : u.name}</option>
                ))}
              </select>
              <select className="input !min-h-8 !w-auto !py-1 text-[12.5px]" value={c.status} onChange={(e) => update.mutate({ status: e.target.value })} aria-label="Status">
                <option value="OPEN">Open</option>
                <option value="WAITING_GUEST">Waiting on guest</option>
                <option value="DONE">Done</option>
                <option value="SPAM">Spam</option>
              </select>
              {c.status !== 'DONE' && (
                <Button size="sm" variant="dark" icon={<CheckCheck className="size-3.5" />} onClick={() => update.mutate({ status: 'DONE' })}>
                  Done
                </Button>
              )}
            </div>
          )}
        </header>

        <div className="scrollbar-thin min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-6">
          {c.messages.map((m) => {
            const mine = m.direction !== 'INBOUND';
            return (
              <div key={m.id} className={cn('flex', mine ? 'justify-end' : 'justify-start')}>
                <div className={cn('max-w-[min(34rem,85%)]', mine && 'text-right')}>
                  <div
                    className={cn(
                      'whitespace-pre-wrap rounded-2xl px-4 py-3 text-left text-[13.5px] leading-relaxed',
                      m.direction === 'INBOUND' && 'rounded-tl-md border border-line bg-surface',
                      m.direction === 'OUTBOUND' && 'rounded-tr-md bg-moss-700 text-mist-50',
                      m.direction === 'NOTE' && 'rounded-tr-md border border-gold-400/40 bg-gold-400/10',
                    )}
                  >
                    {m.direction === 'NOTE' && <span className="mb-1 flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-warning"><StickyNote className="size-3" /> Internal note</span>}
                    {m.body}
                  </div>
                  <p className="mt-1 px-1 text-[11px] text-fg-subtle">
                    {m.author?.name ?? c.contact.name} · {dateTime(m.createdAt)}
                  </p>
                </div>
              </div>
            );
          })}
          <div ref={endRef} />
        </div>

        {can('inbox:write') && (
          <form
            className="border-t border-line bg-surface p-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (body.trim()) send.mutate();
            }}
          >
            <div className="mb-2 flex items-center gap-1">
              {(['REPLY', 'NOTE'] as const).map((m) => (
                <button key={m} type="button" onClick={() => setMode(m)} className={cn('rounded-full px-3 py-1 text-[12px] font-semibold', mode === m ? (m === 'NOTE' ? 'bg-gold-400/20 text-warning' : 'bg-fg text-bg') : 'text-fg-muted hover:bg-surface-2')}>
                  {m === 'REPLY' ? 'Reply' : 'Internal note'}
                </button>
              ))}
              <span className="ml-auto text-[11.5px] text-fg-subtle">{mode === 'REPLY' ? replyChannel : 'Only staff see notes'}</span>
            </div>
            <div className={cn('flex items-end gap-2 rounded-2xl border bg-surface p-2', mode === 'NOTE' ? 'border-gold-400/50' : 'border-line-strong')}>
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && body.trim()) send.mutate();
                }}
                rows={3}
                placeholder={mode === 'REPLY' ? `Reply to ${c.contact.name.split(' ')[0]}…` : 'Leave a note for the team…'}
                className="max-h-60 min-h-16 flex-1 resize-none bg-transparent px-2 py-1.5 text-[13.5px] outline-none"
              />
              <Button type="submit" variant={mode === 'NOTE' ? 'secondary' : 'primary'} size="icon" loading={send.isPending} aria-label="Send" disabled={!body.trim()}>
                {!send.isPending && <Send className="size-4" />}
              </Button>
            </div>
            <p className="mt-1.5 text-right text-[11px] text-fg-subtle"><Kbd>⌘</Kbd> <Kbd>Enter</Kbd> to send</p>
          </form>
        )}
      </div>

      <aside className="scrollbar-thin hidden overflow-y-auto border-l border-line bg-surface p-5 xl:block">
        <div className="flex items-center gap-3">
          <span className="grid size-11 place-items-center rounded-full bg-moss-700 text-[13px] font-semibold text-mist-50">{initials(c.contact.name)}</span>
          <div className="min-w-0">
            <p className="truncate font-semibold">{c.contact.name}</p>
            <p className="text-[12px] text-fg-subtle">{c.contact.country ?? 'Country unknown'}</p>
          </div>
        </div>
        <dl className="mt-5 grid gap-3 text-[13px]">
          {c.contact.phone && (
            <div className="flex items-center gap-2.5">
              <Phone className="size-4 text-fg-subtle" />
              <a href={`tel:${c.contact.phone}`} className="tabular hover:underline">{c.contact.phone}</a>
            </div>
          )}
          {c.contact.email && (
            <div className="flex items-center gap-2.5">
              <Mail className="size-4 text-fg-subtle" />
              <a href={`mailto:${c.contact.email}`} className="truncate hover:underline">{c.contact.email}</a>
            </div>
          )}
        </dl>
        {c.contact.phone && (
          <a href={whatsappLink(c.contact.phone, `Hello ${c.contact.name.split(' ')[0]}, this is ${me.name.split(' ')[0]} from Reberon Hotel.`)} target="_blank" rel="noopener noreferrer" className="mt-4 flex h-9 items-center justify-center gap-2 rounded-full border border-line-strong text-[13px] font-semibold hover:bg-surface-2">
            <MessageSquareText className="size-4" /> Open WhatsApp
          </a>
        )}

        <h3 className="mt-7 text-[11px] font-semibold uppercase tracking-[0.14em] text-fg-subtle">What they asked about</h3>
        <dl className="mt-3 grid gap-2.5 text-[13px]">
          <div className="flex items-center gap-2.5"><UserRound className="size-4 text-fg-subtle" /> {INTENT[c.intent]}</div>
          {ctx.arrival && <div className="flex items-center gap-2.5"><CalendarDays className="size-4 text-fg-subtle" /> {dateRange(String(ctx.arrival), ctx.departure ? String(ctx.departure) : null)}</div>}
          {ctx.adults && <div className="flex items-center gap-2.5"><Users className="size-4 text-fg-subtle" /> {ctx.adults} adult(s){ctx.children ? `, ${ctx.children} child(ren)` : ''}</div>}
          {ctx.roomTypeName && <div className="flex items-center gap-2.5"><BedDouble className="size-4 text-fg-subtle" /> {String(ctx.roomTypeName)}</div>}
          {ctx.pagePath && <div className="flex items-center gap-2.5"><Globe className="size-4 text-fg-subtle" /> <span className="truncate font-mono text-[12px]">{String(ctx.pagePath)}</span></div>}
        </dl>
        {can('waitlist:write') && c.intent !== 'WAITLIST' && (
          <Button className="mt-6 w-full" icon={<ListPlus className="size-4" />} loading={toWaitlist.isPending} onClick={() => toWaitlist.mutate()}>
            Add to first-stay list
          </Button>
        )}
        <p className="mt-6 rounded-xl bg-surface-2 p-3 text-[12px] leading-relaxed text-fg-muted">
          Bookings arrive in Movement II. Until then, put stay requests on the first-stay list so nobody is forgotten when the calendar opens.
        </p>
      </aside>
    </div>
  );
}
