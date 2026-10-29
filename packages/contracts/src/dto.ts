import type { TourDTO } from './tours.js';
import type { LText, LRich } from './localized.js';
import type { Block } from './blocks.js';
import type {
  PageKind, PageStatus, ContentStatus, FacilityStatus, Milestone, DestinationKind, AmenityCategory,
  NavMenuKey, NavTarget, Role, UserStatus, Channel, ConversationStatus, Intent, MessageDirection,
  WaitlistStatus, ContactSource, MediaKind, MediaStatus,
} from './enums.js';

export interface MediaRef {
  id: string;
  kind: MediaKind;
  url: string; // largest webp variant (pattern: …/{width}.webp) or file url for documents
  width: number | null;
  height: number | null;
  alt: LText;
  caption: LText | null;
  credit: string | null;
  isRendering: boolean;
  lqip: string | null; // tiny base64 webp placeholder
  dominantColor: string | null;
  focalX: number;
  focalY: number;
}

export interface NavItemDTO {
  id: string;
  label: LText;
  href: string;
  children: NavItemDTO[];
}

export interface SiteDTO {
  name: string;
  tagline: LText;
  logo: MediaRef | null;
  contact: {
    phones: string[];
    whatsapp: string | null;
    email: string | null;
    address: LText;
    geo: { lat: number; lng: number } | null;
    hours: LText;
    responsePromise: LText;
  };
  social: Record<string, string>;
  currencies: string[];
  defaultCurrency: string;
  checkInTime: string;
  checkOutTime: string;
  openingLabel: LText;
  features: { bookingEnabled: boolean; waitlistEnabled: boolean; progressEnabled: boolean; toursEnabled: boolean; maintenanceMode?: boolean };
  seo: { titleTemplate: string; defaultTitle: string; defaultDescription: LText; shareImage: MediaRef | null };
  footerNote: LText;
  nav: Record<NavMenuKey, NavItemDTO[]>;
}

export interface SeoDTO {
  title?: LText;
  description?: LText;
  shareImageId?: string | null;
  noindex?: boolean;
}

export type ResolvedBlock = Block & { resolved?: Record<string, unknown> };

export interface PageDTO {
  id: string;
  slug: string;
  kind: PageKind;
  title: LText;
  seo: SeoDTO;
  blocks: ResolvedBlock[];
  media: Record<string, MediaRef>;
  publishedAt: string | null;
  isPreview?: boolean;
}

export interface PriceDTO {
  ugx: string | null; // minor units as string
  usd: string | null;
}

export interface AmenityDTO {
  id: string;
  key: string;
  name: LText;
  icon: string;
  category: AmenityCategory;
}

export interface RoomTypeCardDTO {
  id: string;
  slug: string;
  name: LText;
  tagline: LText;
  sleepsAdults: number;
  sleepsChildren: number;
  bedConfig: LText;
  sizeSqm: number | null;
  view: LText | null;
  roomCount: number;
  fromPrice: PriceDTO;
  hero: MediaRef | null;
}

export interface RoomTypeDetailDTO extends RoomTypeCardDTO {
  description: LRich | null;
  gallery: MediaRef[];
  floorPlan: MediaRef | null;
  amenities: AmenityDTO[];
  seo: SeoDTO;
  related: RoomTypeCardDTO[];
  /** Movement III: the walk for this room type, when tours are switched on and one is published. */
  tour: TourDTO | null;
}

export interface FacilityDTO {
  id: string;
  slug: string;
  name: LText;
  summary: LText;
  body: LRich | null;
  icon: string;
  status: FacilityStatus;
  media: MediaRef[];
}

export interface FacilityDetailDTO extends FacilityDTO {
  related: FacilityDTO[];
}

export interface RouteStopDTO {
  id: string;
  name: LText;
  note: LText | null;
  minutesFromPrev: number | null;
  altitude: number | null;
  lat: number | null;
  lng: number | null;
}

export interface DestinationCardDTO {
  id: string;
  slug: string;
  kind: DestinationKind;
  name: LText;
  tagline: LText;
  distanceKm: number | null;
  driveMinutes: number | null;
  hero: MediaRef | null;
}

export interface DestinationDetailDTO extends DestinationCardDTO {
  body: LRich | null;
  blocks: ResolvedBlock[];
  media: Record<string, MediaRef>;
  gallery: MediaRef[];
  lat: number | null;
  lng: number | null;
  stops: RouteStopDTO[];
  seo: SeoDTO;
  others: DestinationCardDTO[];
}

export interface ProgressDTO {
  id: string;
  slug: string;
  title: LText;
  body: LRich | null;
  happenedOn: string;
  milestone: Milestone | null;
  percentComplete: number | null;
  media: MediaRef[];
}

export interface FaqGroupDTO {
  id: string;
  key: string;
  title: LText;
  items: { id: string; question: LText; answer: LRich }[];
}

export interface Paginated<T> {
  data: T[];
  nextCursor: string | null;
  total?: number;
}

/* ---------- Admin DTOs ---------- */

export interface MeDTO {
  id: string;
  email: string;
  name: string;
  role: Role;
  avatarUrl: string | null;
  permissions: string[];
}

export interface UserDTO {
  id: string;
  email: string | null;
  name: string;
  phone: string | null;
  jobTitle: string | null;
  role: Role;
  status: UserStatus;
  /** Off: a staff record only, no House login. */
  canSignIn: boolean;
  signInFrom: string | null;
  signInUntil: string | null;
  accessExpiresAt: string | null;
  grants: string[];
  revokes: string[];
  /** Effective: role preset + grants − revokes. */
  permissions: string[];
  hasPassword: boolean;
  activeSessions: number;
  lastLoginAt: string | null;
  createdAt: string;
}

export interface SessionDTO {
  id: string;
  device: string;
  ip: string | null;
  createdAt: string;
  lastUsedAt: string;
  current: boolean;
}

export interface AdminMediaDTO extends MediaRef {
  originalName: string;
  mimeType: string;
  bytes: number;
  status: MediaStatus;
  tags: string[];
  folder: string | null;
  createdAt: string;
  usageCount?: number;
}

export interface AdminPageSummaryDTO {
  id: string;
  slug: string;
  kind: PageKind;
  title: LText;
  status: PageStatus;
  hasUnpublishedChanges: boolean;
  publishedAt: string | null;
  publishAt: string | null;
  updatedAt: string;
  updatedBy: string | null;
}

export interface AdminPageDTO extends AdminPageSummaryDTO {
  draftBlocks: Block[];
  draftSeo: SeoDTO;
  version: number;
  media: Record<string, MediaRef>;
}

export interface ContactDTO {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  country: string | null;
  source: ContactSource;
  whatsappOptIn: boolean;
}

export interface ConversationSummaryDTO {
  id: string;
  reference: string;
  channel: Channel;
  intent: Intent;
  status: ConversationStatus;
  subject: string | null;
  preview: string;
  contact: ContactDTO;
  assignee: { id: string; name: string } | null;
  lastMessageAt: string;
  createdAt: string;
  messageCount: number;
  unread: boolean;
}

export interface MessageDTO {
  id: string;
  direction: MessageDirection;
  body: string;
  author: { id: string; name: string } | null;
  createdAt: string;
}

export interface ConversationDetailDTO extends ConversationSummaryDTO {
  context: Record<string, unknown>;
  messages: MessageDTO[];
}

export interface WaitlistEntryDTO {
  id: string;
  reference: string;
  contact: ContactDTO;
  roomType: { id: string; name: LText } | null;
  preferredFrom: string | null;
  preferredTo: string | null;
  flexibleDates: boolean;
  adults: number;
  children: number;
  note: string | null;
  staffNotes: string | null;
  status: WaitlistStatus;
  priority: number;
  createdAt: string;
}

export interface AuditLogDTO {
  id: string;
  actor: { id: string; name: string } | null;
  actorType: string;
  action: string;
  entityType: string;
  entityId: string | null;
  summary: string | null;
  before: unknown;
  after: unknown;
  ip: string | null;
  createdAt: string;
}

export interface DashboardDTO {
  counts: {
    newEnquiries24h: number;
    openConversations: number;
    waitlistTotal: number;
    waitlistNew: number;
    draftPages: number;
    mediaCount: number;
  };
  waitlistByRoomType: { name: LText; count: number }[];
  enquiriesByDay: { date: string; count: number }[];
  latestConversations: ConversationSummaryDTO[];
  latestWaitlist: WaitlistEntryDTO[];
  recentActivity: AuditLogDTO[];
  progress: { percent: number | null; milestone: string | null; lastUpdate: string | null };
}
