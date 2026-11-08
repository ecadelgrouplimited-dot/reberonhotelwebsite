'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  ArrowDown, ArrowLeft, ArrowUp, CalendarClock, Check, CircleAlert, CircleCheck, ClipboardPaste, Copy, CopyPlus, ExternalLink, Eye, EyeOff, GripVertical, History, LoaderCircle,
  Monitor, MoreHorizontal, MousePointerClick, Plus, Redo2, RefreshCw, Rocket, Search, Smartphone, Tablet, Trash2, TriangleAlert, Undo2, Unplug,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { BLOCKS, BLOCK_GROUPS, BLOCK_MAP, type AdminPageDTO, type Block, type FieldDef, type SeoDTO } from '@reberon/contracts';
import { t, type LText } from '@reberon/contracts/text';
import { ApiError, del, get, patch, post, WEB_URL } from '@/lib/api';
import { useCan } from '@/lib/providers';
import { ago, dateTime } from '@/lib/format';
import { cn } from '@/lib/cn';
import { Button } from '@/components/ui/button';
import { Pill, Skeleton, Status, Tabs } from '@/components/ui/bits';
import { Dialog } from '@/components/ui/dialog';
import { useConfirm } from '@/components/ui/confirm';
import { FieldShell, Switch, TextInput } from '@/components/ui/field';
import { FieldRenderer } from '@/components/forms/field-renderer';
import { BlockIcon } from './block-icon';

type Draft = { title: LText; slug: string; blocks: Block[]; seo: SeoDTO };
type SaveState = 'saved' | 'dirty' | 'saving' | 'error' | 'conflict';

const newId = (type: string) => `${type}-${Math.random().toString(36).slice(2, 9)}`;

function blockSummary(b: Block) {
  const d = b.data as Record<string, unknown>;
  for (const k of ['heading', 'text', 'eyebrow']) {
    const v = d[k] as LText | undefined;
    if (v?.en) return v.en;
  }
  return BLOCK_MAP[b.type]?.description ?? '';
}

export function PageBuilder({ id }: { id: string }) {
  const qc = useQueryClient();
  const can = useCan();
  const confirm = useConfirm();
  const editable = can('content:write');
  const { data: page, isLoading } = useQuery({ queryKey: ['page', id], queryFn: () => get<AdminPageDTO>(`/pages/${id}`), refetchOnWindowFocus: false });

  const [draft, setDraft] = useState<Draft | null>(null);
  // Live status from the latest save/publish response (the loaded page goes stale after autosave).
  const [meta, setMeta] = useState<Pick<AdminPageDTO, 'status' | 'hasUnpublishedChanges' | 'publishAt'> | null>(null);
  const [version, setVersion] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [save, setSave] = useState<SaveState>('saved');
  const [tab, setTab] = useState<'blocks' | 'seo'>('blocks');
  const [adding, setAdding] = useState(false);
  const [history, setHistory] = useState(false);
  const [scheduling, setScheduling] = useState(false);
  const [publishErrors, setPublishErrors] = useState<{ path: string; message: string }[]>([]);
  const [device, setDevice] = useState<'phone' | 'tablet' | 'desktop'>('desktop');
  const [frameKey, setFrameKey] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef<{ draft: Draft | null; version: number }>({ draft: null, version: 0 });
  const frame = useRef<HTMLIFrameElement | null>(null);
  const fromPreview = useRef(false);
  // Undo / redo: snapshots of the draft; rapid typing in one field collapses into one step.
  const past = useRef<Draft[]>([]);
  const future = useRef<Draft[]>([]);
  const lastPush = useRef(0);
  const [, bumpHistory] = useState(0);
  const [insertAt, setInsertAt] = useState<number | null>(null);
  const [clip, setClip] = useState<Block | null>(null);
  const router = useRouter();
  const webOrigin = useMemo(() => new URL(WEB_URL).origin, []);
  const toPreview = useCallback((msg: Record<string, unknown>) => frame.current?.contentWindow?.postMessage(msg, webOrigin), [webOrigin]);

  // Load server state once (and after restore / reload).
  useEffect(() => {
    if (!page) return;
    setDraft({ title: page.title, slug: page.slug, blocks: page.draftBlocks, seo: page.draftSeo ?? {} });
    setVersion(page.version);
    setMeta({ status: page.status, hasUnpublishedChanges: page.hasUnpublishedChanges, publishAt: page.publishAt });
    setSelected((s) => s ?? page.draftBlocks[0]?.id ?? null);
    setSave('saved');
    past.current = [];
    future.current = [];
    bumpHistory((n) => n + 1);
  }, [page]);
  latest.current = { draft, version };

  const token = useQuery({ queryKey: ['preview-token'], queryFn: () => post<{ token: string }>('/preview-token'), staleTime: 45 * 60_000 });

  const persist = useCallback(async () => {
    const { draft: d, version: v } = latest.current;
    if (!d) return;
    setSave('saving');
    try {
      const res = await patch<AdminPageDTO>(`/pages/${id}`, { title: d.title, slug: d.slug, blocks: d.blocks, seo: d.seo }, { 'if-match': String(v) });
      setVersion(res.version);
      setMeta({ status: res.status, hasUnpublishedChanges: res.hasUnpublishedChanges, publishAt: res.publishAt });
      qc.invalidateQueries({ queryKey: ['pages'] });
      setSave((s) => (s === 'saving' ? 'saved' : s));
      toPreview({ type: 'rb:refresh' });
    } catch (e) {
      if (e instanceof ApiError && e.code === 'CONFLICT_VERSION') setSave('conflict');
      else {
        setSave('error');
        toast.error(e instanceof ApiError ? e.message : 'Could not save');
      }
    }
  }, [id, qc, toPreview]);

  const update = useCallback(
    (fn: (d: Draft) => Draft) => {
      setDraft((d) => {
        if (!d) return d;
        const now = Date.now();
        if (now - lastPush.current > 700) {
          past.current = [...past.current.slice(-79), d];
          future.current = [];
          bumpHistory((n) => n + 1);
        }
        lastPush.current = now;
        return fn(d);
      });
      setSave('dirty');
      setPublishErrors([]);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void persist(), 1200);
    },
    [persist],
  );

  const schedule = useCallback(() => {
    setSave('dirty');
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void persist(), 900);
  }, [persist]);
  const undo = useCallback(() => {
    const prev = past.current.pop();
    const cur = latest.current.draft;
    if (!prev || !cur) return;
    future.current.push(cur);
    lastPush.current = 0;
    setDraft(prev);
    bumpHistory((n) => n + 1);
    schedule();
  }, [schedule]);
  const redo = useCallback(() => {
    const next = future.current.pop();
    const cur = latest.current.draft;
    if (!next || !cur) return;
    past.current.push(cur);
    lastPush.current = 0;
    setDraft(next);
    bumpHistory((n) => n + 1);
    schedule();
  }, [schedule]);

  // Keyboard: ⌘/Ctrl+Z, ⇧⌘Z / Ctrl+Y (text fields keep their own undo), ⌘/Ctrl+S saves now.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      const k = e.key.toLowerCase();
      if (k === 's') {
        e.preventDefault();
        if (timer.current) clearTimeout(timer.current);
        void persist();
        return;
      }
      const el = e.target as HTMLElement | null;
      if (el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName))) return;
      if (k === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if ((k === 'z' && e.shiftKey) || k === 'y') {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, redo, persist]);

  // The preview talks back: a click on a section selects that block here.
  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (e.origin !== webOrigin || !e.data || typeof e.data !== 'object') return;
      const msg = e.data as { type?: string; id?: string };
      if (msg.type === 'rb:select' && msg.id) {
        fromPreview.current = true;
        setSelected(msg.id);
        setTab('blocks');
      }
      if (msg.type === 'rb:ready') {
        const id = latest.current.draft?.blocks.find((b) => b.id === selectedRef.current)?.id;
        if (id && latest.current.draft?.blocks[0]?.id !== id) toPreview({ type: 'rb:focus', id });
      }
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, [webOrigin, toPreview]);

  // Undo/redo can remove the selected block: fall back to the nearest one.
  useEffect(() => {
    if (draft && selected && !draft.blocks.some((b) => b.id === selected)) setSelected(draft.blocks[0]?.id ?? null);
  }, [draft, selected]);

  // Selecting a block here scrolls the preview to it (no reload).
  const selectedRef = useRef<string | null>(null);
  selectedRef.current = selected;
  useEffect(() => {
    if (!selected) return;
    if (fromPreview.current) {
      fromPreview.current = false;
      return;
    }
    toPreview({ type: 'rb:focus', id: selected });
  }, [selected, toPreview]);

  // A block copied on any page can be pasted here.
  useEffect(() => {
    const read = () => {
      try {
        const raw = localStorage.getItem('rb:block-clipboard');
        setClip(raw ? (JSON.parse(raw) as Block) : null);
      } catch {
        setClip(null);
      }
    };
    read();
    window.addEventListener('storage', read);
    window.addEventListener('focus', read);
    return () => {
      window.removeEventListener('storage', read);
      window.removeEventListener('focus', read);
    };
  }, []);

  // Save before leaving; warn on unsaved changes.
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (save === 'dirty' || save === 'saving') e.preventDefault();
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [save]);

  const publish = useMutation({
    mutationFn: async (publishAt?: string) => {
      if (timer.current) {
        clearTimeout(timer.current);
        await persist();
      }
      return post<AdminPageDTO>(`/pages/${id}/publish`, { publishAt: publishAt ?? null });
    },
    onSuccess: (p) => {
      setPublishErrors([]);
      setVersion(p.version);
      setMeta({ status: p.status, hasUnpublishedChanges: p.hasUnpublishedChanges, publishAt: p.publishAt });
      qc.invalidateQueries({ queryKey: ['pages'] });
      toast.success(p.status === 'SCHEDULED' ? `Scheduled for ${dateTime(p.publishAt!)}` : 'Published — the website is updating now');
      setScheduling(false);
    },
    onError: (e) => {
      if (e instanceof ApiError && e.errors.length) {
        setPublishErrors(e.errors);
        const idx = Number(e.errors[0]!.path.split('.')[0]);
        const b = latest.current.draft?.blocks[idx];
        if (b) setSelected(b.id);
      }
      toast.error(e instanceof ApiError ? e.message : 'Could not publish');
    },
  });

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));

  const errorsByBlock = useMemo(() => {
    const map = new Map<number, Record<string, string>>();
    for (const e of publishErrors) {
      const [idx, , ...rest] = e.path.split('.');
      const m = map.get(Number(idx)) ?? {};
      m[rest.join('.')] = e.message.replace(/^.*?: /, '');
      map.set(Number(idx), m);
    }
    return map;
  }, [publishErrors]);

  if (isLoading || !draft || !page || !meta) {
    return (
      <div className="grid gap-4">
        <Skeleton className="h-12 w-96" />
        <div className="grid gap-4 lg:grid-cols-[18rem_1fr_1fr]">
          <Skeleton className="h-[60vh]" />
          <Skeleton className="h-[60vh]" />
          <Skeleton className="h-[60vh]" />
        </div>
      </div>
    );
  }

  const idx = draft.blocks.findIndex((b) => b.id === selected);
  const block = idx >= 0 ? draft.blocks[idx]! : null;
  const def = block ? BLOCK_MAP[block.type] : null;
  const setBlock = (b: Block) => update((d) => ({ ...d, blocks: d.blocks.map((x) => (x.id === b.id ? b : x)) }));
  const previewPath = page.kind === 'SYSTEM' ? '/__preview-404' : `/${draft.slug}`;
  const previewUrl = token.data ? `${WEB_URL}/api/preview?token=${token.data.token}&path=${encodeURIComponent(previewPath)}` : null;
  const locked = ['HOME', 'SYSTEM'].includes(page.kind);

  const onDragEnd = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return;
    update((d) => {
      const from = d.blocks.findIndex((b) => b.id === e.active.id);
      const to = d.blocks.findIndex((b) => b.id === e.over!.id);
      return { ...d, blocks: arrayMove(d.blocks, from, to) };
    });
  };

  const insertBlock = (b: Block) => {
    update((d) => {
      const at = insertAt ?? (idx >= 0 ? idx + 1 : d.blocks.length);
      const blocks = [...d.blocks];
      blocks.splice(Math.min(at, blocks.length), 0, b);
      return { ...d, blocks };
    });
    setSelected(b.id);
    setAdding(false);
    setInsertAt(null);
  };
  const moveBlock = (from: number, to: number) => {
    if (to < 0 || to >= draft.blocks.length) return;
    update((d) => ({ ...d, blocks: arrayMove(d.blocks, from, to) }));
  };
  const copyBlock = (b: Block) => {
    try {
      localStorage.setItem('rb:block-clipboard', JSON.stringify(b));
      setClip(b);
      toast.success(`${BLOCK_MAP[b.type]?.label ?? 'Block'} copied — paste it on any page`);
    } catch {
      toast.error('Could not copy');
    }
  };
  const pasteBlock = () => clip && BLOCK_MAP[clip.type] && insertBlock({ ...structuredClone(clip), id: newId(clip.type) });
  const health = pageHealth(draft, page.kind);
  const issues = health.filter((h) => h.level !== 'ok').length;

  const addBlock = (type: string) => {
    const b: Block = { id: newId(type), type, variant: BLOCK_MAP[type]?.variants?.[0]?.value, data: {} };
    update((d) => {
      const at = insertAt ?? (idx >= 0 ? idx + 1 : d.blocks.length);
      const blocks = [...d.blocks];
      blocks.splice(at, 0, b);
      return { ...d, blocks };
    });
    setSelected(b.id);
    setAdding(false);
    setInsertAt(null);
  };

  return (
    <div className="fade-in -mx-4 -my-6 flex h-[calc(100dvh-4rem)] flex-col sm:-mx-6 lg:-mx-8 lg:-my-8">
      {/* Publish bar */}
      <header className="flex flex-wrap items-center gap-3 border-b border-line bg-surface px-4 py-2.5 sm:px-6">
        <Link href="/website/pages" className="grid size-8 place-items-center rounded-full hover:bg-surface-2" aria-label="All pages">
          <ArrowLeft className="size-4" />
        </Link>
        <div className="min-w-0">
          <p className="truncate text-[15px] font-semibold">{t(draft.title) || 'Untitled'}</p>
          <p className="truncate font-mono text-[11.5px] text-fg-subtle">reberonhotel.com/{draft.slug}</p>
        </div>
        <Status value={meta.status} />
        {meta.status === 'SCHEDULED' && meta.publishAt && <Pill tone="blue">{dateTime(meta.publishAt)}</Pill>}
        <SaveIndicator state={save} unpublished={meta.hasUnpublishedChanges && meta.status !== 'SCHEDULED'} onReload={() => qc.invalidateQueries({ queryKey: ['page', id] })} onRetry={() => void persist()} />
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {editable && (
            <span className="flex items-center rounded-full border border-line p-0.5">
              <button type="button" onClick={undo} disabled={!past.current.length} className="grid size-7 place-items-center rounded-full text-fg-muted hover:bg-surface-2 hover:text-fg disabled:opacity-35" aria-label="Undo" title="Undo (Ctrl+Z)">
                <Undo2 className="size-4" />
              </button>
              <button type="button" onClick={redo} disabled={!future.current.length} className="grid size-7 place-items-center rounded-full text-fg-muted hover:bg-surface-2 hover:text-fg disabled:opacity-35" aria-label="Redo" title="Redo (Ctrl+Shift+Z)">
                <Redo2 className="size-4" />
              </button>
            </span>
          )}
          <Button size="sm" variant="ghost" icon={<History className="size-4" />} onClick={() => setHistory(true)}>History</Button>
          {previewUrl && (
            <a href={previewUrl} target="_blank" rel="noopener noreferrer" className="inline-flex h-8 items-center gap-1.5 rounded-full border border-line-strong px-3 text-[12.5px] font-semibold hover:bg-surface-2">
              <Eye className="size-4" /> Preview
            </a>
          )}
          {can('content:publish') && (
            <>
              <Button size="sm" icon={<CalendarClock className="size-4" />} onClick={() => setScheduling(true)} disabled={save === 'conflict'}>Schedule</Button>
              <Button size="sm" variant="primary" icon={<Rocket className="size-4" />} loading={publish.isPending} onClick={() => publish.mutate(undefined)} disabled={save === 'conflict' || (!meta.hasUnpublishedChanges && save === 'saved' && meta.status === 'PUBLISHED')}>
                {meta.status === 'PUBLISHED' && !meta.hasUnpublishedChanges && save === 'saved' ? 'Published' : 'Publish'}
              </Button>
            </>
          )}
          <PageMenu
            pageId={id}
            liveUrl={meta.status === 'PUBLISHED' && page.kind !== 'SYSTEM' ? `${WEB_URL}/${draft.slug}` : null}
            canUnpublish={can('content:publish') && !locked && meta.status !== 'DRAFT'}
            canDelete={can('content:write') && ['STANDARD', 'LANDING'].includes(page.kind)}
            title={t(draft.title)}
            onUnpublished={(p) => {
              setMeta({ status: p.status, hasUnpublishedChanges: p.hasUnpublishedChanges, publishAt: p.publishAt });
              qc.invalidateQueries({ queryKey: ['pages'] });
            }}
            onDeleted={() => {
              qc.invalidateQueries({ queryKey: ['pages'] });
              router.push('/website/pages');
            }}
          />
        </div>
      </header>

      {publishErrors.length > 0 && (
        <div className="flex items-start gap-2 border-b border-danger/20 bg-danger/5 px-6 py-2.5 text-[12.5px] text-danger">
          <CircleAlert className="mt-0.5 size-4 shrink-0" />
          <div>
            <p className="font-semibold">Fix these before publishing:</p>
            <ul className="mt-0.5 list-disc pl-4">
              {publishErrors.slice(0, 5).map((e, i) => <li key={i}>{e.message}</li>)}
            </ul>
          </div>
        </div>
      )}

      <div className="grid min-h-0 flex-1 lg:grid-cols-[17.5rem_minmax(22rem,1fr)_minmax(0,1.25fr)]">
        {/* Left: block list */}
        <aside className="flex min-h-0 min-w-0 flex-col border-r border-line bg-surface">
          <Tabs className="px-3" value={tab} onChange={setTab} items={[{ value: 'blocks', label: 'Blocks', count: draft.blocks.length }, { value: 'seo', label: 'Page & SEO', count: issues || undefined }]} />
          {tab === 'blocks' ? (
            <>
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
                <SortableContext items={draft.blocks.map((b) => b.id)} strategy={verticalListSortingStrategy}>
                  <ul className="scrollbar-thin min-h-0 flex-1 space-y-1 overflow-y-auto p-2">
                    {draft.blocks.map((b, i) => (
                      <SortableBlock
                        key={b.id}
                        block={b}
                        index={i}
                        active={b.id === selected}
                        hasError={errorsByBlock.has(i)}
                        editable={editable}
                        onSelect={() => setSelected(b.id)}
                        onToggle={() => setBlock({ ...b, hidden: !b.hidden })}
                      />
                    ))}
                  </ul>
                </SortableContext>
              </DndContext>
              {editable && (
                <div className="flex gap-1.5 border-t border-line p-2">
                  <Button className="flex-1" icon={<Plus className="size-4" />} onClick={() => { setInsertAt(null); setAdding(true); }}>Add block</Button>
                  {clip && BLOCK_MAP[clip.type] && (
                    <Button icon={<ClipboardPaste className="size-4" />} onClick={pasteBlock} title={`Paste the copied ${BLOCK_MAP[clip.type]!.label.toLowerCase()} after the selected block`}>
                      Paste
                    </Button>
                  )}
                </div>
              )}
            </>
          ) : (
            <div className="scrollbar-thin grid min-w-0 gap-4 overflow-y-auto overflow-x-hidden p-4">
              <HealthList items={health} onPick={(id) => { setSelected(id); setTab('blocks'); }} />
              <TextInput label="Page title" value={draft.title.en ?? ''} onChange={(e) => update((d) => ({ ...d, title: { ...d.title, en: e.target.value } }))} />
              <TextInput label="Address" disabled={locked} value={draft.slug} onChange={(e) => update((d) => ({ ...d, slug: e.target.value.toLowerCase().replace(/[^a-z0-9/-]/g, '-') }))} hint={locked ? 'This page’s address is fixed.' : 'Changing a published address adds a redirect automatically.'} />
              <SeoEditor seo={draft.seo} onChange={(seo) => update((d) => ({ ...d, seo }))} />
            </div>
          )}
        </aside>

        {/* Middle: block editor */}
        <section className="scrollbar-thin min-h-0 overflow-y-auto border-r border-line bg-bg">
          {block && def ? (
            <div className="p-5">
              <div className="mb-5 flex items-start gap-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-surface-2 text-brand"><BlockIcon name={def.icon} className="size-5" /></span>
                <div className="min-w-0 flex-1">
                  <h2 className="text-[15px] font-semibold">{def.label}</h2>
                  <p className="text-[12.5px] text-fg-muted">{def.description}</p>
                </div>
                {editable && (
                  <div className="flex flex-wrap justify-end gap-0.5">
                    <button type="button" className="grid size-8 place-items-center rounded-full text-fg-subtle hover:bg-surface-2 hover:text-fg disabled:opacity-30" aria-label="Move up" title="Move up" disabled={idx === 0} onClick={() => moveBlock(idx, idx - 1)}>
                      <ArrowUp className="size-4" />
                    </button>
                    <button type="button" className="grid size-8 place-items-center rounded-full text-fg-subtle hover:bg-surface-2 hover:text-fg disabled:opacity-30" aria-label="Move down" title="Move down" disabled={idx === draft.blocks.length - 1} onClick={() => moveBlock(idx, idx + 1)}>
                      <ArrowDown className="size-4" />
                    </button>
                    <button type="button" className="grid size-8 place-items-center rounded-full text-fg-subtle hover:bg-surface-2 hover:text-fg" aria-label="Add a block below" title="Add a block below" onClick={() => { setInsertAt(idx + 1); setAdding(true); }}>
                      <Plus className="size-4" />
                    </button>
                    <button type="button" className="grid size-8 place-items-center rounded-full text-fg-subtle hover:bg-surface-2 hover:text-fg" aria-label="Copy block" title="Copy — paste on any page" onClick={() => copyBlock(block)}>
                      <CopyPlus className="size-4" />
                    </button>
                    <button type="button" className="grid size-8 place-items-center rounded-full text-fg-subtle hover:bg-surface-2 hover:text-fg" aria-label="Duplicate block" title="Duplicate" onClick={() => {
                      const copy = { ...structuredClone(block), id: newId(block.type) };
                      update((d) => {
                        const blocks = [...d.blocks];
                        blocks.splice(idx + 1, 0, copy);
                        return { ...d, blocks };
                      });
                      setSelected(copy.id);
                    }}>
                      <Copy className="size-4" />
                    </button>
                    <button type="button" className="grid size-8 place-items-center rounded-full text-fg-subtle hover:bg-danger/10 hover:text-danger" aria-label="Delete block" onClick={async () => {
                      if (!(await confirm({ title: `Delete this ${def.label.toLowerCase()} block?`, body: 'It disappears from the draft. The live page keeps it until you publish — and old versions stay in History.', confirm: 'Delete block', danger: true }))) return;
                      update((d) => ({ ...d, blocks: d.blocks.filter((x) => x.id !== block.id) }));
                      setSelected(draft.blocks[idx + 1]?.id ?? draft.blocks[idx - 1]?.id ?? null);
                    }}>
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                )}
              </div>
              <fieldset disabled={!editable} className="grid gap-5">
                <div className="grid gap-4 rounded-2xl border border-line bg-surface p-4 sm:grid-cols-2">
                  {def.variants && (
                    <FieldShell label="Layout">
                      <select className="input" value={block.variant ?? def.variants[0]!.value} onChange={(e) => setBlock({ ...block, variant: e.target.value })}>
                        {def.variants.map((v) => <option key={v.value} value={v.value}>{v.label}</option>)}
                      </select>
                    </FieldShell>
                  )}
                  {!['hero', 'quote', 'spacer'].includes(block.type) && (
                    <FieldShell label="Background">
                      <select className="input" value={block.tone ?? 'default'} onChange={(e) => setBlock({ ...block, tone: e.target.value as Block['tone'] })}>
                        <option value="default">Mist (page)</option>
                        <option value="warm">Parchment</option>
                        <option value="moss">Moss green</option>
                        <option value="dark">Night</option>
                      </select>
                    </FieldShell>
                  )}
                  <FieldShell label="Anchor" hint="Link to it as #anchor">
                    <input className="input font-mono text-[12.5px]" value={block.anchor ?? ''} placeholder="optional" onChange={(e) => setBlock({ ...block, anchor: e.target.value.replace(/[^a-z0-9-]/gi, '').toLowerCase() || undefined })} />
                  </FieldShell>
                  <div className="self-end pb-1.5">
                    <Switch label="Hidden" hint="Kept in the page, not shown" checked={!!block.hidden} onChange={(v) => setBlock({ ...block, hidden: v })} />
                  </div>
                </div>
                <FieldRenderer fields={def.fields} value={block.data as Record<string, unknown>} onChange={(data) => setBlock({ ...block, data })} errors={errorsByBlock.get(idx) ?? {}} />
              </fieldset>
            </div>
          ) : (
            <div className="grid h-full place-items-center p-8 text-center text-fg-muted">Choose a block on the left, or add one.</div>
          )}
        </section>

        {/* Right: live preview */}
        <section className="hidden min-h-0 flex-col bg-surface-2 lg:flex">
          <div className="flex items-center gap-1 border-b border-line bg-surface px-3 py-2">
            {([['phone', Smartphone, 390], ['tablet', Tablet, 820], ['desktop', Monitor, 1280]] as const).map(([k, Icon]) => (
              <button key={k} type="button" onClick={() => setDevice(k)} className={cn('grid size-8 place-items-center rounded-full', device === k ? 'bg-fg text-bg' : 'text-fg-muted hover:bg-surface-2')} aria-label={k} aria-pressed={device === k}>
                <Icon className="size-4" />
              </button>
            ))}
            <span className="ml-2 flex items-center gap-1.5 text-[12px] text-fg-subtle"><MousePointerClick className="size-3.5" /> Click any section to edit it · updates as you save</span>
            <button type="button" className="ml-auto grid size-8 place-items-center rounded-full text-fg-muted hover:bg-surface-2" onClick={() => setFrameKey((k) => k + 1)} aria-label="Reload preview">
              <RefreshCw className="size-4" />
            </button>
          </div>
          <PreviewFrame url={previewUrl} device={device} reloadKey={frameKey} frameRef={frame} />
        </section>
      </div>

      <AddBlockDialog
        open={adding}
        onClose={() => { setAdding(false); setInsertAt(null); }}
        onAdd={addBlock}
        onPaste={clip && BLOCK_MAP[clip.type] ? pasteBlock : undefined}
        clipLabel={clip ? BLOCK_MAP[clip.type]?.label : undefined}
        after={(() => {
          const at = insertAt ?? (idx >= 0 ? idx + 1 : draft.blocks.length);
          const prev = draft.blocks[at - 1];
          return prev ? `${at}. ${BLOCK_MAP[prev.type]?.label ?? prev.type}` : null;
        })()}
      />
      <HistoryDialog open={history} onClose={() => setHistory(false)} pageId={id} onRestored={() => qc.invalidateQueries({ queryKey: ['page', id] })} />
      <ScheduleDialog open={scheduling} onClose={() => setScheduling(false)} loading={publish.isPending} onSchedule={(at) => publish.mutate(at)} />
    </div>
  );
}

function SaveIndicator({ state, unpublished, onReload, onRetry }: { state: SaveState; unpublished: boolean; onReload: () => void; onRetry: () => void }) {
  if (state === 'conflict') {
    return (
      <span className="flex items-center gap-2 rounded-full bg-warning/10 px-3 py-1 text-[12px] font-semibold text-warning">
        Someone else saved this page. <button type="button" className="underline" onClick={onReload}>Load their version</button>
      </span>
    );
  }
  if (state === 'error') return <button type="button" onClick={onRetry} className="text-[12px] font-semibold text-danger underline">Not saved — retry</button>;
  return (
    <span className="flex items-center gap-1.5 text-[12px] text-fg-subtle" aria-live="polite">
      {state === 'saving' ? <LoaderCircle className="size-3.5 animate-spin" /> : state === 'dirty' ? <span className="size-1.5 rounded-full bg-warning" /> : <Check className="size-3.5 text-success" />}
      {state === 'saving' ? 'Saving…' : state === 'dirty' ? 'Unsaved' : unpublished ? (
        <span className="font-semibold text-warning">Saved as draft — Publish to update the website</span>
      ) : (
        'Draft saved'
      )}
    </span>
  );
}

function SortableBlock({ block, index, active, hasError, editable, onSelect, onToggle }: { block: Block; index: number; active: boolean; hasError: boolean; editable: boolean; onSelect: () => void; onToggle: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: block.id, disabled: !editable });
  const def = BLOCK_MAP[block.type];
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn('group flex items-center gap-1.5 rounded-xl border px-1.5 py-1.5', active ? 'border-fg/25 bg-surface-2' : 'border-transparent hover:bg-surface-2/60', isDragging && 'z-10 shadow-[var(--shadow-lift)]', block.hidden && 'opacity-55')}
    >
      <button type="button" className="grid size-6 shrink-0 cursor-grab place-items-center text-fg-subtle active:cursor-grabbing" aria-label={`Drag ${def?.label}`} {...attributes} {...listeners}>
        <GripVertical className="size-4" />
      </button>
      <button type="button" onClick={onSelect} className="flex min-w-0 flex-1 items-center gap-2.5 text-left">
        <span className="relative grid size-8 shrink-0 place-items-center rounded-lg bg-surface text-brand ring-1 ring-line">
          <BlockIcon name={def?.icon ?? ''} className="size-4" />
          {hasError && <span className="absolute -right-1 -top-1 size-2.5 rounded-full bg-danger ring-2 ring-surface" />}
        </span>
        <span className="min-w-0">
          <span className="block text-[12.5px] font-semibold">
            <span className="mr-1 text-[10.5px] tabular text-fg-subtle">{index + 1}</span>
            {def?.label ?? block.type}
          </span>
          <span className="block truncate text-[11.5px] text-fg-subtle">{blockSummary(block)}</span>
        </span>
      </button>
      {editable && (
        <button type="button" onClick={onToggle} className="grid size-7 shrink-0 place-items-center rounded-full text-fg-subtle opacity-0 hover:bg-surface hover:text-fg group-hover:opacity-100" aria-label={block.hidden ? 'Show block' : 'Hide block'}>
          {block.hidden ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
        </button>
      )}
    </li>
  );
}

function PreviewFrame({ url, device, reloadKey, frameRef }: { url: string | null; device: 'phone' | 'tablet' | 'desktop'; reloadKey: number; frameRef: React.RefObject<HTMLIFrameElement | null> }) {
  const wrap = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const width = device === 'phone' ? 390 : device === 'tablet' ? 820 : 1280;
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setScale(Math.min(1, (el.clientWidth - 32) / width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, [width]);
  return (
    <div ref={wrap} className="relative min-h-0 flex-1 overflow-hidden p-4">
      {url ? (
        <div
          className="absolute left-1/2 top-4 overflow-hidden rounded-xl border border-line bg-white shadow-[var(--shadow-soft)]"
          style={{ width, height: `calc((100% - 2rem) / ${scale})`, transform: `translateX(-50%) scale(${scale})`, transformOrigin: 'top center' }}
        >
          <iframe ref={frameRef} key={reloadKey} src={url} title="Page preview" className="size-full" />
        </div>
      ) : (
        <Skeleton className="h-full" />
      )}
    </div>
  );
}

function AddBlockDialog({ open, onClose, onAdd, onPaste, clipLabel, after }: { open: boolean; onClose: () => void; onAdd: (type: string) => void; onPaste?: () => void; clipLabel?: string; after: string | null }) {
  const [q, setQ] = useState('');
  useEffect(() => {
    if (open) setQ('');
  }, [open]);
  const term = q.trim().toLowerCase();
  const list = BLOCKS.filter((b) => !b.later && (!term || `${b.label} ${b.description} ${b.type} ${b.group}`.toLowerCase().includes(term)));
  const groups = BLOCK_GROUPS.map((g) => ({ g, items: list.filter((b) => b.group === g) })).filter((x) => x.items.length);
  return (
    <Dialog open={open} onClose={onClose} size="xl" title="Add a block" description={after ? `Goes after ${after}. Designed pieces — the layout stays beautiful whatever you put in them.` : 'Goes at the top of the page.'}>
      <div className="grid gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <label className="relative min-w-60 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-subtle" />
            <input
              autoFocus
              className="input w-full pl-9"
              placeholder="Search blocks — “photos”, “form”, “rooms”…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && list[0]) onAdd(list[0].type);
              }}
            />
          </label>
          {onPaste && (
            <Button icon={<ClipboardPaste className="size-4" />} onClick={onPaste}>
              Paste copied {clipLabel?.toLowerCase() ?? 'block'}
            </Button>
          )}
        </div>
        {groups.length === 0 && <p className="py-8 text-center text-[13px] text-fg-muted">No block matches “{q}”.</p>}
        {groups.map(({ g, items }) => (
          <section key={g}>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-fg-subtle">{g}</p>
            <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {items.map((b) => (
                <li key={b.type}>
                  <button type="button" onClick={() => onAdd(b.type)} className="flex h-full w-full items-start gap-3 rounded-2xl border border-line p-3.5 text-left transition-all hover:-translate-y-0.5 hover:border-line-strong hover:shadow-[var(--shadow-soft)]">
                    <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-surface-2 text-brand"><BlockIcon name={b.icon} className="size-4.5" /></span>
                    <span>
                      <span className="block text-[13px] font-semibold">{b.label}</span>
                      <span className="mt-0.5 block text-[12px] leading-snug text-fg-muted">{b.description}</span>
                      {b.variants && b.variants.length > 1 && <span className="mt-1.5 block text-[11px] text-fg-subtle">{b.variants.length} layouts</span>}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </Dialog>
  );
}

function PageMenu({ pageId, liveUrl, canUnpublish, canDelete, title, onUnpublished, onDeleted }: {
  pageId: string; liveUrl: string | null; canUnpublish: boolean; canDelete: boolean; title: string;
  onUnpublished: (p: AdminPageDTO) => void; onDeleted: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const confirm = useConfirm();
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);
  const unpublish = useMutation({
    mutationFn: () => post<AdminPageDTO>(`/pages/${pageId}/unpublish`),
    onSuccess: (p) => {
      toast.success('Taken off the website — it is a draft again');
      onUnpublished(p);
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Could not unpublish'),
  });
  const remove = useMutation({
    mutationFn: () => del(`/pages/${pageId}`),
    onSuccess: () => {
      toast.success('Page deleted');
      onDeleted();
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Could not delete'),
  });
  if (!liveUrl && !canUnpublish && !canDelete) return null;
  const item = 'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[12.5px] font-medium hover:bg-surface-2';
  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen((v) => !v)} className="grid size-8 place-items-center rounded-full border border-line hover:bg-surface-2" aria-label="More page actions" aria-expanded={open}>
        <MoreHorizontal className="size-4" />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 z-40 mt-1 w-56 rounded-xl border border-line bg-surface p-1 shadow-lg">
          {liveUrl && (
            <a role="menuitem" href={liveUrl} target="_blank" rel="noopener noreferrer" className={item} onClick={() => setOpen(false)}>
              <ExternalLink className="size-4 text-fg-muted" /> Open the live page
            </a>
          )}
          {canUnpublish && (
            <button
              type="button"
              role="menuitem"
              className={item}
              onClick={async () => {
                setOpen(false);
                if (await confirm({ title: `Take “${title}” off the website?`, body: 'Visitors get the “not found” page until you publish again. The content stays here as a draft.', confirm: 'Unpublish' })) unpublish.mutate();
              }}
            >
              <Unplug className="size-4 text-fg-muted" /> Unpublish
            </button>
          )}
          {canDelete && (
            <button
              type="button"
              role="menuitem"
              className={cn(item, 'text-danger hover:bg-danger/10')}
              onClick={async () => {
                setOpen(false);
                if (await confirm({ title: `Delete “${title}”?`, body: 'The page leaves the website and this list. Menu links pointing to it should be removed too.', confirm: 'Delete page', danger: true })) remove.mutate();
              }}
            >
              <Trash2 className="size-4" /> Delete page
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/* ───────── Page health: what to fix before (or after) publishing ───────── */

type Health = { level: 'ok' | 'warn' | 'error'; text: string; blockId?: string };

const emptyValue = (f: FieldDef, v: unknown) => {
  if (f.kind === 'ltext' || f.kind === 'lrich') return !v || typeof v !== 'object' || !Object.values(v as Record<string, unknown>).some((x) => (typeof x === 'string' ? x.trim() : x));
  if (f.kind === 'mediaList' || f.kind === 'refs' || f.kind === 'list' || f.kind === 'ctas') return !Array.isArray(v) || v.length === 0;
  return v === undefined || v === null || v === '';
};

function pageHealth(d: Draft, kind: AdminPageDTO['kind']): Health[] {
  const out: Health[] = [];
  const visible = d.blocks.filter((b) => !b.hidden);
  const seoTitle = d.seo.title?.en || d.title.en || '';
  const desc = d.seo.description?.en ?? '';
  out.push(!d.title.en?.trim() ? { level: 'error', text: 'The page has no title' } : { level: 'ok', text: 'Page title set' });
  out.push(seoTitle.length > 60 ? { level: 'warn', text: `Search title is ${seoTitle.length} characters — Google shows about 60` } : { level: 'ok', text: 'Search title fits in Google results' });
  out.push(!desc ? { level: 'warn', text: 'No search description — Google will pick text from the page' } : desc.length < 70 ? { level: 'warn', text: `Search description is short (${desc.length}) — aim for 120–160 characters` } : desc.length > 165 ? { level: 'warn', text: `Search description is long (${desc.length}) — Google cuts it near 160` } : { level: 'ok', text: 'Search description is a good length' });
  const hero = visible.find((b) => b.type === 'hero');
  const heroImg = Array.isArray((hero?.data as Record<string, unknown> | undefined)?.media) && ((hero!.data as { media: unknown[] }).media.length > 0);
  if (kind !== 'SYSTEM' && kind !== 'LEGAL') {
    out.push(d.seo.shareImageId || heroImg ? { level: 'ok', text: 'Has an image for WhatsApp and social shares' } : { level: 'warn', text: 'No share image — links on WhatsApp will show the site default' });
    out.push(visible[0]?.type === 'hero' ? { level: 'ok', text: 'Opens with a hero' } : { level: 'warn', text: 'The page does not open with a hero block', blockId: visible[0]?.id });
  }
  if (d.seo.noindex) out.push({ level: 'warn', text: 'Hidden from search engines (Search & sharing settings)' });
  if (!visible.length) out.push({ level: 'error', text: 'Every block is hidden — the page will be empty' });
  const heroes = visible.filter((b) => b.type === 'hero').length;
  if (heroes > 1) out.push({ level: 'warn', text: `${heroes} hero blocks — a page reads best with one` });
  d.blocks.forEach((b, i) => {
    const def = BLOCK_MAP[b.type];
    if (!def || b.hidden) return;
    for (const f of def.fields) {
      const required = ('required' in f && f.required) || (f.kind === 'mediaList' && (f.min ?? 0) > 0);
      if (required && emptyValue(f, (b.data as Record<string, unknown>)[f.name])) {
        out.push({ level: 'error', text: `Block ${i + 1} (${def.label}) needs “${f.label}”`, blockId: b.id });
        break;
      }
    }
  });
  const order: Record<Health['level'], number> = { error: 0, warn: 1, ok: 2 };
  return out.sort((a, b) => order[a.level] - order[b.level]);
}

function HealthList({ items, onPick }: { items: Health[]; onPick: (blockId: string) => void }) {
  const bad = items.filter((i) => i.level !== 'ok').length;
  return (
    <div className="rounded-xl border border-line bg-surface p-3">
      <p className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-fg-subtle">
        Page check
        <span className={cn('rounded-full px-1.5 py-0.5 text-[10px] normal-case tracking-normal', bad ? 'bg-warning/15 text-warning' : 'bg-success/15 text-success')}>{bad ? `${bad} to look at` : 'all good'}</span>
      </p>
      <ul className="grid gap-1.5">
        {items.map((h, i) => (
          <li key={i} className="flex items-start gap-2 text-[12.5px]">
            {h.level === 'ok' ? <CircleCheck className="mt-0.5 size-3.5 shrink-0 text-success" /> : h.level === 'warn' ? <TriangleAlert className="mt-0.5 size-3.5 shrink-0 text-warning" /> : <CircleAlert className="mt-0.5 size-3.5 shrink-0 text-danger" />}
            {h.blockId ? (
              <button type="button" className="text-left underline decoration-dotted underline-offset-2 hover:text-fg" onClick={() => onPick(h.blockId!)}>{h.text}</button>
            ) : (
              <span className={h.level === 'ok' ? 'text-fg-muted' : ''}>{h.text}</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function HistoryDialog({ open, onClose, pageId, onRestored }: { open: boolean; onClose: () => void; pageId: string; onRestored: () => void }) {
  const confirm = useConfirm();
  const can = useCan();
  const { data } = useQuery({ queryKey: ['page-versions', pageId], queryFn: () => get<{ id: string; version: number; publishedAt: string; publishedBy: string; blockCount: number }[]>(`/pages/${pageId}/versions`), enabled: open });
  const restore = useMutation({
    mutationFn: (v: number) => post(`/pages/${pageId}/versions/${v}/restore`),
    onSuccess: () => {
      toast.success('Version restored into the draft. Publish when ready.');
      onRestored();
      onClose();
    },
  });
  return (
    <Dialog open={open} onClose={onClose} title="Published versions" description="Every publish is kept. Restoring copies a version into the draft — the live page changes only when you publish.">
      <ol className="divide-y divide-line">
        {data?.map((v, i) => (
          <li key={v.id} className="flex items-center gap-3 py-3">
            <span className="grid size-9 place-items-center rounded-full bg-surface-2 text-[12px] font-semibold tabular">v{v.version}</span>
            <span className="flex-1 text-[13px]">
              <span className="font-medium">{dateTime(v.publishedAt)}</span> <span className="text-fg-subtle">· {ago(v.publishedAt)}</span>
              <span className="block text-[12px] text-fg-muted">{v.publishedBy} · {v.blockCount} blocks</span>
            </span>
            {i === 0 ? <Pill tone="green">Live</Pill> : can('content:write') && (
              <Button size="sm" loading={restore.isPending} onClick={async () => (await confirm({ title: `Restore version ${v.version}?`, body: 'Your current draft is replaced by this version. The live site does not change until you publish.', confirm: 'Restore into draft' })) && restore.mutate(v.version)}>
                Restore
              </Button>
            )}
          </li>
        ))}
      </ol>
    </Dialog>
  );
}

function ScheduleDialog({ open, onClose, onSchedule, loading }: { open: boolean; onClose: () => void; onSchedule: (iso: string) => void; loading: boolean }) {
  const [at, setAt] = useState('');
  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="sm"
      title="Schedule publishing"
      description="Times are Kampala time (EAT). The draft as it is at that moment goes live."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={loading} disabled={!at} onClick={() => onSchedule(new Date(`${at}:00+03:00`).toISOString())}>Schedule</Button>
        </>
      }
    >
      <TextInput label="Publish at" type="datetime-local" value={at} onChange={(e) => setAt(e.target.value)} />
    </Dialog>
  );
}

function SeoEditor({ seo, onChange }: { seo: SeoDTO; onChange: (s: SeoDTO) => void }) {
  const title = seo.title?.en ?? '';
  const desc = seo.description?.en ?? '';
  return (
    <div className="grid gap-4 border-t border-line pt-4">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-fg-subtle">Search & sharing</p>
      <FieldRenderer
        fields={[
          { kind: 'ltext', name: 'title', label: 'Search title', help: `${title.length}/60 — defaults to the page title` },
          { kind: 'ltext', name: 'description', label: 'Search description', multiline: true, help: `${desc.length}/160 characters` },
          { kind: 'media', name: 'shareImageId', label: 'Share image', help: 'Shown on WhatsApp and social links. Defaults to the first hero image.' },
          { kind: 'boolean', name: 'noindex', label: 'Hide from search engines' },
        ]}
        value={seo as Record<string, unknown>}
        onChange={(v) => onChange(v as SeoDTO)}
      />
      <div className="rounded-xl border border-line bg-surface p-3">
        <p className="text-[11px] text-fg-subtle">Google preview</p>
        <p className="mt-1 truncate text-[15px] text-[#1a0dab] dark:text-[#8ab4f8]">{title || 'Page title'} · Reberon Hotel, Kapchorwa</p>
        <p className="line-clamp-2 text-[12.5px] text-fg-muted">{desc || 'Add a description so people know what they will find.'}</p>
      </div>
    </div>
  );
}
