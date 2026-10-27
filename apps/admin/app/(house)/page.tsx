'use client';
import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  ArrowRight, BookOpenText, Boxes, ChartColumnBig, ClipboardCheck, ConciergeBell, Contact,
  Dumbbell, FileSpreadsheet, FileText, KeyRound, LayoutGrid, Plus, ReceiptText,
  ScrollText, Settings, SprayCan, Sunset, Users, UtensilsCrossed, type LucideIcon,
} from 'lucide-react';
import { toast } from 'sonner';
import type { DashboardDTO } from '@reberon/contracts';
import { t } from '@reberon/contracts/text';
import { ApiError, get, post } from '@/lib/api';
import { useCan, useMe } from '@/lib/providers';
import { ago, dateRange } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { PageHeader, Section, Skeleton, Status, Pill } from '@/components/ui/bits';
import { Dialog } from '@/components/ui/dialog';
import { TextInput } from '@/components/ui/field';
import { StatTile } from '@/components/charts/charts';

const CHANNEL: Record<string, string> = { WEB_FORM: 'Website', WHATSAPP: 'WhatsApp', EMAIL: 'Email', PHONE: 'Phone' };

const ROLE_BADGE: Record<string, string> = {
  OWNER: 'Director / Super Admin',
  MANAGER: 'Hotel Manager',
  DESK: 'Operations & Front Desk',
  HOUSEKEEPING: 'Housekeeping & Rooms',
};

interface QuickAction {
  label: string;
  desc: string;
  href?: string;
  onClick?: () => void;
  icon: LucideIcon;
  tone?: 'accent' | 'default' | 'amber';
  badge?: string;
}

function ActionGrid({ title, subtitle, actions }: { title: string; subtitle?: string; actions: QuickAction[] }) {
  if (!actions.length) return null;
  return (
    <Section title={title} description={subtitle}>
      <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {actions.map((a) => {
          const content: ReactNode = (
            <>
              <div className="flex items-start justify-between gap-2">
                <span
                  className={
                    a.tone === 'accent'
                      ? 'grid size-8 shrink-0 place-items-center rounded-lg bg-accent/12 text-accent'
                      : a.tone === 'amber'
                        ? 'grid size-8 shrink-0 place-items-center rounded-lg bg-amber-500/12 text-amber-600 dark:text-amber-400'
                        : 'grid size-8 shrink-0 place-items-center rounded-lg bg-surface-2 text-fg'
                  }
                >
                  <a.icon className="size-4" strokeWidth={1.8} />
                </span>
                {a.badge ? (
                  <Pill tone={a.tone === 'amber' ? 'amber' : 'green'}>{a.badge}</Pill>
                ) : (
                  <ArrowRight className="size-3.5 text-fg-subtle transition-transform group-hover:translate-x-0.5 group-hover:text-fg" />
                )}
              </div>
              <div className="mt-2.5 text-left">
                <p className="text-[13px] font-semibold leading-snug text-fg">{a.label}</p>
                <p className="mt-0.5 text-[11.5px] leading-snug text-fg-muted">{a.desc}</p>
              </div>
            </>
          );
          const cls =
            'group flex flex-col justify-between rounded-xl border border-line bg-surface p-3.5 transition-all hover:border-line-strong hover:bg-surface-2/40';
          if (a.onClick) {
            return (
              <button key={a.label} type="button" onClick={a.onClick} className={cls}>
                {content}
              </button>
            );
          }
          return (
            <Link key={a.label} href={a.href ?? '/'} className={cls}>
              {content}
            </Link>
          );
        })}
      </div>
    </Section>
  );
}

export default function Today() {
  const me = useMe();
  const can = useCan();
  const [pwOpen, setPwOpen] = useState(false);
  const [pwForm, setPwForm] = useState({ currentPassword: '', newPassword: '', again: '' });
  const [pwErr, setPwErr] = useState<Record<string, string>>({});

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

  const pwMut = useMutation({
    mutationFn: () => post('/auth/password', { currentPassword: pwForm.currentPassword, newPassword: pwForm.newPassword }),
    onSuccess: () => {
      toast.success('Your password has been updated');
      setPwForm({ currentPassword: '', newPassword: '', again: '' });
      setPwErr({});
      setPwOpen(false);
    },
    onError: (e) => {
      if (e instanceof ApiError) setPwErr(e.fieldErrors());
      toast.error(e instanceof ApiError ? e.message : 'Could not update password');
    },
  });

  const today = new Intl.DateTimeFormat('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'Africa/Kampala',
  }).format(new Date());

  // 1. General Account & Front Desk Quick Actions
  const deskAndAccountActions: QuickAction[] = [
    {
      label: 'Change My Password',
      desc: `Update sign-in password for ${me.email}`,
      onClick: () => setPwOpen(true),
      icon: KeyRound,
      tone: 'accent',
      badge: 'Account',
    },
    ...(can('desk:operate')
      ? [
          {
            label: 'Front Desk Check-In / Out',
            desc: 'Today’s arrivals, departures, room keys & folios',
            href: '/desk',
            icon: ConciergeBell,
            tone: 'accent' as const,
          },
        ]
      : []),
    ...(can('bookings:write')
      ? [
          {
            label: 'New Walk-In / Booking',
            desc: 'Create a room reservation or walk-in stay',
            href: '/reservations/new',
            icon: Plus,
          },
        ]
      : []),
    ...(can('bookings:read')
      ? [
          {
            label: 'Reservations & Stays',
            desc: 'Search bookings, guest folios & payments',
            href: '/reservations',
            icon: BookOpenText,
          },
        ]
      : []),
    ...(can('rooms:status')
      ? [
          {
            label: 'Room Rack',
            desc: 'Live room status, occupancy & assignments',
            href: '/rack',
            icon: LayoutGrid,
          },
          {
            label: 'Housekeeping Board',
            desc: 'Cleaning queue, room status & inspections',
            href: '/housekeeping',
            icon: SprayCan,
          },
        ]
      : []),
    ...(can('receipts:read')
      ? [
          {
            label: 'Receipts & Invoices',
            desc: 'Print or email official guest receipts',
            href: '/receipts',
            icon: ReceiptText,
          },
        ]
      : []),
    ...(can('guests:read')
      ? [
          {
            label: 'Guest Directory',
            desc: 'Guest profiles, stay history & VIP notes',
            href: '/guests',
            icon: Contact,
          },
        ]
      : []),
  ];

  // 2. Departmental Operations & POS Quick Actions
  const opsActions: QuickAction[] = [
    ...(can('pos:operate')
      ? [
          {
            label: 'POS: Kitchen & Bar',
            desc: 'Take dining & drink orders, bill to room or cash',
            href: '/pos',
            icon: UtensilsCrossed,
            tone: 'accent' as const,
          },
        ]
      : []),
    ...(can('healthclub:operate')
      ? [
          {
            label: 'Health Club & Spa',
            desc: 'Gym, sauna & steam passes, memberships & towels',
            href: '/health-club',
            icon: Dumbbell,
          },
        ]
      : []),
    ...(can('quotations:manage')
      ? [
          {
            label: 'Quotations & Events',
            desc: 'Conference & event quotes, pro-forma invoices',
            href: '/quotations',
            icon: FileSpreadsheet,
          },
        ]
      : []),
    ...(can('inventory:manage')
      ? [
          {
            label: 'Inventory & Linen',
            desc: 'Track stock, room vs gym towels & fixed assets',
            href: '/inventory',
            icon: Boxes,
          },
        ]
      : []),
    ...(can('requisitions:request')
      ? [
          {
            label: 'Requisitions & Comms',
            desc: 'Request stock supplies & read staff handovers',
            href: '/requisitions',
            icon: ClipboardCheck,
          },
        ]
      : []),
  ];

  // 3. Management & Directors Only Quick Actions
  const managementActions: QuickAction[] = [
    ...(can('reports:read')
      ? [
          {
            label: 'Owner & Director Brief',
            desc: 'Executive daily snapshot of house & revenue',
            href: '/brief',
            icon: Sunset,
            tone: 'accent' as const,
          },
          {
            label: 'Financial & Occupancy Reports',
            desc: 'Revenue, ADR, RevPAR & channel performance',
            href: '/reports',
            icon: ChartColumnBig,
          },
        ]
      : []),
    ...(can('users:manage')
      ? [
          {
            label: 'People & Access (Staff Passwords)',
            desc: 'Create accounts, set passwords & email credentials',
            href: '/settings/users',
            icon: Users,
            tone: 'accent' as const,
          },
        ]
      : []),
    ...(can('settings:read')
      ? [
          {
            label: 'Hotel Settings & SMTP',
            desc: 'Domain, alerts@reberonhotel.com & integrations',
            href: '/settings',
            icon: Settings,
          },
        ]
      : []),
    ...(can('content:read')
      ? [
          {
            label: 'Website & CMS',
            desc: 'Manage website pages, rooms & coming-soon gate',
            href: '/website/pages',
            icon: FileText,
          },
        ]
      : []),
    ...(can('audit:read')
      ? [
          {
            label: 'Dedicated Audit Log',
            desc: 'Private security trail for Directors & Managers only',
            href: '/settings/audit',
            icon: ScrollText,
            tone: 'amber' as const,
            badge: 'Directors Only',
          },
        ]
      : []),
  ];

  return (
    <div className="fade-in">
      <PageHeader
        title={`Welcome, ${me.name.split(' ')[0]}`}
        description={`${today} · ${ROLE_BADGE[me.role] ?? me.role} · Kapchorwa HQ`}
        actions={
          <>
            <Button size="sm" variant="secondary" onClick={() => setPwOpen(true)} icon={<KeyRound className="size-3.5" />}>
              Change Password
            </Button>
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
            {can('users:manage') && (
              <Button size="sm" href="/settings/users" variant="dark" icon={<Users className="size-3.5" />}>
                Staff Access
              </Button>
            )}
          </>
        }
      />

      <div className="grid gap-4">
        <ActionGrid
          title="Quick Actions · Account & Front Desk"
          subtitle="Fast access to your password, guest check-in/out, rooms and billing."
          actions={deskAndAccountActions}
        />

        <ActionGrid
          title="Quick Actions · Operations & POS"
          subtitle="Kitchen, Bar, Health Club, Event Quotations, Inventory and Requisitions."
          actions={opsActions}
        />

        <ActionGrid
          title="Quick Actions · Management & Directors"
          subtitle="Executive reports, staff access control, hotel settings and the dedicated director audit log."
          actions={managementActions}
        />

        {canDashboard && (canInbox || canWaitlist || canContent) && (
          <>
            {isLoading || !data ? (
              <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
                {[0, 1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-24" />
                ))}
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
                  <div className="grid gap-4 xl:grid-cols-2">
                    {canInbox && (
                      <Section
                        title="Recent Guest Enquiries"
                        actions={
                          <Link href="/inbox" className="flex items-center gap-1 text-xs font-semibold text-fg-muted hover:text-fg">
                            Inbox <ArrowRight className="size-3" />
                          </Link>
                        }
                      >
                        {data.latestConversations.length === 0 ? (
                          <p className="text-xs text-fg-muted">No recent enquiries.</p>
                        ) : (
                          <ul className="-my-1.5 divide-y divide-line">
                            {data.latestConversations.map((c) => (
                              <li key={c.id}>
                                <Link href={`/inbox/${c.id}`} className="-mx-2 flex items-start gap-2.5 rounded-lg px-2 py-2 hover:bg-surface-2">
                                  <span className="grid size-7 shrink-0 place-items-center rounded-full bg-surface-2 text-[11px] font-semibold">
                                    {c.contact.name
                                      .split(' ')
                                      .map((p) => p[0])
                                      .slice(0, 2)
                                      .join('')}
                                  </span>
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
                        )}
                      </Section>
                    )}

                    {canWaitlist && (
                      <Section
                        title="Latest Waitlist Signups"
                        actions={
                          <Link href="/waitlist" className="flex items-center gap-1 text-xs font-semibold text-fg-muted hover:text-fg">
                            Waitlist <ArrowRight className="size-3" />
                          </Link>
                        }
                      >
                        {data.latestWaitlist.length === 0 ? (
                          <p className="text-xs text-fg-muted">No waitlist entries yet.</p>
                        ) : (
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
                        )}
                      </Section>
                    )}
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>

      <Dialog
        open={pwOpen}
        onClose={() => setPwOpen(false)}
        size="sm"
        title="Change Your Password"
        description={`Update the sign-in password for ${me.email}.`}
      >
        <form
          className="grid gap-3.5"
          onSubmit={(e) => {
            e.preventDefault();
            if (pwForm.newPassword !== pwForm.again) {
              setPwErr({ again: 'Passwords do not match' });
              return;
            }
            pwMut.mutate();
          }}
        >
          <TextInput
            label="Current password"
            type="password"
            autoComplete="current-password"
            value={pwForm.currentPassword}
            onChange={(e) => setPwForm({ ...pwForm, currentPassword: e.target.value })}
            error={pwErr.currentPassword}
          />
          <TextInput
            label="New password"
            type="password"
            autoComplete="new-password"
            hint="At least 12 characters"
            value={pwForm.newPassword}
            onChange={(e) => setPwForm({ ...pwForm, newPassword: e.target.value })}
            error={pwErr.newPassword}
          />
          <TextInput
            label="Confirm new password"
            type="password"
            autoComplete="new-password"
            value={pwForm.again}
            onChange={(e) => setPwForm({ ...pwForm, again: e.target.value })}
            error={pwErr.again}
          />
          <div className="mt-1 flex items-center justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setPwOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={pwMut.isPending}>
              Update Password
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
