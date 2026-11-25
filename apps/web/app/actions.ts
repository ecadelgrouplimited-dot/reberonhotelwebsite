'use server';
import { headers } from 'next/headers';
import { CV_MAX_BYTES, zApplicationInput, zConsentInput, zEnquiryInput, zRsvpInput, zWaitlistInput, type ApplicationResultDTO, type RsvpResultDTO } from '@reberon/contracts';
import type { ZodType } from 'zod';
import { ApiError, API_BASE, post } from '@/lib/api';

export interface FormState {
  status: 'idle' | 'success' | 'error';
  reference?: string;
  message?: string;
  fieldErrors?: Record<string, string>;
  values?: Record<string, string>;
  /** Extra result details (RSVP status, manage link…). */
  data?: Record<string, string>;
}

function formToObject(fd: FormData) {
  const o: Record<string, unknown> = {};
  for (const [k, v] of fd.entries()) {
    if (k.startsWith('$') || k === 'idempotencyKey') continue;
    if (typeof v === 'string') o[k] = v.trim();
  }
  o.consent = fd.get('consent') === 'on' || fd.get('consent') === 'true';
  if (fd.has('flexibleDates')) o.flexibleDates = fd.get('flexibleDates') === 'on';
  for (const n of ['adults', 'children']) if (o[n] === '') delete o[n];
  return o;
}

async function submit(path: string, schema: ZodType, fd: FormData): Promise<FormState> {
  const raw = formToObject(fd);
  const values = Object.fromEntries(Object.entries(raw).filter(([, v]) => typeof v === 'string')) as Record<string, string>;
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const i of parsed.error.issues) fieldErrors[String(i.path[0] ?? 'form')] ??= i.message;
    return { status: 'error', message: 'A few details need attention.', fieldErrors, values };
  }
  const key = String(fd.get('idempotencyKey') ?? '') || undefined;
  const h = await headers();
  try {
    const res = await post<{ reference: string }>(path, parsed.data, {
      ...(key ? { 'idempotency-key': key } : {}),
      ...(fd.get('cf-turnstile-response') ? { 'x-turnstile-token': String(fd.get('cf-turnstile-response')) } : {}),
      'x-forwarded-for': h.get('x-forwarded-for') ?? '',
    });
    return { status: 'success', reference: res.reference };
  } catch (e) {
    if (e instanceof ApiError) {
      const fieldErrors = Object.fromEntries((e.body.errors ?? []).map((x) => [x.path.split('.')[0], x.message]));
      return {
        status: 'error',
        message: e.status === 429 ? 'Too many tries in a short time. Please wait a minute.' : (e.body.detail ?? 'Something went wrong. Please try again.'),
        fieldErrors,
        values,
      };
    }
    return { status: 'error', message: 'We could not reach the hotel just now. Your details are still here — try again, or message us on WhatsApp.', values };
  }
}

export async function submitEnquiry(_prev: FormState, fd: FormData) {
  return submit('/enquiries', zEnquiryInput, fd);
}

export async function submitWaitlist(_prev: FormState, fd: FormData) {
  return submit('/waitlist', zWaitlistInput, fd);
}

/** Proof of a cookie choice (anonymous). Never blocks the page. */
export async function recordConsent(input: unknown) {
  const parsed = zConsentInput.safeParse(input);
  if (!parsed.success) return;
  const h = await headers();
  await post('/consent', parsed.data, { 'x-forwarded-for': h.get('x-forwarded-for') ?? '', 'user-agent': h.get('user-agent') ?? '' }).catch(() => undefined);
}

const fail = (e: unknown, values: Record<string, string>): FormState => {
  if (e instanceof ApiError) {
    const fieldErrors = Object.fromEntries((e.body.errors ?? []).map((x) => [x.path.split('.').pop()!, x.message]));
    return { status: 'error', message: e.status === 429 ? 'Too many tries in a short time. Please wait a few minutes.' : (e.body.detail ?? 'Something went wrong. Please try again.'), fieldErrors, values };
  }
  return { status: 'error', message: 'We could not reach the hotel just now. Your details are still here — please try again in a moment.', values };
};

/** Book places at an event. */
export async function submitRsvp(slug: string, _prev: FormState, fd: FormData): Promise<FormState> {
  const raw = formToObject(fd);
  const values = Object.fromEntries(Object.entries(raw).filter(([, v]) => typeof v === 'string')) as Record<string, string>;
  const parsed = zRsvpInput.safeParse(raw);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const i of parsed.error.issues) fieldErrors[String(i.path[0] ?? 'form')] ??= i.message;
    return { status: 'error', message: 'A few details need attention.', fieldErrors, values };
  }
  const key = String(fd.get('idempotencyKey') ?? '') || undefined;
  const h = await headers();
  try {
    const r = await post<RsvpResultDTO>(`/events/${encodeURIComponent(slug)}/rsvp`, parsed.data, {
      ...(key ? { 'idempotency-key': key } : {}),
      ...(fd.get('cf-turnstile-response') ? { 'x-turnstile-token': String(fd.get('cf-turnstile-response')) } : {}),
      'x-forwarded-for': h.get('x-forwarded-for') ?? '',
    });
    return { status: 'success', reference: r.code, data: { rsvpStatus: r.status, manageUrl: r.manageUrl, partySize: String(r.partySize), email: parsed.data.email ?? '' } };
  } catch (e) {
    return fail(e, values);
  }
}

/** Apply for a role ("open" = an open application). The CV goes straight through to private storage. */
export async function submitApplication(slug: string, _prev: FormState, fd: FormData): Promise<FormState> {
  const raw = formToObject(fd);
  // Answers to the role's questions arrive as answer:<id> fields.
  const answers = [...fd.entries()].filter(([k, v]) => k.startsWith('answer:') && typeof v === 'string' && v.trim()).map(([k, v]) => ({ id: k.slice(7), answer: String(v).trim() }));
  for (const k of Object.keys(raw)) if (k.startsWith('answer:')) delete raw[k];
  const values = Object.fromEntries([...Object.entries(raw).filter(([, v]) => typeof v === 'string'), ...answers.map((a) => [`answer:${a.id}`, a.answer])]) as Record<string, string>;
  const parsed = zApplicationInput.safeParse({ ...raw, answers });
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const i of parsed.error.issues) fieldErrors[String(i.path[0] ?? 'form')] ??= i.message;
    return { status: 'error', message: 'A few details need attention.', fieldErrors, values };
  }
  const cv = fd.get('cv');
  const file = cv instanceof File && cv.size > 0 ? cv : null;
  if (file && file.size > CV_MAX_BYTES) return { status: 'error', message: 'Your CV is larger than 5 MB — please send a smaller file.', fieldErrors: { cv: 'Larger than 5 MB' }, values };
  const body = new FormData();
  for (const [k, v] of Object.entries(parsed.data)) {
    if (k === 'answers') body.append('answers', JSON.stringify(v));
    else if (v !== undefined && v !== null) body.append(k, String(v));
  }
  if (file) body.append('cv', file, file.name);
  const key = String(fd.get('idempotencyKey') ?? '') || undefined;
  const h = await headers();
  try {
    const res = await fetch(`${API_BASE}/v1/public/careers/${encodeURIComponent(slug)}/apply`, {
      method: 'POST',
      headers: {
        ...(key ? { 'idempotency-key': key } : {}),
        ...(fd.get('cf-turnstile-response') ? { 'x-turnstile-token': String(fd.get('cf-turnstile-response')) } : {}),
        'x-forwarded-for': h.get('x-forwarded-for') ?? '',
      },
      body,
      cache: 'no-store',
    });
    const json = (await res.json().catch(() => ({}))) as ApplicationResultDTO & { detail?: string; errors?: { path: string; message: string }[] };
    if (!res.ok) throw new ApiError(res.status, json);
    return { status: 'success', reference: json.code, data: { email: parsed.data.email } };
  } catch (e) {
    return fail(e, values);
  }
}
