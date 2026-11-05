'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Armchair,
  ArrowLeft,
  BarChart3,
  ChefHat,
  Clock,
  Coffee,
  CreditCard,
  Dumbbell,
  Edit3,
  Flame,
  FolderPlus,
  LayoutGrid,
  ListFilter,
  Minus,
  Pencil,
  Plus,
  Presentation,
  Printer,
  Receipt,
  Search,
  Settings2,
  ShoppingBag,
  Trash2,
  Wine,
  X,
  type LucideIcon,
} from 'lucide-react';
import type {
  CurrencyCode,
  PosInHouseGuestDTO,
  PosItemDTO,
  PosOrderDTO,
  PosOrderStatus,
  PosOutletDTO,
  PosOutletType,
  PosPaymentMethod,
  PosStaffDTO,
  PosTableDTO,
} from '@reberon/contracts';
import { ApiError, del, get, patch, post } from '@/lib/api';
import { useMe } from '@/lib/providers';
import { money } from '@/lib/money';
import { dateTime } from '@/lib/format';
import { cn } from '@/lib/cn';
import { Button } from '@/components/ui/button';
import { Empty, Kbd, PageHeader, Pill, Skeleton } from '@/components/ui/bits';
import { useConfirm } from '@/components/ui/confirm';
import { DeleteConfirmDialog } from '@/components/ui/delete-dialog';
import { SelectInput } from '@/components/ui/field';
import { printDocument } from '@/components/documents/documents-panel';
import {
  AgeBadge,
  CashPad,
  CATEGORY_DOTS,
  PAYMENT_LABELS,
  PayMethodPicker,
  QUICK_MODIFIERS,
  StaffPicker,
  businessDay,
  parseMajor,
  printPosSlip,
  toMajorStr,
  unitPrice,
  useNow,
} from '@/components/pos/pos-kit';
import { BillCard, KitchenBoard } from '@/components/pos/boards';
import { SettleDialog } from '@/components/pos/settle-dialog';
import { CategoryDialog, MenuItemDialog, type PosStockItem } from '@/components/pos/menu-dialogs';
import { ShiftDialog } from '@/components/pos/shift-dialog';
import { FloorView, TableChips } from '@/components/pos/floor';

interface CartLine {
  item: PosItemDTO;
  quantity: number;
  notes: string;
}

type View = 'SELL' | 'TABLES' | 'BILLS' | 'KITCHEN';
type BillFilter = 'OPEN' | 'PAID' | 'ALL';

const OUTLET_ICON: Record<PosOutletType, LucideIcon> = {
  KITCHEN: ChefHat,
  BAR: Wine,
  HEALTH_CLUB: Dumbbell,
  CONFERENCE: Presentation,
};

const ACTIVE_KITCHEN: PosOrderStatus[] = ['PENDING', 'PREPARING', 'READY'];
const DISCOUNT_STEPS = [0, 5, 10, 15, 100];

export default function PosPage() {
  const qc = useQueryClient();
  const me = useMe();
  const confirm = useConfirm();
  const isOwner = me.role === 'OWNER';
  const canManageTables = isOwner || me.role === 'MANAGER';
  const now = useNow();
  const searchRef = useRef<HTMLInputElement>(null);
  const ticketRef = useRef<HTMLDivElement>(null);

  const [view, setView] = useState<View>(me.role === 'KITCHEN' ? 'KITCHEN' : 'SELL');
  const [outletCode, setOutletCode] = useState<string | null>(null);
  const [selectedCat, setSelectedCat] = useState<string>('ALL');
  const [search, setSearch] = useState('');
  const [currency, setCurrency] = useState<CurrencyCode>('UGX');
  const [manage, setManage] = useState(false);

  // Ticket
  const [cart, setCart] = useState<CartLine[]>([]);
  const [noteLineId, setNoteLineId] = useState<string | null>(null);
  const [targetOpenOrder, setTargetOpenOrder] = useState<PosOrderDTO | null>(null);
  const [editingOpenOrder, setEditingOpenOrder] = useState<PosOrderDTO | null>(null);
  const [servedByName, setServedByName] = useState<string>(me.name || 'Staff');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [tableOrRoom, setTableOrRoom] = useState('');
  const [tableId, setTableId] = useState<string | null>(null);
  const [orderNotes, setOrderNotes] = useState('');
  const [discountPercent, setDiscountPercent] = useState(0);
  const [customDiscount, setCustomDiscount] = useState('');
  const [checkout, setCheckout] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<PosPaymentMethod>('CASH');
  const [reservationId, setReservationId] = useState('');
  const [cashTendered, setCashTendered] = useState('');

  // Bills
  const [billFilter, setBillFilter] = useState<BillFilter>('OPEN');
  const [billLayout, setBillLayout] = useState<'CARDS' | 'TABLE'>('CARDS');
  const [orderSearch, setOrderSearch] = useState('');

  // Dialogs
  const [settleOrder, setSettleOrder] = useState<PosOrderDTO | null>(null);
  const [itemDialog, setItemDialog] = useState<{ item: PosItemDTO | null } | null>(null);
  const [catOpen, setCatOpen] = useState(false);
  const [shiftOpen, setShiftOpen] = useState(false);
  const [deletingMenuItem, setDeletingMenuItem] = useState<PosItemDTO | null>(null);
  const [deletingCat, setDeletingCat] = useState<{ id: string; name: string } | null>(null);

  const { data: outlets, isLoading } = useQuery({
    queryKey: ['pos', 'outlets'],
    queryFn: () => get<PosOutletDTO[]>('/pos/outlets'),
  });
  const { data: orders, isLoading: ordersLoading } = useQuery({
    queryKey: ['pos', 'orders'],
    queryFn: () => get<PosOrderDTO[]>('/pos/orders'),
    refetchInterval: 10_000,
  });
  const { data: inHouseGuests } = useQuery({
    queryKey: ['pos', 'in-house-guests'],
    queryFn: () => get<PosInHouseGuestDTO[]>('/pos/in-house-guests'),
  });
  const { data: tables } = useQuery({
    queryKey: ['pos', 'tables'],
    queryFn: () => get<PosTableDTO[]>('/pos/tables'),
    refetchInterval: 15_000,
  });
  const { data: staff } = useQuery({
    queryKey: ['pos', 'staff'],
    queryFn: () => get<PosStaffDTO[]>('/pos/staff'),
    staleTime: 5 * 60_000,
  });
  const { data: stockItems } = useQuery({
    queryKey: ['pos', 'stock-items'],
    queryFn: () => get<PosStockItem[]>('/pos/stock-items'),
    enabled: manage,
  });

  const currentOutlet = useMemo(
    () => outlets?.find((o) => o.code === outletCode) ?? outlets?.[0],
    [outlets, outletCode],
  );
  const categories = currentOutlet?.categories ?? [];

  const menuById = useMemo(
    () => new Map((outlets ?? []).flatMap((o) => o.categories.flatMap((c) => c.items.map((it) => [it.id, it] as const)))),
    [outlets],
  );

  const visibleItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    return categories.flatMap((c, ci) =>
      c.items
        .filter((it) => selectedCat === 'ALL' || it.categoryId === selectedCat)
        .filter(
          (it) =>
            !q ||
            it.name.toLowerCase().includes(q) ||
            it.sku.toLowerCase().includes(q) ||
            (it.description ?? '').toLowerCase().includes(q),
        )
        .map((it) => ({ ...it, dot: CATEGORY_DOTS[ci % CATEGORY_DOTS.length]! })),
    );
  }, [categories, selectedCat, search]);

  // ── Derived order lists ──
  const today = businessDay(now);
  const openTabs = useMemo(
    () => (orders ?? []).filter((o) => !o.isSettled && o.status !== 'CANCELLED'),
    [orders],
  );
  // "Today" for money means paid today, whenever the bill was opened.
  const paidToday = useMemo(
    () =>
      (orders ?? []).filter(
        (o) => o.isSettled && o.status !== 'CANCELLED' && businessDay(o.settledAt ?? o.createdAt) === today,
      ),
    [orders, today],
  );
  const voidedToday = useMemo(
    () => (orders ?? []).filter((o) => o.status === 'CANCELLED' && businessDay(o.createdAt) === today).length,
    [orders, today],
  );
  const kitchenQueue = useMemo(
    () => (orders ?? []).filter((o) => ACTIVE_KITCHEN.includes(o.status)),
    [orders],
  );
  const sumUgx = (list: PosOrderDTO[]) =>
    list.filter((o) => o.currency === 'UGX').reduce((s, o) => s + BigInt(o.totalMinor), 0n);
  const paidTodayUgx = sumUgx(paidToday);
  const waitingUgx = sumUgx(openTabs);
  const readyCount = kitchenQueue.filter((o) => o.status === 'READY').length;

  const prepTarget = (o: PosOrderDTO) =>
    Math.max(10, ...o.items.map((i) => menuById.get(i.itemId)?.prepMinutes ?? 0));

  // ── Ticket maths ──
  const lineUnit = (l: CartLine) => unitPrice(l.item, currency) ?? 0n;
  const subtotal = cart.reduce((acc, l) => acc + lineUnit(l) * BigInt(l.quantity), 0n);
  const customDiscountMinor = customDiscount.trim() ? parseMajor(customDiscount, currency) : null;
  const discountMinor = (() => {
    const d = customDiscount.trim()
      ? (customDiscountMinor ?? 0n)
      : (subtotal * BigInt(discountPercent)) / 100n;
    return d > subtotal ? subtotal : d;
  })();
  const total = subtotal - discountMinor;
  const itemCount = cart.reduce((a, l) => a + l.quantity, 0);
  const tendered = paymentMethod === 'CASH' ? parseMajor(cashTendered, currency) : null;
  const shortPaid = tendered !== null && tendered > 0n && tendered < total;
  const pickedTable = (tables ?? []).find((t) => t.id === tableId) ?? null;
  const pickedTableBill = pickedTable?.openBills[0]
    ? openTabs.find((o) => o.id === pickedTable.openBills[0]!.id) ?? null
    : null;
  const ticketLocked = !!(editingOpenOrder || targetOpenOrder);

  // ── Keyboard: "/" jumps to search wherever focus is not already in a field ──
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== '/' || view !== 'SELL') return;
      const el = e.target as HTMLElement;
      if (el.closest('input, textarea, select, [contenteditable="true"]')) return;
      e.preventDefault();
      searchRef.current?.focus();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [view]);

  // ── Cart handlers ──
  const addToCart = (item: PosItemDTO) => {
    if (!item.isAvailable) return toast.error(`${item.name} is sold out`);
    if (unitPrice(item, currency) === null) return toast.error(`${item.name} has no ${currency} price`);
    setCart((prev) => {
      const idx = prev.findIndex((x) => x.item.id === item.id);
      if (idx < 0) return [...prev, { item, quantity: 1, notes: '' }];
      const copy = [...prev];
      copy[idx] = { ...copy[idx]!, quantity: copy[idx]!.quantity + 1 };
      return copy;
    });
  };

  const updateQty = (itemId: string, delta: number) =>
    setCart((prev) =>
      prev
        .map((l) => (l.item.id === itemId ? { ...l, quantity: l.quantity + delta } : l))
        .filter((l) => l.quantity > 0),
    );

  const setLineNote = (itemId: string, notes: string) =>
    setCart((prev) => prev.map((l) => (l.item.id === itemId ? { ...l, notes } : l)));

  const toggleModifier = (itemId: string, mod: string) =>
    setCart((prev) =>
      prev.map((l) => {
        if (l.item.id !== itemId) return l;
        const parts = l.notes.split(',').map((s) => s.trim()).filter(Boolean);
        const next = parts.includes(mod) ? parts.filter((p) => p !== mod) : [...parts, mod];
        return { ...l, notes: next.join(', ') };
      }),
    );

  const switchCurrency = (c: CurrencyCode) => {
    if (c === currency) return;
    if (ticketLocked) return toast.info('A held bill keeps the currency it was opened in');
    const unpriced = cart.filter((l) => unitPrice(l.item, c) === null);
    if (unpriced.length) {
      return toast.error(`${unpriced.map((l) => l.item.name).join(', ')} ${unpriced.length > 1 ? 'have' : 'has'} no ${c} price`);
    }
    setCurrency(c);
    setCashTendered('');
  };

  const resetTicket = () => {
    setCart([]);
    setTargetOpenOrder(null);
    setEditingOpenOrder(null);
    setCustomerName('');
    setCustomerPhone('');
    setTableOrRoom('');
    setTableId(null);
    setOrderNotes('');
    setDiscountPercent(0);
    setCustomDiscount('');
    setCashTendered('');
    setReservationId('');
    setPaymentMethod('CASH');
    setCheckout(false);
    setNoteLineId(null);
  };

  const focusOutletOf = (o: PosOrderDTO) => {
    const out = outlets?.find((x) => x.id === o.outletId);
    if (out) setOutletCode(out.code);
    setSelectedCat('ALL');
    setView('SELL');
  };

  const startRound = (o: PosOrderDTO) => {
    resetTicket();
    setTargetOpenOrder(o);
    setCurrency(o.currency);
    setTableOrRoom(o.tableOrRoom ?? '');
    setTableId(o.tableId);
    setCustomerName(o.customerName ?? '');
    focusOutletOf(o);
    toast.info(`Adding a round to ${o.tableOrRoom || o.orderNumber}`);
  };

  const editBill = (o: PosOrderDTO) => {
    resetTicket();
    setEditingOpenOrder(o);
    setCurrency(o.currency);
    setCart(
      o.items.map((line) => ({
        item: menuById.get(line.itemId) ?? {
          id: line.itemId,
          categoryId: '',
          sku: 'POS',
          name: line.itemName,
          description: null,
          priceMinorUGX: line.unitPriceMinor,
          priceMinorUSD: line.unitPriceMinor,
          isAvailable: true,
          prepMinutes: null,
          inventoryItemId: null,
        },
        quantity: line.quantity,
        notes: line.notes ?? '',
      })),
    );
    setTableOrRoom(o.tableOrRoom ?? '');
    setTableId(o.tableId);
    setCustomerName(o.customerName ?? '');
    setCustomerPhone(o.customerPhone ?? '');
    setServedByName(o.servedByName || me.name || 'Staff');
    setOrderNotes(o.notes ?? '');
    setCustomDiscount(o.discountMinor !== '0' ? toMajorStr(o.discountMinor, o.currency) : '');
    focusOutletOf(o);
  };

  // ── Mutations ──
  const lines = () => cart.map((l) => ({ itemId: l.item.id, quantity: l.quantity, notes: l.notes.trim() || undefined }));

  const placeOrder = useMutation({
    mutationFn: (settleNow: boolean) => {
      if (editingOpenOrder) {
        return patch<PosOrderDTO>(`/pos/orders/${editingOpenOrder.id}`, {
          tableOrRoom: tableOrRoom.trim() || null,
          tableId,
          customerName: customerName.trim() || null,
          customerPhone: customerPhone.trim() || null,
          servedByName: servedByName.trim() || me.name,
          discountMinor: discountMinor.toString(),
          notes: orderNotes.trim() || null,
          items: cart.map((l) => ({ itemId: l.item.id, quantity: l.quantity, notes: l.notes.trim() || null })),
        });
      }
      if (targetOpenOrder) {
        return post<PosOrderDTO>(`/pos/orders/${targetOpenOrder.id}/items`, {
          notes: orderNotes.trim() || undefined,
          items: lines(),
        });
      }
      if (!currentOutlet) throw new Error('Choose an outlet');
      return post<PosOrderDTO>('/pos/orders', {
        outletId: currentOutlet.id,
        reservationId: settleNow && paymentMethod === 'ROOM_FOLIO' && reservationId ? reservationId : undefined,
        customerName: customerName.trim() || undefined,
        customerPhone: customerPhone.trim() || undefined,
        tableOrRoom: tableOrRoom.trim() || undefined,
        tableId: tableId ?? undefined,
        servedByName: servedByName.trim() || me.name,
        paymentMethod: settleNow ? paymentMethod : 'CASH',
        currency,
        discountMinor: discountMinor.toString(),
        notes: orderNotes.trim() || undefined,
        settleNow,
        items: lines(),
      });
    },
    onSuccess: (order, settleNow) => {
      qc.invalidateQueries({ queryKey: ['pos', 'orders'] });
      qc.invalidateQueries({ queryKey: ['pos', 'outlets'] });
      qc.invalidateQueries({ queryKey: ['documents'] });
      qc.invalidateQueries({ queryKey: ['inventory'] });
      qc.invalidateQueries({ queryKey: ['admin-pulse'] });
      qc.invalidateQueries({ queryKey: ['pos', 'tables'] });
      const where = order.tableOrRoom || order.orderNumber;
      const printBill = { label: 'Print bill', onClick: () => printPosSlip(order.id, 'BILL') };
      if (editingOpenOrder) toast.success(`${where} bill updated`, { action: printBill });
      else if (targetOpenOrder) toast.success(`Round sent for ${where}`, { action: printBill });
      else if (!settleNow) toast.success(`${where} sent to the kitchen · waiting payment`, { action: printBill });
      else
        toast.success(`${where} paid · ${money(order.totalMinor, order.currency)}`, {
          action: order.documentId
            ? { label: 'Print receipt', onClick: () => printDocument(order.documentId!, '80MM') }
            : printBill,
        });
      resetTicket();
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Could not save the bill'),
  });

  const updateStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: PosOrderStatus }) =>
      patch<PosOrderDTO>(`/pos/orders/${id}/status`, { status }),
    onSuccess: (o) => {
      qc.invalidateQueries({ queryKey: ['pos', 'orders'] });
      qc.invalidateQueries({ queryKey: ['pos', 'outlets'] });
      qc.invalidateQueries({ queryKey: ['pos', 'tables'] });
      if (o.status === 'READY') toast.success(`${o.tableOrRoom || o.orderNumber} is ready to serve`);
      if (o.status === 'CANCELLED') toast.success(`${o.orderNumber} voided`);
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Could not update the ticket'),
  });

  const toggleAvailability = useMutation({
    mutationFn: ({ id, isAvailable }: { id: string; isAvailable: boolean }) => patch(`/pos/items/${id}`, { isAvailable }),
    onSuccess: (_r, v) => {
      qc.invalidateQueries({ queryKey: ['pos', 'outlets'] });
      toast.success(v.isAvailable ? 'Back on the menu' : 'Marked sold out');
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Could not update the item'),
  });

  const deleteMenuItem = useMutation({
    mutationFn: (id: string) => del(`/pos/items/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pos', 'outlets'] });
      setItemDialog(null);
      setDeletingMenuItem(null);
      toast.success('Menu item removed');
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Could not remove the item'),
  });

  const deleteCategory = useMutation({
    mutationFn: (id: string) => del(`/pos/categories/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pos', 'outlets'] });
      setDeletingCat(null);
      setSelectedCat('ALL');
      toast.success('Category removed');
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Could not remove the category'),
  });

  const voidBill = async (o: PosOrderDTO) => {
    const ok = await confirm({
      title: `Void ${o.orderNumber}?`,
      body: `${o.tableOrRoom || 'Counter'} · ${money(o.totalMinor, o.currency)}. The bill is cancelled and kept in the record; this cannot be undone.`,
      confirm: 'Void bill',
      danger: true,
    });
    if (ok) updateStatus.mutate({ id: o.id, status: 'CANCELLED' });
  };

  const bills = useMemo(() => {
    let list =
      billFilter === 'OPEN' ? openTabs : billFilter === 'PAID' ? paidToday : (orders ?? []);
    const q = orderSearch.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (o) =>
          o.orderNumber.toLowerCase().includes(q) ||
          (o.tableOrRoom ?? '').toLowerCase().includes(q) ||
          (o.customerName ?? '').toLowerCase().includes(q) ||
          (o.servedByName ?? '').toLowerCase().includes(q) ||
          o.items.some((i) => i.itemName.toLowerCase().includes(q)),
      );
    }
    return list;
  }, [orders, openTabs, paidToday, billFilter, orderSearch]);

  const modes: { id: View; label: string; icon: LucideIcon; count?: number; hot?: boolean }[] = [
    { id: 'SELL', label: 'Sell', icon: ShoppingBag, count: cart.length ? itemCount : undefined },
    { id: 'TABLES', label: 'Tables', icon: Armchair, count: (tables ?? []).filter((t) => t.openBills.length).length || undefined },
    { id: 'BILLS', label: 'Bills', icon: Receipt, count: openTabs.length || undefined },
    { id: 'KITCHEN', label: 'Kitchen', icon: ChefHat, count: kitchenQueue.length || undefined, hot: readyCount > 0 },
  ];

  return (
    <div className="fade-in pb-24 lg:pb-6">
      <PageHeader
        title="Point of Sale"
        description="Take orders, run the kitchen and close bills — all from one screen."
        actions={
          <Button variant="secondary" size="md" icon={<BarChart3 className="size-3.5" />} onClick={() => setShiftOpen(true)}>
            Shift report
          </Button>
        }
      />

      {/* Mode switch + live numbers */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div role="tablist" aria-label="POS mode" className="inline-flex rounded-xl border border-line bg-surface p-1 shadow-2xs">
          {modes.map((m) => (
            <button
              key={m.id}
              role="tab"
              type="button"
              aria-selected={view === m.id}
              onClick={() => setView(m.id)}
              className={cn(
                'relative inline-flex h-9 items-center gap-2 rounded-lg px-4 text-[13px] font-semibold transition',
                view === m.id ? 'bg-fg text-bg shadow-xs' : 'text-fg-muted hover:text-fg',
              )}
            >
              <m.icon className="size-4" />
              {m.label}
              {m.count !== undefined && (
                <span
                  className={cn(
                    'rounded-full px-1.5 text-[10.5px] font-bold tabular',
                    view === m.id ? 'bg-bg/20' : 'bg-surface-2',
                  )}
                >
                  {m.count}
                </span>
              )}
              {m.hot && <span className="absolute right-1 top-1 size-2 animate-pulse rounded-full bg-emerald-500" />}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2 text-[12px]">
          <StatChip label="Paid today" value={money(paidTodayUgx, 'UGX')} dot="bg-emerald-500" onClick={() => { setView('BILLS'); setBillFilter('PAID'); }} />
          <StatChip
            label={`Waiting · ${openTabs.length}`}
            value={money(waitingUgx, 'UGX')}
            dot="bg-amber-500"
            onClick={() => { setView('BILLS'); setBillFilter('OPEN'); }}
          />
          {readyCount > 0 && (
            <StatChip label="Ready to serve" value={String(readyCount)} dot="bg-emerald-500 animate-pulse" onClick={() => setView('KITCHEN')} />
          )}
        </div>
      </div>

      {isLoading ? (
        <Skeleton className="h-96" />
      ) : view === 'TABLES' ? (
        <FloorView
          tables={tables ?? []}
          openTabs={openTabs}
          now={now}
          canManage={canManageTables}
          onNewOrder={(t) => {
            resetTicket();
            setTableId(t.id);
            setTableOrRoom(t.name);
            setView('SELL');
            toast.info(`New order for ${t.name} — tap items to add them`);
          }}
          onCharge={setSettleOrder}
          onRound={startRound}
          onEdit={editBill}
        />
      ) : view === 'KITCHEN' ? (
        ordersLoading ? (
          <Skeleton className="h-80" />
        ) : (
          <KitchenBoard
            orders={kitchenQueue}
            outlets={outlets ?? []}
            now={now}
            targetOf={prepTarget}
            busyId={updateStatus.isPending ? (updateStatus.variables?.id ?? null) : null}
            onAdvance={(id, status) => updateStatus.mutate({ id, status })}
          />
        )
      ) : view === 'BILLS' ? (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="inline-flex rounded-lg border border-line bg-surface p-0.5 text-[12px] font-semibold">
              {(
                [
                  ['OPEN', `Waiting payment (${openTabs.length})`],
                  ['PAID', `Paid today (${paidToday.length})`],
                  ['ALL', 'All recent'],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setBillFilter(id)}
                  className={cn(
                    'rounded-md px-3 py-1.5 transition',
                    billFilter === id ? 'bg-fg text-bg' : 'text-fg-muted hover:text-fg',
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <label className="relative w-60 max-w-[60vw]">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-fg-subtle" />
                <input
                  className="input !min-h-8 !py-1 pl-8 text-xs"
                  placeholder="Table, guest, waiter, item…"
                  value={orderSearch}
                  onChange={(e) => setOrderSearch(e.target.value)}
                />
              </label>
              <div className="inline-flex rounded-lg border border-line bg-surface-2 p-0.5">
                <IconToggle active={billLayout === 'CARDS'} onClick={() => setBillLayout('CARDS')} icon={LayoutGrid} label="Cards" />
                <IconToggle active={billLayout === 'TABLE'} onClick={() => setBillLayout('TABLE')} icon={ListFilter} label="Register" />
              </div>
            </div>
          </div>

          {ordersLoading ? (
            <Skeleton className="h-64" />
          ) : !bills.length ? (
            <div className="card">
              <Empty
                icon={<Receipt className="size-5" />}
                title={billFilter === 'OPEN' ? 'No bills waiting — every table is settled' : 'No bills match'}
                body={billFilter === 'OPEN' ? 'Held bills appear here until the guest pays.' : undefined}
                action={
                  <Button variant="primary" size="sm" icon={<Plus className="size-3.5" />} onClick={() => setView('SELL')}>
                    New order
                  </Button>
                }
              />
            </div>
          ) : billLayout === 'CARDS' ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
              {bills.map((o) => (
                <BillCard
                  key={o.id}
                  order={o}
                  now={now}
                  onCharge={() => setSettleOrder(o)}
                  onRound={() => startRound(o)}
                  onEdit={() => editBill(o)}
                  onVoid={() => voidBill(o)}
                />
              ))}
            </div>
          ) : (
            <div className="card overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[820px] text-left text-[12.5px]">
                  <thead className="border-b border-line bg-surface-2/40 text-[11px] font-semibold uppercase tracking-wider text-fg-subtle">
                    <tr>
                      <th className="px-3.5 py-2.5">Bill</th>
                      <th className="px-3.5 py-2.5">Table / guest</th>
                      <th className="px-3.5 py-2.5">Items</th>
                      <th className="px-3.5 py-2.5">State</th>
                      <th className="px-3.5 py-2.5 text-right">Total</th>
                      <th className="px-3.5 py-2.5 text-right" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {bills.map((o) => {
                      const open = !o.isSettled && o.status !== 'CANCELLED';
                      return (
                        <tr key={o.id} className="align-middle hover:bg-surface-2/30">
                          <td className="px-3.5 py-2.5 whitespace-nowrap">
                            <p className="font-mono text-[12px] font-bold">{o.orderNumber}</p>
                            <p className="text-[11px] text-fg-subtle">
                              {o.outletName} · {dateTime(o.createdAt)}
                            </p>
                          </td>
                          <td className="px-3.5 py-2.5 whitespace-nowrap">
                            <p className="font-medium">{o.tableOrRoom || 'Counter'}</p>
                            <p className="text-[11px] text-fg-subtle">
                              {o.customerName || 'Walk-in'} · {o.servedByName || 'Staff'}
                            </p>
                          </td>
                          <td className="max-w-xs px-3.5 py-2.5 text-[12px] text-fg-muted">
                            <span className="line-clamp-2">
                              {o.items.map((i) => `${i.quantity}× ${i.itemName}`).join(', ')}
                            </span>
                          </td>
                          <td className="px-3.5 py-2.5 whitespace-nowrap">
                            {open ? (
                              <AgeBadge iso={o.createdAt} now={now} target={45} />
                            ) : (
                              <Pill tone={o.status === 'CANCELLED' ? 'red' : 'green'} dot>
                                {o.status === 'CANCELLED' ? 'Void' : PAYMENT_LABELS[o.paymentMethod]}
                              </Pill>
                            )}
                          </td>
                          <td className="px-3.5 py-2.5 text-right font-mono font-bold tabular whitespace-nowrap">
                            {money(o.totalMinor, o.currency)}
                          </td>
                          <td className="px-3.5 py-2.5 text-right whitespace-nowrap">
                            <div className="inline-flex items-center gap-1">
                              {open && (
                                <>
                                  <Button size="sm" variant="ghost" icon={<Edit3 className="size-3" />} onClick={() => editBill(o)}>
                                    Edit
                                  </Button>
                                  <Button size="sm" variant="primary" onClick={() => setSettleOrder(o)}>
                                    Charge
                                  </Button>
                                </>
                              )}
                              {o.documentId ? (
                                <Button size="sm" variant="secondary" icon={<Receipt className="size-3" />} onClick={() => printDocument(o.documentId!, '80MM')}>
                                  Receipt
                                </Button>
                              ) : (
                                <Button size="sm" variant="ghost" icon={<Printer className="size-3" />} onClick={() => printPosSlip(o.id, 'BILL')}>
                                  Bill
                                </Button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_25rem]">
          {/* ── Menu ── */}
          <div className="min-w-0 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="-mx-1 flex min-w-0 gap-1.5 overflow-x-auto px-1 pb-0.5">
                {(outlets ?? []).map((o) => {
                  const Icon = OUTLET_ICON[o.type] ?? Coffee;
                  const active = currentOutlet?.id === o.id;
                  return (
                    <button
                      key={o.id}
                      type="button"
                      disabled={ticketLocked && !active}
                      onClick={() => {
                        setOutletCode(o.code);
                        setSelectedCat('ALL');
                      }}
                      className={cn(
                        'inline-flex h-10 shrink-0 items-center gap-2 whitespace-nowrap rounded-xl border px-3.5 text-[13px] font-semibold transition disabled:opacity-40',
                        active
                          ? 'border-accent bg-accent text-accent-fg shadow-xs'
                          : 'border-line bg-surface text-fg-muted hover:border-line-strong hover:text-fg',
                      )}
                    >
                      <Icon className="size-4" />
                      {o.name}
                    </button>
                  );
                })}
              </div>
              <button
                type="button"
                onClick={() => setManage((v) => !v)}
                aria-pressed={manage}
                className={cn(
                  'inline-flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border px-3 text-[12px] font-semibold transition',
                  manage ? 'border-fg bg-fg text-bg' : 'border-line bg-surface text-fg-muted hover:text-fg',
                )}
              >
                <Settings2 className="size-3.5" />
                <span className="hidden sm:inline">{manage ? 'Done editing' : 'Manage menu'}</span>
                <span className="sm:hidden">{manage ? 'Done' : 'Menu'}</span>
              </button>
            </div>

            {manage && (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-dashed border-accent/50 bg-accent/5 px-3 py-2 text-[12px]">
                <span className="text-fg-muted">
                  <strong className="text-fg">Editing {currentOutlet?.name}.</strong> Tap an item to change it, or mark it sold out.
                </span>
                <div className="flex gap-1.5">
                  <Button size="sm" variant="secondary" icon={<FolderPlus className="size-3.5" />} onClick={() => setCatOpen(true)}>
                    Category
                  </Button>
                  <Button size="sm" variant="dark" icon={<Plus className="size-3.5" />} onClick={() => setItemDialog({ item: null })}>
                    Item
                  </Button>
                </div>
              </div>
            )}

            <div className="card sticky top-14 z-10 space-y-2 p-2.5">
              <label className="relative block">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-subtle" />
                <input
                  ref={searchRef}
                  className="input !min-h-10 pl-9 pr-12 text-[13px]"
                  placeholder="Search the menu or scan a SKU…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') {
                      setSearch('');
                      e.currentTarget.blur();
                    }
                    if (e.key === 'Enter' && visibleItems.length >= 1 && !manage) {
                      e.preventDefault();
                      addToCart(visibleItems[0]!);
                      setSearch('');
                    }
                  }}
                />
                <span className="pointer-events-none absolute right-3 top-1/2 hidden -translate-y-1/2 sm:block">
                  <Kbd>/</Kbd>
                </span>
              </label>
              <div className="-mx-0.5 flex gap-1 overflow-x-auto px-0.5 pb-0.5">
                <CatChip active={selectedCat === 'ALL'} onClick={() => setSelectedCat('ALL')}>
                  All
                </CatChip>
                {categories.map((c, ci) => (
                  <CatChip key={c.id} active={selectedCat === c.id} onClick={() => setSelectedCat(c.id)} dot={CATEGORY_DOTS[ci % CATEGORY_DOTS.length]}>
                    {c.name}
                    <span className="opacity-60">{c.items.length}</span>
                    {manage && isOwner && (
                      <span
                        role="button"
                        tabIndex={0}
                        aria-label={`Delete ${c.name}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeletingCat({ id: c.id, name: c.name });
                        }}
                        className="-mr-1 rounded p-0.5 hover:bg-danger/15 hover:text-danger"
                      >
                        <X className="size-3" />
                      </span>
                    )}
                  </CatChip>
                ))}
              </div>
            </div>

            {visibleItems.length === 0 ? (
              <div className="card">
                <Empty
                  icon={<Search className="size-5" />}
                  title={search ? `Nothing matches “${search}”` : 'No items in this section yet'}
                  action={
                    manage ? (
                      <Button size="sm" variant="primary" icon={<Plus className="size-3.5" />} onClick={() => setItemDialog({ item: null })}>
                        Add item
                      </Button>
                    ) : undefined
                  }
                />
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
                {visibleItems.map((it) => {
                  const qty = cart.find((c) => c.item.id === it.id)?.quantity ?? 0;
                  const price = unitPrice(it, currency);
                  const blocked = !it.isAvailable || price === null;
                  const lowStock = it.stockOnHand != null && it.stockOnHand <= 5;
                  return (
                    <div key={it.id} className="relative">
                      <button
                        type="button"
                        disabled={blocked && !manage}
                        onClick={() => (manage ? setItemDialog({ item: it }) : addToCart(it))}
                        className={cn(
                          'group relative flex h-full min-h-[108px] w-full flex-col justify-between overflow-hidden rounded-xl border bg-surface p-3 pl-4 text-left shadow-2xs transition active:scale-[0.97]',
                          'hover:border-line-strong hover:shadow-md disabled:cursor-not-allowed',
                          qty > 0 ? 'border-accent ring-1 ring-accent' : 'border-line',
                          blocked && 'opacity-55',
                          manage && 'border-dashed',
                        )}
                      >
                        <span className={cn('absolute inset-y-0 left-0 w-1', it.dot)} />
                        <span>
                          <span className="line-clamp-2 text-[13px] font-semibold leading-snug">{it.name}</span>
                          {it.description && (
                            <span className="mt-0.5 line-clamp-1 text-[11px] text-fg-muted">{it.description}</span>
                          )}
                        </span>
                        <span className="mt-2 flex flex-wrap items-end justify-between gap-x-2 gap-y-0.5">
                          <span className="font-mono text-[13px] font-bold tabular">
                            {price === null ? <span className="text-[11px] font-semibold text-fg-subtle">No {currency} price</span> : money(price, currency)}
                          </span>
                          <span className="flex items-center gap-1.5 whitespace-nowrap text-[10.5px] text-fg-subtle">
                            {it.prepMinutes ? (
                              <span className="inline-flex items-center gap-0.5">
                                <Clock className="size-2.5" />
                                {it.prepMinutes}m
                              </span>
                            ) : null}
                            {it.stockOnHand != null && (
                              <span className={cn('rounded px-1 font-mono font-semibold', lowStock && 'bg-amber-500/15 text-warning')}>
                                {it.stockOnHand} left
                              </span>
                            )}
                          </span>
                        </span>
                        {!it.isAvailable && (
                          <span className="absolute right-2 top-2 rounded bg-rose-600 px-1.5 py-0.5 text-[9.5px] font-extrabold uppercase tracking-wide text-white">
                            Sold out
                          </span>
                        )}
                        {manage && (
                          <span className="absolute right-2 top-2 hidden rounded bg-fg p-1 text-bg group-hover:block">
                            <Pencil className="size-3" />
                          </span>
                        )}
                      </button>
                      {qty > 0 && !manage && (
                        <span
                          key={qty}
                          className="fade-in pointer-events-none absolute -right-1.5 -top-1.5 grid size-6 place-items-center rounded-full bg-accent font-mono text-[11px] font-bold text-white shadow-md"
                        >
                          {qty}
                        </span>
                      )}
                      {manage && (
                        <button
                          type="button"
                          onClick={() => toggleAvailability.mutate({ id: it.id, isAvailable: !it.isAvailable })}
                          className={cn(
                            'absolute bottom-2 right-2 rounded-md border px-1.5 py-0.5 text-[10px] font-bold transition',
                            it.isAvailable
                              ? 'border-line bg-surface text-fg-muted hover:border-danger hover:text-danger'
                              : 'border-emerald-500/40 bg-emerald-500/10 text-success',
                          )}
                        >
                          {it.isAvailable ? 'Sold out' : 'Restore'}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* ── Ticket ── */}
          <div ref={ticketRef} className="scroll-mt-16 lg:sticky lg:top-16 lg:self-start">
            <section className="card flex flex-col overflow-hidden lg:max-h-[calc(100dvh-5rem)]">
              <header className="flex items-center justify-between gap-2 border-b border-line px-4 py-2.5">
                <div className="min-w-0">
                  <h2 className="truncate text-[13.5px] font-bold">
                    {editingOpenOrder
                      ? `Editing ${editingOpenOrder.tableOrRoom || editingOpenOrder.orderNumber}`
                      : targetOpenOrder
                        ? `New round · ${targetOpenOrder.tableOrRoom || targetOpenOrder.orderNumber}`
                        : 'New bill'}
                  </h2>
                  <p className="text-[11px] text-fg-subtle">
                    {editingOpenOrder?.orderNumber ?? targetOpenOrder?.orderNumber ?? currentOutlet?.name}
                    {targetOpenOrder && ` · on bill ${money(targetOpenOrder.totalMinor, targetOpenOrder.currency)}`}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <div className="inline-flex rounded-md border border-line bg-surface-2 p-0.5 text-[11px] font-bold">
                    {(['UGX', 'USD'] as const).map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => switchCurrency(c)}
                        className={cn('rounded px-1.5 py-0.5', currency === c ? 'bg-surface text-fg shadow-2xs' : 'text-fg-muted')}
                      >
                        {c}
                      </button>
                    ))}
                  </div>
                  {(cart.length > 0 || ticketLocked) && (
                    <button
                      type="button"
                      onClick={resetTicket}
                      className="rounded-md p-1 text-fg-subtle hover:bg-danger/10 hover:text-danger"
                      title={ticketLocked ? 'Cancel and start a new bill' : 'Clear ticket'}
                      aria-label="Clear ticket"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  )}
                </div>
              </header>

              <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3">
                {/* Open bills: one tap to add a round */}
                {!ticketLocked && openTabs.length > 0 && (
                  <div>
                    <p className="mb-1.5 text-[11px] font-semibold text-fg-muted">Add to an open bill</p>
                    <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
                      {openTabs.map((o) => (
                        <div key={o.id} className="flex shrink-0 items-stretch overflow-hidden rounded-lg border border-amber-500/40 bg-amber-500/8">
                          <button type="button" onClick={() => startRound(o)} className="px-2.5 py-1.5 text-left hover:bg-amber-500/15">
                            <span className="block text-[12px] font-bold leading-tight">{o.tableOrRoom || o.orderNumber}</span>
                            <span className="block font-mono text-[10.5px] text-fg-muted tabular">{money(o.totalMinor, o.currency)}</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => editBill(o)}
                            className="border-l border-amber-500/30 px-1.5 text-fg-subtle hover:bg-amber-500/15 hover:text-fg"
                            title="Edit this bill"
                            aria-label={`Edit ${o.orderNumber}`}
                          >
                            <Pencil className="size-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Where & who */}
                {!targetOpenOrder && (
                  <div className="space-y-2">
                    <TableChips
                      tables={tables ?? []}
                      value={tableId}
                      onPick={(t) => {
                        setTableId(t.id);
                        setTableOrRoom(t.name);
                      }}
                    />
                    {pickedTableBill && !editingOpenOrder && (
                      <div className="fade-in flex items-center justify-between gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-2.5 py-1.5 text-[11.5px]">
                        <span className="min-w-0 truncate">
                          <strong>{pickedTable!.name}</strong> already has a bill · {money(pickedTableBill.totalMinor, pickedTableBill.currency)}
                        </span>
                        <button type="button" onClick={() => startRound(pickedTableBill)} className="shrink-0 font-bold text-accent hover:underline">
                          Add to it
                        </button>
                      </div>
                    )}
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        className="input !min-h-8 !py-1 text-xs"
                        aria-label="Table or spot"
                        placeholder="Table / spot"
                        value={tableOrRoom}
                        onChange={(e) => {
                          setTableOrRoom(e.target.value);
                          const match = (tables ?? []).find((t) => t.name.toLowerCase() === e.target.value.trim().toLowerCase());
                          setTableId(match?.id ?? null);
                        }}
                      />
                      <input className="input !min-h-8 !py-1 text-xs" aria-label="Guest name" placeholder="Guest name" value={customerName} onChange={(e) => setCustomerName(e.target.value)} />
                    </div>
                    <label className="flex items-center gap-2 text-[11px] text-fg-muted">
                      <span className="shrink-0">Served by</span>
                      <StaffPicker
                        ariaLabel="Served by"
                        staff={staff ?? []}
                        value={servedByName}
                        onChange={(n) => setServedByName(n)}
                        className="min-w-0 flex-1"
                      />
                    </label>
                  </div>
                )}

                {/* Lines */}
                {!cart.length ? (
                  <div className="grid place-items-center rounded-xl border border-dashed border-line px-4 py-8 text-center">
                    <div className="mb-2 grid size-10 place-items-center rounded-full bg-accent/10 text-accent">
                      <ShoppingBag className="size-5" />
                    </div>
                    <p className="text-[13px] font-semibold">Tap items to start</p>
                    <p className="mt-0.5 max-w-[16rem] text-[11.5px] text-fg-muted">
                      Hold the bill to send it to the kitchen, or charge straight away. Press <Kbd>/</Kbd> to search.
                    </p>
                  </div>
                ) : (
                  <ul className="divide-y divide-line">
                    {cart.map((l) => {
                      const open = noteLineId === l.item.id;
                      return (
                        <li key={l.item.id} className="py-2">
                          <div className="flex items-center gap-2">
                            <button type="button" onClick={() => setNoteLineId(open ? null : l.item.id)} className="min-w-0 flex-1 text-left">
                              <span className="block truncate text-[12.5px] font-semibold hover:text-accent">{l.item.name}</span>
                              <span className="block truncate text-[11px] text-fg-muted">
                                <span className="font-mono">{money(lineUnit(l), currency)}</span>
                                {l.notes ? <span className="text-warning"> · {l.notes}</span> : <span className="text-fg-subtle"> · + note</span>}
                              </span>
                            </button>
                            <div className="flex items-center rounded-lg border border-line">
                              <button type="button" onClick={() => updateQty(l.item.id, -1)} className="grid size-7 place-items-center hover:bg-surface-2" aria-label="One less">
                                {l.quantity === 1 ? <Trash2 className="size-3 text-danger" /> : <Minus className="size-3" />}
                              </button>
                              <span className="w-6 text-center font-mono text-[12px] font-bold tabular">{l.quantity}</span>
                              <button type="button" onClick={() => updateQty(l.item.id, 1)} className="grid size-7 place-items-center hover:bg-surface-2" aria-label="One more">
                                <Plus className="size-3" />
                              </button>
                            </div>
                            <span className="w-20 text-right font-mono text-[12px] font-semibold tabular">
                              {money(lineUnit(l) * BigInt(l.quantity), currency)}
                            </span>
                          </div>
                          {open && (
                            <div className="fade-in mt-2 rounded-lg border border-line bg-surface-2/60 p-2">
                              <div className="mb-1.5 flex flex-wrap gap-1">
                                {QUICK_MODIFIERS.map((mod) => (
                                  <button
                                    key={mod}
                                    type="button"
                                    onClick={() => toggleModifier(l.item.id, mod)}
                                    className={cn(
                                      'rounded px-1.5 py-0.5 text-[10.5px] font-medium transition',
                                      l.notes.includes(mod) ? 'bg-accent text-white' : 'bg-surface text-fg-muted hover:text-fg',
                                    )}
                                  >
                                    {mod}
                                  </button>
                                ))}
                              </div>
                              <input
                                autoFocus
                                className="input !min-h-7 !py-1 text-[11.5px]"
                                placeholder="Instruction for the kitchen…"
                                value={l.notes}
                                onChange={(e) => setLineNote(l.item.id, e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && setNoteLineId(null)}
                              />
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}

                {cart.length > 0 && (
                  <>
                    {!targetOpenOrder && (
                      <div className="flex flex-wrap items-center gap-1 text-[11px]">
                        <span className="mr-1 font-semibold text-fg-muted">Discount</span>
                        {DISCOUNT_STEPS.map((pct) => (
                          <button
                            key={pct}
                            type="button"
                            onClick={() => {
                              setDiscountPercent(pct);
                              setCustomDiscount('');
                            }}
                            className={cn(
                              'rounded px-1.5 py-0.5 font-semibold',
                              discountPercent === pct && !customDiscount ? 'bg-fg text-bg' : 'bg-surface-2 text-fg-muted hover:text-fg',
                            )}
                          >
                            {pct === 0 ? 'None' : pct === 100 ? 'Comp' : `${pct}%`}
                          </button>
                        ))}
                        <input
                          inputMode="decimal"
                          aria-label={`Discount amount in ${currency}`}
                          placeholder="Amount"
                          className={cn('input !min-h-6 w-20 !py-0 font-mono text-[11px]', customDiscount && customDiscountMinor === null && '!border-danger')}
                          value={customDiscount}
                          onChange={(e) => setCustomDiscount(e.target.value)}
                        />
                      </div>
                    )}
                    <input
                      className="input !min-h-8 !py-1 text-xs"
                      placeholder="Order note — allergies, timing…"
                      value={orderNotes}
                      onChange={(e) => setOrderNotes(e.target.value)}
                    />
                  </>
                )}
              </div>

              {/* Totals & actions */}
              {cart.length > 0 && (
                <footer className="space-y-2.5 border-t border-line bg-surface-2/40 px-4 py-3">
                  <div>
                    {discountMinor > 0n && (
                      <div className="flex justify-between text-[11.5px] text-fg-muted">
                        <span>
                          {itemCount} items · {money(subtotal, currency)}
                        </span>
                        <span className="font-mono text-success">−{money(discountMinor, currency)}</span>
                      </div>
                    )}
                    <div className="flex items-baseline justify-between">
                      <span className="text-[12px] font-semibold text-fg-muted">
                        {targetOpenOrder ? 'This round' : discountMinor > 0n ? 'Total' : `Total · ${itemCount} item${itemCount === 1 ? '' : 's'}`}
                      </span>
                      <span className="font-display text-2xl font-extrabold tabular">{money(total, currency)}</span>
                    </div>
                  </div>

                  {editingOpenOrder ? (
                    <div className="grid grid-cols-[1fr_auto] gap-2">
                      <Button variant="primary" size="lg" loading={placeOrder.isPending} onClick={() => placeOrder.mutate(false)}>
                        Save changes
                      </Button>
                      <Button variant="secondary" size="lg" icon={<Printer className="size-4" />} onClick={() => printPosSlip(editingOpenOrder.id, 'BILL')} aria-label="Print bill" />
                    </div>
                  ) : targetOpenOrder ? (
                    <Button variant="primary" size="lg" className="w-full" icon={<Flame className="size-4" />} loading={placeOrder.isPending} onClick={() => placeOrder.mutate(false)}>
                      Send round
                    </Button>
                  ) : !checkout ? (
                    <div className="grid grid-cols-2 gap-2">
                      <Button variant="secondary" size="lg" icon={<Flame className="size-4" />} loading={placeOrder.isPending && placeOrder.variables === false} onClick={() => placeOrder.mutate(false)}>
                        Hold · pay later
                      </Button>
                      <Button variant="primary" size="lg" icon={<CreditCard className="size-4" />} onClick={() => setCheckout(true)}>
                        Charge
                      </Button>
                    </div>
                  ) : (
                    <div className="fade-in space-y-2.5">
                      <PayMethodPicker value={paymentMethod} onChange={setPaymentMethod} />
                      {paymentMethod === 'CASH' && (
                        <CashPad totalMinor={total} currency={currency} tendered={cashTendered} onTendered={setCashTendered} />
                      )}
                      {paymentMethod === 'ROOM_FOLIO' && (
                        <SelectInput
                          aria-label="Charge to room"
                          value={reservationId}
                          onChange={(e) => {
                            setReservationId(e.target.value);
                            const g = (inHouseGuests ?? []).find((r) => r.reservationId === e.target.value);
                            if (g) {
                              setCustomerName(g.guestName);
                              if (g.roomNumber) setTableOrRoom(`Room ${g.roomNumber}`);
                            }
                          }}
                        >
                          <option value="">— Choose an in-house guest —</option>
                          {(inHouseGuests ?? []).map((r) => (
                            <option key={r.reservationId} value={r.reservationId}>
                              {r.roomNumber ? `Room ${r.roomNumber} · ` : ''}
                              {r.guestName} ({r.code})
                            </option>
                          ))}
                        </SelectInput>
                      )}
                      <div className="grid grid-cols-[auto_1fr] gap-2">
                        <Button variant="ghost" size="lg" icon={<ArrowLeft className="size-4" />} onClick={() => setCheckout(false)} aria-label="Back" />
                        <Button
                          variant="primary"
                          size="lg"
                          loading={placeOrder.isPending}
                          disabled={shortPaid || (paymentMethod === 'ROOM_FOLIO' && !reservationId)}
                          onClick={() => placeOrder.mutate(true)}
                        >
                          {paymentMethod === 'ROOM_FOLIO'
                            ? `Post ${money(total, currency)} to room`
                            : `Confirm ${PAYMENT_LABELS[paymentMethod].toLowerCase()} · ${money(total, currency)}`}
                        </Button>
                      </div>
                    </div>
                  )}
                </footer>
              )}
            </section>
          </div>

          {/* Phone & tablet: keep the bill one tap away */}
          {cart.length > 0 && (
            <button
              type="button"
              onClick={() => ticketRef.current?.scrollIntoView({ behavior: 'smooth' })}
              className="fade-in fixed inset-x-3 bottom-3 z-30 flex items-center justify-between rounded-2xl bg-fg px-4 py-3 text-bg shadow-[var(--shadow-lift)] lg:hidden"
            >
              <span className="flex items-center gap-2 text-[13px] font-semibold">
                <span className="grid size-6 place-items-center rounded-full bg-accent text-[11px] font-bold text-white">{itemCount}</span>
                View bill
              </span>
              <span className="font-display text-base font-extrabold tabular">{money(total, currency)}</span>
            </button>
          )}
        </div>
      )}

      <SettleDialog order={settleOrder} inHouseGuests={inHouseGuests ?? []} onClose={() => setSettleOrder(null)} />

      <MenuItemDialog
        open={!!itemDialog}
        item={itemDialog?.item ?? null}
        outlet={currentOutlet}
        defaultCategoryId={selectedCat !== 'ALL' ? selectedCat : ''}
        stockItems={stockItems ?? []}
        canDelete={isOwner}
        onClose={() => setItemDialog(null)}
        onDelete={setDeletingMenuItem}
      />
      <CategoryDialog open={catOpen} outlet={currentOutlet} onClose={() => setCatOpen(false)} />

      <ShiftDialog
        open={shiftOpen}
        onClose={() => setShiftOpen(false)}
        paidToday={paidToday}
        voidedToday={voidedToday}
        openTabs={openTabs}
        staff={staff ?? []}
        defaultFrom={me.name || ''}
      />

      {deletingMenuItem && (
        <DeleteConfirmDialog
          open
          onClose={() => setDeletingMenuItem(null)}
          onConfirm={() => deleteMenuItem.mutate(deletingMenuItem.id)}
          title={`Delete ${deletingMenuItem.name}?`}
          itemName={`${deletingMenuItem.name} (${deletingMenuItem.sku})`}
          itemType="POS menu item"
          warning="It disappears from every POS screen. If it was ever sold it is disabled instead, so past sales reports stay intact."
          requireMatch="DELETE"
          loading={deleteMenuItem.isPending}
        />
      )}
      {deletingCat && (
        <DeleteConfirmDialog
          open
          onClose={() => setDeletingCat(null)}
          onConfirm={() => deleteCategory.mutate(deletingCat.id)}
          title={`Delete ${deletingCat.name}?`}
          itemName={deletingCat.name}
          itemType="POS menu category"
          warning="Only empty categories can be deleted — move or remove its items first."
          requireMatch="DELETE"
          loading={deleteCategory.isPending}
        />
      )}
    </div>
  );
}

function StatChip({ label, value, dot, onClick }: { label: string; value: string; dot: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-2 rounded-xl border border-line bg-surface px-3 py-1.5 shadow-2xs transition hover:border-line-strong"
    >
      <span className={cn('size-2 rounded-full', dot)} />
      <span className="text-fg-muted">{label}</span>
      <span className="font-mono font-bold tabular">{value}</span>
    </button>
  );
}

function CatChip({ active, onClick, dot, children }: { active: boolean; onClick: () => void; dot?: string; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-3 text-[12px] font-semibold transition',
        active ? 'bg-fg text-bg' : 'bg-surface-2 text-fg-muted hover:text-fg',
      )}
    >
      {dot && <span className={cn('size-2 rounded-full', dot)} />}
      {children}
    </button>
  );
}

function IconToggle({ active, onClick, icon: Icon, label }: { active: boolean; onClick: () => void; icon: LucideIcon; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn('inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-semibold', active ? 'bg-surface text-fg shadow-xs' : 'text-fg-muted')}
    >
      <Icon className="size-3.5" /> {label}
    </button>
  );
}
