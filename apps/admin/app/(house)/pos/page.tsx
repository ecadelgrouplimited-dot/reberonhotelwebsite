'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  ChefHat, Flame, Minus, Plus, Printer, Receipt, Search, ShoppingBag, Trash2,
} from 'lucide-react';
import type { PosItemDTO, PosOrderDTO, PosOrderStatus, PosOutletDTO, PosPaymentMethod } from '@reberon/contracts';
import { ApiError, get, patch, post } from '@/lib/api';
import { money } from '@/lib/money';
import { dateTime } from '@/lib/format';
import { cn } from '@/lib/cn';
import { Button } from '@/components/ui/button';
import { Empty, PageHeader, Pill, Section, Skeleton, Tabs } from '@/components/ui/bits';
import { SelectInput, TextInput } from '@/components/ui/field';
import { printDocument } from '@/components/documents/documents-panel';

interface CartLine {
  item: PosItemDTO;
  quantity: number;
  notes: string;
}

interface ReservationLite {
  id: string;
  code: string;
  status: string;
  guest: { firstName: string; lastName: string };
}

const PAYMENT_LABELS: Record<PosPaymentMethod, string> = {
  CASH: 'Cash',
  MOBILE_MONEY: 'Mobile Money',
  CARD: 'Card POS',
  ROOM_FOLIO: 'Room Folio',
  BANK_TRANSFER: 'Bank Transfer',
};

const ORDER_TONE: Record<PosOrderStatus, 'amber' | 'blue' | 'green' | 'neutral' | 'red'> = {
  PENDING: 'amber',
  PREPARING: 'blue',
  READY: 'green',
  COMPLETED: 'neutral',
  CANCELLED: 'red',
};

export default function PosPage() {
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState<string>('KITCHEN');
  const [selectedCat, setSelectedCat] = useState<string>('ALL');
  const [search, setSearch] = useState('');
  const [cart, setCart] = useState<CartLine[]>([]);
  const [customerName, setCustomerName] = useState('');
  const [tableOrRoom, setTableOrRoom] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PosPaymentMethod>('CASH');
  const [reservationId, setReservationId] = useState('');
  const [orderNotes, setOrderNotes] = useState('');
  const [kdsFilter, setKdsFilter] = useState<'ACTIVE' | 'ALL'>('ACTIVE');

  const { data: outlets, isLoading } = useQuery({
    queryKey: ['pos', 'outlets'],
    queryFn: () => get<PosOutletDTO[]>('/pos/outlets'),
  });

  const { data: orders, isLoading: ordersLoading } = useQuery({
    queryKey: ['pos', 'orders'],
    queryFn: () => get<PosOrderDTO[]>('/pos/orders'),
    refetchInterval: 15000,
  });

  const { data: reservationsData } = useQuery({
    queryKey: ['reservations', 'in-house-pos'],
    queryFn: () => get<{ data: ReservationLite[] }>('/reservations?limit=50'),
  });

  const activeReservations = useMemo(
    () => (reservationsData?.data ?? []).filter((r) => ['IN_HOUSE', 'CONFIRMED'].includes(r.status)),
    [reservationsData],
  );

  const currentOutlet = useMemo(
    () => outlets?.find((o) => o.code === activeTab) ?? outlets?.[0],
    [outlets, activeTab],
  );

  const categories = currentOutlet?.categories ?? [];

  const visibleItems = useMemo(() => {
    const all = categories.flatMap((c) =>
      c.items.map((it) => ({ ...it, categoryName: c.name })),
    );
    return all.filter((it) => {
      if (selectedCat !== 'ALL' && it.categoryId !== selectedCat) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        return (
          it.name.toLowerCase().includes(q) ||
          it.sku.toLowerCase().includes(q) ||
          (it.description ?? '').toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [categories, selectedCat, search]);

  const cartTotalMinor = useMemo(
    () => cart.reduce((acc, l) => acc + BigInt(l.item.priceMinorUGX) * BigInt(l.quantity), 0n),
    [cart],
  );

  const addToCart = (item: PosItemDTO) => {
    if (!item.isAvailable) {
      toast.error(`${item.name} is marked 86 (sold out)`);
      return;
    }
    setCart((prev) => {
      const idx = prev.findIndex((x) => x.item.id === item.id);
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx] = { ...copy[idx]!, quantity: copy[idx]!.quantity + 1 };
        return copy;
      }
      return [...prev, { item, quantity: 1, notes: '' }];
    });
  };

  const updateQty = (itemId: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((l) => (l.item.id === itemId ? { ...l, quantity: l.quantity + delta } : l))
        .filter((l) => l.quantity > 0),
    );
  };

  const placeOrder = useMutation({
    mutationFn: () => {
      if (!currentOutlet) throw new Error('Select an outlet');
      return post<PosOrderDTO>('/pos/orders', {
        outletId: currentOutlet.id,
        reservationId: paymentMethod === 'ROOM_FOLIO' && reservationId ? reservationId : undefined,
        customerName: customerName.trim() || undefined,
        tableOrRoom: tableOrRoom.trim() || undefined,
        paymentMethod,
        currency: 'UGX',
        notes: orderNotes.trim() || undefined,
        items: cart.map((l) => ({
          itemId: l.item.id,
          quantity: l.quantity,
          notes: l.notes.trim() || undefined,
        })),
      });
    },
    onSuccess: (order) => {
      qc.invalidateQueries({ queryKey: ['pos', 'orders'] });
      qc.invalidateQueries({ queryKey: ['documents'] });
      qc.invalidateQueries({ queryKey: ['inventory'] });
      setCart([]);
      setCustomerName('');
      setTableOrRoom('');
      setOrderNotes('');
      toast.success(
        `${order.orderNumber} · ${money(order.totalMinor, order.currency)}`,
        order.documentId
          ? {
              action: {
                label: 'Print 80mm',
                onClick: () => printDocument(order.documentId!, '80MM'),
              },
            }
          : undefined,
      );
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Could not place order'),
  });

  const updateStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: PosOrderStatus }) =>
      patch<PosOrderDTO>(`/pos/orders/${id}/status`, { status }),
    onSuccess: (o) => {
      qc.invalidateQueries({ queryKey: ['pos', 'orders'] });
      toast.success(`${o.orderNumber} → ${o.status}`);
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Could not update status'),
  });

  const toggleAvailability = useMutation({
    mutationFn: ({ id, isAvailable }: { id: string; isAvailable: boolean }) =>
      patch(`/pos/items/${id}`, { isAvailable }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pos', 'outlets'] });
      toast.success('Updated');
    },
  });

  const pendingOrdersCount = useMemo(
    () => (orders ?? []).filter((o) => ['PENDING', 'PREPARING', 'READY'].includes(o.status)).length,
    [orders],
  );

  const todaySalesMinor = useMemo(
    () =>
      (orders ?? [])
        .filter((o) => o.status !== 'CANCELLED')
        .reduce((s, o) => s + BigInt(o.totalMinor), 0n),
    [orders],
  );

  const filteredOrders = useMemo(() => {
    const list = orders ?? [];
    if (kdsFilter === 'ACTIVE') {
      return list.filter((o) => ['PENDING', 'PREPARING', 'READY'].includes(o.status));
    }
    return list;
  }, [orders, kdsFilter]);

  return (
    <div className="fade-in">
      <PageHeader
        title="Point of Sale · Kitchen, Bar & Outlets"
        actions={
          <div className="flex items-center gap-2">
            <Pill tone="green" dot>
              Sales: {money(todaySalesMinor.toString(), 'UGX')}
            </Pill>
            <Button
              variant={activeTab === 'KDS' ? 'primary' : 'secondary'}
              size="md"
              icon={<ChefHat className="size-3.5" />}
              onClick={() => setActiveTab(activeTab === 'KDS' ? (outlets?.[0]?.code ?? 'KITCHEN') : 'KDS')}
            >
              Order Queue ({pendingOrdersCount})
            </Button>
          </div>
        }
      />

      {isLoading ? (
        <Skeleton className="h-80" />
      ) : (
        <>
          <Tabs
            className="mb-3"
            value={activeTab}
            onChange={(v) => {
              setActiveTab(v);
              setSelectedCat('ALL');
            }}
            items={[
              ...(outlets ?? []).map((o) => ({
                value: o.code,
                label: o.name,
                count: o.categories.reduce((acc, c) => acc + c.items.length, 0),
              })),
              {
                value: 'KDS',
                label: 'Order Queue (KDS)',
                count: pendingOrdersCount,
              },
            ]}
          />

          {activeTab === 'KDS' ? (
            <div className="card overflow-hidden">
              <div className="flex items-center justify-between border-b border-line bg-surface-2/30 px-3.5 py-2">
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={() => setKdsFilter('ACTIVE')}
                    className={`rounded-md px-2.5 py-1 text-[11.5px] font-semibold ${
                      kdsFilter === 'ACTIVE' ? 'bg-fg text-bg' : 'text-fg-muted hover:text-fg'
                    }`}
                  >
                    Active ({pendingOrdersCount})
                  </button>
                  <button
                    type="button"
                    onClick={() => setKdsFilter('ALL')}
                    className={`rounded-md px-2.5 py-1 text-[11.5px] font-semibold ${
                      kdsFilter === 'ALL' ? 'bg-fg text-bg' : 'text-fg-muted hover:text-fg'
                    }`}
                  >
                    All Orders ({orders?.length ?? 0})
                  </button>
                </div>
              </div>

              {ordersLoading ? (
                <div className="p-4">
                  <Skeleton className="h-48" />
                </div>
              ) : !filteredOrders.length ? (
                <Empty icon={<ChefHat className="size-4" />} title="Queue is clear" />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[820px] text-left text-[12.5px]">
                    <thead className="border-b border-line bg-surface-2/40 text-[11px] font-semibold uppercase tracking-wider text-fg-subtle">
                      <tr>
                        <th className="px-3.5 py-2">Order #</th>
                        <th className="px-3.5 py-2">Outlet & Time</th>
                        <th className="px-3.5 py-2">Table / Guest</th>
                        <th className="px-3.5 py-2">Items</th>
                        <th className="px-3.5 py-2">Payment</th>
                        <th className="px-3.5 py-2">Status</th>
                        <th className="px-3.5 py-2 text-right">Total</th>
                        <th className="px-3.5 py-2 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line">
                      {filteredOrders.map((o) => (
                        <tr key={o.id} className="align-middle hover:bg-surface-2/30">
                          <td className="px-3.5 py-2.5 font-mono text-[12px] font-bold">
                            {o.orderNumber}
                          </td>
                          <td className="px-3.5 py-2.5 whitespace-nowrap">
                            <p className="font-medium">{o.outletName}</p>
                            <p className="text-[11px] text-fg-subtle">{dateTime(o.createdAt)}</p>
                          </td>
                          <td className="px-3.5 py-2.5 whitespace-nowrap">
                            <p className="font-medium">{o.tableOrRoom || 'Counter'}</p>
                            <p className="text-[11px] text-fg-subtle">
                              {o.customerName || 'Walk-in'}
                            </p>
                          </td>
                          <td className="px-3.5 py-2.5">
                            <div className="flex flex-wrap gap-1">
                              {o.items.map((it) => (
                                <span
                                  key={it.id}
                                  className="rounded border border-line bg-surface-2 px-1.5 py-0.5 text-[11.5px]"
                                >
                                  <strong>{it.quantity}×</strong> {it.itemName}
                                </span>
                              ))}
                            </div>
                            {o.notes && (
                              <p className="mt-0.5 text-[11px] text-warning">Note: {o.notes}</p>
                            )}
                          </td>
                          <td className="px-3.5 py-2.5 whitespace-nowrap">
                            <Pill tone="neutral">{PAYMENT_LABELS[o.paymentMethod]}</Pill>
                          </td>
                          <td className="px-3.5 py-2.5 whitespace-nowrap">
                            <Pill tone={ORDER_TONE[o.status]} dot>
                              {o.status}
                            </Pill>
                          </td>
                          <td className="px-3.5 py-2.5 text-right font-mono font-bold tabular whitespace-nowrap">
                            {money(o.totalMinor, o.currency)}
                          </td>
                          <td className="px-3.5 py-2.5 text-right whitespace-nowrap">
                            <div className="inline-flex items-center gap-1">
                              {o.status === 'PENDING' && (
                                <Button
                                  size="sm"
                                  variant="primary"
                                  onClick={() => updateStatus.mutate({ id: o.id, status: 'PREPARING' })}
                                >
                                  Prep
                                </Button>
                              )}
                              {o.status === 'PREPARING' && (
                                <Button
                                  size="sm"
                                  variant="primary"
                                  onClick={() => updateStatus.mutate({ id: o.id, status: 'READY' })}
                                >
                                  Ready
                                </Button>
                              )}
                              {o.status === 'READY' && (
                                <Button
                                  size="sm"
                                  variant="dark"
                                  onClick={() => updateStatus.mutate({ id: o.id, status: 'COMPLETED' })}
                                >
                                  Complete
                                </Button>
                              )}
                              {o.documentId && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  icon={<Printer className="size-3" />}
                                  onClick={() => printDocument(o.documentId!, '80MM')}
                                >
                                  80mm
                                </Button>
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
          ) : (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_21rem]">
              {/* Left: Compact Menu Grid */}
              <div className="space-y-3">
                <div className="card flex flex-wrap items-center justify-between gap-2 p-2.5">
                  <div className="flex flex-wrap gap-1">
                    <button
                      type="button"
                      onClick={() => setSelectedCat('ALL')}
                      className={cn(
                        'rounded-md px-2.5 py-1 text-[11.5px] font-semibold transition-colors',
                        selectedCat === 'ALL'
                          ? 'bg-fg text-bg'
                          : 'bg-surface-2 text-fg-muted hover:text-fg',
                      )}
                    >
                      All
                    </button>
                    {categories.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => setSelectedCat(c.id)}
                        className={cn(
                          'rounded-md px-2.5 py-1 text-[11.5px] font-semibold transition-colors',
                          selectedCat === c.id
                            ? 'bg-fg text-bg'
                            : 'bg-surface-2 text-fg-muted hover:text-fg',
                        )}
                      >
                        {c.name}
                      </button>
                    ))}
                  </div>
                  <label className="relative w-52">
                    <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-fg-subtle" />
                    <input
                      className="input !min-h-7 !py-1 pl-8 text-[12px]"
                      placeholder="Filter menu…"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                  </label>
                </div>

                <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-4">
                  {visibleItems.map((it) => {
                    const inCart = cart.find((c) => c.item.id === it.id)?.quantity ?? 0;
                    return (
                      <div
                        key={it.id}
                        onClick={() => it.isAvailable && addToCart(it)}
                        className={cn(
                          'card flex cursor-pointer flex-col justify-between p-3 transition hover:border-fg/40',
                          !it.isAvailable && 'cursor-not-allowed opacity-50',
                          inCart > 0 && 'ring-1 ring-accent border-accent',
                        )}
                      >
                        <div>
                          <div className="flex items-center justify-between gap-1 text-[10.5px] text-fg-subtle">
                            <span className="font-mono">{it.sku}</span>
                            {it.stockOnHand !== null && it.stockOnHand !== undefined && (
                              <span>Stk: {it.stockOnHand}</span>
                            )}
                          </div>
                          <h3 className="mt-1 text-[13px] font-semibold leading-snug">{it.name}</h3>
                        </div>

                        <div className="mt-2.5 flex items-center justify-between border-t border-line pt-2">
                          <span className="font-mono text-[12.5px] font-bold tabular">
                            {money(it.priceMinorUGX, 'UGX')}
                          </span>
                          <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                            <button
                              type="button"
                              onClick={() =>
                                toggleAvailability.mutate({ id: it.id, isAvailable: !it.isAvailable })
                              }
                              className="rounded px-1 text-[10px] text-fg-subtle hover:bg-surface-2 hover:text-fg"
                              title="Toggle 86 / In stock"
                            >
                              {it.isAvailable ? '86' : 'Restore'}
                            </button>
                            <Button
                              size="sm"
                              variant={inCart > 0 ? 'primary' : 'secondary'}
                              disabled={!it.isAvailable}
                              onClick={() => addToCart(it)}
                            >
                              {inCart > 0 ? `+${inCart}` : '+'}
                            </Button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Right: Compact Order Ticket */}
              <div className="lg:sticky lg:top-16 lg:self-start">
                <Section
                  title="Order Ticket"
                  actions={
                    cart.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setCart([])}
                        className="text-[11.5px] text-danger hover:underline"
                      >
                        Clear
                      </button>
                    )
                  }
                >
                  {!cart.length ? (
                    <Empty icon={<ShoppingBag className="size-4" />} title="Tap items to add" />
                  ) : (
                    <div className="space-y-3">
                      <ul className="divide-y divide-line">
                        {cart.map((l) => (
                          <li key={l.item.id} className="flex items-center justify-between gap-2 py-1.5">
                            <div className="min-w-0">
                              <p className="truncate text-[12.5px] font-semibold">{l.item.name}</p>
                              <p className="font-mono text-[11px] text-fg-muted">
                                {money(l.item.priceMinorUGX, 'UGX')}
                              </p>
                            </div>
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => updateQty(l.item.id, -1)}
                                className="grid size-6 place-items-center rounded border border-line hover:bg-surface-2"
                              >
                                {l.quantity === 1 ? (
                                  <Trash2 className="size-3 text-danger" />
                                ) : (
                                  <Minus className="size-3" />
                                )}
                              </button>
                              <span className="w-5 text-center font-mono text-[12px] font-bold tabular">
                                {l.quantity}
                              </span>
                              <button
                                type="button"
                                onClick={() => updateQty(l.item.id, 1)}
                                className="grid size-6 place-items-center rounded border border-line hover:bg-surface-2"
                              >
                                <Plus className="size-3" />
                              </button>
                            </div>
                          </li>
                        ))}
                      </ul>

                      <div className="flex items-center justify-between rounded-lg bg-surface-2 px-3 py-2 text-[13.5px] font-bold">
                        <span>Total</span>
                        <span className="font-mono tabular">{money(cartTotalMinor.toString(), 'UGX')}</span>
                      </div>

                      <div className="grid gap-2 pt-1">
                        <div className="grid grid-cols-2 gap-2">
                          <TextInput
                            label="Table / Spot"
                            placeholder="Table 4"
                            value={tableOrRoom}
                            onChange={(e) => setTableOrRoom(e.target.value)}
                          />
                          <TextInput
                            label="Guest"
                            placeholder="Walk-in"
                            value={customerName}
                            onChange={(e) => setCustomerName(e.target.value)}
                          />
                        </div>

                        <SelectInput
                          label="Settlement"
                          value={paymentMethod}
                          onChange={(e) => setPaymentMethod(e.target.value as PosPaymentMethod)}
                        >
                          <option value="CASH">Cash (Auto-Receipt)</option>
                          <option value="MOBILE_MONEY">Mobile Money (Auto-Receipt)</option>
                          <option value="CARD">Card POS (Auto-Receipt)</option>
                          <option value="ROOM_FOLIO">Post to Room Folio</option>
                          <option value="BANK_TRANSFER">Bank Transfer</option>
                        </SelectInput>

                        {paymentMethod === 'ROOM_FOLIO' && (
                          <SelectInput
                            label="Reservation"
                            value={reservationId}
                            onChange={(e) => {
                              setReservationId(e.target.value);
                              const found = activeReservations.find((r) => r.id === e.target.value);
                              if (found && !customerName) {
                                setCustomerName(`${found.guest.firstName} ${found.guest.lastName}`);
                              }
                            }}
                          >
                            <option value="">— Select room —</option>
                            {activeReservations.map((r) => (
                              <option key={r.id} value={r.id}>
                                {r.code} · {r.guest.firstName} {r.guest.lastName}
                              </option>
                            ))}
                          </SelectInput>
                        )}

                        <TextInput
                          label="Order Note"
                          placeholder="Kitchen / bar instructions…"
                          value={orderNotes}
                          onChange={(e) => setOrderNotes(e.target.value)}
                        />

                        <Button
                          variant="primary"
                          size="lg"
                          className="w-full"
                          icon={<Receipt className="size-3.5" />}
                          loading={placeOrder.isPending}
                          disabled={
                            cart.length === 0 ||
                            (paymentMethod === 'ROOM_FOLIO' && !reservationId)
                          }
                          onClick={() => placeOrder.mutate()}
                        >
                          {paymentMethod === 'ROOM_FOLIO'
                            ? `Post ${money(cartTotalMinor.toString(), 'UGX')} to Room`
                            : `Charge ${money(cartTotalMinor.toString(), 'UGX')}`}
                        </Button>
                      </div>
                    </div>
                  )}
                </Section>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
