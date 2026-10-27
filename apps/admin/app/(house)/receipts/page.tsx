'use client';
import { useDeferredValue, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Download, Receipt, Search } from 'lucide-react';
import { DOCUMENT_LABEL, type DocumentKind, type DocumentRegisterDTO } from '@reberon/contracts';
import { get } from '@/lib/api';
import { money } from '@/lib/money';
import { cn } from '@/lib/cn';
import { buttonClass } from '@/components/ui/button';
import { Empty, PageHeader, Skeleton } from '@/components/ui/bits';
import { DocumentRow } from '@/components/documents/documents-panel';

const kampala = (d = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Kampala' }).format(d);
const monthStart = () => `${kampala().slice(0, 8)}01`;

export default function ReceiptsPage() {
  const [kind, setKind] = useState<'' | DocumentKind>('');
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(kampala());
  const [q, setQ] = useState('');
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
        description="Sequential financial document register with QR verification codes"
        actions={<a className={buttonClass('secondary', 'sm')} href={`/v1/admin/documents.csv?${qs}`}><Download className="size-3.5" /> Export CSV</a>}
      />

      <div className="mb-4 grid grid-cols-1 gap-2.5 sm:grid-cols-3">
        {(['RECEIPT', 'REFUND', 'INVOICE'] as const).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setKind(kind === k ? '' : k)}
            className={cn('card flex flex-col items-start justify-between p-3 text-left transition', kind === k ? '!border-fg ring-1 ring-fg' : 'hover:border-line-strong')}
          >
            <span className="text-[11px] font-semibold uppercase tracking-wider text-fg-subtle">{DOCUMENT_LABEL[k]}s ({t?.[k].count ?? 0})</span>
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
                  className={cn('rounded-md px-2.5 py-1 font-medium transition', kind === v ? 'bg-fg text-bg' : 'text-fg-muted hover:text-fg')}
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
          <div className="flex items-center gap-1.5 text-xs">
            <input type="date" aria-label="From" value={from} onChange={(e) => setFrom(e.target.value)} className="input !h-7 !min-h-0 px-2 text-xs" />
            <span className="text-fg-subtle">→</span>
            <input type="date" aria-label="To" value={to} onChange={(e) => setTo(e.target.value)} className="input !h-7 !min-h-0 px-2 text-xs" />
          </div>
        </div>

        <div className="px-3.5">
          {isLoading && <Skeleton className="my-3 h-36" />}
          {data && !data.data.length && <Empty icon={<Receipt className="size-4" />} title="No documents in period" />}
          <ul className="divide-y divide-line">{data?.data.map((d) => <DocumentRow key={d.id} d={d} showBooking />)}</ul>
        </div>
      </div>
    </div>
  );
}
