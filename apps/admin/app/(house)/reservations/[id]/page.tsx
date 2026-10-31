'use client';
import { use, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Ban, BedDouble, CalendarDays, Copy, HandCoins, Mail, MessageSquareText, Phone, RotateCcw, Send, Trash2, Undo2, Users } from 'lucide-react';
import { whatsappLink } from '@reberon/utils';
import { ApiError, del, get, patch, post } from '@/lib/api';
import { useCan, useMe } from '@/lib/providers';
import { dateRange, dateShort, dateTime } from '@/lib/format';
import { money, toMinorStr } from '@/lib/money';
import { Button } from '@/components/ui/button';
import { PageHeader, Pill, Section, Skeleton, Status } from '@/components/ui/bits';
import { Dialog } from '@/components/ui/dialog';
import { SelectInput, Switch, TextArea, TextInput } from '@/components/ui/field';
import { StayPanel, type StayDetail } from '@/components/house/stay-panel';
import { ReservationMessages } from '@/components/messages/reservation-messages';
import { DocumentsPanel } from '@/components/documents/documents-panel';

type Detail = {
  id: string; code: string; status: string; source: string; currency: string; arrival: string; departure: string; nights: number; adults: number; children: number;
  totalMinor: string; paidMinor: string; balanceMinor: string; depositMinor: string; holdExpiresAt: string | null; eta: string | null; guestNotes: string | null; staffNotes: string | null;
  cancelReason: string | null; confirmedAt: string | null; cancelledAt: string | null; createdAt: string; guestLink: string;
  contact: { id: string; name: string; phone: string | null; email: string | null; country: string | null };
  ratePlan: { code: string; name: { en?: string }; mealPlan: string; depositPercent: number };
  cancellation: { rules?: { daysBefore: number; refundPercent: number }[]; text?: { en?: string } };
  rooms: { name: string; quantity: number; nightly: { date: string; amountMinor: string }[] }[];
  extras: { name: string; quantity: number; totalMinor: string }[];
  folio: { id: string; kind: string; description: string; date: string; amountMinor: string }[];
  payments: { id: string; reference: string; purpose: string; amountMinor: string; status: string; provider: string; method: string; redirectUrl: string | null; confirmationCode: string | null; paidAt: string | null; createdAt: string }[];
  history: { id: string; summary: string; actor: string; createdAt: string }[];
} & Omit<StayDetail, 'guest' | 'contact' | 'keep'>;

const METHODS = [['MOBILE_MONEY', 'Mobile money (MTN / Airtel)'], ['CASH', 'Cash'], ['CARD', 'Card at the desk'], ['BANK', 'Bank transfer']] as const;
const MEAL: Record<string, string> = { RO: 'Room only', BB: 'Breakfast included', HB: 'Half board', FB: 'Full board' };

export default function ReservationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const qc = useQueryClient();
  const can = useCan();
  const me = useMe();
  const isOwner = me.role === 'OWNER';
  const autoCheckIn = useSearchParams().get('checkin') === '1';
  const { data: r, isLoading } = useQuery({ queryKey: ['reservation', id], queryFn: () => get<Detail>(`/reservations/${id}`) });
  const [dialog, setDialog] = useState<null | 'pay' | 'refund' | 'cancel' | 'delete'>(null);
  const [notes, setNotes] = useState('');
  const [eta, setEta] = useState('');
  useEffect(() => {
    if (r) {
      setNotes(r.staffNotes ?? '');
      setEta(r.eta ?? '');
    }
  }, [r?.staffNotes, r?.eta]); // eslint-disable-line react-hooks/exhaustive-deps
  const refresh = (d?: Detail) => {
    if (d) qc.setQueryData(['reservation', id], d);
    else qc.invalidateQueries({ queryKey: ['reservation', id] });
    qc.invalidateQueries({ queryKey: ['reservations'] });
  };
  const saveNotes = useMutation({ mutationFn: () => patch<Detail>(`/reservations/${id}`, { staffNotes: notes || null, eta: eta || null }), onSuccess: (d) => { refresh(d); toast.success('Saved'); } });
  const resend = useMutation({ mutationFn: () => post(`/reservations/${id}/resend-confirmation`), onSuccess: () => toast.success('Confirmation sent again') });

  if (isLoading || !r) return <Skeleton className="h-96" />;
  const balance = BigInt(r.balanceMinor);
  const open = ['HELD', 'CONFIRMED'].includes(r.status);
  const pending = r.payments.find((p) => p.status === 'PENDING' && p.redirectUrl);
  let running = 0n;

  return (
    <div className="fade-in">
      <PageHeader
        crumbs={[{ label: 'Reservations', href: '/reservations' }, { label: r.code }]}
        title={<span className="flex flex-wrap items-center gap-3">{r.contact.name} <Status value={r.status} /></span>}
        description={<span className="font-mono">{r.code}</span>}
        actions={
          <>
            {can('payments:record') && open && balance > 0n && <Button variant="primary" icon={<HandCoins className="size-4" />} onClick={() => setDialog('pay')}>Record payment</Button>}
            {can('payments:refund') && BigInt(r.paidMinor) > 0n && ['CANCELLED', 'EXPIRED', 'CONFIRMED'].includes(r.status) && balance < 0n && <Button icon={<Undo2 className="size-4" />} onClick={() => setDialog('refund')}>Record refund</Button>}
            {can('payments:refund') && r.status === 'CANCELLED' && BigInt(r.paidMinor) > 0n && balance >= 0n && <Button icon={<Undo2 className="size-4" />} onClick={() => setDialog('refund')}>Record refund</Button>}
            {r.status === 'CONFIRMED' && r.contact.email && <Button icon={<Send className="size-4" />} loading={resend.isPending} onClick={() => resend.mutate()}>Resend confirmation</Button>}
            {can('bookings:write') && open && <Button variant="danger" icon={<Ban className="size-4" />} onClick={() => setDialog('cancel')}>Cancel</Button>}
            {isOwner && <Button variant="danger" icon={<Trash2 className="size-4" />} onClick={() => setDialog('delete')}>Delete</Button>}
          </>
        }
      />
      {r.staffNotes?.includes('⚠') && <p className="mb-5 rounded-xl border border-danger/30 bg-danger/5 px-4 py-3 text-[13px] font-medium text-danger">{r.staffNotes.split('\n').filter((l) => l.includes('⚠')).join(' ')}</p>}
      {r.status === 'HELD' && r.holdExpiresAt && (
        <p className="mb-5 rounded-xl border border-warning/30 bg-warning/10 px-4 py-3 text-[13px]">
          Rooms held until <b>{dateTime(r.holdExpiresAt)}</b>. If no payment arrives they are released automatically.
          {pending && <> Payment link: <button type="button" className="font-semibold underline" onClick={() => { navigator.clipboard.writeText(pending.redirectUrl!); toast.success('Payment link copied'); }}>copy</button>{r.contact.phone && <> · <a className="font-semibold underline" target="_blank" rel="noreferrer" href={whatsappLink(r.contact.phone, `Hello ${r.contact.name.split(' ')[0]}, here is the link to pay the deposit for your Reberon Hotel booking ${r.code}: ${pending.redirectUrl}`)}>send on WhatsApp</a></>}</>}
        </p>
      )}

      <div className="grid items-start gap-5 xl:grid-cols-[1fr_22rem]">
        <div className="grid gap-5">
          <Section title="The stay">
            <dl className="grid gap-4 text-[13px] sm:grid-cols-2">
              <div className="flex gap-3"><CalendarDays className="mt-0.5 size-4 text-fg-subtle" /><div><dt className="text-fg-muted">Dates</dt><dd className="font-medium">{dateRange(r.arrival, r.departure)}</dd></div></div>
              <div className="flex gap-3"><Users className="mt-0.5 size-4 text-fg-subtle" /><div><dt className="text-fg-muted">Guests</dt><dd className="font-medium">{r.adults} adult{r.adults > 1 ? 's' : ''}{r.children ? `, ${r.children} child${r.children > 1 ? 'ren' : ''}` : ''}</dd></div></div>
              <div className="flex gap-3"><BedDouble className="mt-0.5 size-4 text-fg-subtle" /><div><dt className="text-fg-muted">Room</dt><dd className="font-medium">{r.rooms.map((x) => `${x.quantity} × ${x.name}`).join(', ')}</dd></div></div>
              <div className="flex gap-3"><HandCoins className="mt-0.5 size-4 text-fg-subtle" /><div><dt className="text-fg-muted">Rate</dt><dd className="font-medium">{r.ratePlan.name.en} · {MEAL[r.ratePlan.mealPlan]}</dd></div></div>
            </dl>
            {r.extras.length > 0 && <p className="mt-4 text-[13px]"><span className="text-fg-muted">Extras:</span> {r.extras.map((e) => `${e.name} × ${e.quantity}`).join(', ')}</p>}
            {r.guestNotes && <blockquote className="mt-4 rounded-xl border-l-2 border-accent bg-surface-2/60 px-4 py-3 text-[13px] italic">“{r.guestNotes}”</blockquote>}
            {r.cancelReason && <p className="mt-4 text-[13px] text-fg-muted">Cancelled {r.cancelledAt && dateShort(r.cancelledAt)}: {r.cancelReason}</p>}
          </Section>

          <Section title="Folio" description="Every charge and payment, in order. Lines are never edited — corrections are new lines.">
            <table className="w-full text-[13px]">
              <thead className="text-left text-[11.5px] uppercase tracking-wider text-fg-subtle"><tr><th className="pb-2">Date</th><th className="pb-2">Item</th><th className="pb-2 text-right">Amount</th><th className="pb-2 text-right">Balance</th></tr></thead>
              <tbody className="divide-y divide-line">
                {r.folio.map((l) => {
                  running += BigInt(l.amountMinor);
                  const neg = BigInt(l.amountMinor) < 0n;
                  return (
                    <tr key={l.id}>
                      <td className="py-2 pr-3 tabular text-fg-muted">{dateShort(l.date)}</td>
                      <td className="py-2 pr-3">{l.description} {['PAYMENT', 'REFUND', 'ADJUSTMENT'].includes(l.kind) && <Pill className="ml-1">{l.kind.toLowerCase()}</Pill>}</td>
                      <td className={`py-2 pr-3 text-right tabular ${neg ? 'text-success' : ''}`}>{neg ? '−' : ''}{money(neg ? -BigInt(l.amountMinor) : BigInt(l.amountMinor), r.currency)}</td>
                      <td className="py-2 text-right tabular text-fg-muted">{money(running < 0n ? -running : running, r.currency)}{running < 0n ? ' cr' : ''}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot><tr className="border-t-2 border-line-strong font-semibold"><td colSpan={2} className="pt-3">{balance > 0n ? 'Balance due' : balance < 0n ? 'In credit (refund due)' : 'Settled'}</td><td /><td className="pt-3 text-right tabular">{money(balance < 0n ? -balance : balance, r.currency)}</td></tr></tfoot>
            </table>
          </Section>

          <Section title="Payments">
            {!r.payments.length ? <p className="text-[13px] text-fg-muted">No payments yet.</p> : (
              <ul className="-my-2 divide-y divide-line text-[13px]">
                {r.payments.map((p) => (
                  <li key={p.id} className="flex flex-wrap items-center gap-3 py-2.5">
                    <span className="font-mono text-[12px] text-fg-subtle">{p.reference}</span>
                    <span className="font-medium tabular">{money(p.amountMinor, r.currency)}</span>
                    <span className="text-fg-muted">{p.purpose.toLowerCase()} · {p.provider === 'MANUAL' ? 'recorded by staff' : p.provider === 'TEST' ? 'test payment' : 'Pesapal'} · {p.method.toLowerCase().replace('_', ' ')}</span>
                    {p.confirmationCode && <span className="font-mono text-[11.5px] text-fg-subtle">{p.confirmationCode}</span>}
                    <span className="ml-auto flex items-center gap-2"><span className="text-[12px] text-fg-subtle">{dateTime(p.paidAt ?? p.createdAt)}</span><Status value={p.status} /></span>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <DocumentsPanel reservationId={r.id} status={r.status} onChanged={() => refresh()} />

          <ReservationMessages reservationId={r.id} hasEmail={!!r.contact.email} hasPhone={!!r.contact.phone} />

          <Section title="History">
            <ol className="relative grid gap-3 border-l border-line pl-5 text-[13px]">
              {r.history.map((h) => (
                <li key={h.id} className="relative"><span className="absolute -left-[23.5px] top-1.5 size-2 rounded-full border-2 border-surface bg-line-strong" /><span className="font-medium">{h.actor}</span> <span className="text-fg-muted">{h.summary}</span><span className="ml-2 text-[11.5px] text-fg-subtle">{dateTime(h.createdAt)}</span></li>
              ))}
            </ol>
          </Section>
        </div>

        <aside className="grid gap-5 xl:sticky xl:top-20">
          <StayPanel r={{ ...r, guest: { name: r.contact.name } }} onChange={() => refresh()} autoCheckIn={autoCheckIn} />
          <div className="card p-5">
            <p className="text-[12px] text-fg-muted">Total</p>
            <p className="text-[1.8rem] font-semibold tabular">{money(r.totalMinor, r.currency)}</p>
            <div className="mt-3 grid grid-cols-2 gap-3 text-[13px]">
              <div><p className="text-fg-muted">Paid</p><p className="font-semibold tabular text-success">{money(r.paidMinor, r.currency)}</p></div>
              <div><p className="text-fg-muted">{balance < 0n ? 'Refund due' : 'Balance'}</p><p className="font-semibold tabular">{money(balance < 0n ? -balance : balance, r.currency)}</p></div>
            </div>
            <p className="mt-3 text-[12px] text-fg-subtle">Deposit on this rate: {r.ratePlan.depositPercent}% ({money(r.depositMinor, r.currency)})</p>
          </div>
          <div className="card grid gap-3 p-5 text-[13px]">
            <p className="font-semibold">{r.contact.name}</p>
            {r.contact.phone && <a className="flex items-center gap-2 hover:underline" href={`tel:${r.contact.phone}`}><Phone className="size-4 text-fg-subtle" /> {r.contact.phone}</a>}
            {r.contact.email && <a className="flex items-center gap-2 truncate hover:underline" href={`mailto:${r.contact.email}`}><Mail className="size-4 text-fg-subtle" /> {r.contact.email}</a>}
            {r.contact.phone && <a className="flex items-center gap-2 hover:underline" target="_blank" rel="noreferrer" href={whatsappLink(r.contact.phone, `Hello ${r.contact.name.split(' ')[0]}, this is Reberon Hotel about your booking ${r.code}.`)}><MessageSquareText className="size-4 text-fg-subtle" /> WhatsApp</a>}
            <button type="button" className="flex items-center gap-2 text-left hover:underline" onClick={() => { navigator.clipboard.writeText(r.guestLink); toast.success('Guest link copied'); }}><Copy className="size-4 text-fg-subtle" /> Copy the guest’s stay link</button>
          </div>
          <div className="card grid gap-3 p-5">
            <TextInput label="Expected arrival" placeholder="e.g. around 16:00" value={eta} onChange={(e) => setEta(e.target.value)} disabled={!can('bookings:write')} />
            <TextArea label="Staff notes" rows={4} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Allergies, driver, anything the desk should know" disabled={!can('bookings:write')} />
            {can('bookings:write') && <Button variant="dark" loading={saveNotes.isPending} disabled={notes === (r.staffNotes ?? '') && eta === (r.eta ?? '')} onClick={() => saveNotes.mutate()}>Save</Button>}
          </div>
          {r.cancellation.text?.en && <p className="px-1 text-[12px] leading-relaxed text-fg-muted"><b>Cancellation terms at booking:</b> {r.cancellation.text.en}</p>}
        </aside>
      </div>

      <PaymentDialog kind={dialog === 'refund' ? 'refund' : 'pay'} open={dialog === 'pay' || dialog === 'refund'} onClose={() => setDialog(null)} r={r} onDone={(d) => { refresh(d); setDialog(null); }} />
      <CancelDialog open={dialog === 'cancel'} onClose={() => setDialog(null)} r={r} onDone={() => { refresh(); setDialog(null); }} />
      {isOwner && <DeleteReservationDialog open={dialog === 'delete'} onClose={() => setDialog(null)} r={r} onDeleted={() => { qc.invalidateQueries({ queryKey: ['reservations'] }); router.push('/reservations'); }} />}
    </div>
  );
}

function PaymentDialog({ kind, open, onClose, r, onDone }: { kind: 'pay' | 'refund'; open: boolean; onClose: () => void; r: Detail; onDone: (d: Detail) => void }) {
  const balance = BigInt(r.balanceMinor);
  const suggested = kind === 'pay' ? balance : balance < 0n ? -balance : BigInt(r.paidMinor);
  const major = (m: bigint) => (r.currency === 'USD' ? (Number(m) / 100).toFixed(2) : String(m));
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('MOBILE_MONEY');
  const [reference, setReference] = useState('');
  useEffect(() => {
    if (open) { setAmount(major(suggested)); setReference(''); }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const m = useMutation({
    mutationFn: () => {
      const minor = toMinorStr(amount, r.currency);
      if (!minor) throw new Error('Enter an amount');
      return post<Detail>(`/reservations/${r.id}/${kind === 'pay' ? 'payments' : 'refunds'}`, { amount: minor, method, reference: reference || undefined });
    },
    onSuccess: (d) => { toast.success(kind === 'pay' ? 'Payment recorded' : 'Refund recorded'); onDone(d); },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : (e as Error).message),
  });
  return (
    <Dialog open={open} onClose={onClose} size="sm" title={kind === 'pay' ? 'Record a payment' : 'Record a refund'} description={kind === 'pay' ? 'Money received at the desk, by mobile money or transfer.' : 'Money sent back to the guest.'}
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" loading={m.isPending} onClick={() => m.mutate()}>{kind === 'pay' ? `Record ${r.currency} ${amount}` : 'Record refund'}</Button></>}>
      <div className="grid gap-4">
        <TextInput label={`Amount (${r.currency})`} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} hint={kind === 'pay' ? `Balance ${money(balance, r.currency)}` : `Paid so far ${money(r.paidMinor, r.currency)}`} />
        <SelectInput label="How" value={method} onChange={(e) => setMethod(e.target.value)}>{METHODS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</SelectInput>
        <TextInput label="Reference (optional)" placeholder="MoMo transaction ID, receipt number…" value={reference} onChange={(e) => setReference(e.target.value)} />
      </div>
    </Dialog>
  );
}

function CancelDialog({ open, onClose, r, onDone }: { open: boolean; onClose: () => void; r: Detail; onDone: () => void }) {
  const [reason, setReason] = useState('');
  const [waive, setWaive] = useState(false);
  const days = Math.round((Date.parse(`${r.arrival}T00:00:00Z`) - Date.parse(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`)) / 86_400_000);
  const rule = [...(r.cancellation.rules ?? [])].sort((a, b) => b.daysBefore - a.daysBefore).find((x) => days >= x.daysBefore);
  const pct = waive ? 100 : (rule?.refundPercent ?? 0);
  const refund = (BigInt(r.paidMinor) * BigInt(pct)) / 100n;
  const m = useMutation({
    mutationFn: () => post<{ refundDueMinor: string }>(`/reservations/${r.id}/cancel`, { reason, waivePenalty: waive }),
    onSuccess: (x) => { toast.success(BigInt(x.refundDueMinor) > 0n ? `Cancelled. Refund due: ${money(x.refundDueMinor, r.currency)} — record it when sent.` : 'Cancelled. No refund due.', { duration: 8000 }); onDone(); },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Could not cancel'),
  });
  return (
    <Dialog open={open} onClose={onClose} title={`Cancel ${r.code}?`} description="The rooms go back on sale immediately. The guest is emailed."
      footer={<><Button variant="ghost" onClick={onClose}>Keep the booking</Button><Button variant="danger" icon={<RotateCcw className="size-4" />} loading={m.isPending} disabled={reason.trim().length < 3} onClick={() => m.mutate()}>Cancel the booking</Button></>}>
      <div className="grid gap-4 text-[13px]">
        <div className="rounded-xl bg-surface-2 p-4">
          <p>{days} day{days === 1 ? '' : 's'} before arrival. Under the terms booked, <b>{pct}%</b> of what was paid comes back.</p>
          <p className="mt-2 text-[15px] font-semibold">Refund due: {money(refund, r.currency)} <span className="font-normal text-fg-muted">of {money(r.paidMinor, r.currency)} paid</span></p>
        </div>
        <TextInput label="Reason" required value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Plans changed, road closed…" />
        <Switch label="Waive the cancellation fee" hint="Refund everything that was paid (e.g. weather, illness)." checked={waive} onChange={setWaive} />
      </div>
    </Dialog>
  );
}

function DeleteReservationDialog({ open, onClose, r, onDeleted }: { open: boolean; onClose: () => void; r: Detail; onDeleted: () => void }) {
  const [reason, setReason] = useState('');
  const m = useMutation({
    mutationFn: () => del<{ ok: boolean; code: string }>(`/reservations/${r.id}`, { reason: reason.trim() || 'Super Admin permanent deletion' }),
    onSuccess: () => {
      toast.success(`Reservation ${r.code} permanently deleted`);
      onDeleted();
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Could not delete reservation'),
  });
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={`Permanently delete ${r.code}?`}
      description="Super Admin exclusive action — releases any held or sold rooms and removes this reservation record. Recorded in the Owner Audit Log."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="danger" icon={<Trash2 className="size-4" />} loading={m.isPending} onClick={() => m.mutate()}>
            Permanently Delete
          </Button>
        </>
      }
    >
      <div className="grid gap-4 text-[13px]">
        <div className="rounded-xl bg-surface-2 p-4">
          <p>Guest: <b>{r.contact.name}</b> ({dateRange(r.arrival, r.departure)})</p>
          <p className="mt-1 text-fg-muted">Total: {money(r.totalMinor, r.currency)} · Paid: {money(r.paidMinor, r.currency)}</p>
        </div>
        <TextInput label="Reason for deletion (recorded in Owner Audit Log)" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Test booking or duplicate entry" />
      </div>
    </Dialog>
  );
}
