import type { PrismaClient } from '@reberon/db';

/** Who hears about what: the owner-editable alert rules behind live pop-ups, sounds, emails and Web Push. */
export type NotificationRule = ReturnType<typeof defaultNotificationRules>[number];

export function defaultNotificationRules() {
  return [
      {
        id: 'NEW_BOOKING',
        label: 'New Booking / Reservation Received',
        description: 'Fires immediately when a new online or walk-in reservation is created or confirmed.',
        category: 'FRONT_DESK',
        urgency: 'HIGH',
        roles: ['DESK', 'MANAGER', 'OWNER'],
        recipientUserIds: [] as string[],
        customEmails: [] as string[],
        popupEnabled: true,
        soundEnabled: true,
        soundTone: 'booking',
        emailEnabled: true,
      },
      {
        id: 'GUEST_CHECK_OUT',
        label: 'Guest Check-Out & Room Turnover Alert',
        description: 'Fires immediately when a guest checks out — notifies Front Desk, Head of Housekeeping, and Hotel Hierarchy.',
        category: 'HOUSEKEEPING',
        urgency: 'CRITICAL',
        roles: ['HOUSEKEEPING', 'DESK', 'MANAGER', 'OWNER', 'ACCOUNTANT'],
        recipientUserIds: [] as string[],
        customEmails: [] as string[],
        popupEnabled: true,
        soundEnabled: true,
        soundTone: 'checkout',
        emailEnabled: true,
      },
      {
        id: 'GUEST_CHECK_IN',
        label: 'Guest Check-In Completed',
        description: 'Fires when a guest is checked into their assigned room at the Front Desk.',
        category: 'FRONT_DESK',
        urgency: 'NORMAL',
        roles: ['DESK', 'MANAGER', 'HOUSEKEEPING'],
        recipientUserIds: [] as string[],
        customEmails: [] as string[],
        popupEnabled: true,
        soundEnabled: true,
        soundTone: 'soft',
        emailEnabled: false,
      },
      {
        id: 'HOUSEKEEPING_URGENT',
        label: 'Housekeeping Queue · Dirty Room or Inspection Ready',
        description: 'Alerts Head of Housekeeping and Front Desk when rooms need immediate cleaning or supervisor inspection.',
        category: 'HOUSEKEEPING',
        urgency: 'HIGH',
        roles: ['HOUSEKEEPING', 'DESK', 'MANAGER'],
        recipientUserIds: [] as string[],
        customEmails: [] as string[],
        popupEnabled: true,
        soundEnabled: true,
        soundTone: 'ding',
        emailEnabled: false,
      },
      {
        id: 'POS_WAITING_BILL',
        label: 'POS Order Opened · Waiting Payment / Kitchen Prep',
        description: 'Fires when a waiter holds a new bill or sends a round to Kitchen & Bar.',
        category: 'POS',
        urgency: 'HIGH',
        roles: ['KITCHEN', 'BAR', 'DESK', 'MANAGER'],
        recipientUserIds: [] as string[],
        customEmails: [] as string[],
        popupEnabled: true,
        soundEnabled: true,
        soundTone: 'pos',
        emailEnabled: false,
      },
      {
        id: 'POS_PAYMENT_CONFIRMED',
        label: 'POS Payment Confirmed & Final Receipt Issued',
        description: 'Fires when the cashier confirms payment on a waiting bill and closes the transaction.',
        category: 'POS',
        urgency: 'NORMAL',
        roles: ['DESK', 'ACCOUNTANT', 'MANAGER', 'OWNER'],
        recipientUserIds: [] as string[],
        customEmails: [] as string[],
        popupEnabled: true,
        soundEnabled: true,
        soundTone: 'register',
        emailEnabled: false,
      },
      {
        id: 'URGENT_REQUISITION_STOCK',
        label: 'Urgent Store Requisition or Low Stock Alert',
        description: 'Alerts management and accounts when an urgent department requisition or stock shortage occurs.',
        category: 'OPERATIONS',
        urgency: 'CRITICAL',
        roles: ['MANAGER', 'OWNER', 'ACCOUNTANT'],
        recipientUserIds: [] as string[],
        customEmails: [] as string[],
        popupEnabled: true,
        soundEnabled: true,
        soundTone: 'urgent',
        emailEnabled: true,
      },
      {
        id: 'GUEST_INQUIRY_FEEDBACK',
        label: 'New Guest Enquiry, Waitlist or Stay Issue',
        description: 'Alerts Front Desk and Management when a guest submits a website inquiry or stay issue.',
        category: 'FRONT_DESK',
        urgency: 'HIGH',
        roles: ['DESK', 'MANAGER', 'OWNER'],
        recipientUserIds: [] as string[],
        customEmails: [] as string[],
        popupEnabled: true,
        soundEnabled: true,
        soundTone: 'soft',
        emailEnabled: true,
      },
    ];
}

export async function loadNotificationRules(prisma: Pick<PrismaClient, 'setting'>): Promise<NotificationRule[]> {
  const row = await prisma.setting.findUnique({ where: { key: 'notifications.rules' } });
  const defaults = defaultNotificationRules();
  if (!row || !Array.isArray(row.value)) return defaults;
  const savedMap = new Map((row.value as Record<string, unknown>[]).map((r) => [String(r.id), r]));
  return defaults.map((def) => {
    const s = savedMap.get(def.id);
    if (!s) return def;
    return {
      ...def,
      roles: Array.isArray(s.roles) ? (s.roles as string[]) : def.roles,
      recipientUserIds: Array.isArray(s.recipientUserIds) ? (s.recipientUserIds as string[]) : def.recipientUserIds,
      customEmails: Array.isArray(s.customEmails) ? (s.customEmails as string[]) : def.customEmails,
      popupEnabled: typeof s.popupEnabled === 'boolean' ? s.popupEnabled : def.popupEnabled,
      soundEnabled: typeof s.soundEnabled === 'boolean' ? s.soundEnabled : def.soundEnabled,
      soundTone: typeof s.soundTone === 'string' ? s.soundTone : def.soundTone,
      emailEnabled: typeof s.emailEnabled === 'boolean' ? s.emailEnabled : def.emailEnabled,
    };
  });
}

/** Which rule an audited action belongs to. */
export function ruleIdForAction(action: string): string {
  if (action.includes('check_out')) return 'GUEST_CHECK_OUT';
  if (action.includes('check_in')) return 'GUEST_CHECK_IN';
  if (action.includes('reservation') || action.includes('booking')) return 'NEW_BOOKING';
  if (action.includes('housekeeping') || action.includes('hk') || action.includes('room')) return 'HOUSEKEEPING_URGENT';
  if (action.includes('pos.settle') || action.includes('payment')) return 'POS_PAYMENT_CONFIRMED';
  if (action.includes('pos')) return 'POS_WAITING_BILL';
  if (action.includes('requisition') || action.includes('inventory')) return 'URGENT_REQUISITION_STOCK';
  return 'GUEST_INQUIRY_FEEDBACK';
}

/** Where tapping an alert should land. */
export function hrefForAction(action: string, entityType: string | null, entityId: string | null): string {
  if (entityType === 'Reservation' && entityId) return `/reservations/${entityId}`;
  if (action.includes('check_out') || action.includes('housekeeping') || action.includes('hk')) return '/housekeeping';
  if (action.includes('desk') || action.includes('check_in')) return '/desk';
  if (action.includes('pos')) return '/pos';
  if (action.includes('requisition')) return '/requisitions';
  if (action.includes('inventory')) return '/inventory';
  return '/';
}
