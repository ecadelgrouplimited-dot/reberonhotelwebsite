'use client';
import { useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, ConciergeBell, FileText, Hammer, Image as ImageIcon, UtensilsCrossed } from 'lucide-react';
import type { DashboardDTO } from '@reberon/contracts';
import { t } from '@reberon/contracts/text';
import { get } from '@/lib/api';
import { useCan, useMe } from '@/lib/providers';
import { ago, dateRange } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { PageHeader, Section, Skeleton, Status, Pill } from '@/components/ui/bits';
import { BarList, ColumnChart, StatTile } from '@/components/charts/charts';

const CHANNEL: Record<string, string> = { WEB_FORM: 'Website', WHATSAPP: 'WhatsApp', EMAIL: 'Email', PHONE: 'Phone' };

export default function Today() {
  const me = useMe();
  const can = useCan();
  const router = useRouter();
  const landing = !can('dashboard:view') && can('rooms:status');
  useEffect(() => {
    if (landing) router.replace('/housekeeping');
  }, [landing, router]);
  const { data, isLoading } = useQuery({ queryKey: ['dashboard'], queryFn: () => get<DashboardDTO>('/dashboard'), refetchInterval: 60_000, enabled: !landing });
  const today = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Africa/Kampala' }).format(new Date());

  return (
    <div className="fade-in">
      <PageHeader
        title={`Overview · ${me.name.split(' ')[0]}`}
        description={`${today} · Kapchorwa HQ`}
        actions={
          <>
            {can('desk:operate') && <Button size="sm" href="/desk" icon={<ConciergeBell className="size-3.5" />}>Front Desk</Button>}
            {can('pos:operate') && <Button size="sm" href="/pos" icon={<UtensilsCrossed className="size-3.5" />}>POS</Button>}
            {can('content:write') && (
              <>
                <Button size="sm" href="/website/rising/new" icon={<Hammer className="size-3.5" />}>Post Update</Button>
                <Button size="sm" href="/media?upload=1" icon={<ImageIcon className="size-3.5" />}>Media</Button>
                <Button size="sm" href="/website/pages" variant="dark" icon={<FileText className="size-3.5" />}>CMS</Button>
              </>
            )}
          </>
        }
      />

      {isLoading || !data ? (
        <div className="grid gap-3">
          <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-24" />)}</div>
          <Skeleton className="h-64" />
        </div>
      ) : (
        <div className="grid gap-4">
          <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
            <StatTile label="New Enquiries (24h)" value={data.counts.newEnquiries24h} note={`${data.counts.openConversations} open threads`} href="/inbox" />
            <StatTile label="First-Stay Waitlist" value={data.counts.waitlistTotal} note={`${data.counts.waitlistNew} uncontacted`} href="/waitlist" />
            <StatTile label="Build Progress" value={data.progress.percent !== null ? `${data.progress.percent}%` : '—'} note={data.progress.lastUpdate ? `Updated ${ago(data.progress.lastUpdate)}` : 'No updates'} href="/website/rising" />
            <StatTile label="Draft CMS Pages" value={data.counts.draftPages} note={`${data.counts.mediaCount} media assets`} href="/website/pages" />
          </div>

          <div className="grid gap-4 xl:grid-cols-[1.6fr_1fr]">
            <Section title="Enquiry Volume (30d)">
              <ColumnChart data={data.enquiriesByDay} label="Enquiries" />
            </Section>
            <Section title="Waitlist by Room Type">
              {data.waitlistByRoomType.length ? <BarList data={data.waitlistByRoomType.map((r) => ({ label: t(r.name), value: r.count }))} /> : <p className="text-xs text-fg-muted">No entries.</p>}
            </Section>
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <Section title="Recent Inbox Threads" actions={<Link href="/inbox" className="flex items-center gap-1 text-xs font-semibold text-fg-muted hover:text-fg">Inbox <ArrowRight className="size-3" /></Link>}>
              <ul className="-my-1.5 divide-y divide-line">
                {data.latestConversations.map((c) => (
                  <li key={c.id}>
                    <Link href={`/inbox/${c.id}`} className="-mx-2 flex items-start gap-2.5 rounded-lg px-2 py-2 hover:bg-surface-2">
                      <span className="grid size-7 shrink-0 place-items-center rounded-full bg-surface-2 text-[11px] font-semibold">{c.contact.name.split(' ').map((p) => p[0]).slice(0, 2).join('')}</span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2 text-xs">
                          <span className={c.unread ? 'font-semibold' : 'font-medium'}>{c.contact.name}</span>
                          <span className="text-[11px] text-fg-subtle">{CHANNEL[c.channel]}</span>
                          <span className="ml-auto text-[11px] text-fg-subtle">{ago(c.lastMessageAt)}</span>
                        </span>
                        <span className="mt-0.5 block truncate text-xs text-fg-muted">{c.preview}</span>
                      </span>
                      <Status value={c.status} />
                    </Link>
                  </li>
                ))}
              </ul>
            </Section>
            <Section title="Latest Waitlist Signups" actions={<Link href="/waitlist" className="flex items-center gap-1 text-xs font-semibold text-fg-muted hover:text-fg">Waitlist <ArrowRight className="size-3" /></Link>}>
              <ul className="-my-1.5 divide-y divide-line">
                {data.latestWaitlist.map((w) => (
                  <li key={w.id}>
                    <Link href={`/waitlist?open=${w.id}`} className="-mx-2 flex items-center gap-2.5 rounded-lg px-2 py-2 text-xs hover:bg-surface-2">
                      <span className="min-w-0 flex-1">
                        <span className="block font-medium">{w.contact.name}</span>
                        <span className="block text-[11px] text-fg-muted">
                          {w.roomType ? t(w.roomType.name) : 'Any room'} · {dateRange(w.preferredFrom, w.preferredTo)}
                        </span>
                      </span>
                      <span className="text-[11px] text-fg-subtle">{ago(w.createdAt)}</span>
                      <Status value={w.status} />
                    </Link>
                  </li>
                ))}
              </ul>
            </Section>
          </div>

          <Section title="Audit Activity Stream">
            <ol className="relative grid gap-2 border-l border-line pl-4">
              {data.recentActivity.map((a) => (
                <li key={a.id} className="relative text-xs">
                  <span className="absolute -left-[19.5px] top-1.5 size-1.5 rounded-full bg-line-strong" />
                  <span className="font-semibold">{a.actor?.name ?? (a.actorType === 'GUEST' ? 'Guest' : 'System')}</span> <span className="text-fg-muted">{a.summary}</span>
                  <span className="ml-2 text-[11px] text-fg-subtle">{ago(a.createdAt)}</span>
                  {a.actorType === 'GUEST' && <Pill tone="blue" className="ml-1.5">web</Pill>}
                </li>
              ))}
            </ol>
          </Section>
        </div>
      )}
    </div>
  );
}
