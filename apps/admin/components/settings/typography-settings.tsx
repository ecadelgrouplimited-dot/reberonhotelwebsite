'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Check, ChevronDown, ExternalLink, Monitor, RotateCcw, Search, Smartphone, Sparkles } from 'lucide-react';
import {
  DEFAULT_TYPOGRAPHY, FONT_BY_KEY, FONT_CATALOG, readTypography, typographyVars,
  type FontKey, type HouseTypography, type Typography, type WebsiteTypography,
} from '@reberon/contracts';
import { post, WEB_URL } from '@/lib/api';
import { useCan } from '@/lib/providers';
import { cn } from '@/lib/cn';
import { Section } from '@/components/ui/bits';
import { Button } from '@/components/ui/button';

const PAIRINGS: { name: string; note: string; heading: FontKey; body: FontKey; weight: number; tracking: WebsiteTypography['headingTracking'] }[] = [
  { name: 'Reberon original', note: 'Fraunces · Inter', heading: 'fraunces', body: 'inter', weight: 380, tracking: 'tight' },
  { name: 'Classic luxury', note: 'Playfair Display · Source Sans 3', heading: 'playfair-display', body: 'source-sans-3', weight: 500, tracking: 'tight' },
  { name: 'Quiet elegance', note: 'Cormorant Garamond · Work Sans', heading: 'cormorant-garamond', body: 'work-sans', weight: 500, tracking: 'normal' },
  { name: 'Grand hotel', note: 'Bodoni Moda · Montserrat', heading: 'bodoni-moda', body: 'montserrat', weight: 500, tracking: 'tight' },
  { name: 'Garden warmth', note: 'Lora · Nunito Sans', heading: 'lora', body: 'nunito-sans', weight: 500, tracking: 'normal' },
  { name: 'Bold editorial', note: 'DM Serif Display · DM Sans', heading: 'dm-serif-display', body: 'dm-sans', weight: 400, tracking: 'tight' },
  { name: 'Modern minimal', note: 'Manrope · Manrope', heading: 'manrope', body: 'manrope', weight: 600, tracking: 'tight' },
  { name: 'Mountain lodge', note: 'Outfit · Figtree', heading: 'outfit', body: 'figtree', weight: 500, tracking: 'tight' },
];

const ff = (k: FontKey) => `var(--ff-${k}), system-ui, sans-serif`;
const SIZE_LABEL = (s: number) => (s < 0.95 ? 'Smaller' : s > 1.05 ? 'Larger' : 'Standard');

function FontPicker({ label, value, onChange, prefer, sample }: { label: string; value: FontKey; onChange: (k: FontKey) => void; prefer: 'serif' | 'sans'; sample: string }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [kind, setKind] = useState<'all' | 'serif' | 'sans'>('all');
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);
  const list = [...FONT_CATALOG]
    .filter((f) => (kind === 'all' || f.kind === kind) && (!q || `${f.family} ${f.note}`.toLowerCase().includes(q.toLowerCase())))
    .sort((a, b) => Number(b.kind === prefer) - Number(a.kind === prefer));
  const cur = FONT_BY_KEY[value];
  return (
    <div ref={ref} className="relative">
      <p className="mb-1.5 text-[12.5px] font-medium">{label}</p>
      <button type="button" onClick={() => setOpen((v) => !v)} className="flex w-full items-center gap-3 rounded-xl border border-line bg-surface px-3.5 py-2.5 text-left transition hover:border-line-strong" aria-expanded={open}>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[19px] leading-tight" style={{ fontFamily: ff(value) }}>{cur.family}</span>
          <span className="block truncate text-[11.5px] text-fg-muted">{cur.note}</span>
        </span>
        <ChevronDown className="size-4 shrink-0 text-fg-subtle" />
      </button>
      {open && (
        <div className="absolute inset-x-0 z-40 mt-1 rounded-xl border border-line bg-surface p-2 shadow-lg">
          <div className="mb-2 flex items-center gap-2">
            <label className="relative flex-1">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-fg-subtle" />
              <input autoFocus className="input !h-8 w-full pl-8 text-[12.5px]" placeholder="Search fonts" value={q} onChange={(e) => setQ(e.target.value)} />
            </label>
            <span className="flex rounded-lg border border-line p-0.5 text-[11.5px] font-semibold">
              {(['all', 'serif', 'sans'] as const).map((k) => (
                <button key={k} type="button" onClick={() => setKind(k)} className={cn('rounded-md px-2 py-1 capitalize', kind === k ? 'bg-surface-2 text-fg' : 'text-fg-muted')}>{k}</button>
              ))}
            </span>
          </div>
          <ul className="max-h-80 overflow-y-auto">
            {list.map((f) => (
              <li key={f.key}>
                <button type="button" onClick={() => { onChange(f.key); setOpen(false); }} className={cn('flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left hover:bg-surface-2', f.key === value && 'bg-surface-2')}>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[18px] leading-tight" style={{ fontFamily: ff(f.key) }}>{sample}</span>
                    <span className="block truncate text-[11.5px] text-fg-muted">
                      <b className="font-semibold text-fg">{f.family}</b> · {f.note}
                    </span>
                  </span>
                  {f.key === value && <Check className="size-4 shrink-0 text-success" />}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function Slider({ label, value, min, max, step, onChange, display, disabled, hint }: { label: string; value: number; min: number; max: number; step: number; onChange: (n: number) => void; display: string; disabled?: boolean; hint?: string }) {
  return (
    <label className={cn('block', disabled && 'opacity-50')}>
      <span className="mb-1.5 flex items-center justify-between text-[12.5px] font-medium">
        {label} <span className="font-mono text-[11.5px] text-fg-muted">{display}</span>
      </span>
      <input type="range" min={min} max={max} step={step} value={value} disabled={disabled} onChange={(e) => onChange(Number(e.target.value))} className="w-full accent-[var(--accent)]" />
      {hint && <span className="mt-0.5 block text-[11px] text-fg-subtle">{hint}</span>}
    </label>
  );
}

function Segmented<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div>
      <p className="mb-1.5 text-[12.5px] font-medium">{label}</p>
      <div className="flex rounded-lg border border-line p-0.5 text-[12px] font-semibold">
        {options.map((o) => (
          <button key={o.value} type="button" onClick={() => onChange(o.value)} className={cn('flex-1 rounded-md px-2 py-1.5', value === o.value ? 'bg-surface-2 text-fg shadow-2xs' : 'text-fg-muted hover:text-fg')}>
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/** The real website in a frame, restyled live with the unsaved choice. */
function WebsitePreview({ vars }: { vars: Record<string, string> }) {
  const can = useCan();
  const frame = useRef<HTMLIFrameElement>(null);
  const [device, setDevice] = useState<'desktop' | 'phone'>('desktop');
  const [readyN, setReadyN] = useState(0);
  const token = useQuery({ queryKey: ['preview-token'], queryFn: () => post<{ token: string }>('/preview-token'), staleTime: 45 * 60_000, enabled: can('content:read') });
  const origin = useMemo(() => new URL(WEB_URL).origin, []);
  useEffect(() => {
    const onMsg = (e: MessageEvent) => e.origin === origin && (e.data as { type?: string })?.type === 'rb:ready' && setReadyN((n) => n + 1);
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, [origin]);
  useEffect(() => {
    if (readyN) frame.current?.contentWindow?.postMessage({ type: 'rb:typography', vars }, origin);
  }, [vars, readyN, origin]);
  if (!token.data) return null;
  const width = device === 'phone' ? 390 : 1280;
  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-surface-2">
      <div className="flex items-center gap-1 border-b border-line bg-surface px-3 py-2">
        {([['desktop', Monitor], ['phone', Smartphone]] as const).map(([k, I]) => (
          <button key={k} type="button" onClick={() => setDevice(k)} className={cn('grid size-8 place-items-center rounded-full', device === k ? 'bg-fg text-bg' : 'text-fg-muted hover:bg-surface-2')} aria-label={k}>
            <I className="size-4" />
          </button>
        ))}
        <span className="ml-2 text-[12px] text-fg-subtle">The live website with your unsaved fonts — nothing changes for visitors until you save</span>
      </div>
      <PreviewScaler width={width}>
        <iframe ref={frame} src={`${WEB_URL}/api/preview?token=${token.data.token}&path=/`} title="Website preview" className="size-full" />
      </PreviewScaler>
    </div>
  );
}

function PreviewScaler({ width, children }: { width: number; children: React.ReactNode }) {
  const wrap = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.5);
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setScale(Math.min(1, (el.clientWidth - 24) / width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, [width]);
  return (
    <div ref={wrap} className="relative h-[34rem] overflow-hidden p-3">
      <div className="absolute left-1/2 top-3 overflow-hidden rounded-xl border border-line bg-white shadow-[var(--shadow-soft)]" style={{ width, height: `calc((34rem - 1.5rem) / ${scale})`, transform: `translateX(-50%) scale(${scale})`, transformOrigin: 'top center' }}>
        {children}
      </div>
    </div>
  );
}

/** A small, real-looking slice of the House in the chosen fonts. */
function HouseSample({ t }: { t: Typography }) {
  return (
    <div style={typographyVars(t, 'house') as React.CSSProperties} className="rounded-2xl border border-line bg-bg p-4">
      <div style={{ zoom: t.house.scale }} className="font-sans">
        <p className="text-[11.5px] text-fg-muted">Sun 8 Nov · Live</p>
        <p className="font-display text-[1.15rem] leading-tight" style={{ fontWeight: Number(typographyVars(t, 'house')['--heading-weight']) }}>Good morning, Denis</p>
        <div className="mt-3 rounded-xl border border-line bg-surface p-3 text-[13px]">
          <div className="flex items-center justify-between">
            <span className="font-semibold">Isaac Babirye</span>
            <span className="rounded-full bg-success/15 px-2 py-0.5 text-[11px] font-semibold text-success">In-house</span>
          </div>
          <p className="mt-0.5 text-[12px] text-fg-muted">1× Summit Suite · Rm 205 · 26 → 28 Oct · Due UGX 784,000</p>
        </div>
        <div className="mt-3 flex gap-2">
          <span className="rounded-lg bg-accent px-3 py-1.5 text-[12.5px] font-semibold text-accent-fg">Check out</span>
          <span className="rounded-lg border border-line-strong px-3 py-1.5 text-[12.5px] font-semibold">Folio</span>
        </div>
      </div>
    </div>
  );
}

export function TypographySettings({ value, onChange, editable }: { value: unknown; onChange: (t: Typography) => void; editable: boolean }) {
  const t = readTypography(value);
  const w = t.website;
  const h = t.house;
  const setW = (p: Partial<WebsiteTypography>) => onChange({ ...t, website: { ...w, ...p } });
  const setH = (p: Partial<HouseTypography>) => onChange({ ...t, house: { ...h, ...p } });
  const webVars = useMemo(() => typographyVars(t, 'website'), [t]);
  const fixedW = 'fixedWeight' in FONT_BY_KEY[w.heading];
  const fixedH = 'fixedWeight' in FONT_BY_KEY[h.heading];

  return (
    <fieldset disabled={!editable} className="grid gap-5">
      <Section
        title="Website fonts"
        description="How reberonhotel.com reads. Every font is hosted with the site, so it stays fast and private, and only the chosen fonts are downloaded."
        actions={
          <span className="flex items-center gap-2">
            <a href={WEB_URL} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[12px] font-semibold text-fg-muted hover:text-fg">
              Open the website <ExternalLink className="size-3.5" />
            </a>
            <Button size="sm" variant="ghost" icon={<RotateCcw className="size-3.5" />} onClick={() => onChange({ ...t, website: DEFAULT_TYPOGRAPHY.website })}>
              Reberon original
            </Button>
          </span>
        }
      >
        <div className="grid gap-6">
          <div>
            <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-fg-subtle"><Sparkles className="size-3.5" /> Pairings that work</p>
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
              {PAIRINGS.map((p) => {
                const on = w.heading === p.heading && w.body === p.body;
                return (
                  <button key={p.name} type="button" onClick={() => setW({ heading: p.heading, body: p.body, headingWeight: p.weight, headingTracking: p.tracking })} className={cn('rounded-xl border p-3 text-left transition hover:border-line-strong', on ? 'border-accent ring-1 ring-accent/40' : 'border-line')}>
                    <span className="block text-[22px] leading-tight" style={{ fontFamily: ff(p.heading), fontWeight: 'fixedWeight' in FONT_BY_KEY[p.heading] ? 400 : p.weight }}>Sleep on Elgon</span>
                    <span className="mt-1 block text-[12px] text-fg-muted" style={{ fontFamily: ff(p.body) }}>Ten rooms above Sipi, among the coffee.</span>
                    <span className="mt-2 flex items-center justify-between text-[11px] font-semibold">
                      {p.name} {on && <Check className="size-3.5 text-success" />}
                    </span>
                    <span className="block text-[10.5px] text-fg-subtle">{p.note}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            <FontPicker label="Headings" value={w.heading} onChange={(k) => setW({ heading: k })} prefer="serif" sample="Sleep on the shoulder of Elgon" />
            <FontPicker label="Body text" value={w.body} onChange={(k) => setW({ body: k })} prefer="sans" sample="Ten rooms above Sipi Falls, among the coffee." />
          </div>

          <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
            <Slider label="Heading weight" value={w.headingWeight} min={200} max={800} step={10} onChange={(n) => setW({ headingWeight: n })} display={fixedW ? 'one weight' : String(w.headingWeight)} disabled={fixedW} hint={fixedW ? `${FONT_BY_KEY[w.heading].family} has a single weight` : 'Lighter feels calm, heavier feels bold'} />
            <Segmented label="Heading spacing" value={w.headingTracking} onChange={(v) => setW({ headingTracking: v })} options={[{ value: 'tight', label: 'Tight' }, { value: 'normal', label: 'Normal' }, { value: 'wide', label: 'Airy' }]} />
            <Segmented label="Heading style" value={w.headingItalic ? 'italic' : 'upright'} onChange={(v) => setW({ headingItalic: v === 'italic' })} options={[{ value: 'upright', label: 'Upright' }, { value: 'italic', label: 'Italic' }]} />
            <Slider label="Text size" value={w.scale} min={0.9} max={1.15} step={0.01} onChange={(n) => setW({ scale: Math.round(n * 100) / 100 })} display={`${SIZE_LABEL(w.scale)} · ${Math.round(w.scale * 100)}%`} hint="Every text on the site, together" />
          </div>

          <WebsitePreview vars={webVars} />
        </div>
      </Section>

      <Section
        title="The House (this panel)"
        description="Fonts and interface size for staff. Applies to everyone after saving; each device remembers it for offline use."
        actions={
          <Button size="sm" variant="ghost" icon={<RotateCcw className="size-3.5" />} onClick={() => onChange({ ...t, house: DEFAULT_TYPOGRAPHY.house })}>
            House original
          </Button>
        }
      >
        <div className="grid gap-5 lg:grid-cols-[1fr_22rem]">
          <div className="grid gap-5">
            <div className="grid gap-5 sm:grid-cols-2">
              <FontPicker label="Headings" value={h.heading} onChange={(k) => setH({ heading: k })} prefer="sans" sample="Good morning, Denis" />
              <FontPicker label="Interface text" value={h.body} onChange={(k) => setH({ body: k })} prefer="sans" sample="Check in · Folio · Due UGX 784,000" />
            </div>
            <div className="grid gap-5 sm:grid-cols-2">
              <Slider label="Heading weight" value={h.headingWeight} min={300} max={800} step={10} onChange={(n) => setH({ headingWeight: n })} display={fixedH ? 'one weight' : String(h.headingWeight)} disabled={fixedH} />
              <Slider label="Interface size" value={h.scale} min={0.9} max={1.15} step={0.01} onChange={(n) => setH({ scale: Math.round(n * 100) / 100 })} display={`${SIZE_LABEL(h.scale)} · ${Math.round(h.scale * 100)}%`} hint="Larger is easier on small or far screens (reception, kitchen)" />
            </div>
          </div>
          <HouseSample t={t} />
        </div>
      </Section>
    </fieldset>
  );
}
