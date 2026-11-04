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
import type { CurrencyCode, PosItemDTO, PosPaymentMethod } from '@reberon/contracts';
import { money, toMinorStr } from '@/lib/money';
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

/** Table spots and line modifiers are staff-facing shortcuts, not guest content. */
export const QUICK_SPOTS = [
  'Counter',
  'Table 1',
  'Table 2',
  'Table 3',
  'Table 4',
  'Table 5',
  'Table 6',
  'Terrace 1',
  'Terrace 2',
  'Bar Lounge',
  'VIP Lounge',
  'Room Service',
];

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
