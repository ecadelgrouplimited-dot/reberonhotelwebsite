'use client';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { CalendarClock, CheckCircle2, CircleAlert, ExternalLink, EyeOff, Rocket } from 'lucide-react';
import { ApiError, get, post, WEB_URL } from '@/lib/api';
import { useCan } from '@/lib/providers';
import { ago, dateTime } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Empty, PageHeader, Pill, Section, Skeleton, Status } from '@/components/ui/bits';
import { useConfirm } from '@/components/ui/confirm';

type Overview = {
  pages: { id: string; slug: string; title: { en?: string }; status: string; publishAt: string | null; unpublished: boolean; changedBlocks: number; hiddenBlocks: number; updatedAt: string; updatedBy: string | null }[];
  notLive: { type: string; id: string; title: { en?: string }; status: string; href: string }[];
  media: { onSite: number; drawingsOnSite: number; missingAlt: number; failed: number };
  checks: { key: string; ok: boolean; label: string; detail: string; href?: string; optional?: boolean }[];
};

export default function PublishingPage() {
  const qc = useQueryClient();
  const can = useCan();
  const confirm = useConfirm();
  const { data, isLoading } = useQuery({ queryKey: ['site-overview'], queryFn: () => get<Overview>('/site/overview') });
  const publish = useMutation({
    mutationFn: async (ids: string[]) => {
      const failed: string[] = [];
      for (const id of ids) {
        try {
          await post(`/pages/${id}/publish`, {});
        } catch (e) {
          failed.push(e instanceof ApiError ? (e.errors[0]?.message ?? e.message) : 'error');
        }
      }
      return { done: ids.length - failed.length, failed };
    },
    onSuccess: ({ done, failed }) => {
      qc.invalidateQueries({ queryKey: ['site-overview'] });
      qc.invalidateQueries({ queryKey: ['pages'] });
      if (done) toast.success(`${done} page${done > 1 ? 's' : ''} published — the website is updating`);
      if (failed.length) toast.error(`Not published: ${failed.join('; ')}`, { duration: 10_000 });
    },
  });

  if (isLoading || !data) return <Skeleton className="h-96" />;
  const waiting = data.pages.filter((p) => p.unpublished && p.status !== 'SCHEDULED');
  const scheduled = data.pages.filter((p) => p.status === 'SCHEDULED');
  const done = data.checks.filter((c) => c.ok).length;

  return (
    <div className="fade-in">
      <PageHeader title="Publishing" description="What is live on reberonhotel.com, what is waiting, and what still needs doing before launch." actions={<a className="inline-flex h-9 items-center gap-1.5 rounded-full border border-line-strong px-4 text-[13px] font-semibold hover:bg-surface-2" href={WEB_URL} target="_blank" rel="noopener noreferrer">Open the website <ExternalLink className="size-3.5" /></a>} />
      <div className="grid gap-5 xl:grid-cols-[1.3fr_1fr]">
        <div className="grid content-start gap-5">
          <Section
            title={`Waiting to be published (${waiting.length})`}
            description="Saved in the House, not yet on the website."
            actions={can('content:publish') && waiting.length > 1 && (
              <Button size="sm" variant="primary" icon={<Rocket className="size-3.5" />} loading={publish.isPending} onClick={async () => (await confirm({ title: `Publish ${waiting.length} pages?`, body: waiting.map((p) => p.title.en).join(', '), confirm: 'Publish all' })) && publish.mutate(waiting.map((p) => p.id))}>
                Publish all
              </Button>
            )}
          >
            {!waiting.length ? <Empty icon={<CheckCircle2 className="size-5" />} title="Everything is live" body="The website shows exactly what is saved here." /> : (
              <ul className="-my-2 divide-y divide-line">
                {waiting.map((p) => (
                  <li key={p.id} className="flex flex-wrap items-center gap-3 py-3">
                    <div className="min-w-0 flex-1">
                      <Link href={`/website/pages/${p.id}`} className="font-medium hover:underline">{p.title.en}</Link>
                      <p className="text-[12.5px] text-fg-muted">
                        <span className="font-mono">/{p.slug}</span> · {p.status === 'DRAFT' ? 'never published' : `${p.changedBlocks} block${p.changedBlocks === 1 ? '' : 's'} changed`} · {ago(p.updatedAt)}{p.updatedBy ? ` by ${p.updatedBy}` : ''}
                      </p>
                    </div>
                    {p.hiddenBlocks > 0 && <Pill><EyeOff className="size-3" /> {p.hiddenBlocks} hidden</Pill>}
                    <Button size="sm" href={`/website/pages/${p.id}`}>Review</Button>
                    {can('content:publish') && <Button size="sm" variant="dark" loading={publish.isPending} onClick={() => publish.mutate([p.id])}>Publish</Button>}
                  </li>
                ))}
              </ul>
            )}
          </Section>
          {scheduled.length > 0 && (
            <Section title="Scheduled">
              <ul className="-my-2 divide-y divide-line">
                {scheduled.map((p) => (
                  <li key={p.id} className="flex items-center gap-3 py-3 text-[13px]"><CalendarClock className="size-4 text-info" /><Link href={`/website/pages/${p.id}`} className="flex-1 font-medium hover:underline">{p.title.en}</Link><span className="text-fg-muted">{p.publishAt && dateTime(p.publishAt)}</span></li>
                ))}
              </ul>
            </Section>
          )}
          <Section title={`Saved but not on the website (${data.notLive.length})`} description="Drafts and hidden items. Change their visibility to show them.">
            {!data.notLive.length ? <p className="text-[13px] text-fg-muted">Nothing hidden.</p> : (
              <ul className="-my-2 divide-y divide-line">
                {data.notLive.map((x) => (
                  <li key={x.id}><Link href={x.href} className="flex items-center gap-3 py-2.5 text-[13px] hover:underline"><Pill>{x.type}</Pill><span className="flex-1">{x.title.en}</span><Status value={x.status} /></Link></li>
                ))}
              </ul>
            )}
          </Section>
          <Section title="All pages">
            <ul className="-my-2 divide-y divide-line">
              {data.pages.map((p) => (
                <li key={p.id} className="flex items-center gap-3 py-2 text-[13px]">
                  <Link href={`/website/pages/${p.id}`} className="flex-1 hover:underline">{p.title.en} <span className="font-mono text-[11.5px] text-fg-subtle">/{p.slug}</span></Link>
                  {p.unpublished ? <Pill tone="amber">draft ahead</Pill> : <Pill tone="green">live = saved</Pill>}
                </li>
              ))}
            </ul>
          </Section>
        </div>
        <div className="grid content-start gap-5">
          <Section title="Ready to launch?" description={`${done} of ${data.checks.length} done`}>
            <div className="mb-4 h-2 overflow-hidden rounded-full bg-surface-2"><div className="h-full rounded-full" style={{ width: `${(done / data.checks.length) * 100}%`, background: 'var(--series)' }} /></div>
            <ul className="grid gap-3">
              {data.checks.map((c) => (
                <li key={c.key} className="flex gap-3 text-[13px]">
                  {c.ok ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" /> : <CircleAlert className={`mt-0.5 size-4 shrink-0 ${c.optional ? 'text-fg-subtle' : 'text-warning'}`} />}
                  <div className="min-w-0">
                    <p className="font-medium">{c.href && !c.ok ? <Link href={c.href} className="hover:underline">{c.label}</Link> : c.label}{c.optional && <span className="ml-1.5 text-[11px] font-normal text-fg-subtle">optional</span>}</p>
                    <p className="text-[12.5px] text-fg-muted">{c.detail}</p>
                  </div>
                </li>
              ))}
            </ul>
          </Section>
          <Section title="Images on the website">
            <dl className="grid grid-cols-2 gap-4 text-[13px]">
              <div><dt className="text-fg-muted">Shown on the site</dt><dd className="text-[1.6rem] font-semibold">{data.media.onSite}</dd></div>
              <div><dt className="text-fg-muted">Still drawings</dt><dd className="text-[1.6rem] font-semibold">{data.media.drawingsOnSite}</dd></div>
              <div><dt className="text-fg-muted">Missing alt text</dt><dd className="text-[1.6rem] font-semibold">{data.media.missingAlt}</dd></div>
              <div><dt className="text-fg-muted">Failed uploads</dt><dd className="text-[1.6rem] font-semibold">{data.media.failed}</dd></div>
            </dl>
            <p className="mt-4 text-[12.5px] text-fg-muted">Tip: open a drawing in <Link href="/media?rendering=true" className="underline">Media</Link> and use <b>Replace everywhere</b> to swap in a real photo in one step.</p>
          </Section>
        </div>
      </div>
    </div>
  );
}
