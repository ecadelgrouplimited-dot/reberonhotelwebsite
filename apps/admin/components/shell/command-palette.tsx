'use client';
import { Command } from 'cmdk';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  BedDouble, BrushCleaning, Clock, Contact, FileText, Hammer, Inbox, Keyboard, LayoutGrid, LogIn, LogOut, Moon, PanelLeft, Plus, Printer, Receipt,
  RefreshCw, ShoppingBag, Type, Upload, UserRoundPlus, Wallet, ClipboardCheck, type LucideIcon,
} from 'lucide-react';
import type { AdminPageSummaryDTO, ConversationSummaryDTO, GuestSummaryDTO, RackRoomDTO, ReservationSummaryDTO } from '@reberon/contracts';
import { t } from '@reberon/contracts/text';
import { get } from '@/lib/api';
import { useMeQuery } from '@/lib/providers';
import { usePrefs } from '@/lib/prefs';
import { useRecents, forgetRecent } from '@/lib/recents';
import { printScreen } from '@/lib/print';
import { dateRange } from '@/lib/format';
import { cn } from '@/lib/cn';
import { AppGlyph } from '@/components/os/app-icon';
import { APP_BY_HREF } from '@/components/os/apps';
import { mod, shellAction, toggleTheme } from '@/components/os/actions';
import { currentScreen } from '@/components/os/screen-actions';

type Action = { id: string; label: string; keywords: string; icon: LucideIcon; perm?: string | string[]; run: (go: (href: string) => void) => void; hint?: string };

/** Things you can *do* from search — each only for people allowed to. */
const ACTIONS: Action[] = [
  { id: 'walkin', label: 'Walk-in', keywords: 'walk in guest arrive now check in new', icon: UserRoundPlus, perm: 'bookings:write', run: (go) => go('/reservations/new?walkin=1') },
  { id: 'booking', label: 'New booking', keywords: 'reserve reservation add stay', icon: Plus, perm: 'bookings:write', run: (go) => go('/reservations/new') },
  { id: 'sale', label: 'New sale', keywords: 'pos order bill restaurant bar kitchen sell', icon: ShoppingBag, perm: 'pos:operate', run: (go) => go('/pos') },
  { id: 'checkin', label: 'Check in an arrival', keywords: 'arrivals today desk', icon: LogIn, perm: 'desk:operate', run: (go) => go('/desk?tab=arrivals') },
  { id: 'checkout', label: 'Check out a guest', keywords: 'departures leaving desk', icon: LogOut, perm: 'desk:operate', run: (go) => go('/desk?tab=departures') },
  { id: 'clean', label: 'Mark rooms clean', keywords: 'housekeeping dirty rooms tasks', icon: BrushCleaning, perm: 'rooms:status', run: (go) => go('/housekeeping') },
  { id: 'receipt', label: 'Issue a receipt or invoice', keywords: 'payment invoice document', icon: Receipt, perm: 'receipts:issue', run: (go) => go('/receipts') },
  { id: 'expense', label: 'Record an expense', keywords: 'cost spend money out', icon: Wallet, perm: ['expenses:manage', 'requisitions:approve'], run: (go) => go('/reports?tab=EXPENSES') },
  { id: 'stock', label: 'Request stock', keywords: 'requisition supplies order', icon: ClipboardCheck, perm: 'requisitions:request', run: (go) => go('/requisitions') },
  { id: 'progress', label: 'Post a progress update', keywords: 'rising construction website', icon: Hammer, perm: 'content:write', run: (go) => go('/website/rising/new') },
  { id: 'upload', label: 'Upload photos', keywords: 'media images pictures', icon: Upload, perm: 'media:upload', run: (go) => go('/media?upload=1') },
  { id: 'page', label: 'New website page', keywords: 'website cms create', icon: FileText, perm: 'content:write', run: (go) => go('/website/pages?new=1') },
  { id: 'fonts', label: 'Change fonts', keywords: 'typography font text size appearance', icon: Type, perm: 'settings:write', run: (go) => go('/settings?tab=typography') },
  { id: 'theme', label: 'Light / dark mode', keywords: 'theme dark night appearance', icon: Moon, run: () => toggleTheme() },
  { id: 'sidebar', label: 'Show / hide sidebar', keywords: 'menu navigation panel', icon: PanelLeft, hint: `${mod()} B`, run: () => shellAction('sidebar') },
  { id: 'print', label: 'Print this screen', keywords: 'pdf paper export', icon: Printer, hint: `${mod()} P`, run: () => void printScreen() },
  { id: 'refresh', label: 'Refresh', keywords: 'reload update sync', icon: RefreshCw, hint: 'R', run: () => window.dispatchEvent(new CustomEvent('rb:refresh')) },
  { id: 'home', label: 'Customise Home', keywords: 'layout dock pin apps desktop', icon: LayoutGrid, run: (go) => go('/?customise=1') },
  { id: 'keys', label: 'Keyboard shortcuts', keywords: 'keys help', icon: Keyboard, hint: '?', run: () => shellAction('shortcuts') },
];

const RECENT_ICON: Record<string, LucideIcon> = { booking: BedDouble, guest: Contact, conversation: Inbox, page: FileText, app: Clock };

/** Every typed word must appear (no loose letter-skipping matches); earlier, word-start hits rank higher. */
function matchScore(value: string, search: string, keywords?: string[]) {
  const hay = `${value} ${keywords?.join(' ') ?? ''}`.toLowerCase();
  const words = search.toLowerCase().trim().split(/\s+/).filter(Boolean);
  if (!words.length) return 1;
  let score = 1;
  for (const w of words) {
    const i = hay.indexOf(w);
    if (i < 0) return 0;
    const wordStart = i === 0 || /[\s/·@.-]/.test(hay[i - 1]!);
    score -= (wordStart ? 0 : 0.2) + Math.min(i, 200) / 2000;
  }
  return Math.max(score, 0.05);
}

function useDebounced<T>(value: T, ms = 220) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setV(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return v;
}

const heading = '[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:pt-2.5 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-fg-subtle';
const item = 'flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2 text-[13px] data-[selected=true]:bg-surface-2';

function Row({ icon, title, detail, right }: { icon: ReactNode; title: ReactNode; detail?: ReactNode; right?: ReactNode }) {
  return (
    <>
      <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-surface-2 text-fg-muted">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium text-fg">{title}</span>
        {detail && <span className="block truncate text-[11.5px] text-fg-muted">{detail}</span>}
      </span>
      {right && <span className="shrink-0 text-[11px] text-fg-subtle">{right}</span>}
    </>
  );
}

/**
 * Search everything, do anything: guests, bookings, rooms, conversations, apps,
 * website pages and actions in one box. ↵ opens, Ctrl/⌘+↵ opens in a new tab.
 */
export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const qc = useQueryClient();
  const { data: me } = useMeQuery();
  const prefs = usePrefs();
  const recents = useRecents();
  const [q, setQ] = useState('');
  const term = useDebounced(q.trim());
  const newTab = useRef(false);
  const can = (p?: string | string[]) => !p || (Array.isArray(p) ? p : [p]).some((x) => !!me?.permissions.includes(x));
  const searching = open && term.length > 1;
  const [selected, setSelected] = useState('');

  const bookings = useQuery({
    queryKey: ['palette-bookings', term],
    // The stay that matters now comes first: in house, then upcoming, then the rest.
    queryFn: async () => {
      const res = await get<{ data: ReservationSummaryDTO[] }>(`/reservations?q=${encodeURIComponent(term)}&sort=latest&limit=20`);
      const rank: Record<string, number> = { IN_HOUSE: 0, CONFIRMED: 1, HELD: 2 };
      return { data: [...res.data].sort((a, b) => (rank[a.status] ?? 9) - (rank[b.status] ?? 9)).slice(0, 6) };
    },
    enabled: searching && can('bookings:read'),
    staleTime: 30_000,
  });
  const guests = useQuery({
    queryKey: ['palette-guests', term],
    queryFn: () => get<{ data: GuestSummaryDTO[] }>(`/guests?q=${encodeURIComponent(term)}`),
    enabled: searching && can('guests:read'),
    staleTime: 30_000,
  });
  const rooms = useQuery({ queryKey: ['palette-rooms'], queryFn: () => get<RackRoomDTO[]>('/rack'), enabled: open && can('rooms:status'), staleTime: 60_000 });
  const pages = useQuery({ queryKey: ['pages'], queryFn: () => get<AdminPageSummaryDTO[]>('/pages'), enabled: open && can('content:read') });
  const convs = useQuery({
    queryKey: ['palette-convs', term],
    queryFn: () => get<{ data: ConversationSummaryDTO[] }>(`/conversations?limit=5&q=${encodeURIComponent(term)}`),
    enabled: searching && can('inbox:read'),
  });

  useEffect(() => {
    if (!open) setQ('');
  }, [open]);
  // When records arrive after typing, highlight the best one (not an action picked meanwhile).
  const firstHit = bookings.data?.data[0] ? `${q} booking ${bookings.data.data[0].code} ${bookings.data.data[0].guest.name} ${bookings.data.data[0].guest.phone ?? ''}` : guests.data?.data[0] ? `${q} guest ${guests.data.data[0].name} ${guests.data.data[0].phone ?? ''} ${guests.data.data[0].email ?? ''}` : '';
  useEffect(() => {
    if (firstHit) setSelected(firstHit.trim());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookings.data, guests.data]);
  useEffect(() => {
    const refresh = () => {
      qc.invalidateQueries();
    };
    window.addEventListener('rb:refresh', refresh);
    return () => window.removeEventListener('rb:refresh', refresh);
  }, [qc]);
  if (!open) return null;
  const screen = currentScreen();

  const go = (href: string) => {
    onClose();
    if (newTab.current) window.open(href, '_blank', 'noopener');
    else router.push(href);
    newTab.current = false;
  };
  const digits = term.replace(/^room\s*/i, '');
  const roomHits = term && /^(room\s*)?\d{1,4}$/i.test(term) ? (rooms.data ?? []).filter((r) => r.number.includes(digits)).slice(0, 6) : [];
  const loading = searching && (bookings.isFetching || guests.isFetching);
  const actions = ACTIONS.filter((a) => can(a.perm));

  return (
    <div className="fixed inset-0 z-[60] grid place-items-start bg-black/35 px-4 pt-[10vh] backdrop-blur-[2px]" onClick={onClose}>
      <Command
        label="Search everything"
        loop
        value={selected}
        onValueChange={setSelected}
        filter={matchScore}
        className="fade-in mx-auto w-full max-w-2xl overflow-hidden rounded-2xl border border-line bg-surface shadow-[var(--shadow-lift)]"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === 'Escape') onClose();
          if (e.key === 'Enter') newTab.current = e.metaKey || e.ctrlKey;
        }}
      >
        <div className="flex items-center border-b border-line pr-4">
          <Command.Input
            autoFocus
            value={q}
            onValueChange={setQ}
            placeholder="Search guests, bookings, rooms, screens — or type what to do…"
            className="h-14 w-full bg-transparent px-5 text-[15px] outline-none placeholder:text-fg-subtle"
          />
          {loading && <RefreshCw className="size-4 animate-spin text-fg-subtle" />}
        </div>
        <Command.List className="scrollbar-thin max-h-[62vh] overflow-y-auto p-2">
          <Command.Empty className="px-3 py-10 text-center text-[13px] text-fg-muted">{loading ? 'Searching…' : `Nothing matches “${q}”.`}</Command.Empty>

          {!q && recents.length > 0 && (
            <Command.Group heading="Jump back in" className={heading}>
              {recents.slice(0, 6).map((r) => {
                const app = r.kind === 'app' ? APP_BY_HREF.get(r.href) : undefined;
                const Icon = RECENT_ICON[r.kind] ?? Clock;
                return (
                  <Command.Item key={r.href} value={`recent ${r.label} ${r.detail ?? ''} ${r.href}`} className={item} onSelect={() => go(r.href)}>
                    {app ? <AppGlyph app={app} size={32} /> : <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-surface-2 text-fg-muted"><Icon className="size-4" /></span>}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{r.label}</span>
                      {r.detail && <span className="block truncate text-[11.5px] text-fg-muted">{r.detail}</span>}
                    </span>
                    <button type="button" className="text-[11px] text-fg-subtle hover:text-fg" onClick={(e) => { e.stopPropagation(); forgetRecent(r.href); }} aria-label={`Forget ${r.label}`}>
                      Forget
                    </button>
                  </Command.Item>
                );
              })}
            </Command.Group>
          )}

          {!!bookings.data?.data.length && (
            <Command.Group heading="Bookings" className={heading}>
              {bookings.data.data.map((r) => (
                <Command.Item key={r.id} value={`${q} booking ${r.code} ${r.guest.name} ${r.guest.phone ?? ''}`} className={item} onSelect={() => go(`/reservations/${r.id}`)}>
                  <Row icon={<BedDouble className="size-4" />} title={`${r.guest.name} · ${r.code}`} detail={`${dateRange(r.arrival, r.departure)} · ${r.roomSummary}`} right={r.status.replace('_', ' ').toLowerCase()} />
                </Command.Item>
              ))}
            </Command.Group>
          )}

          {!!guests.data?.data.length && (
            <Command.Group heading="Guests" className={heading}>
              {guests.data.data.slice(0, 6).map((g) => (
                <Command.Item key={g.id} value={`${q} guest ${g.name} ${g.phone ?? ''} ${g.email ?? ''}`} className={item} onSelect={() => go(`/guests/${g.id}`)}>
                  <Row icon={<Contact className="size-4" />} title={`${g.name}${g.isVip ? ' · VIP' : ''}`} detail={[g.phone, g.email].filter(Boolean).join(' · ') || 'Guest profile'} right={`${g.stays} stay${g.stays === 1 ? '' : 's'}`} />
                </Command.Item>
              ))}
            </Command.Group>
          )}

          {roomHits.length > 0 && (
            <Command.Group heading="Rooms" className={heading}>
              {roomHits.map((r) => (
                <Command.Item key={r.id} value={`${q} room ${r.number}`} className={item} onSelect={() => go(r.occupant ? `/reservations/${r.occupant.reservationId}` : `/rack?room=${r.id}`)}>
                  <Row
                    icon={<BedDouble className="size-4" />}
                    title={`Room ${r.number} · ${r.roomType.name}`}
                    detail={r.occupant ? `${r.occupant.guestName} · leaves ${r.occupant.departure}` : r.arriving ? `Arriving: ${r.arriving.guestName}` : r.hkStatus.replace('_', ' ').toLowerCase()}
                    right={r.occupant ? 'open booking' : 'open in rack'}
                  />
                </Command.Item>
              ))}
            </Command.Group>
          )}

          {!!convs.data?.data.length && (
            <Command.Group heading="Conversations" className={heading}>
              {convs.data.data.map((c) => (
                <Command.Item key={c.id} value={`${q} ${c.reference} ${c.contact.name}`} className={item} onSelect={() => go(`/inbox/${c.id}`)}>
                  <Row icon={<Inbox className="size-4" />} title={c.contact.name} detail={c.preview} right={c.reference} />
                </Command.Item>
              ))}
            </Command.Group>
          )}

          {screen && (
            <Command.Group heading={`On this screen · ${screen.title}`} className={heading}>
              {screen.items.filter((it) => (it.kind ?? 'item') === 'item').map((raw, i) => {
                const it = raw as { label: string; icon?: LucideIcon; key?: string; hint?: string; onSelect: () => void; disabled?: boolean };
                if (it.disabled) return null;
                const Icon = it.icon ?? LayoutGrid;
                return (
                  <Command.Item key={`s${i}`} value={`screen ${screen.title} ${it.label}`} className={item} onSelect={() => { onClose(); setTimeout(it.onSelect, 0); }}>
                    <Row icon={<Icon className="size-4" />} title={it.label} right={it.hint ?? it.key?.toUpperCase()} />
                  </Command.Item>
                );
              })}
            </Command.Group>
          )}

          <Command.Group heading="Do" className={heading}>
            {(q ? actions : actions.slice(0, 6)).map((a) => (
              <Command.Item key={a.id} value={`do ${a.label} ${a.keywords}`} className={item} onSelect={() => { onClose(); a.run((h) => { newTab.current ? window.open(h, '_blank', 'noopener') : router.push(h); newTab.current = false; }); }}>
                <Row icon={<a.icon className="size-4" />} title={a.label} right={a.hint} />
              </Command.Item>
            ))}
          </Command.Group>

          <Command.Group heading={q ? 'Apps' : 'Your apps'} className={heading}>
            {(q ? prefs.apps : prefs.pinned).map((a) => (
              <Command.Item key={a.href} value={`app ${a.fullName} ${a.name} ${a.group}`} className={item} onSelect={() => go(a.href)}>
                <AppGlyph app={a} size={32} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{a.fullName}</span>
                  <span className="block truncate text-[11.5px] text-fg-muted">{a.group}</span>
                </span>
              </Command.Item>
            ))}
          </Command.Group>

          {q && !!pages.data?.length && (
            <Command.Group heading="Website pages" className={heading}>
              {pages.data.map((p) => (
                <Command.Item key={p.id} value={`page ${t(p.title)} /${p.slug}`} className={item} onSelect={() => go(`/website/pages/${p.id}`)}>
                  <Row icon={<FileText className="size-4" />} title={t(p.title)} right={`/${p.slug}`} />
                </Command.Item>
              ))}
            </Command.Group>
          )}
        </Command.List>
        <div className={cn('flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-line bg-surface-2/50 px-4 py-2 text-[11px] text-fg-subtle')}>
          <span><kbd className="font-sans font-semibold">↑↓</kbd> move</span>
          <span><kbd className="font-sans font-semibold">↵</kbd> open</span>
          <span><kbd className="font-sans font-semibold">{mod()} ↵</kbd> new tab</span>
          <span><kbd className="font-sans font-semibold">Esc</kbd> close</span>
          <span className="ml-auto">Try a name, a phone number, a booking code or a room number</span>
        </div>
      </Command>
    </div>
  );
}
