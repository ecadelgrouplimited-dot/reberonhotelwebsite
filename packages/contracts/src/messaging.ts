import { z } from 'zod';

/* Integrations vault (M22) and guest messaging (M09, M10). */

export const INTEGRATION_KINDS = ['PESAPAL', 'SMS_AFRICASTALKING', 'WHATSAPP_CLOUD', 'SMTP', 'IMAP'] as const;
export type IntegrationKind = (typeof INTEGRATION_KINDS)[number];
export const MESSAGE_CHANNELS = ['EMAIL', 'SMS', 'WHATSAPP'] as const;
export type MessageChannel = (typeof MESSAGE_CHANNELS)[number];
export const OUTBOUND_STATUSES = ['QUEUED', 'SENT', 'FAILED', 'NOT_CONNECTED', 'SKIPPED'] as const;
export type OutboundStatus = (typeof OUTBOUND_STATUSES)[number];

export interface IntegrationFieldDef {
  name: string;
  label: string;
  secret?: boolean;
  required?: boolean;
  placeholder?: string;
  help?: string;
}

export interface IntegrationDef {
  kind: IntegrationKind;
  label: string;
  purpose: string;
  /** Where the owner gets the keys. */
  getKeys: string;
  testLabel: string;
  liveLabel: string;
  fields: IntegrationFieldDef[];
}

/** One definition drives the API's validation and the owner's form. */
export const INTEGRATIONS: IntegrationDef[] = [
  {
    kind: 'PESAPAL',
    label: 'Pesapal',
    purpose: 'Card and mobile money payments on the website and payment links.',
    getKeys: 'Pesapal merchant dashboard → Settings → API keys. Sandbox keys come from developer.pesapal.com.',
    testLabel: 'Sandbox',
    liveLabel: 'Live (real money)',
    fields: [
      { name: 'consumerKey', label: 'Consumer key', secret: true, required: true },
      { name: 'consumerSecret', label: 'Consumer secret', secret: true, required: true },
    ],
  },
  {
    kind: 'SMS_AFRICASTALKING',
    label: "SMS (Africa's Talking)",
    purpose: 'Confirmations, pre-arrival notes and one-time codes by text message.',
    getKeys: "africastalking.com → your app → Settings → API key. The sandbox username is always \"sandbox\". A sender ID must be approved by Africa's Talking.",
    testLabel: 'Sandbox',
    liveLabel: 'Live',
    fields: [
      { name: 'username', label: 'Username', required: true, placeholder: 'sandbox' },
      { name: 'apiKey', label: 'API key', secret: true, required: true },
      { name: 'senderId', label: 'Sender ID', placeholder: 'REBERON', help: 'Optional until approved; messages then come from a shared short code.' },
    ],
  },
  {
    kind: 'WHATSAPP_CLOUD',
    label: 'WhatsApp Cloud API',
    purpose: 'Send confirmations and reminders from the hotel number. Until connected, staff get a one-tap wa.me link instead.',
    getKeys: 'developers.facebook.com → your app → WhatsApp → API setup: phone number ID and a permanent system-user token. Message templates must be approved in WhatsApp Manager.',
    testLabel: 'Test number',
    liveLabel: 'Live number',
    fields: [
      { name: 'phoneNumberId', label: 'Phone number ID', required: true },
      { name: 'businessAccountId', label: 'WhatsApp business account ID' },
      { name: 'accessToken', label: 'Access token', secret: true, required: true },
      { name: 'templateLanguage', label: 'Template language', placeholder: 'en' },
    ],
  },
  {
    kind: 'SMTP',
    label: 'Email (SMTP)',
    purpose: 'Every email the house sends. Without this, the server settings in the environment are used.',
    getKeys: 'From your email provider (Google Workspace, Zoho, Brevo, Postmark…): host, port, username and an app password.',
    testLabel: 'Test',
    liveLabel: 'Live',
    fields: [
      { name: 'host', label: 'Host', required: true, placeholder: 'smtp.example.com' },
      { name: 'port', label: 'Port', required: true, placeholder: '587' },
      { name: 'user', label: 'Username' },
      { name: 'pass', label: 'Password', secret: true },
      { name: 'from', label: 'From', placeholder: 'Reberon Hotel <alerts@reberonhotel.com>' },
    ],
  },
  {
    kind: 'IMAP',
    label: 'Incoming Email (IMAP)',
    purpose: 'Receives guest email replies to alerts@reberonhotel.com and automatically threads them into conversations in the inbox.',
    getKeys: 'From Hostinger webmail settings: host (imap.hostinger.com), port 993, alerts@reberonhotel.com and password.',
    testLabel: 'Test & Sync',
    liveLabel: 'Live Ingestion',
    fields: [
      { name: 'host', label: 'IMAP Host', required: true, placeholder: 'imap.hostinger.com' },
      { name: 'port', label: 'Port', required: true, placeholder: '993' },
      { name: 'user', label: 'Mailbox Email', required: true, placeholder: 'alerts@reberonhotel.com' },
      { name: 'pass', label: 'Mailbox Password', secret: true, required: true },
      { name: 'mailbox', label: 'Mailbox Folder', placeholder: 'INBOX' },
    ],
  },
];

export const zIntegrationInput = z.object({
  enabled: z.boolean(),
  mode: z.enum(['TEST', 'LIVE']),
  /** Plain fields and secrets together; an empty secret means "keep the stored one". */
  values: z.record(z.string(), z.string().max(2000)),
});

export interface IntegrationDTO {
  kind: IntegrationKind;
  enabled: boolean;
  mode: 'TEST' | 'LIVE';
  /** Non-secret values. */
  config: Record<string, string>;
  /** Secret name → last four characters (or null when unset). */
  secrets: Record<string, string | null>;
  /** Where the running configuration comes from. */
  source: 'VAULT' | 'ENVIRONMENT' | 'NONE';
  lastTest: { at: string; ok: boolean; message: string } | null;
  updatedAt: string | null;
}

/* ───────── Message templates ───────── */

export interface TemplateVar {
  name: string;
  label: string;
  sample: string;
}

export interface TemplateDef {
  key: string;
  label: string;
  when: string;
  channels: MessageChannel[];
  vars: TemplateVar[];
  /** Whether an email shows the booking facts table under the text. */
  facts?: boolean;
}

const v = (name: string, label: string, sample: string): TemplateVar => ({ name, label, sample });
const GUEST = v('guestFirstName', 'Guest first name', 'Amina');
const CODE = v('code', 'Booking code', 'RB-7KQ2M');
const ARRIVE = v('arrival', 'Arrival date', 'Fri 16 October 2026');
const LEAVE = v('departure', 'Departure date', 'Sun 18 October 2026');
const ROOM = v('room', 'Room', 'Elgon View King');
const HOTEL = v('hotelName', 'Hotel name', 'Reberon Hotel');
const WA = v('whatsapp', 'Hotel WhatsApp', '+256 700 000 000');
const LINK = v('stayLink', 'Link to their stay page', 'https://reberonhotel.com/stay?code=RB-7KQ2M&t=…');
const CHECKIN = v('checkInTime', 'Check-in time', '14:00');

export const TEMPLATES: TemplateDef[] = [
  { key: 'booking.confirmed', label: 'Booking confirmed', when: 'The moment a booking is confirmed (paid online, or confirmed by staff).', channels: ['EMAIL', 'SMS', 'WHATSAPP'], facts: true, vars: [GUEST, CODE, ARRIVE, LEAVE, v('nights', 'Nights', '2'), ROOM, v('total', 'Total', 'UGX 640,000'), v('paid', 'Paid', 'UGX 192,000'), v('balance', 'Balance', 'UGX 448,000'), CHECKIN, v('checkOutTime', 'Check-out time', '10:30'), LINK, HOTEL, WA] },
  { key: 'booking.payment_failed', label: 'Payment did not go through', when: 'A payment attempt fails while the rooms are still held.', channels: ['EMAIL', 'SMS'], vars: [GUEST, CODE, v('holdUntil', 'Hold ends', '15:40'), LINK, WA] },
  { key: 'booking.hold_expired', label: 'Hold ended', when: 'Nobody paid in time and the rooms were released.', channels: ['EMAIL', 'SMS'], vars: [GUEST, CODE, v('bookAgainLink', 'Link to start again', 'https://reberonhotel.com/book?…'), WA] },
  { key: 'booking.cancelled', label: 'Booking cancelled', when: 'A confirmed booking is cancelled.', channels: ['EMAIL', 'SMS'], vars: [GUEST, CODE, ARRIVE, LEAVE, v('refund', 'Refund due', 'UGX 192,000'), WA] },
  { key: 'stay.pre_arrival', label: 'Before you come', when: 'Sent automatically the day before arrival, at 10:00.', channels: ['EMAIL', 'SMS', 'WHATSAPP'], vars: [GUEST, CODE, ARRIVE, CHECKIN, v('balance', 'Balance', 'UGX 448,000'), v('directionsLink', 'Directions link', 'https://reberonhotel.com/kapchorwa/getting-here'), LINK, WA] },
  { key: 'stay.running_late', label: 'Are you still coming?', when: 'Sent by the desk when a guest has not arrived by evening.', channels: ['SMS', 'WHATSAPP'], vars: [GUEST, CODE, HOTEL, WA] },
  { key: 'stay.thank_you', label: 'Thank you', when: 'After check-out, when the desk did not record feedback.', channels: ['EMAIL', 'SMS', 'WHATSAPP'], vars: [GUEST, v('feedbackLink', 'Feedback link', 'https://reberonhotel.com/stay?…#feedback'), HOTEL] },
  { key: 'document.issued', label: 'Receipt or invoice', when: 'When a receipt, refund note or invoice is sent to a guest (automatically after an online payment, or by the desk).', channels: ['EMAIL', 'SMS', 'WHATSAPP'], vars: [GUEST, v('documentName', 'Document', 'receipt RCT-2026-00042'), v('amount', 'Amount', 'UGX 448,000'), v('documentLink', 'Link to the document', 'https://api.reberonhotel.com/v1/public/documents/…'), CODE, HOTEL] },
  { key: 'stay.otp', label: 'One-time code', when: 'A guest looks up their stay by phone (only when SMS is live).', channels: ['SMS'], vars: [v('otp', 'Code', '482913'), HOTEL] },
];

export const templateDef = (key: string) => TEMPLATES.find((t) => t.key === key);

export const zTemplateInput = z.object({
  subject: z.string().max(200).nullable().optional(),
  heading: z.string().max(200).nullable().optional(),
  body: z.string().min(1).max(4000),
  actionLabel: z.string().max(60).nullable().optional(),
  providerTemplate: z.string().max(120).nullable().optional(),
  isActive: z.boolean().optional(),
});

export interface MessageTemplateDTO {
  id: string;
  key: string;
  channel: MessageChannel;
  locale: string;
  subject: string | null;
  heading: string | null;
  body: string;
  actionLabel: string | null;
  providerTemplate: string | null;
  isActive: boolean;
  updatedAt: string;
}

export interface OutboundMessageDTO {
  id: string;
  channel: MessageChannel;
  to: string;
  templateKey: string | null;
  subject: string | null;
  body: string;
  status: OutboundStatus;
  provider: string | null;
  error: string | null;
  fallbackUrl: string | null;
  reservation: { id: string; code: string } | null;
  sentBy: string | null;
  createdAt: string;
  sentAt: string | null;
}

export const zSendMessageInput = z.object({
  templateKey: z.string().max(60),
  channel: z.enum(MESSAGE_CHANNELS),
});

export const zTestMessageInput = z.object({ to: z.string().min(3).max(200) });

/** {{name}} placeholders, in order of first appearance. */
export function templateVars(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(/\{\{\s*([a-zA-Z][a-zA-Z0-9]*)\s*\}\}/g)) if (!out.includes(m[1]!)) out.push(m[1]!);
  return out;
}

export function fillTemplate(text: string, vars: Record<string, string | number | null | undefined>): string {
  return text.replace(/\{\{\s*([a-zA-Z][a-zA-Z0-9]*)\s*\}\}/g, (_, k: string) => String(vars[k] ?? ''));
}

/** GSM-7 messages are 160 characters (153 per part when split); anything else is 70 (67). */
export function smsParts(text: string): { chars: number; parts: number; unicode: boolean } {
  const gsm = /^[\n\r @£$¥èéùìòÇØøÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ!"#¤%&'()*+,\-./0-9:;<=>?¡A-ZÄÖÑÜ§¿a-zäöñüà^{}\\[~\]|€]*$/.test(text);
  const chars = text.length;
  const [one, many] = gsm ? [160, 153] : [70, 67];
  return { chars, unicode: !gsm, parts: chars <= one ? 1 : Math.ceil(chars / many) };
}
