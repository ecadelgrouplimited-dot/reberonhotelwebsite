import { z } from 'zod';
import { zLRich, zLText } from './localized.js';
import type { LRich, LText } from './text.js';
import type { MediaRef as MediaDTO } from './dto.js';

const slug = z.string().trim().toLowerCase().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'lowercase-with-dashes').max(120);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');
const optText = (max: number) => z.string().trim().max(max).optional().or(z.literal('').transform(() => undefined));
const minor = z.union([z.string().regex(/^\d+$/), z.number().int().nonnegative()]).transform((v) => String(v));
const zSeo = z.object({ title: zLText.optional(), description: zLText.optional(), shareImageId: z.string().nullable().optional(), noindex: z.boolean().optional() });

/* ───────────────────────── Events ───────────────────────── */

export const EVENT_CATEGORIES = ['MUSIC', 'FOOD_DRINK', 'COFFEE', 'OUTDOOR', 'CULTURE', 'WELLNESS', 'FAMILY', 'CONFERENCE', 'OTHER'] as const;
export type EventCategory = (typeof EVENT_CATEGORIES)[number];
export const EVENT_CATEGORY_LABEL: Record<EventCategory, string> = {
  MUSIC: 'Music & nights',
  FOOD_DRINK: 'Food & drink',
  COFFEE: 'Coffee',
  OUTDOOR: 'Outdoors & hikes',
  CULTURE: 'Culture',
  WELLNESS: 'Wellness',
  FAMILY: 'Family',
  CONFERENCE: 'Talks & conferences',
  OTHER: 'Other',
};
export const EVENT_STATUSES = ['DRAFT', 'PUBLISHED', 'CANCELLED'] as const;
export type EventStatus = (typeof EVENT_STATUSES)[number];
export const REGISTRATION_STATUSES = ['CONFIRMED', 'WAITLISTED', 'CANCELLED', 'ATTENDED'] as const;
export type RegistrationStatus = (typeof REGISTRATION_STATUSES)[number];

export const zEventInput = z
  .object({
    slug: slug.optional(),
    title: zLText,
    summary: zLText.nullable().optional(),
    body: zLRich.nullable().optional(),
    category: z.enum(EVENT_CATEGORIES).default('OTHER'),
    coverId: z.string().uuid().nullable().optional(),
    galleryIds: z.array(z.string().uuid()).max(30).default([]),
    /** Local Kampala time "YYYY-MM-DDTHH:MM" or a full ISO time. */
    startsAt: z.string().min(16),
    endsAt: z.string().min(16).nullable().optional(),
    venue: z.string().trim().max(160).nullable().optional(),
    venueDetail: z.string().trim().max(300).nullable().optional(),
    offsite: z.boolean().default(false),
    priceMinor: minor.nullable().optional(),
    currency: z.enum(['UGX', 'USD']).nullable().optional(),
    priceNote: zLText.nullable().optional(),
    capacity: z.number().int().min(1).max(5000).nullable().optional(),
    rsvpEnabled: z.boolean().default(true),
    rsvpClosesAt: z.string().min(16).nullable().optional(),
    maxPartySize: z.number().int().min(1).max(50).default(6),
    featured: z.boolean().default(false),
    status: z.enum(EVENT_STATUSES).default('DRAFT'),
    seo: zSeo.optional(),
  })
  .refine((v) => !v.priceMinor || !!v.currency, { path: ['currency'], message: 'Pick the currency of the price' });

/** The public RSVP. */
export const zRsvpInput = z
  .object({
    name: z.string().trim().min(2, 'Tell us your name').max(120),
    email: z.string().trim().email('That email looks incomplete').max(200).optional().or(z.literal('').transform(() => undefined)),
    phone: optText(40),
    partySize: z.coerce.number().int().min(1, 'At least one person').max(50),
    notes: optText(500),
    consent: z.literal(true, { error: 'Please agree so we can hold your place' }),
    website: z.string().max(0).optional(), // honeypot
  })
  .refine((v) => v.email || v.phone, { path: ['email'], message: 'An email or phone so we can reach you' });

export const zRegistrationAdminInput = z.object({
  name: z.string().trim().min(2).max(120),
  email: optText(200),
  phone: optText(40),
  partySize: z.coerce.number().int().min(1).max(50),
  notes: optText(500),
});
export const zRegistrationStatusInput = z.object({ status: z.enum(REGISTRATION_STATUSES) });

export interface EventCardDTO {
  id: string;
  slug: string;
  title: LText;
  summary: LText | null;
  category: EventCategory;
  cover: MediaDTO | null;
  startsAt: string;
  endsAt: string | null;
  venue: string | null;
  offsite: boolean;
  priceMinor: string | null;
  currency: string | null;
  priceNote: LText | null;
  status: EventStatus;
  featured: boolean;
  /** Seats left; null when there is no limit. */
  seatsLeft: number | null;
  capacity: number | null;
  rsvpOpen: boolean;
  past: boolean;
}

export interface EventDetailDTO extends EventCardDTO {
  body: LRich | null;
  gallery: MediaDTO[];
  venueDetail: string | null;
  maxPartySize: number;
  rsvpClosesAt: string | null;
  seo: { title?: LText; description?: LText; shareImageId?: string | null; noindex?: boolean };
  more: EventCardDTO[];
}

export interface RsvpResultDTO {
  code: string;
  status: 'CONFIRMED' | 'WAITLISTED';
  partySize: number;
  eventTitle: LText;
  startsAt: string;
  manageUrl: string;
}

export interface EventRegistrationDTO {
  id: string;
  code: string;
  name: string;
  email: string | null;
  phone: string | null;
  partySize: number;
  notes: string | null;
  status: RegistrationStatus;
  source: string;
  checkedInAt: string | null;
  createdAt: string;
}

export interface EventAdminRowDTO extends EventCardDTO {
  confirmedSeats: number;
  waitlistedSeats: number;
  registrations: number;
}

/* ───────────────────────── Careers ───────────────────────── */

export const JOB_TYPES = ['FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERNSHIP', 'SEASONAL', 'VOLUNTEER'] as const;
export type JobType = (typeof JOB_TYPES)[number];
export const JOB_TYPE_LABEL: Record<JobType, string> = { FULL_TIME: 'Full time', PART_TIME: 'Part time', CONTRACT: 'Contract', INTERNSHIP: 'Internship', SEASONAL: 'Seasonal', VOLUNTEER: 'Volunteer' };
export const JOB_STATUSES = ['DRAFT', 'OPEN', 'CLOSED'] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];
export const SALARY_PERIODS = ['MONTH', 'YEAR', 'DAY', 'HOUR'] as const;
export const APPLICATION_STATUSES = ['NEW', 'REVIEWING', 'SHORTLISTED', 'INTERVIEW', 'OFFERED', 'HIRED', 'REJECTED', 'WITHDRAWN'] as const;
export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];
export const APPLICATION_STATUS_LABEL: Record<ApplicationStatus, string> = {
  NEW: 'New',
  REVIEWING: 'Reviewing',
  SHORTLISTED: 'Shortlisted',
  INTERVIEW: 'Interview',
  OFFERED: 'Offered',
  HIRED: 'Hired',
  REJECTED: 'Not selected',
  WITHDRAWN: 'Withdrawn',
};
/** CV uploads: what is accepted. */
export const CV_MAX_BYTES = 5 * 1024 * 1024;
export const CV_TYPES: Record<string, string> = {
  'application/pdf': 'pdf',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
};

export const zJobQuestion = z.object({ id: z.string().min(1).max(40), label: z.string().trim().min(3).max(200), required: z.boolean().default(false) });

export const zJobInput = z
  .object({
    slug: slug.optional(),
    title: zLText,
    summary: zLText.nullable().optional(),
    description: zLRich.nullable().optional(),
    requirements: zLRich.nullable().optional(),
    benefits: zLRich.nullable().optional(),
    departmentCode: z.string().trim().max(60).nullable().optional(),
    employmentType: z.enum(JOB_TYPES).default('FULL_TIME'),
    location: z.string().trim().min(2).max(120).default('Kapchorwa, Uganda'),
    openings: z.number().int().min(1).max(100).default(1),
    salaryMinMinor: minor.nullable().optional(),
    salaryMaxMinor: minor.nullable().optional(),
    currency: z.enum(['UGX', 'USD']).nullable().optional(),
    salaryPeriod: z.enum(SALARY_PERIODS).nullable().optional(),
    showSalary: z.boolean().default(false),
    closesOn: isoDate.nullable().optional(),
    status: z.enum(JOB_STATUSES).default('DRAFT'),
    questions: z.array(zJobQuestion).max(8).default([]),
    coverId: z.string().uuid().nullable().optional(),
    seo: zSeo.optional(),
  })
  .refine((v) => !(v.salaryMinMinor || v.salaryMaxMinor) || !!v.currency, { path: ['currency'], message: 'Pick the currency of the pay' })
  .refine((v) => !(v.salaryMinMinor && v.salaryMaxMinor) || BigInt(v.salaryMinMinor) <= BigInt(v.salaryMaxMinor), { path: ['salaryMaxMinor'], message: 'The top of the range is below the bottom' });

/** The public application (sent as multipart with an optional `cv` file). */
export const zApplicationInput = z.object({
  name: z.string().trim().min(2, 'Tell us your name').max(120),
  email: z.string().trim().toLowerCase().email('That email looks incomplete').max(200),
  phone: z.string().trim().min(7, 'A phone number we can call').max(40),
  location: optText(120),
  coverLetter: optText(6000),
  /** JSON-encoded [{ id, answer }] when sent as multipart. */
  answers: z
    .union([z.string(), z.array(z.object({ id: z.string(), answer: z.string().max(3000) }))])
    .optional()
    .transform((v) => {
      if (!v) return [] as { id: string; answer: string }[];
      if (Array.isArray(v)) return v;
      try {
        const parsed = JSON.parse(v) as unknown;
        return Array.isArray(parsed) ? (parsed as { id: string; answer: string }[]).filter((a) => a && typeof a.id === 'string' && typeof a.answer === 'string').map((a) => ({ id: a.id.slice(0, 40), answer: a.answer.slice(0, 3000) })) : [];
      } catch {
        return [];
      }
    }),
  consent: z.union([z.literal(true), z.literal('true')], { error: 'Please agree so we can consider your application' }),
  source: optText(60),
  website: z.string().max(0).optional(), // honeypot
});

export const zApplicationStatusInput = z.object({
  status: z.enum(APPLICATION_STATUSES),
  /** Send the applicant an email about it (wording below, editable). */
  notify: z.boolean().default(false),
  message: optText(4000),
});
export const zApplicationNoteInput = z.object({ body: z.string().trim().min(1).max(4000) });
export const zApplicationRatingInput = z.object({ rating: z.number().int().min(1).max(5).nullable() });

export interface JobCardDTO {
  id: string;
  slug: string;
  title: LText;
  summary: LText | null;
  department: string | null;
  employmentType: JobType;
  location: string;
  openings: number;
  salary: { min: string | null; max: string | null; currency: string; period: string | null } | null;
  closesOn: string | null;
  status: JobStatus;
  publishedAt: string | null;
  open: boolean;
}

export interface JobDetailDTO extends JobCardDTO {
  description: LRich | null;
  requirements: LRich | null;
  benefits: LRich | null;
  questions: { id: string; label: string; required: boolean }[];
  cover: MediaDTO | null;
  seo: { title?: LText; description?: LText; shareImageId?: string | null; noindex?: boolean };
  more: JobCardDTO[];
}

export interface ApplicationResultDTO {
  code: string;
  jobTitle: LText | null;
}

export interface JobAdminRowDTO extends JobCardDTO {
  applications: number;
  newApplications: number;
}

export interface ApplicationNoteDTO {
  id: string;
  authorName: string;
  body: string;
  kind: 'NOTE' | 'EVENT';
  createdAt: string;
}

export interface ApplicationDTO {
  id: string;
  code: string;
  job: { id: string; title: LText; slug: string } | null;
  name: string;
  email: string;
  phone: string;
  location: string | null;
  coverLetter: string | null;
  answers: { id: string; question: string; answer: string }[];
  cv: { name: string; mime: string; size: number } | null;
  status: ApplicationStatus;
  rating: number | null;
  source: string | null;
  staffProfileId: string | null;
  createdAt: string;
  updatedAt: string;
  notes?: ApplicationNoteDTO[];
}

export interface CareersOverviewDTO {
  jobs: JobAdminRowDTO[];
  applications: ApplicationDTO[];
  counts: Record<ApplicationStatus, number>;
  departments: { code: string; name: string }[];
}
