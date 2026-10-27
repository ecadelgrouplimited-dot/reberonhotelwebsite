'use client';
import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ExternalLink, FilePlus2 } from 'lucide-react';
import type { AdminPageSummaryDTO, PageKind } from '@reberon/contracts';
import { t } from '@reberon/contracts/text';
import { slugify } from '@reberon/utils';
import { ApiError, get, post, WEB_URL } from '@/lib/api';
import { useCan } from '@/lib/providers';
import { ago } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { PageHeader, Pill, Skeleton, Status } from '@/components/ui/bits';
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
  const can = useCan();
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
            {data?.map((p) => (
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
                  <span className="inline-flex gap-1 opacity-0 transition group-hover:opacity-100">
                    {p.status === 'PUBLISHED' && p.kind !== 'SYSTEM' && (
                      <a href={`${WEB_URL}/${p.slug}`} target="_blank" rel="noopener noreferrer" className="grid size-8 place-items-center rounded-full hover:bg-surface-2" aria-label="View on the site">
                        <ExternalLink className="size-4" />
                      </a>
                    )}
                    <Button size="sm" href={`/website/pages/${p.id}`}>Edit</Button>
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <NewPage open={creating} onClose={() => setCreating(false)} pages={data ?? []} />
    </div>
  );
}

function NewPage({ open, onClose, pages }: { open: boolean; onClose: () => void; pages: AdminPageSummaryDTO[] }) {
  const [title, setTitle] = useState('');
  const [slug, setSlug] = useState('');
  const [touched, setTouched] = useState(false);
  const [template, setTemplate] = useState('');
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
