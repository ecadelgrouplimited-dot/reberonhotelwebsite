import type { EventCardDTO, JobCardDTO, MediaRef } from '@reberon/contracts';
import { hotelToday } from '@reberon/utils';
import type { Event, JobPosting } from '@reberon/db';
import { lt } from '../content/mappers.js';

/** Pure mappers shared by the services and the page-block resolver (no DI, no cycles). */

export function eventRsvpOpen(e: Event, now = new Date()) {
  const end = e.endsAt ?? new Date(e.startsAt.getTime() + 3 * 3600_000);
  return e.status === 'PUBLISHED' && e.rsvpEnabled && end > now && (!e.rsvpClosesAt || e.rsvpClosesAt > now);
}

export function eventCard(e: Event, seatsTaken: number, media: Map<string, MediaRef>): EventCardDTO {
  const now = new Date();
  const end = e.endsAt ?? new Date(e.startsAt.getTime() + 3 * 3600_000);
  return {
    id: e.id,
    slug: e.slug,
    title: lt(e.title),
    summary: e.summary ? lt(e.summary) : null,
    category: e.category,
    cover: e.coverId ? (media.get(e.coverId) ?? null) : null,
    startsAt: e.startsAt.toISOString(),
    endsAt: e.endsAt?.toISOString() ?? null,
    venue: e.venue,
    offsite: e.offsite,
    priceMinor: e.priceMinor?.toString() ?? null,
    currency: e.currency,
    priceNote: e.priceNote ? lt(e.priceNote) : null,
    status: e.status,
    featured: e.featured,
    capacity: e.capacity,
    seatsLeft: e.capacity === null ? null : Math.max(0, e.capacity - seatsTaken),
    rsvpOpen: eventRsvpOpen(e, now),
    past: end <= now,
  };
}

export function jobOpen(j: JobPosting) {
  return j.status === 'OPEN' && (!j.closesOn || j.closesOn.toISOString().slice(0, 10) >= hotelToday());
}

export function jobCard(j: JobPosting, deptName: Map<string, string>): JobCardDTO {
  return {
    id: j.id,
    slug: j.slug,
    title: lt(j.title),
    summary: j.summary ? lt(j.summary) : null,
    department: j.departmentCode ? (deptName.get(j.departmentCode) ?? j.departmentCode) : null,
    employmentType: j.employmentType,
    location: j.location,
    openings: j.openings,
    salary: j.showSalary && j.currency && (j.salaryMinMinor || j.salaryMaxMinor) ? { min: j.salaryMinMinor?.toString() ?? null, max: j.salaryMaxMinor?.toString() ?? null, currency: j.currency, period: j.salaryPeriod } : null,
    closesOn: j.closesOn?.toISOString().slice(0, 10) ?? null,
    status: j.status,
    publishedAt: j.publishedAt?.toISOString() ?? null,
    open: jobOpen(j),
  };
}
