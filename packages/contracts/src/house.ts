import { z } from 'zod';
import { HK_STATUSES, type HkStatus } from './enums.js';
import { PAYMENT_METHODS, type CurrencyCode, type ReservationStatus, type ReservationSummaryDTO } from './booking.js';

/* Movement IV — the House: front desk, rack, housekeeping, guests, feedback, reports. */

export const HK_TASK_KINDS = ['DEPARTURE', 'STAYOVER', 'INSPECTION', 'DEEP_CLEAN', 'MAINTENANCE'] as const;
export type HkTaskKind = (typeof HK_TASK_KINDS)[number];
export const HK_TASK_STATUSES = ['TODO', 'IN_PROGRESS', 'DONE', 'INSPECTED', 'SKIPPED'] as const;
export type HkTaskStatus = (typeof HK_TASK_STATUSES)[number];
export const ROOM_BLOCK_REASONS = ['MAINTENANCE', 'OWNER_USE', 'STAFF', 'OUT_OF_ORDER'] as const;
export type RoomBlockReason = (typeof ROOM_BLOCK_REASONS)[number];
export const FEEDBACK_SCORES = ['GOOD', 'OK', 'BAD'] as const;
export type FeedbackScore = (typeof FEEDBACK_SCORES)[number];
export const FOLIO_CHARGE_KINDS = ['FNB', 'EXTRA', 'ADJUSTMENT'] as const;

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');
const minor = z.union([z.string().regex(/^\d+$/), z.number().int().nonnegative()]).transform((v) => BigInt(v));
const optText = (max: number) => z.string().trim().max(max).optional().or(z.literal('').transform(() => undefined));

/* ───────── Inputs ───────── */

const zPaymentTaken = z.object({ amount: minor, method: z.enum(PAYMENT_METHODS), reference: optText(80) });

export const zAssignRoomsInput = z.object({
  assignments: z.array(z.object({ reservationRoomId: z.string().uuid(), roomId: z.string().uuid() })).min(1).max(20),
  allowDirty: z.boolean().default(false),
});

export const zCheckInInput = z.object({
  assignments: zAssignRoomsInput.shape.assignments.optional(),
  allowDirty: z.boolean().default(false),
  payment: zPaymentTaken.optional(),
  idDocType: optText(40),
  idDocNumber: optText(60),
  nationality: optText(60),
});

export const zCheckOutInput = z.object({
  payment: zPaymentTaken.optional(),
  /** Owner/manager only: close with money still owed, and say why. */
  writeOffReason: optText(300),
  feedback: z.object({ score: z.enum(FEEDBACK_SCORES), comment: optText(2000) }).optional(),
});

export const zNoShowInput = z.object({ note: optText(300) });

export const zMoveRoomInput = z.object({ fromRoomId: z.string().uuid(), toRoomId: z.string().uuid(), reason: z.string().trim().min(3).max(200), allowDirty: z.boolean().default(false) });

export const zFolioChargeInput = z.object({
  kind: z.enum(FOLIO_CHARGE_KINDS),
  description: z.string().trim().min(2).max(160),
  amount: minor.refine((v) => v > 0n, 'More than zero'),
  /** A credit takes money off the bill (needs refund permission). */
  credit: z.boolean().default(false),
});

export const zHkStatusInput = z.object({ status: z.enum(HK_STATUSES), note: optText(300) });

export const zHkTaskPatch = z.object({
  status: z.enum(HK_TASK_STATUSES).optional(),
  assigneeId: z.string().uuid().nullable().optional(),
  notes: z.string().max(1000).nullable().optional(),
  priority: z.number().int().min(0).max(3).optional(),
});

export const zRoomBlockInput = z
  .object({ roomId: z.string().uuid(), fromDate: isoDate, toDate: isoDate, reason: z.enum(ROOM_BLOCK_REASONS), note: optText(300) })
  .refine((v) => v.fromDate < v.toDate, { path: ['toDate'], message: 'Must be after the start' });

export const zGuestPatch = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  phone: z.string().trim().max(40).nullable().optional(),
  email: z.string().trim().email().max(200).nullable().optional().or(z.literal('').transform(() => null)),
  country: z.string().trim().max(60).nullable().optional(),
  nationality: z.string().trim().max(60).nullable().optional(),
  idDocType: z.string().trim().max(40).nullable().optional(),
  idDocNumber: z.string().trim().max(60).nullable().optional(),
  preferredRoomTypeId: z.string().uuid().nullable().optional(),
  tags: z.array(z.string().trim().min(1).max(30)).max(12).optional(),
  guestNotes: z.string().max(4000).nullable().optional(),
  isVip: z.boolean().optional(),
});

export const zGuestMergeInput = z.object({ keepId: z.string().uuid(), mergeId: z.string().uuid() }).refine((v) => v.keepId !== v.mergeId, { message: 'Pick two different guests' });

export const zFeedbackInput = z.object({
  t: z.string().min(10).max(64),
  score: z.enum(FEEDBACK_SCORES),
  comment: optText(2000),
  allowPublic: z.boolean().default(false),
});

export const zReportQuery = z.object({ from: isoDate, to: isoDate }).refine((v) => v.from <= v.to, { path: ['to'], message: 'After the start' });

/* ───────── DTOs ───────── */

export interface AssignedRoomDTO {
  roomId: string;
  number: string;
}

export interface DeskStayDTO extends ReservationSummaryDTO {
  rooms: { reservationRoomId: string; roomTypeId: string; roomTypeName: string; quantity: number; assigned: AssignedRoomDTO[] }[];
  eta: string | null;
  staffNotes: string | null;
  guestNotes: string | null;
  contactId: string;
  /** Completed stays before this one. 0 = first time. */
  previousStays: number;
  isVip: boolean;
  checkedInAt: string | null;
  checkedOutAt: string | null;
}

export interface RackRoomDTO {
  id: string;
  number: string;
  floor: number;
  roomType: { id: string; name: string };
  hkStatus: HkStatus;
  isActive: boolean;
  notes: string | null;
  occupant: { reservationId: string; code: string; guestName: string; departure: string; departsToday: boolean } | null;
  arriving: { reservationId: string; code: string; guestName: string } | null;
  block: { id: string; reason: RoomBlockReason; fromDate: string; toDate: string; note: string | null } | null;
  task: { id: string; kind: HkTaskKind; status: HkTaskStatus } | null;
}

export interface DeskBoardDTO {
  date: string;
  arrivals: DeskStayDTO[];
  inHouse: DeskStayDTO[];
  departures: DeskStayDTO[];
  /** Confirmed arrivals from earlier days that never checked in. */
  lateArrivals: DeskStayDTO[];
  rooms: RackRoomDTO[];
  counts: { arrivals: number; arrived: number; departures: number; departed: number; inHouse: number; guestsInHouse: number; cleanVacant: number; dirty: number; outOfService: number };
}

/** What housekeeping sees. Deliberately no money, no phone numbers. */
export interface HkTaskDTO {
  id: string;
  date: string;
  kind: HkTaskKind;
  status: HkTaskStatus;
  priority: number;
  notes: string | null;
  room: { id: string; number: string; floor: number; roomTypeName: string; hkStatus: HkStatus };
  assignee: { id: string; name: string } | null;
  /** Someone is due into this room today: clean it first. */
  arrivalToday: boolean;
  guestFirstName: string | null;
  startedAt: string | null;
  completedAt: string | null;
  inspectedAt: string | null;
}

export interface HkBoardDTO {
  date: string;
  tasks: HkTaskDTO[];
  staff: { id: string; name: string }[];
  counts: Record<HkTaskStatus, number>;
}

export interface MoneyByCurrency {
  UGX: string;
  USD: string;
}

export interface GuestSummaryDTO {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  country: string | null;
  stays: number;
  nights: number;
  lastStay: string | null;
  nextStay: string | null;
  isVip: boolean;
  tags: string[];
  /** Present only for staff who may see money. */
  spent?: MoneyByCurrency;
}

export interface GuestProfileDTO extends GuestSummaryDTO {
  nationality: string | null;
  idDocType: string | null;
  idDocLast4: string | null;
  preferredRoomType: { id: string; name: string } | null;
  guestNotes: string | null;
  source: string;
  whatsappOptIn: boolean;
  createdAt: string;
  reservations: (ReservationSummaryDTO & { roomNumbers: string[] })[];
  feedback: { id: string; code: string; score: FeedbackScore; comment: string | null; createdAt: string }[];
  conversations: { id: string; subject: string | null; status: string; lastMessageAt: string }[];
  /** Other records that look like the same person. */
  possibleDuplicates: { id: string; name: string; phone: string | null; email: string | null; stays: number; why: string }[];
}

export interface FeedbackDTO {
  id: string;
  score: FeedbackScore;
  comment: string | null;
  allowPublic: boolean;
  published: boolean;
  handledAt: string | null;
  createdAt: string;
  reservation: { id: string; code: string; arrival: string; departure: string; status: ReservationStatus };
  guest: { id: string; name: string; country: string | null };
}

export interface DepartmentTrafficDTO {
  department: string;
  label: string;
  revenue: MoneyByCurrency;
  ordersCount: number;
  secondaryMetric?: string;
  sharePercent: number;
}

export interface ExpenseSummaryDTO {
  category: string;
  label: string;
  department: string;
  isDirectCost: boolean;
  amount: MoneyByCurrency;
  count: number;
}

export interface PaymentSettlementDTO {
  method: string;
  label: string;
  amount: MoneyByCurrency;
  count: number;
}

export interface HouseReportDTO {
  from: string;
  to: string;
  days: { date: string; available: number; sold: number; occupancy: number }[];
  totals: {
    roomNightsAvailable: number;
    roomNightsSold: number;
    occupancy: number;
    /** Room revenue recognised on stay nights, per currency (never converted). */
    roomRevenue: MoneyByCurrency;
    adr: MoneyByCurrency;
    revpar: MoneyByCurrency;
    otherRevenue: MoneyByCurrency;
    collected: MoneyByCurrency;
    averageStay: number;
    bookings: number;
    cancellations: number;
    noShows: number;
    returningGuests: number;
  };
  /** Entire hotel financial P&L summary across all outlets and expenses */
  financialSummary?: {
    totalGrossRevenue: MoneyByCurrency;
    costOfSales: MoneyByCurrency;
    grossProfit: MoneyByCurrency;
    operatingExpenses: MoneyByCurrency;
    grossOperatingProfit: MoneyByCurrency;
    trevpar: MoneyByCurrency;
    goppar: MoneyByCurrency;
  };
  /** Cross-departmental revenue and traffic breakdown */
  departments?: DepartmentTrafficDTO[];
  /** Breakdown of expenses and cost drivers */
  expenses?: {
    total: MoneyByCurrency;
    byCategory: ExpenseSummaryDTO[];
    byDepartment: { department: string; label: string; amount: MoneyByCurrency; count: number }[];
  };
  /** Inflow settlement reconciliation by payment rail */
  paymentReconciliation?: PaymentSettlementDTO[];
  sourceMix: { source: string; bookings: number; roomNights: number }[];
  roomTypes: { id: string; name: string; roomNightsSold: number; occupancy: number }[];
  leadTime: { bucket: string; bookings: number }[];
  feedback: Record<FeedbackScore, number>;
  currencyNote: string;
}

export type { CurrencyCode };
