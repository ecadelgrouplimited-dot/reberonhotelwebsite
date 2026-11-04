'use client';
import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { PosCategoryDTO, PosItemDTO, PosOutletDTO } from '@reberon/contracts';
import { ApiError, post, patch } from '@/lib/api';
import { toMinorStr } from '@/lib/money';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { SelectInput, Switch, TextInput } from '@/components/ui/field';
import { toMajorStr } from './pos-kit';

export interface PosStockItem {
  id: string;
  sku: string;
  name: string;
  category: string;
  department: string;
  onHand: number;
  unit: string;
}

const blankForm = {
  categoryId: '',
  sku: '',
  name: '',
  description: '',
  priceUGX: '',
  priceUSD: '',
  prepMinutes: '10',
  inventoryItemId: '',
  isAvailable: true,
};

/** Add or edit a menu item. Prices are typed in normal units (shillings, dollars). */
export function MenuItemDialog({
  open,
  item,
  outlet,
  defaultCategoryId,
  stockItems,
  canDelete,
  onClose,
  onDelete,
}: {
  open: boolean;
  item: PosItemDTO | null;
  outlet: PosOutletDTO | undefined;
  defaultCategoryId: string;
  stockItems: PosStockItem[];
  canDelete: boolean;
  onClose: () => void;
  onDelete: (item: PosItemDTO) => void;
}) {
  const qc = useQueryClient();
  const [form, setForm] = useState(blankForm);
  const categories: PosCategoryDTO[] = outlet?.categories ?? [];

  useEffect(() => {
    if (!open) return;
    if (item) {
      setForm({
        categoryId: item.categoryId,
        sku: item.sku,
        name: item.name,
        description: item.description ?? '',
        priceUGX: item.priceMinorUGX,
        priceUSD: item.priceMinorUSD ? toMajorStr(item.priceMinorUSD, 'USD') : '',
        prepMinutes: item.prepMinutes !== null ? String(item.prepMinutes) : '',
        inventoryItemId: item.inventoryItemId ?? '',
        isAvailable: item.isAvailable,
      });
    } else {
      const prefix = outlet?.code.slice(0, 3).toUpperCase() ?? 'POS';
      setForm({
        ...blankForm,
        categoryId: defaultCategoryId || categories[0]?.id || '',
        sku: `${prefix}-${Math.floor(100 + Math.random() * 900)}`,
      });
    }
    // Reset only when the dialog opens for a new target.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, item]);

  const ugx = toMinorStr(form.priceUGX, 'UGX');
  const usd = form.priceUSD.trim() ? toMinorStr(form.priceUSD, 'USD') : null;
  const usdInvalid = !!form.priceUSD.trim() && usd === null;

  const save = useMutation({
    mutationFn: () => {
      const body = {
        categoryId: form.categoryId,
        sku: form.sku.trim(),
        name: form.name.trim(),
        description: form.description.trim() || null,
        priceMinorUGX: ugx!,
        priceMinorUSD: usd,
        prepMinutes: form.prepMinutes ? Number(form.prepMinutes) : null,
        inventoryItemId: form.inventoryItemId || null,
        isAvailable: form.isAvailable,
      };
      return item ? patch(`/pos/items/${item.id}`, body) : post('/pos/items', body);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pos', 'outlets'] });
      toast.success(item ? `${form.name} updated` : `${form.name} added to the menu`);
      onClose();
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Could not save menu item'),
  });

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="md"
      title={item ? `Edit · ${item.name}` : 'New menu item'}
      description={outlet?.name}
    >
      <form
        className="grid gap-3.5"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <TextInput
          label="Name"
          required
          autoFocus={!item}
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          placeholder="e.g. Mount Elgon Iced Caramel Macchiato"
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <SelectInput
            label="Category"
            value={form.categoryId}
            onChange={(e) => setForm({ ...form, categoryId: e.target.value })}
          >
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </SelectInput>
          <TextInput label="SKU" value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} />
        </div>
        <TextInput
          label="Description"
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          placeholder="Shown to staff on the order screen"
        />
        <div className="grid gap-3 sm:grid-cols-3">
          <TextInput
            label="Price (UGX)"
            required
            inputMode="numeric"
            value={form.priceUGX}
            onChange={(e) => setForm({ ...form, priceUGX: e.target.value })}
            placeholder="15000"
          />
          <TextInput
            label="Price (USD)"
            inputMode="decimal"
            value={form.priceUSD}
            onChange={(e) => setForm({ ...form, priceUSD: e.target.value })}
            placeholder="Optional · e.g. 4.50"
            error={usdInvalid ? 'Enter dollars, e.g. 4.50' : undefined}
            hint={usdInvalid ? undefined : 'Leave blank to sell in UGX only'}
          />
          <TextInput
            label="Prep time (min)"
            inputMode="numeric"
            value={form.prepMinutes}
            onChange={(e) => setForm({ ...form, prepMinutes: e.target.value })}
          />
        </div>
        <SelectInput
          label="Deduct from stock item"
          value={form.inventoryItemId}
          onChange={(e) => setForm({ ...form, inventoryItemId: e.target.value })}
        >
          <option value="">— Not linked to stock —</option>
          {stockItems.map((s) => (
            <option key={s.id} value={s.id}>
              {s.sku} · {s.name} ({s.onHand} {s.unit} on hand)
            </option>
          ))}
        </SelectInput>
        <Switch
          checked={form.isAvailable}
          onChange={(v) => setForm({ ...form, isAvailable: v })}
          label="Available to order"
          hint="Turn off to mark it sold out (86) without deleting it."
        />
        <div className="flex items-center justify-between border-t border-line pt-3">
          {item && canDelete ? (
            <Button type="button" variant="danger" size="sm" onClick={() => onDelete(item)}>
              Delete item
            </Button>
          ) : (
            <span />
          )}
          <div className="flex items-center gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              loading={save.isPending}
              disabled={!form.name.trim() || !form.categoryId || ugx === null || usdInvalid}
            >
              {item ? 'Save changes' : 'Add to menu'}
            </Button>
          </div>
        </div>
      </form>
    </Dialog>
  );
}

export function CategoryDialog({
  open,
  outlet,
  onClose,
}: {
  open: boolean;
  outlet: PosOutletDTO | undefined;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [sortOrder, setSortOrder] = useState('10');

  const create = useMutation({
    mutationFn: () =>
      post('/pos/categories', { outletId: outlet!.id, name: name.trim(), sortOrder: Number(sortOrder) || 10 }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pos', 'outlets'] });
      toast.success(`${name.trim()} added`);
      setName('');
      setSortOrder('10');
      onClose();
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Could not create category'),
  });

  return (
    <Dialog open={open} onClose={onClose} size="sm" title="New menu category" description={outlet?.name}>
      <form
        className="grid gap-3.5"
        onSubmit={(e) => {
          e.preventDefault();
          create.mutate();
        }}
      >
        <TextInput
          label="Name"
          autoFocus
          placeholder="e.g. Desserts & Pastries"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <TextInput
          label="Display order"
          inputMode="numeric"
          hint="Lower numbers show first."
          value={sortOrder}
          onChange={(e) => setSortOrder(e.target.value)}
        />
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" loading={create.isPending} disabled={name.trim().length < 2 || !outlet}>
            Create category
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
