/** Closed sets shared by api, web and admin. Must match Prisma enums in packages/db. */
const e = <T extends string>(...v: T[]) => v;

export const ROLES = e(
  'OWNER',
  'MANAGER',
  'HR',
  'ACCOUNTANT',
  'DESK',
  'KITCHEN',
  'BAR',
  'GYM',
  'HOUSEKEEPING',
);
export type Role = (typeof ROLES)[number];

export const USER_STATUSES = e('ACTIVE', 'INVITED', 'DISABLED');
export type UserStatus = (typeof USER_STATUSES)[number];

export const PAGE_KINDS = e(
  'HOME', 'STANDARD', 'ABOUT', 'FACILITIES', 'CONTACT', 'LEGAL',
  'DESTINATION_INDEX', 'ROOMS_INDEX', 'PROGRESS', 'LANDING', 'SYSTEM',
);
export type PageKind = (typeof PAGE_KINDS)[number];

export const PAGE_STATUSES = e('DRAFT', 'SCHEDULED', 'PUBLISHED', 'ARCHIVED');
export type PageStatus = (typeof PAGE_STATUSES)[number];

export const CONTENT_STATUSES = e('DRAFT', 'PUBLISHED', 'HIDDEN');
export type ContentStatus = (typeof CONTENT_STATUSES)[number];

export const FACILITY_STATUSES = e('AVAILABLE', 'COMING_SOON', 'HIDDEN');
export type FacilityStatus = (typeof FACILITY_STATUSES)[number];

export const MILESTONES = e('GROUNDBREAKING', 'FOUNDATION', 'STRUCTURE', 'ROOF', 'FINISHES', 'FURNISHING', 'OPENING');
export type Milestone = (typeof MILESTONES)[number];

export const DESTINATION_KINDS = e('PLACE', 'ROUTE', 'THEME', 'SEASON', 'PRACTICAL');
export type DestinationKind = (typeof DESTINATION_KINDS)[number];

export const AMENITY_CATEGORIES = e('COMFORT', 'BATH', 'TECH', 'VIEW', 'ACCESS');
export type AmenityCategory = (typeof AMENITY_CATEGORIES)[number];

export const HK_STATUSES = e('VACANT_CLEAN', 'VACANT_DIRTY', 'OCCUPIED', 'INSPECTED', 'BLOCKED', 'OUT_OF_ORDER');
export type HkStatus = (typeof HK_STATUSES)[number];

export const CHANNELS = e('WEB_FORM', 'WHATSAPP', 'EMAIL', 'PHONE');
export type Channel = (typeof CHANNELS)[number];

export const CONVERSATION_STATUSES = e('NEW', 'OPEN', 'WAITING_GUEST', 'DONE', 'SPAM');
export type ConversationStatus = (typeof CONVERSATION_STATUSES)[number];

export const INTENTS = e('STAY', 'EVENT', 'GROUP', 'GENERAL', 'WAITLIST');
export type Intent = (typeof INTENTS)[number];

export const MESSAGE_DIRECTIONS = e('INBOUND', 'OUTBOUND', 'NOTE');
export type MessageDirection = (typeof MESSAGE_DIRECTIONS)[number];

export const CONTACT_SOURCES = e('WEB', 'WHATSAPP', 'EMAIL', 'PHONE', 'WALK_IN');
export type ContactSource = (typeof CONTACT_SOURCES)[number];

export const WAITLIST_STATUSES = e('NEW', 'CONTACTED', 'CONVERTED', 'DECLINED', 'EXPIRED');
export type WaitlistStatus = (typeof WAITLIST_STATUSES)[number];

export const MEDIA_KINDS = e('IMAGE', 'VIDEO', 'DOCUMENT');
export type MediaKind = (typeof MEDIA_KINDS)[number];

export const MEDIA_STATUSES = e('PROCESSING', 'READY', 'FAILED');
export type MediaStatus = (typeof MEDIA_STATUSES)[number];

export const NAV_MENUS = e('HEADER', 'FOOTER_PRIMARY', 'FOOTER_LEGAL', 'MOBILE');
export type NavMenuKey = (typeof NAV_MENUS)[number];

export const NAV_TARGETS = e('PAGE', 'ROOM_TYPE', 'DESTINATION', 'URL');
export type NavTarget = (typeof NAV_TARGETS)[number];

export const SETTING_GROUPS = e('GENERAL', 'CONTACT', 'BOOKING', 'SEO', 'FEATURES', 'NOTIFICATIONS');
export type SettingGroup = (typeof SETTING_GROUPS)[number];

/** Image widths generated for every uploaded image (webp). */
export const IMAGE_WIDTHS = [320, 640, 960, 1280, 1920, 2560] as const;
