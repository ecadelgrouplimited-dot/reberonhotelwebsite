'use client';
import { useQuery } from '@tanstack/react-query';
import type { AdminPulseDTO } from '@reberon/contracts';
import { get } from '@/lib/api';
import type { NavBadgeKey } from './nav';

export interface BadgeInfo {
  count: number;
  tone: 'red' | 'amber' | 'green' | 'neutral';
  tooltip: string;
}

export function useAdminPulse(enabled: boolean) {
  return useQuery({
    queryKey: ['admin-pulse'],
    queryFn: () => get<AdminPulseDTO>('/pulse'),
    enabled,
    refetchInterval: 25_000,
  });
}

export function computeBadges(pulse?: AdminPulseDTO): Partial<Record<NavBadgeKey, BadgeInfo>> {
  if (!pulse) return {};
  const map: Partial<Record<NavBadgeKey, BadgeInfo>> = {};

  // 1. Command & Comms — Amber for pending triage, Neutral for passive open threads, Red strictly for failures
  if (pulse.inbox.newCount > 0) {
    map.inbox = {
      count: pulse.inbox.newCount,
      tone: 'amber',
      tooltip: `${pulse.inbox.newCount} new unread enquiries (${pulse.inbox.openCount} open total)`,
    };
  } else if (pulse.inbox.openCount > 0) {
    map.inbox = {
      count: pulse.inbox.openCount,
      tone: 'neutral',
      tooltip: `${pulse.inbox.openCount} active threads · all new enquiries triaged`,
    };
  }

  if (pulse.waitlist.newCount > 0) {
    map.waitlist = {
      count: pulse.waitlist.newCount,
      tone: 'amber',
      tooltip: `${pulse.waitlist.newCount} uncontacted first-stay signups (${pulse.waitlist.totalActive} active)`,
    };
  } else if (pulse.waitlist.totalActive > 0) {
    map.waitlist = {
      count: pulse.waitlist.totalActive,
      tone: 'neutral',
      tooltip: `${pulse.waitlist.totalActive} waitlist signups contacted`,
    };
  }

  if (pulse.cms.failedOutboundMessages24h > 0) {
    map.messages = {
      count: pulse.cms.failedOutboundMessages24h,
      tone: 'red',
      tooltip: `${pulse.cms.failedOutboundMessages24h} failed outbound messages in the last 24h`,
    };
  }

  // 2. Front Desk & Stays — Red only if overdue arrivals; Amber for scheduled check-in/out tasks; Green for in-house
  const deskActionCount =
    pulse.desk.arrivalsToday +
    pulse.desk.lateArrivals +
    pulse.desk.departuresToday +
    pulse.desk.pendingGuestRequests;
  if (deskActionCount > 0) {
    map.desk = {
      count: deskActionCount,
      tone: pulse.desk.lateArrivals > 0 ? 'red' : 'amber',
      tooltip: `${pulse.desk.arrivalsToday} arrivals, ${pulse.desk.departuresToday} departures, ${pulse.desk.lateArrivals} overdue, ${pulse.desk.pendingGuestRequests} guest requests`,
    };
  } else if (pulse.desk.inHouse > 0) {
    map.desk = {
      count: pulse.desk.inHouse,
      tone: 'green',
      tooltip: `${pulse.desk.inHouse} stays (${pulse.desk.guestsInHouse} guests) currently in-house`,
    };
  }

  if (pulse.reservations.heldCount > 0) {
    map.reservations = {
      count: pulse.reservations.heldCount,
      tone: 'amber',
      tooltip: `${pulse.reservations.heldCount} held booking(s) awaiting payment · ${pulse.reservations.confirmedCount} confirmed`,
    };
  } else if (pulse.reservations.confirmedCount > 0) {
    map.reservations = {
      count: pulse.reservations.confirmedCount,
      tone: 'neutral',
      tooltip: `${pulse.reservations.confirmedCount} confirmed reservation(s)`,
    };
  }

  if (pulse.rooms.totalActive > 0 && pulse.rooms.vacantClean === 0) {
    map.rack = {
      count: pulse.rooms.occupied,
      tone: 'red',
      tooltip: `0 vacant clean rooms ready · ${pulse.rooms.occupied} occupied`,
    };
  }

  const hkAttention = pulse.rooms.vacantDirty + pulse.rooms.hkTodoCount + pulse.rooms.hkDoneToInspect;
  if (hkAttention > 0) {
    map.housekeeping = {
      count: hkAttention,
      tone: pulse.rooms.vacantDirty > 0 && pulse.desk.arrivalsToday > pulse.rooms.vacantClean ? 'red' : 'amber',
      tooltip: `${pulse.rooms.vacantDirty} dirty room(s), ${pulse.rooms.hkTodoCount} task(s) to clean, ${pulse.rooms.hkDoneToInspect} awaiting inspection`,
    };
  }

  if (pulse.feedback.openIssues > 0) {
    map.feedback = {
      count: pulse.feedback.openIssues,
      tone: 'red',
      tooltip: `${pulse.feedback.openIssues} unresolved guest feedback issue(s)`,
    };
  }

  // 3. Revenue & Billing
  if (pulse.finance.receiptsIssuedToday > 0) {
    map.receipts = {
      count: pulse.finance.receiptsIssuedToday,
      tone: 'green',
      tooltip: `${pulse.finance.receiptsIssuedToday} official document(s) issued today`,
    };
  }

  if (pulse.finance.pendingQuotations > 0) {
    map.quotations = {
      count: pulse.finance.pendingQuotations,
      tone: 'amber',
      tooltip: `${pulse.finance.pendingQuotations} draft/sent quotation(s) awaiting client confirmation`,
    };
  }

  // 4. Operations & POS
  if (pulse.operations.posOpenOrders > 0) {
    map.pos = {
      count: pulse.operations.posOpenOrders,
      tone: 'amber',
      tooltip: `${pulse.operations.posOpenOrders} active kitchen/bar order(s) in preparation`,
    };
  }

  if (pulse.operations.healthClubInsideNow > 0) {
    map.healthclub = {
      count: pulse.operations.healthClubInsideNow,
      tone: 'green',
      tooltip: `${pulse.operations.healthClubInsideNow} guest(s) currently checked into Health Club & Spa`,
    };
  }

  if (pulse.operations.lowStockCount > 0) {
    map.inventory = {
      count: pulse.operations.lowStockCount,
      tone: 'red',
      tooltip: `${pulse.operations.lowStockCount} inventory item(s) at or below reorder par level`,
    };
  }

  if (pulse.operations.pendingRequisitions > 0) {
    map.requisitions = {
      count: pulse.operations.pendingRequisitions,
      tone: pulse.operations.urgentRequisitions > 0 ? 'red' : 'amber',
      tooltip: `${pulse.operations.pendingRequisitions} requisition(s) awaiting approval (${pulse.operations.urgentRequisitions} urgent)`,
    };
  }

  // 5. Human Resources
  if (pulse.hr.pendingLeaves > 0) {
    map.leave = {
      count: pulse.hr.pendingLeaves,
      tone: 'amber',
      tooltip: `${pulse.hr.pendingLeaves} leave request(s) pending review`,
    };
  }
  if (pulse.hr.draftPayrolls > 0) {
    map.payroll = {
      count: pulse.hr.draftPayrolls,
      tone: 'amber',
      tooltip: `${pulse.hr.draftPayrolls} draft payroll record(s) awaiting disbursement`,
    };
  }

  // 6. Website CMS
  if (pulse.cms.unpublishedPages > 0) {
    map.publishing = {
      count: pulse.cms.unpublishedPages,
      tone: 'neutral',
      tooltip: `${pulse.cms.unpublishedPages} page(s) have unpublished draft changes`,
    };
  }

  return map;
}

