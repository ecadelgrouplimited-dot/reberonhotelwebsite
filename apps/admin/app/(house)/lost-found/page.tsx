'use client';
import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Gem, Hand, PackageCheck, PackageSearch, Plus, Printer, Search, Trash2, UserRoundCheck } from 'lucide-react';
import {
  LOST_ITEM_CATEGORIES,
  LOST_ITEM_CATEGORY_LABEL,
  VALUABLE_CATEGORIES,
  type LikelyOwnerDTO,
  type LostItemCategory,
  type LostItemDTO,
  type LostItemListDTO,
} from '@reberon/contracts';
import { ApiError, get, post } from '@/lib/api';
import { useCan } from '@/lib/providers';
import { ago, dateShort } from '@/lib/format';
import { printDoc } from '@/lib/documents';
import { cn } from '@/lib/cn';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Empty, PageHeader, Pill, Skeleton } from '@/components/ui/bits';
import { SelectInput, TextArea, TextInput } from '@/components/ui/field';
import { useScreenActions } from '@/components/os/screen-actions';

type View = 'stored' | 'due' | 'returned' | 'disposed';
const RETURN_METHOD = { IN_PERSON: 'Collected in person', COURIER: 'Sent by courier', POST: 'Sent by post', GUEST_REPRESENTATIVE: 'Collected by someone the guest sent' } as const;
const DISPOSAL = { DONATED: 'Donated', DESTROYED: 'Thrown away', POLICE: 'Handed to the police', STAFF_CLAIM: 'Given to the staff member who found it' } as const;
const fmtDay = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const daysLeft = (d: string) => Math.ceil((new Date(`${d}T00:00:00Z`).getTime() - Date.now()) / 86_400_000);
const localNow = () => {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
};

export default function LostFoundPage() {
  const can = useCan();
  const [view, setView] = useState<View>('stored');
  const [q, setQ] = useState('');
  const [logging, setLogging] = useState(false);
  const [returning, setReturning] = useState<LostItemDTO | null>(null);
  const [disposing, setDisposing] = useState<LostItemDTO | null>(null);
  const { data, isLoading } = useQuery({ queryKey: ['lost-found'], queryFn: () => get<LostItemListDTO>('/lost-found') });

  const items = useMemo(() => {
    const all = data?.items ?? [];
    const byView = all.filter((i) => (view === 'stored' ? i.status === 'STORED' : view === 'due' ? i.due : view === 'returned' ? i.status === 'RETURNED' : i.status === 'DISPOSED'));
    const n = q.trim().toLowerCase();
    return n ? byView.filter((i) => [i.number, i.description, i.foundWhere, i.storedAt, i.guestName, i.reservation?.code, i.reservation?.guestName, i.room?.number].some((x) => x?.toLowerCase().includes(n))) : byView;
  }, [data, view, q]);

  useScreenActions('Lost & found', [
    { label: 'Log a found item', icon: Plus, key: 'n', onSelect: () => setLogging(true) },
    { kind: 'separator' },
    { label: 'In storage', icon: PackageSearch, onSelect: () => setView('stored') },
    { label: 'Past the hold', icon: Trash2, onSelect: () => setView('due') },
  ]);

  const c = data?.counts;
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Lost & Found"
        description="Everything found in the hotel, where it is kept, and who it probably belongs to — until it goes home."
        actions={
          <Button variant="primary" icon={<Plus className="size-3.5" />} onClick={() => setLogging(true)}>
            Log a found item
          </Button>
        }
      />
      <div className="mb-4 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        {(
          [
            ['stored', 'In storage', c?.stored, ''],
            ['stored', 'Valuables in the safe', c?.valuables, 'text-violet-600'],
            ['due', 'Past the hold period', c?.due, c?.due ? 'text-amber-600' : ''],
            ['returned', 'Returned this month', c?.returnedThisMonth, 'text-emerald-600'],
          ] as [View, string, number | undefined, string][]
        ).map(([v, label, n, tone]) => (
          <button key={label} type="button" onClick={() => setView(v)} className="card p-3 text-left transition hover:border-fg/30">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-fg-subtle">{label}</p>
            <p className={cn('mt-1 text-[22px] font-semibold tabular-nums', tone)}>{n ?? '–'}</p>
          </button>
        ))}
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="flex rounded-lg border border-line bg-surface p-0.5">
          {(
            [
              ['stored', 'In storage'],
              ['due', `Past the hold${c?.due ? ` · ${c.due}` : ''}`],
              ['returned', 'Returned'],
              ['disposed', 'Disposed'],
            ] as [View, string][]
          ).map(([v, label]) => (
            <button key={v} type="button" onClick={() => setView(v)} className={cn('rounded-md px-3 py-1.5 text-[12.5px] font-semibold', view === v ? 'bg-fg text-bg' : 'text-fg-muted hover:text-fg')}>
              {label}
            </button>
          ))}
        </div>
        <label className="relative ml-auto w-full sm:w-64">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-fg-subtle" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search item, room, guest…" aria-label="Search lost and found" className="input h-8 pl-8 text-[12.5px]" />
        </label>
      </div>

      {isLoading ? (
        <Skeleton className="h-64" />
      ) : !items.length ? (
        <div className="card">
          <Empty
            icon={<PackageSearch className="size-4" />}
            title={view === 'stored' ? 'Nothing in lost and found' : view === 'due' ? 'Nothing past its hold period' : view === 'returned' ? 'Nothing returned in the last 90 days' : 'Nothing disposed of in the last 90 days'}
            body="Found something a guest left behind? Log it so anyone at the desk can find it when they call."
            action={
              <Button size="sm" variant="primary" icon={<Plus className="size-3.5" />} onClick={() => setLogging(true)}>
                Log a found item
              </Button>
            }
          />
        </div>
      ) : (
        <ul className="card divide-y divide-line overflow-hidden">
          {items.map((i) => {
            const left = daysLeft(i.holdUntil);
            return (
              <li key={i.id} className="flex flex-wrap items-center gap-3 px-3 py-3">
                <span className={cn('grid size-9 shrink-0 place-items-center rounded-lg', i.valuable ? 'bg-violet-500/12 text-violet-600' : 'bg-surface-2 text-fg-subtle')}>{i.valuable ? <Gem className="size-4" /> : <PackageSearch className="size-4" />}</span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="font-mono text-[11.5px] text-fg-subtle">{i.number}</span>
                    <span className="text-[13.5px] font-semibold">{i.description}</span>
                    {i.valuable && <Pill tone="amber">Valuable</Pill>}
                    {i.due && <Pill tone="red">Hold ended</Pill>}
                  </span>
                  <span className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[12px] text-fg-muted">
                    <span>
                      Found {i.foundWhere}
                      {i.room && !i.foundWhere.includes(i.room.number) ? ` (room ${i.room.number})` : ''} · {ago(i.foundAt)} by {i.foundByName.split(' ')[0]}
                    </span>
                    <span>Kept: {i.storedAt}</span>
                    {(i.reservation || i.guestName) && (
                      <span className="inline-flex items-center gap-1 text-fg">
                        <UserRoundCheck className="size-3" /> {i.reservation ? `${i.reservation.guestName} · ${i.reservation.code}` : i.guestName}
                        {i.guestContact ? ` · ${i.guestContact}` : ''}
                      </span>
                    )}
                    {i.status === 'RETURNED' && (
                      <span className="text-emerald-700 dark:text-emerald-400">
                        Returned to {i.returnedTo} {i.returnedAt ? dateShort(i.returnedAt) : ''} ({RETURN_METHOD[i.returnMethod as keyof typeof RETURN_METHOD] ?? i.returnMethod})
                      </span>
                    )}
                    {i.status === 'DISPOSED' && (
                      <span>
                        {DISPOSAL[i.disposalMethod as keyof typeof DISPOSAL] ?? i.disposalMethod} {i.disposedAt ? dateShort(i.disposedAt) : ''} by {i.handledByName}
                      </span>
                    )}
                  </span>
                </span>
                {i.status === 'STORED' && (
                  <span className="flex shrink-0 flex-wrap items-center gap-1.5">
                    <span className={cn('mr-1 text-[11.5px]', i.due ? 'font-semibold text-amber-600' : 'text-fg-subtle')}>{i.due ? `Held until ${fmtDay(i.holdUntil)}` : `${left} day${left === 1 ? '' : 's'} left`}</span>
                    <Button size="sm" variant="ghost" icon={<Printer className="size-3.5" />} onClick={() => void printDoc(`/v1/admin/lost-found/${i.id}/tag`)} title="Print a tag to keep with the item">
                      Tag
                    </Button>
                    <Button size="sm" variant="primary" icon={<Hand className="size-3.5" />} onClick={() => setReturning(i)}>
                      Return
                    </Button>
                    {(i.due || can('records:delete')) && (
                      <Button size="sm" variant="secondary" onClick={() => setDisposing(i)}>
                        Dispose
                      </Button>
                    )}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <LogDialog open={logging} onClose={() => setLogging(false)} rooms={data?.rooms ?? []} />
      <ReturnDialog item={returning} onClose={() => setReturning(null)} />
      <DisposeDialog item={disposing} onClose={() => setDisposing(null)} />
    </div>
  );
}

function LogDialog({ open, onClose, rooms }: { open: boolean; onClose: () => void; rooms: { id: string; number: string }[] }) {
  const qc = useQueryClient();
  const blank = { description: '', category: 'OTHER' as LostItemCategory, foundWhere: '', roomId: '', storedAt: '', foundAt: localNow(), reservationId: '', guestName: '', guestContact: '', notes: '' };
  const [f, setF] = useState(blank);
  const [err, setErr] = useState<Record<string, string>>({});
  useEffect(() => {
    if (open) {
      setF({ ...blank, foundAt: localNow() });
      setErr({});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  const valuable = VALUABLE_CATEGORIES.includes(f.category);
  const foundDate = f.foundAt.slice(0, 10);
  // Who stayed in that room around then — the likely owner.
  const { data: owners = [], isFetching } = useQuery({
    queryKey: ['likely-owners', f.roomId, foundDate],
    queryFn: () => get<LikelyOwnerDTO[]>(`/lost-found/likely-owners?roomId=${f.roomId}&date=${foundDate}`),
    enabled: open && !!f.roomId && /^\d{4}-\d{2}-\d{2}$/.test(foundDate),
  });
  const m = useMutation({
    mutationFn: () =>
      post<LostItemDTO>('/lost-found', {
        description: f.description,
        category: f.category,
        foundWhere: f.foundWhere,
        roomId: f.roomId || undefined,
        storedAt: f.storedAt,
        foundAt: new Date(f.foundAt).toISOString(),
        reservationId: f.reservationId || undefined,
        guestName: f.guestName,
        guestContact: f.guestContact,
        notes: f.notes,
      }),
    onSuccess: (i) => {
      qc.invalidateQueries({ queryKey: ['lost-found'] });
      qc.invalidateQueries({ queryKey: ['admin-pulse'] });
      toast.success(`${i.number} logged`, {
        description: `Kept at ${i.storedAt} until ${fmtDay(i.holdUntil)}.`,
        action: { label: 'Print tag', onClick: () => void printDoc(`/v1/admin/lost-found/${i.id}/tag`) },
      });
      onClose();
    },
    onError: (e) => {
      if (e instanceof ApiError) setErr(e.fieldErrors());
      toast.error(e instanceof ApiError ? e.message : 'Could not log it');
    },
  });
  const ready = f.description.trim().length >= 3 && f.foundWhere.trim().length >= 2 && f.storedAt.trim().length >= 2;
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Log a found item"
      description="Describe it so the owner would recognise it, and say where it is kept."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" loading={m.isPending} disabled={!ready} onClick={() => m.mutate()}>
            Log it
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        <TextInput label="What is it?" placeholder="e.g. Black Samsung phone in a red case" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} error={err.description} autoFocus />
        <div className="grid gap-1.5">
          <span className="text-[12.5px] font-semibold">Kind</span>
          <div className="flex flex-wrap gap-1.5">
            {LOST_ITEM_CATEGORIES.map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setF({ ...f, category: k, storedAt: f.storedAt || (VALUABLE_CATEGORIES.includes(k) ? 'Front desk safe' : '') })}
                className={cn('rounded-full border px-2.5 py-1 text-[12px] font-medium', f.category === k ? 'border-accent bg-accent/10 text-fg' : 'border-line text-fg-muted hover:text-fg')}
              >
                {LOST_ITEM_CATEGORY_LABEL[k]}
              </button>
            ))}
          </div>
          {valuable && <p className="flex items-center gap-1.5 text-[12px] text-violet-700 dark:text-violet-300"><Gem className="size-3.5" /> A valuable: keep it in the safe. Held 180 days, and returned only once the owner is confirmed.</p>}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <SelectInput
            label="Found in a room? (optional)"
            value={f.roomId}
            onChange={(e) => {
              const r = rooms.find((x) => x.id === e.target.value);
              setF({ ...f, roomId: e.target.value, reservationId: '', foundWhere: f.foundWhere || (r ? `Room ${r.number}` : '') });
            }}
          >
            <option value="">Not in a guest room</option>
            {rooms.map((r) => (
              <option key={r.id} value={r.id}>
                Room {r.number}
              </option>
            ))}
          </SelectInput>
          <TextInput label="Found where?" placeholder="e.g. Room 204, under the bed / Restaurant" value={f.foundWhere} onChange={(e) => setF({ ...f, foundWhere: e.target.value })} error={err.foundWhere} />
          <TextInput label="Found when?" type="datetime-local" max={localNow()} value={f.foundAt} onChange={(e) => setF({ ...f, foundAt: e.target.value })} />
          <TextInput label="Kept where?" placeholder={valuable ? 'Front desk safe' : 'e.g. Housekeeping store, shelf 2'} value={f.storedAt} onChange={(e) => setF({ ...f, storedAt: e.target.value })} error={err.storedAt} list="rb-lf-places" />
          <datalist id="rb-lf-places">
            <option value="Front desk safe" />
            <option value="Front desk drawer" />
            <option value="Housekeeping store" />
            <option value="Manager's office" />
          </datalist>
        </div>

        {f.roomId && (
          <div className="grid gap-2 rounded-xl border border-line bg-surface-2/60 p-3">
            <p className="text-[12.5px] font-semibold">Probably belongs to…</p>
            {isFetching ? (
              <Skeleton className="h-10" />
            ) : owners.length ? (
              <div className="grid gap-1.5">
                {owners.map((o) => (
                  <button
                    key={o.reservationId}
                    type="button"
                    onClick={() => setF({ ...f, reservationId: f.reservationId === o.reservationId ? '' : o.reservationId, guestName: '', guestContact: '' })}
                    className={cn('flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left text-[12.5px]', f.reservationId === o.reservationId ? 'border-accent bg-accent/10' : 'border-line bg-surface hover:border-fg/30')}
                  >
                    <span>
                      <b>{o.guestName}</b> · {o.code}
                      <span className="block text-[11.5px] text-fg-muted">
                        Stayed {fmtDay(o.fromDate)} → {fmtDay(o.toDate)}
                        {o.guestPhone ? ` · ${o.guestPhone}` : o.guestEmail ? ` · ${o.guestEmail}` : ''}
                      </span>
                    </span>
                    <span className="text-[11.5px] font-semibold text-accent">{f.reservationId === o.reservationId ? 'Linked ✓' : 'Link'}</span>
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-[12px] text-fg-muted">Nobody stayed in that room in the few days before. Add the owner below if you know them.</p>
            )}
          </div>
        )}
        {!f.reservationId && (
          <div className="grid gap-3 sm:grid-cols-2">
            <TextInput label="Owner (if known)" value={f.guestName} onChange={(e) => setF({ ...f, guestName: e.target.value })} />
            <TextInput label="Owner's phone or email" value={f.guestContact} onChange={(e) => setF({ ...f, guestContact: e.target.value })} />
          </div>
        )}
        <TextArea label="Notes (optional)" rows={2} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} />
      </div>
    </Dialog>
  );
}

function ReturnDialog({ item, onClose }: { item: LostItemDTO | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [f, setF] = useState({ returnedTo: '', method: 'IN_PERSON' as keyof typeof RETURN_METHOD, proof: '', note: '' });
  useEffect(() => {
    if (item) setF({ returnedTo: item.reservation?.guestName ?? item.guestName ?? '', method: 'IN_PERSON', proof: '', note: '' });
  }, [item]);
  const m = useMutation({
    mutationFn: () => post<LostItemDTO>(`/lost-found/${item!.id}/return`, f),
    onSuccess: (i) => {
      qc.invalidateQueries({ queryKey: ['lost-found'] });
      qc.invalidateQueries({ queryKey: ['admin-pulse'] });
      toast.success(`${i.number} returned to ${i.returnedTo}`);
      onClose();
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Could not save'),
  });
  return (
    <Dialog
      open={!!item}
      onClose={onClose}
      title={item ? `Return ${item.number}` : ''}
      description={item?.description}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" icon={<PackageCheck className="size-3.5" />} loading={m.isPending} disabled={f.returnedTo.trim().length < 2 || (!!item?.valuable && !f.proof.trim())} onClick={() => m.mutate()}>
            Returned
          </Button>
        </>
      }
    >
      <div className="grid gap-3">
        <TextInput label="Returned to" value={f.returnedTo} onChange={(e) => setF({ ...f, returnedTo: e.target.value })} autoFocus />
        <SelectInput label="How" value={f.method} onChange={(e) => setF({ ...f, method: e.target.value as keyof typeof RETURN_METHOD })}>
          {Object.entries(RETURN_METHOD).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </SelectInput>
        {item?.valuable && (
          <TextInput label="How did you confirm it is theirs?" placeholder="e.g. National ID seen, matched booking RB-9XCSC" value={f.proof} onChange={(e) => setF({ ...f, proof: e.target.value })} hint="Needed for valuables" />
        )}
        <TextArea label="Note (optional)" rows={2} placeholder={f.method === 'COURIER' ? 'Courier and tracking number' : ''} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} />
      </div>
    </Dialog>
  );
}

function DisposeDialog({ item, onClose }: { item: LostItemDTO | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [method, setMethod] = useState<keyof typeof DISPOSAL>('DONATED');
  const [note, setNote] = useState('');
  useEffect(() => {
    if (item) {
      setMethod(item.valuable ? 'POLICE' : 'DONATED');
      setNote('');
    }
  }, [item]);
  const m = useMutation({
    mutationFn: () => post<LostItemDTO>(`/lost-found/${item!.id}/dispose`, { method, note }),
    onSuccess: (i) => {
      qc.invalidateQueries({ queryKey: ['lost-found'] });
      qc.invalidateQueries({ queryKey: ['admin-pulse'] });
      toast.success(`${i.number}: ${DISPOSAL[method].toLowerCase()}`);
      onClose();
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Could not save'),
  });
  return (
    <Dialog
      open={!!item}
      onClose={onClose}
      title={item ? `Dispose of ${item.number}` : ''}
      description={item ? `${item.description} — ${item.due ? `held since ${dateShort(item.foundAt)}, hold ended ${fmtDay(item.holdUntil)}` : `the hold runs until ${fmtDay(item.holdUntil)}: only do this early if it cannot be kept`}` : undefined}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Keep it
          </Button>
          <Button variant="danger" loading={m.isPending} onClick={() => m.mutate()}>
            {DISPOSAL[method]}
          </Button>
        </>
      }
    >
      <div className="grid gap-3">
        <SelectInput label="What happens to it" value={method} onChange={(e) => setMethod(e.target.value as keyof typeof DISPOSAL)}>
          {Object.entries(DISPOSAL)
            .filter(([k]) => !(item?.valuable && k === 'STAFF_CLAIM'))
            .map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
        </SelectInput>
        <TextArea label="Note (optional)" rows={2} placeholder={method === 'POLICE' ? 'Station and reference number' : method === 'DONATED' ? 'To whom' : ''} value={note} onChange={(e) => setNote(e.target.value)} />
      </div>
    </Dialog>
  );
}
