'use client';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Plus, Trash2 } from 'lucide-react';
import { EXTRA_KINDS, EXTRA_UNITS } from '@reberon/contracts';
import { ApiError, api, del, get } from '@/lib/api';
import { useCan, useMe } from '@/lib/providers';
import { money } from '@/lib/money';
import { Button } from '@/components/ui/button';
import { PageHeader, Pill, Skeleton, Status, Tabs } from '@/components/ui/bits';
import { Dialog } from '@/components/ui/dialog';
import { DeleteConfirmDialog } from '@/components/ui/delete-dialog';
import { FieldRenderer, type AdminFieldDef } from '@/components/forms/field-renderer';

type Row = Record<string, unknown> & { id: string; slug: string; name: { en?: string }; status: string; isExperience?: boolean; priceUgx?: string; priceUsd?: string; nights?: number; kind?: string; unit?: string };
const UNIT: Record<string, string> = { PER_STAY: 'per stay', PER_NIGHT: 'per night', PER_PERSON: 'per person', PER_TRIP: 'per trip' };

const extraFields: AdminFieldDef[] = [
  { kind: 'group', label: '', fields: [{ kind: 'ltext', name: 'name', label: 'Name', required: true }, { kind: 'text', name: 'slug', label: 'Short id', required: true }] },
  { kind: 'ltext', name: 'summary', label: 'One line for guests', multiline: true },
  { kind: 'group', label: '', fields: [{ kind: 'select', name: 'kind', label: 'Kind', required: true, options: EXTRA_KINDS.map((k) => ({ value: k, label: k.toLowerCase().replace('_', ' ') })) }, { kind: 'select', name: 'unit', label: 'Charged', required: true, options: EXTRA_UNITS.map((u) => ({ value: u, label: UNIT[u]! })) }] },
  { kind: 'group', label: '', fields: [{ kind: 'money', name: 'priceUgx', label: 'Price', currency: 'UGX' }, { kind: 'money', name: 'priceUsd', label: 'Price (USD)', currency: 'USD', help: 'Empty = not sold in USD' }] },
  { kind: 'boolean', name: 'isExperience', label: 'An experience (guide, walk, farm visit)' },
  { kind: 'select', name: 'status', label: 'Visibility', required: true, options: [{ value: 'PUBLISHED', label: 'Offered at checkout' }, { value: 'HIDDEN', label: 'Hidden' }] },
];
const packageFields: AdminFieldDef[] = [
  { kind: 'group', label: '', fields: [{ kind: 'ltext', name: 'name', label: 'Name', required: true }, { kind: 'text', name: 'slug', label: 'Address', required: true }] },
  { kind: 'ltext', name: 'summary', label: 'Summary', multiline: true },
  { kind: 'lrich', name: 'body', label: 'The story' },
  { kind: 'group', label: '', columns: 3, fields: [{ kind: 'number', name: 'nights', label: 'Nights', min: 1 }, { kind: 'money', name: 'priceUgx', label: 'Added to the stay', currency: 'UGX' }, { kind: 'money', name: 'priceUsd', label: 'Added (USD)', currency: 'USD' }] },
  { kind: 'media', name: 'heroMediaId', label: 'Main image' },
  { kind: 'select', name: 'status', label: 'Visibility', required: true, options: [{ value: 'PUBLISHED', label: 'Published' }, { value: 'DRAFT', label: 'Draft' }, { value: 'HIDDEN', label: 'Hidden' }] },
];

export default function SellablesPage() {
  const [tab, setTab] = useState<'extras' | 'packages'>('extras');
  const [editing, setEditing] = useState<Row | 'new' | null>(null);
  const [deletingRow, setDeletingRow] = useState<Row | null>(null);
  const can = useCan();
  const me = useMe();
  const isOwner = me.role === 'OWNER';
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ['sellables', tab], queryFn: () => get<Row[]>(`/${tab}`) });
  const fields = tab === 'extras' ? extraFields : packageFields;
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const open = (r: Row | 'new') => {
    setEditing(r);
    setErrors({});
    setValues(r === 'new' ? (tab === 'extras' ? { name: {}, slug: '', kind: 'OTHER', unit: 'PER_STAY', status: 'PUBLISHED', isExperience: false } : { name: {}, slug: '', nights: 1, status: 'DRAFT', inclusions: [] }) : { ...r });
  };
  const save = useMutation({
    mutationFn: () => {
      const { id: _i, createdAt: _c, updatedAt: _u, deletedAt: _d, order: _o, isSeed: _s, mediaId: _m, ...body } = values as Record<string, unknown>;
      return api(editing === 'new' ? `/${tab}` : `/${tab}/${(editing as Row).id}`, { method: editing === 'new' ? 'POST' : 'PATCH', body });
    },
    onSuccess: () => { toast.success('Saved'); qc.invalidateQueries({ queryKey: ['sellables'] }); setEditing(null); },
    onError: (e) => { if (e instanceof ApiError) setErrors(e.fieldErrors()); toast.error(e instanceof ApiError ? e.message : 'Could not save'); },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => del(`/${tab}/${id}`),
    onSuccess: () => {
      toast.success(`${tab === 'extras' ? 'Extra' : 'Package'} deleted`);
      qc.invalidateQueries({ queryKey: ['sellables'] });
      setDeletingRow(null);
      setEditing(null);
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Could not delete item'),
  });

  return (
    <div className="fade-in">
      <PageHeader title="Extras & packages" description="They buy a reason to come, not a room code. Extras sit on the same folio as the room." actions={can('rates:write') && <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => open('new')}>New {tab === 'extras' ? 'extra' : 'package'}</Button>} />
      <Tabs className="mb-4" value={tab} onChange={setTab} items={[{ value: 'extras', label: 'Extras' }, { value: 'packages', label: 'Packages' }]} />
      {isLoading ? <Skeleton className="h-64" /> : (
        <div className="card overflow-hidden">
          <ul className="divide-y divide-line">
            {data?.map((r) => (
              <li key={r.id} className="group relative flex items-center">
                <button type="button" onClick={() => open(r)} className="flex w-full flex-wrap items-center gap-3 px-4 py-3 text-left text-[13px] hover:bg-surface-2/50">
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium">{r.name.en}</span>
                    <span className="text-fg-muted">{tab === 'extras' ? `${String(r.kind).toLowerCase().replace('_', ' ')} · ${UNIT[String(r.unit)]}` : `${r.nights} night${r.nights === 1 ? '' : 's'}`}</span>
                  </span>
                  {r.isExperience ? <Pill tone="blue">experience</Pill> : null}
                  <span className="tabular">{r.priceUgx ? money(String(r.priceUgx), 'UGX') : '—'}{r.priceUsd ? ` · ${money(String(r.priceUsd), 'USD')}` : ''}</span>
                  <Status value={r.status} />
                </button>
                {isOwner && (
                  <div className="pr-3">
                    <Button
                      variant="danger"
                      size="sm"
                      icon={<Trash2 className="size-3" />}
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeletingRow(r);
                      }}
                      title={`Delete ${tab === 'extras' ? 'extra' : 'package'}`}
                    />
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
      <Dialog
        open={!!editing}
        onClose={() => setEditing(null)}
        size="lg"
        title={editing === 'new' ? `New ${tab === 'extras' ? 'extra' : 'package'}` : String((editing as Row | null)?.name?.en ?? '')}
        footer={
          <div className="flex w-full items-center justify-between">
            {editing !== 'new' && isOwner ? (
              <Button
                variant="danger"
                size="sm"
                icon={<Trash2 className="size-3.5" />}
                onClick={() => setDeletingRow(editing as Row)}
              >
                Delete {tab === 'extras' ? 'Extra' : 'Package'}
              </Button>
            ) : <span />}
            <div className="flex items-center gap-2">
              <Button variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
              {can('rates:write') && <Button variant="primary" loading={save.isPending} onClick={() => save.mutate()}>Save</Button>}
            </div>
          </div>
        }
      >
        <fieldset disabled={!can('rates:write')}><FieldRenderer fields={fields} value={values} onChange={setValues} errors={errors} /></fieldset>
      </Dialog>

      {deletingRow && (
        <DeleteConfirmDialog
          open={!!deletingRow}
          onClose={() => setDeletingRow(null)}
          onConfirm={() => deleteMutation.mutate(deletingRow.id)}
          title={`Delete ${tab === 'extras' ? 'Extra' : 'Package'} · ${deletingRow.name?.en || deletingRow.slug}?`}
          itemName={deletingRow.name?.en || deletingRow.slug}
          itemType={tab === 'extras' ? 'Hotel Extra / Experience' : 'Package Deal'}
          warning={`This will hide and soft-delete this ${tab === 'extras' ? 'extra' : 'package'}. It will immediately be removed from the online booking engine.`}
          requireMatch="DELETE"
          loading={deleteMutation.isPending}
        />
      )}
    </div>
  );
}
