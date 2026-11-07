'use client';
import { useEffect, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { AlertTriangle, ArrowRight, Minus, Plus } from 'lucide-react';
import type { AmendPreviewDTO } from '@reberon/contracts';
import { ApiError, get, post } from '@/lib/api';
import { money } from '@/lib/money';
import { dateShort } from '@/lib/format';
import { cn } from '@/lib/cn';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/bits';
import { Dialog } from '@/components/ui/dialog';
import { SelectInput, Switch, TextInput } from '@/components/ui/field';

export interface AmendTarget {
  id: string;
  code: string;
  status: string;
  arrival: string;
  departure: string;
  adults: number;
  children: number;
  currency: string;
  rooms: { roomTypeId: string; quantity: number }[];
  ratePlan: { id: string };
  extras: { extraId?: string; quantity: number }[];
  contact: { email: string | null };
}

interface Options {
  roomTypes: { id: string; name: string; sleepsAdults: number; sleepsChildren: number }[];
  ratePlans: { id: string; name: string; mealPlan: string; depositPercent: number; isPublic: boolean }[];
  extras: { id: string; name: string; unit: string; priceMinor: string }[];
}

const plus = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const nightsBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);

function Step({ value, set, min = 0, max = 99 }: { value: number; set: (n: number) => void; min?: number; max?: number }) {
  return (
    <span className="inline-flex h-10 items-center rounded-xl border border-line-strong">
      <button type="button" className="grid size-9 place-items-center disabled:opacity-30" disabled={value <= min} onClick={() => set(value - 1)} aria-label="Less"><Minus className="size-3.5" /></button>
      <span className="min-w-7 text-center tabular">{value}</span>
      <button type="button" className="grid size-9 place-items-center disabled:opacity-30" disabled={value >= max} onClick={() => set(value + 1)} aria-label="More"><Plus className="size-3.5" /></button>
    </span>
  );
}

/**
 * Change a booking — or, for a guest in the house, extend / shorten the stay.
 * Every edit is priced by a dry run on the server before anything is saved.
 */
export function AmendDialog<T>({ r, mode, open, onClose, onDone }: { r: AmendTarget; mode: 'full' | 'extend'; open: boolean; onClose: () => void; onDone: (d: T) => void }) {
  const inHouse = r.status === 'IN_HOUSE';
  const rr = r.rooms[0];
  const [arrival, setArrival] = useState(r.arrival);
  const [departure, setDeparture] = useState(r.departure);
  const [adults, setAdults] = useState(r.adults);
  const [children, setChildren] = useState(r.children);
  const [roomTypeId, setRoomTypeId] = useState(rr?.roomTypeId ?? '');
  const [ratePlanId, setRatePlanId] = useState(r.ratePlan.id);
  const [rooms, setRooms] = useState(rr?.quantity ?? 1);
  const [extras, setExtras] = useState<Record<string, number>>({});
  const [keepRates, setKeepRates] = useState(true);
  const [reason, setReason] = useState('');
  const [notify, setNotify] = useState(false);

  useEffect(() => {
    if (!open) return;
    setArrival(r.arrival);
    setDeparture(mode === 'extend' ? plus(r.departure, 1) : r.departure);
    setAdults(r.adults);
    setChildren(r.children);
    setRoomTypeId(rr?.roomTypeId ?? '');
    setRatePlanId(r.ratePlan.id);
    setRooms(rr?.quantity ?? 1);
    setExtras(Object.fromEntries(r.extras.filter((e) => e.extraId).map((e) => [e.extraId!, e.quantity])));
    setKeepRates(true);
    setReason('');
    setNotify(!!r.contact.email && r.status === 'CONFIRMED');
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const opts = useQuery({ queryKey: ['amend-options', r.id], queryFn: () => get<Options>(`/reservations/${r.id}/amend-options`), enabled: open && mode === 'full' });

  const nights = nightsBetween(arrival, departure);
  const body = {
    arrival, departure, adults, children, roomTypeId, ratePlanId, rooms, keepRates,
    extras: Object.entries(extras).filter(([, n]) => n > 0).map(([extraId, quantity]) => ({ extraId, quantity })),
    reason: reason || undefined,
    notifyGuest: notify,
  };
  const key = JSON.stringify({ ...body, reason: undefined, notifyGuest: undefined });
  const [debounced, setDebounced] = useState(key);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(key), 350);
    return () => clearTimeout(t);
  }, [key]);
  const preview = useQuery({
    queryKey: ['amend-preview', r.id, debounced],
    queryFn: () => post<AmendPreviewDTO>(`/reservations/${r.id}/amend`, { ...JSON.parse(debounced), preview: true }),
    enabled: open && nights > 0,
    retry: false,
  });
  const unchanged = arrival === r.arrival && departure === r.departure && adults === r.adults && children === r.children && roomTypeId === rr?.roomTypeId && ratePlanId === r.ratePlan.id && rooms === rr?.quantity
    && JSON.stringify(Object.entries(extras).filter(([, n]) => n > 0).sort()) === JSON.stringify(r.extras.filter((e) => e.extraId).map((e) => [e.extraId, e.quantity]).sort());

  const save = useMutation({
    mutationFn: () => post<T>(`/reservations/${r.id}/amend`, body),
    onSuccess: (d) => { toast.success(mode === 'extend' ? 'Stay updated' : 'Booking changed'); onDone(d); },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : (e as Error).message),
  });

  const p = preview.data;
  const delta = p ? BigInt(p.deltaMinor) : 0n;
  const balance = p ? BigInt(p.balanceAfterMinor) : 0n;
  const ready = !!p && !preview.isFetching && debounced === key && !unchanged;
  const previewError = preview.error instanceof ApiError ? preview.error.message : preview.error ? 'Could not price this change' : null;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="lg"
      title={mode === 'extend' ? `Change the stay — ${r.code}` : `Change booking ${r.code}`}
      description={mode === 'extend' ? 'Extend or shorten the stay. Booked nights keep their price; new nights use today’s rate.' : 'Dates, guests, room or rate. The folio is corrected with new lines — nothing is edited.'}
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" loading={save.isPending} disabled={!ready} onClick={() => save.mutate()}>{p && delta !== 0n ? `Save · ${delta > 0n ? '+' : '−'}${money(delta < 0n ? -delta : delta, r.currency)}` : 'Save change'}</Button></>}
    >
      <div className="grid gap-5">
        {mode === 'extend' ? (
          <div className="grid gap-3">
            <div className="flex flex-wrap items-end gap-4">
              <div className="grid gap-1.5"><span className="label">Nights</span><Step value={nights} set={(n) => setDeparture(plus(arrival, n))} min={1} max={60} /></div>
              <TextInput label="New departure" type="date" value={departure} min={plus(arrival, 1)} onChange={(e) => e.target.value && setDeparture(e.target.value)} />
            </div>
            <div className="flex flex-wrap gap-1.5">
              {[1, 2, 3, 7].map((n) => <button key={n} type="button" onClick={() => setDeparture(plus(r.departure, n))} className={cn('rounded-full border px-3 py-1 text-[12.5px] font-medium', departure === plus(r.departure, n) ? 'border-fg bg-fg text-bg' : 'border-line-strong text-fg-muted')}>+{n} night{n > 1 ? 's' : ''}</button>)}
              <button type="button" onClick={() => setDeparture(plus(r.departure, -1))} disabled={nightsBetween(arrival, r.departure) <= 1} className="rounded-full border border-line-strong px-3 py-1 text-[12.5px] font-medium text-fg-muted disabled:opacity-40">Leave a night early</button>
            </div>
          </div>
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-[1fr_auto_1fr]">
              <TextInput label="Arrival" type="date" value={arrival} disabled={inHouse} onChange={(e) => { if (!e.target.value) return; const n = Math.max(1, nights); setArrival(e.target.value); setDeparture(plus(e.target.value, n)); }} />
              <div className="grid gap-1.5"><span className="label">Nights</span><Step value={Math.max(nights, 0)} set={(n) => setDeparture(plus(arrival, n))} min={1} max={60} /></div>
              <TextInput label="Departure" type="date" value={departure} min={plus(arrival, 1)} onChange={(e) => e.target.value && setDeparture(e.target.value)} error={nights > 0 ? undefined : 'After arrival'} />
            </div>
            <div className="grid gap-4 sm:grid-cols-[auto_auto_auto_1fr]">
              <div className="grid gap-1.5"><span className="label">Adults</span><Step value={adults} set={setAdults} min={1} max={12} /></div>
              <div className="grid gap-1.5"><span className="label">Children</span><Step value={children} set={setChildren} max={12} /></div>
              <div className="grid gap-1.5"><span className="label">Rooms</span><Step value={rooms} set={setRooms} min={1} max={10} /></div>
              <span />
            </div>
            {opts.isLoading ? <Skeleton className="h-12" /> : opts.data && (
              <div className="grid gap-4 sm:grid-cols-2">
                <SelectInput label="Room type" value={roomTypeId} disabled={inHouse} onChange={(e) => setRoomTypeId(e.target.value)}>
                  {opts.data.roomTypes.map((x) => <option key={x.id} value={x.id}>{x.name} (sleeps {x.sleepsAdults}{x.sleepsChildren ? `+${x.sleepsChildren}` : ''})</option>)}
                </SelectInput>
                <SelectInput label="Rate" value={ratePlanId} disabled={inHouse} onChange={(e) => setRatePlanId(e.target.value)}>
                  {opts.data.ratePlans.map((x) => <option key={x.id} value={x.id}>{x.name} · {x.depositPercent}% deposit{x.isPublic ? '' : ' (private)'}</option>)}
                </SelectInput>
              </div>
            )}
            {opts.data && opts.data.extras.length > 0 && (
              <div>
                <p className="label mb-1.5">Extras</p>
                <ul className="grid gap-2 sm:grid-cols-2">
                  {opts.data.extras.map((e) => (
                    <li key={e.id} className="flex items-center justify-between gap-2 rounded-xl border border-line px-3 py-2 text-[13px]">
                      <span><span className="block font-medium">{e.name}</span><span className="text-[12px] text-fg-muted">{money(e.priceMinor, r.currency)} {e.unit.toLowerCase().replace('_', ' ')}</span></span>
                      <Step value={extras[e.id] ?? 0} set={(n) => setExtras({ ...extras, [e.id]: n })} max={20} />
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <Switch label="Keep booked prices for nights already booked" hint="Off: every night is re-priced at today’s rate sheet." checked={keepRates} onChange={setKeepRates} />
          </>
        )}

        {/* the dry run */}
        <div className="rounded-2xl border border-line bg-surface-2/50 p-4">
          {unchanged ? <p className="text-[13px] text-fg-muted">Make a change to see the new price.</p>
            : previewError ? <p className="flex items-start gap-2 text-[13px] text-danger"><AlertTriangle className="mt-0.5 size-4 shrink-0" /> {previewError}</p>
            : !p ? <Skeleton className="h-20" />
            : (
              <div className={cn('grid gap-3 text-[13px] transition-opacity', (preview.isFetching || debounced !== key) && 'opacity-50')}>
                <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
                  <div>
                    <p className="text-[11.5px] uppercase tracking-wider text-fg-subtle">Now</p>
                    <p className="font-medium">{dateShort(p.before.arrival)} → {dateShort(p.before.departure)} · {p.before.nights}n</p>
                    <p className="text-fg-muted">{p.before.rooms} × {p.before.roomType} · {p.before.ratePlan}</p>
                    <p className="text-fg-muted">{p.before.adults}+{p.before.children} guests · total {money(p.before.totalMinor, p.currency)}</p>
                  </div>
                  <ArrowRight className="size-4 text-fg-subtle" />
                  <div>
                    <p className="text-[11.5px] uppercase tracking-wider text-fg-subtle">After</p>
                    <p className="font-medium">{dateShort(p.after.arrival)} → {dateShort(p.after.departure)} · {p.after.nights}n</p>
                    <p className="text-fg-muted">{p.after.rooms} × {p.after.roomType} · {p.after.ratePlan}</p>
                    <p className="text-fg-muted">{p.after.adults}+{p.after.children} guests · total <b className="text-fg">{money(p.after.totalMinor, p.currency)}</b></p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-x-6 gap-y-1 border-t border-line pt-3">
                  <span>Difference <b className={cn('tabular', delta > 0n ? 'text-fg' : delta < 0n ? 'text-success' : 'text-fg-muted')}>{delta === 0n ? 'none' : `${delta > 0n ? '+' : '−'}${money(delta < 0n ? -delta : delta, p.currency)}`}</b></span>
                  <span>Paid <b className="tabular">{money(p.paidMinor, p.currency)}</b></span>
                  <span>{balance < 0n ? 'Refund due' : 'Balance after'} <b className="tabular">{money(balance < 0n ? -balance : balance, p.currency)}</b></span>
                  <span className="text-fg-muted">Deposit {money(p.after.depositMinor, p.currency)}</span>
                </div>
                {p.notes.length > 0 && <ul className="grid gap-1 text-[12.5px] text-warning">{p.notes.map((n) => <li key={n} className="flex items-start gap-1.5"><AlertTriangle className="mt-0.5 size-3.5 shrink-0" />{n}</li>)}</ul>}
              </div>
            )}
        </div>

        <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
          <TextInput label="Reason (for the history)" value={reason} onChange={(e) => setReason(e.target.value)} placeholder={mode === 'extend' ? 'Guest staying on for the trek' : 'Guest called to move dates'} />
          {r.status === 'CONFIRMED' && r.contact.email && <Switch label="Email the guest" checked={notify} onChange={setNotify} />}
        </div>
      </div>
    </Dialog>
  );
}
