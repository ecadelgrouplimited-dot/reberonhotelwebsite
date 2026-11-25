'use client';
import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowDown, ArrowUp, CornerDownRight, Plus, Trash2 } from 'lucide-react';
import type { NavMenuKey, NavItemInput } from '@reberon/contracts';
import { ApiError, get, put, WEB_URL } from '@/lib/api';
import { useCan } from '@/lib/providers';
import { Button } from '@/components/ui/button';
import { PageHeader, Tabs } from '@/components/ui/bits';

type Row = { label: { en?: string }; target: 'URL' | 'PAGE' | 'ROOM_TYPE' | 'DESTINATION'; url: string | null; targetId: string | null; isVisible: boolean; children?: Row[] };
const MENUS: { value: NavMenuKey; label: string; help: string }[] = [
  { value: 'HEADER', label: 'Header', help: 'Across the top on computers. Items with sub-items become a dropdown.' },
  { value: 'MOBILE', label: 'Phone menu', help: 'The full-screen menu on phones. Keep it short.' },
  { value: 'FOOTER_PRIMARY', label: 'Footer', help: 'Columns at the bottom: each top item is a column heading.' },
  { value: 'FOOTER_LEGAL', label: 'Legal links', help: 'Small links at the very bottom.' },
];

export default function NavigationPage() {
  const qc = useQueryClient();
  const can = useCan();
  const [menu, setMenu] = useState<NavMenuKey>('HEADER');
  const { data } = useQuery({ queryKey: ['navigation'], queryFn: () => get<Record<NavMenuKey, Row[]>>('/navigation') });
  const [items, setItems] = useState<Row[]>([]);
  useEffect(() => setItems(structuredClone(data?.[menu] ?? [])), [data, menu]);
  const dirty = JSON.stringify(items) !== JSON.stringify(data?.[menu] ?? []);
  const save = useMutation({
    mutationFn: () => {
      const clean = (r: Row): NavItemInput => ({ label: { en: r.label.en ?? '' }, target: 'URL', url: r.url ?? '/', isVisible: r.isVisible, children: (r.children ?? []).map(clean) });
      return put(`/navigation/${menu}`, { items: items.map(clean) });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['navigation'] });
      toast.success('Menu saved — the website is updating');
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Could not save'),
  });

  const edit = (path: number[], fn: (r: Row) => Row | null) => {
    const next = structuredClone(items);
    const list = path.length === 1 ? next : next[path[0]!]!.children!;
    const i = path[path.length - 1]!;
    const r = fn(list[i]!);
    if (r) list[i] = r;
    else list.splice(i, 1);
    setItems(next);
  };
  const move = (path: number[], d: number) => {
    const next = structuredClone(items);
    const list = path.length === 1 ? next : next[path[0]!]!.children!;
    const i = path[path.length - 1]!;
    [list[i], list[i + d]] = [list[i + d]!, list[i]!];
    setItems(next);
  };
  const info = MENUS.find((m) => m.value === menu)!;

  // A plain function, not a component: a component declared in here would be a new type on every
  // render, so React would rebuild the inputs and drop focus after each letter typed.
  const rowEditor = (r: Row, path: number[], siblings: number) => (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-line bg-surface p-2">
      {path.length > 1 && <CornerDownRight className="ml-1 size-4 text-fg-subtle" />}
      <input className="input !min-h-9 w-48 flex-1" value={r.label.en ?? ''} placeholder="Label" onChange={(e) => edit(path, (x) => ({ ...x, label: { en: e.target.value } }))} />
      <input className="input !min-h-9 w-56 flex-1 font-mono text-[12.5px]" value={r.url ?? ''} placeholder="/kapchorwa/sipi-falls" onChange={(e) => edit(path, (x) => ({ ...x, url: e.target.value }))} />
      <label className="flex items-center gap-1.5 text-[12px] text-fg-muted"><input type="checkbox" checked={r.isVisible} onChange={(e) => edit(path, (x) => ({ ...x, isVisible: e.target.checked }))} /> Shown</label>
      <span className="flex">
        <button type="button" disabled={path.at(-1) === 0} onClick={() => move(path, -1)} className="grid size-8 place-items-center rounded text-fg-subtle hover:bg-surface-2 disabled:opacity-30" aria-label="Up"><ArrowUp className="size-3.5" /></button>
        <button type="button" disabled={path.at(-1) === siblings - 1} onClick={() => move(path, 1)} className="grid size-8 place-items-center rounded text-fg-subtle hover:bg-surface-2 disabled:opacity-30" aria-label="Down"><ArrowDown className="size-3.5" /></button>
        {path.length === 1 && <button type="button" onClick={() => edit(path, (x) => ({ ...x, children: [...(x.children ?? []), { label: { en: '' }, target: 'URL', url: '/', targetId: null, isVisible: true }] }))} className="grid size-8 place-items-center rounded text-fg-subtle hover:bg-surface-2" aria-label="Add sub-item"><Plus className="size-3.5" /></button>}
        <button type="button" onClick={() => edit(path, () => null)} className="grid size-8 place-items-center rounded text-fg-subtle hover:bg-danger/10 hover:text-danger" aria-label="Remove"><Trash2 className="size-3.5" /></button>
      </span>
    </div>
  );

  return (
    <div className="fade-in">
      <PageHeader title="Navigation" description="The website's menus. Links can point anywhere on the site or outside it." actions={can('content:write') && <Button variant="primary" disabled={!dirty} loading={save.isPending} onClick={() => save.mutate()}>{dirty ? 'Save menu' : 'Saved'}</Button>} />
      <Tabs className="mb-5" value={menu} onChange={(m) => { if (!dirty || confirm('Discard unsaved changes to this menu?')) setMenu(m); }} items={MENUS.map((m) => ({ value: m.value, label: m.label, count: data?.[m.value]?.length }))} />
      <p className="mb-4 text-[13px] text-fg-muted">{info.help} <a className="underline" href={WEB_URL} target="_blank" rel="noreferrer">See the site</a></p>
      <fieldset disabled={!can('content:write')} className="grid gap-2">
        {items.map((r, i) => (
          <div key={i} className="grid gap-2">
            {rowEditor(r, [i], items.length)}
            {(r.children ?? []).map((c, k) => (
              <div key={k} className="pl-8">
                {rowEditor(c, [i, k], r.children!.length)}
              </div>
            ))}
          </div>
        ))}
        <Button className="justify-self-start" icon={<Plus className="size-4" />} onClick={() => setItems([...items, { label: { en: '' }, target: 'URL', url: '/', targetId: null, isVisible: true, children: [] }])}>Add item</Button>
      </fieldset>
    </div>
  );
}
