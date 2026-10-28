import type { Role } from './enums.js';

export const PERMISSIONS = [
  'dashboard:view',
  'content:read',
  'content:write',
  'content:publish',
  'media:read',
  'media:upload',
  'media:manage',
  'inbox:read',
  'inbox:write',
  'waitlist:read',
  'waitlist:write',
  'waitlist:export',
  'settings:read',
  'settings:write',
  'settings:features',
  'users:manage',
  'audit:read',
  'vault:manage',
  'rooms:status',
  'bookings:read',
  'bookings:write',
  'rates:read',
  'rates:write',
  'payments:record',
  'payments:refund',
  'desk:operate',
  'rooms:inspect',
  'rooms:manage',
  'guests:read',
  'guests:write',
  'guests:merge',
  'feedback:manage',
  'reports:read',
  'messages:read',
  'receipts:read',
  'receipts:issue',
  'receipts:void',
  'pos:operate',
  'healthclub:operate',
  'quotations:manage',
  'inventory:manage',
  'requisitions:request',
  'requisitions:approve',
  'expenses:manage',
  'hr:manage',
] as const;
export type Permission = (typeof PERMISSIONS)[number];

const ALL = [...PERMISSIONS];

/** "Who may touch what" from the spec, made enforceable. The API is the wall. */
export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  OWNER: ALL,
  MANAGER: ALL.filter((p) => !['settings:features', 'users:manage', 'vault:manage'].includes(p)),
  DESK: [
    'dashboard:view', 'media:read', 'media:upload', 'inbox:read', 'inbox:write',
    'waitlist:read', 'waitlist:write', 'rooms:status', 'bookings:read', 'bookings:write',
    'rates:read', 'payments:record', 'desk:operate', 'rooms:inspect', 'guests:read',
    'guests:write', 'messages:read', 'receipts:read', 'receipts:issue',
    'pos:operate', 'healthclub:operate', 'quotations:manage', 'inventory:manage', 'requisitions:request',
  ],
  HOUSEKEEPING: ['rooms:status'],
};

export function can(role: Role | undefined | null, permission: Permission): boolean {
  return !!role && ROLE_PERMISSIONS[role].includes(permission);
}

/** Powers that stay with owners, whatever is granted: people, keys, feature switches. */
export const OWNER_ONLY: Permission[] = ['users:manage', 'vault:manage', 'settings:features'];

/**
 * What one person may do: their role's preset, plus what the owner added,
 * minus what the owner took away. Owners always have everything.
 */
export function effectivePermissions(role: Role, grants: readonly string[] = [], revokes: readonly string[] = []): Permission[] {
  if (role === 'OWNER') return [...PERMISSIONS];
  const set = new Set<Permission>(ROLE_PERMISSIONS[role]);
  for (const g of grants) if ((PERMISSIONS as readonly string[]).includes(g) && !OWNER_ONLY.includes(g as Permission)) set.add(g as Permission);
  for (const r of revokes) set.delete(r as Permission);
  return PERMISSIONS.filter((p) => set.has(p));
}

export interface PermissionInfo {
  key: Permission;
  label: string;
  description: string;
  group: string;
  /** Touches money: shown with a marker so it is never granted by accident. */
  money?: boolean;
}

/** Plain words for the access screen. Every permission appears exactly once. */
export const PERMISSION_INFO: PermissionInfo[] = [
  { key: 'dashboard:view', group: 'Everyday', label: 'Today screen', description: 'The day at a glance: arrivals, messages, website health.' },
  { key: 'inbox:read', group: 'Everyday', label: 'Read the inbox', description: 'Website enquiries and WhatsApp conversations.' },
  { key: 'inbox:write', group: 'Everyday', label: 'Answer the inbox', description: 'Reply, assign and close conversations.' },
  { key: 'waitlist:read', group: 'Everyday', label: 'See the first-stay list', description: 'Who asked for a first stay.' },
  { key: 'waitlist:write', group: 'Everyday', label: 'Work the first-stay list', description: 'Contact, convert or decline names.' },
  { key: 'waitlist:export', group: 'Everyday', label: 'Export the first-stay list', description: 'Download names and phone numbers as a file.' },
  { key: 'messages:read', group: 'Everyday', label: 'See sent messages', description: 'Emails, SMS and WhatsApp sent to guests.' },

  { key: 'desk:operate', group: 'Front desk and rooms', label: 'Front desk', description: 'Check guests in and out, give rooms, move guests, no-shows.' },
  { key: 'rooms:status', group: 'Front desk and rooms', label: 'Room status and cleaning', description: 'The room rack and the housekeeping list (no money, no guest details).' },
  { key: 'rooms:inspect', group: 'Front desk and rooms', label: 'Inspect rooms', description: 'Sign off a cleaned room as ready to sell; give rooms to cleaners.' },
  { key: 'rooms:manage', group: 'Front desk and rooms', label: 'Take rooms off sale', description: 'Block rooms for maintenance, the owner or staff.' },

  { key: 'bookings:read', group: 'Bookings', label: 'See reservations', description: 'The reservation list and each booking.' },
  { key: 'bookings:write', group: 'Bookings', label: 'Make and change reservations', description: 'New bookings, notes, cancellations, messages to guests.' },
  { key: 'rates:read', group: 'Bookings', label: 'See rates', description: 'The rates calendar, extras and packages.' },
  { key: 'rates:write', group: 'Bookings', label: 'Change rates', description: 'Prices, availability, rate plans, extras and packages.', money: true },

  { key: 'payments:record', group: 'Money', label: 'Take payments', description: 'Record cash, mobile money and card payments; see amounts.', money: true },
  { key: 'payments:refund', group: 'Money', label: 'Refunds and credits', description: 'Refund guests, take money off a bill, close a bill with money owed.', money: true },
  { key: 'receipts:read', group: 'Money', label: 'See receipts', description: 'Receipts, refund notes and invoices, and the register.', money: true },
  { key: 'receipts:issue', group: 'Money', label: 'Print and send receipts', description: 'Print, reprint and send documents to guests.', money: true },
  { key: 'receipts:void', group: 'Money', label: 'Void receipts', description: 'Cancel a wrong document and issue a corrected one.', money: true },
  { key: 'reports:read', group: 'Money', label: 'Reports', description: 'Occupancy, rates, revenue and where bookings come from.', money: true },

  { key: 'pos:operate', group: 'Operations & POS', label: 'Kitchen & Bar POS', description: 'Take dining and beverage orders, charge to room folios or settle bills.', money: true },
  { key: 'healthclub:operate', group: 'Operations & POS', label: 'Health Club & Spa', description: 'Manage gym, steam and sauna passes, memberships and gym towel logs.', money: true },
  { key: 'quotations:manage', group: 'Operations & POS', label: 'Quotations & Events', description: 'Issue pro-forma quotations for conferences, weddings and group stays, and convert to invoices.', money: true },
  { key: 'inventory:manage', group: 'Operations & POS', label: 'Inventory, Linen & Assets', description: 'Track stock in/out, gym vs bathroom towels, consumables and fixed assets.' },
  { key: 'requisitions:request', group: 'Operations & POS', label: 'Submit requisitions', description: 'Request departmental stock replenishment, supplies or maintenance.' },
  { key: 'requisitions:approve', group: 'Operations & POS', label: 'Approve & disburse requisitions', description: 'Manager/Director approval and store disbursement for requisitions.', money: true },
  { key: 'expenses:manage', group: 'Operations & POS', label: 'Expense Management & Cost Drivers', description: 'Record, edit, and categorize hotel operational expenses, utility bills, and supplier payments.', money: true },
  { key: 'hr:manage', group: 'Operations & POS', label: 'Human Resource Management', description: 'Manage employee profiles, shift rosters, leave requests, and payroll records.', money: true },

  { key: 'guests:read', group: 'Guests', label: 'Guest profiles', description: 'Guest history, notes and feedback.' },
  { key: 'guests:write', group: 'Guests', label: 'Edit guest profiles', description: 'Contact details, notes, tags, VIP.' },
  { key: 'guests:merge', group: 'Guests', label: 'Merge duplicate guests', description: 'Join two records of the same person.' },
  { key: 'feedback:manage', group: 'Guests', label: 'Handle feedback', description: 'Mark feedback dealt with; put guest words on the website.' },

  { key: 'content:read', group: 'Website', label: 'See the website editor', description: 'Pages, rooms, facilities, tours and more.' },
  { key: 'content:write', group: 'Website', label: 'Edit the website', description: 'Change drafts of pages and content.' },
  { key: 'content:publish', group: 'Website', label: 'Publish to the website', description: 'Make changes live for guests.' },
  { key: 'media:read', group: 'Website', label: 'See the media library', description: 'Photos, drawings and documents.' },
  { key: 'media:upload', group: 'Website', label: 'Upload media', description: 'Add photos and documents.' },
  { key: 'media:manage', group: 'Website', label: 'Manage media', description: 'Replace and delete files.' },

  { key: 'settings:read', group: 'Settings', label: 'See settings', description: 'Hotel details, message wording.' },
  { key: 'settings:write', group: 'Settings', label: 'Change settings', description: 'Hotel details, contact numbers, message wording.' },
  { key: 'audit:read', group: 'Settings', label: 'Audit log', description: 'Who changed what, and when.' },
  { key: 'settings:features', group: 'Owner only', label: 'Switch features on and off', description: 'Online booking, tours, the first-stay list.' },
  { key: 'users:manage', group: 'Owner only', label: 'People and access', description: 'Add staff and decide what they can do.' },
  { key: 'vault:manage', group: 'Owner only', label: 'Integrations and keys', description: 'Payment and messaging keys.' },
];


export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  OWNER: 'Brief, money, rates, users. Everything — without needing to run the morning desk.',
  MANAGER: 'Bookings, rates, inbox, rooms and the website. Not bank keys, not users.',
  DESK: 'Arrivals, walk-ins, folio, notes, inbox. Cannot rewrite a rate plan.',
  HOUSEKEEPING: 'Dirty and clean. Cannot see payments.',
};
