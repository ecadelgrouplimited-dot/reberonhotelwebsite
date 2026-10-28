'use client';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ExternalLink, Save, Trash2 } from 'lucide-react';
import { ApiError, api, del, get } from '@/lib/api';
import { useCan, useMe } from '@/lib/providers';
import { ago } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { PageHeader, Section, Skeleton } from '@/components/ui/bits';
import { useConfirm } from '@/components/ui/confirm';
import { DeleteConfirmDialog } from '@/components/ui/delete-dialog';
import { FieldRenderer, type AdminFieldDef } from './field-renderer';

type Values = Record<string, unknown>;

export interface EntityConfig {
  /** e.g. "/room-types" */
  endpoint: string;
  listHref: string;
  noun: string;
  crumbs: { label: string; href?: string }[];
  sections: { title: string; description?: string; fields: AdminFieldDef[] }[];
  /** Fields shown in the side panel (status etc.). */
  side?: AdminFieldDef[];
  empty: Values;
  toForm?: (record: Values) => Values;
  toInput?: (values: Values) => Values;
  title: (v: Values) => string;
  viewUrl?: (v: Values) => string | null;
  extraSide?: (record: Values | null) => ReactNode;
  deleteWarning?: string;
}

export function EntityEditor({ config, id }: { config: EntityConfig; id: string }) {
  const isNew = id === 'new';
  const router = useRouter();
  const qc = useQueryClient();
  const can = useCan();
  const me = useMe();
  const isOwner = me.role === 'OWNER';
  const confirm = useConfirm();
  const editable = can('content:write');
  const [deleteOpen, setDeleteOpen] = useState(false);
  const key = [config.endpoint, id];
  const { data: record, isLoading } = useQuery({ queryKey: key, queryFn: () => get<Values>(`${config.endpoint}/${id}`), enabled: !isNew });
  const initial = useMemo(() => (isNew ? config.empty : record ? (config.toForm?.(record) ?? record) : null), [isNew, record, config]);
  const [values, setValues] = useState<Values | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  useEffect(() => {
    if (initial) setValues(structuredClone(initial));
  }, [initial]);
  const dirty = !!values && !!initial && JSON.stringify(values) !== JSON.stringify(initial);

  useEffect(() => {
    const h = (e: BeforeUnloadEvent) => dirty && e.preventDefault();
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [dirty]);

  const save = useMutation({
    mutationFn: () => {
      const body = config.toInput ? config.toInput(values!) : values!;
      return api<Values>(isNew ? config.endpoint : `${config.endpoint}/${id}`, { method: isNew ? 'POST' : 'PATCH', body });
    },
    onSuccess: (res) => {
      setErrors({});
      qc.invalidateQueries({ queryKey: [config.endpoint] });
      qc.invalidateQueries({ queryKey: ['entity-options'] });
      toast.success(isNew ? `${config.noun} created` : 'Saved — the website is updating');
      if (isNew) router.replace(`${config.listHref}/${res.id}`);
      else qc.setQueryData(key, res);
    },
    onError: (e) => {
      if (e instanceof ApiError) setErrors(e.fieldErrors());
      toast.error(e instanceof ApiError ? e.message : 'Could not save');
    },
  });

  const remove = useMutation({
    mutationFn: () => del(`${config.endpoint}/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [config.endpoint] });
      toast.success(`${config.noun} deleted`);
      router.replace(config.listHref);
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Could not delete'),
  });

  if (!values || (isLoading && !isNew)) {
    return (
      <div className="grid gap-4">
        <Skeleton className="h-10 w-80" />
        <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
          <Skeleton className="h-[60vh]" />
          <Skeleton className="h-64" />
        </div>
      </div>
    );
  }
  const view = !isNew ? config.viewUrl?.(values) : null;

  return (
    <form
      className="fade-in"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
      onKeyDown={(e) => {
        if ((e.metaKey || e.ctrlKey) && e.key === 's') {
          e.preventDefault();
          if (dirty || isNew) save.mutate();
        }
      }}
    >
      <PageHeader title={config.title(values) || `New ${config.noun.toLowerCase()}`} crumbs={config.crumbs} />
      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_19rem]">
        <fieldset disabled={!editable} className="grid min-w-0 gap-5">
          {config.sections.map((s) => (
            <Section key={s.title} title={s.title} description={s.description}>
              <FieldRenderer fields={s.fields} value={values} onChange={setValues} errors={errors} />
            </Section>
          ))}
        </fieldset>
        <aside className="grid gap-4 lg:sticky lg:top-20">
          <div className="card grid gap-4 p-5">
            {config.side && (
              <fieldset disabled={!editable}>
                <FieldRenderer fields={config.side} value={values} onChange={setValues} errors={errors} />
              </fieldset>
            )}
            {editable && (
              <Button type="submit" variant="primary" size="lg" icon={<Save className="size-4" />} loading={save.isPending} disabled={!dirty && !isNew}>
                {isNew ? `Create ${config.noun.toLowerCase()}` : dirty ? 'Save changes' : 'Saved'}
              </Button>
            )}
            {dirty && !isNew && (
              <button type="button" className="text-[12.5px] text-fg-muted hover:text-fg" onClick={() => setValues(structuredClone(initial!))}>
                Discard changes
              </button>
            )}
            {view && (
              <a href={view} target="_blank" rel="noopener noreferrer" className="flex items-center justify-center gap-1.5 text-[12.5px] font-semibold text-fg-muted hover:text-fg">
                View on the website <ExternalLink className="size-3.5" />
              </a>
            )}
            {record?.updatedAt ? <p className="text-center text-[11.5px] text-fg-subtle">Last saved {ago(String(record.updatedAt))}</p> : null}
          </div>
          {config.extraSide?.(record ?? null)}
          {!isNew && isOwner && (
            <Button
              variant="danger"
              icon={<Trash2 className="size-4" />}
              loading={remove.isPending}
              onClick={() => setDeleteOpen(true)}
            >
              Delete {config.noun.toLowerCase()}
            </Button>
          )}
        </aside>
      </div>

      <DeleteConfirmDialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onConfirm={() => remove.mutate()}
        title={`Delete ${config.noun} · “${config.title(values)}”?`}
        itemName={config.title(values)}
        itemType={config.noun}
        warning={config.deleteWarning ?? 'It disappears from the live website immediately. This action is permanently recorded in the executive audit log.'}
        requireMatch="DELETE"
        loading={remove.isPending}
      />
    </form>
  );
}
