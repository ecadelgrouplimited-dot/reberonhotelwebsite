import type { LucideIcon } from 'lucide-react';
import type { Role } from '@reberon/contracts';
import { NAV, type NavBadgeKey } from '@/components/shell/nav';

/**
 * Everything in the House as “apps” for Home, the dock, search and right-click.
 * Built from the sidebar navigation (one source of truth for routes, icons,
 * permissions and badges), with a short launcher name and a colour per area.
 */
export interface HouseApp {
  href: string;
  name: string;
  fullName: string;
  icon: LucideIcon;
  group: string;
  groupId: string;
  badge?: NavBadgeKey;
  perm?: string;
  /** Tile colours (gradient stops). */
  tint: [string, string];
}

const SHORT: Record<string, string> = {
  '/today': 'Today',
  '/inbox': 'Inbox',
  '/waitlist': 'Waitlist',
  '/messages': 'Sent',
  '/desk': 'Front Desk',
  '/reservations': 'Bookings',
  '/rack': 'Room Rack',
  '/housekeeping': 'Housekeeping',
  '/guests': 'Guests',
  '/feedback': 'Feedback',
  '/brief': 'Owner Brief',
  '/receipts': 'Receipts',
  '/quotations': 'Quotations',
  '/calendar': 'Rates',
  '/sellables': 'Extras',
  '/reports': 'Reports',
  '/day-close': 'Close Day',
  '/maintenance': 'Maintenance',
  '/lost-found': 'Lost & Found',
  '/pos': 'POS',
  '/pos/tables': 'Tables',
  '/health-club': 'Health Club',
  '/inventory': 'Inventory',
  '/inventory/categories': 'Categories',
  '/requisitions': 'Requisitions',
  '/hr': 'Staff',
  '/departments': 'Departments',
  '/hr?tab=ROSTER': 'Rosters',
  '/hr?tab=LEAVE': 'Leave',
  '/hr?tab=PAYROLL': 'Payroll',
  '/website/publishing': 'Publishing',
  '/website/pages': 'Pages',
  '/website/rooms': 'Web Rooms',
  '/website/facilities': 'Facilities',
  '/website/tours': 'Tours',
  '/website/destinations': 'Guide',
  '/website/rising': 'Rising',
  '/website/faqs': 'FAQ',
  '/website/navigation': 'Menus',
  '/website/redirects': 'Redirects',
  '/media': 'Media',
  '/settings': 'Settings',
  '/settings/notifications': 'Alerts',
  '/settings/messages': 'Templates',
  '/settings/integrations': 'Integrations',
  '/settings/users': 'People',
  '/settings/users?view=roles': 'Roles',
  '/settings/audit': 'Audit Log',
};

const TINT: Record<string, [string, string]> = {
  command: ['#14B8A6', '#0F766E'],
  stays: ['#3B82F6', '#1D4ED8'],
  finance: ['#F59E0B', '#C2410C'],
  operations: ['#F97316', '#C2410C'],
  hr: ['#F43F5E', '#BE123C'],
  cms: ['#8B5CF6', '#6D28D9'],
  system: ['#64748B', '#334155'],
};
const SPECIAL_TINT: Record<string, [string, string]> = {
  '/today': ['#1A1E43', '#2F3672'],
  '/brief': ['#D76E1B', '#A8520F'],
  '/reports': ['#10B981', '#047857'],
  '/day-close': ['#2F3672', '#0E1126'],
  '/maintenance': ['#64748B', '#334155'],
  '/lost-found': ['#A855F7', '#7E22CE'],
  '/receipts': ['#0EA5E9', '#0369A1'],
  '/housekeeping': ['#EAB308', '#A16207'],
  '/rack': ['#22C55E', '#15803D'],
  '/health-club': ['#06B6D4', '#0E7490'],
};

export const ALL_APPS: HouseApp[] = NAV.flatMap((g) =>
  g.items
    .filter((i) => i.href !== '/' && !i.later)
    .map((i) => ({
      href: i.href,
      name: SHORT[i.href] ?? i.label,
      fullName: i.label,
      icon: i.icon,
      group: g.label,
      groupId: g.id,
      badge: i.badge,
      perm: i.perm,
      tint: SPECIAL_TINT[i.href] ?? TINT[g.id] ?? TINT.system!,
    })),
);

export const APP_BY_HREF = new Map(ALL_APPS.map((a) => [a.href, a]));

/** Apps this person may open. */
export const appsFor = (permissions: string[]) => ALL_APPS.filter((a) => !a.perm || permissions.includes(a.perm));

/** What a new person finds in their dock, by job. */
const DEFAULT_PINS: Partial<Record<Role, string[]>> = {
  OWNER: ['/today', '/brief', '/desk', '/reservations', '/pos', '/reports', '/inbox'],
  MANAGER: ['/today', '/desk', '/reservations', '/housekeeping', '/pos', '/inbox', '/reports'],
  DESK: ['/desk', '/reservations', '/rack', '/inbox', '/receipts', '/guests'],
  HOUSEKEEPING: ['/housekeeping', '/rack', '/requisitions'],
  KITCHEN: ['/pos', '/pos/tables', '/requisitions'],
  BAR: ['/pos', '/pos/tables', '/requisitions'],
  GYM: ['/health-club', '/pos', '/requisitions'],
  HR: ['/hr', '/hr?tab=ROSTER', '/hr?tab=LEAVE', '/hr?tab=PAYROLL', '/departments'],
  ACCOUNTANT: ['/receipts', '/reports', '/brief', '/quotations'],
};

/** The job behind a title like “Bar Attendant” or “Head Chef” (titles say more than the base role). */
const JOB_HINTS: [RegExp, Role][] = [
  [/chef|kitchen|cook/i, 'KITCHEN'],
  [/bar|waiter|waitress|server|mixolog|restaurant|f&b|food and beverage/i, 'BAR'],
  [/gym|spa|fitness|instructor|therap|wellness/i, 'GYM'],
  [/housekeep|clean|laundry|room attendant|linen/i, 'HOUSEKEEPING'],
  [/account|cashier|finance|bookkeep/i, 'ACCOUNTANT'],
  [/\bhr\b|human resources|people/i, 'HR'],
  [/manager|supervisor/i, 'MANAGER'],
  [/reception|front desk|concierge|guest relations/i, 'DESK'],
];

export function defaultPins(role: Role, permissions: string[], jobTitle?: string | null, customRoleName?: string | null): string[] {
  const allowed = new Set(appsFor(permissions).map((a) => a.href));
  const words = `${customRoleName ?? ''} ${jobTitle ?? ''}`;
  const job = JOB_HINTS.find(([re]) => re.test(words))?.[1];
  for (const r of [job, role]) {
    const pins = (r ? (DEFAULT_PINS[r] ?? []) : []).filter((h) => allowed.has(h));
    if (pins.length) return pins;
  }
  const fallback = ['/today', '/desk', '/reservations', '/inbox'].filter((h) => allowed.has(h));
  return fallback.length ? fallback : [...allowed].slice(0, 5);
}
