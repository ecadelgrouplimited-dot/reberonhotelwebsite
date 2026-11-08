'use client';
import {
  Banknote,
  BedDouble,
  CreditCard,
  Landmark,
  Smartphone,
  Timer,
  type LucideIcon,
} from 'lucide-react';
import type { CurrencyCode, PosItemDTO, PosPaymentMethod, PosStaffDTO } from '@reberon/contracts';
import { money, toMinorStr } from '@/lib/money';
import { useState } from 'react';
import { cn } from '@/lib/cn';

export { useNow } from '@/lib/use-now';

export const PAYMENT_LABELS: Record<PosPaymentMethod, string> = {
  CASH: 'Cash',
  MOBILE_MONEY: 'Mobile Money',
  CARD: 'Card',
  ROOM_FOLIO: 'Room Folio',
  BANK_TRANSFER: 'Bank Transfer',
};

const PAYMENT_ICONS: Record<PosPaymentMethod, LucideIcon> = {
  CASH: Banknote,
  MOBILE_MONEY: Smartphone,
  CARD: CreditCard,
  ROOM_FOLIO: BedDouble,
  BANK_TRANSFER: Landmark,
};

const PAYMENT_ORDER: PosPaymentMethod[] = ['CASH', 'MOBILE_MONEY', 'CARD', 'ROOM_FOLIO', 'BANK_TRANSFER'];

/** Line modifiers are staff-facing shortcuts, not guest content. */
export const QUICK_MODIFIERS = [
  'No Sugar',
  'Extra Hot',
  'Less Ice',
  'Chilled',
  'Warm',
  'Well Done',
  'Medium',
  'Mild Spice',
  'Spicy',
  'Takeaway',
];

/** Accent per category position, so the same section keeps its colour across the menu. */
export const CATEGORY_DOTS = [
  'bg-orange-500',
  'bg-sky-500',
  'bg-emerald-500',
  'bg-violet-500',
  'bg-rose-500',
  'bg-amber-500',
  'bg-teal-500',
  'bg-indigo-500',
];

export function printPosSlip(orderId: string, kind: 'KOT' | 'BILL') {
  const url = `/v1/admin/pos/orders/${orderId}/print?kind=${kind}&autoprint=1`;
  window.open(url, '_blank', 'noopener,noreferrer,width=420,height=720');
}

/** Price in the bill's currency, or null when the item has no price in it (never converted). */
export function unitPrice(item: PosItemDTO, currency: CurrencyCode): bigint | null {
  if (currency === 'USD') return item.priceMinorUSD === null ? null : BigInt(item.priceMinorUSD);
  return BigInt(item.priceMinorUGX);
}

/** Minor units → what a person types (UGX has no decimals, USD has cents). */
export function toMajorStr(minor: string | bigint, currency: CurrencyCode) {
  const n = BigInt(minor);
  if (currency !== 'USD') return n.toString();
  const cents = n % 100n;
  return cents === 0n ? (n / 100n).toString() : `${n / 100n}.${cents.toString().padStart(2, '0')}`;
}

/** Typed major amount → minor bigint; empty or zero → 0n, garbage → null. */
export function parseMajor(major: string, currency: CurrencyCode): bigint | null {
  const s = major.trim();
  if (!s || /^0+(\.0*)?$/.test(s)) return 0n;
  const m = toMinorStr(s, currency);
  return m === null ? null : BigInt(m);
}

const dayFmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Africa/Kampala',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});
/** Business date (Africa/Kampala) of a timestamp, as YYYY-MM-DD. */
export const businessDay = (d: string | Date | number) => dayFmt.format(new Date(d));

export const minutesSince = (iso: string, now: number) =>
  Math.max(0, Math.floor((now - Date.parse(iso)) / 60_000));

export function elapsedLabel(min: number) {
  if (min < 1) return 'now';
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h ${String(min % 60).padStart(2, '0')}m`;
  return `${Math.floor(h / 24)}d`;
}

type AgeTone = 'ok' | 'warn' | 'late';
/** On time within the prep target, warning up to twice it, late beyond. */
export const ageTone = (min: number, target: number): AgeTone =>
  min <= target ? 'ok' : min <= target * 2 ? 'warn' : 'late';

const AGE_CLASSES: Record<AgeTone, string> = {
  ok: 'border-emerald-500/30 bg-emerald-500/10 text-success',
  warn: 'border-amber-500/40 bg-amber-500/12 text-warning',
  late: 'border-rose-500/40 bg-rose-500/12 text-danger',
};

export function AgeBadge({
  iso,
  now,
  target = 15,
  className,
}: {
  iso: string;
  now: number;
  target?: number;
  className?: string;
}) {
  const min = minutesSince(iso, now);
  const tone = ageTone(min, target);
  return (
    <span
      title={`Opened ${min} min ago · target ${target} min`}
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-mono text-[10.5px] font-bold tabular',
        AGE_CLASSES[tone],
        tone === 'late' && 'animate-pulse',
        className,
      )}
    >
      <Timer className="size-3" />
      {elapsedLabel(min)}
    </span>
  );
}

export function PayMethodPicker({
  value,
  onChange,
  className,
}: {
  value: PosPaymentMethod;
  onChange: (m: PosPaymentMethod) => void;
  className?: string;
}) {
  return (
    <div role="radiogroup" aria-label="Payment method" className={cn('grid grid-cols-3 gap-1.5', className)}>
      {PAYMENT_ORDER.map((m) => {
        const Icon = PAYMENT_ICONS[m];
        const active = value === m;
        return (
          <button
            key={m}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(m)}
            className={cn(
              'flex flex-col items-center justify-center gap-1 rounded-xl border px-1.5 py-2 text-[11px] font-semibold transition',
              active
                ? 'border-accent bg-accent/10 text-fg ring-1 ring-accent'
                : 'border-line bg-surface text-fg-muted hover:border-line-strong hover:text-fg',
            )}
          >
            <Icon className={cn('size-4', active && 'text-accent')} />
            <span className="leading-tight">{PAYMENT_LABELS[m]}</span>
          </button>
        );
      })}
    </div>
  );
}

/** Likely notes a guest hands over for this total: exact, then the next round amounts above it. */
function tenderSuggestions(total: bigint, currency: CurrencyCode): bigint[] {
  if (total <= 0n) return [];
  const steps = currency === 'USD' ? [1000n, 2000n, 5000n, 10000n] : [10_000n, 20_000n, 50_000n, 100_000n];
  const out = new Set<bigint>([total]);
  for (const s of steps) {
    const up = ((total + s - 1n) / s) * s;
    if (up > total) out.add(up);
  }
  return [...out].sort((a, b) => (a < b ? -1 : 1)).slice(0, 4);
}

export function CashPad({
  totalMinor,
  currency,
  tendered,
  onTendered,
}: {
  totalMinor: bigint;
  currency: CurrencyCode;
  tendered: string;
  onTendered: (major: string) => void;
}) {
  const given = parseMajor(tendered, currency);
  const diff = given !== null && given > 0n ? given - totalMinor : null;
  return (
    <div className="rounded-xl border border-line bg-surface-2/40 p-2.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-semibold text-fg-muted">Cash received</span>
        {diff !== null && (
          <span
            className={cn(
              'font-mono text-[12px] font-extrabold tabular',
              diff >= 0n ? 'text-success' : 'text-danger',
            )}
          >
            {diff >= 0n ? `Change ${money(diff, currency)}` : `Short ${money(-diff, currency)}`}
          </span>
        )}
      </div>
      <div className="mt-1.5 flex flex-wrap gap-1">
        {tenderSuggestions(totalMinor, currency).map((v, i) => (
          <button
            key={v.toString()}
            type="button"
            onClick={() => onTendered(toMajorStr(v, currency))}
            className="rounded-lg border border-line bg-surface px-2 py-1 font-mono text-[11px] font-semibold tabular transition hover:border-accent hover:text-accent"
          >
            {i === 0 ? 'Exact' : money(v, currency)}
          </button>
        ))}
      </div>
      <input
        inputMode="decimal"
        className="input mt-1.5 !min-h-8 !py-1 font-mono text-xs"
        placeholder={`Amount given (${currency})`}
        value={tendered}
        onChange={(e) => onTendered(e.target.value)}
      />
    </div>
  );
}

const OTHER = '__other__';

/**
 * Pick who is serving from the staff directory (today's rota first). "Someone else…" falls back
 * to a typed name for people not in the directory yet.
 */
export function StaffPicker({
  staff,
  value,
  onChange,
  placeholder = 'Choose a person',
  allowAll,
  only,
  className,
  ariaLabel,
}: {
  staff: PosStaffDTO[];
  value: string;
  onChange: (name: string, person: PosStaffDTO | null) => void;
  placeholder?: string;
  /** Adds an "All open bills" choice that maps to an empty value. */
  allowAll?: string;
  /** Restrict the list to these names (e.g. waiters who hold open bills). */
  only?: string[];
  className?: string;
  ariaLabel?: string;
}) {
  const list = only ? staff.filter((p) => only.includes(p.name)) : staff;
  // Names on bills that are not in the directory (typed earlier) stay selectable.
  const extra = (only ?? []).filter((n) => !staff.some((p) => p.name === n));
  const known = !value || list.some((p) => p.name === value) || extra.includes(value);
  const [typing, setTyping] = useState(false);
  const onShift = list.filter((p) => p.onShiftToday);
  const others = list.filter((p) => !p.onShiftToday);

  if (typing) {
    return (
      <div className={cn('flex gap-1', className)}>
        <input
          autoFocus
          aria-label={ariaLabel}
          className="input !min-h-8 !py-1 text-xs"
          placeholder="Type a name"
          value={value}
          onChange={(e) => onChange(e.target.value, null)}
        />
        {list.length > 0 && (
          <button type="button" onClick={() => setTyping(false)} className="shrink-0 rounded-md px-2 text-[11px] font-semibold text-fg-muted hover:bg-surface-2 hover:text-fg">
            List
          </button>
        )}
      </div>
    );
  }

  const label = (p: PosStaffDTO) =>
    `${p.name}${p.jobTitle ? ` · ${p.jobTitle}` : ''}${p.onShiftToday && p.shiftType ? ` (${p.shiftType.toLowerCase()} shift)` : ''}`;

  return (
    <select
      aria-label={ariaLabel}
      className={cn('input !min-h-8 !py-1 text-xs', className)}
      value={value}
      onChange={(e) => {
        if (e.target.value === OTHER) {
          setTyping(true);
          onChange('', null);
          return;
        }
        onChange(e.target.value, list.find((p) => p.name === e.target.value) ?? null);
      }}
    >
      <option value="">{allowAll ?? placeholder}</option>
      {value && !known && <option value={value}>{value}</option>}
      {onShift.length > 0 && (
        <optgroup label="On shift today">
          {onShift.map((p) => (
            <option key={p.id} value={p.name}>
              {label(p)}
            </option>
          ))}
        </optgroup>
      )}
      {others.length > 0 && (
        <optgroup label={onShift.length ? 'Everyone else' : 'Staff'}>
          {others.map((p) => (
            <option key={p.id} value={p.name}>
              {label(p)}
            </option>
          ))}
        </optgroup>
      )}
      {extra.length > 0 && (
        <optgroup label="Named on bills">
          {extra.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </optgroup>
      )}
      {!only && <option value={OTHER}>Someone else…</option>}
    </select>
  );
}

export interface OfflineSlip {
  ref: string;
  outlet: string;
  where: string;
  servedBy: string;
  currency: string;
  lines: { name: string; qty: number; unit: string; notes?: string }[];
  discount: string;
  total: string;
  paid: string | null;
  at: string;
}

/**
 * A provisional 80 mm slip printed straight from the device while offline. It says
 * so on its face; the numbered receipt is issued when the bill syncs.
 */
export function printOfflineSlip(s: OfflineSlip) {
  const esc = (v: string) => v.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
  const fmt = (m: string | bigint) => {
    const n = Number(m);
    return s.currency === 'USD' ? `$${(n / 100).toFixed(2)}` : `UGX ${Math.round(n).toLocaleString('en')}`;
  };
  const rows = s.lines
    .map((l) => `<tr><td>${l.qty} × ${esc(l.name)}${l.notes ? `<div class="n">${esc(l.notes)}</div>` : ''}</td><td class="r">${fmt(BigInt(l.unit) * BigInt(l.qty))}</td></tr>`)
    .join('');
  const when = new Date(s.at).toLocaleString('en-GB', { timeZone: 'Africa/Kampala', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(s.ref)}</title><style>
  @page{size:80mm auto;margin:4mm}body{font:12px/1.35 ui-monospace,Menlo,monospace;width:72mm;margin:0 auto;color:#000}
  h1{font-size:14px;text-align:center;margin:0}p{margin:2px 0;text-align:center}table{width:100%;border-collapse:collapse;margin:6px 0}
  td{padding:2px 0;vertical-align:top}.r{text-align:right;white-space:nowrap}.n{font-size:10px;color:#444}.t td{border-top:1px dashed #000;font-weight:bold;padding-top:4px}
  .box{border:1px dashed #000;padding:4px;margin-top:6px;text-align:center;font-size:11px}</style></head><body>
  <h1>Reberon Hotel</h1><p>${esc(s.outlet)} · ${esc(s.where)}</p><p>${when} · ${esc(s.servedBy)}</p><p><b>${esc(s.ref)}</b></p>
  <table>${rows}${BigInt(s.discount) > 0n ? `<tr><td>Discount</td><td class="r">−${fmt(s.discount)}</td></tr>` : ''}<tr class="t"><td>Total</td><td class="r">${fmt(s.total)}</td></tr></table>
  ${s.paid ? `<p>Paid · ${esc(s.paid.replace('_', ' ').toLowerCase())}</p>` : '<p>Not yet paid</p>'}
  <div class="box">PROVISIONAL — recorded offline.<br>The numbered receipt is issued when the till reconnects.</div>
  <script>onload=()=>{print();setTimeout(()=>close(),400)}</script></body></html>`;
  const w = window.open('', '_blank', 'width=420,height=720');
  if (!w) return;
  w.document.write(html);
  w.document.close();
}
