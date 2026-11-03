'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import {
  Bell,
  BellRing,
  CheckCircle2,
  ConciergeBell,
  ExternalLink,
  Settings2,
  SprayCan,
  UtensilsCrossed,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { get } from '@/lib/api';
import { useMeQuery } from '@/lib/providers';
import { ago } from '@/lib/format';
import { cn } from '@/lib/cn';

export type SoundTone =
  | 'booking'
  | 'checkout'
  | 'ding'
  | 'pos'
  | 'register'
  | 'urgent'
  | 'soft';

export interface LiveAlertEventItem {
  id: string;
  ruleId: string;
  ruleLabel: string;
  category: string;
  urgency: 'CRITICAL' | 'HIGH' | 'NORMAL';
  action: string;
  summary: string;
  actorName: string;
  href: string;
  createdAt: string;
  targetedToMe: boolean;
  popupEnabled: boolean;
  soundEnabled: boolean;
  soundTone: SoundTone;
}

export interface PriorityStreamItem {
  id: string;
  priority: number;
  tone: 'red' | 'amber' | 'green' | 'sky';
  category: 'FRONT_DESK' | 'HOUSEKEEPING' | 'POS' | 'OPERATIONS';
  badge: string;
  title: string;
  subtitle: string;
  href: string;
  ctaLabel: string;
  timestamp: string;
}

export interface NotificationRuleDTO {
  id: string;
  label: string;
  description: string;
  category: string;
  urgency: 'CRITICAL' | 'HIGH' | 'NORMAL';
  roles: string[];
  recipientUserIds: string[];
  customEmails: string[];
  popupEnabled: boolean;
  soundEnabled: boolean;
  soundTone: SoundTone;
  emailEnabled: boolean;
}

export interface LiveConsoleCirclesMetrics {
  canDesk: boolean;
  canRooms: boolean;
  canPos: boolean;
  canReq: boolean;
  deskOverdue: number;
  deskArrivals: number;
  deskDepartures: number;
  roomsClean: number;
  roomsTotal: number;
  roomsDirty: number;
  posOpenOrders: number;
  posSettledToday: number;
  urgentReqs: number;
}

export interface LiveConsoleDTO {
  generatedAt: string;
  priorityStream: PriorityStreamItem[];
  liveAlertStream: LiveAlertEventItem[];
  rules: NotificationRuleDTO[];
  circles?: LiveConsoleCirclesMetrics;
}

/**
 * Web Audio API synthesizer for hospitality desk/housekeeping/POS chimes.
 * Works without external audio assets.
 */
export function playAlertChime(tone: SoundTone = 'booking') {
  if (typeof window === 'undefined') return;
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();

    const playNote = (
      freq: number,
      startOffset: number,
      duration: number,
      type: OscillatorType = 'sine',
      gainPeak = 0.18,
    ) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, ctx.currentTime + startOffset);

      gain.gain.setValueAtTime(0.0001, ctx.currentTime + startOffset);
      gain.gain.exponentialRampToValueAtTime(gainPeak, ctx.currentTime + startOffset + 0.02);
      gain.gain.exponentialRampToValueAtTime(
        0.0001,
        ctx.currentTime + startOffset + duration,
      );

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(ctx.currentTime + startOffset);
      osc.stop(ctx.currentTime + startOffset + duration + 0.02);
    };

    switch (tone) {
      case 'booking':
        // Bright 3-note ascending Front Desk Reception Bell (C5 -> E5 -> G5 -> C6)
        playNote(523.25, 0, 0.22, 'triangle', 0.2);
        playNote(659.25, 0.11, 0.24, 'triangle', 0.2);
        playNote(783.99, 0.22, 0.28, 'triangle', 0.22);
        playNote(1046.5, 0.34, 0.55, 'sine', 0.24);
        break;
      case 'checkout':
        // Two-Tone Departure & Housekeeping Turnover Chime (G5 -> E5 -> A5)
        playNote(783.99, 0, 0.28, 'sine', 0.22);
        playNote(659.25, 0.18, 0.28, 'sine', 0.2);
        playNote(880.0, 0.36, 0.55, 'triangle', 0.24);
        break;
      case 'pos':
        // Crisp Double Service Bell (E6 -> E6)
        playNote(1318.5, 0, 0.25, 'sine', 0.18);
        playNote(1318.5, 0.16, 0.4, 'sine', 0.22);
        break;
      case 'register':
        // Cash Register Confirmation Chord (D5 -> F#5 -> A5)
        playNote(587.33, 0, 0.18, 'triangle', 0.18);
        playNote(739.99, 0.09, 0.22, 'triangle', 0.18);
        playNote(880.0, 0.18, 0.45, 'sine', 0.22);
        break;
      case 'urgent':
        // Urgent Double-Pulse Alert
        playNote(880.0, 0, 0.16, 'sawtooth', 0.12);
        playNote(659.25, 0.15, 0.16, 'sawtooth', 0.12);
        playNote(880.0, 0.32, 0.16, 'sawtooth', 0.14);
        playNote(1046.5, 0.48, 0.4, 'triangle', 0.2);
        break;
      case 'ding':
        // Clean Single Hotel Desk Bell
        playNote(987.77, 0, 0.6, 'sine', 0.22);
        break;
      case 'soft':
      default:
        // Gentle Two-Note Tap
        playNote(698.46, 0, 0.2, 'sine', 0.15);
        playNote(880.0, 0.12, 0.35, 'sine', 0.17);
        break;
    }
  } catch {
    // Ignore audio context autoplay restrictions if user hasn't interacted yet
  }
}

export function triggerManualLiveAlert(item: Partial<LiveAlertEventItem>) {
  if (typeof window === 'undefined') return;
  const full: LiveAlertEventItem = {
    id: item.id ?? `test-${Date.now()}`,
    ruleId: item.ruleId ?? 'NEW_BOOKING',
    ruleLabel: item.ruleLabel ?? 'New Booking / Reservation Received',
    category: item.category ?? 'FRONT_DESK',
    urgency: item.urgency ?? 'HIGH',
    action: item.action ?? 'booking.confirm',
    summary:
      item.summary ??
      'New booking RB-TEST9 confirmed for Elgon View King (Guest: Dr. Kiptoo · 2 Nights)',
    actorName: item.actorName ?? 'Front Desk Live Alert',
    href: item.href ?? '/desk',
    createdAt: new Date().toISOString(),
    targetedToMe: true,
    popupEnabled: true,
    soundEnabled: item.soundEnabled ?? true,
    soundTone: item.soundTone ?? 'booking',
  };
  window.dispatchEvent(new CustomEvent('reberon:live-alert', { detail: full }));
}

export function LiveAlertCenterButton() {
  const { data: me } = useMeQuery();
  const [soundMuted, setSoundMuted] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [activeToasts, setActiveToasts] = useState<LiveAlertEventItem[]>([]);
  const seenIdsRef = useRef<Set<string>>(new Set());
  const initializedRef = useRef(false);

  useEffect(() => {
    try {
      setSoundMuted(localStorage.getItem('rb-sound-muted') === '1');
    } catch {
      // ignore
    }
  }, []);

  const toggleMute = () => {
    const next = !soundMuted;
    setSoundMuted(next);
    try {
      localStorage.setItem('rb-sound-muted', next ? '1' : '0');
    } catch {
      // ignore
    }
    if (!next) playAlertChime('soft');
  };

  const { data: consoleData } = useQuery({
    queryKey: ['live-console'],
    queryFn: () => get<LiveConsoleDTO>('/live-console'),
    enabled: !!me,
    refetchInterval: 12_000,
  });

  // Watch for new live events targeted to the current user
  useEffect(() => {
    if (!consoleData?.liveAlertStream) return;
    const stream = consoleData.liveAlertStream;

    if (!initializedRef.current) {
      for (const ev of stream) seenIdsRef.current.add(ev.id);
      initializedRef.current = true;
      return;
    }

    const newEvents: LiveAlertEventItem[] = [];
    for (const ev of stream) {
      if (!seenIdsRef.current.has(ev.id)) {
        seenIdsRef.current.add(ev.id);
        if (ev.targetedToMe && ev.popupEnabled) {
          newEvents.push(ev);
        }
      }
    }

    if (newEvents.length > 0) {
      const top = newEvents[0]!;
      if (top.soundEnabled && !soundMuted) {
        playAlertChime(top.soundTone);
      }
      setActiveToasts((prev) => [...newEvents, ...prev].slice(0, 4));
    }
  }, [consoleData, soundMuted]);

  // Listen for manual/test live alerts
  useEffect(() => {
    const handler = (e: Event) => {
      const custom = e as CustomEvent<LiveAlertEventItem>;
      const item = custom.detail;
      if (!item) return;
      if (item.soundEnabled && !soundMuted) {
        playAlertChime(item.soundTone);
      }
      setActiveToasts((prev) => [item, ...prev].slice(0, 4));
    };
    window.addEventListener('reberon:live-alert', handler);
    return () => window.removeEventListener('reberon:live-alert', handler);
  }, [soundMuted]);

  // Auto-dismiss pop-up cards after 11 seconds
  useEffect(() => {
    if (activeToasts.length === 0) return;
    const timer = setTimeout(() => {
      setActiveToasts((prev) => prev.slice(0, -1));
    }, 11_000);
    return () => clearTimeout(timer);
  }, [activeToasts]);

  const myRecentAlerts = (consoleData?.liveAlertStream ?? []).filter((e) => e.targetedToMe);

  return (
    <>
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={toggleMute}
          className={cn(
            'inline-flex h-8 items-center gap-1 rounded-lg border px-2 text-[11.5px] font-semibold transition',
            soundMuted
              ? 'border-line bg-surface text-fg-subtle hover:text-fg'
              : 'border-[#D76E1B]/40 bg-[#D76E1B]/10 text-[#D76E1B] hover:bg-[#D76E1B]/15',
          )}
          title={
            soundMuted
              ? 'Live Alert Sound Muted — Click to enable audio chimes'
              : 'Live Alert Audio Chimes Active — Click to mute'
          }
        >
          {soundMuted ? <VolumeX className="size-3.5" /> : <Volume2 className="size-3.5" />}
          <span className="hidden xl:inline">{soundMuted ? 'Muted' : 'Sound On'}</span>
        </button>

        <div className="relative">
          <button
            type="button"
            onClick={() => setDrawerOpen((v) => !v)}
            className="relative inline-flex h-8 items-center gap-1.5 rounded-lg border border-line bg-surface px-2.5 text-[11.5px] font-semibold text-fg hover:bg-surface-2"
            title="Live Role Alerts & Notification Settings"
          >
            <Bell className="size-3.5 text-[#D76E1B]" />
            <span className="hidden lg:inline">Alerts</span>
            {myRecentAlerts.length > 0 && (
              <span className="rounded-full bg-[#1A1E43] px-1.5 py-0.2 text-[10px] font-bold text-white dark:bg-[#D76E1B]">
                {myRecentAlerts.length}
              </span>
            )}
          </button>

          {drawerOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setDrawerOpen(false)} />
              <div className="fade-in absolute right-0 top-10 z-50 w-80 sm:w-96 rounded-2xl border border-line-strong bg-surface p-3 shadow-2xl">
                <div className="flex items-center justify-between border-b border-line pb-2.5">
                  <div>
                    <p className="text-xs font-extrabold uppercase tracking-wider text-fg">
                      Live Role Feed & Alerts
                    </p>
                    <p className="text-[11px] text-fg-muted">
                      Real-time pop-ups & chimes for your role
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() =>
                        triggerManualLiveAlert({
                          ruleLabel: 'Live Alert & Sound Test',
                          summary: 'Front Desk, Housekeeping & POS audio-visual alert verified.',
                          urgency: 'HIGH',
                          soundTone: 'booking',
                        })
                      }
                      className="rounded-md border border-line bg-surface-2 px-2 py-1 text-[10.5px] font-semibold text-fg hover:border-accent hover:text-accent"
                    >
                      Test Alert
                    </button>
                    <Link
                      href="/settings/notifications"
                      onClick={() => setDrawerOpen(false)}
                      className="inline-flex items-center gap-1 rounded-md bg-[#1A1E43] px-2 py-1 text-[10.5px] font-semibold text-white hover:opacity-90 dark:bg-[#D76E1B]"
                    >
                      <Settings2 className="size-3" />
                      <span>Configure</span>
                    </Link>
                  </div>
                </div>

                <ul className="mt-2 max-h-80 divide-y divide-line overflow-y-auto pr-1">
                  {myRecentAlerts.slice(0, 12).map((ev) => (
                    <li key={ev.id} className="py-2">
                      <Link
                        href={ev.href}
                        onClick={() => setDrawerOpen(false)}
                        className="group block rounded-lg p-1.5 transition hover:bg-surface-2"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span
                            className={cn(
                              'rounded px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-wider',
                              ev.urgency === 'CRITICAL'
                                ? 'bg-rose-500/15 text-danger'
                                : ev.urgency === 'HIGH'
                                  ? 'bg-amber-500/15 text-warning'
                                  : 'bg-emerald-500/15 text-success',
                            )}
                          >
                            {ev.ruleLabel}
                          </span>
                          <span className="text-[10.5px] text-fg-subtle">{ago(ev.createdAt)}</span>
                        </div>
                        <p className="mt-1 text-[12px] font-medium text-fg group-hover:text-accent">
                          {ev.summary}
                        </p>
                        <p className="mt-0.5 text-[10.5px] text-fg-subtle">By {ev.actorName}</p>
                      </Link>
                    </li>
                  ))}
                  {myRecentAlerts.length === 0 && (
                    <li className="py-6 text-center text-xs text-fg-muted">
                      No recent alerts for your role yet.
                    </li>
                  )}
                </ul>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Floating Live Pop-Up Alert Stack (Top-Right Operational Banner) */}
      {activeToasts.length > 0 && (
        <div className="fixed right-4 top-16 z-50 flex w-full max-w-sm flex-col gap-2.5 pointer-events-none">
          {activeToasts.map((t) => {
            const isCrit = t.urgency === 'CRITICAL';
            const Icon =
              t.category === 'HOUSEKEEPING'
                ? SprayCan
                : t.category === 'POS'
                  ? UtensilsCrossed
                  : t.urgency === 'NORMAL'
                    ? CheckCircle2
                    : ConciergeBell;

            return (
              <div
                key={t.id}
                className={cn(
                  'pointer-events-auto fade-in overflow-hidden rounded-2xl border p-3.5 shadow-2xl backdrop-blur-md transition-all',
                  isCrit
                    ? 'border-rose-500/60 bg-[#1A1E43] text-white'
                    : 'border-[#D76E1B]/60 bg-[#1A1E43] text-white',
                )}
              >
                <div className="flex items-start justify-between gap-2.5">
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        'grid size-8 shrink-0 place-items-center rounded-xl',
                        isCrit ? 'bg-rose-500 text-white' : 'bg-[#D76E1B] text-white',
                      )}
                    >
                      <Icon className="size-4" />
                    </span>
                    <div>
                      <div className="flex items-center gap-1.5">
                        <BellRing className="size-3 text-[#E88432] animate-bounce" />
                        <span className="text-[10px] font-extrabold uppercase tracking-wider text-[#E88432]">
                          {t.ruleLabel}
                        </span>
                      </div>
                      <p className="mt-0.5 text-[13px] font-bold leading-snug text-white">
                        {t.summary}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setActiveToasts((prev) => prev.filter((item) => item.id !== t.id))
                    }
                    className="rounded-lg p-1 text-white/60 hover:bg-white/10 hover:text-white"
                    aria-label="Dismiss alert"
                  >
                    <X className="size-4" />
                  </button>
                </div>
                <div className="mt-2.5 flex items-center justify-between border-t border-white/10 pt-2 text-[11px]">
                  <span className="text-white/70">
                    {t.actorName} · Just now
                  </span>
                  <Link
                    href={t.href}
                    onClick={() =>
                      setActiveToasts((prev) => prev.filter((item) => item.id !== t.id))
                    }
                    className="inline-flex items-center gap-1 rounded-md bg-[#D76E1B] px-2.5 py-1 font-bold text-white hover:bg-[#E88432]"
                  >
                    <span>Open Now</span>
                    <ExternalLink className="size-3" />
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
