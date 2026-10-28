'use client';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowRight, Boxes, ClipboardCheck, ConciergeBell, Dumbbell, FileSpreadsheet,
  FileText, Hammer, Image as ImageIcon, LayoutGrid, Plus, ReceiptText, SprayCan,
  Sunset, Users, UtensilsCrossed, type LucideIcon,
} from 'lucide-react';
import type { DashboardDTO } from '@reberon/contracts';
import { t } from '@reberon/contracts/text';
import { get } from '@/lib/api';
import { useCan, useMe } from '@/lib/providers';
import { ago, dateRange } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { PageHeader, Section, Skeleton, Status } from '@/components/ui/bits';
import { BarList, ColumnChart, StatTile } from '@/components/charts/charts';

const CHANNEL: Record<string, string> = { WEB_FORM: 'Website', WHATSAPP: 'WhatsApp', EMAIL: 'Email', PHONE: 'Phone' };

interface QuickAction {
  label: string;
  sub: string;
  href: string;
  icon: LucideIcon;
  primary?: boolean;
}

export default function Today() {
  const me = useMe();
  const can = useCan();

  const canDashboard = can('dashboard:view');
  const canInbox = can('inbox:read');
  const canWaitlist = can('waitlist:read');
  const canContent = can('content:read');

  const { data, isLoading } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => get<DashboardDTO>('/dashboard'),
    refetchInterval: 60_000,
    enabled: canDashboard && (canInbox || canWaitlist || canContent),
  });

  const today = new Intl.DateTimeFormat('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'Africa/Kampala',
  }).format(new Date());

  // Prioritize only the most critical high-demand daily actions for this user
  const criticalActions: QuickAction[] = [
    ...(can('desk:operate')
      ? [{ label: 'Front Desk', sub: 'Check-in & departures', href: '/desk', icon: ConciergeBell, primary: true }]
      : []),
    ...(can('bookings:write')
      ? [{ label: 'New Walk-In / Stay', sub: 'Create reservation', href: '/reservations/new', icon: Plus, primary: true }]
      : []),
    ...(can('pos:operate')
      ? [{ label: 'POS Terminal', sub: 'Kitchen, Bar & Tabs', href: '/pos', icon: UtensilsCrossed, primary: true }]
      : []),
    ...(can('rooms:status')
      ? [{ label: 'Room Rack', sub: 'Live room status', href: '/rack', icon: LayoutGrid }]
      : []),
    ...(can('rooms:status') && !can('desk:operate')
      ? [{ label: 'Housekeeping', sub: 'Cleaning queue', href: '/housekeeping', icon: SprayCan, primary: true }]
      : []),
    ...(can('quotations:manage')
      ? [{ label: 'Event Quotation', sub: 'Conferences & groups', href: '/quotations', icon: FileSpreadsheet }]
      : []),
    ...(can('receipts:read')
      ? [{ label: 'Receipts & Billing', sub: 'Issue & print 80mm', href: '/receipts', icon: ReceiptText }]
      : []),
    ...(can('healthclub:operate')
      ? [{ label: 'Health Club & Spa', sub: 'Passes & gym towels', href: '/health-club', icon: Dumbbell }]
      : []),
    ...(can('inventory:manage') && !can('desk:operate')
      ? [{ label: 'Inventory & Stock', sub: 'Stock & linen count', href: '/inventory', icon: Boxes }]
      : []),
    ...(can('requisitions:request') && !can('desk:operate')
      ? [{ label: 'Requisitions', sub: 'Request supplies', href: '/requisitions', icon: ClipboardCheck }]
      : []),
    ...(can('reports:read')
      ? [{ label: 'Owner Brief', sub: 'Revenue & occupancy', href: '/brief', icon: Sunset }]
      : []),
    ...(can('users:manage')
      ? [{ label: 'People & Access', sub: 'Staff & credentials', href: '/settings/users', icon: Users }]
      : []),
  ].slice(0, 8);

  return (
    <div className="fade-in">
      <PageHeader
        title={`Overview · ${me.name.split(' ')[0]}`}
        description={`${today} · Kapchorwa HQ`}
        actions={
          <>
            {can('desk:operate') && (
              <Button size="sm" href="/desk" icon={<ConciergeBell className="size-3.5" />}>
                Front Desk
              </Button>
            )}
            {can('pos:operate') && (
              <Button size="sm" href="/pos" icon={<UtensilsCrossed className="size-3.5" />}>
                POS
              </Button>
            )}
            {can('content:write') && (
              <>
                <Button size="sm" href="/website/rising/new" icon={<Hammer className="size-3.5" />}>
                  Post Update
                </Button>
                <Button size="sm" href="/media?upload=1" icon={<ImageIcon className="size-3.5" />}>
                  Media
                </Button>
                <Button size="sm" href="/website/pages" variant="dark" icon={<FileText className="size-3.5" />}>
                  CMS
                </Button>
              </>
            )}
          </>
        }
      />

      <div className="grid gap-4">
        {/* Compact Priority Quick Actions Bar */}
        {criticalActions.length > 0 && (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-4">
            {criticalActions.map((a) => (
              <Link
                key={a.href}
                href={a.href}
                className="group flex items-center gap-3 rounded-xl border border-line bg-surface px-3.5 py-2.5 transition-all hover:border-line-strong hover:bg-surface-2/50"
              >
                <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-surface-2 text-fg">
                  <a.icon className="size-4" strokeWidth={1.8} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[12.5px] font-semibold leading-tight text-fg">
                    {a.label}
                  </span>
                  <span className="mt-0.5 block truncate text-[11px] leading-tight text-fg-muted">
                    {a.sub}
                  </span>
                </span>
                <ArrowRight className="size-3.5 shrink-0 text-fg-subtle transition-transform group-hover:translate-x-0.5 group-hover:text-fg" />
              </Link>
            ))}
          </div>
        )}

        {canDashboard && (canInbox || canWaitlist || canContent) && (
          <>
            {isLoading || !data ? (
              <div className="grid gap-3">
                <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
                  {[0, 1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-24" />
                  ))}
                </div>
                <Skeleton className="h-64" />
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
                  {canInbox && (
                    <StatTile
                      label="New Enquiries (24h)"
                      value={data.counts.newEnquiries24h}
                      note={`${data.counts.openConversations} open threads`}
                      href="/inbox"
                    />
                  )}
                  {canWaitlist && (
                    <StatTile
                      label="First-Stay Waitlist"
                      value={data.counts.waitlistTotal}
                      note={`${data.counts.waitlistNew} uncontacted`}
                      href="/waitlist"
                    />
                  )}
                  {canContent && (
                    <>
                      <StatTile
                        label="Build Progress"
                        value={data.progress.percent !== null ? `${data.progress.percent}%` : '—'}
                        note={data.progress.lastUpdate ? `Updated ${ago(data.progress.lastUpdate)}` : 'No updates'}
                        href="/website/rising"
                      />
                      <StatTile
                        label="Draft CMS Pages"
                        value={data.counts.draftPages}
                        note={`${data.counts.mediaCount} media assets`}
                        href="/website/pages"
                      />
                    </>
                  )}
                </div>

                {(canInbox || canWaitlist) && (
                  <div className="grid gap-4 xl:grid-cols-[1.6fr_1fr]">
                    {canInbox && (
                      <Section title="Enquiry Volume (30d)">
                        <ColumnChart data={data.enquiriesByDay} label="Enquiries" />
                      </Section>
                    )}
                    {canWaitlist && (
                      <Section title="Waitlist by Room Type">
                        {data.waitlistByRoomType.length ? (
                          <BarList
                            data={data.waitlistByRoomType.map((r) => ({
                              label: t(r.name),
                              value: r.count,
                            }))}
                          />
                        ) : (
                          <p className="text-xs text-fg-muted">No entries.</p>
                        )}
                      </Section>
                    )}
                  </div>
                )}

                {(canInbox || canWaitlist) && (
                  <div className="grid gap-4 xl:grid-cols-2">
                    {canInbox && (
                      <Section
                        title="Recent Inbox Threads"
                        actions={
                          <Link
                            href="/inbox"
                            className="flex items-center gap-1 text-xs font-semibold text-fg-muted hover:text-fg"
                          >
                            Inbox <ArrowRight className="size-3" />
                          </Link>
                        }
                      >
                        <ul className="-my-1.5 divide-y divide-line">
                          {data.latestConversations.map((c) => (
                            <li key={c.id}>
                              <Link
                                href={`/inbox/${c.id}`}
                                className="-mx-2 flex items-start gap-2.5 rounded-lg px-2 py-2 hover:bg-surface-2"
                              >
                                <span className="grid size-7 shrink-0 place-items-center rounded-full bg-surface-2 text-[11px] font-semibold">
                                  {c.contact.name
                                    .split(' ')
                                    .map((p) => p[0])
                                    .slice(0, 2)
                                    .join('')}
                                </span>
                                <span className="min-w-0 flex-1">
                                  <span className="flex items-center gap-2 text-xs">
                                    <span className={c.unread ? 'font-semibold' : 'font-medium'}>
                                      {c.contact.name}
                                    </span>
                                    <span className="text-[11px] text-fg-subtle">{CHANNEL[c.channel]}</span>
                                    <span className="ml-auto text-[11px] text-fg-subtle">
                                      {ago(c.lastMessageAt)}
                                    </span>
                                  </span>
                                  <span className="mt-0.5 block truncate text-xs text-fg-muted">
                                    {c.preview}
                                  </span>
                                </span>
                                <Status value={c.status} />
                              </Link>
                            </li>
                          ))}
                        </ul>
                      </Section>
                    )}

                    {canWaitlist && (
                      <Section
                        title="Latest Waitlist Signups"
                        actions={
                          <Link
                            href="/waitlist"
                            className="flex items-center gap-1 text-xs font-semibold text-fg-muted hover:text-fg"
                          >
                            Waitlist <ArrowRight className="size-3" />
                          </Link>
                        }
                      >
                        <ul className="-my-1.5 divide-y divide-line">
                          {data.latestWaitlist.map((w) => (
                            <li key={w.id}>
                              <Link
                                href={`/waitlist?open=${w.id}`}
                                className="-mx-2 flex items-center gap-2.5 rounded-lg px-2 py-2 text-xs hover:bg-surface-2"
                              >
                                <span className="min-w-0 flex-1">
                                  <span className="block font-medium">{w.contact.name}</span>
                                  <span className="block text-[11px] text-fg-muted">
                                    {w.roomType ? t(w.roomType.name) : 'Any room'} ·{' '}
                                    {dateRange(w.preferredFrom, w.preferredTo)}
                                  </span>
                                </span>
                                <span className="text-[11px] text-fg-subtle">{ago(w.createdAt)}</span>
                                <Status value={w.status} />
                              </Link>
                            </li>
                          ))}
                        </ul>
                      </Section>
                    )}
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
