import { z } from 'zod';
import { zLText, zLRich } from './localized.js';
import type { LText } from './text.js';
import type { MediaRef } from './dto.js';

/* Movement II — the Door. Money travels as minor-unit strings. */

export const CURRENCY_CODES = ['UGX', 'USD'] as const;
export type CurrencyCode = (typeof CURRENCY_CODES)[number];
export const RESERVATION_STATUSES = ['HELD', 'CONFIRMED', 'IN_HOUSE', 'CHECKED_OUT', 'CANCELLED', 'NO_SHOW', 'EXPIRED'] as const;
export type ReservationStatus = (typeof RESERVATION_STATUSES)[number];
export const RESERVATION_SOURCES = ['DIRECT', 'WHATSAPP', 'WALK_IN', 'PHONE', 'PORTAL'] as const;
export const PAYMENT_METHODS = ['MOBILE_MONEY', 'CARD', 'CASH', 'BANK', 'UNKNOWN'] as const;
export const EXTRA_KINDS = ['TRANSFER', 'GUIDE', 'MEAL', 'BED', 'LATE_CHECKOUT', 'EXPERIENCE', 'OTHER'] as const;
export const EXTRA_UNITS = ['PER_STAY', 'PER_NIGHT', 'PER_PERSON', 'PER_TRIP'] as const;
export const MEAL_PLANS = ['RO', 'BB', 'HB', 'FB'] as const;

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');
const minor = z.union([z.string().regex(/^\d+$/), z.number().int().nonnegative()]).transform((v) => BigInt(v));

/* ───────── Public ───────── */

export const zAvailabilityQuery = z
  .object({
    arrival: isoDate,
    departure: isoDate,
    adults: z.coerce.number().int().min(1).max(12).default(2),
    children: z.coerce.number().int().min(0).max(12).default(0),
    currency: z.enum(CURRENCY_CODES).default('UGX'),
  })
  .refine((v) => v.arrival < v.departure, { message: 'Departure must be after arrival', path: ['departure'] });
export type AvailabilityQuery = z.infer<typeof zAvailabilityQuery>;

export interface NightPrice {
  date: string;
  amountMinor: string;
}

export interface OfferPlanDTO {
  ratePlanId: string;
  code: string;
  name: LText;
  description: LText;
  mealPlan: (typeof MEAL_PLANS)[number];
  depositPercent: number;
  cancellation: LText;
  nightly: NightPrice[];
  totalMinor: string;
  depositMinor: string;
}

export interface OfferDTO {
  roomType: { id: string; slug: string; name: LText; tagline: LText; sleepsAdults: number; sleepsChildren: number; bedConfig: LText; hero: MediaRef | null };
  available: number;
  roomsNeeded: number;
  plans: OfferPlanDTO[];
  /** Why it cannot be sold for these dates, when plans is empty */
  unavailableReason: string | null;
}

export interface AvailabilityDTO {
  arrival: string;
  departure: string;
  nights: number;
  currency: CurrencyCode;
  offers: OfferDTO[];
  extras: ExtraDTO[];
  taxNote: LText;
}

export interface ExtraDTO {
  id: string;
  slug: string;
  name: LText;
  summary: LText;
  kind: (typeof EXTRA_KINDS)[number];
  unit: (typeof EXTRA_UNITS)[number];
  price: { ugx: string; usd: string | null };
  isExperience: boolean;
}

export const zBookingInput = z.object({
  arrival: isoDate,
  departure: isoDate,
  adults: z.coerce.number().int().min(1).max(12),
  children: z.coerce.number().int().min(0).max(12).default(0),
  currency: z.enum(CURRENCY_CODES),
  roomTypeId: z.string().uuid(),
  ratePlanId: z.string().uuid(),
  rooms: z.coerce.number().int().min(1).max(10).default(1),
  extras: z.array(z.object({ extraId: z.string().uuid(), quantity: z.coerce.number().int().min(1).max(20) })).max(10).default([]),
  payInFull: z.boolean().default(false),
  payAtPremises: z.boolean().default(false),
  guest: z.object({
    name: z.string().trim().min(2, 'Tell us your name').max(120),
    phone: z.string().trim().min(7, 'A phone number, please').max(40),
    email: z.string().trim().email('That email looks incomplete').max(200),
    country: z.string().max(60).optional(),
  }),
  eta: z.string().max(40).optional(),
  notes: z.string().max(1000).optional(),
  /** Movement III: the anonymous tour session, when the guest walked a tour first. */
  tourSessionId: z.string().regex(/^[A-Za-z0-9_-]{12,64}$/).optional(),
  consent: z.literal(true, { error: 'Please accept the booking terms' }),
});
export type BookingInput = z.input<typeof zBookingInput>;

export interface BookingStartedDTO {
  code: string;
  status: ReservationStatus;
  holdExpiresAt: string | null;
  payment: { merchantReference: string; redirectUrl: string; amountMinor: string; currency: CurrencyCode; provider: 'PESAPAL' | 'TEST' | 'PREMISES' };
  /** Secret the browser keeps to read its own booking */
  accessToken: string;
}

export const zStayVerify = z.object({ code: z.string().trim().toUpperCase(), phone: z.string().trim().min(7).max(40), otp: z.string().trim().regex(/^\d{6}$/, 'Six digits') });
export const zStayLookup = z.object({ code: z.string().trim().toUpperCase().regex(/^RB-[2-9A-Z]{5}$/, 'Codes look like RB-7K3QX'), phone: z.string().trim().min(7).max(40) });

export interface GuestStayDTO {
  code: string;
  status: ReservationStatus;
  arrival: string;
  departure: string;
  nights: number;
  adults: number;
  children: number;
  guestName: string;
  currency: CurrencyCode;
  totalMinor: string;
  paidMinor: string;
  balanceMinor: string;
  holdExpiresAt: string | null;
  rooms: { name: LText; quantity: number; hero: MediaRef | null }[];
  ratePlan: { name: LText; mealPlan: string };
  extras: { name: LText; quantity: number; totalMinor: string }[];
  cancellation: LText;
  checkIn: string;
  checkOut: string;
  payments: { amountMinor: string; status: string; method: string; paidAt: string | null }[];
  canPayBalance: boolean;
  /** Movement IV: after (or during) the stay the guest may tell us how it was. */
  canGiveFeedback: boolean;
  feedback: { score: 'GOOD' | 'OK' | 'BAD'; comment: string | null; allowPublic: boolean } | null;
  /** Receipts, refund notes and invoices the guest can open and print. */
  documents: { kind: 'RECEIPT' | 'REFUND' | 'INVOICE'; number: string; amountMinor: string; issuedAt: string; url: string }[];
}

/* ───────── Admin ───────── */

export const zRatePlanInput = z.object({
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9_]{2,20}$/),
  name: zLText,
  description: zLText.default({}),
  mealPlan: z.enum(MEAL_PLANS).default('BB'),
  minNights: z.number().int().min(1).max(60).default(1),
  depositPercent: z.number().int().min(0).max(100).default(30),
  cancellationPolicyId: z.string().uuid().nullable().optional(),
  isActive: z.boolean().default(true),
  isPublic: z.boolean().default(true),
});

export const zRateBulkInput = z.object({
  ratePlanId: z.string().uuid(),
  roomTypeIds: z.array(z.string().uuid()).min(1),
  from: isoDate,
  to: isoDate,
  weekdays: z.array(z.number().int().min(0).max(6)).min(1).default([0, 1, 2, 3, 4, 5, 6]),
  ugx: minor.nullable().optional(),
  usd: minor.nullable().optional(),
});

export const zInventoryPatch = z.object({
  roomTypeIds: z.array(z.string().uuid()).min(1),
  from: isoDate,
  to: isoDate,
  stopSell: z.boolean().optional(),
  closedToArrival: z.boolean().optional(),
  minStay: z.number().int().min(1).max(30).nullable().optional(),
  blockedRooms: z.number().int().min(0).max(50).optional(),
  note: z.string().max(200).nullable().optional(),
});

export const zExtraInput = z.object({
  slug: z.string().regex(/^[a-z0-9-]+$/),
  name: zLText,
  summary: zLText.default({}),
  kind: z.enum(EXTRA_KINDS),
  unit: z.enum(EXTRA_UNITS).default('PER_STAY'),
  priceUgx: minor,
  priceUsd: minor.nullable().optional(),
  isExperience: z.boolean().default(false),
  status: z.enum(['DRAFT', 'PUBLISHED', 'HIDDEN']).default('PUBLISHED'),
});

export const zPackageInput = z.object({
  slug: z.string().regex(/^[a-z0-9-]+$/),
  name: zLText,
  summary: zLText.default({}),
  body: zLRich.nullable().optional(),
  nights: z.number().int().min(1).max(30).default(1),
  inclusions: z.array(zLText).default([]),
  heroMediaId: z.string().uuid().nullable().optional(),
  galleryIds: z.array(z.string()).default([]),
  priceUgx: minor.nullable().optional(),
  priceUsd: minor.nullable().optional(),
  status: z.enum(['DRAFT', 'PUBLISHED', 'HIDDEN']).default('DRAFT'),
});

export const zManualReservationInput = zBookingInput
  .omit({ consent: true, payInFull: true, payAtPremises: true, guest: true })
  .extend({
    source: z.enum(RESERVATION_SOURCES).default('PHONE'),
    guest: z.object({ name: z.string().trim().min(2).max(120), phone: z.string().trim().min(7).max(40), email: z.string().trim().email().max(200).optional().or(z.literal('').transform(() => undefined)) }),
    confirmNow: z.boolean().default(false),
    staffNotes: z.string().max(2000).optional(),
    fromWaitlistId: z.string().uuid().optional(),
  });

export const zRecordPaymentInput = z.object({
  amount: minor,
  method: z.enum(PAYMENT_METHODS),
  reference: z.string().max(80).optional(),
  note: z.string().max(300).optional(),
});

export const zCancelInput = z.object({ reason: z.string().trim().min(3).max(300), waivePenalty: z.boolean().default(false) });
export const zReservationPatch = z.object({ staffNotes: z.string().max(4000).nullable().optional(), eta: z.string().max(40).nullable().optional() });

export interface ReservationSummaryDTO {
  id: string;
  code: string;
  status: ReservationStatus;
  source: string;
  guest: { name: string; phone: string | null; email: string | null };
  arrival: string;
  departure: string;
  nights: number;
  adults: number;
  children: number;
  roomSummary: string;
  currency: CurrencyCode;
  totalMinor: string;
  paidMinor: string;
  balanceMinor: string;
  holdExpiresAt: string | null;
  createdAt: string;
}
