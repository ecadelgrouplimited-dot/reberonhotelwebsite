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

  // Maintenance: urgent or overdue faults first; otherwise jobs given to you; otherwise how many are open.
  if (pulse.maintenance && pulse.maintenance.open > 0) {
    const m = pulse.maintenance;
    if (m.urgent > 0) map.maintenance = { count: m.urgent, tone: 'red', tooltip: `${m.urgent} urgent fault${m.urgent > 1 ? 's' : ''}${m.overdue ? ` · ${m.overdue} overdue` : ''}` };
    else if (m.overdue > 0) map.maintenance = { count: m.overdue, tone: 'amber', tooltip: `${m.overdue} job${m.overdue > 1 ? 's' : ''} past their target time` };
    else if (m.mine > 0) map.maintenance = { count: m.mine, tone: 'amber', tooltip: `${m.mine} job${m.mine > 1 ? 's' : ''} assigned to you` };
    else map.maintenance = { count: m.open, tone: 'neutral', tooltip: `${m.open} open job${m.open > 1 ? 's' : ''}${m.outOfService ? ` · ${m.outOfService} room${m.outOfService > 1 ? 's' : ''} out of service` : ''}` };
  }
  // Lost and found: items whose hold has ended (decide: dispose or keep), else how many are stored.
  if (pulse.lostFound && pulse.lostFound.stored > 0) {
    const l = pulse.lostFound;
    map.lostfound = l.due > 0 ? { count: l.due, tone: 'amber', tooltip: `${l.due} item${l.due > 1 ? 's' : ''} past the hold period` } : { count: l.stored, tone: 'neutral', tooltip: `${l.stored} item${l.stored > 1 ? 's' : ''} in lost and found` };
  }

  if (pulse.careers && pulse.careers.newApplications > 0) {
    const n = pulse.careers.newApplications;
    map.careers = { count: n, tone: 'amber', tooltip: `${n} new application${n > 1 ? 's' : ''} to read` };
  }
  if (pulse.eventsToday?.length) {
    const booked = pulse.eventsToday.reduce((s, e) => s + e.booked, 0);
    map.events = { count: pulse.eventsToday.length, tone: 'neutral', tooltip: `Today: ${pulse.eventsToday.map((e) => e.title).join(', ')} — ${booked} booked` };
  }

  // Close the day: earlier days never signed off; after 21:00, today too.
  if (pulse.dayClose) {
    const late = Number(new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hour12: false, timeZone: 'Africa/Kampala' }).format(new Date())) >= 21;
    const n = pulse.dayClose.unclosed.length;
    if (n > 0) map.dayclose = { count: n, tone: 'amber', tooltip: `${n} earlier day${n > 1 ? 's' : ''} not closed` };
    else if (late && !pulse.dayClose.todayClosed) map.dayclose = { count: 1, tone: 'neutral', tooltip: 'Today is not closed yet' };
  }

  return map;
}

