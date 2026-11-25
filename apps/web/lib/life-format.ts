import { EVENT_CATEGORY_LABEL, JOB_TYPE_LABEL, type EventCardDTO, type JobCardDTO } from '@reberon/contracts';
import { formatMoney, type Currency } from '@reberon/utils';

/** All event times are shown in Kampala time, whatever the visitor's own clock says. */
const tz = 'Africa/Kampala';
const f = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('en-GB', { timeZone: tz, ...o });

export const evDay = (iso: string) => f({ day: 'numeric' }).format(new Date(iso));
export const evMonth = (iso: string) => f({ month: 'short' }).format(new Date(iso));
export const evWeekday = (iso: string) => f({ weekday: 'short' }).format(new Date(iso));
export const evMonthKey = (iso: string) => new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit' }).format(new Date(iso));
export const evMonthLabel = (iso: string) => f({ month: 'long', year: 'numeric' }).format(new Date(iso));
export const evTime = (iso: string) => f({ hour: '2-digit', minute: '2-digit' }).format(new Date(iso));

export function evWhen(e: Pick<EventCardDTO, 'startsAt' | 'endsAt'>, long = false) {
  const day = f(long ? { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' } : { weekday: 'short', day: 'numeric', month: 'short' }).format(new Date(e.startsAt));
  if (!e.endsAt) return `${day} · ${evTime(e.startsAt)}`;
  const sameDay = evMonthKey(e.startsAt) === evMonthKey(e.endsAt) && evDay(e.startsAt) === evDay(e.endsAt);
  return sameDay ? `${day} · ${evTime(e.startsAt)}–${evTime(e.endsAt)}` : `${day}, ${evTime(e.startsAt)} — ${f({ weekday: 'short', day: 'numeric', month: 'short' }).format(new Date(e.endsAt))}, ${evTime(e.endsAt)}`;
}

export function evPrice(e: Pick<EventCardDTO, 'priceMinor' | 'currency'>) {
  if (!e.priceMinor || !e.currency || e.priceMinor === '0') return 'Free';
  return `${formatMoney(e.priceMinor, e.currency as Currency).replace(/\.00$/, '')} per person`;
}

/** "Only 4 places left", "Full — waiting list", "Cancelled"… or null when there is nothing to say. */
export function evAvailability(e: EventCardDTO): { text: string; tone: 'warn' | 'bad' | 'ok' } | null {
  if (e.status === 'CANCELLED') return { text: 'Cancelled', tone: 'bad' };
  if (e.past) return null;
  if (!e.rsvpOpen) return null;
  if (e.seatsLeft === null) return null;
  if (e.seatsLeft === 0) return { text: 'Full — join the waiting list', tone: 'bad' };
  if (e.capacity && e.seatsLeft <= Math.max(5, Math.ceil(e.capacity * 0.2))) return { text: `Only ${e.seatsLeft} place${e.seatsLeft === 1 ? '' : 's'} left`, tone: 'warn' };
  return null;
}

export const evCategory = (e: Pick<EventCardDTO, 'category'>) => EVENT_CATEGORY_LABEL[e.category];

export function jobPay(j: Pick<JobCardDTO, 'salary'>) {
  if (!j.salary) return null;
  const m = (v: string | null) => (v ? formatMoney(v, j.salary!.currency as Currency).replace(/\.00$/, '') : null);
  const per = { MONTH: 'a month', YEAR: 'a year', DAY: 'a day', HOUR: 'an hour' }[j.salary.period ?? 'MONTH'] ?? '';
  const [lo, hi] = [m(j.salary.min), m(j.salary.max)];
  return `${lo && hi ? `${lo} – ${hi}` : (lo ?? `Up to ${hi}`)} ${per}`;
}
export const jobType = (j: Pick<JobCardDTO, 'employmentType'>) => JOB_TYPE_LABEL[j.employmentType];
export function jobCloses(j: Pick<JobCardDTO, 'closesOn'>) {
  if (!j.closesOn) return null;
  const days = Math.ceil((new Date(`${j.closesOn}T23:59:59+03:00`).getTime() - Date.now()) / 86_400_000);
  const date = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(`${j.closesOn}T00:00:00Z`));
  return days <= 0 ? 'Closes today' : days <= 7 ? `Closes in ${days} day${days === 1 ? '' : 's'} (${date})` : `Apply by ${date}`;
}
