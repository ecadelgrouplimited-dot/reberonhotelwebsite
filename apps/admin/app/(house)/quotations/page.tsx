'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  ArrowRight, CheckCircle2, Eye, FileCheck2, FileSpreadsheet, Plus, Printer, Search, Send, Trash2, Users,
} from 'lucide-react';
import type { EventType, QuotationDTO, QuotationStatus } from '@reberon/contracts';
import { ApiError, get, patch, post } from '@/lib/api';
import { money, toMinorStr } from '@/lib/money';
import { cn } from '@/lib/cn';
import { Button } from '@/components/ui/button';
import { Empty, PageHeader, Pill, Skeleton, Tabs } from '@/components/ui/bits';
import { Dialog } from '@/components/ui/dialog';
import { SelectInput, Switch, TextArea, TextInput } from '@/components/ui/field';
import { printDocument } from '@/components/documents/documents-panel';

const STATUS_TONE: Record<QuotationStatus, 'amber' | 'blue' | 'green' | 'neutral' | 'red'> = {
  DRAFT: 'amber',
  SENT: 'blue',
  ACCEPTED: 'green',
  CONVERTED: 'green',
  EXPIRED: 'neutral',
  DECLINED: 'red',
};

export function printQuotation(id: string, paper: 'A4' | '80MM' = 'A4') {
  window.open(`/v1/admin/quotations/${id}/print?autoprint=1&paper=${paper}`, '_blank', 'noopener');
}

export default function QuotationsPage() {
  const qc = useQueryClient();
  const [filter, setFilter] = useState<'ALL' | QuotationStatus>('ALL');
  const [search, setSearch] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [converting, setConverting] = useState<QuotationDTO | null>(null);
  const [viewing, setViewing] = useState<QuotationDTO | null>(null);

  const { data: quotations, isLoading } = useQuery({
    queryKey: ['quotations'],
    queryFn: () => get<QuotationDTO[]>('/quotations'),
  });

  const updateStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: QuotationStatus }) =>
      patch<QuotationDTO>(`/quotations/${id}/status`, { status }),
    onSuccess: (q) => {
      qc.invalidateQueries({ queryKey: ['quotations'] });
      toast.success(`${q.number} → ${q.status}`);
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Update failed'),
  });

  const filtered = useMemo(() => {
    return (quotations ?? []).filter((q) => {
      if (filter !== 'ALL' && q.status !== filter) return false;
      if (search.trim()) {
        const s = search.toLowerCase();
        return (
          q.number.toLowerCase().includes(s) ||
          q.eventTitle.toLowerCase().includes(s) ||
          q.clientName.toLowerCase().includes(s) ||
          (q.clientOrganization ?? '').toLowerCase().includes(s)
        );
      }
      return true;
    });
  }, [quotations, filter, search]);

  const pipelineValueMinor = useMemo(
    () =>
      (quotations ?? [])
        .filter((q) => q.status !== 'DECLINED' && q.status !== 'EXPIRED')
        .reduce((acc, q) => acc + BigInt(q.totalMinor), 0n),
    [quotations],
  );

  return (
    <div className="fade-in">
      <PageHeader
        title="Quotations & Conference Events"
        actions={
          <Button
            variant="primary"
            icon={<Plus className="size-3.5" />}
            onClick={() => setCreateOpen(true)}
          >
            New Quotation
          </Button>
        }
      />

      {/* Compact Pipeline KPI Strip */}
      <div className="mb-4 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <button
          type="button"
          onClick={() => setFilter(filter === 'SENT' ? 'ALL' : 'SENT')}
          className={cn(
            'card px-3.5 py-2.5 text-left transition',
            filter === 'SENT' ? '!border-fg ring-1 ring-fg' : 'hover:border-line-strong',
          )}
        >
          <span className="text-[11px] font-medium text-fg-muted">1. Open Quotes</span>
          <p className="mt-0.5 text-[1.2rem] font-bold tabular">
            {(quotations ?? []).filter((q) => q.status === 'DRAFT' || q.status === 'SENT').length}
          </p>
        </button>
        <button
          type="button"
          onClick={() => setFilter(filter === 'ACCEPTED' ? 'ALL' : 'ACCEPTED')}
          className={cn(
            'card px-3.5 py-2.5 text-left transition',
            filter === 'ACCEPTED' ? '!border-fg ring-1 ring-fg' : 'hover:border-line-strong',
          )}
        >
          <span className="text-[11px] font-medium text-fg-muted">2. Client Accepted</span>
          <p className="mt-0.5 text-[1.2rem] font-bold tabular text-info">
            {(quotations ?? []).filter((q) => q.status === 'ACCEPTED').length}
          </p>
        </button>
        <button
          type="button"
          onClick={() => setFilter(filter === 'CONVERTED' ? 'ALL' : 'CONVERTED')}
          className={cn(
            'card px-3.5 py-2.5 text-left transition',
            filter === 'CONVERTED' ? '!border-fg ring-1 ring-fg' : 'hover:border-line-strong',
          )}
        >
          <span className="text-[11px] font-medium text-fg-muted">3. Converted to Invoice</span>
          <p className="mt-0.5 text-[1.2rem] font-bold tabular text-success">
            {(quotations ?? []).filter((q) => q.status === 'CONVERTED').length}
          </p>
        </button>
        <button
          type="button"
          onClick={() => setFilter('ALL')}
          className={cn(
            'card px-3.5 py-2.5 text-left transition',
            filter === 'ALL' ? '!border-fg ring-1 ring-fg' : 'hover:border-line-strong',
          )}
        >
          <span className="text-[11px] font-medium text-fg-muted">Pipeline Value</span>
          <p className="mt-0.5 text-[1.2rem] font-bold tabular">
            {money(pipelineValueMinor.toString(), 'UGX')}
          </p>
        </button>
      </div>

      <div className="card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pr-3">
          <Tabs
            className="border-b-0 px-3"
            value={filter}
            onChange={setFilter}
            items={[
              { value: 'ALL', label: 'All', count: quotations?.length ?? 0 },
              {
                value: 'SENT',
                label: 'Sent',
                count: (quotations ?? []).filter((q) => q.status === 'SENT').length,
              },
              {
                value: 'ACCEPTED',
                label: 'Accepted',
                count: (quotations ?? []).filter((q) => q.status === 'ACCEPTED').length,
              },
              {
                value: 'CONVERTED',
                label: 'Invoiced',
                count: (quotations ?? []).filter((q) => q.status === 'CONVERTED').length,
              },
              {
                value: 'DRAFT',
                label: 'Draft',
                count: (quotations ?? []).filter((q) => q.status === 'DRAFT').length,
              },
            ]}
          />
          <label className="relative my-1.5 w-60">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-fg-subtle" />
            <input
              className="input !min-h-7 !py-1 pl-8 text-[12px]"
              placeholder="Search quote #, client or event…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
        </div>

        <div>
          {isLoading ? (
            <div className="p-4">
              <Skeleton className="h-56" />
            </div>
          ) : !filtered.length ? (
            <Empty icon={<FileSpreadsheet className="size-4" />} title="No quotations found" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-left text-[12.5px]">
                <thead className="border-b border-line bg-surface-2/40 text-[11px] font-semibold uppercase tracking-wider text-fg-subtle">
                  <tr>
                    <th className="px-3.5 py-2">Quote #</th>
                    <th className="px-3.5 py-2">Event & Type</th>
                    <th className="px-3.5 py-2">Client / Organization</th>
                    <th className="px-3.5 py-2">Event Date</th>
                    <th className="px-3.5 py-2 text-right">Pax</th>
                    <th className="px-3.5 py-2">Status</th>
                    <th className="px-3.5 py-2 text-right">Total</th>
                    <th className="px-3.5 py-2 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {filtered.map((q) => (
                    <tr key={q.id} className="align-middle hover:bg-surface-2/30">
                      <td className="px-3.5 py-2.5 font-mono text-[12px] font-bold whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => setViewing(q)}
                          className="text-left hover:text-accent hover:underline"
                        >
                          {q.number}
                        </button>
                        <span className="block font-mono text-[10px] font-normal text-fg-subtle">
                          {q.checkCode}
                        </span>
                      </td>
                      <td className="px-3.5 py-2.5">
                        <div className="flex items-center gap-1.5">
                          <Pill tone="blue">{q.eventType}</Pill>
                          <span className="font-semibold text-fg">{q.eventTitle}</span>
                        </div>
                        <p className="mt-0.5 text-[11px] text-fg-muted">
                          {q.lines.length} line item{q.lines.length === 1 ? '' : 's'}
                          {q.hallSetup ? ` · ${q.hallSetup}` : ''}
                        </p>
                      </td>
                      <td className="px-3.5 py-2.5">
                        <p className="font-medium">{q.clientName}</p>
                        <p className="text-[11px] text-fg-subtle">
                          {q.clientOrganization ?? q.clientPhone}
                        </p>
                      </td>
                      <td className="px-3.5 py-2.5 font-mono text-[11.5px] text-fg-muted whitespace-nowrap">
                        {q.eventDate ? q.eventDate.slice(0, 10) : 'TBD'}
                      </td>
                      <td className="px-3.5 py-2.5 text-right font-mono tabular whitespace-nowrap">
                        {q.attendees ?? '—'}
                      </td>
                      <td className="px-3.5 py-2.5 whitespace-nowrap">
                        <Pill tone={STATUS_TONE[q.status]} dot>
                          {q.status}
                        </Pill>
                      </td>
                      <td className="px-3.5 py-2.5 text-right font-mono font-bold tabular whitespace-nowrap">
                        {money(q.totalMinor, q.currency)}
                      </td>
                      <td className="px-3.5 py-2.5 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            icon={<Eye className="size-3" />}
                            onClick={() => setViewing(q)}
                          >
                            View
                          </Button>
                          <Button
                            size="sm"
                            variant="secondary"
                            icon={<Printer className="size-3" />}
                            onClick={() => printQuotation(q.id, 'A4')}
                          >
                            Print
                          </Button>
                          {q.convertedInvoiceId ? (
                            <Button
                              size="sm"
                              variant="secondary"
                              icon={<FileCheck2 className="size-3" />}
                              onClick={() => printDocument(q.convertedInvoiceId!, 'A4')}
                            >
                              Invoice
                            </Button>
                          ) : (
                            <>
                              {(q.status === 'DRAFT' || q.status === 'SENT') && (
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  icon={<CheckCircle2 className="size-3" />}
                                  onClick={() => updateStatus.mutate({ id: q.id, status: 'ACCEPTED' })}
                                >
                                  Accept
                                </Button>
                              )}
                              <Button
                                size="sm"
                                variant="primary"
                                icon={<ArrowRight className="size-3" />}
                                onClick={() => setConverting(q)}
                              >
                                Invoice
                              </Button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {viewing && (
        <Dialog
          open={!!viewing}
          onClose={() => setViewing(null)}
          size="lg"
          title={`${viewing.number} · ${viewing.eventTitle}`}
          description={`${viewing.clientName}${viewing.clientOrganization ? ` · ${viewing.clientOrganization}` : ''} · Check: ${viewing.checkCode}`}
          footer={
            <>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => printQuotation(viewing.id, '80MM')}
              >
                80mm Slip
              </Button>
              <Button
                size="sm"
                variant="secondary"
                icon={<Printer className="size-3.5" />}
                onClick={() => printQuotation(viewing.id, 'A4')}
              >
                Print A4 Quotation
              </Button>
              {viewing.status !== 'CONVERTED' && (
                <Button
                  size="sm"
                  variant="primary"
                  icon={<ArrowRight className="size-3.5" />}
                  onClick={() => {
                    const q = viewing;
                    setViewing(null);
                    setConverting(q);
                  }}
                >
                  Convert to Invoice & Receipt
                </Button>
              )}
            </>
          }
        >
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2 text-[12px]">
              <Pill tone={STATUS_TONE[viewing.status]} dot>
                {viewing.status}
              </Pill>
              <Pill tone="blue">{viewing.eventType}</Pill>
              {viewing.attendees && (
                <Pill tone="neutral">
                  <Users className="mr-1 size-3" /> {viewing.attendees} Pax
                </Pill>
              )}
              {viewing.hallSetup && <Pill tone="neutral">Setup: {viewing.hallSetup}</Pill>}
              <Pill tone="neutral">Valid until {viewing.validUntil.slice(0, 10)}</Pill>
            </div>

            <table className="w-full text-left text-[12.5px]">
              <thead className="border-b border-line text-[11px] uppercase text-fg-subtle">
                <tr>
                  <th className="py-1.5 pr-3">Category</th>
                  <th className="py-1.5 pr-3">Description</th>
                  <th className="py-1.5 pr-3 text-right">Qty</th>
                  <th className="py-1.5 pr-3 text-right">Rate</th>
                  <th className="py-1.5 text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {viewing.lines.map((l) => (
                  <tr key={l.id}>
                    <td className="py-2 pr-3 font-mono text-[11px] text-fg-muted">{l.category}</td>
                    <td className="py-2 pr-3 font-medium">{l.description}</td>
                    <td className="py-2 pr-3 text-right tabular">
                      {l.quantity} {l.unit}
                    </td>
                    <td className="py-2 pr-3 text-right tabular">
                      {money(l.unitPriceMinor, viewing.currency)}
                    </td>
                    <td className="py-2 text-right font-semibold tabular">
                      {money(l.totalMinor, viewing.currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="flex items-center justify-between rounded-lg bg-surface-2 px-3.5 py-2.5 text-[13.5px] font-bold">
              <span>Total Quoted</span>
              <span className="tabular">{money(viewing.totalMinor, viewing.currency)}</span>
            </div>
          </div>
        </Dialog>
      )}

      <CreateQuotationDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onSuccess={() => {
          setCreateOpen(false);
          qc.invalidateQueries({ queryKey: ['quotations'] });
        }}
      />

      {converting && (
        <ConvertQuotationDialog
          quotation={converting}
          open={!!converting}
          onClose={() => setConverting(null)}
          onSuccess={() => {
            setConverting(null);
            qc.invalidateQueries({ queryKey: ['quotations'] });
            qc.invalidateQueries({ queryKey: ['documents'] });
          }}
        />
      )}
    </div>
  );
}

function ConvertQuotationDialog({
  quotation,
  open,
  onClose,
  onSuccess,
}: {
  quotation: QuotationDTO;
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [recordPaymentNow, setRecordPaymentNow] = useState(true);
  const [paymentMethod, setPaymentMethod] = useState<'CASH' | 'MOBILE_MONEY' | 'CARD' | 'BANK_TRANSFER'>('MOBILE_MONEY');
  const [paymentReference, setPaymentReference] = useState('');

  const m = useMutation({
    mutationFn: () =>
      post<{ quotation: QuotationDTO; invoiceId: string; receiptId: string | null }>(
        `/quotations/${quotation.id}/convert`,
        {
          recordPaymentNow,
          paymentMethod: recordPaymentNow ? paymentMethod : undefined,
          paymentReference: recordPaymentNow && paymentReference.trim() ? paymentReference.trim() : undefined,
        },
      ),
    onSuccess: (res) => {
      toast.success(
        res.receiptId
          ? `Converted ${quotation.number} → Invoice & Receipt`
          : `Converted ${quotation.number} → Invoice`,
        {
          action: {
            label: res.receiptId ? 'Print Receipt' : 'Print Invoice',
            onClick: () => printDocument(res.receiptId ?? res.invoiceId, 'A4'),
          },
        },
      );
      onSuccess();
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Conversion failed'),
  });

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="md"
      title={`Convert ${quotation.number} to Invoice`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" loading={m.isPending} onClick={() => m.mutate()}>
            {recordPaymentNow ? 'Issue Invoice + Receipt' : 'Issue Invoice Only'}
          </Button>
        </>
      }
    >
      <div className="grid gap-3">
        <div className="rounded-lg bg-surface-2 p-3 text-[12.5px]">
          <p className="font-semibold">{quotation.eventTitle}</p>
          <p className="text-fg-muted">
            {quotation.clientName}{' '}
            {quotation.clientOrganization ? `(${quotation.clientOrganization})` : ''}
          </p>
          <p className="mt-1 text-[14px] font-bold tabular">
            Total: {money(quotation.totalMinor, quotation.currency)}
          </p>
        </div>

        <Switch
          label="Also record payment & issue Official Receipt (RCT)"
          checked={recordPaymentNow}
          onChange={setRecordPaymentNow}
        />

        {recordPaymentNow && (
          <div className="grid grid-cols-2 gap-2.5">
            <SelectInput
              label="Method"
              value={paymentMethod}
              onChange={(e) =>
                setPaymentMethod(
                  e.target.value as 'CASH' | 'MOBILE_MONEY' | 'CARD' | 'BANK_TRANSFER',
                )
              }
            >
              <option value="MOBILE_MONEY">Mobile Money</option>
              <option value="BANK_TRANSFER">Bank EFT / Cheque</option>
              <option value="CASH">Cash</option>
              <option value="CARD">Card POS</option>
            </SelectInput>
            <TextInput
              label="Reference"
              value={paymentReference}
              onChange={(e) => setPaymentReference(e.target.value)}
              placeholder="STANBIC-EFT-908"
            />
          </div>
        )}
      </div>
    </Dialog>
  );
}

function CreateQuotationDialog({
  open,
  onClose,
  onSuccess,
}: {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [clientName, setClientName] = useState('');
  const [clientOrganization, setClientOrganization] = useState('');
  const [clientEmail, setClientEmail] = useState('');
  const [clientPhone, setClientPhone] = useState('');
  const [eventType, setEventType] = useState<EventType>('CONFERENCE');
  const [eventTitle, setEventTitle] = useState('');
  const [attendees, setAttendees] = useState('50');
  const [hallSetup, setHallSetup] = useState('Banquet');
  const [eventDate, setEventDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [validDays, setValidDays] = useState('14');
  const [discountMajor, setDiscountMajor] = useState('0');
  const [notes, setNotes] = useState('50% deposit confirms reservation.');
  const [lines, setLines] = useState([
    {
      category: 'CONFERENCE',
      description: 'Sipi Grand Hall — Full Day Package (Tea, Buffet Lunch & PA)',
      quantity: '50',
      unit: 'PAX',
      unitMajor: '85000',
    },
  ]);

  const addLine = () =>
    setLines((prev) => [
      ...prev,
      { category: 'CATERING', description: '', quantity: '1', unit: 'ITEM', unitMajor: '50000' },
    ]);

  const removeLine = (idx: number) =>
    setLines((prev) => prev.filter((_, i) => i !== idx));

  const m = useMutation({
    mutationFn: () =>
      post<QuotationDTO>('/quotations', {
        clientName: clientName.trim(),
        clientOrganization: clientOrganization.trim() || undefined,
        clientEmail: clientEmail.trim() || undefined,
        clientPhone: clientPhone.trim(),
        eventType,
        eventTitle: eventTitle.trim(),
        attendees: Number(attendees) || undefined,
        hallSetup: hallSetup.trim() || undefined,
        eventDate: eventDate || undefined,
        endDate: endDate || undefined,
        validDays: Number(validDays) || 14,
        currency: 'UGX',
        discountMinor: toMinorStr(discountMajor, 'UGX') ?? '0',
        notes: notes.trim() || undefined,
        lines: lines.map((l) => ({
          category: l.category,
          description: l.description.trim(),
          quantity: Number(l.quantity) || 1,
          unit: l.unit,
          unitPriceMinor: toMinorStr(l.unitMajor, 'UGX') ?? '0',
        })),
      }),
    onSuccess: (q) => {
      toast.success(`Quotation ${q.number} created`, {
        action: {
          label: 'Print A4',
          onClick: () => printQuotation(q.id, 'A4'),
        },
      });
      onSuccess();
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Failed to create quotation'),
  });

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="lg"
      title="New Quotation"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            loading={m.isPending}
            disabled={
              !clientName.trim() ||
              !clientPhone.trim() ||
              !eventTitle.trim() ||
              lines.some((l) => !l.description.trim())
            }
            onClick={() => m.mutate()}
          >
            Create Quotation
          </Button>
        </>
      }
    >
      <div className="grid gap-3">
        <div className="grid grid-cols-2 gap-2.5">
          <TextInput
            label="Event Title"
            required
            placeholder="Regional Agricultural Summit"
            value={eventTitle}
            onChange={(e) => setEventTitle(e.target.value)}
          />
          <SelectInput
            label="Category"
            value={eventType}
            onChange={(e) => setEventType(e.target.value as EventType)}
          >
            <option value="CONFERENCE">Conference</option>
            <option value="WEDDING">Wedding</option>
            <option value="MEETING">Boardroom Meeting</option>
            <option value="WORKSHOP">Workshop</option>
            <option value="RETREAT">Retreat</option>
            <option value="GROUP_STAY">Group Stay</option>
            <option value="BANQUET">Banquet</option>
          </SelectInput>
        </div>

        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          <TextInput
            label="Contact Name"
            required
            value={clientName}
            onChange={(e) => setClientName(e.target.value)}
          />
          <TextInput
            label="Organization"
            value={clientOrganization}
            onChange={(e) => setClientOrganization(e.target.value)}
          />
          <TextInput
            label="Phone"
            required
            placeholder="+256 77…"
            value={clientPhone}
            onChange={(e) => setClientPhone(e.target.value)}
          />
          <TextInput
            label="Email"
            type="email"
            value={clientEmail}
            onChange={(e) => setClientEmail(e.target.value)}
          />
        </div>

        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-5">
          <TextInput
            label="Pax"
            type="number"
            value={attendees}
            onChange={(e) => setAttendees(e.target.value)}
          />
          <TextInput
            label="Hall Setup"
            value={hallSetup}
            onChange={(e) => setHallSetup(e.target.value)}
          />
          <TextInput
            label="Start Date"
            type="date"
            value={eventDate}
            onChange={(e) => setEventDate(e.target.value)}
          />
          <TextInput
            label="End Date"
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
          />
          <TextInput
            label="Valid (Days)"
            type="number"
            value={validDays}
            onChange={(e) => setValidDays(e.target.value)}
          />
        </div>

        <div className="rounded-lg border border-line p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[12px] font-semibold">Line Items</span>
            <Button size="sm" variant="secondary" icon={<Plus className="size-3" />} onClick={addLine}>
              Add Line
            </Button>
          </div>
          <div className="space-y-2">
            {lines.map((l, idx) => (
              <div key={idx} className="grid grid-cols-1 gap-2 sm:grid-cols-[8.5rem_1fr_5rem_8rem_auto]">
                <select
                  className="input"
                  value={l.category}
                  onChange={(e) =>
                    setLines((prev) =>
                      prev.map((x, i) => (i === idx ? { ...x, category: e.target.value } : x)),
                    )
                  }
                >
                  <option value="CONFERENCE">CONFERENCE</option>
                  <option value="ROOMS">ROOMS</option>
                  <option value="CATERING">CATERING</option>
                  <option value="HEALTH_CLUB">HEALTH CLUB</option>
                  <option value="AV_EQUIPMENT">AV / DECOR</option>
                </select>
                <input
                  className="input"
                  placeholder="Description…"
                  value={l.description}
                  onChange={(e) =>
                    setLines((prev) =>
                      prev.map((x, i) => (i === idx ? { ...x, description: e.target.value } : x)),
                    )
                  }
                />
                <input
                  className="input"
                  type="number"
                  min={1}
                  value={l.quantity}
                  onChange={(e) =>
                    setLines((prev) =>
                      prev.map((x, i) => (i === idx ? { ...x, quantity: e.target.value } : x)),
                    )
                  }
                />
                <input
                  className="input"
                  placeholder="Unit UGX"
                  value={l.unitMajor}
                  onChange={(e) =>
                    setLines((prev) =>
                      prev.map((x, i) => (i === idx ? { ...x, unitMajor: e.target.value } : x)),
                    )
                  }
                />
                {lines.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeLine(idx)}
                    className="grid size-8 place-items-center rounded-md text-danger hover:bg-danger/10"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-[11rem_1fr]">
          <TextInput
            label="Discount (UGX)"
            value={discountMajor}
            onChange={(e) => setDiscountMajor(e.target.value)}
          />
          <TextInput
            label="Terms Note"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>
      </div>
    </Dialog>
  );
}
