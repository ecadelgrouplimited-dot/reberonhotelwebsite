'use client';
import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Download, MessageSquareText, Phone, Search, Star, Trash2 } from 'lucide-react';
import type { WaitlistEntryDTO } from '@reberon/contracts';
import { t } from '@reberon/contracts/text';
import { whatsappLink } from '@reberon/utils';
import { ApiError, del, get, patch } from '@/lib/api';
import { useCan, useMe } from '@/lib/providers';
import { ago, dateRange, dateTime } from '@/lib/format';
import { cn } from '@/lib/cn';
import { Button, buttonClass } from '@/components/ui/button';
import { Empty, PageHeader, Skeleton, Status, Tabs } from '@/components/ui/bits';
import { Dialog } from '@/components/ui/dialog';
import { DeleteConfirmDialog } from '@/components/ui/delete-dialog';
import { SelectInput, TextArea } from '@/components/ui/field';

type List = { data: WaitlistEntryDTO[]; total: number; counts: Record<string, number> };
type Detail = WaitlistEntryDTO & { history: { id: string; summary: string; actor: string; createdAt: string }[]; conversations: { id: string; reference: string; subject: string; status: string }[] };

function WaitlistInner() {
  const params = useSearchParams();
  const router = useRouter();
  const qc = useQueryClient();
  const can = useCan();
  const me = useMe();
  const isOwner = me.role === 'OWNER';
  const [status, setStatus] = useState('');
  const [room, setRoom] = useState('');
  const [month, setMonth] = useState('');
  const [sort, setSort] = useState('priority');
  const [q, setQ] = useState('');
  const [deletingItem, setDeletingItem] = useState<WaitlistEntryDTO | null>(null);

  const deleteMutation = useMutation({
    mutationFn: (id: string) => del(`/waitlist/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['waitlist'] });
      qc.invalidateQueries({ queryKey: ['badge', 'waitlist'] });
      toast.success('Waitlist entry deleted');
      setDeletingItem(null);
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Could not delete waitlist entry'),
  });

  const openId = params.get('open');
  const qs = new URLSearchParams({ ...(status ? { status } : {}), ...(room ? { roomTypeId: room } : {}), ...(month ? { month } : {}), ...(q ? { q } : {}), sort });
  const list = useQuery({ queryKey: ['waitlist', qs.toString()], queryFn: () => get<List>(`/waitlist?${qs}`) });
  const rooms = useQuery({ queryKey: ['room-types'], queryFn: () => get<{ id: string; name: Record<string, string> }[]>('/room-types') });
  const months = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(Date.UTC(2026, 9 + i, 1));
    return { value: d.toISOString().slice(0, 7), label: d.toLocaleString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' }) };
  });
  const c = list.data?.counts ?? {};

  return (
    <div className="fade-in">
      <PageHeader
        title="First-stay list"
        description="Names against rooms before keys exist. Not money — conversion happens when the calendar opens."
        actions={
          can('waitlist:export') && (
            <a href={`/v1/admin/waitlist/export.csv?${qs}`} className={buttonClass('secondary')}>
              <Download className="size-4" /> Export CSV
            </a>
          )
        }
      />
      <div className="card overflow-hidden">
        <Tabs
          className="px-3"
          value={status}
          onChange={setStatus}
          items={[
            { value: '', label: 'All', count: Object.values(c).reduce((a, b) => a + b, 0) },
            { value: 'NEW', label: 'New', count: c.NEW ?? 0 },
            { value: 'CONTACTED', label: 'Contacted', count: c.CONTACTED ?? 0 },
            { value: 'CONVERTED', label: 'Converted', count: c.CONVERTED ?? 0 },
            { value: 'DECLINED', label: 'Declined', count: c.DECLINED ?? 0 },
          ]}
        />
        <div className="flex flex-wrap items-center gap-2 border-b border-line p-3">
          <label className="relative min-w-56 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-subtle" />
            <input className="input !min-h-9 pl-9" placeholder="Search name, phone or WL-reference" value={q} onChange={(e) => setQ(e.target.value)} />
          </label>
          <select className="input !min-h-9 !w-auto" value={room} onChange={(e) => setRoom(e.target.value)} aria-label="Room">
            <option value="">Any room</option>
            {rooms.data?.map((r) => (
              <option key={r.id} value={r.id}>{t(r.name)}</option>
            ))}
            <option value="none">No preference</option>
          </select>
          <select className="input !min-h-9 !w-auto" value={month} onChange={(e) => setMonth(e.target.value)} aria-label="Month">
            <option value="">Any month</option>
            {months.map((m) => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </select>
          <select className="input !min-h-9 !w-auto" value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort">
            <option value="priority">Priority, then first to ask</option>
            <option value="dates">By preferred dates</option>
          </select>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-[13px]">
            <thead className="bg-surface-2/60 text-left text-[11.5px] font-semibold uppercase tracking-wider text-fg-subtle">
              <tr>
                <th className="px-4 py-2.5">Guest</th>
                <th className="px-4 py-2.5">Room</th>
                <th className="px-4 py-2.5">Wants</th>
                <th className="px-4 py-2.5">Guests</th>
                <th className="px-4 py-2.5">Status</th>
                <th className="px-4 py-2.5 text-right">Asked</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {list.isLoading &&
                Array.from({ length: 8 }, (_, i) => (
                  <tr key={i}>
                    <td colSpan={6} className="px-4 py-3"><Skeleton className="h-5" /></td>
                  </tr>
                ))}
              {list.data?.data.map((w) => (
                <tr key={w.id} onClick={() => router.push(`/waitlist?open=${w.id}`, { scroll: false })} className="cursor-pointer transition-colors hover:bg-surface-2/60">
                  <td className="px-4 py-3">
                    <span className="flex items-center gap-2 font-medium">
                      {w.priority > 0 && <Star className="size-3.5 fill-gold-400 text-gold-400" aria-label={`Priority ${w.priority}`} />}
                      {w.contact.name}
                    </span>
                    <span className="block text-[12px] tabular text-fg-subtle">{w.contact.phone} · {w.reference}</span>
                  </td>
                  <td className="px-4 py-3">{w.roomType ? t(w.roomType.name) : <span className="text-fg-subtle">Any</span>}</td>
                  <td className="px-4 py-3">
                    {dateRange(w.preferredFrom, w.preferredTo)}
                    {w.flexibleDates && <span className="ml-1.5 text-[11.5px] text-fg-subtle">flexible</span>}
                  </td>
                  <td className="px-4 py-3 tabular">{w.adults}{w.children ? ` + ${w.children}` : ''}</td>
                  <td className="px-4 py-3"><Status value={w.status} /></td>
                  <td className="px-4 py-3 text-right text-fg-subtle">
                    <div className="flex items-center justify-end gap-2">
                      <span>{ago(w.createdAt)}</span>
                      {isOwner && (
                        <Button
                          variant="danger"
                          size="sm"
                          icon={<Trash2 className="size-3" />}
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeletingItem(w);
                          }}
                          title="Delete entry (Owner only)"
                        />
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!list.isLoading && !list.data?.data.length && <Empty title="No names match" body="Try another filter. Names arrive from the website's first-stay form or from the inbox." />}
        </div>
      </div>
      <EntryDrawer id={openId} onClose={() => router.push('/waitlist', { scroll: false })} />

      {deletingItem && (
        <DeleteConfirmDialog
          open={!!deletingItem}
          onClose={() => setDeletingItem(null)}
          onConfirm={() => deleteMutation.mutate(deletingItem.id)}
          title={`Delete Waitlist Entry · ${deletingItem.contact.name}?`}
          itemName={`${deletingItem.contact.name} (${deletingItem.reference})`}
          itemType="First-Stay Waitlist Entry"
          warning="This will permanently delete this first-stay inquiry from the records."
          requireMatch="DELETE"
          loading={deleteMutation.isPending}
        />
      )}
    </div>
  );
}

function EntryDrawer({ id, onClose }: { id: string | null; onClose: () => void }) {
  const qc = useQueryClient();
  const can = useCan();
  const me = useMe();
  const isOwner = me.role === 'OWNER';
  const { data: w } = useQuery({ queryKey: ['waitlist-entry', id], queryFn: () => get<Detail>(`/waitlist/${id}`), enabled: !!id });
  const [notes, setNotes] = useState('');
  const [deleteOpen, setDeleteOpen] = useState(false);
  useEffect(() => setNotes(w?.staffNotes ?? ''), [w?.id, w?.staffNotes]);
  const save = useMutation({
    mutationFn: (body: Record<string, unknown>) => patch(`/waitlist/${id}`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['waitlist'] });
      qc.invalidateQueries({ queryKey: ['waitlist-entry', id] });
      qc.invalidateQueries({ queryKey: ['badge', 'waitlist'] });
      toast.success('Saved');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => del(`/waitlist/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['waitlist'] });
      qc.invalidateQueries({ queryKey: ['badge', 'waitlist'] });
      toast.success('Waitlist entry deleted');
      setDeleteOpen(false);
      onClose();
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Could not delete waitlist entry'),
  });
  return (
    <>
      <Dialog
        drawer
        open={!!id}
        onClose={onClose}
        title={w?.contact.name ?? 'Loading…'}
        description={w ? `${w.reference} · asked ${ago(w.createdAt)}` : undefined}
        footer={
          <div className="flex w-full items-center justify-between">
            {isOwner && w ? (
              <Button
                variant="danger"
                size="sm"
                icon={<Trash2 className="size-3.5" />}
                onClick={() => setDeleteOpen(true)}
              >
                Delete Entry
              </Button>
            ) : <span />}
            <Button variant="ghost" onClick={onClose}>
              Close
            </Button>
          </div>
        }
      >
      {!w ? (
        <Skeleton className="h-64" />
      ) : (
        <div className="grid gap-6">
          <div className="grid grid-cols-2 gap-3 text-[13px]">
            <div className="rounded-xl bg-surface-2 p-3">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-fg-subtle">Room</p>
              <p className="mt-1 font-medium">{w.roomType ? t(w.roomType.name) : 'Any room'}</p>
            </div>
            <div className="rounded-xl bg-surface-2 p-3">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-fg-subtle">Guests</p>
              <p className="mt-1 font-medium">{w.adults} adult{w.adults > 1 ? 's' : ''}{w.children ? `, ${w.children} child${w.children > 1 ? 'ren' : ''}` : ''}</p>
            </div>
            <div className="col-span-2 rounded-xl bg-surface-2 p-3">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-fg-subtle">Dates</p>
              <p className="mt-1 font-medium">{dateRange(w.preferredFrom, w.preferredTo)} {w.flexibleDates && <span className="text-fg-subtle">· flexible</span>}</p>
            </div>
          </div>
          {w.note && (
            <blockquote className="rounded-xl border-l-2 border-accent bg-surface-2/60 px-4 py-3 text-[13.5px] italic text-fg-muted">“{w.note}”</blockquote>
          )}
          <div className="flex flex-wrap gap-2">
            {can('bookings:write') && w.status !== 'CONVERTED' && (
              <a className={buttonClass('dark')} href={`/reservations/new?waitlist=${w.id}`}>Convert to reservation</a>
            )}
            {w.contact.phone && (
              <>
                <a className={buttonClass('primary')} target="_blank" rel="noopener noreferrer" href={whatsappLink(w.contact.phone, `Hello ${w.contact.name.split(' ')[0]}, this is Reberon Hotel about your first stay (${w.reference}).`)}>
                  <MessageSquareText className="size-4" /> WhatsApp
                </a>
                <a className={buttonClass('secondary')} href={`tel:${w.contact.phone}`}>
                  <Phone className="size-4" /> {w.contact.phone}
                </a>
              </>
            )}
          </div>
          {can('waitlist:write') && (
            <div className="grid gap-4">
              <div className="grid grid-cols-2 gap-3">
                <SelectInput label="Status" value={w.status} onChange={(e) => save.mutate({ status: e.target.value })}>
                  <option value="NEW">New</option>
                  <option value="CONTACTED">Contacted</option>
                  <option value="CONVERTED">Converted</option>
                  <option value="DECLINED">Declined</option>
                  <option value="EXPIRED">Expired</option>
                </SelectInput>
                <SelectInput label="Priority" value={w.priority} onChange={(e) => save.mutate({ priority: Number(e.target.value) })}>
                  <option value={0}>Normal</option>
                  <option value={1}>★ High</option>
                  <option value={3}>★★ Very high</option>
                  <option value={5}>★★★ Owner's guest</option>
                </SelectInput>
              </div>
              <TextArea label="Staff notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Called on…, prefers…, repeat guest of…" rows={4} />
              <Button variant="dark" className="justify-self-start" loading={save.isPending} disabled={notes === (w.staffNotes ?? '')} onClick={() => save.mutate({ staffNotes: notes || null })}>
                Save notes
              </Button>
            </div>
          )}
          {w.conversations.length > 0 && (
            <div>
              <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-fg-subtle">Conversations</h3>
              <ul className="grid gap-1.5">
                {w.conversations.map((c) => (
                  <li key={c.id}>
                    <Link href={`/inbox/${c.id}`} className="flex items-center gap-2 rounded-lg border border-line px-3 py-2 text-[13px] hover:bg-surface-2">
                      <span className="font-mono text-[11.5px] text-fg-subtle">{c.reference}</span>
                      <span className="truncate">{c.subject}</span>
                      <span className="ml-auto"><Status value={c.status} /></span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div>
            <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-fg-subtle">History</h3>
            <ol className="grid gap-2 text-[12.5px]">
              {w.history.map((h) => (
                <li key={h.id} className={cn('flex gap-2 text-fg-muted')}>
                  <span className="shrink-0 text-fg-subtle tabular">{dateTime(h.createdAt)}</span>
                  <span><span className="font-medium text-fg">{h.actor}</span> — {h.summary}</span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      )}
    </Dialog>

    {w && (
      <DeleteConfirmDialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onConfirm={() => deleteMutation.mutate()}
        title={`Delete Waitlist Entry · ${w.contact.name}?`}
        itemName={`${w.contact.name} (${w.reference})`}
        itemType="First-Stay Waitlist Entry"
        warning="This will permanently delete this first-stay inquiry from the records."
        requireMatch="DELETE"
        loading={deleteMutation.isPending}
      />
    )}
  </>
);
}

export default function WaitlistPage() {
  return (
    <Suspense>
      <WaitlistInner />
    </Suspense>
  );
}
