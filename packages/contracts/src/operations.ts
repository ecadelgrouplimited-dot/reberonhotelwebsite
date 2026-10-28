import { z } from 'zod';
import type { CurrencyCode } from './booking.js';

// ───────────────────────── Enums & Constants ─────────────────────────

export const POS_OUTLET_TYPES = ['KITCHEN', 'BAR', 'HEALTH_CLUB', 'CONFERENCE'] as const;
export type PosOutletType = (typeof POS_OUTLET_TYPES)[number];

export const POS_ORDER_STATUSES = ['PENDING', 'PREPARING', 'READY', 'COMPLETED', 'CANCELLED'] as const;
export type PosOrderStatus = (typeof POS_ORDER_STATUSES)[number];

export const POS_PAYMENT_METHODS = ['CASH', 'MOBILE_MONEY', 'CARD', 'ROOM_FOLIO', 'BANK_TRANSFER'] as const;
export type PosPaymentMethod = (typeof POS_PAYMENT_METHODS)[number];

export const MEMBERSHIP_TIERS = ['DAILY_PASS', 'MONTHLY', 'ANNUAL', 'RESIDENT_GUEST'] as const;
export type MembershipTier = (typeof MEMBERSHIP_TIERS)[number];

export const HEALTH_CLUB_SERVICES = ['GYM_ONLY', 'STEAM_ONLY', 'SAUNA_ONLY', 'STEAM_SAUNA', 'FULL_COMBO'] as const;
export type HealthClubService = (typeof HEALTH_CLUB_SERVICES)[number];

export const QUOTATION_STATUSES = ['DRAFT', 'SENT', 'ACCEPTED', 'CONVERTED', 'DECLINED', 'EXPIRED'] as const;
export type QuotationStatus = (typeof QUOTATION_STATUSES)[number];

export const EVENT_TYPES = ['WEDDING', 'CONFERENCE', 'MEETING', 'WORKSHOP', 'RETREAT', 'BANQUET', 'GROUP_STAY', 'CUSTOM'] as const;
export type EventType = (typeof EVENT_TYPES)[number];

export const INVENTORY_CATEGORIES = ['LINEN_GYM', 'LINEN_ROOM', 'CONSUMABLE', 'BEVERAGE', 'FOOD_KITCHEN', 'FIXED_ASSET'] as const;
export type InventoryCategory = (typeof INVENTORY_CATEGORIES)[number];

export const STOCK_MOVEMENT_TYPES = ['STOCK_IN', 'STOCK_OUT', 'LAUNDRY_SEND', 'LAUNDRY_RETURN', 'DAMAGED_LOST', 'ADJUSTMENT'] as const;
export type StockMovementType = (typeof STOCK_MOVEMENT_TYPES)[number];

export const REQUISITION_STATUSES = ['PENDING', 'MANAGER_APPROVED', 'DIRECTOR_APPROVED', 'DISBURSED', 'REJECTED'] as const;
export type RequisitionStatus = (typeof REQUISITION_STATUSES)[number];

export const DEPARTMENTS = [
  'KITCHEN',
  'BAR',
  'HEALTH_CLUB',
  'HOUSEKEEPING',
  'FRONT_DESK',
  'CONFERENCE',
  'MAINTENANCE',
  'ENERGY_UTILITIES',
  'ADMIN_GENERAL',
] as const;
export type Department = (typeof DEPARTMENTS)[number];

export const EXPENSE_CATEGORIES = [
  'COGS_FOOD',
  'COGS_BEVERAGE',
  'UTILITIES_ELECTRICITY',
  'UTILITIES_DIESEL_FUEL',
  'UTILITIES_WATER_GAS',
  'MAINTENANCE_REPAIRS',
  'HOUSEKEEPING_AMENITIES',
  'STAFF_PAYROLL_WELFARE',
  'MARKETING_COMMISSIONS',
  'ADMIN_GENERAL',
] as const;
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

export const EXPENSE_PAYMENT_METHODS = [
  'CASH',
  'MOMO_MTN',
  'MOMO_AIRTEL',
  'BANK_TRANSFER',
  'CHEQUE',
  'CARD',
] as const;
export type ExpensePaymentMethod = (typeof EXPENSE_PAYMENT_METHODS)[number];

// ───────────────────────── POS & Outlets ─────────────────────────

export interface PosItemDTO {
  id: string;
  categoryId: string;
  sku: string;
  name: string;
  description: string | null;
  priceMinorUGX: string;
  priceMinorUSD: string | null;
  isAvailable: boolean;
  prepMinutes: number | null;
  inventoryItemId: string | null;
  stockOnHand?: number | null;
}

export interface PosCategoryDTO {
  id: string;
  outletId: string;
  name: string;
  sortOrder: number;
  items: PosItemDTO[];
}

export interface PosOutletDTO {
  id: string;
  code: string;
  name: string;
  type: PosOutletType;
  description: string | null;
  deviceStation: string | null;
  isActive: boolean;
  categories: PosCategoryDTO[];
}

export interface PosOrderItemDTO {
  id: string;
  itemId: string;
  itemName: string;
  quantity: number;
  unitPriceMinor: string;
  totalMinor: string;
  notes: string | null;
}

export interface PosOrderDTO {
  id: string;
  orderNumber: string;
  outletId: string;
  outletName: string;
  outletType: PosOutletType;
  reservationId: string | null;
  folioLineId: string | null;
  documentId: string | null;
  isSettled: boolean;
  tableOrRoom: string | null;
  customerName: string | null;
  customerPhone: string | null;
  status: PosOrderStatus;
  paymentMethod: PosPaymentMethod;
  currency: CurrencyCode;
  subtotalMinor: string;
  discountMinor: string;
  totalMinor: string;
  notes: string | null;
  servedByName: string | null;
  items: PosOrderItemDTO[];
  createdAt: string;
}

export interface PosInHouseGuestDTO {
  reservationId: string;
  code: string;
  status: string;
  guestName: string;
  guestPhone: string | null;
  roomNumber: string | null;
  roomTypeName: string | null;
}

export const zCreatePosOrderInput = z.object({
  outletId: z.string().uuid(),
  reservationId: z.string().uuid().optional().nullable(),
  tableOrRoom: z.string().trim().max(60).optional(),
  customerName: z.string().trim().max(120).optional(),
  customerPhone: z.string().trim().max(40).optional(),
  paymentMethod: z.enum(POS_PAYMENT_METHODS).default('CASH'),
  currency: z.enum(['UGX', 'USD']).default('UGX'),
  discountMinor: z.string().regex(/^\d+$/).default('0'),
  notes: z.string().trim().max(500).optional(),
  status: z.enum(POS_ORDER_STATUSES).optional(),
  settleNow: z.boolean().default(true),
  items: z.array(
    z.object({
      itemId: z.string().uuid(),
      quantity: z.number().int().min(1).max(500),
      notes: z.string().trim().max(200).optional(),
    }),
  ).min(1),
});

export const zAppendPosOrderItemsInput = z.object({
  notes: z.string().trim().max(500).optional(),
  items: z.array(
    z.object({
      itemId: z.string().uuid(),
      quantity: z.number().int().min(1).max(500),
      notes: z.string().trim().max(200).optional(),
    }),
  ).min(1),
});

export const zSettlePosOrderInput = z.object({
  paymentMethod: z.enum(POS_PAYMENT_METHODS),
  reservationId: z.string().uuid().optional().nullable(),
  discountMinor: z.string().regex(/^\d+$/).optional(),
  customerName: z.string().trim().max(120).optional(),
  customerPhone: z.string().trim().max(40).optional(),
});

export const zUpdatePosOrderStatusInput = z.object({
  status: z.enum(POS_ORDER_STATUSES),
});

export const zCreatePosCategoryInput = z.object({
  outletId: z.string().uuid(),
  name: z.string().trim().min(2).max(80),
  sortOrder: z.number().int().min(0).max(999).default(10),
});

export const zCreatePosItemInput = z.object({
  categoryId: z.string().uuid(),
  sku: z.string().trim().min(2).max(40),
  name: z.string().trim().min(2).max(140),
  description: z.string().trim().max(300).optional().nullable(),
  priceMinorUGX: z.string().regex(/^\d+$/),
  priceMinorUSD: z.string().regex(/^\d+$/).optional().nullable(),
  prepMinutes: z.number().int().min(0).max(240).optional().nullable(),
  inventoryItemId: z.string().uuid().optional().nullable(),
  isAvailable: z.boolean().default(true),
});

export const zTogglePosItemInput = z.object({
  isAvailable: z.boolean().optional(),
  name: z.string().trim().min(2).max(140).optional(),
  sku: z.string().trim().min(2).max(40).optional(),
  categoryId: z.string().uuid().optional(),
  description: z.string().trim().max(300).optional().nullable(),
  priceMinorUGX: z.string().regex(/^\d+$/).optional(),
  priceMinorUSD: z.string().regex(/^\d+$/).optional().nullable(),
  prepMinutes: z.number().int().min(0).max(240).optional().nullable(),
  inventoryItemId: z.string().uuid().optional().nullable(),
});

// ───────────────────────── Health Club & Spa ─────────────────────────

export interface HealthClubMembershipDTO {
  id: string;
  membershipNo: string;
  memberName: string;
  memberPhone: string;
  memberEmail: string | null;
  tier: MembershipTier;
  service: HealthClubService;
  currency: CurrencyCode;
  amountMinor: string;
  startDate: string;
  endDate: string;
  isActive: boolean;
  documentId: string | null;
  notes: string | null;
  visitsCount: number;
  createdAt: string;
}

export interface HealthClubAccessLogDTO {
  id: string;
  membershipId: string | null;
  membershipNo: string | null;
  reservationId: string | null;
  guestName: string;
  guestPhone: string | null;
  service: HealthClubService;
  tier: MembershipTier;
  currency: CurrencyCode;
  amountPaidMinor: string;
  paymentMethod: string | null;
  documentId: string | null;
  gymTowelsIssued: number;
  gymTowelsReturned: number;
  sandalsIssued: boolean;
  showerCapIssued: boolean;
  ropeIssued: boolean;
  lockerNumber: string | null;
  attendantName: string | null;
  checkedInAt: string;
  checkedOutAt: string | null;
}

export interface HealthClubDashboardDTO {
  memberships: HealthClubMembershipDTO[];
  accessLogs: HealthClubAccessLogDTO[];
  stats: {
    activeMembers: number;
    todayVisits: number;
    currentlyInside: number;
    towelsOutNow: number;
    todayRevenueUGX: string;
  };
}

export const zCreateMembershipInput = z.object({
  memberName: z.string().trim().min(2).max(120),
  memberPhone: z.string().trim().min(7).max(40),
  memberEmail: z.string().email().optional().or(z.literal('')),
  tier: z.enum(MEMBERSHIP_TIERS),
  service: z.enum(HEALTH_CLUB_SERVICES),
  currency: z.enum(['UGX', 'USD']).default('UGX'),
  amountMinor: z.string().regex(/^\d+$/),
  paymentMethod: z.enum(['CASH', 'MOBILE_MONEY', 'CARD', 'BANK_TRANSFER']).default('CASH'),
  notes: z.string().trim().max(400).optional(),
});

export const zCheckInHealthClubInput = z.object({
  membershipId: z.string().uuid().optional().nullable(),
  reservationId: z.string().uuid().optional().nullable(),
  guestName: z.string().trim().min(2).max(120),
  guestPhone: z.string().trim().max(40).optional(),
  service: z.enum(HEALTH_CLUB_SERVICES),
  tier: z.enum(MEMBERSHIP_TIERS).default('DAILY_PASS'),
  currency: z.enum(['UGX', 'USD']).default('UGX'),
  amountPaidMinor: z.string().regex(/^\d+$/).default('0'),
  paymentMethod: z.enum(['CASH', 'MOBILE_MONEY', 'CARD', 'ROOM_FOLIO', 'MEMBER_PASS']).default('CASH'),
  gymTowelsIssued: z.number().int().min(0).max(10).default(1),
  sandalsIssued: z.boolean().default(false),
  showerCapIssued: z.boolean().default(false),
  ropeIssued: z.boolean().default(false),
  lockerNumber: z.string().trim().max(20).optional(),
});

export const zCheckOutHealthClubInput = z.object({
  gymTowelsReturned: z.number().int().min(0).max(10),
});

// ───────────────────────── Quotations & Events ─────────────────────────

export interface QuotationLineDTO {
  id: string;
  category: string;
  description: string;
  quantity: number;
  unit: string;
  unitPriceMinor: string;
  totalMinor: string;
}

export interface QuotationDTO {
  id: string;
  number: string;
  clientName: string;
  clientOrganization: string | null;
  clientPhone: string;
  clientEmail: string | null;
  eventType: EventType;
  eventTitle: string;
  eventDate: string | null;
  endDate: string | null;
  attendees: number | null;
  hallSetup: string | null;
  validUntil: string;
  currency: CurrencyCode;
  subtotalMinor: string;
  discountMinor: string;
  taxMinor: string;
  totalMinor: string;
  status: QuotationStatus;
  notes: string | null;
  terms: string | null;
  convertedInvoiceId: string | null;
  createdByName: string | null;
  checkCode: string;
  lines: QuotationLineDTO[];
  createdAt: string;
}

export const zCreateQuotationInput = z.object({
  clientName: z.string().trim().min(2).max(120),
  clientOrganization: z.string().trim().max(120).optional(),
  clientPhone: z.string().trim().min(7).max(40),
  clientEmail: z.string().email().optional().or(z.literal('')),
  eventType: z.enum(EVENT_TYPES).default('CONFERENCE'),
  eventTitle: z.string().trim().min(3).max(180),
  eventDate: z.string().optional(),
  endDate: z.string().optional(),
  attendees: z.number().int().min(1).max(2000).optional(),
  hallSetup: z.string().trim().max(80).optional(),
  validDays: z.number().int().min(1).max(90).default(14),
  currency: z.enum(['UGX', 'USD']).default('UGX'),
  discountMinor: z.string().regex(/^\d+$/).default('0'),
  notes: z.string().trim().max(1000).optional(),
  terms: z.string().trim().max(1000).optional(),
  lines: z.array(
    z.object({
      category: z.string().trim().min(1).max(60).default('GENERAL'),
      description: z.string().trim().min(2).max(240),
      quantity: z.number().int().min(1).max(5000),
      unit: z.string().trim().max(30).default('PAX'),
      unitPriceMinor: z.string().regex(/^\d+$/),
    }),
  ).min(1),
});

export const zUpdateQuotationStatusInput = z.object({
  status: z.enum(QUOTATION_STATUSES),
});

export const zConvertQuotationToInvoiceInput = z.object({
  recordPaymentNow: z.boolean().default(false),
  paymentMethod: z.enum(['CASH', 'MOBILE_MONEY', 'CARD', 'BANK_TRANSFER']).optional(),
  paymentReference: z.string().trim().max(80).optional(),
});

// ───────────────────────── Inventory, Segregated Linen & Assets ─────────────────────────

export interface InventoryItemDTO {
  id: string;
  sku: string;
  name: string;
  category: InventoryCategory;
  department: Department;
  unit: string;
  onHand: number;
  inUseOrLaundry: number;
  parLevel: number;
  unitCostMinor: string;
  location: string | null;
  condition: string;
  isLowStock: boolean;
  updatedAt: string;
}

export interface StockMovementDTO {
  id: string;
  itemId: string;
  itemName: string;
  itemSku: string;
  category: InventoryCategory;
  type: StockMovementType;
  quantity: number;
  balanceAfter: number;
  department: string | null;
  reference: string | null;
  notes: string | null;
  recordedByName: string | null;
  createdAt: string;
}

export interface InventoryDashboardDTO {
  items: InventoryItemDTO[];
  movements: StockMovementDTO[];
  summary: {
    gymTowelsClean: number;
    gymTowelsInUseOrLaundry: number;
    roomTowelsClean: number;
    roomTowelsInUseOrLaundry: number;
    lowStockCount: number;
    totalFixedAssets: number;
  };
}

export const zRecordStockMovementInput = z.object({
  itemId: z.string().uuid(),
  type: z.enum(STOCK_MOVEMENT_TYPES),
  quantity: z.number().int().min(1).max(10000),
  department: z.string().trim().max(60).optional(),
  reference: z.string().trim().max(80).optional(),
  notes: z.string().trim().max(300).optional(),
});

export const zCreateInventoryItemInput = z.object({
  sku: z.string().trim().min(2).max(40),
  name: z.string().trim().min(2).max(140),
  category: z.enum(INVENTORY_CATEGORIES),
  department: z.enum(DEPARTMENTS),
  unit: z.string().trim().max(24).default('PIECE'),
  onHand: z.number().int().min(0).default(0),
  parLevel: z.number().int().min(0).default(10),
  unitCostMinor: z.string().regex(/^\d+$/).default('0'),
  location: z.string().trim().max(80).optional(),
});

// ───────────────────────── Requisitions & Internal Communications ─────────────────────────

export interface RequisitionItemDTO {
  id: string;
  inventoryItemId: string | null;
  itemName: string;
  unit: string;
  quantityRequested: number;
  quantityApproved: number | null;
  estimatedUnitMinor: string;
  totalEstimatedMinor: string;
}

export interface RequisitionDTO {
  id: string;
  number: string;
  department: Department;
  title: string;
  priority: string;
  status: RequisitionStatus;
  currency: CurrencyCode;
  totalEstimatedMinor: string;
  notes: string | null;
  rejectionReason: string | null;
  requestedByName: string;
  managerApprovedBy: string | null;
  managerApprovedAt: string | null;
  directorApprovedBy: string | null;
  directorApprovedAt: string | null;
  disbursedBy: string | null;
  disbursedAt: string | null;
  items: RequisitionItemDTO[];
  createdAt: string;
}

export const zCreateRequisitionInput = z.object({
  department: z.enum(DEPARTMENTS),
  title: z.string().trim().min(3).max(160),
  priority: z.enum(['LOW', 'NORMAL', 'URGENT']).default('NORMAL'),
  notes: z.string().trim().max(500).optional(),
  items: z.array(
    z.object({
      inventoryItemId: z.string().uuid().optional().nullable(),
      itemName: z.string().trim().min(2).max(140),
      unit: z.string().trim().max(24).default('PIECE'),
      quantityRequested: z.number().int().min(1).max(10000),
      estimatedUnitMinor: z.string().regex(/^\d+$/).default('0'),
    }),
  ).min(1),
});

export const zReviewRequisitionInput = z.object({
  action: z.enum(['MANAGER_APPROVE', 'DIRECTOR_APPROVE', 'DISBURSE', 'REJECT']),
  rejectionReason: z.string().trim().max(300).optional(),
});

export interface StaffAnnouncementDTO {
  id: string;
  department: Department | null;
  title: string;
  body: string;
  priority: string;
  authorName: string;
  authorRole: string | null;
  isPinned: boolean;
  createdAt: string;
}

export const zCreateAnnouncementInput = z.object({
  department: z.enum(DEPARTMENTS).optional().nullable(),
  title: z.string().trim().min(3).max(160),
  body: z.string().trim().min(3).max(2000),
  priority: z.enum(['NORMAL', 'IMPORTANT', 'HANDOVER']).default('NORMAL'),
  isPinned: z.boolean().default(false),
});

export interface TerminalDeviceDTO {
  id: string;
  code: string;
  name: string;
  department: Department;
  kind: string;
  paperSize: string;
  ipOrPort: string | null;
  status: string;
  lastSeenAt: string;
}

// ───────────────────────── Expenses & Cost Drivers ─────────────────────────

export interface ExpenseDTO {
  id: string;
  number: string;
  date: string;
  department: Department;
  category: ExpenseCategory;
  title: string;
  description: string | null;
  vendor: string | null;
  amountMinor: string;
  currency: CurrencyCode;
  paymentMethod: ExpensePaymentMethod;
  referenceNumber: string | null;
  receiptUrl: string | null;
  recordedByName: string;
  status: string;
  createdAt: string;
}

export const zCreateExpenseInput = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}/).optional(),
  department: z.enum(DEPARTMENTS),
  category: z.enum(EXPENSE_CATEGORIES),
  title: z.string().trim().min(2).max(180),
  description: z.string().trim().max(1000).optional().nullable(),
  vendor: z.string().trim().max(120).optional().nullable(),
  amountMinor: z.string().regex(/^\d+$/),
  currency: z.enum(['UGX', 'USD']).default('UGX'),
  paymentMethod: z.enum(EXPENSE_PAYMENT_METHODS).default('CASH'),
  referenceNumber: z.string().trim().max(80).optional().nullable(),
  receiptUrl: z.string().url().optional().nullable(),
});

