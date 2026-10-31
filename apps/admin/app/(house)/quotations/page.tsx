'use client';

import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  ArrowRight,
  CheckCircle2,
  Copy,
  Download,
  Edit3,
  Eye,
  FileCheck2,
  FileSpreadsheet,
  MessageSquareText,
  Plus,
  Printer,
  QrCode,
  Search,
  Trash2,
  Users,
} from 'lucide-react';
import { whatsappLink } from '@reberon/utils';
import type { EventType, QuotationDTO, QuotationStatus } from '@reberon/contracts';
import { ApiError, del, get, patch, post } from '@/lib/api';
import { useMe } from '@/lib/providers';
import { money, toMinorStr } from '@/lib/money';
import { cn } from '@/lib/cn';
import { exportToCsv } from '@/lib/export-csv';
import { Button } from '@/components/ui/button';
import { Empty, PageHeader, Pill, Skeleton, Tabs } from '@/components/ui/bits';
import { Dialog } from '@/components/ui/dialog';
import { useConfirm } from '@/components/ui/confirm';
import { SelectInput, Switch, TextInput } from '@/components/ui/field';
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
  const me = useMe();
  const confirm = useConfirm();
  const canDelete = me.role === 'OWNER' || me.role === 'MANAGER';

  const [filter, setFilter] = useState<'ALL' | QuotationStatus>('ALL');
  const [search, setSearch] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<QuotationDTO | null>(null);
  const [converting, setConverting] = useState<QuotationDTO | null>(null);
  const [viewing, setViewing] = useState<QuotationDTO | null>(null);
  const [viewMode, setViewMode] = useState<'details' | 'preview'>('details');
  const [previewPaper, setPreviewPaper] = useState<'A4' | '80MM'>('A4');

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

  const deleteMut = useMutation({
    mutationFn: (id: string) => del(`/quotations/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['quotations'] });
      setViewing(null);
      toast.success('Quotation deleted');
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Could not delete quotation'),
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
        description="Official event proposals, pro-forma quotations, QR verification, and 1-click conversion to Invoice & Receipt"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant="secondary"
              disabled={!filtered.length}
              icon={<Download className="size-3.5" />}
              onClick={() =>
                exportToCsv(
                  'reberon-quotations.csv',
                  ['Number', 'Check Code', 'Event Title', 'Event Type', 'Client', 'Organization', 'Phone', 'Event Date', 'Pax', 'Status', 'Total'],
                  filtered.map((q) => [
                    q.number,
                    q.checkCode,
                    q.eventTitle,
                    q.eventType,
                    q.clientName,
                    q.clientOrganization ?? '',
                    q.clientPhone,
                    q.eventDate ?? 'TBD',
                    q.attendees ?? '',
                    q.status,
                    money(q.totalMinor, q.currency),
                  ]),
                )
              }
            >
              Export CSV
            </Button>
            <Button
              size="sm"
              variant="primary"
              icon={<Plus className="size-3.5" />}
              onClick={() => {
                setEditing(null);
                setCreateOpen(true);
              }}
            >
              New Quotation
            </Button>
          </div>
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
              <table className="w-full min-w-[940px] text-left text-[12.5px]">
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
                          onClick={() => {
                            setViewing(q);
                            setViewMode('details');
                          }}
                          className="text-left hover:text-accent hover:underline"
                        >
                          {q.number}
                        </button>
                        <span className="mt-0.5 flex items-center gap-1 font-mono text-[10px] font-normal text-fg-subtle">
                          <QrCode className="size-2.5" /> {q.checkCode}
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
                            onClick={() => {
                              setViewing(q);
                              setViewMode('details');
                            }}
                          >
                            View
                          </Button>
                          {q.status !== 'CONVERTED' && (
                            <Button
                              size="sm"
                              variant="ghost"
                              icon={<Edit3 className="size-3" />}
                              onClick={() => {
                                setEditing(q);
                                setCreateOpen(true);
                              }}
                              title="Edit Quotation"
                            >
                              Edit
                            </Button>
                          )}
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
                          {canDelete && (
                            <Button
                              size="sm"
                              variant="ghost"
                              icon={<Trash2 className="size-3 text-danger" />}
                              onClick={async () => {
                                if (
                                  await confirm({
                                    title: `Delete quotation ${q.number}?`,
                                    body: `Permanently delete ${q.number} (${q.eventTitle}). This action is logged in the audit trail.`,
                                    confirm: 'Delete Quotation',
                                    danger: true,
                                  })
                                ) {
                                  deleteMut.mutate(q.id);
                                }
                              }}
                              title="Delete Quotation"
                            />
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
          description={`${viewing.clientName}${viewing.clientOrganization ? ` · ${viewing.clientOrganization}` : ''} · Check Code: ${viewing.checkCode}`}
          footer={
            <div className="flex w-full flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-1.5">
                <Button
                  size="sm"
                  variant="ghost"
                  icon={<Copy className="size-3.5" />}
                  onClick={() => {
                    const verifyUrl = `https://reberonhotel.com/verify?number=${encodeURIComponent(viewing.number)}&check=${encodeURIComponent(viewing.checkCode)}`;
                    navigator.clipboard.writeText(verifyUrl);
                    toast.success('Verification URL copied');
                  }}
                >
                  Copy Verify Link
                </Button>
                {viewing.clientPhone && (
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={<MessageSquareText className="size-3.5" />}
                    onClick={() => {
                      const verifyUrl = `https://reberonhotel.com/verify?number=${encodeURIComponent(viewing.number)}&check=${encodeURIComponent(viewing.checkCode)}`;
                      const msg = `Hello ${viewing.clientName.split(' ')[0]}, here is your official Reberon Hotel Quotation ${viewing.number} for "${viewing.eventTitle}" (${money(viewing.totalMinor, viewing.currency)}). View & verify online: ${verifyUrl}`;
                      window.open(whatsappLink(viewing.clientPhone, msg), '_blank', 'noopener');
                    }}
                  >
                    WhatsApp Quote
                  </Button>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button size="sm" variant="ghost" onClick={() => printQuotation(viewing.id, '80MM')}>
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
              </div>
            </div>
          }
        >
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
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
              <div className="flex rounded-lg border border-line bg-surface-2 p-0.5 text-xs font-semibold">
                <button
                  type="button"
                  onClick={() => setViewMode('details')}
                  className={cn('rounded-md px-2.5 py-1 transition', viewMode === 'details' ? 'bg-fg text-bg' : 'text-fg-muted hover:text-fg')}
                >
                  Line Items
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('preview')}
                  className={cn('rounded-md px-2.5 py-1 transition', viewMode === 'preview' ? 'bg-fg text-bg' : 'text-fg-muted hover:text-fg')}
                >
                  Print Preview & QR
                </button>
              </div>
            </div>

            {viewMode === 'details' ? (
              <>
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
              </>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center justify-end gap-1.5">
                  <button
                    type="button"
                    onClick={() => setPreviewPaper('A4')}
                    className={cn('rounded px-2 py-0.5 text-xs font-semibold', previewPaper === 'A4' ? 'bg-fg text-bg' : 'bg-surface-2 text-fg-muted')}
                  >
                    A4 Page
                  </button>
                  <button
                    type="button"
                    onClick={() => setPreviewPaper('80MM')}
                    className={cn('rounded px-2 py-0.5 text-xs font-semibold', previewPaper === '80MM' ? 'bg-fg text-bg' : 'bg-surface-2 text-fg-muted')}
                  >
                    80mm Thermal
                  </button>
                </div>
                <div className="overflow-hidden rounded-xl border border-line bg-white">
                  <iframe
                    key={`${viewing.id}-${previewPaper}`}
                    src={`/v1/admin/quotations/${viewing.id}/print?paper=${previewPaper}`}
                    title={`${viewing.number} preview`}
                    className="h-[62vh] w-full border-0 bg-white"
                  />
                </div>
              </div>
            )}
          </div>
        </Dialog>
      )}

      <QuotationFormDialog
        open={createOpen}
        editing={editing}
        onClose={() => {
          setCreateOpen(false);
          setEditing(null);
        }}
        onSuccess={() => {
          setCreateOpen(false);
          setEditing(null);
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

function QuotationFormDialog({
  open,
  editing,
  onClose,
  onSuccess,
}: {
  open: boolean;
  editing: QuotationDTO | null;
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

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setClientName(editing.clientName);
      setClientOrganization(editing.clientOrganization ?? '');
      setClientEmail(editing.clientEmail ?? '');
      setClientPhone(editing.clientPhone);
      setEventType(editing.eventType);
      setEventTitle(editing.eventTitle);
      setAttendees(editing.attendees ? String(editing.attendees) : '');
      setHallSetup(editing.hallSetup ?? '');
      setEventDate(editing.eventDate ? editing.eventDate.slice(0, 10) : '');
      setEndDate(editing.endDate ? editing.endDate.slice(0, 10) : '');
      setValidDays('14');
      setDiscountMajor(editing.discountMinor ?? '0');
      setNotes(editing.notes ?? '');
      setLines(
        editing.lines.map((l) => ({
          category: l.category,
          description: l.description,
          quantity: String(l.quantity),
          unit: l.unit,
          unitMajor: l.unitPriceMinor,
        })),
      );
    } else {
      setClientName('');
      setClientOrganization('');
      setClientEmail('');
      setClientPhone('');
      setEventType('CONFERENCE');
      setEventTitle('');
      setAttendees('50');
      setHallSetup('Banquet');
      setEventDate('');
      setEndDate('');
      setValidDays('14');
      setDiscountMajor('0');
      setNotes('50% deposit confirms reservation.');
      setLines([
        {
          category: 'CONFERENCE',
          description: 'Sipi Grand Hall — Full Day Package (Tea, Buffet Lunch & PA)',
          quantity: '50',
          unit: 'PAX',
          unitMajor: '85000',
        },
      ]);
    }
  }, [open, editing]);

  const addLine = () =>
    setLines((prev) => [
      ...prev,
      { category: 'CATERING', description: '', quantity: '1', unit: 'ITEM', unitMajor: '50000' },
    ]);

  const removeLine = (idx: number) =>
    setLines((prev) => prev.filter((_, i) => i !== idx));

  const m = useMutation({
    mutationFn: () => {
      const payload = {
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
        currency: 'UGX' as const,
        discountMinor: toMinorStr(discountMajor, 'UGX') ?? '0',
        notes: notes.trim() || undefined,
        lines: lines.map((l) => ({
          category: l.category,
          description: l.description.trim(),
          quantity: Number(l.quantity) || 1,
          unit: l.unit,
          unitPriceMinor: toMinorStr(l.unitMajor, 'UGX') ?? '0',
        })),
      };
      return editing
        ? patch<QuotationDTO>(`/quotations/${editing.id}`, payload)
        : post<QuotationDTO>('/quotations', payload);
    },
    onSuccess: (q) => {
      toast.success(editing ? `Quotation ${q.number} updated` : `Quotation ${q.number} created`, {
        action: {
          label: 'Print A4',
          onClick: () => printQuotation(q.id, 'A4'),
        },
      });
      onSuccess();
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Failed to save quotation'),
  });

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="lg"
      title={editing ? `Edit Quotation ${editing.number}` : 'New Quotation'}
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
            {editing ? 'Save Quotation Changes' : 'Create Quotation'}
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
