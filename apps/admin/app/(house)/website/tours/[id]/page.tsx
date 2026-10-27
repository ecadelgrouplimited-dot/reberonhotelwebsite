'use client';
import { Suspense, use, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Crosshair, Plus, Trash2 } from 'lucide-react';
import { HOTSPOT_KINDS, TOUR_PROVIDERS, normalizeTourUrl, type HotspotKind, type TourAdminDTO, type TourProvider } from '@reberon/contracts';
import { ApiError, del, get, patch, post, thumb } from '@/lib/api';
import { useCan } from '@/lib/providers';
import { cn } from '@/lib/cn';
import { Button } from '@/components/ui/button';
import { PageHeader, Section, Skeleton } from '@/components/ui/bits';
import { SelectInput, TextInput } from '@/components/ui/field';
import { useConfirm } from '@/components/ui/confirm';
import { FieldRenderer } from '@/components/forms/field-renderer';

type Hotspot = { kind: HotspotKind; label: { en: string }; note: { en: string }; frame: number | null; x: number | null; y: number | null };
type Form = {
  slug: string; title: { en: string }; summary: { en: string }; space: string; roomTypeId: string | null; variant: string | null; provider: TourProvider; embedUrl: string;
  mediaIds: string[]; posterId: string | null; stage: 'PRE_OPENING' | 'LIVE'; status: 'DRAFT' | 'PUBLISHED' | 'HIDDEN'; order: number; hotspots: Hotspot[];
};
const PROVIDER_LABEL: Record<TourProvider, string> = { DRAWINGS: 'Image walk (drawings or photos from the library)', MATTERPORT: 'Matterport', KUULA: 'Kuula 360°', VIDEO: 'Video (YouTube or Vimeo)', CUSTOM_URL: 'Another embeddable link' };
const KIND_LABEL: Record<HotspotKind, string> = { BED: 'Bed', BATH: 'Bathroom', VIEW: 'View', CAPACITY: 'Capacity', ACCESS: 'Access', OTHER: 'Other' };
const slugify = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 70);

function Editor({ id }: { id: string }) {
  const isNew = id === 'new';
  const qc = useQueryClient();
  const router = useRouter();
  const params = useSearchParams();
  const can = useCan();
  const confirm = useConfirm();
  const { data: tour } = useQuery({ queryKey: ['tour', id], queryFn: () => get<TourAdminDTO>(`/tours/${id}`), enabled: !isNew });
  const rooms = useQuery({ queryKey: ['entity-options-raw', 'room-types'], queryFn: () => get<{ id: string; name: { en?: string }; slug: string }[]>('/room-types') });
  const [f, setF] = useState<Form | null>(null);
  const [placing, setPlacing] = useState<number | null>(null);
  const [frame, setFrame] = useState(0);
  const [errors, setErrors] = useState<Record<string, string>>({});
  // The preview keeps each image's own proportions, exactly like the website, so a placed hotspot lands in the same spot there.
  const [ratios, setRatios] = useState<Record<string, number>>({});
  const ratioOf = (id: string) => ratios[id] ?? 4 / 3;

  useEffect(() => {
    if (isNew && !f) {
      const space = params.get('space') ?? 'ROOM_TYPE';
      setF({ slug: '', title: { en: '' }, summary: { en: '' }, space, roomTypeId: params.get('roomTypeId'), variant: params.get('variant'), provider: params.get('stage') === 'LIVE' ? 'MATTERPORT' : 'DRAWINGS', embedUrl: '', mediaIds: [], posterId: null, stage: params.get('stage') === 'LIVE' ? 'LIVE' : 'PRE_OPENING', status: 'DRAFT', order: 0, hotspots: [] });
    }
    if (tour) setF({ slug: tour.slug, title: { en: tour.title.en ?? '' }, summary: { en: tour.summary.en ?? '' }, space: tour.space, roomTypeId: tour.roomTypeId, variant: tour.variant, provider: tour.provider, embedUrl: tour.embedUrl ?? '', mediaIds: tour.mediaIds, posterId: tour.posterId, stage: tour.stage, status: tour.status, order: tour.order, hotspots: tour.hotspots.map((h) => ({ kind: h.kind, label: { en: h.label.en ?? '' }, note: { en: h.note.en ?? '' }, frame: h.frame, x: h.x, y: h.y })) });
  }, [tour, isNew]); // eslint-disable-line react-hooks/exhaustive-deps

  const norm = useMemo(() => (f && f.provider !== 'DRAWINGS' && f.embedUrl ? normalizeTourUrl(f.provider, f.embedUrl) : null), [f]);
  const save = useMutation({
    mutationFn: () => {
      const body = { ...f!, slug: f!.slug || slugify(f!.title.en), embedUrl: f!.provider === 'DRAWINGS' ? null : f!.embedUrl || null };
      return isNew ? post<TourAdminDTO>('/tours', body) : patch<TourAdminDTO>(`/tours/${id}`, body);
    },
    onSuccess: (d) => {
      setErrors({});
      qc.invalidateQueries({ queryKey: ['tours'] });
      qc.setQueryData(['tour', d.id], d);
      toast.success(d.showing ? 'Saved — this is what the website shows here' : 'Saved');
      if (isNew) router.replace(`/website/tours/${d.id}`);
    },
    onError: (e) => {
      if (e instanceof ApiError) {
        setErrors(Object.fromEntries(e.errors.map((x) => [x.path, x.message])));
        toast.error(e.errors[0]?.message ?? e.message);
      } else toast.error('Could not save');
    },
  });
  const remove = useMutation({ mutationFn: () => del(`/tours/${id}`), onSuccess: () => { qc.invalidateQueries({ queryKey: ['tours'] }); router.replace('/website/tours'); } });

  if (!f || (!isNew && !tour)) return <Skeleton className="h-96" />;
  const edit = can('content:write');
  const set = (p: Partial<Form>) => setF({ ...f, ...p });
  const setSpot = (i: number, p: Partial<Hotspot>) => set({ hotspots: f.hotspots.map((h, k) => (k === i ? { ...h, ...p } : h)) });
  const drawings = f.provider === 'DRAWINGS';
  const curFrame = f.mediaIds[Math.min(frame, f.mediaIds.length - 1)];

  return (
    <div className="fade-in">
      <PageHeader
        crumbs={[{ label: 'Virtual tours', href: '/website/tours' }, { label: isNew ? 'New' : f.title.en || 'Tour' }]}
        title={isNew ? 'New tour' : f.title.en || 'Tour'}
        description={tour?.showing ? 'The website shows this tour in its place right now.' : f.status === 'PUBLISHED' ? 'Published, but another tour in the same place is showing (a live tour beats drawings).' : 'Not on the website yet.'}
        actions={edit && (
          <>
            {!isNew && <Button variant="danger" icon={<Trash2 className="size-4" />} onClick={async () => { if (await confirm({ title: 'Delete this tour?', body: 'Its walk stops showing on the website. The analytics go with it.', confirm: 'Delete', danger: true })) remove.mutate(); }}>Delete</Button>}
            <Button variant="primary" loading={save.isPending} onClick={() => save.mutate()}>{isNew ? 'Create' : 'Save'}</Button>
          </>
        )}
      />

      <div className="grid items-start gap-5 xl:grid-cols-[1fr_28rem]">
        <div className="grid gap-5">
          <Section title="Where it belongs">
            <div className="grid items-start gap-4 sm:grid-cols-2">
              <SelectInput label="Space" value={f.space} disabled={!edit} onChange={(e) => set({ space: e.target.value, variant: e.target.value === 'HALL' ? (f.variant ?? 'EMPTY') : null, roomTypeId: e.target.value === 'ROOM_TYPE' ? f.roomTypeId : null })}>
                <option value="ROOM_TYPE">A room type</option><option value="HALL">The hall</option><option value="LOBBY">Lobby</option><option value="COMPOUND">The compound</option><option value="BEYOND">Beyond the gate</option>
              </SelectInput>
              {f.space === 'ROOM_TYPE' && <SelectInput label="Room type" value={f.roomTypeId ?? ''} error={errors.roomTypeId} disabled={!edit} onChange={(e) => set({ roomTypeId: e.target.value || null })}><option value="">Choose…</option>{rooms.data?.map((r) => <option key={r.id} value={r.id}>{r.name.en}</option>)}</SelectInput>}
              {f.space === 'HALL' && <SelectInput label="Version" value={f.variant ?? 'EMPTY'} disabled={!edit} onChange={(e) => set({ variant: e.target.value })}><option value="EMPTY">Cleared</option><option value="SET">Set for an event</option></SelectInput>}
              <SelectInput label="Stage" value={f.stage} disabled={!edit} onChange={(e) => set({ stage: e.target.value as Form['stage'] })} hint={f.stage === 'LIVE' ? 'Replaces the drawings in this place once published.' : 'Shown until a live tour is published here.'}><option value="PRE_OPENING">Before opening (drawings, drone)</option><option value="LIVE">Live (the finished space)</option></SelectInput>
              <SelectInput label="On the website" value={f.status} disabled={!edit} onChange={(e) => set({ status: e.target.value as Form['status'] })}><option value="DRAFT">Draft</option><option value="PUBLISHED">Published</option><option value="HIDDEN">Hidden</option></SelectInput>
            </div>
          </Section>

          <Section title="The words">
            <div className="grid gap-4">
              <TextInput label="Title" required value={f.title.en} error={errors['title.en'] ?? errors.title} disabled={!edit} onChange={(e) => set({ title: { en: e.target.value } })} placeholder="Walk the Elgon View King" />
              <TextInput label="One line under the title" value={f.summary.en} disabled={!edit} onChange={(e) => set({ summary: { en: e.target.value } })} />
              <TextInput label="Address" value={f.slug} error={errors.slug} disabled={!edit} onChange={(e) => set({ slug: e.target.value })} placeholder={slugify(f.title.en) || 'elgon-view-king-walk'} hint="Used in analytics links. Filled from the title when empty." />
            </div>
          </Section>

          <Section title="The walk">
            <div className="grid gap-4">
              <SelectInput label="Kind" value={f.provider} disabled={!edit} onChange={(e) => set({ provider: e.target.value as TourProvider })}>{TOUR_PROVIDERS.map((p) => <option key={p} value={p}>{PROVIDER_LABEL[p]}</option>)}</SelectInput>
              {drawings ? (
                <FieldRenderer fields={[{ kind: 'mediaList', name: 'mediaIds', label: 'Images, in walking order', min: 2, help: 'Drag to reorder. Drawings are labelled as drawings on the website.' }]} value={{ mediaIds: f.mediaIds }} onChange={(v) => set({ mediaIds: (v.mediaIds as string[]) ?? [] })} errors={errors} />
              ) : (
                <TextInput label="Link" value={f.embedUrl} disabled={!edit} error={errors.embedUrl ?? (norm && 'error' in norm ? norm.error : undefined)} onChange={(e) => set({ embedUrl: e.target.value })} placeholder={f.provider === 'MATTERPORT' ? 'https://my.matterport.com/show/?m=…' : f.provider === 'KUULA' ? 'https://kuula.co/share/…' : 'https://…'} hint={norm && 'url' in norm ? `Will play: ${norm.url}` : undefined} />
              )}
              <FieldRenderer fields={[{ kind: 'media', name: 'posterId', label: 'Poster image', help: drawings ? 'Optional: the first drawing is used when empty.' : 'Shown before the walk loads.' }]} value={{ posterId: f.posterId }} onChange={(v) => set({ posterId: (v.posterId as string) ?? null })} />
            </div>
          </Section>

          <Section title="What is true here" description="Hotspots: the bed, the bath, the view, how many it sleeps. Plain facts, shown beside the walk." actions={edit && <Button size="sm" icon={<Plus className="size-3.5" />} onClick={() => set({ hotspots: [...f.hotspots, { kind: 'OTHER', label: { en: '' }, note: { en: '' }, frame: drawings ? frame : null, x: null, y: null }] })}>Add</Button>}>
            {!f.hotspots.length && <p className="text-[13px] text-fg-muted">None yet.</p>}
            <ul className="grid gap-3">
              {f.hotspots.map((h, i) => (
                <li key={i} className={cn('grid gap-3 rounded-xl border p-3 sm:grid-cols-[8rem_1fr_1fr_auto]', placing === i ? 'border-fg ring-1 ring-fg' : 'border-line')}>
                  <SelectInput aria-label="Kind" value={h.kind} disabled={!edit} onChange={(e) => setSpot(i, { kind: e.target.value as HotspotKind })}>{HOTSPOT_KINDS.map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}</SelectInput>
                  <TextInput aria-label="Label" placeholder="One king bed, 180 × 200" value={h.label.en} disabled={!edit} onChange={(e) => setSpot(i, { label: { en: e.target.value } })} />
                  <TextInput aria-label="Note" placeholder="A detail (optional)" value={h.note.en} disabled={!edit} onChange={(e) => setSpot(i, { note: { en: e.target.value } })} />
                  <span className="flex items-center gap-1">
                    {drawings && edit && <Button size="icon" variant={placing === i ? 'dark' : 'ghost'} aria-label="Place on the drawing" title={h.x !== null ? `On drawing ${(h.frame ?? 0) + 1}` : 'Place on the drawing'} onClick={() => { setPlacing(placing === i ? null : i); if (h.frame !== null) setFrame(h.frame); }}><Crosshair className={cn('size-4', h.x !== null && placing !== i && 'text-success')} /></Button>}
                    {edit && <Button size="icon" variant="ghost" aria-label="Remove" onClick={() => set({ hotspots: f.hotspots.filter((_, k) => k !== i) })}><Trash2 className="size-4" /></Button>}
                  </span>
                </li>
              ))}
            </ul>
          </Section>
        </div>

        <aside className="grid gap-5 xl:sticky xl:top-20">
          <div className="card overflow-hidden">
            <div className="flex items-center justify-between border-b border-line px-4 py-2.5 text-[12.5px]">
              <span className="font-semibold">Preview</span>
              {drawings && f.mediaIds.length > 0 && <span className="text-fg-muted">{placing !== null ? 'Click the image to place the hotspot' : `Image ${Math.min(frame, f.mediaIds.length - 1) + 1} of ${f.mediaIds.length}`}</span>}
            </div>
            {drawings ? (
              curFrame ? (
                <>
                  <div className={cn('relative bg-basalt-950', placing !== null && 'cursor-crosshair')} style={{ aspectRatio: String(ratioOf(curFrame)) }}
                    onClick={(e) => {
                      if (placing === null) return;
                      const r = e.currentTarget.getBoundingClientRect();
                      setSpot(placing, { frame: Math.min(frame, f.mediaIds.length - 1), x: Math.round(((e.clientX - r.left) / r.width) * 1000) / 1000, y: Math.round(((e.clientY - r.top) / r.height) * 1000) / 1000 });
                      setPlacing(null);
                    }}>
                    <img
                      src={thumb(curFrame, 960)}
                      alt=""
                      className="absolute inset-0 size-full object-cover"
                      onLoad={(e) => {
                        const img = e.currentTarget;
                        if (img?.naturalWidth && img?.naturalHeight) {
                          const ratio = img.naturalWidth / img.naturalHeight;
                          setRatios((r) => ({ ...r, [curFrame]: ratio }));
                        }
                      }}
                    />
                    {f.hotspots.map((h, i) => h.frame === Math.min(frame, f.mediaIds.length - 1) && h.x !== null && h.y !== null && (
                      <span key={i} className="absolute grid size-8 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border-2 border-white bg-basalt-950/80 text-[11px] font-bold text-white shadow" style={{ left: `${h.x * 100}%`, top: `${h.y * 100}%` }} title={h.label.en}>{i + 1}</span>
                    ))}
                  </div>
                  <div className="flex gap-1.5 overflow-x-auto p-2">
                    {f.mediaIds.map((m, i) => <button key={m + i} type="button" onClick={() => setFrame(i)} className={cn('size-12 shrink-0 overflow-hidden rounded-md border-2', i === Math.min(frame, f.mediaIds.length - 1) ? 'border-fg' : 'border-transparent opacity-60')}><img src={thumb(m, 320)} alt={`Drawing ${i + 1}`} className="size-full object-cover" /></button>)}
                  </div>
                </>
              ) : <p className="p-6 text-[13px] text-fg-muted">Add at least two images.</p>
            ) : norm && 'url' in norm ? (
              <div className="relative aspect-[4/3]"><iframe src={norm.url} title="Tour preview" className="absolute inset-0 size-full border-0" allow="fullscreen; xr-spatial-tracking" allowFullScreen /></div>
            ) : <p className="p-6 text-[13px] text-fg-muted">Paste the link to see the walk here.</p>}
          </div>

          {tour && (
            <div className="card grid gap-3 p-5 text-[13px]">
              <p className="font-semibold">Last 90 days</p>
              <dl className="grid grid-cols-2 gap-3">
                {[['Walks started', tour.stats.opened], ['Walked to the end', tour.stats.completed], ['Hotspots opened', tour.stats.hotspots], ['Went on to book', tour.stats.startedBooking], ['…and paid', tour.stats.paid], ['“Book” clicks', tour.stats.ctaClicks]].map(([l, v]) => (
                  <div key={l as string}><dt className="text-fg-muted">{l}</dt><dd className="text-[1.3rem] font-semibold tabular">{v}</dd></div>
                ))}
              </dl>
              <p className="text-[12px] text-fg-subtle">Counted by an anonymous browser id, never a person. “Went on to book” means the same browser started a booking after walking.</p>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <Suspense><Editor id={id} /></Suspense>;
}
