import type { Permission } from '@reberon/contracts';
import {
  BedDouble, BookOpenText, CalendarRange, CircleHelp, ConciergeBell, FileText, Hammer, Home, Image, Inbox, KeyRound, ListChecks, Map, Navigation, ScrollText,
  Settings, Shuffle, SprayCan, Building2, Users, Rocket, Gift, Sunset, LayoutGrid, Contact, MessageCircleHeart, ChartColumnBig, Send, PlugZap, MessagesSquare, Rotate3d, ReceiptText,
  UtensilsCrossed, Dumbbell, FileSpreadsheet, Boxes, ClipboardCheck, type LucideIcon,
} from 'lucide-react';

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  perm?: Permission;
  badge?: 'inbox' | 'waitlist' | 'publishing';
  later?: string;
}
export interface NavGroup {
  label?: string;
  items: NavItem[];
}

export const NAV: NavGroup[] = [
  {
    items: [
      { label: 'Today', href: '/', icon: Home },
      { label: 'Inbox', href: '/inbox', icon: Inbox, perm: 'inbox:read', badge: 'inbox' },
      { label: 'First-stay list', href: '/waitlist', icon: ListChecks, perm: 'waitlist:read', badge: 'waitlist' },
      { label: 'Sent messages', href: '/messages', icon: Send, perm: 'messages:read' },
    ],
  },
  {
    label: 'Bookings',
    items: [
      { label: 'Reservations', href: '/reservations', icon: BookOpenText, perm: 'bookings:read' },
      { label: 'Calendar & rates', href: '/calendar', icon: CalendarRange, perm: 'rates:read' },
      { label: 'Extras & packages', href: '/sellables', icon: Gift, perm: 'rates:read' },
      { label: 'Receipts', href: '/receipts', icon: ReceiptText, perm: 'receipts:read' },
      { label: 'Owner brief', href: '/brief', icon: Sunset, perm: 'bookings:read' },
    ],
  },
  {
    label: 'The house',
    items: [
      { label: 'Front desk', href: '/desk', icon: ConciergeBell, perm: 'desk:operate' },
      { label: 'Room rack', href: '/rack', icon: LayoutGrid, perm: 'rooms:status' },
      { label: 'Housekeeping', href: '/housekeeping', icon: SprayCan, perm: 'rooms:status' },
      { label: 'Departments', href: '/departments', icon: Building2, perm: 'inventory:manage' },
      { label: 'Guests', href: '/guests', icon: Contact, perm: 'guests:read' },
      { label: 'Feedback', href: '/feedback', icon: MessageCircleHeart, perm: 'guests:read' },
      { label: 'Reports', href: '/reports', icon: ChartColumnBig, perm: 'reports:read' },
    ],
  },
  {
    label: 'Operations & POS',
    items: [
      { label: 'POS: Kitchen & Bar', href: '/pos', icon: UtensilsCrossed, perm: 'pos:operate' },
      { label: 'Health Club & Spa', href: '/health-club', icon: Dumbbell, perm: 'healthclub:operate' },
      { label: 'Quotations & Events', href: '/quotations', icon: FileSpreadsheet, perm: 'quotations:manage' },
      { label: 'Inventory & Linen', href: '/inventory', icon: Boxes, perm: 'inventory:manage' },
      { label: 'Requisitions & Comms', href: '/requisitions', icon: ClipboardCheck, perm: 'requisitions:request' },
    ],
  },
  {
    label: 'Website CMS',
    items: [
      { label: 'Publishing', href: '/website/publishing', icon: Rocket, perm: 'content:read', badge: 'publishing' },
      { label: 'Pages', href: '/website/pages', icon: FileText, perm: 'content:read' },
      { label: 'Rooms', href: '/website/rooms', icon: BedDouble, perm: 'content:read' },
      { label: 'Facilities', href: '/website/facilities', icon: Building2, perm: 'content:read' },
      { label: 'Virtual tours', href: '/website/tours', icon: Rotate3d, perm: 'content:read' },
      { label: 'Kapchorwa', href: '/website/destinations', icon: Map, perm: 'content:read' },
      { label: 'Hotel rising', href: '/website/rising', icon: Hammer, perm: 'content:read' },
      { label: 'Questions', href: '/website/faqs', icon: CircleHelp, perm: 'content:read' },
      { label: 'Navigation', href: '/website/navigation', icon: Navigation, perm: 'content:read' },
      { label: 'Redirects', href: '/website/redirects', icon: Shuffle, perm: 'content:read' },
      { label: 'Media', href: '/media', icon: Image, perm: 'media:read' },
    ],
  },
  {
    label: 'Admin',
    items: [
      { label: 'Settings', href: '/settings', icon: Settings, perm: 'settings:read' },
      { label: 'Messages', href: '/settings/messages', icon: MessagesSquare, perm: 'settings:read' },
      { label: 'Integrations', href: '/settings/integrations', icon: PlugZap, perm: 'vault:manage' },
      { label: 'People and access', href: '/settings/users', icon: Users, perm: 'users:manage' },
      { label: 'Audit log', href: '/settings/audit', icon: ScrollText, perm: 'audit:read' },
    ],
  },
];
