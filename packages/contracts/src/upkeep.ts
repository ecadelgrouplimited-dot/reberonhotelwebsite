import { z } from 'zod';

/* ───────────────────────── Maintenance (work orders) ───────────────────────── */

export const WORK_ORDER_STATUSES = ['OPEN', 'IN_PROGRESS', 'ON_HOLD', 'DONE', 'CANCELLED'] as const;
export const WORK_ORDER_PRIORITIES = ['LOW', 'NORMAL', 'HIGH', 'URGENT'] as const;
export const WORK_ORDER_CATEGORIES = ['PLUMBING', 'ELECTRICAL', 'HOT_WATER', 'FURNITURE', 'APPLIANCE', 'WIFI_TV', 'DOORS_LOCKS', 'BUILDING', 'GROUNDS', 'OTHER'] as const;
export type WorkOrderStatus = (typeof WORK_ORDER_STATUSES)[number];
export type WorkOrderPriority = (typeof WORK_ORDER_PRIORITIES)[number];
export type WorkOrderCategory = (typeof WORK_ORDER_CATEGORIES)[number];

export const WORK_ORDER_CATEGORY_LABEL: Record<WorkOrderCategory, string> = {
  PLUMBING: 'Plumbing & leaks',
  ELECTRICAL: 'Electrical & lights',
  HOT_WATER: 'Hot water & heating',
  FURNITURE: 'Furniture & fittings',
  APPLIANCE: 'Appliances',
  WIFI_TV: 'Wi-Fi, TV & phone',
  DOORS_LOCKS: 'Doors, locks & keys',
  BUILDING: 'Walls, roof & windows',
  GROUNDS: 'Grounds & outdoor',
  OTHER: 'Something else',
};
/** How soon each priority should be fixed (hours); drives "overdue". */
export const WORK_ORDER_TARGET_HOURS: Record<WorkOrderPriority, number> = { URGENT: 4, HIGH: 24, NORMAL: 72, LOW: 168 };

const optText = (max: number) => z.string().trim().max(max).optional().or(z.literal('').transform(() => undefined));
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');

export const zWorkOrderCreate = z
  .object({
    title: z.string().trim().min(3, 'Say what is wrong').max(140),
    details: optText(2000),
    category: z.enum(WORK_ORDER_CATEGORIES).default('OTHER'),
    priority: z.enum(WORK_ORDER_PRIORITIES).default('NORMAL'),
    roomId: z.string().uuid().optional(),
    location: optText(120),
    /** Take the room off sale until this business date (exclusive), straight away. Needs maintenance:manage. */
    outOfServiceUntil: isoDate.optional(),
  })
  .refine((v) => v.roomId || v.location, { path: ['location'], message: 'Pick a room or say where' });

export const zWorkOrderPatch = z.object({
  title: z.string().trim().min(3).max(140).optional(),
  details: z.string().trim().max(2000).nullable().optional(),
  category: z.enum(WORK_ORDER_CATEGORIES).optional(),
  priority: z.enum(WORK_ORDER_PRIORITIES).optional(),
  assignedToId: z.string().uuid().nullable().optional(),
  dueAt: z.string().datetime().nullable().optional(),
});

export const zWorkOrderStatus = z
  .object({
    status: z.enum(WORK_ORDER_STATUSES),
    /** What was done (required to finish) or why it waits / was cancelled. */
    note: optText(1000),
    /** Parts and labour, minor units, in the hotel's currency. */
    costMinor: z.string().regex(/^\d+$/).optional(),
    currency: z.enum(['UGX', 'USD']).optional(),
  })
  .refine((v) => v.status !== 'DONE' || !!v.note, { path: ['note'], message: 'Say what was done' })
  .refine((v) => !['ON_HOLD', 'CANCELLED'].includes(v.status) || !!v.note, { path: ['note'], message: 'Say why' });

export const zWorkOrderNote = z.object({ body: z.string().trim().min(1).max(2000) });
export const zWorkOrderOutOfService = z.object({ until: isoDate, note: optText(300) });

export interface WorkOrderNoteDTO {
  id: string;
  authorName: string;
  body: string;
  kind: 'NOTE' | 'EVENT';
  createdAt: string;
}

export interface WorkOrderDTO {
  id: string;
  number: string;
  title: string;
  details: string | null;
  category: WorkOrderCategory;
  priority: WorkOrderPriority;
  status: WorkOrderStatus;
  room: { id: string; number: string } | null;
  location: string | null;
  reportedByName: string;
  reportedById: string | null;
  assignedToId: string | null;
  assignedToName: string | null;
  /** The room is off sale for this work, until this date (exclusive). */
  outOfService: { blockId: string; until: string } | null;
  dueAt: string | null;
  overdue: boolean;
  startedAt: string | null;
  completedAt: string | null;
  resolution: string | null;
  costMinor: string | null;
  currency: string | null;
  createdAt: string;
  updatedAt: string;
  notes?: WorkOrderNoteDTO[];
}

export interface WorkOrderListDTO {
  items: WorkOrderDTO[];
  counts: { open: number; urgent: number; overdue: number; mine: number; outOfService: number; doneThisWeek: number };
  /** People who can be given work. */
  assignees: { id: string; name: string; jobTitle: string | null }[];
  rooms: { id: string; number: string }[];
}

/* ───────────────────────── Lost and found ───────────────────────── */

export const LOST_ITEM_STATUSES = ['STORED', 'RETURNED', 'DISPOSED'] as const;
export const LOST_ITEM_CATEGORIES = ['ELECTRONICS', 'CLOTHING', 'JEWELLERY', 'DOCUMENTS', 'MONEY', 'KEYS', 'BAG', 'TOILETRIES', 'OTHER'] as const;
export type LostItemStatus = (typeof LOST_ITEM_STATUSES)[number];
export type LostItemCategory = (typeof LOST_ITEM_CATEGORIES)[number];
export const LOST_ITEM_CATEGORY_LABEL: Record<LostItemCategory, string> = {
  ELECTRONICS: 'Phone, charger or electronics',
  CLOTHING: 'Clothing & shoes',
  JEWELLERY: 'Jewellery & watches',
  DOCUMENTS: 'Passport, ID or papers',
  MONEY: 'Money or cards',
  KEYS: 'Keys',
  BAG: 'Bag or luggage',
  TOILETRIES: 'Toiletries & glasses',
  OTHER: 'Something else',
};
/** Kept in the safe, and held longer. */
export const VALUABLE_CATEGORIES: LostItemCategory[] = ['ELECTRONICS', 'JEWELLERY', 'DOCUMENTS', 'MONEY'];
/** Days an item is held before it may be disposed of. */
export const LOST_ITEM_HOLD_DAYS = { valuable: 180, other: 90 } as const;

export const zLostItemCreate = z.object({
  description: z.string().trim().min(3, 'Describe it').max(300),
  category: z.enum(LOST_ITEM_CATEGORIES).default('OTHER'),
  foundAt: z.string().datetime().optional(),
  foundWhere: z.string().trim().min(2, 'Say where it was found').max(120),
  roomId: z.string().uuid().optional(),
  storedAt: z.string().trim().min(2, 'Say where it is kept').max(120),
  reservationId: z.string().uuid().optional(),
  guestName: optText(120),
  guestContact: optText(120),
  notes: optText(1000),
});
export const zLostItemPatch = z.object({
  description: z.string().trim().min(3).max(300).optional(),
  category: z.enum(LOST_ITEM_CATEGORIES).optional(),
  foundWhere: z.string().trim().min(2).max(120).optional(),
  storedAt: z.string().trim().min(2).max(120).optional(),
  reservationId: z.string().uuid().nullable().optional(),
  guestName: z.string().trim().max(120).nullable().optional(),
  guestContact: z.string().trim().max(120).nullable().optional(),
  notes: z.string().trim().max(1000).nullable().optional(),
});
export const zLostItemReturn = z.object({
  returnedTo: z.string().trim().min(2, 'Who collected it?').max(120),
  method: z.enum(['IN_PERSON', 'COURIER', 'POST', 'GUEST_REPRESENTATIVE']),
  /** For valuables: how the owner was confirmed (ID seen, booking matched…). */
  proof: optText(300),
  note: optText(500),
});
export const zLostItemDispose = z.object({
  method: z.enum(['DONATED', 'DESTROYED', 'POLICE', 'STAFF_CLAIM']),
  note: optText(500),
});

export interface LostItemDTO {
  id: string;
  number: string;
  description: string;
  category: LostItemCategory;
  valuable: boolean;
  foundAt: string;
  foundWhere: string;
  room: { id: string; number: string } | null;
  foundByName: string;
  storedAt: string;
  holdUntil: string;
  /** Hold period over and still here. */
  due: boolean;
  status: LostItemStatus;
  reservation: { id: string; code: string; guestName: string } | null;
  guestName: string | null;
  guestContact: string | null;
  returnedAt: string | null;
  returnedTo: string | null;
  returnMethod: string | null;
  handledByName: string | null;
  disposedAt: string | null;
  disposalMethod: string | null;
  notes: string | null;
  createdAt: string;
}

export interface LostItemListDTO {
  items: LostItemDTO[];
  counts: { stored: number; valuables: number; due: number; returnedThisMonth: number };
  rooms: { id: string; number: string }[];
}

/** Who stayed in a room around a date — the likely owner of something found there. */
export interface LikelyOwnerDTO {
  reservationId: string;
  code: string;
  guestName: string;
  guestPhone: string | null;
  guestEmail: string | null;
  fromDate: string;
  toDate: string;
  status: string;
}
