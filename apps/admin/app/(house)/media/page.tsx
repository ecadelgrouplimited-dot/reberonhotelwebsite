'use client';
import { Suspense, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ImagePlus, Link as LinkIcon, Replace, Search, Trash2, Upload } from 'lucide-react';
import type { AdminMediaDTO } from '@reberon/contracts';
import { t } from '@reberon/contracts/text';
import { ApiError, del, get, patch, thumb } from '@/lib/api';
import { useCan } from '@/lib/providers';
import { bytes, dateShort } from '@/lib/format';
import { cn } from '@/lib/cn';
import { Button } from '@/components/ui/button';
import { PageHeader, Pill, Skeleton } from '@/components/ui/bits';
import { Dialog } from '@/components/ui/dialog';
import { Switch, TextArea, TextInput } from '@/components/ui/field';
import { useConfirm } from '@/components/ui/confirm';
import { MediaPicker, useUpload } from '@/components/media/media-picker';
import { useRouter as useNavRouter } from 'next/navigation';
import * as SI from 'lucide-react';
import { focusSearch, useScreenActions } from '@/components/os/screen-actions';
import { post } from '@/lib/api';

type Page = { data: AdminMediaDTO[]; nextCursor: string | null; total: number; folders: { name: string | null; count: number }[] };
type Detail = AdminMediaDTO & { uploadedBy: string | null; usages: { type: string; label: string; href: string }[] };

function MediaInner() {
  const can = useCan();
  const params = useSearchParams();
  const [q, setQ] = useState('');
  const [folder, setFolder] = useState('');
  const [rendering, setRendering] = useState(params.get('rendering') ?? '');
  const [openId, setOpenId] = useState<string | null>(null);
  const [drag, setDrag] = useState(false);
  useScreenActions('Media library', [
    { label: 'Upload photos', icon: SI.Upload, key: 'u', onSelect: () => document.querySelector<HTMLInputElement>('main input[type="file"]')?.click() },
    { label: 'Find a photo', icon: SI.Search, key: 'f', onSelect: focusSearch },
    { kind: 'separator' },
    { label: 'All photos', icon: SI.Images, key: 'a', onSelect: () => { setFolder(''); setRendering(''); setQ(''); } },
    { label: 'Drawings still to replace', icon: SI.PencilRuler, key: 'd', onSelect: () => setRendering('true') },
  ]);
  const input = useRef<HTMLInputElement>(null);
  const { upload, busy } = useUpload(folder || undefined);
  useEffect(() => {
    if (params.get('upload')) setTimeout(() => input.current?.click(), 300);
  }, [params]);
  const qs = new URLSearchParams({ limit: '60', ...(q ? { q } : {}), ...(folder ? { folder } : {}), ...(rendering ? { rendering } : {}) });
  const media = useInfiniteQuery({
    queryKey: ['media', 'library', qs.toString()],
    queryFn: ({ pageParam }) => get<Page>(`/media?${qs}${pageParam ? `&cursor=${pageParam}` : ''}`),
    initialPageParam: '',
    getNextPageParam: (p) => p.nextCursor,
    refetchInterval: busy ? 2000 : false,
  });
  const items = media.data?.pages.flatMap((p) => p.data) ?? [];
  const first = media.data?.pages[0];

  return (
    <div
      className="fade-in"
      onDragOver={(e) => { if (can('media:upload')) { e.preventDefault(); setDrag(true); } }}
      onDragLeave={(e) => e.currentTarget === e.target && setDrag(false)}
      onDrop={(e) => { e.preventDefault(); setDrag(false); if (can('media:upload')) void upload(e.dataTransfer.files); }}
    >
      <PageHeader
        title="Media"
        description="Photos, drawings and documents. Every image is resized for phones automatically; alt text is required for accessibility."
        actions={can('media:upload') && (
          <>
            <input ref={input} type="file" multiple accept="image/*,application/pdf" hidden onChange={(e) => { if (e.target.files) void upload(e.target.files); e.target.value = ''; }} />
            <Button variant="primary" icon={<Upload className="size-4" />} loading={busy > 0} onClick={() => input.current?.click()}>{busy ? `Uploading ${busy}…` : 'Upload'}</Button>
          </>
        )}
      />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <label className="relative min-w-60 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-subtle" />
          <input className="input pl-9" placeholder="Search name, alt text or tag" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        <select className="input !w-auto" value={folder} onChange={(e) => setFolder(e.target.value)} aria-label="Folder">
          <option value="">All folders ({first?.folders.reduce((a, f) => a + f.count, 0) ?? 0})</option>
          {first?.folders.map((f) => <option key={f.name ?? '__none'} value={f.name ?? '__none'}>{f.name ?? 'No folder'} ({f.count})</option>)}
        </select>
        <select className="input !w-auto" value={rendering} onChange={(e) => setRendering(e.target.value)} aria-label="Kind">
          <option value="">Photos & drawings</option>
          <option value="false">Real photos only</option>
          <option value="true">Drawings & placeholders</option>
        </select>
      </div>
      <div className={cn('relative rounded-3xl transition', drag && 'outline-2 outline-dashed outline-brand outline-offset-4')}>
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5 2xl:grid-cols-6">
          {media.isLoading && Array.from({ length: 12 }, (_, i) => <Skeleton key={i} className="aspect-[4/3]" />)}
          {items.map((m) => (
            <li key={m.id}>
              <button type="button" onClick={() => setOpenId(m.id)} className="group block w-full text-left">
                <span className="relative block aspect-[4/3] overflow-hidden rounded-xl bg-surface-2 ring-offset-2 ring-offset-bg group-hover:ring-2 group-hover:ring-line-strong" style={{ background: m.dominantColor ?? undefined }}>
                  {m.kind === 'IMAGE' && m.status === 'READY' ? <img src={thumb(m.id, 320)} alt={t(m.alt)} className="size-full object-cover" loading="lazy" /> : <span className="grid size-full place-items-center text-[12px] text-fg-subtle">{m.status === 'PROCESSING' ? 'Processing…' : m.kind === 'DOCUMENT' ? 'PDF' : m.status}</span>}
                  {m.isRendering && <span className="absolute bottom-1.5 left-1.5 rounded bg-basalt-950/70 px-1.5 text-[10px] font-semibold uppercase text-white">Drawing</span>}
                  {!t(m.alt) && <span className="absolute right-1.5 top-1.5 rounded bg-warning px-1.5 text-[10px] font-semibold text-white">No alt</span>}
                </span>
                <span className="mt-1.5 block truncate text-[12px] text-fg-muted">{t(m.alt) || m.originalName}</span>
              </button>
            </li>
          ))}
        </ul>
        {!media.isLoading && !items.length && (
          <div className="grid place-items-center rounded-3xl border border-dashed border-line-strong py-20 text-center text-fg-muted">
            <ImagePlus className="mb-3 size-8 text-fg-subtle" /> Drop photos anywhere on this page.
          </div>
        )}
      </div>
      {media.hasNextPage && <div className="mt-6 text-center"><Button loading={media.isFetchingNextPage} onClick={() => media.fetchNextPage()}>Load more</Button></div>}
      <MediaDrawer id={openId} onClose={() => setOpenId(null)} />
    </div>
  );
}

function MediaDrawer({ id, onClose }: { id: string | null; onClose: () => void }) {
  const qc = useQueryClient();
  const can = useCan();
  const confirm = useConfirm();
  const { data: m } = useQuery({ queryKey: ['media-item', id], queryFn: () => get<Detail>(`/media/${id}`), enabled: !!id });
  const [f, setF] = useState({ alt: '', caption: '', credit: '', tags: '', folder: '', isRendering: false, focalX: 0.5, focalY: 0.5 });
  useEffect(() => {
    if (m) setF({ alt: t(m.alt), caption: t(m.caption), credit: m.credit ?? '', tags: m.tags.join(', '), folder: m.folder ?? '', isRendering: m.isRendering, focalX: m.focalX, focalY: m.focalY });
  }, [m]);
  const save = useMutation({
    mutationFn: () => patch(`/media/${id}`, { alt: { en: f.alt }, caption: f.caption ? { en: f.caption } : null, credit: f.credit || null, tags: f.tags.split(',').map((x) => x.trim()).filter(Boolean), folder: f.folder || null, isRendering: f.isRendering, focalX: f.focalX, focalY: f.focalY }),
    onSuccess: () => { toast.success('Saved'); qc.invalidateQueries({ queryKey: ['media'] }); qc.invalidateQueries({ queryKey: ['media-item', id] }); },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Could not save'),
  });
  const remove = useMutation({
    mutationFn: () => del(`/media/${id}`),
    onSuccess: () => { toast.success('Deleted'); qc.invalidateQueries({ queryKey: ['media'] }); onClose(); },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Could not delete'),
  });
  const editable = can('media:manage');
  const [picking, setPicking] = useState(false);
  const replace = useMutation({
    mutationFn: (withId: string) => post<{ rooms: number; facilities: number; progress: number; destinations: number; pages: number; settings: number; republished: string[]; draftOnly: number }>(`/media/${id}/replace`, { withId }),
    onSuccess: (r) => {
      const parts = [r.rooms && `${r.rooms} room${r.rooms > 1 ? 's' : ''}`, r.facilities && `${r.facilities} facilit${r.facilities > 1 ? 'ies' : 'y'}`, r.destinations && `${r.destinations} stor${r.destinations > 1 ? 'ies' : 'y'}`, r.progress && `${r.progress} update${r.progress > 1 ? 's' : ''}`, r.pages && `${r.pages} page${r.pages > 1 ? 's' : ''}`, r.settings && 'settings'].filter(Boolean);
      toast.success(`Replaced in ${parts.join(', ') || 'nothing'}.${r.draftOnly ? ` ${r.draftOnly} page(s) had unpublished work — publish them to show the new photo.` : ' Live on the website.'}`, { duration: 8000 });
      qc.invalidateQueries();
      onClose();
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Could not replace'),
  });
  return (
    <Dialog drawer open={!!id} onClose={onClose} title={m?.originalName ?? 'Loading…'} description={m ? `${m.width ?? '?'}×${m.height ?? '?'} · ${bytes(m.bytes)} · ${dateShort(m.createdAt)}${m.uploadedBy ? ` · ${m.uploadedBy}` : ''}` : undefined}>
      {!m ? <Skeleton className="h-80" /> : (
        <div className="grid gap-5">
          {m.kind === 'IMAGE' ? (
            <div>
              <div
                className={cn('relative overflow-hidden rounded-xl bg-surface-2', editable && 'cursor-crosshair')}
                onClick={(e) => {
                  if (!editable) return;
                  const r = e.currentTarget.getBoundingClientRect();
                  setF({ ...f, focalX: +((e.clientX - r.left) / r.width).toFixed(3), focalY: +((e.clientY - r.top) / r.height).toFixed(3) });
                }}
              >
                <img src={thumb(m.id, 960)} alt={t(m.alt)} className="block w-full" />
                <span className="pointer-events-none absolute size-7 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_1px_rgb(0_0_0/.4),0_0_0_9999px_rgb(0_0_0/.12)]" style={{ left: `${f.focalX * 100}%`, top: `${f.focalY * 100}%` }} />
              </div>
              <p className="mt-1.5 text-[12px] text-fg-subtle">Click the part that must never be cropped — the website keeps it in view at every screen size.</p>
              <div className="mt-2 grid grid-cols-3 gap-2">
                {['aspect-square', 'aspect-[4/5]', 'aspect-[21/9]'].map((a) => (
                  <div key={a} className={cn('overflow-hidden rounded-lg bg-surface-2', a)}>
                    <img src={thumb(m.id, 640)} alt="" className="size-full object-cover" style={{ objectPosition: `${f.focalX * 100}% ${f.focalY * 100}%` }} />
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <a href={m.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 rounded-xl border border-line p-4 text-[13px] font-medium"><LinkIcon className="size-4" /> Open document</a>
          )}
          <fieldset disabled={!editable} className="grid gap-4">
            <TextArea label="Alt text" required rows={2} value={f.alt} onChange={(e) => setF({ ...f, alt: e.target.value })} hint="What a person who cannot see the image needs to know." error={!f.alt ? 'Required before the image appears on the site' : undefined} />
            <TextInput label="Caption (optional)" value={f.caption} onChange={(e) => setF({ ...f, caption: e.target.value })} />
            <div className="grid grid-cols-2 gap-3">
              <TextInput label="Credit" value={f.credit} onChange={(e) => setF({ ...f, credit: e.target.value })} />
              <TextInput label="Folder" value={f.folder} onChange={(e) => setF({ ...f, folder: e.target.value })} />
            </div>
            <TextInput label="Tags" value={f.tags} onChange={(e) => setF({ ...f, tags: e.target.value })} hint="Comma separated" />
            <Switch label="This is a drawing or render" hint="The website labels it “Drawing · not a photo”." checked={f.isRendering} onChange={(v) => setF({ ...f, isRendering: v })} />
            {editable && <Button variant="primary" className="justify-self-start" loading={save.isPending} onClick={() => save.mutate()} disabled={!f.alt}>Save</Button>}
          </fieldset>
          <div>
            <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-fg-subtle">Used in</h3>
            {m.usages.length ? (
              <ul className="grid gap-1.5">
                {m.usages.map((u, i) => (
                  <li key={i}><a href={u.href} className="flex items-center gap-2 rounded-lg border border-line px-3 py-2 text-[13px] hover:bg-surface-2"><Pill>{u.type}</Pill> {u.label}</a></li>
                ))}
              </ul>
            ) : <p className="text-[13px] text-fg-muted">Not used anywhere yet.</p>}
          </div>
          {editable && can('content:write') && m.usages.length > 0 && (
            <div className="rounded-xl border border-line bg-surface-2/50 p-4">
              <p className="text-[13px] font-semibold">Replace everywhere</p>
              <p className="mt-1 text-[12.5px] text-fg-muted">Swap this {m.isRendering ? 'drawing' : 'image'} for a real photograph in all {m.usages.length} place{m.usages.length > 1 ? 's' : ''} at once. Pages that were fully published go live immediately.</p>
              <Button className="mt-3" variant="dark" icon={<Replace className="size-4" />} loading={replace.isPending} onClick={() => setPicking(true)}>Choose the new photo</Button>
              <MediaPicker
                open={picking}
                onClose={() => setPicking(false)}
                onPick={async ([withId]) => {
                  if (withId && (await confirm({ title: `Use the new photo in ${m.usages.length} place${m.usages.length > 1 ? 's' : ''}?`, body: 'Rooms, stories, updates and published pages switch to it now. Pages with unpublished edits get it in their draft.', confirm: 'Replace everywhere' }))) replace.mutate(withId);
                }}
              />
            </div>
          )}
          {editable && (
            <Button variant="danger" className="justify-self-start" icon={<Trash2 className="size-4" />} disabled={m.usages.length > 0} loading={remove.isPending} onClick={async () => (await confirm({ title: `Delete ${m.originalName}?`, body: 'The file and all its sizes are removed.', confirm: 'Delete', danger: true })) && remove.mutate()}>
              {m.usages.length ? 'In use — replace it first' : 'Delete'}
            </Button>
          )}
        </div>
      )}
    </Dialog>
  );
}

export default function MediaPage() {
  return <Suspense><MediaInner /></Suspense>;
}
