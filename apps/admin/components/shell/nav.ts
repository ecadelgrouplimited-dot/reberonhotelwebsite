import type { Permission } from '@reberon/contracts';
import {
  BedDouble,
  BookOpenText,
  Boxes,
  Building2,
  CalendarDays,
  CalendarRange,
  ChartColumnBig,
  CircleHelp,
  ClipboardCheck,
  Clock,
  ConciergeBell,
  Contact,
  DollarSign,
  Dumbbell,
  FileSpreadsheet,
  FileText,
  Gift,
  Globe,
  Hammer,
  Home,
  Image,
  Inbox,
  LayoutGrid,
  ListChecks,
  Map,
  MessageCircleHeart,
  MessagesSquare,
  Navigation,
  PlugZap,
  Radio,
  ReceiptText,
  Rocket,
  Rotate3d,
  ScrollText,
  Send,
  Settings,
  ShieldCheck,
  Shuffle,
  SprayCan,
  Sunset,
  Tags,
  Users,
  UtensilsCrossed,
  Wallet,
  type LucideIcon,
} from 'lucide-react';

export type NavBadgeKey =
  | 'today'
  | 'inbox'
  | 'waitlist'
  | 'messages'
  | 'desk'
  | 'reservations'
  | 'rack'
  | 'housekeeping'
  | 'feedback'
  | 'brief'
  | 'receipts'
  | 'quotations'
  | 'pos'
  | 'healthclub'
  | 'inventory'
  | 'requisitions'
  | 'staff'
  | 'departments'
  | 'shifts'
  | 'leave'
  | 'payroll'
  | 'publishing';

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  perm?: Permission;
  badge?: NavBadgeKey;
  later?: string;
}

export interface NavGroup {
  id: string;
  label: string;
  icon: LucideIcon;
  defaultOpen?: boolean;
  items: NavItem[];
}

export const NAV: NavGroup[] = [
  {
    id: 'command',
    label: 'Command & Comms',
    icon: Radio,
    defaultOpen: true,
    items: [
      { label: 'Today Overview', href: '/', icon: Home, badge: 'today' },
      { label: 'Inbox & Enquiries', href: '/inbox', icon: Inbox, perm: 'inbox:read', badge: 'inbox' },
      { label: 'First-Stay Waitlist', href: '/waitlist', icon: ListChecks, perm: 'waitlist:read', badge: 'waitlist' },
      { label: 'Sent Messages', href: '/messages', icon: Send, perm: 'messages:read', badge: 'messages' },
    ],
  },
  {
    id: 'stays',
    label: 'Front Desk & Stays',
    icon: ConciergeBell,
    defaultOpen: true,
    items: [
      { label: 'Front Desk', href: '/desk', icon: ConciergeBell, perm: 'desk:operate', badge: 'desk' },
      { label: 'Reservations', href: '/reservations', icon: BookOpenText, perm: 'bookings:read', badge: 'reservations' },
      { label: 'Room Rack', href: '/rack', icon: LayoutGrid, perm: 'rooms:status', badge: 'rack' },
      { label: 'Housekeeping', href: '/housekeeping', icon: SprayCan, perm: 'rooms:status', badge: 'housekeeping' },
      { label: 'Guests & Profiles', href: '/guests', icon: Contact, perm: 'guests:read' },
      { label: 'Guest Feedback', href: '/feedback', icon: MessageCircleHeart, perm: 'guests:read', badge: 'feedback' },
    ],
  },
  {
    id: 'finance',
    label: 'Revenue & Billing',
    icon: Wallet,
    defaultOpen: true,
    items: [
      { label: 'Owner Brief', href: '/brief', icon: Sunset, perm: 'bookings:read', badge: 'brief' },
      { label: 'Receipts & Folios', href: '/receipts', icon: ReceiptText, perm: 'receipts:read', badge: 'receipts' },
      { label: 'Quotations & Events', href: '/quotations', icon: FileSpreadsheet, perm: 'quotations:manage', badge: 'quotations' },
      { label: 'Calendar & Rates', href: '/calendar', icon: CalendarRange, perm: 'rates:read' },
      { label: 'Extras & Packages', href: '/sellables', icon: Gift, perm: 'rates:read' },
      { label: 'Financial Reports', href: '/reports', icon: ChartColumnBig, perm: 'reports:read' },
    ],
  },
  {
    id: 'operations',
    label: 'Operations & POS',
    icon: UtensilsCrossed,
    defaultOpen: true,
    items: [
      { label: 'POS: Kitchen & Bar', href: '/pos', icon: UtensilsCrossed, perm: 'pos:operate', badge: 'pos' },
      { label: 'Health Club & Spa', href: '/health-club', icon: Dumbbell, perm: 'healthclub:operate', badge: 'healthclub' },
      { label: 'Inventory & Linen', href: '/inventory', icon: Boxes, perm: 'inventory:manage', badge: 'inventory' },
      { label: 'Item Categories', href: '/inventory/categories', icon: Tags, perm: 'inventory:manage' },
      { label: 'Requisitions & Comms', href: '/requisitions', icon: ClipboardCheck, perm: 'requisitions:request', badge: 'requisitions' },
    ],
  },
  {
    id: 'hr',
    label: 'Human Resources',
    icon: Users,
    defaultOpen: true,
    items: [
      { label: 'Staff Directory', href: '/hr', icon: Users, perm: 'inventory:manage', badge: 'staff' },
      { label: 'Departments', href: '/departments', icon: Building2, perm: 'inventory:manage', badge: 'departments' },
      { label: 'Shift Rosters', href: '/hr?tab=ROSTER', icon: Clock, perm: 'inventory:manage', badge: 'shifts' },
      { label: 'Leave Requests', href: '/hr?tab=LEAVE', icon: CalendarDays, perm: 'inventory:manage', badge: 'leave' },
      { label: 'Payroll & Taxes', href: '/hr?tab=PAYROLL', icon: DollarSign, perm: 'inventory:manage', badge: 'payroll' },
    ],
  },
  {
    id: 'cms',
    label: 'Website & Concierge',
    icon: Globe,
    defaultOpen: false,
    items: [
      { label: 'Publishing', href: '/website/publishing', icon: Rocket, perm: 'content:read', badge: 'publishing' },
      { label: 'Pages', href: '/website/pages', icon: FileText, perm: 'content:read' },
      { label: 'Rooms', href: '/website/rooms', icon: BedDouble, perm: 'content:read' },
      { label: 'Facilities', href: '/website/facilities', icon: Building2, perm: 'content:read' },
      { label: 'Virtual Tours', href: '/website/tours', icon: Rotate3d, perm: 'content:read' },
      { label: 'Kapchorwa Guide', href: '/website/destinations', icon: Map, perm: 'content:read' },
      { label: 'Hotel Rising', href: '/website/rising', icon: Hammer, perm: 'content:read' },
      { label: 'Questions & FAQ', href: '/website/faqs', icon: CircleHelp, perm: 'content:read' },
      { label: 'Navigation', href: '/website/navigation', icon: Navigation, perm: 'content:read' },
      { label: 'Redirects', href: '/website/redirects', icon: Shuffle, perm: 'content:read' },
      { label: 'Media Library', href: '/media', icon: Image, perm: 'media:read' },
    ],
  },
  {
    id: 'system',
    label: 'System & Security',
    icon: ShieldCheck,
    defaultOpen: false,
    items: [
      { label: 'Hotel Settings', href: '/settings', icon: Settings, perm: 'settings:read' },
      { label: 'Message Templates', href: '/settings/messages', icon: MessagesSquare, perm: 'settings:read' },
      { label: 'Integrations & Vault', href: '/settings/integrations', icon: PlugZap, perm: 'vault:manage' },
      { label: 'People & Access', href: '/settings/users', icon: Users, perm: 'users:manage' },
      { label: 'Audit Log', href: '/settings/audit', icon: ScrollText, perm: 'audit:read' },
    ],
  },
];
