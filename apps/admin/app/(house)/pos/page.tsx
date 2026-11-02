'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Ban, BarChart3, CheckCircle2, ChefHat, Clock, CreditCard, Edit3, FileText, Flame,
  FolderPlus, LayoutGrid, ListFilter, Minus, Pencil, Plus, PlusCircle, Printer,
  Receipt, Search, ShoppingBag, Sparkles, Tag, Trash2, UtensilsCrossed, Wallet,
} from 'lucide-react';
import type {
  CurrencyCode,
  PosInHouseGuestDTO,
  PosItemDTO,
  PosOrderDTO,
  PosOrderStatus,
  PosOutletDTO,
  PosPaymentMethod,
} from '@reberon/contracts';
import { ApiError, del, get, patch, post } from '@/lib/api';
import { useMe } from '@/lib/providers';
import { money } from '@/lib/money';
import { ago, dateTime } from '@/lib/format';
import { cn } from '@/lib/cn';
import { Button } from '@/components/ui/button';
import { Empty, PageHeader, Pill, Section, Skeleton, Tabs } from '@/components/ui/bits';
import { Dialog } from '@/components/ui/dialog';
import { DeleteConfirmDialog } from '@/components/ui/delete-dialog';
import { SelectInput, TextInput } from '@/components/ui/field';
import { printDocument } from '@/components/documents/documents-panel';

interface CartLine {
  item: PosItemDTO;
  quantity: number;
  notes: string;
}

interface PosStockItem {
  id: string;
  sku: string;
  name: string;
  category: string;
  department: string;
  onHand: number;
  unit: string;
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

const QUICK_SPOTS = [
  'Counter',
  'Table 1',
  'Table 2',
  'Table 3',
  'Table 4',
  'Table 5',
  'Table 6',
  'Terrace 1',
  'Terrace 2',
  'Bar Lounge',
  'VIP Lounge',
  'Room Service',
];

const QUICK_MODIFIERS = [
  'No Sugar',
  'Extra Hot',
  'Less Ice',
  'Chilled',
  'Warm',
  'Well Done',
  'Medium',
  'Mild Spice',
  'Spicy',
  'Takeaway',
];

function printPosSlip(orderId: string, kind: 'KOT' | 'BILL') {
  const url = `/v1/admin/pos/orders/${orderId}/print?kind=${kind}&autoprint=1`;
  window.open(url, '_blank', 'noopener,noreferrer,width=420,height=720');
}

export default function PosPage() {
  const qc = useQueryClient();
  const me = useMe();
  const isOwner = me.role === 'OWNER';
  const [activeTab, setActiveTab] = useState<string>('KITCHEN');
  const [selectedCat, setSelectedCat] = useState<string>('ALL');
  const [search, setSearch] = useState('');
  const [currency, setCurrency] = useState<CurrencyCode>('UGX');

  // Cart & Ticket State
  const [cart, setCart] = useState<CartLine[]>([]);
  const [expandedNoteItemId, setExpandedNoteItemId] = useState<string | null>(null);
  const [targetOpenOrder, setTargetOpenOrder] = useState<PosOrderDTO | null>(null);
  const [editingOpenOrder, setEditingOpenOrder] = useState<PosOrderDTO | null>(null);
  const [servedByName, setServedByName] = useState<string>(me.name || 'Staff');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [tableOrRoom, setTableOrRoom] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PosPaymentMethod>('CASH');
  const [reservationId, setReservationId] = useState('');
  const [orderNotes, setOrderNotes] = useState('');
  const [discountPercent, setDiscountPercent] = useState<number>(0);
  const [customDiscountMinor, setCustomDiscountMinor] = useState<string>('');
  const [cashTendered, setCashTendered] = useState<string>('');

  // KDS & Queue Filters: 'OPEN_TABS' (Waiting Payment) | 'PAID' (Confirmed Receipts) | 'ACTIVE' (Kitchen/Bar Prep) | 'ALL'
  const [kdsFilter, setKdsFilter] = useState<'OPEN_TABS' | 'PAID' | 'ACTIVE' | 'ALL'>('OPEN_TABS');
  const [kdsViewMode, setKdsViewMode] = useState<'CARDS' | 'TABLE'>('CARDS');
  const [orderSearch, setOrderSearch] = useState('');

  // Modals
  const [settleModalOrder, setSettleModalOrder] = useState<PosOrderDTO | null>(null);
  const [settleMethod, setSettleMethod] = useState<PosPaymentMethod>('CASH');
  const [settleResId, setSettleResId] = useState('');
  const [settleDiscount, setSettleDiscount] = useState('0');
  const [settleTendered, setSettleTendered] = useState('');
  const [settleRef, setSettleRef] = useState('');

  // Shift Handover State
  const [handoverFrom, setHandoverFrom] = useState<string>(me.name || '');
  const [handoverTo, setHandoverTo] = useState<string>('');
  const [handoverNotes, setHandoverNotes] = useState<string>('');

  const [menuModalOpen, setMenuModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<PosItemDTO | null>(null);
  const [itemForm, setItemForm] = useState({
    categoryId: '',
    sku: '',
    name: '',
    description: '',
    priceMinorUGX: '',
    priceMinorUSD: '',
    prepMinutes: '10',
    inventoryItemId: '',
    isAvailable: true,
  });
  const [catModalOpen, setCatModalOpen] = useState(false);
  const [catForm, setCatForm] = useState({ name: '', sortOrder: '10' });
  const [shiftModalOpen, setShiftModalOpen] = useState(false);
  const [deletingMenuItem, setDeletingMenuItem] = useState<PosItemDTO | null>(null);
  const [deletingCat, setDeletingCat] = useState<{ id: string; name: string } | null>(null);

  // Queries
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

  const { data: stockItems } = useQuery({
    queryKey: ['pos', 'stock-items'],
    queryFn: () => get<PosStockItem[]>('/pos/stock-items'),
  });

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

  const unitPriceOf = (it: PosItemDTO) =>
    currency === 'USD' ? BigInt(it.priceMinorUSD ?? it.priceMinorUGX) : BigInt(it.priceMinorUGX);

  const cartSubtotalMinor = useMemo(
    () => cart.reduce((acc, l) => acc + unitPriceOf(l.item) * BigInt(l.quantity), 0n),
    [cart, currency],
  );

  const cartDiscountMinor = useMemo(() => {
    if (customDiscountMinor.trim() && /^\d+$/.test(customDiscountMinor.trim())) {
      const d = BigInt(customDiscountMinor.trim());
      return d > cartSubtotalMinor ? cartSubtotalMinor : d;
    }
    if (discountPercent > 0) {
      return (cartSubtotalMinor * BigInt(discountPercent)) / 100n;
    }
    return 0n;
  }, [cartSubtotalMinor, discountPercent, customDiscountMinor]);

  const cartTotalMinor = useMemo(
    () => (cartSubtotalMinor > cartDiscountMinor ? cartSubtotalMinor - cartDiscountMinor : 0n),
    [cartSubtotalMinor, cartDiscountMinor],
  );

  const changeDueMinor = useMemo(() => {
    if (paymentMethod !== 'CASH' || !cashTendered.trim() || !/^\d+$/.test(cashTendered.trim())) {
      return null;
    }
    const tendered = BigInt(cashTendered.trim());
    return tendered >= cartTotalMinor ? tendered - cartTotalMinor : null;
  }, [paymentMethod, cashTendered, cartTotalMinor]);

  // Cart Handlers
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

  const updateLineNote = (itemId: string, notes: string) => {
    setCart((prev) => prev.map((l) => (l.item.id === itemId ? { ...l, notes } : l)));
  };

  const toggleModifierOnLine = (itemId: string, mod: string) => {
    setCart((prev) =>
      prev.map((l) => {
        if (l.item.id !== itemId) return l;
        const parts = l.notes
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
        const exists = parts.includes(mod);
        const next = exists ? parts.filter((p) => p !== mod) : [...parts, mod];
        return { ...l, notes: next.join(', ') };
      }),
    );
  };

  const resetTicket = () => {
    setCart([]);
    setTargetOpenOrder(null);
    setEditingOpenOrder(null);
    setCustomerName('');
    setCustomerPhone('');
    setTableOrRoom('');
    setOrderNotes('');
    setDiscountPercent(0);
    setCustomDiscountMinor('');
    setCashTendered('');
    setExpandedNoteItemId(null);
  };

  const loadOrderForEditing = (o: PosOrderDTO) => {
    const out = outlets?.find((x) => x.id === o.outletId) ?? outlets?.[0];
    const allMenuItems = (outlets ?? []).flatMap((x) => x.categories.flatMap((c) => c.items));
    const loadedCart: CartLine[] = o.items.map((line) => {
      const matched = allMenuItems.find((m) => m.id === line.itemId);
      const fallbackItem: PosItemDTO = matched ?? {
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
      };
      return {
        item: fallbackItem,
        quantity: line.quantity,
        notes: line.notes ?? '',
      };
    });
    setTargetOpenOrder(null);
    setEditingOpenOrder(o);
    setCart(loadedCart);
    setTableOrRoom(o.tableOrRoom ?? '');
    setCustomerName(o.customerName ?? '');
    setCustomerPhone(o.customerPhone ?? '');
    setServedByName(o.servedByName || me.name || 'Staff');
    setOrderNotes(o.notes ?? '');
    setCustomDiscountMinor(o.discountMinor !== '0' ? o.discountMinor : '');
    setActiveTab(out?.code ?? outlets?.[0]?.code ?? 'KITCHEN');
    toast.info(`Editing Bill ${o.orderNumber} (${o.tableOrRoom || 'Table'}) — update items & save`);
  };

  // Mutations
  const placeOrder = useMutation({
    mutationFn: (settleNow: boolean) => {
      if (editingOpenOrder) {
        return patch<PosOrderDTO>(`/pos/orders/${editingOpenOrder.id}`, {
          tableOrRoom: tableOrRoom.trim() || null,
          customerName: customerName.trim() || null,
          customerPhone: customerPhone.trim() || null,
          servedByName: servedByName.trim() || me.name,
          discountMinor: cartDiscountMinor.toString(),
          notes: orderNotes.trim() || null,
          items: cart.map((l) => ({
            itemId: l.item.id,
            quantity: l.quantity,
            notes: l.notes.trim() || null,
          })),
        });
      }
      if (targetOpenOrder) {
        return post<PosOrderDTO>(`/pos/orders/${targetOpenOrder.id}/items`, {
          notes: orderNotes.trim() || undefined,
          items: cart.map((l) => ({
            itemId: l.item.id,
            quantity: l.quantity,
            notes: l.notes.trim() || undefined,
          })),
        });
      }
      if (!currentOutlet) throw new Error('Select an outlet');
      return post<PosOrderDTO>('/pos/orders', {
        outletId: currentOutlet.id,
        reservationId:
          (paymentMethod === 'ROOM_FOLIO' || reservationId) && reservationId
            ? reservationId
            : undefined,
        customerName: customerName.trim() || undefined,
        customerPhone: customerPhone.trim() || undefined,
        tableOrRoom: tableOrRoom.trim() || undefined,
        servedByName: servedByName.trim() || me.name,
        paymentMethod,
        currency,
        discountMinor: cartDiscountMinor.toString(),
        notes: orderNotes.trim() || undefined,
        settleNow,
        items: cart.map((l) => ({
          itemId: l.item.id,
          quantity: l.quantity,
          notes: l.notes.trim() || undefined,
        })),
      });
    },
    onSuccess: (order, settleNow) => {
      qc.invalidateQueries({ queryKey: ['pos', 'orders'] });
      qc.invalidateQueries({ queryKey: ['pos', 'outlets'] });
      qc.invalidateQueries({ queryKey: ['documents'] });
      qc.invalidateQueries({ queryKey: ['inventory'] });
      const wasEdit = !!editingOpenOrder;
      const wasAppend = !!targetOpenOrder;
      resetTicket();
      if (wasEdit) {
        toast.success(`Saved & updated Bill ${order.orderNumber} (${order.tableOrRoom || 'Table'})`, {
          action: {
            label: 'Print Updated Bill',
            onClick: () => printPosSlip(order.id, 'BILL'),
          },
        });
      } else if (wasAppend) {
        toast.success(`Added round to ${order.orderNumber} (${order.tableOrRoom || 'Tab'})`, {
          action: {
            label: 'Print Guest Bill',
            onClick: () => printPosSlip(order.id, 'BILL'),
          },
        });
      } else if (!settleNow) {
        toast.success(
          `Held Bill ${order.orderNumber} (${order.tableOrRoom || 'Table'}) · Waiting Payment`,
          {
            action: {
              label: 'Print First Bill (Invoice)',
              onClick: () => printPosSlip(order.id, 'BILL'),
            },
          },
        );
      } else {
        toast.success(
          `${order.orderNumber} Payment Confirmed · ${money(order.totalMinor, order.currency)}`,
          order.documentId
            ? {
                action: {
                  label: 'Print Final Receipt',
                  onClick: () => printDocument(order.documentId!, '80MM'),
                },
              }
            : {
                action: {
                  label: 'Print Slip',
                  onClick: () => printPosSlip(order.id, 'BILL'),
                },
              },
        );
      }
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Could not save POS bill'),
  });

  const settleOrderMut = useMutation({
    mutationFn: () => {
      if (!settleModalOrder) throw new Error('No order selected');
      return post<PosOrderDTO>(`/pos/orders/${settleModalOrder.id}/settle`, {
        paymentMethod: settleMethod,
        reservationId: settleMethod === 'ROOM_FOLIO' ? settleResId : undefined,
        discountMinor: settleDiscount.trim() || '0',
        paymentReference: settleRef.trim() || undefined,
      });
    },
    onSuccess: (order) => {
      qc.invalidateQueries({ queryKey: ['pos', 'orders'] });
      qc.invalidateQueries({ queryKey: ['documents'] });
      setSettleModalOrder(null);
      setSettleRef('');
      toast.success(
        `Payment Confirmed · ${order.orderNumber} Closed (${PAYMENT_LABELS[order.paymentMethod]})`,
        order.documentId
          ? {
              action: {
                label: 'Print Final Official Receipt',
                onClick: () => printDocument(order.documentId!, '80MM'),
              },
            }
          : undefined,
      );
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Could not confirm payment'),
  });

  const handoverShiftMut = useMutation({
    mutationFn: () =>
      post<{ transferredCount: number; toStaffName: string }>('/pos/orders/handover-shift', {
        fromServedByName: handoverFrom.trim() || undefined,
        toStaffName: handoverTo.trim(),
        notes: handoverNotes.trim() || undefined,
      }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['pos', 'orders'] });
      setHandoverTo('');
      setHandoverNotes('');
      toast.success(
        `Shift Handover Complete: ${res.transferredCount} waiting bill(s) assigned to ${res.toStaffName}`,
      );
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Could not hand over shift'),
  });

  const updateStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: PosOrderStatus }) =>
      patch<PosOrderDTO>(`/pos/orders/${id}/status`, { status }),
    onSuccess: (o) => {
      qc.invalidateQueries({ queryKey: ['pos', 'orders'] });
      qc.invalidateQueries({ queryKey: ['pos', 'outlets'] });
      toast.success(`${o.orderNumber} → ${o.status}`);
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Could not update status'),
  });

  const toggleAvailability = useMutation({
    mutationFn: ({ id, isAvailable }: { id: string; isAvailable: boolean }) =>
      patch(`/pos/items/${id}`, { isAvailable }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pos', 'outlets'] });
      toast.success('Menu item availability updated');
    },
  });

  const saveMenuItem = useMutation({
    mutationFn: () => {
      if (editingItem) {
        return patch(`/pos/items/${editingItem.id}`, {
          categoryId: itemForm.categoryId,
          sku: itemForm.sku.trim(),
          name: itemForm.name.trim(),
          description: itemForm.description.trim() || null,
          priceMinorUGX: itemForm.priceMinorUGX.trim(),
          priceMinorUSD: itemForm.priceMinorUSD.trim() || null,
          prepMinutes: itemForm.prepMinutes ? Number(itemForm.prepMinutes) : null,
          inventoryItemId: itemForm.inventoryItemId || null,
          isAvailable: itemForm.isAvailable,
        });
      }
      return post('/pos/items', {
        categoryId: itemForm.categoryId,
        sku: itemForm.sku.trim(),
        name: itemForm.name.trim(),
        description: itemForm.description.trim() || null,
        priceMinorUGX: itemForm.priceMinorUGX.trim(),
        priceMinorUSD: itemForm.priceMinorUSD.trim() || null,
        prepMinutes: itemForm.prepMinutes ? Number(itemForm.prepMinutes) : null,
        inventoryItemId: itemForm.inventoryItemId || null,
        isAvailable: itemForm.isAvailable,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pos', 'outlets'] });
      setMenuModalOpen(false);
      setEditingItem(null);
      toast.success(editingItem ? 'Menu item updated' : 'Menu item added to POS');
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Could not save menu item'),
  });

  const deleteMenuItem = useMutation({
    mutationFn: (id: string) => del(`/pos/items/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pos', 'outlets'] });
      setMenuModalOpen(false);
      setEditingItem(null);
      setDeletingMenuItem(null);
      toast.success('Menu item permanently removed');
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Could not remove item'),
  });

  const deletePosCatMut = useMutation({
    mutationFn: (id: string) => del(`/pos/categories/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pos', 'outlets'] });
      setDeletingCat(null);
      setSelectedCat('ALL');
      toast.success('POS category removed');
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Could not remove category'),
  });

  const createCategoryMut = useMutation({
    mutationFn: () => {
      if (!currentOutlet) throw new Error('Select an outlet');
      return post('/pos/categories', {
        outletId: currentOutlet.id,
        name: catForm.name.trim(),
        sortOrder: Number(catForm.sortOrder) || 10,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pos', 'outlets'] });
      setCatModalOpen(false);
      setCatForm({ name: '', sortOrder: '10' });
      toast.success('Category created');
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Could not create category'),
  });

  // Metrics & Derived Lists
  const openTabs = useMemo(
    () => (orders ?? []).filter((o) => !o.isSettled && o.status !== 'CANCELLED'),
    [orders],
  );

  const paidOrders = useMemo(
    () => (orders ?? []).filter((o) => o.isSettled && o.status !== 'CANCELLED'),
    [orders],
  );

  const pendingOrdersCount = useMemo(
    () => (orders ?? []).filter((o) => ['PENDING', 'PREPARING', 'READY'].includes(o.status)).length,
    [orders],
  );

  const todaySalesMinor = useMemo(
    () =>
      (orders ?? [])
        .filter((o) => o.isSettled && o.status !== 'CANCELLED' && o.currency === 'UGX')
        .reduce((s, o) => s + BigInt(o.totalMinor), 0n),
    [orders],
  );

  const waitingSalesMinor = useMemo(
    () =>
      openTabs
        .filter((o) => o.currency === 'UGX')
        .reduce((s, o) => s + BigInt(o.totalMinor), 0n),
    [openTabs],
  );

  const shiftBreakdown = useMemo(() => {
    const valid = (orders ?? []).filter((o) => o.status !== 'CANCELLED');
    const byMethod: Record<string, bigint> = {};
    const byOutlet: Record<string, { count: number; total: bigint }> = {};
    const byWaiter: Record<
      string,
      { openCount: number; openTotal: bigint; paidCount: number; paidTotal: bigint }
    > = {};
    const itemMap = new Map<string, { name: string; qty: number; total: bigint }>();

    for (const o of valid) {
      if (o.currency !== 'UGX') continue;
      const amt = BigInt(o.totalMinor);
      const mKey = o.isSettled ? o.paymentMethod : 'OPEN_TAB';
      byMethod[mKey] = (byMethod[mKey] ?? 0n) + amt;

      const out = byOutlet[o.outletName] ?? { count: 0, total: 0n };
      out.count += 1;
      out.total += amt;
      byOutlet[o.outletName] = out;

      const wName = o.servedByName || 'Staff';
      const wStat = byWaiter[wName] ?? {
        openCount: 0,
        openTotal: 0n,
        paidCount: 0,
        paidTotal: 0n,
      };
      if (o.isSettled) {
        wStat.paidCount += 1;
        wStat.paidTotal += amt;
      } else {
        wStat.openCount += 1;
        wStat.openTotal += amt;
      }
      byWaiter[wName] = wStat;

      for (const it of o.items) {
        const prev = itemMap.get(it.itemName) ?? { name: it.itemName, qty: 0, total: 0n };
        prev.qty += it.quantity;
        prev.total += BigInt(it.totalMinor);
        itemMap.set(it.itemName, prev);
      }
    }

    const topItems = [...itemMap.values()].sort((a, b) => b.qty - a.qty).slice(0, 8);
    return { byMethod, byOutlet, byWaiter, topItems, totalOrders: valid.length };
  }, [orders]);

  const filteredOrders = useMemo(() => {
    let list = orders ?? [];
    if (kdsFilter === 'ACTIVE') {
      list = list.filter((o) => ['PENDING', 'PREPARING', 'READY'].includes(o.status));
    } else if (kdsFilter === 'OPEN_TABS') {
      list = list.filter((o) => !o.isSettled && o.status !== 'CANCELLED');
    } else if (kdsFilter === 'PAID') {
      list = list.filter((o) => o.isSettled && o.status !== 'CANCELLED');
    }
    if (orderSearch.trim()) {
      const q = orderSearch.toLowerCase();
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
  }, [orders, kdsFilter, orderSearch]);

  const openAddMenuModal = () => {
    setEditingItem(null);
    const defaultCat =
      selectedCat !== 'ALL' ? selectedCat : (currentOutlet?.categories[0]?.id ?? '');
    const prefix = currentOutlet?.code.slice(0, 3).toUpperCase() ?? 'POS';
    setItemForm({
      categoryId: defaultCat,
      sku: `${prefix}-${Math.floor(100 + Math.random() * 900)}`,
      name: '',
      description: '',
      priceMinorUGX: '',
      priceMinorUSD: '',
      prepMinutes: '10',
      inventoryItemId: '',
      isAvailable: true,
    });
    setMenuModalOpen(true);
  };

  const openEditMenuModal = (it: PosItemDTO) => {
    setEditingItem(it);
    setItemForm({
      categoryId: it.categoryId,
      sku: it.sku,
      name: it.name,
      description: it.description ?? '',
      priceMinorUGX: it.priceMinorUGX,
      priceMinorUSD: it.priceMinorUSD ?? '',
      prepMinutes: it.prepMinutes !== null ? String(it.prepMinutes) : '',
      inventoryItemId: it.inventoryItemId ?? '',
      isAvailable: it.isAvailable,
    });
    setMenuModalOpen(true);
  };

  const openSettleDialog = (o: PosOrderDTO) => {
    setSettleModalOrder(o);
    setSettleMethod(o.paymentMethod || 'CASH');
    setSettleResId(o.reservationId ?? '');
    setSettleDiscount(o.discountMinor || '0');
    setSettleTendered('');
  };

  return (
    <div className="fade-in">
      <PageHeader
        title="Point of Sale · Restaurant, Bar & Waiter Billing"
        description="Hold & edit table bills (First Bill / Invoice), confirm payments to issue Final Official Receipts, and manage waiter shift handovers."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              icon={<BarChart3 className="size-3.5" />}
              onClick={() => setShiftModalOpen(true)}
            >
              Waiters & Shifts · Paid: {money(todaySalesMinor.toString(), 'UGX')}
            </Button>

            <Button
              variant={activeTab === 'KDS' && kdsFilter === 'OPEN_TABS' ? 'primary' : 'secondary'}
              size="sm"
              icon={<Wallet className="size-3.5" />}
              onClick={() => {
                setActiveTab('KDS');
                setKdsFilter('OPEN_TABS');
              }}
            >
              Waiting Payment ({openTabs.length})
            </Button>

            <Button
              variant={activeTab === 'KDS' && kdsFilter === 'PAID' ? 'primary' : 'secondary'}
              size="sm"
              icon={<CheckCircle2 className="size-3.5" />}
              onClick={() => {
                setActiveTab('KDS');
                setKdsFilter('PAID');
              }}
            >
              Paid & Confirmed ({paidOrders.length})
            </Button>

            <Button
              variant={activeTab === 'KDS' && kdsFilter === 'ACTIVE' ? 'primary' : 'secondary'}
              size="sm"
              icon={<ChefHat className="size-3.5" />}
              onClick={() => {
                if (activeTab === 'KDS' && kdsFilter === 'ACTIVE') {
                  setActiveTab(outlets?.[0]?.code ?? 'KITCHEN');
                } else {
                  setActiveTab('KDS');
                  setKdsFilter('ACTIVE');
                }
              }}
            >
              Kitchen / Bar Prep ({pendingOrdersCount})
            </Button>

            {activeTab !== 'KDS' && (
              <>
                <Button
                  size="sm"
                  variant="secondary"
                  icon={<FolderPlus className="size-3.5" />}
                  onClick={() => setCatModalOpen(true)}
                >
                  + Category
                </Button>
                <Button
                  size="sm"
                  variant="dark"
                  icon={<Plus className="size-3.5" />}
                  onClick={openAddMenuModal}
                >
                  + Menu Item
                </Button>
              </>
            )}
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
                label: 'Bills & Tabs (Waiting vs Paid)',
                count: openTabs.length + paidOrders.length,
              },
            ]}
          />

          {activeTab === 'KDS' ? (
            <div className="space-y-3">
              {/* KDS Filter & Search Toolbar */}
              <div className="card flex flex-wrap items-center justify-between gap-2 px-3.5 py-2.5">
                <div className="flex flex-wrap items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setKdsFilter('OPEN_TABS')}
                    className={cn(
                      'rounded-md px-3 py-1.5 text-xs font-semibold transition',
                      kdsFilter === 'OPEN_TABS'
                        ? 'bg-accent text-white shadow-xs'
                        : 'bg-surface-2 text-fg-muted hover:text-fg',
                    )}
                  >
                    Waiting Payment · Open Bills ({openTabs.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setKdsFilter('PAID')}
                    className={cn(
                      'rounded-md px-3 py-1.5 text-xs font-semibold transition',
                      kdsFilter === 'PAID'
                        ? 'bg-emerald-600 text-white shadow-xs'
                        : 'bg-surface-2 text-fg-muted hover:text-fg',
                    )}
                  >
                    Paid & Confirmed Receipts ({paidOrders.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setKdsFilter('ACTIVE')}
                    className={cn(
                      'rounded-md px-3 py-1.5 text-xs font-semibold transition',
                      kdsFilter === 'ACTIVE'
                        ? 'bg-fg text-bg'
                        : 'bg-surface-2 text-fg-muted hover:text-fg',
                    )}
                  >
                    Kitchen / Bar Prep ({pendingOrdersCount})
                  </button>
                  <button
                    type="button"
                    onClick={() => setKdsFilter('ALL')}
                    className={cn(
                      'rounded-md px-3 py-1.5 text-xs font-semibold transition',
                      kdsFilter === 'ALL'
                        ? 'bg-fg text-bg'
                        : 'bg-surface-2 text-fg-muted hover:text-fg',
                    )}
                  >
                    All Bills ({orders?.length ?? 0})
                  </button>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <label className="relative w-56">
                    <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-fg-subtle" />
                    <input
                      className="input !min-h-8 !py-1 pl-8 text-xs"
                      placeholder="Search order #, table, guest…"
                      value={orderSearch}
                      onChange={(e) => setOrderSearch(e.target.value)}
                    />
                  </label>
                  <div className="inline-flex rounded-lg border border-line bg-surface-2 p-0.5">
                    <button
                      type="button"
                      onClick={() => setKdsViewMode('CARDS')}
                      className={cn(
                        'inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-semibold',
                        kdsViewMode === 'CARDS' ? 'bg-surface text-fg shadow-xs' : 'text-fg-muted',
                      )}
                    >
                      <LayoutGrid className="size-3.5" /> Tickets
                    </button>
                    <button
                      type="button"
                      onClick={() => setKdsViewMode('TABLE')}
                      className={cn(
                        'inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-semibold',
                        kdsViewMode === 'TABLE' ? 'bg-surface text-fg shadow-xs' : 'text-fg-muted',
                      )}
                    >
                      <ListFilter className="size-3.5" /> Register
                    </button>
                  </div>
                </div>
              </div>

              {ordersLoading ? (
                <Skeleton className="h-64" />
              ) : !filteredOrders.length ? (
                <div className="card p-8">
                  <Empty
                    icon={<ChefHat className="size-5" />}
                    title="No matching orders in queue"
                    body="New kitchen, bar and open tab tickets will appear here automatically."
                  />
                </div>
              ) : kdsViewMode === 'CARDS' ? (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {filteredOrders.map((o) => (
                    <div
                      key={o.id}
                      className={cn(
                        'card flex flex-col justify-between p-3.5 transition',
                        !o.isSettled && o.status !== 'CANCELLED' && 'border-amber-500/50',
                        o.status === 'READY' && 'border-emerald-500/60',
                      )}
                    >
                      <div>
                        <div className="flex items-start justify-between gap-2 border-b border-line pb-2.5">
                          <div>
                            <div className="flex items-center gap-1.5">
                              <span className="font-mono text-xs font-bold">{o.orderNumber}</span>
                              <Pill tone={ORDER_TONE[o.status]} dot>
                                {o.status}
                              </Pill>
                            </div>
                            <p className="mt-1 text-sm font-bold text-fg">
                              {o.tableOrRoom || 'Counter / Walk-In'} ·{' '}
                              <span className="font-medium text-fg-muted">
                                {o.customerName || 'Walk-in'}
                              </span>
                            </p>
                            <p className="text-[11px] text-fg-subtle">
                              {o.outletName} · {ago(o.createdAt)} · Server: {o.servedByName || 'Staff'}
                            </p>
                          </div>
                          <Pill tone={o.isSettled ? 'green' : 'amber'}>
                            {o.isSettled ? `PAID · ${PAYMENT_LABELS[o.paymentMethod]}` : 'WAITING PAYMENT'}
                          </Pill>
                        </div>

                        <ul className="my-2.5 divide-y divide-line/60 text-xs">
                          {o.items.map((it) => (
                            <li key={it.id} className="py-1.5">
                              <div className="flex items-start justify-between gap-2">
                                <span className="font-semibold">
                                  <span className="mr-1.5 inline-block rounded bg-surface-2 px-1.5 py-0.5 font-mono font-bold">
                                    {it.quantity}×
                                  </span>
                                  {it.itemName}
                                </span>
                                <span className="font-mono text-[11px] text-fg-muted tabular">
                                  {money(it.totalMinor, o.currency)}
                                </span>
                              </div>
                              {it.notes && (
                                <p className="mt-0.5 pl-7 text-[11px] font-medium text-amber-600 dark:text-amber-400">
                                  ▸ {it.notes}
                                </p>
                              )}
                            </li>
                          ))}
                        </ul>

                        {o.notes && (
                          <div className="mb-2.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-1.5 text-[11.5px] font-medium text-amber-600 dark:text-amber-300">
                            Note: {o.notes}
                          </div>
                        )}
                      </div>

                      <div className="space-y-2 border-t border-line pt-2.5">
                        <div className="flex items-center justify-between text-xs font-bold">
                          <span className="text-fg-muted">
                            {o.isSettled ? 'Total Paid (Confirmed)' : 'Total Due (Waiting Payment)'}
                          </span>
                          <span className="font-mono text-sm tabular">
                            {money(o.totalMinor, o.currency)}
                          </span>
                        </div>

                        {/* Status & Tab Action Buttons */}
                        <div className="flex flex-wrap items-center gap-1.5">
                          {o.status === 'PENDING' && (
                            <Button
                              size="sm"
                              variant="primary"
                              onClick={() => updateStatus.mutate({ id: o.id, status: 'PREPARING' })}
                            >
                              Start Prep
                            </Button>
                          )}
                          {o.status === 'PREPARING' && (
                            <Button
                              size="sm"
                              variant="primary"
                              onClick={() => updateStatus.mutate({ id: o.id, status: 'READY' })}
                            >
                              Mark Ready
                            </Button>
                          )}
                          {o.status === 'READY' && (
                            <Button
                              size="sm"
                              variant="dark"
                              onClick={() => updateStatus.mutate({ id: o.id, status: 'COMPLETED' })}
                            >
                              Served / Complete
                            </Button>
                          )}

                          {!o.isSettled && o.status !== 'CANCELLED' && (
                            <>
                              <Button
                                size="sm"
                                variant="secondary"
                                icon={<Edit3 className="size-3" />}
                                onClick={() => loadOrderForEditing(o)}
                              >
                                Edit Bill
                              </Button>
                              <Button
                                size="sm"
                                variant="secondary"
                                icon={<PlusCircle className="size-3" />}
                                onClick={() => {
                                  setEditingOpenOrder(null);
                                  setTargetOpenOrder(o);
                                  setTableOrRoom(o.tableOrRoom ?? '');
                                  setCustomerName(o.customerName ?? '');
                                  const out = outlets?.find((x) => x.id === o.outletId);
                                  setActiveTab(out?.code ?? outlets?.[0]?.code ?? 'KITCHEN');
                                  toast.info(`Adding round to ${o.orderNumber} (${o.tableOrRoom || 'Open Bill'})`);
                                }}
                              >
                                + Round
                              </Button>
                              <Button
                                size="sm"
                                variant="primary"
                                icon={<CreditCard className="size-3" />}
                                onClick={() => openSettleDialog(o)}
                              >
                                Confirm Payment
                              </Button>
                            </>
                          )}
                        </div>

                        {/* Print & Cancel Row */}
                        <div className="flex flex-wrap items-center justify-between gap-1 pt-1">
                          <div className="flex flex-wrap items-center gap-1">
                            <button
                              type="button"
                              onClick={() => printPosSlip(o.id, 'KOT')}
                              className="inline-flex items-center gap-1 rounded border border-line bg-surface-2 px-2 py-1 text-[11px] font-semibold hover:bg-surface"
                              title="Print 80mm Kitchen/Bar Order Ticket"
                            >
                              <Printer className="size-3" /> KOT
                            </button>
                            <button
                              type="button"
                              onClick={() => printPosSlip(o.id, 'BILL')}
                              className="inline-flex items-center gap-1 rounded border border-line bg-surface-2 px-2 py-1 text-[11px] font-semibold hover:bg-surface"
                              title="Print 80mm First Receipt (Guest Bill / Invoice — Waiting Payment)"
                            >
                              <FileText className="size-3" /> First Bill (Invoice)
                            </button>
                            {o.documentId && (
                              <button
                                type="button"
                                onClick={() => printDocument(o.documentId!, '80MM')}
                                className="inline-flex items-center gap-1 rounded border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400"
                                title="Print Official Numbered Final Payment Receipt"
                              >
                                <Receipt className="size-3" /> Final Receipt
                              </button>
                            )}
                          </div>

                          {o.status !== 'CANCELLED' && !o.isSettled && (
                            <button
                              type="button"
                              onClick={() => updateStatus.mutate({ id: o.id, status: 'CANCELLED' })}
                              className="text-[11px] font-semibold text-danger hover:underline"
                            >
                              Void
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="card overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[880px] text-left text-[12.5px]">
                      <thead className="border-b border-line bg-surface-2/40 text-[11px] font-semibold uppercase tracking-wider text-fg-subtle">
                        <tr>
                          <th className="px-3.5 py-2.5">Order #</th>
                          <th className="px-3.5 py-2.5">Outlet & Time</th>
                          <th className="px-3.5 py-2.5">Table / Guest</th>
                          <th className="px-3.5 py-2.5">Items</th>
                          <th className="px-3.5 py-2.5">Settlement</th>
                          <th className="px-3.5 py-2.5">Status</th>
                          <th className="px-3.5 py-2.5 text-right">Total</th>
                          <th className="px-3.5 py-2.5 text-right">Actions</th>
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
                                    {it.notes ? ` (${it.notes})` : ''}
                                  </span>
                                ))}
                              </div>
                            </td>
                            <td className="px-3.5 py-2.5 whitespace-nowrap">
                              <Pill tone={o.isSettled ? 'green' : 'amber'}>
                                {o.isSettled ? `PAID · ${PAYMENT_LABELS[o.paymentMethod]}` : 'WAITING PAYMENT'}
                              </Pill>
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
                                {!o.isSettled && o.status !== 'CANCELLED' && (
                                  <>
                                    <Button
                                      size="sm"
                                      variant="secondary"
                                      onClick={() => loadOrderForEditing(o)}
                                    >
                                      Edit Bill
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="primary"
                                      onClick={() => openSettleDialog(o)}
                                    >
                                      Confirm Pay
                                    </Button>
                                  </>
                                )}
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  icon={<Printer className="size-3" />}
                                  onClick={() => printPosSlip(o.id, 'KOT')}
                                >
                                  KOT
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  icon={<FileText className="size-3" />}
                                  onClick={() => printPosSlip(o.id, 'BILL')}
                                >
                                  First Bill
                                </Button>
                                {o.documentId && (
                                  <Button
                                    size="sm"
                                    variant="secondary"
                                    icon={<Receipt className="size-3" />}
                                    onClick={() => printDocument(o.documentId!, '80MM')}
                                  >
                                    Final Receipt
                                  </Button>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_24rem]">
              {/* Left: Fast Menu Catalog Grid */}
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
                      All ({categories.reduce((a, c) => a + c.items.length, 0)})
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
                        {c.name} ({c.items.length})
                      </button>
                    ))}
                  </div>

                  <label className="relative w-60">
                    <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-fg-subtle" />
                    <input
                      className="input !min-h-8 !py-1 pl-8 text-[12px]"
                      placeholder="Filter or scan SKU + Enter…"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && visibleItems.length === 1 && visibleItems[0]) {
                          e.preventDefault();
                          addToCart(visibleItems[0]);
                          setSearch('');
                        }
                      }}
                    />
                  </label>
                </div>

                <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-4">
                  {visibleItems.map((it) => {
                    const inCart = cart.find((c) => c.item.id === it.id)?.quantity ?? 0;
                    const lowStock =
                      it.stockOnHand !== null &&
                      it.stockOnHand !== undefined &&
                      it.stockOnHand <= 5;
                    return (
                      <div
                        key={it.id}
                        onClick={() => it.isAvailable && addToCart(it)}
                        className={cn(
                          'card group flex cursor-pointer flex-col justify-between p-3 transition hover:border-fg/40',
                          !it.isAvailable && 'cursor-not-allowed opacity-50',
                          inCart > 0 && 'border-accent ring-1 ring-accent',
                        )}
                      >
                        <div>
                          <div className="flex items-center justify-between gap-1 text-[10.5px] text-fg-subtle">
                            <span className="font-mono">{it.sku}</span>
                            <div className="flex items-center gap-1.5">
                              {it.prepMinutes && (
                                <span className="inline-flex items-center gap-0.5">
                                  <Clock className="size-2.5" />
                                  {it.prepMinutes}m
                                </span>
                              )}
                              {it.stockOnHand !== null && it.stockOnHand !== undefined && (
                                <span
                                  className={cn(
                                    'rounded px-1 font-mono font-semibold',
                                    lowStock
                                      ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
                                      : 'text-fg-subtle',
                                  )}
                                >
                                  Stk: {it.stockOnHand}
                                </span>
                              )}
                            </div>
                          </div>
                          <h3 className="mt-1 text-[13px] font-semibold leading-snug">{it.name}</h3>
                          {it.description && (
                            <p className="mt-0.5 line-clamp-1 text-[11px] text-fg-muted">
                              {it.description}
                            </p>
                          )}
                        </div>

                        <div className="mt-2.5 flex items-center justify-between border-t border-line pt-2">
                          <span className="font-mono text-[12.5px] font-bold tabular">
                            {money(
                              currency === 'USD'
                                ? (it.priceMinorUSD ?? it.priceMinorUGX)
                                : it.priceMinorUGX,
                              currency,
                            )}
                          </span>
                          <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                            <button
                              type="button"
                              onClick={() => openEditMenuModal(it)}
                              className="rounded p-1 text-fg-subtle opacity-60 hover:bg-surface-2 hover:text-fg group-hover:opacity-100"
                              title="Edit item / price"
                            >
                              <Pencil className="size-3" />
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                toggleAvailability.mutate({
                                  id: it.id,
                                  isAvailable: !it.isAvailable,
                                })
                              }
                              className="rounded px-1 py-0.5 text-[10px] font-semibold text-fg-subtle hover:bg-surface-2 hover:text-fg"
                              title="Toggle 86 / Sold out"
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

              {/* Right: High-Speed Order Ticket & Settlement Panel */}
              <div className="lg:sticky lg:top-16 lg:self-start">
                <Section
                  title={
                    editingOpenOrder
                      ? `Edit Bill · ${editingOpenOrder.orderNumber}`
                      : targetOpenOrder
                        ? `Add Round · ${targetOpenOrder.orderNumber}`
                        : 'Order Ticket & Bill Builder'
                  }
                  actions={
                    <div className="flex items-center gap-2">
                      <div className="inline-flex rounded-md border border-line bg-surface-2 p-0.5 text-[11px] font-bold">
                        <button
                          type="button"
                          onClick={() => setCurrency('UGX')}
                          className={cn(
                            'rounded px-1.5 py-0.5',
                            currency === 'UGX' ? 'bg-surface text-fg shadow-2xs' : 'text-fg-muted',
                          )}
                        >
                          UGX
                        </button>
                        <button
                          type="button"
                          onClick={() => setCurrency('USD')}
                          className={cn(
                            'rounded px-1.5 py-0.5',
                            currency === 'USD' ? 'bg-surface text-fg shadow-2xs' : 'text-fg-muted',
                          )}
                        >
                          USD
                        </button>
                      </div>
                      {(cart.length > 0 || targetOpenOrder || editingOpenOrder) && (
                        <button
                          type="button"
                          onClick={resetTicket}
                          className="text-[11.5px] font-semibold text-danger hover:underline"
                        >
                          Clear
                        </button>
                      )}
                    </div>
                  }
                >
                  {/* Open Tab Selector Banner */}
                  {openTabs.length > 0 && !targetOpenOrder && !editingOpenOrder && (
                    <div className="mb-3 rounded-lg border border-line-strong bg-surface-2 p-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <label className="block text-[11px] font-semibold text-fg">
                          Keep Updating an Existing Open Bill (Waiting Payment)
                        </label>
                        <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-bold text-amber-600 dark:text-amber-400">
                          {openTabs.length} Open
                        </span>
                      </div>
                      <div className="mt-1.5 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                        <select
                          className="input !min-h-8 !py-1 text-xs"
                          value=""
                          onChange={(e) => {
                            const found = openTabs.find((o) => o.id === e.target.value);
                            if (found) {
                              setTargetOpenOrder(found);
                              setTableOrRoom(found.tableOrRoom ?? '');
                              setCustomerName(found.customerName ?? '');
                            }
                          }}
                        >
                          <option value="">+ Add Round to Bill…</option>
                          {openTabs.map((o) => (
                            <option key={o.id} value={o.id}>
                              {o.tableOrRoom || 'Tab'} · {o.customerName || 'Guest'} ({o.orderNumber} ·{' '}
                              {money(o.totalMinor, o.currency)})
                            </option>
                          ))}
                        </select>
                        <select
                          className="input !min-h-8 !py-1 text-xs"
                          value=""
                          onChange={(e) => {
                            const found = openTabs.find((o) => o.id === e.target.value);
                            if (found) loadOrderForEditing(found);
                          }}
                        >
                          <option value="">✎ Edit Full Bill…</option>
                          {openTabs.map((o) => (
                            <option key={o.id} value={o.id}>
                              Edit {o.orderNumber} · {o.tableOrRoom || 'Tab'} (
                              {money(o.totalMinor, o.currency)})
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  )}

                  {editingOpenOrder && (
                    <div className="mb-3 flex items-center justify-between rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs">
                      <div>
                        <p className="font-bold text-amber-700 dark:text-amber-300">
                          Editing Unpaid Bill {editingOpenOrder.orderNumber}
                        </p>
                        <p className="text-[11px] text-fg-muted">
                          Adjust item quantities, add/remove items, or update table & waiter before saving.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={resetTicket}
                        className="text-[11px] font-semibold underline"
                      >
                        Cancel Edit
                      </button>
                    </div>
                  )}

                  {targetOpenOrder && (
                    <div className="mb-3 flex items-center justify-between rounded-lg border border-line-strong bg-surface-2 px-3 py-2 text-xs">
                      <div>
                        <p className="font-bold text-fg">
                          Appending New Round to {targetOpenOrder.orderNumber}
                        </p>
                        <p className="text-[11px] text-fg-muted">
                          {targetOpenOrder.tableOrRoom || 'Counter'} · Current bill:{' '}
                          {money(targetOpenOrder.totalMinor, targetOpenOrder.currency)}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setTargetOpenOrder(null)}
                        className="text-[11px] font-semibold underline"
                      >
                        New Bill
                      </button>
                    </div>
                  )}

                  {!cart.length ? (
                    <Empty
                      icon={<ShoppingBag className="size-4" />}
                      title="Tap menu items to build bill"
                      body="1. Select Table & Waiter -> 2. Hold Bill & Print Guest Invoice (Waiting Payment) -> 3. Confirm Payment when guest pays to issue Final Receipt."
                    />
                  ) : (
                    <div className="space-y-3">
                      {/* Cart Items with Modifier Support */}
                      <ul className="max-h-64 divide-y divide-line overflow-y-auto pr-1">
                        {cart.map((l) => {
                          const isExpanded = expandedNoteItemId === l.item.id;
                          return (
                            <li key={l.item.id} className="py-2">
                              <div className="flex items-center justify-between gap-2">
                                <div className="min-w-0 flex-1">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setExpandedNoteItemId(isExpanded ? null : l.item.id)
                                    }
                                    className="flex items-center gap-1 text-left text-[12.5px] font-semibold hover:text-accent"
                                  >
                                    <span className="truncate">{l.item.name}</span>
                                    <Tag className="size-3 shrink-0 text-fg-subtle" />
                                  </button>
                                  <p className="font-mono text-[11px] text-fg-muted">
                                    {money(unitPriceOf(l.item).toString(), currency)} each
                                    {l.notes && (
                                      <span className="ml-1.5 font-sans text-amber-600 dark:text-amber-400">
                                        · {l.notes}
                                      </span>
                                    )}
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
                                  <span className="w-6 text-center font-mono text-[12px] font-bold tabular">
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
                              </div>

                              {isExpanded && (
                                <div className="mt-2 rounded-lg border border-line bg-surface-2/60 p-2">
                                  <div className="mb-1.5 flex flex-wrap gap-1">
                                    {QUICK_MODIFIERS.map((mod) => {
                                      const active = l.notes.includes(mod);
                                      return (
                                        <button
                                          key={mod}
                                          type="button"
                                          onClick={() => toggleModifierOnLine(l.item.id, mod)}
                                          className={cn(
                                            'rounded px-1.5 py-0.5 text-[10.5px] font-medium transition',
                                            active
                                              ? 'bg-accent text-white'
                                              : 'bg-surface text-fg-muted hover:text-fg',
                                          )}
                                        >
                                          {mod}
                                        </button>
                                      );
                                    })}
                                  </div>
                                  <input
                                    className="input !min-h-7 !py-1 text-[11.5px]"
                                    placeholder="Custom item instruction…"
                                    value={l.notes}
                                    onChange={(e) => updateLineNote(l.item.id, e.target.value)}
                                  />
                                </div>
                              )}
                            </li>
                          );
                        })}
                      </ul>

                      {/* Quick Discount Selector */}
                      {!targetOpenOrder && (
                        <div className="rounded-lg border border-line bg-surface-2/40 p-2">
                          <div className="flex items-center justify-between text-[11px]">
                            <span className="font-semibold text-fg-muted">Discount</span>
                            <div className="flex gap-1">
                              {[0, 5, 10, 100].map((pct) => (
                                <button
                                  key={pct}
                                  type="button"
                                  onClick={() => {
                                    setDiscountPercent(pct);
                                    setCustomDiscountMinor('');
                                  }}
                                  className={cn(
                                    'rounded px-1.5 py-0.5 font-semibold',
                                    discountPercent === pct && !customDiscountMinor
                                      ? 'bg-fg text-bg'
                                      : 'bg-surface text-fg-muted hover:text-fg',
                                  )}
                                >
                                  {pct === 0 ? '0%' : pct === 100 ? 'Comp' : `${pct}%`}
                                </button>
                              ))}
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Totals Box */}
                      <div className="rounded-lg bg-surface-2 px-3 py-2 text-xs">
                        {cartDiscountMinor > 0n && (
                          <div className="mb-1 flex items-center justify-between text-fg-muted">
                            <span>Subtotal</span>
                            <span className="font-mono tabular">
                              {money(cartSubtotalMinor.toString(), currency)}
                            </span>
                          </div>
                        )}
                        {cartDiscountMinor > 0n && (
                          <div className="mb-1 flex items-center justify-between text-emerald-600 dark:text-emerald-400">
                            <span>Discount</span>
                            <span className="font-mono tabular">
                              - {money(cartDiscountMinor.toString(), currency)}
                            </span>
                          </div>
                        )}
                        <div className="flex items-center justify-between text-[14px] font-bold">
                          <span>
                            {editingOpenOrder
                              ? 'Updated Bill Total'
                              : targetOpenOrder
                                ? 'Round Total'
                                : 'Bill Total Due'}
                          </span>
                          <span className="font-mono tabular">
                            {money(cartTotalMinor.toString(), currency)}
                          </span>
                        </div>
                      </div>

                      {!targetOpenOrder && (
                        <div className="grid gap-2.5 pt-1">
                          {/* Quick Table / Spot Pills */}
                          <div>
                            <label className="mb-1 block text-[11px] font-semibold text-fg-muted">
                              Unique Identification · Table / Spot & Waiter
                            </label>
                            <div className="mb-1.5 flex flex-wrap gap-1">
                              {QUICK_SPOTS.map((sp) => (
                                <button
                                  key={sp}
                                  type="button"
                                  onClick={() => setTableOrRoom(sp)}
                                  className={cn(
                                    'rounded px-2 py-0.5 text-[11px] font-medium transition',
                                    tableOrRoom === sp
                                      ? 'bg-accent text-white font-semibold'
                                      : 'bg-surface-2 text-fg-muted hover:text-fg',
                                  )}
                                >
                                  {sp}
                                </button>
                              ))}
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                              <TextInput
                                label="Table / Spot *"
                                placeholder="e.g. Table 4"
                                value={tableOrRoom}
                                onChange={(e) => setTableOrRoom(e.target.value)}
                              />
                              <TextInput
                                label="Guest Name"
                                placeholder="Walk-in Guest"
                                value={customerName}
                                onChange={(e) => setCustomerName(e.target.value)}
                              />
                            </div>
                            <div className="mt-2">
                              <TextInput
                                label="Waiter / Server on Duty"
                                placeholder={me?.name ?? 'Waiter name'}
                                value={servedByName}
                                onChange={(e) => setServedByName(e.target.value)}
                                hint="Identifies the waiter responsible for this bill during their shift."
                              />
                            </div>
                          </div>

                          {!editingOpenOrder && (
                            <>
                              <SelectInput
                                label="If Paying Immediately · Payment Method"
                                value={paymentMethod}
                                onChange={(e) =>
                                  setPaymentMethod(e.target.value as PosPaymentMethod)
                                }
                              >
                                <option value="CASH">Cash (Confirm & Issue Final Receipt)</option>
                                <option value="MOBILE_MONEY">
                                  Mobile Money (Confirm & Issue Final Receipt)
                                </option>
                                <option value="CARD">Card POS (Confirm & Issue Final Receipt)</option>
                                <option value="ROOM_FOLIO">Post to Resident Room Folio</option>
                                <option value="BANK_TRANSFER">Bank Transfer</option>
                              </SelectInput>

                              {/* Cash Tendered & Change Calculator */}
                              {paymentMethod === 'CASH' && currency === 'UGX' && (
                                <div className="rounded-lg border border-line bg-surface-2/40 p-2">
                                  <div className="flex items-center justify-between gap-2">
                                    <span className="text-[11px] font-semibold text-fg-muted">
                                      Cash Tendered (Change Calc)
                                    </span>
                                    <div className="flex gap-1">
                                      {[20000, 50000, 100000, 200000].map((note) => (
                                        <button
                                          key={note}
                                          type="button"
                                          onClick={() => setCashTendered(String(note))}
                                          className="rounded bg-surface px-1.5 py-0.5 font-mono text-[10px] font-semibold hover:bg-accent hover:text-white"
                                        >
                                          {note / 1000}k
                                        </button>
                                      ))}
                                    </div>
                                  </div>
                                  <div className="mt-1.5 flex items-center gap-2">
                                    <input
                                      className="input !min-h-7 !py-1 font-mono text-xs"
                                      placeholder="Enter cash given…"
                                      value={cashTendered}
                                      onChange={(e) => setCashTendered(e.target.value)}
                                    />
                                    {changeDueMinor !== null && (
                                      <span className="shrink-0 font-mono text-xs font-bold text-emerald-600 dark:text-emerald-400">
                                        Change: {money(changeDueMinor.toString(), 'UGX')}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              )}

                              {paymentMethod === 'ROOM_FOLIO' && (
                                <SelectInput
                                  label="Resident Room / Reservation"
                                  value={reservationId}
                                  onChange={(e) => {
                                    setReservationId(e.target.value);
                                    const found = (inHouseGuests ?? []).find(
                                      (r) => r.reservationId === e.target.value,
                                    );
                                    if (found) {
                                      setCustomerName(found.guestName);
                                      if (found.roomNumber)
                                        setTableOrRoom(`Room ${found.roomNumber}`);
                                    }
                                  }}
                                >
                                  <option value="">— Select checked-in guest / room —</option>
                                  {(inHouseGuests ?? []).map((r) => (
                                    <option key={r.reservationId} value={r.reservationId}>
                                      {r.roomNumber ? `Room ${r.roomNumber} · ` : ''}
                                      {r.guestName} ({r.code} · {r.status})
                                    </option>
                                  ))}
                                </SelectInput>
                              )}
                            </>
                          )}
                        </div>
                      )}

                      <TextInput
                        label="Order / Kitchen Note"
                        placeholder="Allergies, serving instructions…"
                        value={orderNotes}
                        onChange={(e) => setOrderNotes(e.target.value)}
                      />

                      {/* Action Buttons: Edit Bill vs Add Round vs Stage 1 (Hold & Print Bill) / Stage 2 (Confirm Payment) */}
                      {editingOpenOrder ? (
                        <div className="grid grid-cols-1 gap-2 pt-1">
                          <Button
                            variant="primary"
                            size="lg"
                            className="w-full"
                            icon={<CheckCircle2 className="size-4" />}
                            loading={placeOrder.isPending}
                            onClick={() => placeOrder.mutate(false)}
                          >
                            Save Updated Bill · {editingOpenOrder.orderNumber} (
                            {money(cartTotalMinor.toString(), currency)})
                          </Button>
                          <Button
                            variant="secondary"
                            size="sm"
                            className="w-full"
                            icon={<Printer className="size-3.5" />}
                            onClick={() => printPosSlip(editingOpenOrder.id, 'BILL')}
                          >
                            Print Updated Guest Bill (Invoice)
                          </Button>
                        </div>
                      ) : targetOpenOrder ? (
                        <Button
                          variant="primary"
                          size="lg"
                          className="w-full"
                          icon={<Flame className="size-4" />}
                          loading={placeOrder.isPending}
                          onClick={() => placeOrder.mutate(false)}
                        >
                          Add Round to {targetOpenOrder.orderNumber} (
                          {money(cartTotalMinor.toString(), currency)})
                        </Button>
                      ) : (
                        <div className="grid grid-cols-1 gap-2 pt-1">
                          <Button
                            variant="primary"
                            size="lg"
                            className="w-full"
                            icon={<Flame className="size-4" />}
                            loading={placeOrder.isPending}
                            disabled={cart.length === 0}
                            onClick={() => placeOrder.mutate(false)}
                          >
                            1. Hold Bill & Issue Guest Check (Pay Later ·{' '}
                            {money(cartTotalMinor.toString(), currency)})
                          </Button>

                          <Button
                            variant="secondary"
                            size="md"
                            className="w-full"
                            icon={<Receipt className="size-3.5" />}
                            loading={placeOrder.isPending}
                            disabled={
                              cart.length === 0 ||
                              (paymentMethod === 'ROOM_FOLIO' && !reservationId)
                            }
                            onClick={() => placeOrder.mutate(true)}
                          >
                            {paymentMethod === 'ROOM_FOLIO'
                              ? `2. Post ${money(cartTotalMinor.toString(), currency)} to Room Folio`
                              : `2. Confirm Payment Now & Final Receipt · ${money(cartTotalMinor.toString(), currency)}`}
                          </Button>
                        </div>
                      )}
                    </div>
                  )}
                </Section>
              </div>
            </div>
          )}
        </>
      )}

      {/* 1. Confirm Payment & Issue Final Receipt Modal */}
      <Dialog
        open={!!settleModalOrder}
        onClose={() => setSettleModalOrder(null)}
        size="sm"
        title={`Confirm Payment & Issue Final Receipt · ${settleModalOrder?.orderNumber ?? ''}`}
        description={`${settleModalOrder?.tableOrRoom || 'Counter'} · ${settleModalOrder?.customerName || 'Walk-in Guest'} · Waiter: ${settleModalOrder?.servedByName || 'Staff'}`}
      >
        {settleModalOrder && (
          <div className="grid gap-3.5">
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11.5px] text-amber-800 dark:text-amber-300">
              <strong>Stage 2 — Record & Confirm Payment:</strong> Confirming payment closes this
              waiting bill (`{settleModalOrder.orderNumber}`) and generates the official numbered{' '}
              <strong>Final Payment Receipt</strong>.
            </div>

            <div className="rounded-xl border border-line bg-surface-2 p-3 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-fg-muted">Items ({settleModalOrder.items.length})</span>
                <span className="font-mono font-semibold">
                  {money(settleModalOrder.subtotalMinor, settleModalOrder.currency)}
                </span>
              </div>
              <div className="mt-1.5 flex items-center justify-between border-t border-line pt-1.5 text-sm font-bold">
                <span>Total Amount to Confirm</span>
                <span className="font-mono">
                  {money(
                    (
                      BigInt(settleModalOrder.subtotalMinor) -
                      BigInt(
                        /^\d+$/.test(settleDiscount.trim()) ? settleDiscount.trim() : '0',
                      )
                    ).toString(),
                    settleModalOrder.currency,
                  )}
                </span>
              </div>
            </div>

            <SelectInput
              label="Confirmed Payment Method *"
              value={settleMethod}
              onChange={(e) => setSettleMethod(e.target.value as PosPaymentMethod)}
            >
              <option value="CASH">Cash Received (Issue Final 80mm Receipt)</option>
              <option value="MOBILE_MONEY">Mobile Money Confirmed (Issue Final Receipt)</option>
              <option value="CARD">Card POS Approved (Issue Final Receipt)</option>
              <option value="ROOM_FOLIO">Post to Resident Room Folio</option>
              <option value="BANK_TRANSFER">Bank Transfer Confirmed</option>
            </SelectInput>

            {settleMethod === 'ROOM_FOLIO' && (
              <SelectInput
                label="Select Resident Guest / Room"
                value={settleResId}
                onChange={(e) => setSettleResId(e.target.value)}
              >
                <option value="">— Choose room reservation —</option>
                {(inHouseGuests ?? []).map((r) => (
                  <option key={r.reservationId} value={r.reservationId}>
                    {r.roomNumber ? `Room ${r.roomNumber} · ` : ''}
                    {r.guestName} ({r.code})
                  </option>
                ))}
              </SelectInput>
            )}

            <div className="grid grid-cols-2 gap-2">
              <TextInput
                label={`Discount (${settleModalOrder.currency})`}
                value={settleDiscount}
                onChange={(e) => setSettleDiscount(e.target.value)}
              />
              <TextInput
                label="Payment Ref / Transaction ID"
                placeholder="MoMo ID, POS Auth, or Slip #"
                value={settleRef}
                onChange={(e) => setSettleRef(e.target.value)}
              />
            </div>

            {settleMethod === 'CASH' && (
              <TextInput
                label="Cash Tendered by Client (Optional change calc)"
                placeholder="e.g. 50000"
                value={settleTendered}
                onChange={(e) => setSettleTendered(e.target.value)}
                hint={
                  /^\d+$/.test(settleTendered.trim()) &&
                  BigInt(settleTendered.trim()) >= BigInt(settleModalOrder.totalMinor)
                    ? `Change due to client: ${money((BigInt(settleTendered.trim()) - BigInt(settleModalOrder.totalMinor)).toString(), settleModalOrder.currency)}`
                    : undefined
                }
              />
            )}

            <div className="flex items-center justify-between gap-2 pt-2">
              <Button
                variant="secondary"
                size="sm"
                icon={<Printer className="size-3.5" />}
                onClick={() => printPosSlip(settleModalOrder.id, 'BILL')}
              >
                Print First Bill
              </Button>
              <div className="flex items-center gap-2">
                <Button variant="ghost" onClick={() => setSettleModalOrder(null)}>
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  icon={<CheckCircle2 className="size-4" />}
                  loading={settleOrderMut.isPending}
                  disabled={settleMethod === 'ROOM_FOLIO' && !settleResId}
                  onClick={() => settleOrderMut.mutate()}
                >
                  Confirm Payment & Print Final Receipt
                </Button>
              </div>
            </div>
          </div>
        )}
      </Dialog>

      {/* 2. Add / Edit Menu Item Modal */}
      <Dialog
        open={menuModalOpen}
        onClose={() => setMenuModalOpen(false)}
        size="md"
        title={editingItem ? `Edit Menu Item · ${editingItem.name}` : 'Add New POS Menu Item'}
        description={`Outlet: ${currentOutlet?.name ?? 'POS'}`}
      >
        <form
          className="grid gap-3.5"
          onSubmit={(e) => {
            e.preventDefault();
            saveMenuItem.mutate();
          }}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <SelectInput
              label="Category"
              value={itemForm.categoryId}
              onChange={(e) => setItemForm({ ...itemForm, categoryId: e.target.value })}
            >
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </SelectInput>
            <TextInput
              label="SKU Code"
              value={itemForm.sku}
              onChange={(e) => setItemForm({ ...itemForm, sku: e.target.value })}
              placeholder="e.g. BAR-HOT-09"
            />
          </div>

          <TextInput
            label="Menu Item Name"
            value={itemForm.name}
            onChange={(e) => setItemForm({ ...itemForm, name: e.target.value })}
            placeholder="e.g. Mount Elgon Iced Caramel Macchiato"
          />

          <TextInput
            label="Description / Ingredients (Optional)"
            value={itemForm.description}
            onChange={(e) => setItemForm({ ...itemForm, description: e.target.value })}
            placeholder="Double shot Arabica espresso over ice…"
          />

          <div className="grid gap-3 sm:grid-cols-3">
            <TextInput
              label="Price (UGX)"
              value={itemForm.priceMinorUGX}
              onChange={(e) => setItemForm({ ...itemForm, priceMinorUGX: e.target.value })}
              placeholder="e.g. 15000"
            />
            <TextInput
              label="Price (USD Optional)"
              value={itemForm.priceMinorUSD}
              onChange={(e) => setItemForm({ ...itemForm, priceMinorUSD: e.target.value })}
              placeholder="e.g. 5"
            />
            <TextInput
              label="Prep Time (Mins)"
              value={itemForm.prepMinutes}
              onChange={(e) => setItemForm({ ...itemForm, prepMinutes: e.target.value })}
              placeholder="10"
            />
          </div>

          <SelectInput
            label="Link to Inventory Stock SKU (Auto-deducts on sale)"
            value={itemForm.inventoryItemId}
            onChange={(e) => setItemForm({ ...itemForm, inventoryItemId: e.target.value })}
          >
            <option value="">— Not linked to stock count —</option>
            {(stockItems ?? []).map((s) => (
              <option key={s.id} value={s.id}>
                {s.sku} · {s.name} (In stock: {s.onHand} {s.unit})
              </option>
            ))}
          </SelectInput>

          <div className="flex items-center justify-between pt-2">
            {editingItem && isOwner ? (
              <Button
                type="button"
                variant="danger"
                size="sm"
                onClick={() => setDeletingMenuItem(editingItem)}
              >
                Delete Item
              </Button>
            ) : (
              <span />
            )}
            <div className="flex items-center gap-2">
              <Button type="button" variant="ghost" onClick={() => setMenuModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" loading={saveMenuItem.isPending}>
                {editingItem ? 'Save Changes' : 'Add to Menu'}
              </Button>
            </div>
          </div>
        </form>
      </Dialog>

      {/* 3. Create Category Modal */}
      <Dialog
        open={catModalOpen}
        onClose={() => setCatModalOpen(false)}
        size="sm"
        title="Add Menu Category"
        description={`Create a new section in ${currentOutlet?.name ?? 'this outlet'}.`}
      >
        <form
          className="grid gap-3.5"
          onSubmit={(e) => {
            e.preventDefault();
            createCategoryMut.mutate();
          }}
        >
          <TextInput
            label="Category Name"
            placeholder="e.g. Signature Desserts & Pastries"
            value={catForm.name}
            onChange={(e) => setCatForm({ ...catForm, name: e.target.value })}
          />
          <TextInput
            label="Display Order"
            placeholder="10"
            value={catForm.sortOrder}
            onChange={(e) => setCatForm({ ...catForm, sortOrder: e.target.value })}
          />
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={() => setCatModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={createCategoryMut.isPending}>
              Create Category
            </Button>
          </div>
        </form>
      </Dialog>

      {/* 4. Shift Sales, Waiters & Handover Modal */}
      <Dialog
        open={shiftModalOpen}
        onClose={() => setShiftModalOpen(false)}
        size="lg"
        title="Waiters, Shift Handover & POS Z-Report"
        description="Individual waiter attribution, shift handover of open unpaid bills, and confirmed vs waiting revenue breakdown."
      >
        <div className="grid gap-4">
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            <div className="rounded-xl border border-line bg-surface-2 p-3">
              <p className="text-[11px] text-fg-muted">Confirmed Paid (UGX)</p>
              <p className="mt-1 font-mono text-base font-bold text-emerald-600 dark:text-emerald-400">
                {money(todaySalesMinor.toString(), 'UGX')}
              </p>
            </div>
            <div className="rounded-xl border border-line bg-surface-2 p-3">
              <p className="text-[11px] text-fg-muted">Waiting Payment (UGX)</p>
              <p className="mt-1 font-mono text-base font-bold text-amber-500">
                {money(waitingSalesMinor.toString(), 'UGX')}
              </p>
            </div>
            <div className="rounded-xl border border-line bg-surface-2 p-3">
              <p className="text-[11px] text-fg-muted">Paid Receipts</p>
              <p className="mt-1 font-mono text-base font-bold">{paidOrders.length}</p>
            </div>
            <div className="rounded-xl border border-line bg-surface-2 p-3">
              <p className="text-[11px] text-fg-muted">Waiting Bills</p>
              <p className="mt-1 font-mono text-base font-bold text-amber-500">
                {openTabs.length}
              </p>
            </div>
          </div>

          {/* Individual Waiters & Shift Accountability */}
          <div className="rounded-xl border border-line p-3.5">
            <div className="mb-2 flex items-center justify-between">
              <h4 className="text-xs font-bold uppercase tracking-wider text-fg-subtle">
                Waiters on Shift · Individual Bill Attribution
              </h4>
              <span className="text-[11px] text-fg-muted">
                Tracks every bill by waiter (`Individuals → Shifts → Changing`)
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-line text-[10.5px] uppercase text-fg-subtle">
                    <th className="py-1.5 pr-2">Waiter / Server</th>
                    <th className="px-2 py-1.5">Waiting Bills (Unpaid)</th>
                    <th className="px-2 py-1.5">Paid & Confirmed</th>
                    <th className="py-1.5 pl-2 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {Object.entries(shiftBreakdown.byWaiter).map(([waiter, stats]) => (
                    <tr key={waiter}>
                      <td className="py-2 pr-2 font-semibold text-fg">{waiter}</td>
                      <td className="px-2 py-2 font-mono text-amber-600 dark:text-amber-400">
                        {stats.openCount} bills · {money(stats.openTotal.toString(), 'UGX')}
                      </td>
                      <td className="px-2 py-2 font-mono text-emerald-600 dark:text-emerald-400">
                        {stats.paidCount} receipts · {money(stats.paidTotal.toString(), 'UGX')}
                      </td>
                      <td className="py-2 pl-2 text-right">
                        {stats.openCount > 0 && (
                          <button
                            type="button"
                            onClick={() => setHandoverFrom(waiter)}
                            className="rounded border border-line bg-surface-2 px-2 py-0.5 text-[11px] font-semibold hover:border-accent hover:text-accent"
                          >
                            Handover {stats.openCount} Open →
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Shift Handover Form (Transfer Open Waiting Bills between Waiters) */}
          <div className="rounded-xl border border-line bg-surface-2/50 p-3.5">
            <h4 className="mb-1 text-xs font-bold uppercase tracking-wider text-fg">
              Change Shift · Handover Open Waiting Bills
            </h4>
            <p className="mb-3 text-[11.5px] text-fg-muted">
              When a waiter finishes their shift, transfer their open unpaid bills (`Waiting Payment`)
              to the incoming waiter and log an official shift handover announcement.
            </p>
            <div className="grid gap-2.5 sm:grid-cols-3">
              <TextInput
                label="Outgoing Waiter (From)"
                placeholder="Leave blank for all open bills"
                value={handoverFrom}
                onChange={(e) => setHandoverFrom(e.target.value)}
              />
              <TextInput
                label="Incoming Waiter (To) *"
                placeholder="e.g. Samuel Kiprop"
                value={handoverTo}
                onChange={(e) => setHandoverTo(e.target.value)}
              />
              <TextInput
                label="Shift Handover Notes"
                placeholder="e.g. Table 4 waiting for MoMo confirmation"
                value={handoverNotes}
                onChange={(e) => setHandoverNotes(e.target.value)}
              />
            </div>
            <div className="mt-3 flex justify-end">
              <Button
                variant="primary"
                size="sm"
                loading={handoverShiftMut.isPending}
                disabled={!handoverTo.trim() || openTabs.length === 0}
                onClick={() => handoverShiftMut.mutate()}
              >
                Transfer Open Bills & Record Shift Change
              </Button>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-xl border border-line p-3.5">
              <h4 className="mb-2 text-xs font-bold uppercase tracking-wider text-fg-subtle">
                By Settlement Status & Method
              </h4>
              <ul className="divide-y divide-line text-xs">
                {Object.entries(shiftBreakdown.byMethod).map(([k, val]) => (
                  <li key={k} className="flex items-center justify-between py-1.5">
                    <span>
                      {k === 'OPEN_TAB'
                        ? 'Waiting Payment (Unpaid Bills)'
                        : (PAYMENT_LABELS[k as PosPaymentMethod] ?? k)}
                    </span>
                    <span className="font-mono font-semibold">{money(val.toString(), 'UGX')}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-xl border border-line p-3.5">
              <h4 className="mb-2 text-xs font-bold uppercase tracking-wider text-fg-subtle">
                By Outlet
              </h4>
              <ul className="divide-y divide-line text-xs">
                {Object.entries(shiftBreakdown.byOutlet).map(([name, info]) => (
                  <li key={name} className="flex items-center justify-between py-1.5">
                    <span>
                      {name} <span className="text-fg-subtle">({info.count})</span>
                    </span>
                    <span className="font-mono font-semibold">
                      {money(info.total.toString(), 'UGX')}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => window.print()} icon={<Printer className="size-3.5" />}>
              Print Shift Report
            </Button>
            <Button variant="primary" onClick={() => setShiftModalOpen(false)}>
              Done
            </Button>
          </div>
        </div>
      </Dialog>


      {/* Delete Menu Item Confirmation Prompt */}
      {deletingMenuItem && (
        <DeleteConfirmDialog
          open={!!deletingMenuItem}
          onClose={() => setDeletingMenuItem(null)}
          onConfirm={() => deleteMenuItem.mutate(deletingMenuItem.id)}
          title={`Delete Menu Item · ${deletingMenuItem.name}?`}
          itemName={`${deletingMenuItem.name} (${deletingMenuItem.sku})`}
          itemType="POS Menu Product"
          warning={`This item will be removed from POS terminals and waiter order tablets. If orders have previously sold this item, it will be safely disabled to preserve past revenue reports.`}
          requireMatch="DELETE"
          loading={deleteMenuItem.isPending}
        />
      )}

      {/* Delete POS Category Confirmation Prompt */}
      {deletingCat && (
        <DeleteConfirmDialog
          open={!!deletingCat}
          onClose={() => setDeletingCat(null)}
          onConfirm={() => deletePosCatMut.mutate(deletingCat.id)}
          title={`Delete Category · ${deletingCat.name}?`}
          itemName={deletingCat.name}
          itemType="POS Outlet Category"
          warning="This category will be permanently removed from this outlet's menu. Categories containing active items cannot be deleted."
          requireMatch="DELETE"
          loading={deletePosCatMut.isPending}
        />
      )}
    </div>
  );
}
