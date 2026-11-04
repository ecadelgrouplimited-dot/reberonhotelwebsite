'use client';
import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { CheckCircle2, Printer } from 'lucide-react';
import type { PosInHouseGuestDTO, PosOrderDTO, PosPaymentMethod } from '@reberon/contracts';
import { ApiError, post } from '@/lib/api';
import { money } from '@/lib/money';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { SelectInput, TextInput } from '@/components/ui/field';
import { printDocument } from '@/components/documents/documents-panel';
import {
  CashPad,
  PAYMENT_LABELS,
  PayMethodPicker,
  parseMajor,
  printPosSlip,
  toMajorStr,
} from './pos-kit';

/** Stage 2 of a bill: take payment on a held bill and issue the numbered final receipt. */
export function SettleDialog({
  order,
  inHouseGuests,
  onClose,
}: {
  order: PosOrderDTO | null;
  inHouseGuests: PosInHouseGuestDTO[];
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [method, setMethod] = useState<PosPaymentMethod>('CASH');
  const [resId, setResId] = useState('');
  const [discount, setDiscount] = useState('');
  const [tendered, setTendered] = useState('');
  const [reference, setReference] = useState('');

  useEffect(() => {
    if (!order) return;
    setMethod(order.paymentMethod || 'CASH');
    setResId(order.reservationId ?? '');
    setDiscount(order.discountMinor !== '0' ? toMajorStr(order.discountMinor, order.currency) : '');
    setTendered('');
    setReference('');
  }, [order]);

  const currency = order?.currency ?? 'UGX';
  const subtotal = BigInt(order?.subtotalMinor ?? '0');
  const discountMinor = parseMajor(discount, currency);
  const discountValid = discountMinor !== null && discountMinor <= subtotal;
  const total = discountValid ? subtotal - discountMinor : subtotal;
  const tenderedMinor = method === 'CASH' ? parseMajor(tendered, currency) : null;
  const shortPaid = tenderedMinor !== null && tenderedMinor > 0n && tenderedMinor < total;

  const settle = useMutation({
    mutationFn: () =>
      post<PosOrderDTO>(`/pos/orders/${order!.id}/settle`, {
        paymentMethod: method,
        reservationId: method === 'ROOM_FOLIO' ? resId : undefined,
        discountMinor: (discountMinor ?? 0n).toString(),
        paymentReference: reference.trim() || undefined,
        amountTenderedMinor: tenderedMinor && tenderedMinor > 0n ? tenderedMinor.toString() : undefined,
      }),
    onSuccess: (o) => {
      qc.invalidateQueries({ queryKey: ['pos', 'orders'] });
      qc.invalidateQueries({ queryKey: ['documents'] });
      qc.invalidateQueries({ queryKey: ['admin-pulse'] });
      onClose();
      toast.success(`${o.orderNumber} paid · ${money(o.totalMinor, o.currency)} by ${PAYMENT_LABELS[o.paymentMethod]}`, {
        action: o.documentId
          ? { label: 'Print receipt', onClick: () => printDocument(o.documentId!, '80MM') }
          : { label: 'Print slip', onClick: () => printPosSlip(o.id, 'BILL') },
      });
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Could not confirm payment'),
  });

  return (
    <Dialog
      open={!!order}
      onClose={onClose}
      size="sm"
      title={order ? `Take payment · ${order.orderNumber}` : 'Take payment'}
      description={
        order
          ? `${order.tableOrRoom || 'Counter'} · ${order.customerName || 'Walk-in guest'} · served by ${order.servedByName || 'Staff'}`
          : undefined
      }
    >
      {order && (
        <form
          className="grid gap-3.5"
          onSubmit={(e) => {
            e.preventDefault();
            settle.mutate();
          }}
        >
          <div className="rounded-2xl bg-fg px-4 py-3 text-bg">
            <div className="flex items-center justify-between text-[11px] opacity-75">
              <span>
                {order.items.reduce((a, i) => a + i.quantity, 0)} items
                {discountValid && discountMinor! > 0n && ` · ${money(subtotal, currency)} less ${money(discountMinor!, currency)}`}
              </span>
              <span>{currency}</span>
            </div>
            <p className="mt-0.5 font-display text-2xl font-extrabold tabular">{money(total, currency)}</p>
          </div>

          <PayMethodPicker value={method} onChange={setMethod} />

          {method === 'ROOM_FOLIO' && (
            <SelectInput label="Charge to room" value={resId} onChange={(e) => setResId(e.target.value)}>
              <option value="">— Choose an in-house guest —</option>
              {inHouseGuests.map((r) => (
                <option key={r.reservationId} value={r.reservationId}>
                  {r.roomNumber ? `Room ${r.roomNumber} · ` : ''}
                  {r.guestName} ({r.code})
                </option>
              ))}
            </SelectInput>
          )}

          {method === 'CASH' && (
            <CashPad totalMinor={total} currency={currency} tendered={tendered} onTendered={setTendered} />
          )}

          <div className="grid grid-cols-2 gap-2">
            <TextInput
              label={`Discount (${currency})`}
              inputMode="decimal"
              placeholder="0"
              value={discount}
              onChange={(e) => setDiscount(e.target.value)}
              error={discountValid ? undefined : 'More than the bill'}
            />
            {method !== 'CASH' && method !== 'ROOM_FOLIO' ? (
              <TextInput
                label="Reference"
                placeholder={method === 'MOBILE_MONEY' ? 'MoMo transaction ID' : 'Auth / slip number'}
                value={reference}
                onChange={(e) => setReference(e.target.value)}
              />
            ) : (
              <span />
            )}
          </div>

          <div className="flex items-center justify-between gap-2 border-t border-line pt-3">
            <Button
              variant="ghost"
              size="sm"
              icon={<Printer className="size-3.5" />}
              onClick={() => printPosSlip(order.id, 'BILL')}
            >
              Print bill
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="lg"
              icon={<CheckCircle2 className="size-4" />}
              loading={settle.isPending}
              disabled={!discountValid || shortPaid || (method === 'ROOM_FOLIO' && !resId)}
            >
              {method === 'ROOM_FOLIO' ? 'Post to room' : `Confirm ${money(total, currency)}`}
            </Button>
          </div>
        </form>
      )}
    </Dialog>
  );
}
