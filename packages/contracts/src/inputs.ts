import { z } from 'zod';
import { zLText, zLRich } from './localized.js';
import { zBlocks, zBlockDrafts } from './blocks.js';
import {
  ROLES, PAGE_KINDS, CONTENT_STATUSES, FACILITY_STATUSES, MILESTONES, DESTINATION_KINDS, AMENITY_CATEGORIES,
  CONVERSATION_STATUSES, INTENTS, WAITLIST_STATUSES, NAV_TARGETS, CHANNELS,
} from './enums.js';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');
const slug = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Lowercase letters, numbers and dashes');
const optionalText = (max: number) =>
  z.string().trim().max(max).optional().transform((v) => (v ? v : undefined));

/* ---------- Public forms ---------- */

export const zEnquiryInput = z
  .object({
    name: z.string().trim().min(2, 'Tell us your name').max(120),
    phone: optionalText(40),
    email: z.string().trim().email('That email looks incomplete').max(200).optional().or(z.literal('').transform(() => undefined)),
    intent: z.enum(INTENTS).default('STAY'),
    message: z.string().trim().min(5, 'A few words, please').max(4000),
    arrival: isoDate.optional().or(z.literal('').transform(() => undefined)),
    departure: isoDate.optional().or(z.literal('').transform(() => undefined)),
    adults: z.coerce.number().int().min(1).max(60).optional(),
    children: z.coerce.number().int().min(0).max(40).optional(),
    roomTypeSlug: optionalText(80),
    pagePath: optionalText(300),
    consent: z.literal(true, { error: 'Please agree so we can reply' }),
    website: z.string().max(0, 'Leave this empty').optional(), // honeypot
  })
  .refine((v) => v.phone || v.email, { message: 'A phone or email so we can reply', path: ['phone'] })
  .refine((v) => !v.arrival || !v.departure || v.arrival < v.departure, {
    message: 'Departure must be after arrival',
    path: ['departure'],
  });
export type EnquiryInput = z.input<typeof zEnquiryInput>;

export const zWaitlistInput = z
  .object({
    name: z.string().trim().min(2, 'Tell us your name').max(120),
    phone: z.string().trim().min(7, 'A phone number, please').max(40),
    email: z.string().trim().email().max(200).optional().or(z.literal('').transform(() => undefined)),
    roomTypeSlug: optionalText(80),
    preferredFrom: isoDate.optional().or(z.literal('').transform(() => undefined)),
    preferredTo: isoDate.optional().or(z.literal('').transform(() => undefined)),
    flexibleDates: z.coerce.boolean().default(false),
    adults: z.coerce.number().int().min(1).max(20).default(2),
    children: z.coerce.number().int().min(0).max(20).default(0),
    note: optionalText(1000),
    consent: z.literal(true, { error: 'Please agree so we can contact you' }),
    website: z.string().max(0).optional(),
  })
  .refine((v) => !v.preferredFrom || !v.preferredTo || v.preferredFrom < v.preferredTo, {
    message: 'The end date must be after the start',
    path: ['preferredTo'],
  });
export type WaitlistInput = z.input<typeof zWaitlistInput>;

export const zWhatsappIntentInput = z.object({
  pagePath: optionalText(300),
  roomTypeSlug: optionalText(80),
  arrival: isoDate.optional(),
  departure: isoDate.optional(),
  message: optionalText(500),
});

/* ---------- Auth & users ---------- */

export const zLoginInput = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1).max(200),
});
export const zPasswordSchema = z.string().min(12, 'At least 12 characters').max(200);
export const zForgotInput = z.object({ email: z.string().trim().toLowerCase().email() });
export const zResetInput = z.object({ token: z.string().min(20), password: zPasswordSchema });
export const zChangePasswordInput = z.object({ currentPassword: z.string().min(1), newPassword: zPasswordSchema });

export const zInviteInput = z.object({
  email: z.string().trim().toLowerCase().email(),
  name: z.string().trim().min(2).max(120),
  role: z.enum(ROLES),
});
export const zAcceptInviteInput = z.object({ token: z.string().min(20), password: zPasswordSchema });
const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:MM');
export const zUserUpdateInput = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  email: z.string().trim().toLowerCase().email().nullable().optional().or(z.literal('').transform(() => null)),
  phone: z.string().trim().max(40).nullable().optional(),
  jobTitle: z.string().trim().max(80).nullable().optional(),
  role: z.enum(ROLES).optional(),
  status: z.enum(['ACTIVE', 'DISABLED']).optional(),
  canSignIn: z.boolean().optional(),
  signInFrom: hhmm.nullable().optional(),
  signInUntil: hhmm.nullable().optional(),
  accessExpiresAt: z.string().datetime({ offset: true }).nullable().optional(),
  grants: z.array(z.string().max(40)).max(60).optional(),
  revokes: z.array(z.string().max(40)).max(60).optional(),
  password: zPasswordSchema.optional(),
  sendCredentials: z.boolean().optional(),
});

export const zAdminSetPasswordInput = z.object({
  password: zPasswordSchema,
  sendCredentials: z.boolean().default(true),
});

/** A person on the staff list. They sign in only if canSignIn (then an email is needed for the invitation or credentials). */
export const zStaffCreateInput = z
  .object({
    name: z.string().trim().min(2).max(120),
    jobTitle: z.string().trim().max(80).optional(),
    phone: z.string().trim().max(40).optional(),
    email: z.string().trim().toLowerCase().email().optional().or(z.literal('').transform(() => undefined)),
    role: z.enum(ROLES),
    canSignIn: z.boolean().default(true),
    password: zPasswordSchema.optional().or(z.literal('').transform(() => undefined)),
    sendCredentials: z.boolean().default(true),
  })
  .refine((v) => !v.canSignIn || !!v.email, { path: ['email'], message: 'An email is needed for sign-in access' });

/* ---------- Content ---------- */

export const zSeoInput = z.object({
  title: zLText.optional(),
  description: zLText.optional(),
  shareImageId: z.string().nullable().optional(),
  noindex: z.boolean().optional(),
});

export const zPageCreateInput = z.object({
  title: zLText,
  slug: z.string().regex(/^([a-z0-9]+(?:-[a-z0-9]+)*)(\/[a-z0-9]+(?:-[a-z0-9]+)*)*$/, 'Use lowercase words separated by dashes').or(z.literal('')),
  kind: z.enum(PAGE_KINDS).default('STANDARD'),
  templateSlug: z.string().optional(),
});
export const zPageUpdateInput = z.object({
  title: zLText.optional(),
  slug: z.string().optional(),
  blocks: zBlockDrafts.optional(),
  seo: zSeoInput.optional(),
});
export const zPublishInput = z.object({ publishAt: z.string().datetime().nullable().optional() });

export const zRoomTypeInput = z.object({
  slug,
  name: zLText,
  tagline: zLText.default({}),
  description: zLRich.nullable().optional(),
  sleepsAdults: z.number().int().min(1).max(12),
  sleepsChildren: z.number().int().min(0).max(12).default(0),
  bedConfig: zLText.default({}),
  sizeSqm: z.number().int().min(1).max(1000).nullable().optional(),
  view: zLText.nullable().optional(),
  heroMediaId: z.string().nullable().optional(),
  galleryIds: z.array(z.string()).default([]),
  floorPlanMediaId: z.string().nullable().optional(),
  amenityIds: z.array(z.string()).default([]),
  fromPriceUgx: z.coerce.bigint().nullable().optional(),
  fromPriceUsd: z.coerce.bigint().nullable().optional(),
  status: z.enum(CONTENT_STATUSES).default('DRAFT'),
  seo: zSeoInput.default({}),
});

export const zAmenityInput = z.object({
  key: slug,
  name: zLText,
  icon: z.string().min(1).max(60),
  category: z.enum(AMENITY_CATEGORIES),
});

export const zFacilityInput = z.object({
  slug,
  name: zLText,
  summary: zLText.default({}),
  body: zLRich.nullable().optional(),
  icon: z.string().min(1).max(60),
  mediaIds: z.array(z.string()).default([]),
  status: z.enum(FACILITY_STATUSES).default('AVAILABLE'),
});

export const zRouteStopInput = z.object({
  id: z.string().optional(),
  name: zLText,
  note: zLText.nullable().optional(),
  minutesFromPrev: z.number().int().min(0).nullable().optional(),
  altitude: z.number().int().min(0).nullable().optional(),
  lat: z.number().nullable().optional(),
  lng: z.number().nullable().optional(),
});

export const zDestinationInput = z.object({
  slug,
  kind: z.enum(DESTINATION_KINDS),
  name: zLText,
  tagline: zLText.default({}),
  body: zLRich.nullable().optional(),
  blocks: zBlocks.default([]),
  heroMediaId: z.string().nullable().optional(),
  galleryIds: z.array(z.string()).default([]),
  lat: z.number().nullable().optional(),
  lng: z.number().nullable().optional(),
  distanceKm: z.number().int().min(0).nullable().optional(),
  driveMinutes: z.number().int().min(0).nullable().optional(),
  stops: z.array(zRouteStopInput).default([]),
  status: z.enum(CONTENT_STATUSES).default('DRAFT'),
  seo: zSeoInput.default({}),
});

export const zProgressInput = z.object({
  slug: slug.optional(),
  title: zLText,
  body: zLRich.nullable().optional(),
  happenedOn: isoDate,
  milestone: z.enum(MILESTONES).nullable().optional(),
  percentComplete: z.number().int().min(0).max(100).nullable().optional(),
  mediaIds: z.array(z.string()).default([]),
  status: z.enum(['DRAFT', 'PUBLISHED']).default('DRAFT'),
});

export const zFaqGroupInput = z.object({ key: slug, title: zLText });
export const zFaqItemInput = z.object({
  groupId: z.string(),
  question: zLText,
  answer: zLRich,
  isPublished: z.boolean().default(true),
});

export const zRedirectInput = z.object({
  fromPath: z.string().startsWith('/'),
  toPath: z.string().min(1),
  statusCode: z.union([z.literal(301), z.literal(302)]).default(301),
});

export interface NavItemInput {
  label: z.infer<typeof zLText>;
  target: (typeof NAV_TARGETS)[number];
  targetId?: string | null;
  url?: string | null;
  isVisible?: boolean;
  children?: NavItemInput[];
}
export const zNavItemInput: z.ZodType<NavItemInput> = z.lazy(() =>
  z.object({
    label: zLText,
    target: z.enum(NAV_TARGETS),
    targetId: z.string().nullable().optional(),
    url: z.string().nullable().optional(),
    isVisible: z.boolean().optional(),
    children: z.array(zNavItemInput).optional(),
  }),
) as z.ZodType<NavItemInput>;
export const zNavigationInput = z.object({ items: z.array(zNavItemInput) });

export const zReorderInput = z.object({ ids: z.array(z.string()).min(1) });

export const zSettingsPatch = z.record(z.string(), z.unknown());

export const zMediaPatch = z.object({
  alt: zLText.optional(),
  caption: zLText.nullable().optional(),
  credit: z.string().max(200).nullable().optional(),
  focalX: z.number().min(0).max(1).optional(),
  focalY: z.number().min(0).max(1).optional(),
  isRendering: z.boolean().optional(),
  tags: z.array(z.string().max(40)).optional(),
  folder: z.string().max(80).nullable().optional(),
});

/* ---------- Inbox & waitlist ---------- */

export const zConversationPatch = z.object({
  status: z.enum(CONVERSATION_STATUSES).optional(),
  intent: z.enum(INTENTS).optional(),
  assigneeId: z.string().nullable().optional(),
});
export const zMessageCreate = z.object({
  body: z.string().trim().min(1).max(5000),
  kind: z.enum(['REPLY', 'NOTE']).default('REPLY'),
});
export const zManualConversationInput = z.object({
  name: z.string().trim().min(2).max(120),
  phone: z.string().trim().max(40).optional(),
  email: z.string().trim().email().optional(),
  channel: z.enum(CHANNELS),
  intent: z.enum(INTENTS).default('GENERAL'),
  message: z.string().trim().min(1).max(5000),
});
export const zWaitlistPatch = z.object({
  status: z.enum(WAITLIST_STATUSES).optional(),
  priority: z.number().int().min(0).max(10).optional(),
  staffNotes: z.string().max(4000).nullable().optional(),
});

export const zListQuery = z.object({
  q: z.string().optional(),
  status: z.string().optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(30),
});
