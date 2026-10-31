'use client';
import { useDeferredValue, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Download, Plus, Receipt, Search } from 'lucide-react';
import { DOCUMENT_LABEL, type DocumentKind, type DocumentRegisterDTO, type IssuedDocumentDTO } from '@reberon/contracts';
import { ApiError, get, post } from '@/lib/api';
import { useCan } from '@/lib/providers';
import { money, toMinorStr } from '@/lib/money';
import { cn } from '@/lib/cn';
import { Button, buttonClass } from '@/components/ui/button';
import { Empty, PageHeader, Skeleton } from '@/components/ui/bits';
import { Dialog } from '@/components/ui/dialog';
import { SelectInput, TextInput } from '@/components/ui/field';
import { DocumentRow, printDocument } from '@/components/documents/documents-panel';

const kampala = (d = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Kampala' }).format(d);
const monthStart = () => `${kampala().slice(0, 8)}01`;
const weekStart = () => {
  const d = new Date();
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  return kampala(new Date(d.setDate(diff)));
};

export default function ReceiptsPage() {
  const can = useCan();
  const qc = useQueryClient();
  const [kind, setKind] = useState<'' | DocumentKind>('');
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(kampala());
  const [q, setQ] = useState('');
  const [issueOpen, setIssueOpen] = useState(false);
  const term = useDeferredValue(q);
  const qs = new URLSearchParams({ ...(kind ? { kind } : {}), ...(from ? { from } : {}), ...(to ? { to } : {}), ...(term ? { q: term } : {}) });
  const { data, isLoading } = useQuery({
    queryKey: ['documents', 'register', qs.toString()],
    queryFn: () => get<DocumentRegisterDTO>(`/documents?${qs}`),
    placeholderData: (p) => p,
  });
  const t = data?.totals;
  const both = (x?: { UGX: string; USD: string }) => (x ? `${money(x.UGX, 'UGX')}${x.USD !== '0' ? ` + ${money(x.USD, 'USD')}` : ''}` : '—');

  return (
    <div className="fade-in">
      <PageHeader
        title="Receipts & Invoices"
        description="Sequential financial document register with scannable QR verification codes"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <a className={buttonClass('secondary', 'sm')} href={`/v1/admin/documents.csv?${qs}`}>
              <Download className="size-3.5" /> Export CSV
            </a>
            {can('receipts:issue') && (
              <Button size="sm" variant="primary" icon={<Plus className="size-3.5" />} onClick={() => setIssueOpen(true)}>
                Issue Receipt / Invoice
              </Button>
            )}
          </div>
        }
      />

      <div className="mb-4 grid grid-cols-1 gap-2.5 sm:grid-cols-3">
        {(['RECEIPT', 'REFUND', 'INVOICE'] as const).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setKind(kind === k ? '' : k)}
            className={cn(
              'card flex flex-col items-start justify-between p-3 text-left transition',
              kind === k ? '!border-fg ring-1 ring-fg' : 'hover:border-line-strong',
            )}
          >
            <span className="text-[11px] font-semibold uppercase tracking-wider text-fg-subtle">
              {DOCUMENT_LABEL[k]}s ({t?.[k].count ?? 0})
            </span>
            <span className="mt-1 text-lg font-bold tabular">{both(t?.[k])}</span>
          </button>
        ))}
      </div>

      <div className="card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-surface-2/40 px-3 py-2">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex rounded-lg border border-line bg-surface p-0.5 text-[11px]">
              {([
                ['', 'All'],
                ['RECEIPT', 'Receipts'],
                ['INVOICE', 'Invoices'],
                ['REFUND', 'Refunds'],
              ] as const).map(([v, l]) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setKind(v as '' | DocumentKind)}
                  className={cn(
                    'rounded-md px-2.5 py-1 font-medium transition',
                    kind === v ? 'bg-fg text-bg' : 'text-fg-muted hover:text-fg',
                  )}
                >
                  {l}
                </button>
              ))}
            </div>
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-fg-subtle" />
              <input
                className="input !h-7 !min-h-0 w-56 pl-8 text-xs"
                placeholder="Doc #, booking code, or guest..."
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <div className="flex rounded-md border border-line bg-surface p-0.5 text-[11px]">
              <button
                type="button"
                onClick={() => {
                  setFrom(kampala());
                  setTo(kampala());
                }}
                className={cn(
                  'rounded px-2 py-0.5 font-medium transition',
                  from === kampala() && to === kampala() ? 'bg-fg text-bg' : 'text-fg-muted hover:text-fg',
                )}
              >
                Today
              </button>
              <button
                type="button"
                onClick={() => {
                  setFrom(weekStart());
                  setTo(kampala());
                }}
                className={cn(
                  'rounded px-2 py-0.5 font-medium transition',
                  from === weekStart() && to === kampala() ? 'bg-fg text-bg' : 'text-fg-muted hover:text-fg',
                )}
              >
                This Week
              </button>
              <button
                type="button"
                onClick={() => {
                  setFrom(monthStart());
                  setTo(kampala());
                }}
                className={cn(
                  'rounded px-2 py-0.5 font-medium transition',
                  from === monthStart() && to === kampala() ? 'bg-fg text-bg' : 'text-fg-muted hover:text-fg',
                )}
              >
                This Month
              </button>
              <button
                type="button"
                onClick={() => {
                  setFrom('');
                  setTo('');
                }}
                className={cn(
                  'rounded px-2 py-0.5 font-medium transition',
                  !from && !to ? 'bg-fg text-bg' : 'text-fg-muted hover:text-fg',
                )}
              >
                All
              </button>
            </div>
            <div className="flex items-center gap-1">
              <input
                type="date"
                aria-label="From"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className="input !h-7 !min-h-0 px-2 text-xs"
              />
              <span className="text-fg-subtle">→</span>
              <input
                type="date"
                aria-label="To"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="input !h-7 !min-h-0 px-2 text-xs"
              />
            </div>
          </div>
        </div>

        <div className="px-3.5">
          {isLoading && <Skeleton className="my-3 h-36" />}
          {data && !data.data.length && <Empty icon={<Receipt className="size-4" />} title="No documents in period" />}
          <ul className="divide-y divide-line">
            {data?.data.map((d) => (
              <DocumentRow key={d.id} d={d} showBooking />
            ))}
          </ul>
        </div>
      </div>

      <IssueDirectDocumentDialog
        open={issueOpen}
        onClose={() => setIssueOpen(false)}
        onDone={() => {
          setIssueOpen(false);
          qc.invalidateQueries({ queryKey: ['documents'] });
        }}
      />
    </div>
  );
}

function IssueDirectDocumentDialog({
  open,
  onClose,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const [kind, setKind] = useState<'RECEIPT' | 'INVOICE'>('RECEIPT');
  const [currency, setCurrency] = useState<'UGX' | 'USD'>('UGX');
  const [issuedToName, setIssuedToName] = useState('');
  const [issuedToPhone, setIssuedToPhone] = useState('');
  const [issuedToEmail, setIssuedToEmail] = useState('');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('MOBILE_MONEY');
  const [paymentReference, setPaymentReference] = useState('');
  const [note, setNote] = useState('');

  const m = useMutation({
    mutationFn: () => {
      const minor = toMinorStr(amount, currency);
      if (!minor || minor === '0') throw new Error('Enter a valid amount');
      return post<IssuedDocumentDTO>('/documents/direct', {
        kind,
        currency,
        issuedToName: issuedToName.trim(),
        issuedToPhone: issuedToPhone.trim() || undefined,
        issuedToEmail: issuedToEmail.trim() || undefined,
        description: description.trim(),
        amountMinor: minor,
        paymentMethod: kind === 'RECEIPT' ? paymentMethod : undefined,
        paymentReference: kind === 'RECEIPT' ? paymentReference.trim() || undefined : undefined,
        note: note.trim() || undefined,
      });
    },
    onSuccess: (doc) => {
      toast.success(`${doc.number} issued with QR verification`, {
        action: { label: 'Print A4', onClick: () => printDocument(doc.id, 'A4') },
      });
      onDone();
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : (e as Error).message),
  });

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="md"
      title={kind === 'RECEIPT' ? 'Issue Official Receipt (RCT)' : 'Issue Official Invoice (INV)'}
      description="Issues a sequentially numbered document with a cryptographic check code and scannable QR verification code."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            loading={m.isPending}
            disabled={issuedToName.trim().length < 2 || description.trim().length < 2 || !amount}
            onClick={() => m.mutate()}
          >
            Issue {kind === 'RECEIPT' ? 'Receipt' : 'Invoice'}
          </Button>
        </>
      }
    >
      <div className="grid gap-3.5">
        <div className="flex rounded-xl border border-line bg-surface-2 p-1 text-xs font-semibold">
          <button
            type="button"
            onClick={() => setKind('RECEIPT')}
            className={cn('flex-1 rounded-lg py-2 transition', kind === 'RECEIPT' ? 'bg-fg text-bg' : 'text-fg-muted hover:text-fg')}
          >
            Official Receipt (Payment Received)
          </button>
          <button
            type="button"
            onClick={() => setKind('INVOICE')}
            className={cn('flex-1 rounded-lg py-2 transition', kind === 'INVOICE' ? 'bg-fg text-bg' : 'text-fg-muted hover:text-fg')}
          >
            Official Invoice (Billed)
          </button>
        </div>

        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
          <TextInput
            label="Issued To (Client / Guest / Company)"
            required
            placeholder="e.g. Kapchorwa District Council"
            value={issuedToName}
            onChange={(e) => setIssuedToName(e.target.value)}
          />
          <TextInput
            label="Phone"
            placeholder="+256 77..."
            value={issuedToPhone}
            onChange={(e) => setIssuedToPhone(e.target.value)}
          />
          <TextInput
            label="Email"
            type="email"
            placeholder="client@example.com"
            value={issuedToEmail}
            onChange={(e) => setIssuedToEmail(e.target.value)}
          />
        </div>

        <TextInput
          label="Item / Payment Description"
          required
          placeholder="e.g. Conference Hall Hire & Buffet Catering for 45 Pax"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />

        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
          <SelectInput label="Currency" value={currency} onChange={(e) => setCurrency(e.target.value as 'UGX' | 'USD')}>
            <option value="UGX">UGX</option>
            <option value="USD">USD</option>
          </SelectInput>
          <TextInput
            label={`Amount (${currency})`}
            required
            inputMode="decimal"
            placeholder="e.g. 850000"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
          {kind === 'RECEIPT' && (
            <SelectInput label="Payment Method" value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
              <option value="MOBILE_MONEY">Mobile Money</option>
              <option value="CASH">Cash</option>
              <option value="BANK">Bank Transfer / EFT</option>
              <option value="CARD">Card POS</option>
            </SelectInput>
          )}
        </div>

        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          {kind === 'RECEIPT' && (
            <TextInput
              label="Payment Reference (optional)"
              placeholder="MoMo ID, EFT slip..."
              value={paymentReference}
              onChange={(e) => setPaymentReference(e.target.value)}
            />
          )}
          <TextInput
            label="Additional Note (optional)"
            placeholder="Any remarks printed on the document..."
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>
      </div>
    </Dialog>
  );
}
