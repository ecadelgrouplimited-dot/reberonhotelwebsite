'use client';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowDown, ArrowUp, ChevronDown, Eye, EyeOff, Plus, Trash2 } from 'lucide-react';
import { t, type LRich, type LText } from '@reberon/contracts/text';
import { ApiError, del, get, patch, post } from '@/lib/api';
import { useCan, useMe } from '@/lib/providers';
import { cn } from '@/lib/cn';
import { Button } from '@/components/ui/button';
import { PageHeader, Pill, Section, Skeleton } from '@/components/ui/bits';
import { useConfirm } from '@/components/ui/confirm';
import { RichEditor } from '@/components/forms/rich-editor';
import { slugify } from '@reberon/utils';

type Item = { id: string; question: LText; answer: LRich; order: number; isPublished: boolean };
type Group = { id: string; key: string; title: LText; items: Item[] };

export default function FaqsPage() {
  const qc = useQueryClient();
  const can = useCan();
  const { data, isLoading } = useQuery({ queryKey: ['faq-groups'], queryFn: () => get<Group[]>('/faq-groups') });
  const refresh = () => qc.invalidateQueries({ queryKey: ['faq-groups'] });
  const addGroup = useMutation({
    mutationFn: (title: string) => post('/faq-groups', { key: slugify(title), title: { en: title } }),
    onSuccess: refresh,
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Could not add'),
  });
  return (
    <div className="fade-in">
      <PageHeader
        title="Questions"
        description="Groups of questions shown on pages with the “Questions” block. Answers in plain language."
        actions={can('content:write') && <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => { const n = prompt('Name of the new group (e.g. “Weddings”)'); if (n) addGroup.mutate(n); }}>New group</Button>}
      />
      {isLoading && <Skeleton className="h-64" />}
      <div className="grid gap-5">
        {data?.map((g) => <GroupCard key={g.id} group={g} onChange={refresh} />)}
      </div>
    </div>
  );
}

function GroupCard({ group, onChange }: { group: Group; onChange: () => void }) {
  const can = useCan();
  const me = useMe();
  const isOwner = me.role === 'OWNER';
  const confirm = useConfirm();
  const [open, setOpen] = useState<string | null>(null);
  const addItem = useMutation({ mutationFn: () => post<Item>('/faq-items', { groupId: group.id, question: { en: 'New question?' }, answer: { en: { type: 'doc', content: [{ type: 'paragraph' }] } } }), onSuccess: (i) => { onChange(); setOpen(i.id); } });
  const reorder = useMutation({ mutationFn: (ids: string[]) => post('/faq-items/reorder', { ids }), onSuccess: onChange });
  const removeGroup = useMutation({ mutationFn: () => del(`/faq-groups/${group.id}`), onSuccess: onChange });
  const move = (i: number, d: number) => {
    const ids = group.items.map((x) => x.id);
    [ids[i], ids[i + d]] = [ids[i + d]!, ids[i]!];
    reorder.mutate(ids);
  };
  return (
    <Section
      title={t(group.title)}
      description={<span className="font-mono text-[11.5px]">{group.key} · {group.items.length} questions</span>}
      actions={
        can('content:write') && (
          <div className="flex gap-1">
            <Button size="sm" icon={<Plus className="size-3.5" />} loading={addItem.isPending} onClick={() => addItem.mutate()}>Question</Button>
            {isOwner && (
              <Button size="sm" variant="ghost" aria-label="Delete group" onClick={async () => (await confirm({ title: `Delete “${t(group.title)}”?`, body: 'All its questions go too. Pages using this group will show nothing there.', confirm: 'Delete group', danger: true })) && removeGroup.mutate()}>
                <Trash2 className="size-3.5" />
              </Button>
            )}
          </div>
        )
      }
    >
      <ol className="-my-2 divide-y divide-line">
        {group.items.map((it, i) => (
          <li key={it.id} className="py-2">
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => setOpen(open === it.id ? null : it.id)} className="flex min-w-0 flex-1 items-center gap-2 py-1 text-left">
                <ChevronDown className={cn('size-4 shrink-0 text-fg-subtle transition-transform', open === it.id && 'rotate-180')} />
                <span className={cn('truncate text-[13.5px] font-medium', !it.isPublished && 'text-fg-subtle line-through')}>{t(it.question)}</span>
                {!it.isPublished && <Pill>hidden</Pill>}
              </button>
              {can('content:write') && (
                <span className="flex">
                  <button type="button" disabled={i === 0} onClick={() => move(i, -1)} className="grid size-7 place-items-center rounded text-fg-subtle hover:bg-surface-2 disabled:opacity-30" aria-label="Move up"><ArrowUp className="size-3.5" /></button>
                  <button type="button" disabled={i === group.items.length - 1} onClick={() => move(i, 1)} className="grid size-7 place-items-center rounded text-fg-subtle hover:bg-surface-2 disabled:opacity-30" aria-label="Move down"><ArrowDown className="size-3.5" /></button>
                </span>
              )}
            </div>
            {open === it.id && <ItemEditor item={it} onChange={onChange} />}
          </li>
        ))}
      </ol>
    </Section>
  );
}

function ItemEditor({ item, onChange }: { item: Item; onChange: () => void }) {
  const can = useCan();
  const me = useMe();
  const isOwner = me.role === 'OWNER';
  const confirm = useConfirm();
  const [q, setQ] = useState(item.question.en ?? '');
  const [a, setA] = useState<LRich>(item.answer);
  const save = useMutation({ mutationFn: (body: Record<string, unknown>) => patch(`/faq-items/${item.id}`, body), onSuccess: () => { toast.success('Saved'); onChange(); } });
  const remove = useMutation({ mutationFn: () => del(`/faq-items/${item.id}`), onSuccess: onChange });
  return (
    <fieldset disabled={!can('content:write')} className="mt-2 grid gap-3 rounded-xl bg-surface-2/50 p-3">
      <input className="input font-medium" value={q} onChange={(e) => setQ(e.target.value)} />
      <RichEditor value={a} onChange={setA} />
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="dark" loading={save.isPending} onClick={() => save.mutate({ question: { en: q }, answer: a })}>Save</Button>
        <Button size="sm" icon={item.isPublished ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />} onClick={() => save.mutate({ isPublished: !item.isPublished })}>{item.isPublished ? 'Hide' : 'Show'}</Button>
        {isOwner && (
          <Button size="sm" variant="ghost" className="ml-auto text-danger" onClick={async () => (await confirm({ title: 'Delete this question?', body: t(item.question), confirm: 'Delete', danger: true })) && remove.mutate()}>Delete</Button>
        )}
      </div>
    </fieldset>
  );
}
