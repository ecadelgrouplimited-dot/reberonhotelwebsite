'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowRightLeft, CalendarPlus, DoorOpen, LogIn, LogOut, Receipt, UserX } from 'lucide-react';
import { ApiError, get, post } from '@/lib/api';
import { useCan } from '@/lib/providers';
import { toMinorStr } from '@/lib/money';
import { dateTime } from '@/lib/format';
import { cn } from '@/lib/cn';
import { Button } from '@/components/ui/button';
import { Pill, Skeleton } from '@/components/ui/bits';
import { Dialog } from '@/components/ui/dialog';
import { Switch, TextInput } from '@/components/ui/field';
import { useConfirm } from '@/components/ui/confirm';
import { CheckInDialog, CheckOutDialog, RoomPicker, usePicker, type RoomOption, type StayRef } from './desk-dialogs';

export interface StayDetail extends StayRef {
  status: string;
  checkedInAt: string | null;
  checkedOutAt: string | null;
  previousStays: number;
  contact: { id?: string; name: string };
  reservationRooms: { id: string; roomTypeId: string; name: string; quantity: number }[];
  assignments: { id: string; reservationRoomId: string; roomId: string; number: string; fromDate: string; toDate: string; active: boolean }[];
  feedback: { score: string; comment: string | null; allowPublic: boolean; createdAt: string } | null;
}

const kampalaToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Kampala' }).format(new Date());
const err = (e: unknown) => toast.error(e instanceof ApiError ? e.message : (e as Error).message);

/** The desk's side of a reservation: rooms, arrival, departure, charges. */
export function StayPanel({ r, onChange, autoCheckIn, onExtend }: { r: StayDetail; onChange: () => void; autoCheckIn?: boolean; onExtend?: () => void }) {
  const can = useCan();
  const confirm = useConfirm();
  const [dialog, setDialog] = useState<null | 'in' | 'out' | 'assign' | 'move' | 'charge'>(null);
  useEffect(() => {
    if (autoCheckIn && r.status === 'CONFIRMED') setDialog('in');
  }, [autoCheckIn, r.status]);
  const today = kampalaToday();
  const live = r.assignments.filter((a) => a.active);
  const past = r.assignments.filter((a) => !a.active);
  const desk = can('desk:operate');
  const noShow = useMutation({ mutationFn: () => post(`/desk/reservations/${r.id}/no-show`, {}), onSuccess: () => { toast.success('Marked as no-show'); onChange(); }, onError: err });
  const stay: StayRef = { ...r, guest: { name: r.contact.name }, keep: live.map((a) => ({ reservationRoomId: a.reservationRoomId, roomId: a.roomId })) };

  if (!['HELD', 'CONFIRMED', 'IN_HOUSE', 'CHECKED_OUT'].includes(r.status) && !r.assignments.length) return null;
  return (
    <div className="card grid gap-4 p-5">
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-2 font-semibold"><DoorOpen className="size-4 text-fg-subtle" /> At the desk</p>
        {r.previousStays > 0 && <Pill tone="blue">Stayed {r.previousStays}× before</Pill>}
      </div>

      <div>
        <p className="text-[12px] text-fg-muted">{r.status === 'CHECKED_OUT' ? 'Stayed in' : 'Room'}</p>
        <div className="mt-1.5 flex flex-wrap gap-2">
          {(r.status === 'CHECKED_OUT' ? past : live).map((a) => <span key={a.id} className="grid h-12 min-w-12 place-items-center rounded-xl border border-line-strong px-3 text-[1.1rem] font-semibold tabular">{a.number}</span>)}
          {!live.length && r.status !== 'CHECKED_OUT' && <span className="text-[13px] text-fg-subtle">Not given yet</span>}
        </div>
        {r.status === 'IN_HOUSE' && past.length > 0 && <p className="mt-1.5 text-[12px] text-fg-subtle">Before: {past.map((a) => a.number).join(', ')}</p>}
      </div>

      {(r.checkedInAt || r.checkedOutAt) && (
        <dl className="grid gap-1 text-[12.5px]">
          {r.checkedInAt && <div className="flex justify-between"><dt className="text-fg-muted">Checked in</dt><dd>{dateTime(r.checkedInAt)}</dd></div>}
          {r.checkedOutAt && <div className="flex justify-between"><dt className="text-fg-muted">Checked out</dt><dd>{dateTime(r.checkedOutAt)}</dd></div>}
        </dl>
      )}

      {r.feedback && (
        <blockquote className={cn('rounded-xl px-3 py-2 text-[12.5px]', r.feedback.score === 'BAD' ? 'bg-danger/5' : r.feedback.score === 'OK' ? 'bg-warning/10' : 'bg-success/10')}>
          <b>{{ GOOD: 'Good', OK: 'OK', BAD: 'Not good' }[r.feedback.score]}</b>{r.feedback.comment && <> — “{r.feedback.comment}”</>}
        </blockquote>
      )}

      {desk && (
        <div className="grid gap-2">
          {r.status === 'CONFIRMED' && r.arrival <= today && r.departure > today && <Button variant="primary" size="touch" icon={<LogIn className="size-5" />} onClick={() => setDialog('in')}>Check in</Button>}
          {r.status === 'IN_HOUSE' && <Button variant={r.departure <= today ? 'primary' : 'secondary'} size="touch" icon={<LogOut className="size-5" />} onClick={() => setDialog('out')}>Check out</Button>}
          <div className="flex flex-wrap gap-2">
            {['HELD', 'CONFIRMED'].includes(r.status) && <Button size="sm" icon={<DoorOpen className="size-3.5" />} onClick={() => setDialog('assign')}>{live.length ? 'Change room' : 'Give a room'}</Button>}
            {r.status === 'IN_HOUSE' && onExtend && <Button size="sm" icon={<CalendarPlus className="size-3.5" />} onClick={onExtend}>Extend stay</Button>}
            {r.status === 'IN_HOUSE' && <Button size="sm" icon={<ArrowRightLeft className="size-3.5" />} onClick={() => setDialog('move')}>Move room</Button>}
            {['CONFIRMED', 'IN_HOUSE'].includes(r.status) && <Button size="sm" icon={<Receipt className="size-3.5" />} onClick={() => setDialog('charge')}>Add charge</Button>}
            {r.status === 'CONFIRMED' && r.arrival <= today && <Button size="sm" variant="danger" icon={<UserX className="size-3.5" />} loading={noShow.isPending} onClick={async () => { if (await confirm({ title: `Mark ${r.code} as a no-show?`, body: 'Rooms go back on sale; payments are kept.', confirm: 'Mark no-show', danger: true })) noShow.mutate(); }}>No-show</Button>}
          </div>
          {r.status === 'CONFIRMED' && r.arrival > today && <p className="text-[12px] text-fg-subtle">Check-in opens on the arrival day.</p>}
        </div>
      )}
      {r.contact.id && can('guests:read') && <Link href={`/guests/${r.contact.id}`} className="text-[12.5px] font-medium text-fg-muted hover:text-fg">Guest profile →</Link>}

      <CheckInDialog stay={stay} open={dialog === 'in'} onClose={() => setDialog(null)} onDone={() => { setDialog(null); onChange(); }} />
      <CheckOutDialog stay={stay} open={dialog === 'out'} onClose={() => setDialog(null)} onDone={() => { setDialog(null); onChange(); }} />
      <AssignDialog r={r} open={dialog === 'assign'} onClose={() => setDialog(null)} onDone={() => { setDialog(null); onChange(); }} />
      <MoveDialog r={r} open={dialog === 'move'} onClose={() => setDialog(null)} onDone={() => { setDialog(null); onChange(); }} />
      <ChargeDialog r={r} open={dialog === 'charge'} onClose={() => setDialog(null)} onDone={() => { setDialog(null); onChange(); }} />
    </div>
  );
}

function AssignDialog({ r, open, onClose, onDone }: { r: StayDetail; open: boolean; onClose: () => void; onDone: () => void }) {
  const opts = useQuery({ queryKey: ['desk-options', r.id, 'assign'], queryFn: () => get<RoomOption[]>(`/desk/reservations/${r.id}/rooms`), enabled: open });
  const p = usePicker(opts.data, r.assignments.filter((a) => a.active));
  const m = useMutation({ mutationFn: () => post(`/desk/reservations/${r.id}/assign`, { assignments: p.assignments }), onSuccess: () => { toast.success('Room given'); onDone(); }, onError: err });
  return (
    <Dialog open={open} onClose={onClose} title="Give a room" description="Hold a numbered room for this booking. You can change it until the guest checks in."
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" loading={m.isPending} disabled={!p.complete} onClick={() => m.mutate()}>Save</Button></>}>
      <div className="grid gap-4">{opts.isLoading ? <Skeleton className="h-28" /> : opts.data && <RoomPicker options={opts.data} picked={p.picked} setPicked={p.setPicked} allowUnclean />}</div>
    </Dialog>
  );
}

function MoveDialog({ r, open, onClose, onDone }: { r: StayDetail; open: boolean; onClose: () => void; onDone: () => void }) {
  const live = r.assignments.filter((a) => a.active);
  const opts = useQuery({ queryKey: ['desk-options', r.id, 'move'], queryFn: () => get<RoomOption[]>(`/desk/reservations/${r.id}/rooms`), enabled: open });
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [reason, setReason] = useState('');
  const [allowDirty, setAllowDirty] = useState(false);
  useEffect(() => {
    if (open) { setFrom(live[0]?.roomId ?? ''); setTo(''); setReason(''); setAllowDirty(false); }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const current = live.find((a) => a.roomId === from);
  const options = opts.data?.find((o) => o.reservationRoomId === current?.reservationRoomId)?.rooms.filter((x) => x.id !== from && !live.some((a) => a.roomId === x.id)) ?? [];
  const target = options.find((x) => x.id === to);
  const m = useMutation({ mutationFn: () => post(`/desk/reservations/${r.id}/move`, { fromRoomId: from, toRoomId: to, reason, allowDirty }), onSuccess: () => { toast.success('Moved. The old room is on the cleaning list.'); onDone(); }, onError: err });
  return (
    <Dialog open={open} onClose={onClose} title="Move room" description="Same room type. The old room is marked for cleaning."
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" loading={m.isPending} disabled={!to || reason.trim().length < 3 || (target?.hkStatus === 'VACANT_DIRTY' && !allowDirty)} onClick={() => m.mutate()}>Move guest</Button></>}>
      <div className="grid gap-4">
        {live.length > 1 && (
          <div className="flex flex-wrap gap-2">{live.map((a) => <button key={a.id} type="button" onClick={() => setFrom(a.roomId)} className={cn('h-10 rounded-full border px-4 text-[13px] font-semibold', from === a.roomId ? 'border-fg bg-fg text-bg' : 'border-line-strong')}>From {a.number}</button>)}</div>
        )}
        {opts.isLoading ? <Skeleton className="h-24" /> : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(6.5rem,1fr))] gap-2">
            {options.map((x) => {
              const out = !x.free || ['OCCUPIED', 'BLOCKED', 'OUT_OF_ORDER'].includes(x.hkStatus);
              return <button key={x.id} type="button" disabled={out} onClick={() => setTo(x.id)} className={cn('min-h-14 rounded-2xl border px-3 text-left text-[1.1rem] font-semibold tabular transition disabled:opacity-40', to === x.id ? 'border-fg bg-fg text-bg' : 'border-line-strong')}>{x.number}<span className="block text-[11px] font-normal">{out ? (x.why ?? 'Not free') : x.hkStatus === 'VACANT_DIRTY' ? 'Needs cleaning' : 'Ready'}</span></button>;
            })}
            {!options.length && <p className="text-[13px] text-fg-muted">No other room of this type.</p>}
          </div>
        )}
        {target?.hkStatus === 'VACANT_DIRTY' && <Switch label="Move before it is cleaned" checked={allowDirty} onChange={setAllowDirty} />}
        <TextInput label="Why" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Noise, a fault in the room, guest asked…" />
      </div>
    </Dialog>
  );
}

function ChargeDialog({ r, open, onClose, onDone }: { r: StayDetail; open: boolean; onClose: () => void; onDone: () => void }) {
  const can = useCan();
  const [kind, setKind] = useState<'FNB' | 'EXTRA' | 'ADJUSTMENT'>('FNB');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [credit, setCredit] = useState(false);
  useEffect(() => {
    if (open) { setKind('FNB'); setDescription(''); setAmount(''); setCredit(false); }
  }, [open]);
  const m = useMutation({
    mutationFn: () => {
      const minor = toMinorStr(amount, r.currency);
      if (!minor || minor === '0') throw new Error('Enter an amount');
      return post(`/desk/reservations/${r.id}/charges`, { kind, description, amount: minor, credit });
    },
    onSuccess: () => { toast.success(credit ? 'Credit added' : 'Added to the bill'); onDone(); },
    onError: err,
  });
  const QUICK = ['Dinner', 'Lunch', 'Drinks', 'Laundry', 'Transfer', 'Guided walk'];
  return (
    <Dialog open={open} onClose={onClose} size="sm" title={credit ? 'Take money off the bill' : 'Add to the bill'}
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant={credit ? 'danger' : 'primary'} loading={m.isPending} disabled={description.trim().length < 2 || !amount} onClick={() => m.mutate()}>{credit ? 'Add credit' : 'Add charge'}</Button></>}>
      <div className="grid gap-4">
        {!credit && (
          <div className="flex gap-2">
            {([['FNB', 'Food & drink'], ['EXTRA', 'Extra'], ['ADJUSTMENT', 'Other']] as const).map(([v, l]) => <button key={v} type="button" onClick={() => setKind(v)} className={cn('h-10 flex-1 rounded-full border text-[13px] font-medium', kind === v ? 'border-fg bg-fg text-bg' : 'border-line-strong')}>{l}</button>)}
          </div>
        )}
        <TextInput label="What" value={description} onChange={(e) => setDescription(e.target.value)} placeholder={credit ? 'Goodwill for the hot water' : 'Dinner — tilapia × 2'} />
        {!credit && <div className="-mt-2 flex flex-wrap gap-1.5">{QUICK.map((qk) => <button key={qk} type="button" onClick={() => setDescription(qk)} className="rounded-full bg-surface-2 px-2.5 py-1 text-[12px] text-fg-muted hover:text-fg">{qk}</button>)}</div>}
        <TextInput label={`Amount (${r.currency})`} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
        {can('payments:refund') && <Switch label="This is a credit" hint="Takes money off the bill instead." checked={credit} onChange={setCredit} />}
      </div>
    </Dialog>
  );
}
