'use client';
import { use, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Check, Download, Pencil, Plus, Search, Undo2, UserCheck, X } from 'lucide-react';
import type { EventCardDTO, EventRegistrationDTO, RegistrationStatus } from '@reberon/contracts';
import { t } from '@reberon/contracts/text';
import { ApiError, get, post } from '@/lib/api';
import { useCan } from '@/lib/providers';
import { ago } from '@/lib/format';
import { cn } from '@/lib/cn';
import { Button, buttonClass } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Empty, PageHeader, Pill, Skeleton } from '@/components/ui/bits';
import { TextArea, TextInput } from '@/components/ui/field';
import { useConfirm } from '@/components/ui/confirm';
import { useScreenActions } from '@/components/os/screen-actions';

const STATUS: Record<RegistrationStatus, { label: string; tone: 'green' | 'amber' | 'neutral' | 'blue' }> = {
  CONFIRMED: { label: 'Confirmed', tone: 'green' },
  ATTENDED: { label: 'Here', tone: 'blue' },
  WAITLISTED: { label: 'Waiting list', tone: 'amber' },
  CANCELLED: { label: 'Cancelled', tone: 'neutral' },
};
const when = (iso: string) => new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Kampala' }).format(new Date(iso));

export default function GuestList({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const qc = useQueryClient();
  const can = useCan();
  const confirm = useConfirm();
  const [q, setQ] = useState('');
  const [adding, setAdding] = useState(false);
  const { data, isLoading } = useQuery({ queryKey: ['event-guests', id], queryFn: () => get<{ event: EventCardDTO; registrations: EventRegistrationDTO[] }>(`/events/${id}/registrations`), refetchInterval: 30_000 });
  const set = useMutation({
    mutationFn: ({ regId, status }: { regId: string; status: RegistrationStatus }) => post<EventRegistrationDTO>(`/events/registrations/${regId}/status`, { status }),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['event-guests', id] });
      qc.invalidateQueries({ queryKey: ['/events'] });
      toast.success(r.status === 'ATTENDED' ? `${r.name} checked in` : `${r.name}: ${STATUS[r.status].label.toLowerCase()}`, { duration: 1600 });
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Could not save'),
  });

  const regs = useMemo(() => {
    const all = data?.registrations ?? [];
    const n = q.trim().toLowerCase();
    return n ? all.filter((r) => [r.name, r.code, r.email, r.phone].some((x) => x?.toLowerCase().includes(n))) : all;
  }, [data, q]);
  const seated = (data?.registrations ?? []).filter((r) => r.status === 'CONFIRMED' || r.status === 'ATTENDED');
  const here = (data?.registrations ?? []).filter((r) => r.status === 'ATTENDED').reduce((n, r) => n + r.partySize, 0);
  const booked = seated.reduce((n, r) => n + r.partySize, 0);
  const waiting = (data?.registrations ?? []).filter((r) => r.status === 'WAITLISTED').reduce((n, r) => n + r.partySize, 0);

  useScreenActions('Guest list', [
    ...(can('events:manage') ? [{ label: 'Add a guest', icon: Plus, key: 'n', onSelect: () => setAdding(true) }] : []),
    { label: 'Download the list (CSV)', icon: Download, onSelect: () => window.open(`/v1/admin/events/${id}/registrations.csv`, '_blank') },
  ]);

  if (isLoading || !data) return <Skeleton className="h-96" />;
  const e = data.event;
  return (
    <div className="fade-in mx-auto max-w-5xl">
      <PageHeader
        crumbs={[{ label: 'Website' }, { label: 'Events', href: '/website/events' }, { label: t(e.title), href: `/website/events/${e.id}` }]}
        title={`Guests — ${t(e.title)}`}
        description={when(e.startsAt)}
        actions={
          <>
            <a className={buttonClass('secondary')} href={`/v1/admin/events/${id}/registrations.csv`} download>
              <Download className="size-3.5" /> CSV
            </a>
            <Button variant="primary" icon={<Plus className="size-3.5" />} onClick={() => setAdding(true)} disabled={e.status === 'CANCELLED'}>
              Add a guest
            </Button>
          </>
        }
      />
      <div className="mb-4 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        {[
          ['Booked', `${booked}${e.capacity ? ` / ${e.capacity}` : ''}`],
          ['Places left', e.seatsLeft === null ? 'No limit' : String(e.seatsLeft)],
          ['Waiting list', String(waiting)],
          ['Arrived', `${here} of ${booked}`],
        ].map(([k, v]) => (
          <div key={k} className="card p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-fg-subtle">{k}</p>
            <p className="mt-1 text-[20px] font-semibold tabular-nums">{v}</p>
          </div>
        ))}
      </div>
      <label className="relative mb-3 block sm:w-72">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-fg-subtle" />
        <input value={q} onChange={(ev) => setQ(ev.target.value)} placeholder="Find by name, phone or reference…" aria-label="Find a guest" className="input h-9 pl-8" autoFocus />
      </label>
      <div className="card overflow-hidden">
        {!regs.length ? (
          <Empty title={q ? 'Nobody matches' : 'No bookings yet'} body={q ? 'Try part of the name or the reference.' : 'Bookings from the website appear here as they come in.'} />
        ) : (
          <ul className="divide-y divide-line">
            {regs.map((r) => (
              <li key={r.id} className={cn('flex flex-wrap items-center gap-3 px-4 py-3', r.status === 'CANCELLED' && 'opacity-55')}>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{r.name}</span>
                    <span className="rounded bg-surface-2 px-1.5 py-0.5 text-[11.5px] font-semibold tabular-nums">× {r.partySize}</span>
                    <Pill tone={STATUS[r.status].tone} dot>{STATUS[r.status].label}</Pill>
                    {r.source === 'house' && <span className="text-[11px] text-fg-subtle">added by staff</span>}
                  </span>
                  <span className="mt-0.5 block text-[12px] text-fg-muted">
                    <span className="font-mono">{r.code}</span>
                    {r.phone ? ` · ${r.phone}` : ''}
                    {r.email ? ` · ${r.email}` : ''} · booked {ago(r.createdAt)}
                  </span>
                  {r.notes && <span className="mt-1 block text-[12.5px]">“{r.notes}”</span>}
                </span>
                <span className="flex shrink-0 flex-wrap gap-1.5">
                  {r.status === 'CONFIRMED' && (
                    <Button size="sm" variant="primary" icon={<UserCheck className="size-3.5" />} onClick={() => set.mutate({ regId: r.id, status: 'ATTENDED' })}>
                      Check in
                    </Button>
                  )}
                  {r.status === 'ATTENDED' && (
                    <Button size="sm" variant="ghost" icon={<Undo2 className="size-3.5" />} onClick={() => set.mutate({ regId: r.id, status: 'CONFIRMED' })}>
                      Undo
                    </Button>
                  )}
                  {r.status === 'WAITLISTED' && (
                    <Button size="sm" variant="secondary" icon={<Check className="size-3.5" />} onClick={() => set.mutate({ regId: r.id, status: 'CONFIRMED' })}>
                      Confirm
                    </Button>
                  )}
                  {(r.status === 'CONFIRMED' || r.status === 'WAITLISTED') && (
                    <Button
                      size="sm"
                      variant="ghost"
                      icon={<X className="size-3.5" />}
                      onClick={async () => {
                        if (await confirm({ title: `Cancel ${r.name}'s booking?`, body: `${r.partySize} place(s) go back${r.email ? ' and they are emailed' : ''}. The waiting list moves up automatically.`, confirm: 'Cancel booking' })) set.mutate({ regId: r.id, status: 'CANCELLED' });
                      }}
                    >
                      Cancel
                    </Button>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <AddGuest open={adding} onClose={() => setAdding(false)} eventId={id} />
    </div>
  );
}

function AddGuest({ open, onClose, eventId }: { open: boolean; onClose: () => void; eventId: string }) {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const [f, setF] = useState({ name: '', phone: '', email: '', partySize: 2, notes: '' });
  const m = useMutation({
    mutationFn: (force: boolean) => post<EventRegistrationDTO>(`/events/${eventId}/registrations${force ? '?force=1' : ''}`, f),
    onSuccess: (r) => {
      toast.success(`${r.name} added (${r.code})`);
      qc.invalidateQueries({ queryKey: ['event-guests', eventId] });
      qc.invalidateQueries({ queryKey: ['/events'] });
      setF({ name: '', phone: '', email: '', partySize: 2, notes: '' });
      onClose();
    },
    onError: async (e) => {
      if (e instanceof ApiError && e.status === 409 && (await confirm({ title: 'Over the limit', body: `${e.message}`, confirm: 'Add anyway' }))) m.mutate(true);
      else if (!(e instanceof ApiError && e.status === 409)) toast.error(e instanceof ApiError ? e.message : 'Could not add');
    },
  });
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Add a guest"
      description="For bookings by phone, WhatsApp or at the desk. They get the confirmation email if you add their email."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" icon={<Pencil className="size-3.5" />} loading={m.isPending} disabled={f.name.trim().length < 2} onClick={() => m.mutate(false)}>
            Add
          </Button>
        </>
      }
    >
      <div className="grid gap-3">
        <TextInput label="Name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} autoFocus />
        <div className="grid gap-3 sm:grid-cols-[1fr_1fr_6rem]">
          <TextInput label="Phone" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />
          <TextInput label="Email" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
          <TextInput label="People" type="number" min={1} max={50} value={f.partySize} onChange={(e) => setF({ ...f, partySize: Math.max(1, Number(e.target.value) || 1) })} />
        </div>
        <TextArea label="Notes" rows={2} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} />
      </div>
    </Dialog>
  );
}
