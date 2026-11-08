'use client';
import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Copy, ExternalLink, FilePlus2, Search } from 'lucide-react';
import type { AdminPageSummaryDTO, PageKind } from '@reberon/contracts';
import { t } from '@reberon/contracts/text';
import { slugify } from '@reberon/utils';
import { ApiError, get, post, WEB_URL } from '@/lib/api';
import { useCan } from '@/lib/providers';
import { ago } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { PageHeader, Pill, Skeleton, Status, Tabs } from '@/components/ui/bits';
import { Dialog } from '@/components/ui/dialog';
import { SelectInput, TextInput } from '@/components/ui/field';

const KIND_LABEL: Record<PageKind, string> = {
  HOME: 'Home', STANDARD: 'Page', ABOUT: 'About', FACILITIES: 'Facilities', CONTACT: 'Contact', LEGAL: 'Legal', DESTINATION_INDEX: 'Destination index',
  ROOMS_INDEX: 'Rooms index', PROGRESS: 'Progress', LANDING: 'Landing page', SYSTEM: 'System',
};

function PagesInner() {
  const { data, isLoading } = useQuery({ queryKey: ['pages'], queryFn: () => get<AdminPageSummaryDTO[]>('/pages') });
  const params = useSearchParams();
  const [creating, setCreating] = useState(false);
  const [copyOf, setCopyOf] = useState<string>('');
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<'all' | 'live' | 'changes' | 'draft' | 'scheduled'>('all');
  const can = useCan();
  const all = data ?? [];
  const count = {
    all: all.length,
    live: all.filter((p) => p.status === 'PUBLISHED').length,
    changes: all.filter((p) => p.status === 'PUBLISHED' && p.hasUnpublishedChanges).length,
    draft: all.filter((p) => p.status === 'DRAFT').length,
    scheduled: all.filter((p) => p.status === 'SCHEDULED').length,
  };
  const term = q.trim().toLowerCase();
  const rows = all.filter(
    (p) =>
      (filter === 'all' ||
        (filter === 'live' && p.status === 'PUBLISHED') ||
        (filter === 'changes' && p.status === 'PUBLISHED' && p.hasUnpublishedChanges) ||
        (filter === 'draft' && p.status === 'DRAFT') ||
        (filter === 'scheduled' && p.status === 'SCHEDULED')) &&
      (!term || `${t(p.title)} /${p.slug} ${KIND_LABEL[p.kind]}`.toLowerCase().includes(term)),
  );
  useEffect(() => {
    if (params.get('new')) setCreating(true);
  }, [params]);
  return (
    <div className="fade-in">
      <PageHeader
        title="Pages"
        description="Every page on the website is built from blocks. Edit, preview, publish — the site updates within seconds."
        actions={can('content:write') && <Button variant="primary" icon={<FilePlus2 className="size-4" />} onClick={() => setCreating(true)}>New page</Button>}
      />
      <div className="card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-3 pt-1">
          <Tabs
            value={filter}
            onChange={setFilter}
            items={[
              { value: 'all', label: 'All', count: count.all },
              { value: 'live', label: 'Live', count: count.live },
              ...(count.changes ? [{ value: 'changes' as const, label: 'Changes waiting', count: count.changes }] : []),
              ...(count.draft ? [{ value: 'draft' as const, label: 'Drafts', count: count.draft }] : []),
              ...(count.scheduled ? [{ value: 'scheduled' as const, label: 'Scheduled', count: count.scheduled }] : []),
            ]}
          />
          <label className="relative mb-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-fg-subtle" />
            <input className="input !h-8 w-56 pl-8 text-[12.5px]" placeholder="Find a page" value={q} onChange={(e) => setQ(e.target.value)} />
          </label>
        </div>
        <table className="w-full text-[13px]">
          <thead className="bg-surface-2/60 text-left text-[11.5px] font-semibold uppercase tracking-wider text-fg-subtle">
            <tr>
              <th className="px-4 py-2.5">Page</th>
              <th className="hidden px-4 py-2.5 md:table-cell">Type</th>
              <th className="px-4 py-2.5">Status</th>
              <th className="hidden px-4 py-2.5 lg:table-cell">Last edit</th>
              <th className="px-4 py-2.5" />
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {isLoading && Array.from({ length: 8 }, (_, i) => <tr key={i}><td colSpan={5} className="px-4 py-3"><Skeleton className="h-5" /></td></tr>)}
            {!isLoading && rows.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-10 text-center text-fg-muted">No page matches.</td></tr>
            )}
            {rows.map((p) => (
              <tr key={p.id} className="group hover:bg-surface-2/50">
                <td className="px-4 py-3">
                  <Link href={`/website/pages/${p.id}`} className="font-medium hover:underline">{t(p.title)}</Link>
                  <span className="block font-mono text-[11.5px] text-fg-subtle">/{p.slug}</span>
                </td>
                <td className="hidden px-4 py-3 text-fg-muted md:table-cell">{KIND_LABEL[p.kind]}</td>
                <td className="px-4 py-3">
                  <span className="flex flex-wrap items-center gap-1.5">
                    <Status value={p.status} />
                    {p.status === 'PUBLISHED' && p.hasUnpublishedChanges && <Pill tone="amber">Unpublished changes</Pill>}
                  </span>
                </td>
                <td className="hidden px-4 py-3 text-fg-muted lg:table-cell">
                  {ago(p.updatedAt)}
                  {p.updatedBy && <span className="text-fg-subtle"> · {p.updatedBy}</span>}
                </td>
                <td className="px-4 py-3 text-right">
                  <span className="inline-flex gap-1">
                    {p.status === 'PUBLISHED' && p.kind !== 'SYSTEM' && (
                      <a href={`${WEB_URL}/${p.slug}`} target="_blank" rel="noopener noreferrer" className="grid size-8 place-items-center rounded-full text-fg-muted hover:bg-surface-2 hover:text-fg" aria-label="View on the site" title="View on the site">
                        <ExternalLink className="size-4" />
                      </a>
                    )}
                    {can('content:write') && p.kind !== 'SYSTEM' && (
                      <button type="button" className="grid size-8 place-items-center rounded-full text-fg-muted hover:bg-surface-2 hover:text-fg" aria-label="Duplicate" title="Duplicate into a new page" onClick={() => { setCopyOf(p.slug === '' ? '__home' : p.slug); setCreating(true); }}>
                        <Copy className="size-4" />
                      </button>
                    )}
                    <Button size="sm" href={`/website/pages/${p.id}`}>Edit</Button>
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <NewPage open={creating} onClose={() => { setCreating(false); setCopyOf(''); }} pages={data ?? []} copyOf={copyOf} />
    </div>
  );
}

function NewPage({ open, onClose, pages, copyOf }: { open: boolean; onClose: () => void; pages: AdminPageSummaryDTO[]; copyOf: string }) {
  const [title, setTitle] = useState('');
  const [slug, setSlug] = useState('');
  const [touched, setTouched] = useState(false);
  const [template, setTemplate] = useState('');
  useEffect(() => {
    if (!open) return;
    setTemplate(copyOf);
    const src = pages.find((p) => (p.slug === '' ? '__home' : p.slug) === copyOf);
    if (src) {
      setTitle(`${t(src.title)} (copy)`);
      setSlug(src.slug ? `${src.slug}-copy` : 'home-copy');
      setTouched(true);
    } else {
      setTitle('');
      setSlug('');
      setTouched(false);
    }
    setErrors({});
  }, [open, copyOf, pages]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const router = useRouter();
  const qc = useQueryClient();
  const m = useMutation({
    mutationFn: () => post<{ id: string }>('/pages', { title: { en: title }, slug, kind: 'STANDARD', ...(template !== '' ? { templateSlug: template === '__home' ? '' : template } : {}) }),
    onSuccess: (p) => {
      qc.invalidateQueries({ queryKey: ['pages'] });
      toast.success('Page created as a draft');
      router.push(`/website/pages/${p.id}`);
    },
    onError: (e) => {
      if (e instanceof ApiError) setErrors(e.fieldErrors());
      toast.error(e instanceof ApiError ? e.message : 'Could not create');
    },
  });
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="New page"
      description="Starts as a draft. Nothing is public until you publish."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={m.isPending} disabled={!title || !slug} onClick={() => m.mutate()}>Create draft</Button>
        </>
      }
    >
      <div className="grid gap-4">
        <TextInput label="Title" required autoFocus value={title} onChange={(e) => { setTitle(e.target.value); if (!touched) setSlug(slugify(e.target.value)); }} error={errors.title} />
        <TextInput label="Address" required value={slug} onChange={(e) => { setTouched(true); setSlug(e.target.value.toLowerCase()); }} error={errors.slug} hint={<span className="font-mono">reberonhotel.com/{slug || '…'}</span>} />
        <SelectInput label="Start from" value={template} onChange={(e) => setTemplate(e.target.value)}>
          <option value="">A blank page</option>
          {pages.filter((p) => p.kind !== 'SYSTEM').map((p) => (
            <option key={p.id} value={p.slug === '' ? '__home' : p.slug}>A copy of “{t(p.title)}”</option>
          ))}
        </SelectInput>
      </div>
    </Dialog>
  );
}

export default function PagesPage() {
  return (
    <Suspense>
      <PagesInner />
    </Suspense>
  );
}
