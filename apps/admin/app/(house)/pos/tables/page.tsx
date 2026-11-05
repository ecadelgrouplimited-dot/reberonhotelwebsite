'use client';

import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Armchair,
  CopyPlus,
  Eye,
  EyeOff,
  Minus,
  Pencil,
  Plus,
  Trash2,
  Users,
} from 'lucide-react';
import type { PosTableDTO } from '@reberon/contracts';
import { ApiError, del, get, patch, post } from '@/lib/api';
import { useMe } from '@/lib/providers';
import { money } from '@/lib/money';
import { cn } from '@/lib/cn';
import { useNow } from '@/lib/use-now';
import { Button } from '@/components/ui/button';
import { Empty, PageHeader, Skeleton } from '@/components/ui/bits';
import { Dialog } from '@/components/ui/dialog';
import { useConfirm } from '@/components/ui/confirm';
import { Switch, TextInput } from '@/components/ui/field';
import { AgeBadge } from '@/components/pos/pos-kit';
import { byArea } from '@/components/pos/floor';

interface TableForm {
  name: string;
  area: string;
  seats: number;
  notes: string;
  isActive: boolean;
}

const KEY = ['pos', 'tables', 'all'];

export default function TablesPage() {
  const me = useMe();
  const qc = useQueryClient();
  const confirm = useConfirm();
  const now = useNow();
  const canManage = me.role === 'OWNER' || me.role === 'MANAGER';

  const [showHidden, setShowHidden] = useState(true);
  const [editing, setEditing] = useState<{ table: PosTableDTO | null; area?: string } | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [renaming, setRenaming] = useState<string | null>(null);

  const { data: tables, isLoading } = useQuery({
    queryKey: KEY,
    queryFn: () => get<PosTableDTO[]>('/pos/tables?all=1'),
    refetchInterval: 20_000,
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['pos', 'tables'] });
  };
  const fail = (fallback: string) => (e: unknown) => toast.error(e instanceof ApiError ? e.message : fallback);

  const update = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Partial<TableForm> & { sortOrder?: number } }) =>
      patch<PosTableDTO>(`/pos/tables/${id}`, body),
    onSuccess: refresh,
    onError: fail('Could not update the table'),
  });

  const reorder = useMutation({
    mutationFn: (ids: string[]) => post<PosTableDTO[]>('/pos/tables/reorder', { ids }),
    onSuccess: (rows) => qc.setQueryData(KEY, rows),
    onError: fail('Could not reorder'),
  });

  const remove = useMutation({
    mutationFn: (t: PosTableDTO) => del(`/pos/tables/${t.id}`),
    onSuccess: (_r, t) => {
      refresh();
      toast.success(`${t.name} removed`);
    },
    onError: fail('Could not delete the table'),
  });

  const all = tables ?? [];
  const shown = showHidden ? all : all.filter((t) => t.isActive);
  const areas = useMemo(() => [...new Set(all.map((t) => t.area))], [all]);
  const active = all.filter((t) => t.isActive);
  const occupied = active.filter((t) => t.openBills.length > 0).length;
  const seats = active.reduce((a, t) => a + t.seats, 0);

  const move = (t: PosTableDTO, dir: -1 | 1) => {
    // Move within its area; the area's position on the floor follows its first table.
    const ids = all.map((x) => x.id);
    const sameArea = all.filter((x) => x.area === t.area);
    const pos = sameArea.findIndex((x) => x.id === t.id);
    const swap = sameArea[pos + dir];
    if (!swap) return;
    const a = ids.indexOf(t.id);
    const b = ids.indexOf(swap.id);
    [ids[a], ids[b]] = [ids[b]!, ids[a]!];
    qc.setQueryData<PosTableDTO[]>(KEY, ids.map((id) => all.find((x) => x.id === id)!));
    reorder.mutate(ids);
  };

  const moveArea = (area: string, dir: -1 | 1) => {
    const groups = byArea(all);
    const i = groups.findIndex(([a]) => a === area);
    const j = i + dir;
    if (j < 0 || j >= groups.length) return;
    [groups[i], groups[j]] = [groups[j]!, groups[i]!];
    const ids = groups.flatMap(([, list]) => list.map((t) => t.id));
    qc.setQueryData<PosTableDTO[]>(KEY, ids.map((id) => all.find((x) => x.id === id)!));
    reorder.mutate(ids);
  };

  const deleteTable = async (t: PosTableDTO) => {
    const ok = await confirm({
      title: `Delete ${t.name}?`,
      body: t.billsToday
        ? `It has ${t.billsToday} bill(s) today. Past bills keep the name “${t.name}” on their receipts. To keep it for later, hide it instead.`
        : 'Past bills keep the table name on their receipts. To keep it for later, hide it instead.',
      confirm: 'Delete table',
      danger: true,
    });
    if (ok) remove.mutate(t);
  };

  return (
    <div className="fade-in pb-12">
      <PageHeader
        crumbs={[{ label: 'Point of Sale', href: '/pos' }, { label: 'Tables & Floor' }]}
        title="Tables & Floor"
        description="The tables, terrace spots and lounges waiters bill against. Changes show on every POS screen straight away."
        actions={
          <>
            <Button variant="ghost" size="md" href="/pos" icon={<ArrowLeft className="size-3.5" />}>
              Back to POS
            </Button>
            {canManage && (
              <>
                <Button variant="secondary" size="md" icon={<CopyPlus className="size-3.5" />} onClick={() => setBulkOpen(true)}>
                  Add several
                </Button>
                <Button variant="primary" size="md" icon={<Plus className="size-3.5" />} onClick={() => setEditing({ table: null })}>
                  Add table
                </Button>
              </>
            )}
          </>
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <Stat label="Tables in use" value={String(active.length)} sub={all.length > active.length ? `${all.length - active.length} hidden` : undefined} />
        <Stat label="Areas" value={String(areas.length)} />
        <Stat label="Seats" value={String(seats)} />
        <Stat label="Occupied now" value={`${occupied}/${active.length}`} tone={occupied ? 'text-warning' : 'text-success'} />
      </div>

      {!canManage && (
        <p className="mb-4 rounded-xl border border-line bg-surface-2/50 px-3.5 py-2.5 text-[12px] text-fg-muted">
          You can see the floor here. Only the owner or a manager can add, rename or remove tables.
        </p>
      )}

      {all.length > active.length && (
        <div className="mb-3 flex justify-end">
          <button
            type="button"
            onClick={() => setShowHidden((v) => !v)}
            className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-fg-muted hover:text-fg"
          >
            {showHidden ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
            {showHidden ? 'Hide hidden tables' : 'Show hidden tables'}
          </button>
        </div>
      )}

      {isLoading ? (
        <Skeleton className="h-80" />
      ) : !shown.length ? (
        <div className="card">
          <Empty
            icon={<Armchair className="size-5" />}
            title="No tables yet"
            body="Add each table once. Waiters then pick it with one tap, and the floor shows which are free."
            action={
              canManage ? (
                <Button variant="primary" size="sm" icon={<Plus className="size-3.5" />} onClick={() => setEditing({ table: null })}>
                  Add the first table
                </Button>
              ) : undefined
            }
          />
        </div>
      ) : (
        <div className="space-y-5">
          {byArea(shown).map(([area, list], gi, groups) => (
            <section key={area} className="card overflow-hidden">
              <header className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-surface-2/40 px-4 py-2.5">
                <div className="flex items-center gap-2">
                  <h2 className="text-[13.5px] font-bold">{area}</h2>
                  <span className="text-[11.5px] text-fg-muted">
                    {list.length} table{list.length === 1 ? '' : 's'} · {plural(list.reduce((a, t) => a + t.seats, 0), 'seat')}
                  </span>
                </div>
                {canManage && (
                  <div className="flex items-center gap-1">
                    <IconBtn label="Move area up" disabled={gi === 0} onClick={() => moveArea(area, -1)} icon={ArrowUp} />
                    <IconBtn label="Move area down" disabled={gi === groups.length - 1} onClick={() => moveArea(area, 1)} icon={ArrowDown} />
                    <Button size="sm" variant="ghost" icon={<Pencil className="size-3" />} onClick={() => setRenaming(area)}>
                      Rename
                    </Button>
                    <Button size="sm" variant="secondary" icon={<Plus className="size-3" />} onClick={() => setEditing({ table: null, area })}>
                      Table here
                    </Button>
                  </div>
                )}
              </header>
              <ul className="divide-y divide-line">
                {list.map((t, i) => {
                  const bill = t.openBills[0];
                  return (
                    <li key={t.id} className={cn('flex flex-wrap items-center gap-3 px-4 py-2.5', !t.isActive && 'opacity-55')}>
                      <span
                        className={cn(
                          'grid size-10 shrink-0 place-items-center rounded-xl font-display text-[12px] font-extrabold',
                          !t.isActive
                            ? 'bg-surface-2 text-fg-subtle'
                            : bill
                              ? 'bg-amber-500/15 text-warning'
                              : 'bg-emerald-500/12 text-success',
                        )}
                      >
                        <Armchair className="size-4.5" />
                      </span>
                      <div className="min-w-[9rem] flex-1">
                        <p className="flex items-center gap-2 text-[13.5px] font-bold">
                          {t.name}
                          {!t.isActive && <span className="rounded bg-surface-2 px-1.5 py-0.5 text-[10px] font-bold text-fg-muted">Hidden</span>}
                        </p>
                        <p className="flex flex-wrap items-center gap-x-2 text-[11.5px] text-fg-muted">
                          <span className="inline-flex items-center gap-1">
                            <Users className="size-3" /> {t.seats} seat{t.seats === 1 ? '' : 's'}
                          </span>
                          <span>· {t.billsToday} bill{t.billsToday === 1 ? '' : 's'} today</span>
                          {t.notes && <span className="truncate">· {t.notes}</span>}
                        </p>
                      </div>
                      {bill ? (
                        <span className="inline-flex items-center gap-2 rounded-lg border border-amber-500/40 bg-amber-500/8 px-2.5 py-1 text-[11.5px]">
                          <span className="font-semibold">{bill.servedByName || 'Staff'}</span>
                          <span className="font-mono font-bold tabular">{money(bill.totalMinor, bill.currency)}</span>
                          <AgeBadge iso={bill.createdAt} now={now} target={45} />
                        </span>
                      ) : (
                        t.isActive && <span className="text-[11.5px] font-semibold text-success">Free</span>
                      )}
                      {canManage && (
                        <div className="ml-auto flex items-center gap-0.5">
                          <IconBtn label="Move up" disabled={i === 0} onClick={() => move(t, -1)} icon={ArrowUp} />
                          <IconBtn label="Move down" disabled={i === list.length - 1} onClick={() => move(t, 1)} icon={ArrowDown} />
                          <IconBtn
                            label={t.isActive ? 'Hide from POS' : 'Show on POS'}
                            onClick={() =>
                              update.mutate(
                                { id: t.id, body: { isActive: !t.isActive } },
                                { onSuccess: () => toast.success(t.isActive ? `${t.name} hidden from the POS` : `${t.name} is back on the POS`) },
                              )
                            }
                            icon={t.isActive ? EyeOff : Eye}
                          />
                          <IconBtn label="Edit" onClick={() => setEditing({ table: t })} icon={Pencil} />
                          <IconBtn label="Delete" danger disabled={t.openBills.length > 0} onClick={() => deleteTable(t)} icon={Trash2} />
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}

      <TableDialog
        open={!!editing}
        table={editing?.table ?? null}
        defaultArea={editing?.area ?? areas[0] ?? 'Dining Room'}
        areas={areas}
        onClose={() => setEditing(null)}
        onSaved={refresh}
      />
      <BulkDialog open={bulkOpen} areas={areas} existing={all.map((t) => t.name)} onClose={() => setBulkOpen(false)} onSaved={refresh} />
      <RenameAreaDialog
        area={renaming}
        tables={all.filter((t) => t.area === renaming)}
        areas={areas}
        onClose={() => setRenaming(null)}
        onSaved={refresh}
      />
    </div>
  );
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: string }) {
  return (
    <div className="card px-4 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-fg-muted">{label}</p>
      <p className={cn('mt-0.5 font-display text-xl font-extrabold tabular', tone)}>{value}</p>
      {sub && <p className="text-[11px] text-fg-subtle">{sub}</p>}
    </div>
  );
}

function IconBtn({
  label,
  icon: Icon,
  onClick,
  disabled,
  danger,
}: {
  label: string;
  icon: typeof Pencil;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'grid size-8 place-items-center rounded-lg text-fg-subtle transition hover:bg-surface-2 hover:text-fg disabled:pointer-events-none disabled:opacity-30',
        danger && 'hover:bg-danger/10 hover:text-danger',
      )}
    >
      <Icon className="size-3.5" />
    </button>
  );
}

function SeatStepper({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <div className="grid gap-1.5">
      <span className="text-[12.5px] font-medium">Seats</span>
      <div className="flex h-9 items-center overflow-hidden rounded-lg border border-line-strong">
        <button type="button" aria-label="Fewer seats" onClick={() => onChange(Math.max(1, value - 1))} className="grid h-full w-9 place-items-center hover:bg-surface-2">
          <Minus className="size-3.5" />
        </button>
        <input
          inputMode="numeric"
          aria-label="Seats"
          className="h-full w-full min-w-0 bg-transparent text-center font-mono text-[13px] font-bold tabular outline-none"
          value={value}
          onChange={(e) => onChange(Math.min(100, Math.max(1, Number(e.target.value.replace(/\D/g, '')) || 1)))}
        />
        <button type="button" aria-label="More seats" onClick={() => onChange(Math.min(100, value + 1))} className="grid h-full w-9 place-items-center hover:bg-surface-2">
          <Plus className="size-3.5" />
        </button>
      </div>
    </div>
  );
}

function AreaInput({ value, onChange, areas }: { value: string; onChange: (v: string) => void; areas: string[] }) {
  return (
    <div className="grid gap-1.5">
      <TextInput label="Area" list="pos-areas" value={value} onChange={(e) => onChange(e.target.value)} placeholder="e.g. Terrace" />
      <datalist id="pos-areas">
        {areas.map((a) => (
          <option key={a} value={a} />
        ))}
      </datalist>
      {areas.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {areas.map((a) => (
            <button
              key={a}
              type="button"
              onClick={() => onChange(a)}
              className={cn(
                'rounded-md px-2 py-0.5 text-[11px] font-semibold',
                value === a ? 'bg-fg text-bg' : 'bg-surface-2 text-fg-muted hover:text-fg',
              )}
            >
              {a}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function TableDialog({
  open,
  table,
  defaultArea,
  areas,
  onClose,
  onSaved,
}: {
  open: boolean;
  table: PosTableDTO | null;
  defaultArea: string;
  areas: string[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<TableForm>({ name: '', area: defaultArea, seats: 4, notes: '', isActive: true });

  useEffect(() => {
    if (!open) return;
    setForm(
      table
        ? { name: table.name, area: table.area, seats: table.seats, notes: table.notes ?? '', isActive: table.isActive }
        : { name: '', area: defaultArea, seats: 4, notes: '', isActive: true },
    );
  }, [open, table, defaultArea]);

  const save = useMutation({
    mutationFn: () => {
      const body = { name: form.name.trim(), area: form.area.trim() || 'Dining Room', seats: form.seats, notes: form.notes.trim() || null, isActive: form.isActive };
      return table ? patch<PosTableDTO>(`/pos/tables/${table.id}`, body) : post<PosTableDTO>('/pos/tables', body);
    },
    onSuccess: (t) => {
      onSaved();
      toast.success(table ? `${t.name} saved` : `${t.name} added to ${t.area}`);
      onClose();
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Could not save the table'),
  });

  return (
    <Dialog open={open} onClose={onClose} size="sm" title={table ? `Edit ${table.name}` : 'Add a table'}>
      <form
        className="grid gap-3.5"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <TextInput label="Name" required autoFocus value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Table 7, Fireplace, Garden 2" />
        <AreaInput value={form.area} onChange={(area) => setForm({ ...form, area })} areas={areas} />
        <SeatStepper value={form.seats} onChange={(seats) => setForm({ ...form, seats })} />
        <TextInput label="Notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Optional — e.g. by the window, wheelchair friendly" />
        <Switch checked={form.isActive} onChange={(isActive) => setForm({ ...form, isActive })} label="Show on the POS" hint="Hide a table that is out of use without losing its history." />
        <div className="flex justify-end gap-2 border-t border-line pt-3">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" loading={save.isPending} disabled={!form.name.trim()}>
            {table ? 'Save' : 'Add table'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

/** "Table 7 … Table 12" in one go. */
function BulkDialog({
  open,
  areas,
  existing,
  onClose,
  onSaved,
}: {
  open: boolean;
  areas: string[];
  existing: string[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [prefix, setPrefix] = useState('Table');
  const [from, setFrom] = useState('1');
  const [to, setTo] = useState('4');
  const [area, setArea] = useState('');
  const [seats, setSeats] = useState(4);

  useEffect(() => {
    if (!open) return;
    const p = prefix.trim();
    const nums = existing
      .map((n) => (n.startsWith(`${p} `) ? Number(n.slice(p.length + 1)) : NaN))
      .filter((n) => Number.isInteger(n));
    const next = nums.length ? Math.max(...nums) + 1 : 1;
    setFrom(String(next));
    setTo(String(next + 3));
    setArea((a) => a || areas[0] || 'Dining Room');
    // Suggest the next free numbers each time the dialog opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const a = Number(from);
  const b = Number(to);
  const valid = Number.isInteger(a) && Number.isInteger(b) && a >= 0 && b >= a && b - a < 50 && prefix.trim();
  const names = valid ? Array.from({ length: b - a + 1 }, (_, i) => `${prefix.trim()} ${a + i}`) : [];
  const clash = names.filter((n) => existing.includes(n));

  const create = useMutation({
    mutationFn: async () => {
      for (const name of names.filter((n) => !existing.includes(n))) {
        await post('/pos/tables', { name, area: area.trim() || 'Dining Room', seats });
      }
    },
    onSuccess: () => {
      onSaved();
      toast.success(`${names.length - clash.length} tables added`);
      onClose();
    },
    onError: (e) => {
      onSaved();
      toast.error(e instanceof ApiError ? e.message : 'Some tables could not be added');
    },
  });

  return (
    <Dialog open={open} onClose={onClose} size="sm" title="Add several tables" description="Numbered tables in one step.">
      <form
        className="grid gap-3.5"
        onSubmit={(e) => {
          e.preventDefault();
          create.mutate();
        }}
      >
        <div className="grid grid-cols-[1fr_5rem_5rem] gap-2">
          <TextInput label="Name" value={prefix} onChange={(e) => setPrefix(e.target.value)} />
          <TextInput label="From" inputMode="numeric" value={from} onChange={(e) => setFrom(e.target.value.replace(/\D/g, ''))} />
          <TextInput label="To" inputMode="numeric" value={to} onChange={(e) => setTo(e.target.value.replace(/\D/g, ''))} />
        </div>
        <AreaInput value={area} onChange={setArea} areas={areas} />
        <SeatStepper value={seats} onChange={setSeats} />
        <p className="rounded-lg bg-surface-2/60 px-3 py-2 text-[12px] text-fg-muted">
          {names.length ? (
            <>
              Adds <strong className="text-fg">{names.length - clash.length}</strong>: {names.slice(0, 6).join(', ')}
              {names.length > 6 && ' …'}
              {clash.length > 0 && <span className="text-warning"> · skips {clash.join(', ')} (already exist)</span>}
            </>
          ) : (
            'Enter a range, e.g. 7 to 10 (up to 50 at once).'
          )}
        </p>
        <div className="flex justify-end gap-2 border-t border-line pt-3">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" loading={create.isPending} disabled={!names.length || names.length === clash.length}>
            Add tables
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function RenameAreaDialog({
  area,
  tables,
  areas,
  onClose,
  onSaved,
}: {
  area: string | null;
  tables: PosTableDTO[];
  areas: string[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState('');
  useEffect(() => setName(area ?? ''), [area]);
  const merging = !!name.trim() && name.trim() !== area && areas.includes(name.trim());

  const save = useMutation({
    mutationFn: async () => {
      for (const t of tables) await patch(`/pos/tables/${t.id}`, { area: name.trim() });
    },
    onSuccess: () => {
      onSaved();
      toast.success(merging ? `Moved ${tables.length} tables into ${name.trim()}` : `Renamed to ${name.trim()}`);
      onClose();
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Could not rename the area'),
  });

  return (
    <Dialog open={!!area} onClose={onClose} size="sm" title={`Rename ${area ?? ''}`} description={`${tables.length} tables are in this area.`}>
      <form
        className="grid gap-3.5"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <TextInput
          label="Area name"
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          hint={merging ? `${name.trim()} already exists — its tables will be merged.` : undefined}
        />
        <div className="flex justify-end gap-2 border-t border-line pt-3">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" loading={save.isPending} disabled={!name.trim() || name.trim() === area}>
            {merging ? 'Merge' : 'Rename'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
