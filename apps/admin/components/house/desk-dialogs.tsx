'use client';
import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Frown, LogIn, LogOut, Meh, Smile } from 'lucide-react';
import type { HkStatus } from '@reberon/contracts';
import { ApiError, get, post } from '@/lib/api';
import { useCan } from '@/lib/providers';
import { money, toMinorStr } from '@/lib/money';
import { dateRange, dateShort } from '@/lib/format';
import { cn } from '@/lib/cn';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/bits';
import { Dialog } from '@/components/ui/dialog';
import { Switch, TextArea, TextInput } from '@/components/ui/field';
import { HkBadge } from './hk';
import { printDocument } from '@/components/documents/documents-panel';
import type { DocumentRegisterDTO } from '@reberon/contracts';

/** The minimum a desk dialog needs to know about a stay. */
export interface StayRef {
  id: string;
  code: string;
  guest: { name: string };
  arrival: string;
  departure: string;
  nights: number;
  adults: number;
  children: number;
  currency: string;
  balanceMinor: string;
  /** Rooms already given, kept as the starting choice. */
  keep?: { reservationRoomId: string; roomId: string }[];
}

type RoomOption = { reservationRoomId: string; roomTypeId: string; name: string; quantity: number; rooms: { id: string; number: string; floor: number; hkStatus: HkStatus; free: boolean; why: string | null }[] };

const METHODS = [['MOBILE_MONEY', 'Mobile money'], ['CASH', 'Cash'], ['CARD', 'Card'], ['BANK', 'Bank']] as const;
const major = (m: bigint, cur: string) => (cur === 'USD' ? (Number(m) / 100).toFixed(2) : String(m));
const errMsg = (e: unknown) => (e instanceof ApiError ? (e.errors[0]?.message && e.status === 422 ? e.errors[0].message : e.message) : (e as Error).message);

function Chips<T extends string>({ value, onChange, items }: { value: T; onChange: (v: T) => void; items: readonly (readonly [T, string])[] }) {
  return (
    <div className="flex flex-wrap gap-2" role="radiogroup">
      {items.map(([v, l]) => (
        <button key={v} type="button" role="radio" aria-checked={value === v} onClick={() => onChange(v)} className={cn('h-12 rounded-full border px-4 text-[14px] font-medium transition', value === v ? 'border-fg bg-fg text-bg' : 'border-line-strong hover:border-fg/40')}>
          {l}
        </button>
      ))}
    </div>
  );
}

function PaymentFields({ on, setOn, amount, setAmount, method, setMethod, reference, setReference, balance, currency, required }: {
  on: boolean; setOn: (v: boolean) => void; amount: string; setAmount: (v: string) => void; method: string; setMethod: (v: string) => void; reference: string; setReference: (v: string) => void; balance: bigint; currency: string; required?: boolean;
}) {
  return (
    <div className="grid gap-3 rounded-2xl border border-line p-4">
      <div className="flex items-baseline justify-between gap-3">
        <p className="font-semibold">Balance</p>
        <p className={cn('text-[1.35rem] font-semibold tabular', balance > 0n ? 'text-fg' : 'text-success')}>{balance > 0n ? money(balance, currency) : 'Settled'}</p>
      </div>
      {balance > 0n && (
        <>
          {!required && <Switch label="Take payment now" checked={on} onChange={setOn} />}
          {(on || required) && (
            <>
              <TextInput label={`Amount (${currency})`} inputMode="decimal" className="!min-h-12 text-[16px]" value={amount} onChange={(e) => setAmount(e.target.value)} />
              <Chips value={method} onChange={setMethod} items={METHODS} />
              <TextInput label="Reference (optional)" placeholder="MoMo ID, receipt…" value={reference} onChange={(e) => setReference(e.target.value)} />
            </>
          )}
        </>
      )}
    </div>
  );
}

/** The newest valid document of a kind for this booking (to offer "print" right away). */
async function latest(reservationId: string, kind: 'RECEIPT' | 'INVOICE') {
  try {
    const r = await get<DocumentRegisterDTO>(`/documents?reservationId=${reservationId}&kind=${kind}`);
    return r.data.find((d) => !d.voided) ?? null;
  } catch {
    return null; // someone without receipt access still checked the guest in
  }
}

/* ───────── Room picking ───────── */

export type { RoomOption };

export function usePicker(options: RoomOption[] | undefined, keep?: { reservationRoomId: string; roomId: string }[]) {
  const [picked, setPicked] = useState<Record<string, string[]>>({});
  // Keep rooms already given; otherwise suggest the first ready rooms.
  useEffect(() => {
    if (!options) return;
    const next: Record<string, string[]> = {};
    const used = new Set<string>();
    const rank = (s: HkStatus) => (s === 'INSPECTED' ? 0 : s === 'VACANT_CLEAN' ? 1 : 2);
    for (const o of options) {
      const kept = (keep ?? []).filter((k) => k.reservationRoomId === o.reservationRoomId).map((k) => k.roomId);
      const ready = o.rooms.filter((r) => r.free && ['INSPECTED', 'VACANT_CLEAN'].includes(r.hkStatus) && !used.has(r.id)).sort((a, b) => rank(a.hkStatus) - rank(b.hkStatus));
      next[o.reservationRoomId] = kept.length ? kept : ready.slice(0, o.quantity).map((r) => r.id);
      next[o.reservationRoomId]!.forEach((id) => used.add(id));
    }
    setPicked(next);
  }, [options]); // eslint-disable-line react-hooks/exhaustive-deps
  const assignments = useMemo(() => Object.entries(picked).flatMap(([reservationRoomId, ids]) => ids.map((roomId) => ({ reservationRoomId, roomId }))), [picked]);
  const complete = !!options && options.every((o) => (picked[o.reservationRoomId]?.length ?? 0) === o.quantity);
  const dirtyChosen = !!options?.some((o) => o.rooms.some((r) => picked[o.reservationRoomId]?.includes(r.id) && r.hkStatus === 'VACANT_DIRTY'));
  return { picked, setPicked, assignments, complete, dirtyChosen };
}

export function RoomPicker({ options, picked, setPicked, allowUnclean }: { options: RoomOption[]; picked: Record<string, string[]>; setPicked: (f: (p: Record<string, string[]>) => Record<string, string[]>) => void; allowUnclean?: boolean }) {
  const toggle = (rrId: string, roomId: string, quantity: number) =>
    setPicked((p) => {
      const cur = p[rrId] ?? [];
      if (cur.includes(roomId)) return { ...p, [rrId]: cur.filter((x) => x !== roomId) };
      return { ...p, [rrId]: quantity === 1 ? [roomId] : [...cur, roomId].slice(-quantity) };
    });
  return (
    <>
      {options.map((o) => (
        <div key={o.reservationRoomId} className="grid gap-2">
          <p className="text-[13px] text-fg-muted">{o.name}{o.quantity > 1 ? ` — choose ${o.quantity}` : ''}</p>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(6.5rem,1fr))] gap-2">
            {o.rooms.map((r) => {
              const on = picked[o.reservationRoomId]?.includes(r.id);
              const out = !r.free || (!allowUnclean && ['BLOCKED', 'OUT_OF_ORDER', 'OCCUPIED'].includes(r.hkStatus));
              return (
                <button key={r.id} type="button" disabled={out} onClick={() => toggle(o.reservationRoomId, r.id, o.quantity)} title={r.why ?? undefined}
                  className={cn('flex min-h-16 flex-col items-start justify-center rounded-2xl border px-3 py-2 text-left transition disabled:cursor-not-allowed disabled:opacity-40', on ? 'border-fg bg-fg text-bg' : 'border-line-strong hover:border-fg/40')}>
                  <span className="text-[1.2rem] font-semibold leading-none tabular">{r.number}</span>
                  {on ? <span className="mt-1 text-[11.5px] font-semibold">Chosen</span> : out ? <span className="mt-1 truncate text-[11px]">{r.why ?? 'Not free'}</span> : <HkBadge status={r.hkStatus} className="mt-1" />}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </>
  );
}

/* ───────── Check in ───────── */

export function CheckInDialog({ stay, open, onClose, onDone }: { stay: StayRef | null; open: boolean; onClose: () => void; onDone: () => void }) {
  const can = useCan();
  const opts = useQuery({ queryKey: ['desk-options', stay?.id], queryFn: () => get<RoomOption[]>(`/desk/reservations/${stay!.id}/rooms`), enabled: open && !!stay });
  const [allowDirty, setAllowDirty] = useState(false);
  const balance = stay ? BigInt(stay.balanceMinor) : 0n;
  const [pay, setPay] = useState(true);
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('MOBILE_MONEY');
  const [reference, setReference] = useState('');
  const [doc, setDoc] = useState({ idDocType: 'National ID', idDocNumber: '', nationality: '' });

  useEffect(() => {
    if (!open || !stay) return;
    setAmount(major(balance, stay.currency));
    setPay(balance > 0n);
    setReference('');
    setAllowDirty(false);
    setDoc({ idDocType: 'National ID', idDocNumber: '', nationality: '' });
  }, [open, stay?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const { picked, setPicked, assignments, complete, dirtyChosen } = usePicker(opts.data, stay?.keep);

  const m = useMutation({
    mutationFn: () => {
      const payment = pay && balance > 0n && can('payments:record') ? { amount: toMinorStr(amount, stay!.currency), method, reference: reference || undefined } : undefined;
      if (payment && !payment.amount) throw new Error('Enter the amount taken');
      return post(`/desk/reservations/${stay!.id}/check-in`, { assignments, allowDirty, payment, idDocType: doc.idDocNumber ? doc.idDocType : undefined, idDocNumber: doc.idDocNumber || undefined, nationality: doc.nationality || undefined });
    },
    onSuccess: async () => {
      const receipt = pay && balance > 0n ? await latest(stay!.id, 'RECEIPT') : null;
      toast.success(`${stay!.guest.name.split(' ')[0]} is in. Welcome to Reberon.`, receipt ? { description: `Receipt ${receipt.number}`, duration: 12000, action: { label: 'Print receipt', onClick: () => printDocument(receipt.id) } } : undefined);
      onDone();
    },
    onError: (e) => toast.error(errMsg(e)),
  });

  return (
    <Dialog
      open={open}
      onClose={onClose}
      drawer
      title={stay ? `Check in ${stay.guest.name}` : 'Check in'}
      description={stay && <span><span className="font-mono">{stay.code}</span> · {dateRange(stay.arrival, stay.departure)} · {stay.adults + stay.children} guest{stay.adults + stay.children > 1 ? 's' : ''}</span>}
      footer={<><Button variant="ghost" size="lg" onClick={onClose}>Not yet</Button><Button variant="primary" size="touch" icon={<LogIn className="size-5" />} loading={m.isPending} disabled={!complete || (dirtyChosen && !allowDirty)} onClick={() => m.mutate()}>Check in</Button></>}
    >
      <div className="grid gap-6">
        <section className="grid gap-3">
          <p className="font-semibold">1 · Room</p>
          {opts.isLoading && <Skeleton className="h-32" />}
          {opts.data && <RoomPicker options={opts.data} picked={picked} setPicked={setPicked} />}
          {dirtyChosen && <Switch label="Check in before cleaning is finished" hint="Housekeeping will be told the guest is already in." checked={allowDirty} onChange={setAllowDirty} />}
        </section>

        {can('payments:record') && stay && (
          <section className="grid gap-3">
            <p className="font-semibold">2 · Payment</p>
            <PaymentFields on={pay} setOn={setPay} amount={amount} setAmount={setAmount} method={method} setMethod={setMethod} reference={reference} setReference={setReference} balance={balance} currency={stay.currency} />
          </section>
        )}

        <section className="grid gap-3">
          <p className="font-semibold">{can('payments:record') ? '3' : '2'} · Identity <span className="font-normal text-fg-muted">(optional)</span></p>
          <div className="grid items-start gap-3 sm:grid-cols-2">
            <TextInput label="Document" value={doc.idDocType} onChange={(e) => setDoc({ ...doc, idDocType: e.target.value })} placeholder="National ID, passport…" />
            <TextInput label="Number" value={doc.idDocNumber} onChange={(e) => setDoc({ ...doc, idDocNumber: e.target.value })} hint="Stored encrypted; only the last 4 are shown" autoComplete="off" />
            <TextInput label="Nationality" wrapClassName="sm:col-span-2" value={doc.nationality} onChange={(e) => setDoc({ ...doc, nationality: e.target.value })} />
          </div>
        </section>
      </div>
    </Dialog>
  );
}

/* ───────── Check out ───────── */

type FolioDetail = { balanceMinor: string; totalMinor: string; paidMinor: string; currency: string; folio: { id: string; kind: string; description: string; date: string; amountMinor: string }[] };

const FACES = [
  ['GOOD', 'Good', Smile],
  ['OK', 'OK', Meh],
  ['BAD', 'Not good', Frown],
] as const;

export function CheckOutDialog({ stay, open, onClose, onDone }: { stay: StayRef | null; open: boolean; onClose: () => void; onDone: () => void }) {
  const can = useCan();
  const d = useQuery({ queryKey: ['reservation', stay?.id], queryFn: () => get<FolioDetail>(`/reservations/${stay!.id}`), enabled: open && !!stay });
  const balance = d.data ? BigInt(d.data.balanceMinor) : stay ? BigInt(stay.balanceMinor) : 0n;
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('MOBILE_MONEY');
  const [reference, setReference] = useState('');
  const [writeOff, setWriteOff] = useState(false);
  const [reason, setReason] = useState('');
  const [score, setScore] = useState<'GOOD' | 'OK' | 'BAD' | null>(null);
  const [comment, setComment] = useState('');
  useEffect(() => {
    if (!open || !stay) return;
    setAmount(major(balance, stay.currency));
    setReference('');
    setWriteOff(false);
    setReason('');
    setScore(null);
    setComment('');
  }, [open, stay?.id, d.data?.balanceMinor]); // eslint-disable-line react-hooks/exhaustive-deps

  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Kampala' }).format(new Date());
  const early = stay ? stay.departure > today : false;

  const m = useMutation({
    mutationFn: () => {
      const payment = balance > 0n && !writeOff ? { amount: toMinorStr(amount, stay!.currency), method, reference: reference || undefined } : undefined;
      if (payment && !payment.amount) throw new Error('Enter the amount taken');
      return post(`/desk/reservations/${stay!.id}/check-out`, { payment, writeOffReason: writeOff ? reason : undefined, feedback: score ? { score, comment: comment || undefined } : undefined });
    },
    onSuccess: async () => {
      const invoice = await latest(stay!.id, 'INVOICE');
      toast.success(`${stay!.guest.name.split(' ')[0]} has checked out. The room is on the cleaning list.`, invoice ? { description: `Invoice ${invoice.number}`, duration: 15000, action: { label: 'Print invoice', onClick: () => printDocument(invoice.id) } } : undefined);
      onDone();
    },
    onError: (e) => toast.error(errMsg(e)),
  });

  const ready = balance <= 0n || (writeOff ? reason.trim().length >= 3 : !!amount);
  const shown = d.data?.folio.filter((l) => !['PAYMENT', 'REFUND'].includes(l.kind)) ?? [];

  return (
    <Dialog
      open={open}
      onClose={onClose}
      drawer
      title={stay ? `Check out ${stay.guest.name}` : 'Check out'}
      description={stay && <span><span className="font-mono">{stay.code}</span> · {dateRange(stay.arrival, stay.departure)}{early && <b className="text-warning"> · leaving early</b>}</span>}
      footer={<><Button variant="ghost" size="lg" onClick={onClose}>Not yet</Button><Button variant="primary" size="touch" icon={<LogOut className="size-5" />} loading={m.isPending} disabled={!ready || !can('payments:record') && balance > 0n} onClick={() => m.mutate()}>{balance > 0n && !writeOff ? `Take ${money(toMinorStr(amount, stay?.currency ?? 'UGX') ?? '0', stay?.currency ?? 'UGX')} and check out` : 'Check out'}</Button></>}
    >
      <div className="grid gap-6">
        <section className="grid gap-2">
          <p className="font-semibold">The bill</p>
          {d.isLoading && <Skeleton className="h-28" />}
          {d.data && (
            <ul className="divide-y divide-line rounded-2xl border border-line text-[13px]">
              {shown.map((l) => (
                <li key={l.id} className="flex items-baseline justify-between gap-3 px-4 py-2">
                  <span><span className="mr-2 tabular text-fg-subtle">{dateShort(l.date)}</span>{l.description}</span>
                  <span className="tabular">{BigInt(l.amountMinor) < 0n ? '−' : ''}{money(BigInt(l.amountMinor) < 0n ? -BigInt(l.amountMinor) : BigInt(l.amountMinor), d.data.currency)}</span>
                </li>
              ))}
              <li className="flex justify-between px-4 py-2 font-semibold"><span>Total</span><span className="tabular">{money(d.data.totalMinor, d.data.currency)}</span></li>
              <li className="flex justify-between px-4 py-2 text-success"><span>Paid</span><span className="tabular">−{money(d.data.paidMinor, d.data.currency)}</span></li>
            </ul>
          )}
          {early && <p className="text-[12.5px] text-fg-muted">The remaining nights go back on sale. They stay on the bill unless a manager credits them.</p>}
        </section>

        {stay && (
          <section className="grid gap-3">
            {can('payments:record') ? (
              <PaymentFields on required amount={amount} setAmount={setAmount} method={method} setMethod={setMethod} reference={reference} setReference={setReference} balance={writeOff ? 0n : balance} currency={stay.currency} setOn={() => undefined} />
            ) : balance > 0n ? (
              <p className="rounded-xl bg-warning/10 px-4 py-3 text-[13px]">{money(balance, stay.currency)} is still owed. Ask someone who can take payments.</p>
            ) : null}
            {balance > 0n && can('payments:refund') && (
              <div className="grid gap-2">
                <Switch label="Close the bill without the balance" hint="Owner or manager only. Say why; it is kept in the history." checked={writeOff} onChange={setWriteOff} />
                {writeOff && <TextInput label="Why" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Company will pay by transfer, goodwill…" />}
              </div>
            )}
          </section>
        )}

        <section className="grid gap-3">
          <p className="font-semibold">How was the stay? <span className="font-normal text-fg-muted">(ask at the desk — optional)</span></p>
          <div className="grid grid-cols-3 gap-2" role="radiogroup">
            {FACES.map(([v, l, Icon]) => (
              <button key={v} type="button" role="radio" aria-checked={score === v} onClick={() => setScore(score === v ? null : v)} className={cn('flex h-16 flex-col items-center justify-center gap-1 rounded-2xl border text-[13px] font-medium transition', score === v ? 'border-fg bg-fg text-bg' : 'border-line-strong hover:border-fg/40')}>
                <Icon className="size-5" aria-hidden /> {l}
              </button>
            ))}
          </div>
          {score && <TextArea rows={2} label="In their words" value={comment} onChange={(e) => setComment(e.target.value)} />}
          {!score && <p className="text-[12.5px] text-fg-muted">If nothing is recorded here, the guest gets a thank-you email with a one-tap question.</p>}
        </section>
      </div>
    </Dialog>
  );
}

/* ───────── Pre-Assign / Change Room Number (for CONFIRMED / HELD) ───────── */

export function AssignRoomDialog({ stay, open, onClose, onDone }: { stay: StayRef | null; open: boolean; onClose: () => void; onDone: () => void }) {
  const opts = useQuery({
    queryKey: ['desk-options', stay?.id, 'assign'],
    queryFn: () => get<RoomOption[]>(`/desk/reservations/${stay!.id}/rooms`),
    enabled: open && !!stay,
  });
  const [allowDirty, setAllowDirty] = useState(false);
  useEffect(() => {
    if (open) setAllowDirty(false);
  }, [open, stay?.id]);

  const p = usePicker(opts.data, stay?.keep);

  const m = useMutation({
    mutationFn: () => post(`/desk/reservations/${stay!.id}/assign`, { assignments: p.assignments, allowDirty }),
    onSuccess: () => {
      toast.success(`Room number assigned for ${stay!.guest.name}`);
      onDone();
    },
    onError: (e) => toast.error(errMsg(e)),
  });

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={stay ? `Assign Room Number · ${stay.guest.name}` : 'Assign Room Number'}
      description={stay && <span><span className="font-mono">{stay.code}</span> · {dateRange(stay.arrival, stay.departure)} · Select a specific room number to reserve for this guest</span>}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            loading={m.isPending}
            disabled={!p.complete || (p.dirtyChosen && !allowDirty)}
            onClick={() => m.mutate()}
          >
            Save Room Assignment
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        {opts.isLoading ? (
          <Skeleton className="h-32" />
        ) : (
          opts.data && <RoomPicker options={opts.data} picked={p.picked} setPicked={p.setPicked} allowUnclean />
        )}
        {p.dirtyChosen && (
          <Switch
            label="Pre-assign even though room is currently dirty"
            hint="Housekeeping will clean this room before check-in."
            checked={allowDirty}
            onChange={setAllowDirty}
          />
        )}
      </div>
    </Dialog>
  );
}

/* ───────── Move Room Number (for IN_HOUSE) ───────── */

export function MoveRoomDialog({
  stay,
  currentRooms,
  open,
  onClose,
  onDone,
}: {
  stay: StayRef | null;
  currentRooms: { reservationRoomId: string; roomId: string; number: string }[];
  open: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const opts = useQuery({
    queryKey: ['desk-options', stay?.id, 'move'],
    queryFn: () => get<RoomOption[]>(`/desk/reservations/${stay!.id}/rooms`),
    enabled: open && !!stay,
  });
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [reason, setReason] = useState('');
  const [allowDirty, setAllowDirty] = useState(false);

  useEffect(() => {
    if (open) {
      setFrom(currentRooms[0]?.roomId ?? '');
      setTo('');
      setReason('');
      setAllowDirty(false);
    }
  }, [open, stay?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const current = currentRooms.find((a) => a.roomId === from);
  const options =
    opts.data
      ?.find((o) => o.reservationRoomId === current?.reservationRoomId)
      ?.rooms.filter((x) => x.id !== from && !currentRooms.some((a) => a.roomId === x.id)) ?? [];
  const target = options.find((x) => x.id === to);

  const m = useMutation({
    mutationFn: () => post(`/desk/reservations/${stay!.id}/move`, { fromRoomId: from, toRoomId: to, reason, allowDirty }),
    onSuccess: () => {
      toast.success('Guest moved to new room. Previous room queued for housekeeping.');
      onDone();
    },
    onError: (e) => toast.error(errMsg(e)),
  });

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={stay ? `Move Room · ${stay.guest.name}` : 'Move Room'}
      description="Transfer an in-house guest to another available room number. The old room will be marked Vacant Dirty."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            loading={m.isPending}
            disabled={!to || reason.trim().length < 3 || (target?.hkStatus === 'VACANT_DIRTY' && !allowDirty)}
            onClick={() => m.mutate()}
          >
            Confirm Room Move
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        {currentRooms.length > 1 && (
          <div className="flex flex-wrap gap-2">
            {currentRooms.map((a) => (
              <button
                key={a.roomId}
                type="button"
                onClick={() => setFrom(a.roomId)}
                className={cn(
                  'h-10 rounded-full border px-4 text-[13px] font-semibold',
                  from === a.roomId ? 'border-fg bg-fg text-bg' : 'border-line-strong',
                )}
              >
                From Room {a.number}
              </button>
            ))}
          </div>
        )}
        {opts.isLoading ? (
          <Skeleton className="h-24" />
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(6.5rem,1fr))] gap-2">
            {options.map((x) => {
              const out = !x.free || ['OCCUPIED', 'BLOCKED', 'OUT_OF_ORDER'].includes(x.hkStatus);
              return (
                <button
                  key={x.id}
                  type="button"
                  disabled={out}
                  onClick={() => setTo(x.id)}
                  className={cn(
                    'min-h-14 rounded-2xl border px-3 py-2 text-left text-[1.1rem] font-semibold tabular transition disabled:opacity-40',
                    to === x.id ? 'border-fg bg-fg text-bg' : 'border-line-strong hover:border-fg/40',
                  )}
                >
                  {x.number}
                  <span className="block text-[11px] font-normal">
                    {out ? (x.why ?? 'Not free') : x.hkStatus === 'VACANT_DIRTY' ? 'Needs cleaning' : 'Ready'}
                  </span>
                </button>
              );
            })}
            {!options.length && <p className="text-[13px] text-fg-muted">No other rooms of this suite type are available.</p>}
          </div>
        )}
        {target?.hkStatus === 'VACANT_DIRTY' && (
          <Switch label="Move guest before room is cleaned" checked={allowDirty} onChange={setAllowDirty} />
        )}
        <TextInput
          label="Reason for move"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Guest preference, AC/plumbing maintenance, quieter view…"
        />
      </div>
    </Dialog>
  );
}

/* ───────── Quick Folio Charge / Credit / Payment Dialog ───────── */

export function FolioChargeDialog({ stay, open, onClose, onDone }: { stay: StayRef | null; open: boolean; onClose: () => void; onDone: () => void }) {
  const can = useCan();
  const [mode, setMode] = useState<'charge' | 'payment'>('charge');
  const [kind, setKind] = useState<'FNB' | 'EXTRA' | 'ADJUSTMENT'>('FNB');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [credit, setCredit] = useState(false);
  const [method, setMethod] = useState('MOBILE_MONEY');
  const [reference, setReference] = useState('');

  const balance = stay ? BigInt(stay.balanceMinor) : 0n;

  useEffect(() => {
    if (!open || !stay) return;
    setMode(balance > 0n ? 'payment' : 'charge');
    setKind('FNB');
    setDescription('');
    setAmount(balance > 0n ? major(balance, stay.currency) : '');
    setCredit(false);
    setMethod('MOBILE_MONEY');
    setReference('');
  }, [open, stay?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const postCharge = useMutation({
    mutationFn: () => {
      const minor = toMinorStr(amount, stay!.currency);
      if (!minor || minor === '0') throw new Error('Enter an amount');
      return post(`/desk/reservations/${stay!.id}/charges`, { kind, description, amount: minor, credit });
    },
    onSuccess: () => {
      toast.success(credit ? 'Credit posted to folio' : 'Charge added to folio');
      onDone();
    },
    onError: (e) => toast.error(errMsg(e)),
  });

  const postPay = useMutation({
    mutationFn: () => {
      const minor = toMinorStr(amount, stay!.currency);
      if (!minor || minor === '0') throw new Error('Enter an amount');
      return post(`/reservations/${stay!.id}/payments`, { amount: minor, method, reference: reference || undefined });
    },
    onSuccess: async () => {
      const receipt = await latest(stay!.id, 'RECEIPT');
      toast.success(
        'Payment recorded on folio',
        receipt ? { description: `Receipt ${receipt.number}`, duration: 12000, action: { label: 'Print receipt', onClick: () => printDocument(receipt.id) } } : undefined,
      );
      onDone();
    },
    onError: (e) => toast.error(errMsg(e)),
  });

  const QUICK = ['Dinner & Drinks', 'Room Service Breakfast', 'Laundry Service', 'Sipi Falls Guide', '4x4 Airport Transfer', 'Mini-Bar / Refreshments'];

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="sm"
      title={stay ? `Folio & Billing · ${stay.guest.name}` : 'Folio & Billing'}
      description={stay && <span><span className="font-mono">{stay.code}</span> · Current Balance: <b>{balance > 0n ? money(balance, stay.currency) : 'Settled'}</b></span>}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          {mode === 'charge' ? (
            <Button
              variant={credit ? 'danger' : 'primary'}
              loading={postCharge.isPending}
              disabled={description.trim().length < 2 || !amount}
              onClick={() => postCharge.mutate()}
            >
              {credit ? 'Post Credit' : 'Post Charge'}
            </Button>
          ) : (
            <Button
              variant="primary"
              loading={postPay.isPending}
              disabled={!amount}
              onClick={() => postPay.mutate()}
            >
              Record Payment
            </Button>
          )}
        </>
      }
    >
      <div className="grid gap-4">
        <div className="flex rounded-xl border border-line bg-surface-2 p-1 text-xs font-semibold">
          <button
            type="button"
            onClick={() => {
              setMode('charge');
              setAmount('');
            }}
            className={cn('flex-1 rounded-lg py-2 transition', mode === 'charge' ? 'bg-fg text-bg' : 'text-fg-muted hover:text-fg')}
          >
            + Post Charge / Credit
          </button>
          {can('payments:record') && (
            <button
              type="button"
              onClick={() => {
                setMode('payment');
                if (stay && balance > 0n) setAmount(major(balance, stay.currency));
              }}
              className={cn('flex-1 rounded-lg py-2 transition', mode === 'payment' ? 'bg-fg text-bg' : 'text-fg-muted hover:text-fg')}
            >
              Take Payment
            </button>
          )}
        </div>

        {mode === 'charge' ? (
          <>
            {!credit && (
              <div className="flex gap-2">
                {([
                  ['FNB', 'Food & Drink'],
                  ['EXTRA', 'Activity / Extra'],
                  ['ADJUSTMENT', 'Other'],
                ] as const).map(([v, l]) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setKind(v)}
                    className={cn(
                      'h-9 flex-1 rounded-full border text-xs font-semibold transition',
                      kind === v ? 'border-fg bg-fg text-bg' : 'border-line-strong hover:border-fg/40',
                    )}
                  >
                    {l}
                  </button>
                ))}
              </div>
            )}
            <TextInput
              label="Description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={credit ? 'Manager goodwill credit / discount' : 'e.g. Dinner — Mount Elgon Trout × 2'}
            />
            {!credit && (
              <div className="-mt-2 flex flex-wrap gap-1.5">
                {QUICK.map((qk) => (
                  <button
                    key={qk}
                    type="button"
                    onClick={() => setDescription(qk)}
                    className="rounded-full border border-line bg-surface-2 px-2.5 py-1 text-[11px] font-medium text-fg-muted hover:border-fg/40 hover:text-fg"
                  >
                    {qk}
                  </button>
                ))}
              </div>
            )}
            <TextInput
              label={`Amount (${stay?.currency ?? 'UGX'})`}
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="e.g. 65000"
            />
            {can('payments:refund') && (
              <Switch
                label="Post as a credit (reduces guest balance)"
                hint="Manager / Owner adjustment"
                checked={credit}
                onChange={setCredit}
              />
            )}
          </>
        ) : (
          <>
            <TextInput
              label={`Payment Amount (${stay?.currency ?? 'UGX'})`}
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
            <Chips value={method} onChange={setMethod} items={METHODS} />
            <TextInput
              label="Payment Reference (optional)"
              placeholder="MTN MoMo ID, POS slip, or bank ref…"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
            />
          </>
        )}
      </div>
    </Dialog>
  );
}
