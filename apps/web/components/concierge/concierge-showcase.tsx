'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  Sparkles,
  UserCheck,
  FileText,
  Activity,
  BedDouble,
  ShieldCheck,
  Compass,
  Car,
  Utensils,
  BellRing,
  Printer,
  Search,
  Zap,
  MessageCircle,
  ArrowUpRight,
  CheckCircle2,
  Mic,
  QrCode,
  Mountain,
  ChevronRight,
} from 'lucide-react';
import { Contour } from '@/components/ui/contour';
import { cn } from '@/lib/cn';

function triggerConcierge(opts: {
  open?: boolean;
  fullScreen?: boolean;
  tab?: 'chat' | 'actions' | 'dossier';
  prompt?: string;
}) {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('reberon:concierge', { detail: { open: true, ...opts } }));
  }
}

const CAPABILITY_MODULES = [
  {
    id: 'identity-activity',
    badge: '01 · Identity & Live Activity',
    title: 'Personal Guest Identity & Recent Activity Ledger',
    description:
      'Sipi Concierge never treats you as an anonymous visitor. On your first interaction, it establishes your guest identity and synchronizes your complete Reberon Hotel timeline — reservations, POS dining orders, athletic club visits, waitlist claims, and front desk inquiries.',
    icon: Activity,
    accent: 'text-amber-500',
    features: [
      'Session-persistent guest profile with instant name & phone recognition',
      'Chronological feed of your most recent actions & stays at Reberon Hotel',
      'Automatic pre-filling of your identity across holds, transfers, and requests',
    ],
    actions: [
      { label: 'Check My Recent Activity', prompt: 'Check my most recent actions, bookings, and activities with Reberon Hotel.' },
      { label: 'Open Activity Dossier Tab', tab: 'dossier' as const },
    ],
  },
  {
    id: 'receipts-invoices',
    badge: '02 · Financial Documents',
    title: 'Instant Receipts, Tax Invoices & Quotations',
    description:
      'Retrieve every official numbered document issued by Reberon Hotel — payment receipts (RCT), check-out tax invoices (INV), refund notes (RFD), and event quotations (QUO). Preview and print them directly inside Sipi Concierge in A4 or 80mm thermal format.',
    icon: FileText,
    accent: 'text-emerald-500',
    features: [
      'In-widget A4 & 80mm thermal receipt viewer and one-click printer',
      'Cryptographic HMAC check-code verification against forgery',
      'Instant lookup by guest profile, booking code, or document number',
    ],
    actions: [
      { label: 'Fetch My Receipts & Invoices', prompt: 'Fetch all my official receipts, tax invoices, and quotations.' },
      { label: 'Verify a Document', tab: 'actions' as const },
    ],
  },
  {
    id: 'bookings-holds',
    badge: '03 · Live PMS Inventory',
    title: 'Real-Time Suite Rates, Quotes & 48-Hour Holds',
    description:
      'Connected directly to the Reberon Property Management System. Compare mountain-facing suites, calculate exact UGX/USD stay quotes with 30% deposit breakdowns, and lock a complimentary 48-hour reservation hold in seconds.',
    icon: BedDouble,
    accent: 'text-amber-500',
    features: [
      'Live availability for Elgon View King, Sipi Twin, Coffee Terrace Family & Summit Suite',
      'Instant 48-hour complimentary reservation hold with official RB-XXXXX code',
      'Direct links to your Stay Voucher, .ics calendar export, and online deposit checkout',
    ],
    actions: [
      { label: 'Check Weekend Suite Rates', prompt: 'Show available suites and rates for this upcoming weekend.' },
      { label: 'Hold a Suite (48h Free)', tab: 'actions' as const },
    ],
  },
  {
    id: 'in-stay-requests',
    badge: '04 · Front Desk & POS',
    title: 'In-Stay Service Requests & Highland POS Dining',
    description:
      'Already booked or in-house? Submit live guest requests straight into the Front Desk queue — from late check-out and extra beds to private Sipi Falls rangers and Highland Restaurant river trout & Arabica coffee orders.',
    icon: BellRing,
    accent: 'text-amber-500',
    features: [
      'Direct GuestRequest logging (Late Check-Out, Trail Guide, Extra Bed, Extend Stay)',
      'Live POS Kitchen & Bar menu items with current UGX pricing',
      'High-Altitude Athletic Gym, Steam & Sauna membership and pass inquiries',
    ],
    actions: [
      { label: 'Request Late Check-Out', prompt: 'I would like to request a late check-out for my reservation.' },
      { label: 'Explore POS Dining & Trout', prompt: 'Show me the Highland Restaurant menu, Mount Elgon trout, and Arabica coffee.' },
    ],
  },
  {
    id: 'trails-weather',
    badge: '05 · 1,900 m Ridge Intelligence',
    title: 'Sipi Falls Hikes, Altitude Weather & Packing',
    description:
      'Engineered for the northern shoulder of Mount Elgon at 1,900 metres ASL. Get trail durations, difficulty ratings, morning departure windows, and microclimate packing checklists for 12°C highland evenings.',
    icon: Compass,
    accent: 'text-emerald-500',
    features: [
      'Guided triple-waterfall hikes at Sipi Falls & Mount Elgon caldera treks',
      'Single-origin Kapchorwa Arabica farm-to-cup roasting experiences',
      '1,900 m ASL daytime (21–25°C) vs evening (12–15°C) packing guidance',
    ],
    actions: [
      { label: 'Sipi Falls Trail Guide', prompt: 'Show the Sipi Falls waterfall hike and Mount Elgon trekking options.' },
      { label: 'Altitude Weather & Packing', prompt: 'What is the altitude weather at 1,900m and what should I pack?' },
    ],
  },
  {
    id: 'transfers-handover',
    badge: '06 · Logistics & Human Host',
    title: 'Private 4x4 Transfers & Denis Mayamba Handover',
    description:
      'Arrange executive 4x4 Land Cruiser Prado pickups from Entebbe International Airport (EBB), Kampala, or Mbale, or hand over your conversation seamlessly to Denis Mayamba and the human concierge desk on WhatsApp.',
    icon: Car,
    accent: 'text-amber-500',
    features: [
      'Door-to-door 4x4 sanctuary transfers with chilled spring water & Arabica flask',
      'Step-by-step paved highway route guide (Kampala → Jinja → Mbale → Kapchorwa)',
      'One-tap WhatsApp escalation to Denis Mayamba (+256 760 512 691) with ticket logging',
    ],
    actions: [
      { label: 'Arrange 4x4 Airport Transfer', prompt: 'Arrange a private 4x4 sanctuary transfer from Entebbe Airport.' },
      { label: 'Connect with Denis Mayamba', prompt: 'Connect me with Denis Mayamba on WhatsApp.' },
    ],
  },
];

const HOW_IT_WORKS_STEPS = [
  {
    step: '01',
    title: 'Identify Yourself Once',
    subtitle: 'Personal Session & Record Sync',
    description:
      'When you open Sipi Concierge without an active session, it asks for your name (and optional phone or booking code). This allows the concierge to address you personally and immediately locate your bookings, receipts, and activity history.',
    ctaLabel: 'Set My Identity Now',
    onClick: () => triggerConcierge({ open: true, tab: 'chat' }),
  },
  {
    step: '02',
    title: 'Choose Action Tabs or Smart Chips',
    subtitle: 'Compact, Zero "Blur-Blur" Design',
    description:
      'Skip long typing. Switch between the Chat view, the zero-typing Quick Actions center, or your live Activity & Docs dossier — or tap contextual follow-up chips under any response.',
    ctaLabel: 'Open Quick Actions Center',
    onClick: () => triggerConcierge({ open: true, tab: 'actions' }),
  },
  {
    step: '03',
    title: 'Execute Real PMS Operations',
    subtitle: 'Holds, Lookups & Desk Requests',
    description:
      'Lock a 48-hour complimentary suite hold, check your live folio balance, request a late check-out, or arrange a 4x4 transfer. Every action writes directly to the Reberon Hotel system and alerts the Front Desk.',
    ctaLabel: 'Check Live Suites & Holds',
    onClick: () => triggerConcierge({ open: true, prompt: 'Show available suites and rates for this upcoming weekend.' }),
  },
  {
    step: '04',
    title: 'View, Print & Verify Official Docs',
    subtitle: 'A4 & 80mm Thermal Receipts & Invoices',
    description:
      'Open any official receipt (RCT), tax invoice (INV), or event quotation (QUO) inside the built-in viewer. Switch between A4 and 80mm thermal formats, print immediately, or verify authenticity codes.',
    ctaLabel: 'Fetch My Receipts & Invoices',
    onClick: () => triggerConcierge({ open: true, prompt: 'Fetch all my official receipts, tax invoices, and quotations.' }),
  },
];

const PROMPT_PLAYBOOK = [
  {
    category: 'My Account, Receipts & Activity',
    items: [
      { label: 'Check my recent activity with Reberon Hotel', prompt: 'Check my most recent actions, bookings, and activities with Reberon Hotel.' },
      { label: 'Fetch all my receipts & tax invoices', prompt: 'Fetch all my official receipts, tax invoices, and quotations.' },
      { label: 'Look up my current booking & balance', prompt: 'Look up my current reservation status and balance.' },
      { label: 'Verify receipt authenticity', prompt: 'How do I verify an official Reberon Hotel receipt or quotation?' },
    ],
  },
  {
    category: 'Suites, Quotes & 48h Holds',
    items: [
      { label: 'Compare all suites & nightly rates', prompt: 'Show available suites and rates for this upcoming weekend in a table.' },
      { label: 'Calculate a 2-night quote for Elgon View King', prompt: 'Calculate a 2-night stay quote for the Elgon View King suite.' },
      { label: 'Place a 48-hour complimentary suite hold', prompt: 'I want to place a 48-hour complimentary hold for the Elgon View King suite.' },
      { label: 'Inspect the Summit Suite floor plan & specs', prompt: 'Show me full details and amenities for the Summit Suite.' },
    ],
  },
  {
    category: 'In-Stay Requests, Dining & Trails',
    items: [
      { label: 'Request late check-out for my stay', prompt: 'Submit a late check-out request for my reservation.' },
      { label: 'See Highland Restaurant & River Trout menu', prompt: 'Show me the Highland Restaurant menu, Mount Elgon trout, and Arabica coffee.' },
      { label: 'Plan a guided Sipi Falls 3-waterfall hike', prompt: 'Show the Sipi Falls waterfall hike and Mount Elgon trekking options.' },
      { label: 'Book a private 4x4 transfer from Entebbe', prompt: 'Arrange a private 4x4 sanctuary transfer from Entebbe Airport.' },
    ],
  },
];

export function ConciergeShowcase() {
  const [selectedCategory, setSelectedCategory] = useState(0);

  return (
    <div className="overflow-hidden">
      {/* ── HERO SECTION ── */}
      <section data-hero-overlay className="tone-dark relative overflow-hidden pt-32 pb-20 md:pt-40 md:pb-28 border-b border-line">
        <Contour className="absolute inset-0 h-full w-full opacity-35 pointer-events-none" lines={12} seed={7} />
        <div className="absolute inset-0 bg-radial from-amber-500/12 via-transparent to-transparent pointer-events-none" />

        <div className="container-x relative z-10">
          <div className="grid gap-12 lg:grid-cols-[1.25fr_0.95fr] lg:items-center">
            <div className="space-y-6">
              <div className="inline-flex flex-wrap items-center gap-2 rounded-full border border-amber-500/35 bg-amber-500/10 px-3.5 py-1.5 text-xs font-medium text-amber-300">
                <span className="size-2 rounded-full bg-emerald-400 animate-pulse" />
                <span>Sipi Concierge · Autonomous Highland Host · 1,900 m ASL</span>
              </div>

              <h1 className="font-display text-step-5 sm:text-step-6 tracking-tight text-mist-50 leading-[1.04]">
                Action-first intelligence connected to the entire sanctuary.
              </h1>

              <p className="max-w-2xl text-base sm:text-lg text-fg-muted leading-relaxed">
                Meet <strong className="text-mist-50 font-semibold">Sipi Concierge</strong> — Reberon Hotel’s real-time digital host. It knows you by name, checks live suite inventory, locks 48-hour complimentary holds, tracks your recent hotel activities, and prints your official receipts and tax invoices on demand.
              </p>

              <div className="flex flex-wrap items-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => triggerConcierge({ open: true, fullScreen: true, tab: 'chat' })}
                  className="btn btn-lg cursor-pointer shadow-xl"
                >
                  <Sparkles className="size-4" />
                  <span className="btn-label">Launch Sipi Concierge (Full Screen)</span>
                </button>

                <button
                  type="button"
                  onClick={() => triggerConcierge({ open: true, tab: 'dossier' })}
                  className="btn btn-secondary btn-lg cursor-pointer"
                >
                  <FileText className="size-4" />
                  <span className="btn-label">My Activity, Receipts & Invoices</span>
                </button>
              </div>

              {/* Telemetry Highlights */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-4 border-t border-line">
                <div className="rounded-xl border border-line bg-surface p-3">
                  <div className="font-mono text-xs text-amber-400 font-semibold">IDENTITY-FIRST</div>
                  <div className="text-xs text-fg-muted mt-0.5">Personal session & CRM sync</div>
                </div>
                <div className="rounded-xl border border-line bg-surface p-3">
                  <div className="font-mono text-xs text-emerald-400 font-semibold">LIVE DOCS</div>
                  <div className="text-xs text-fg-muted mt-0.5">Receipts, Invoices & Quotes</div>
                </div>
                <div className="rounded-xl border border-line bg-surface p-3">
                  <div className="font-mono text-xs text-amber-400 font-semibold">48H HOLDS</div>
                  <div className="text-xs text-fg-muted mt-0.5">Instant PMS reservation lock</div>
                </div>
                <div className="rounded-xl border border-line bg-surface p-3">
                  <div className="font-mono text-xs text-fg font-semibold">VOICE & AUDIO</div>
                  <div className="text-xs text-fg-muted mt-0.5">Hands-free speech & readout</div>
                </div>
              </div>
            </div>

            {/* Interactive Live Console Preview Card */}
            <div className="rounded-2xl border border-line-strong bg-surface/95 p-5 sm:p-6 shadow-2xl backdrop-blur-xl space-y-5">
              <div className="flex items-center justify-between border-b border-line pb-4">
                <div className="flex items-center gap-3">
                  <div className="flex size-10 items-center justify-center rounded-xl bg-linear-to-tr from-amber-700 to-amber-500 text-white shadow-md">
                    <Sparkles className="size-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="font-serif text-base font-semibold text-mist-50">Instant Command Console</h2>
                      <span className="rounded-full bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 text-[10px] font-mono text-emerald-400">
                        ONLINE
                      </span>
                    </div>
                    <p className="text-xs text-fg-muted">Click any action below to execute it live in Sipi Concierge</p>
                  </div>
                </div>
              </div>

              <div className="grid gap-2.5">
                <button
                  type="button"
                  onClick={() =>
                    triggerConcierge({
                      open: true,
                      prompt: 'Check my most recent actions, bookings, and activities with Reberon Hotel.',
                    })
                  }
                  className="group flex items-center justify-between rounded-xl border border-line bg-surface-2/70 hover:border-amber-500/50 hover:bg-surface-2 p-3.5 text-left transition-all cursor-pointer"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-amber-500/15 text-amber-400">
                      <Activity className="size-4" />
                    </div>
                    <div>
                      <div className="text-xs font-semibold text-mist-50">Check My Recent Activity & Stays</div>
                      <div className="text-[11px] text-fg-muted">Bookings, POS dining orders, gym visits & requests</div>
                    </div>
                  </div>
                  <ArrowUpRight className="size-4 text-fg-muted group-hover:text-amber-400 transition-colors" />
                </button>

                <button
                  type="button"
                  onClick={() =>
                    triggerConcierge({
                      open: true,
                      prompt: 'Fetch all my official receipts, tax invoices, and quotations.',
                    })
                  }
                  className="group flex items-center justify-between rounded-xl border border-line bg-surface-2/70 hover:border-emerald-500/50 hover:bg-surface-2 p-3.5 text-left transition-all cursor-pointer"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-400">
                      <Printer className="size-4" />
                    </div>
                    <div>
                      <div className="text-xs font-semibold text-mist-50">Fetch & Print My Receipts / Invoices</div>
                      <div className="text-[11px] text-fg-muted">View A4 or 80mm thermal receipts (RCT, INV, QUO)</div>
                    </div>
                  </div>
                  <ArrowUpRight className="size-4 text-fg-muted group-hover:text-emerald-400 transition-colors" />
                </button>

                <button
                  type="button"
                  onClick={() => triggerConcierge({ open: true, tab: 'actions' })}
                  className="group flex items-center justify-between rounded-xl border border-line bg-surface-2/70 hover:border-amber-500/50 hover:bg-surface-2 p-3.5 text-left transition-all cursor-pointer"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-amber-500/15 text-amber-400">
                      <Zap className="size-4" />
                    </div>
                    <div>
                      <div className="text-xs font-semibold text-mist-50">Open Zero-Typing Quick Actions</div>
                      <div className="text-[11px] text-fg-muted">48h suite hold, late check-out request & document verify</div>
                    </div>
                  </div>
                  <ArrowUpRight className="size-4 text-fg-muted group-hover:text-amber-400 transition-colors" />
                </button>

                <button
                  type="button"
                  onClick={() =>
                    triggerConcierge({
                      open: true,
                      prompt: 'Show available suites and rates for this upcoming weekend.',
                    })
                  }
                  className="group flex items-center justify-between rounded-xl border border-line bg-surface-2/70 hover:border-amber-500/50 hover:bg-surface-2 p-3.5 text-left transition-all cursor-pointer"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-sky-500/15 text-sky-400">
                      <BedDouble className="size-4" />
                    </div>
                    <div>
                      <div className="text-xs font-semibold text-mist-50">Live Suite Availability & 48h Hold</div>
                      <div className="text-[11px] text-fg-muted">Check Elgon View King, Sipi Twin & Summit Suite</div>
                    </div>
                  </div>
                  <ArrowUpRight className="size-4 text-fg-muted group-hover:text-sky-400 transition-colors" />
                </button>
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-line text-[11px] text-fg-muted">
                <span className="flex items-center gap-1.5">
                  <ShieldCheck className="size-3.5 text-emerald-400" />
                  <span>Direct PMS & Document Vault Integration</span>
                </span>
                <Link href="/verify" className="text-amber-400 hover:underline">
                  Verify Portal →
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── SECTION 2: HOW TO USE SIPI CONCIERGE (4-STEP WORKFLOW) ── */}
      <section className="section-y border-b border-line bg-surface/40">
        <div className="container-x">
          <div className="max-w-2xl space-y-3">
            <p className="eyebrow">How It Works</p>
            <h2 className="text-step-4">Designed for speed, identity, and real actions.</h2>
            <p className="text-fg-muted">
              Unlike traditional chatbots that reply with long paragraphs of generic text, Sipi Concierge operates as your personal command interface to Reberon Hotel.
            </p>
          </div>

          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {HOW_IT_WORKS_STEPS.map((s) => (
              <div
                key={s.step}
                className="flex flex-col justify-between rounded-2xl border border-line bg-surface p-6 shadow-xs hover:border-amber-500/40 transition-colors"
              >
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-2xl font-bold text-amber-600 dark:text-amber-400">{s.step}</span>
                    <span className="rounded-full bg-surface-2 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-fg-muted border border-line">
                      {s.subtitle}
                    </span>
                  </div>
                  <h3 className="text-lg font-semibold text-fg">{s.title}</h3>
                  <p className="text-sm text-fg-muted leading-relaxed">{s.description}</p>
                </div>

                <button
                  type="button"
                  onClick={s.onClick}
                  className="mt-6 inline-flex items-center gap-1.5 text-xs font-semibold text-amber-600 dark:text-amber-400 hover:underline cursor-pointer"
                >
                  <span>{s.ctaLabel}</span>
                  <ChevronRight className="size-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── SECTION 3: FULL SYSTEM CAPABILITIES MATRIX ── */}
      <section className="section-y border-b border-line">
        <div className="container-x">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
            <div className="max-w-2xl space-y-3">
              <p className="eyebrow">System Capabilities</p>
              <h2 className="text-step-4">Every department of Reberon Hotel at your fingertips.</h2>
              <p className="text-fg-muted">
                Sipi Concierge is wired directly into our reservations engine, document sequence ledger, restaurant POS, athletic club, and front desk inbox.
              </p>
            </div>
            <button
              type="button"
              onClick={() => triggerConcierge({ open: true, fullScreen: true })}
              className="btn self-start md:self-auto cursor-pointer"
            >
              <Sparkles className="size-4" />
              <span className="btn-label">Open Fullscreen Concierge</span>
            </button>
          </div>

          <div className="mt-12 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {CAPABILITY_MODULES.map((mod) => {
              const Icon = mod.icon;
              return (
                <div
                  key={mod.id}
                  className="flex flex-col justify-between rounded-2xl border border-line bg-surface p-6 shadow-xs hover:border-line-strong transition-all"
                >
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-[11px] font-semibold uppercase tracking-wider text-fg-muted">
                        {mod.badge}
                      </span>
                      <div className="flex size-10 items-center justify-center rounded-xl bg-surface-2 border border-line">
                        <Icon className={cn('size-5', mod.accent)} />
                      </div>
                    </div>

                    <h3 className="text-xl font-semibold text-fg">{mod.title}</h3>
                    <p className="text-sm text-fg-muted leading-relaxed">{mod.description}</p>

                    <ul className="space-y-2 pt-2 border-t border-line/60 text-xs text-fg-muted">
                      {mod.features.map((feat, i) => (
                        <li key={i} className="flex items-start gap-2">
                          <CheckCircle2 className="size-3.5 text-emerald-500 shrink-0 mt-0.5" />
                          <span>{feat}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="mt-6 pt-4 border-t border-line flex flex-wrap gap-2">
                    {mod.actions.map((act, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() =>
                          triggerConcierge({
                            open: true,
                            tab: act.tab,
                            prompt: act.prompt,
                          })
                        }
                        className={cn(
                          'rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors cursor-pointer inline-flex items-center gap-1',
                          i === 0
                            ? 'bg-amber-600 text-white hover:bg-amber-700'
                            : 'border border-line bg-surface-2 text-fg hover:border-amber-500/40',
                        )}
                      >
                        <span>{act.label}</span>
                        <ChevronRight className="size-3" />
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── SECTION 4: INTERACTIVE PROMPT PLAYBOOK ── */}
      <section className="section-y tone-warm">
        <div className="container-x">
          <div className="max-w-2xl space-y-3">
            <p className="eyebrow">Interactive Playbook</p>
            <h2 className="text-step-4">Try live commands right now.</h2>
            <p className="text-fg-muted">
              Select any category below and click a command to watch Sipi Concierge execute it against the live Reberon Hotel system.
            </p>
          </div>

          <div className="mt-8 flex flex-wrap gap-2">
            {PROMPT_PLAYBOOK.map((cat, idx) => (
              <button
                key={cat.category}
                type="button"
                onClick={() => setSelectedCategory(idx)}
                className={cn(
                  'rounded-full px-4 py-2 text-xs font-semibold transition-colors cursor-pointer border',
                  selectedCategory === idx
                    ? 'bg-fg text-bg border-fg'
                    : 'bg-surface text-fg-muted border-line hover:text-fg',
                )}
              >
                {cat.category}
              </button>
            ))}
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            {PROMPT_PLAYBOOK[selectedCategory]?.items.map((item, i) => (
              <button
                key={i}
                type="button"
                onClick={() => triggerConcierge({ open: true, prompt: item.prompt })}
                className="group flex items-center justify-between rounded-2xl border border-line bg-surface p-5 text-left hover:border-amber-500/50 hover:shadow-md transition-all cursor-pointer"
              >
                <div className="space-y-1 pr-4">
                  <div className="text-sm font-semibold text-fg group-hover:text-amber-600 dark:group-hover:text-amber-400 transition-colors">
                    {item.label}
                  </div>
                  <div className="font-mono text-xs text-fg-muted">"{item.prompt}"</div>
                </div>
                <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-surface-2 group-hover:bg-amber-600 group-hover:text-white transition-colors">
                  <ArrowUpRight className="size-4" />
                </div>
              </button>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
