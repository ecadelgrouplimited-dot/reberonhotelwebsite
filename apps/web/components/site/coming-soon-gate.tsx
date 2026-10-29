'use client';
import { useCallback, useEffect, useRef, useState, useActionState } from 'react';
import {
  ArrowRight,
  Bed,
  Calendar,
  Check,
  CheckCircle2,
  Clock,
  Compass,
  Copy,
  Eye,
  EyeOff,
  Headphones,
  KeyRound,
  Layers,
  LoaderCircle,
  Lock,
  LogOut,
  Mail,
  MapPin,
  MessageCircle,
  Mountain,
  Phone,
  Radio,
  Send,
  ShieldCheck,
  Sparkles,
  Users,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import type { SiteDTO, RoomTypeCardDTO } from '@reberon/contracts';
import { t } from '@reberon/contracts/text';
import { formatMoney, whatsappLink } from '@reberon/utils';
import { submitWaitlist, submitEnquiry, type FormState } from '@/app/actions';
import { useIdempotencyKey } from '@/components/forms/use-idempotency';
import { useSite } from './site-provider';

const API = process.env.NEXT_PUBLIC_API_URL ?? '';

const initialFormState: FormState = { status: 'idle' };

export function ComingSoonGate({ site, rooms = [] }: { site: SiteDTO; rooms?: RoomTypeCardDTO[] }) {
  const siteCtx = useSite();
  const allRooms = rooms.length > 0 ? rooms : siteCtx.rooms ?? [];
  const currency = siteCtx.currency;
  const setCurrency = siteCtx.setCurrency;

  // Active Interactive Tab: 'waitlist' | 'suites' | 'concierge' | 'enquiry'
  const [activeTab, setActiveTab] = useState<'waitlist' | 'suites' | 'concierge' | 'enquiry'>('waitlist');

  // Staff Sign-in Dialog State
  const [loginOpen, setLoginOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberEmail, setRememberEmail] = useState(true);
  const [busy, setBusy] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);

  // Live Kapchorwa Clock
  const [kapchorwaTime, setKapchorwaTime] = useState<string>('');

  // Pre-selected room for enquiry
  const [enquiryRoomSlug, setEnquiryRoomSlug] = useState<string>('');

  // Copy reference status
  const [copiedRef, setCopiedRef] = useState<string | null>(null);

  // Ambient Highland Sound Synthesizer (Web Audio API)
  const [audioPlaying, setAudioPlaying] = useState(false);
  const audioContextRef = useRef<AudioContext | null>(null);
  const noiseNodeRef = useRef<AudioNode | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);

  // Form states using server actions
  const [waitlistState, waitlistAction, waitlistPending] = useActionState(submitWaitlist, initialFormState);
  const [enquiryState, enquiryAction, enquiryPending] = useActionState(submitEnquiry, initialFormState);
  const idempotencyKey = useIdempotencyKey();

  // Load remembered email on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem('rb-saved-staff-email');
      if (saved) setEmail(saved);
    } catch {}
  }, []);

  // Update Kapchorwa Time Clock (EAT = UTC+3)
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      const formatter = new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Africa/Kampala',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true,
      });
      setKapchorwaTime(formatter.format(now));
    };
    updateTime();
    const timer = setInterval(updateTime, 1000);
    return () => clearInterval(timer);
  }, []);

  // Ambient Wind Audio Synthesizer toggle
  const toggleAmbientSound = useCallback(() => {
    if (audioPlaying) {
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        audioContextRef.current.close().catch(() => {});
        audioContextRef.current = null;
      }
      setAudioPlaying(false);
    } else {
      try {
        const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        const ctx = new AudioCtx();
        audioContextRef.current = ctx;

        // Generate gentle, soothing pink/brown noise for mountain breeze
        const bufferSize = ctx.sampleRate * 2;
        const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const output = noiseBuffer.getChannelData(0);
        let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
        for (let i = 0; i < bufferSize; i++) {
          const white = Math.random() * 2 - 1;
          b0 = 0.99886 * b0 + white * 0.0555179;
          b1 = 0.99332 * b1 + white * 0.0750759;
          b2 = 0.96900 * b2 + white * 0.1538520;
          b3 = 0.86650 * b3 + white * 0.3104856;
          b4 = 0.55000 * b4 + white * 0.5329522;
          b5 = -0.7616 * b5 - white * 0.0168980;
          output[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.04;
          b6 = white * 0.115926;
        }

        const whiteNoise = ctx.createBufferSource();
        whiteNoise.buffer = noiseBuffer;
        whiteNoise.loop = true;

        // Low-pass filter to sound like mountain ridge wind
        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(320, ctx.currentTime);

        // Slow LFO for gentle wind swell
        const lfo = ctx.createOscillator();
        lfo.frequency.setValueAtTime(0.15, ctx.currentTime);
        const lfoGain = ctx.createGain();
        lfoGain.gain.setValueAtTime(140, ctx.currentTime);
        lfo.connect(lfoGain);
        lfoGain.connect(filter.frequency);

        const gainNode = ctx.createGain();
        gainNode.gain.setValueAtTime(0.2, ctx.currentTime);
        gainNodeRef.current = gainNode;

        whiteNoise.connect(filter);
        filter.connect(gainNode);
        gainNode.connect(ctx.destination);

        whiteNoise.start();
        lfo.start();
        noiseNodeRef.current = whiteNoise;
        setAudioPlaying(true);
      } catch {
        setAudioPlaying(false);
      }
    }
  }, [audioPlaying]);

  // Clean up audio on unmount
  useEffect(() => {
    return () => {
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        audioContextRef.current.close().catch(() => {});
      }
    };
  }, []);

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setLoginError(null);
    try {
      if (rememberEmail) {
        localStorage.setItem('rb-saved-staff-email', email.trim().toLowerCase());
      } else {
        localStorage.removeItem('rb-saved-staff-email');
      }

      const res = await fetch(`${API}/v1/admin/auth/login`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'content-type': 'application/json',
          'x-reberon-client': 'admin',
        },
        body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.detail ?? 'Invalid credentials. Please verify your staff email and password.');
      }
      window.location.reload();
    } catch (err) {
      setLoginError((err as Error).message);
      setBusy(false);
    }
  }

  function handleCopyReference(refCode: string) {
    navigator.clipboard?.writeText(refCode).then(() => {
      setCopiedRef(refCode);
      setTimeout(() => setCopiedRef(null), 3000);
    });
  }

  function handleEnquireForRoom(roomSlug: string) {
    setEnquiryRoomSlug(roomSlug);
    setActiveTab('enquiry');
    window.scrollTo({ top: 380, behavior: 'smooth' });
  }

  const phone = site.contact.phones?.[0] ?? '+256 768 262409';
  const wa = site.contact.whatsapp ?? phone;
  const officialEmail = site.contact.email || 'hello@reberonhotel.com';
  const addressText = t(site.contact.address) || 'Kapchorwa, along the Mbale–Kapchorwa Highway, Mount Elgon, Eastern Uganda';

  return (
    <div className="relative min-h-screen bg-[#080b09] text-[#f4f5f1] selection:bg-[#cf8f2e] selection:text-[#0b0e0c]">
      {/* Topographic Contour Vectors & Ambient Atmospheric Glows */}
      <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
        <svg
          viewBox="0 0 1440 900"
          className="absolute -top-20 left-1/2 h-[1200px] w-[1800px] -translate-x-1/2 opacity-[0.06]"
          fill="none"
          stroke="#cf8f2e"
          strokeWidth="1.2"
          aria-hidden="true"
        >
          <path d="M-100,200 Q200,120 500,250 T1100,180 T1600,320" />
          <path d="M-100,340 Q250,220 600,370 T1200,280 T1600,450" />
          <path d="M-100,480 Q300,340 700,500 T1300,420 T1600,600" />
          <path d="M-100,620 Q350,490 800,630 T1400,560 T1600,750" />
          <path d="M-100,760 Q400,620 900,780 T1500,700 T1600,890" />
          <circle cx="950" cy="380" r="140" strokeDasharray="4 6" opacity="0.4" />
          <circle cx="950" cy="380" r="280" strokeDasharray="3 8" opacity="0.25" />
        </svg>

        {/* Ambient Glow Orbs */}
        <div
          className="absolute -top-32 left-1/4 h-96 w-96 rounded-full blur-[140px] opacity-25"
          style={{ background: 'radial-gradient(circle, #cf8f2e 0%, transparent 70%)' }}
        />
        <div
          className="absolute top-1/2 -right-20 h-[500px] w-[500px] rounded-full blur-[160px] opacity-15"
          style={{ background: 'radial-gradient(circle, #b83b3b 0%, transparent 70%)' }}
        />
      </div>

      {/* Top Header Bar */}
      <header className="relative z-20 border-b border-white/10 bg-[#080b09]/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-8">
          {/* Logo & Altitude Marker */}
          <div className="flex items-center gap-3.5">
            <div className="flex size-10 items-center justify-center rounded-xl border border-[#cf8f2e]/30 bg-[#cf8f2e]/10 text-[#cf8f2e]">
              <Mountain className="size-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-display text-lg font-semibold tracking-tight text-white">{site.name}</span>
                <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 font-mono text-[9px] uppercase tracking-wider text-emerald-400">
                  Concierge Live
                </span>
              </div>
              <p className="font-mono text-[11px] text-white/55">
                Kapchorwa · 1,900 m ASL · Mt. Elgon Escarpment
              </p>
            </div>
          </div>

          {/* Controls: Clock, Ambient Sound, Currency, Staff Access */}
          <div className="flex items-center gap-2.5 sm:gap-4">
            {/* Live Highland Clock */}
            <div className="hidden items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3.5 py-1.5 font-mono text-xs text-white/80 md:flex">
              <Clock className="size-3.5 text-[#cf8f2e]" />
              <span>{kapchorwaTime || 'Kapchorwa GMT+3'}</span>
            </div>

            {/* Ambient Mountain Audio Generator */}
            <button
              type="button"
              onClick={toggleAmbientSound}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition cursor-pointer ${
                audioPlaying
                  ? 'border-[#cf8f2e] bg-[#cf8f2e]/15 text-[#cf8f2e] shadow-[0_0_15px_rgba(207,143,46,0.25)]'
                  : 'border-white/10 bg-white/[0.04] text-white/70 hover:border-white/20 hover:text-white'
              }`}
              title={audioPlaying ? 'Mute mountain breeze audio' : 'Play high-altitude ambient breeze'}
            >
              {audioPlaying ? <Volume2 className="size-3.5 animate-pulse text-[#cf8f2e]" /> : <VolumeX className="size-3.5" />}
              <span className="hidden sm:inline">{audioPlaying ? 'Highland Wind On' : 'Ambient Breeze'}</span>
            </button>

            {/* Currency Toggle */}
            <div className="hidden rounded-full border border-white/10 bg-white/[0.04] p-0.5 text-[11px] font-semibold sm:inline-flex">
              <button
                type="button"
                onClick={() => setCurrency('UGX')}
                className={`rounded-full px-2.5 py-1 transition cursor-pointer ${
                  currency === 'UGX' ? 'bg-[#cf8f2e] text-[#080b09]' : 'text-white/60 hover:text-white'
                }`}
              >
                UGX
              </button>
              <button
                type="button"
                onClick={() => setCurrency('USD')}
                className={`rounded-full px-2.5 py-1 transition cursor-pointer ${
                  currency === 'USD' ? 'bg-[#cf8f2e] text-[#080b09]' : 'text-white/60 hover:text-white'
                }`}
              >
                USD
              </button>
            </div>

            {/* Staff Sign-in Button */}
            <button
              type="button"
              onClick={() => setLoginOpen(true)}
              className="inline-flex items-center gap-2 rounded-full border border-[#cf8f2e]/40 bg-[#cf8f2e]/10 px-3.5 py-1.5 text-xs font-medium text-[#cf8f2e] transition hover:bg-[#cf8f2e]/20 cursor-pointer"
            >
              <KeyRound className="size-3.5" />
              <span>Staff Preview</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="relative z-10 mx-auto max-w-7xl px-4 py-8 sm:px-8 sm:py-12">
        {/* Hero Banner Section */}
        <div className="relative overflow-hidden rounded-3xl border border-white/12 bg-gradient-to-b from-white/[0.05] via-white/[0.02] to-transparent p-6 backdrop-blur-2xl sm:p-10 lg:p-12">
          {/* Top Status & Milestone Bar */}
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-6">
            <div className="inline-flex items-center gap-2.5 rounded-full border border-[#cf8f2e]/30 bg-[#cf8f2e]/10 px-4 py-1.5 text-xs font-medium text-[#cf8f2e]">
              <span className="relative flex size-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#cf8f2e] opacity-75" />
                <span className="relative inline-flex size-2 rounded-full bg-[#cf8f2e]" />
              </span>
              <span>System Architectural Upgrades &amp; Luxury Calibration</span>
            </div>

            <div className="flex items-center gap-4 font-mono text-xs text-white/60">
              <span className="flex items-center gap-1.5 text-emerald-400">
                <CheckCircle2 className="size-3.5" /> Direct Bookings Open via Desk
              </span>
              <span className="hidden sm:inline text-white/30">|</span>
              <span className="hidden sm:inline">Check-in: 14:00 · Check-out: 10:30</span>
            </div>
          </div>

          {/* Hero Typography */}
          <div className="mt-8 grid gap-8 lg:grid-cols-[1.4fr_0.9fr] lg:items-center">
            <div>
              <p className="font-mono text-xs uppercase tracking-widest text-[#cf8f2e]">
                {t(site.openingLabel) || 'The Escarpment Sanctuary'} · Kapchorwa, Uganda
              </p>
              <h1 className="mt-3 font-display text-3xl font-light leading-[1.08] tracking-tight text-white sm:text-5xl lg:text-6xl">
                A calm high-altitude sanctuary on the shoulder of Mount Elgon.
              </h1>
              <p className="mt-5 max-w-2xl text-base leading-relaxed text-white/70 sm:text-lg">
                We are applying architectural and security enhancements to our online booking engine. While the public self-serve portal is calibrated, our <strong className="text-white">Front Desk, WhatsApp Concierge, and Private Event Reservations</strong> are 100% active and attending to all guests.
              </p>

              {/* Quick Actions */}
              <div className="mt-8 flex flex-wrap items-center gap-3.5">
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab('waitlist');
                    document.getElementById('feature-tabs')?.scrollIntoView({ behavior: 'smooth' });
                  }}
                  className="inline-flex items-center gap-2 rounded-full bg-[#cf8f2e] px-6 py-3 text-sm font-semibold text-[#080b09] shadow-lg transition hover:bg-[#deb041] cursor-pointer"
                >
                  <Sparkles className="size-4" />
                  <span>Join Priority Launch List</span>
                </button>

                {wa && (
                  <a
                    href={whatsappLink(wa, 'Hello Reberon Hotel Concierge, I would like to reserve a stay or enquire about upcoming dates.')}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-2 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-5 py-3 text-sm font-semibold text-emerald-300 transition hover:bg-emerald-500/20"
                  >
                    <MessageCircle className="size-4" />
                    <span>WhatsApp Front Desk</span>
                  </a>
                )}

                <a
                  href={`tel:${phone.replace(/\s+/g, '')}`}
                  className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-5 py-3 text-sm font-medium text-white transition hover:border-white/30 hover:bg-white/10"
                >
                  <Phone className="size-4 text-[#cf8f2e]" />
                  <span>Call {phone}</span>
                </a>
              </div>
            </div>

            {/* Highland Status & Diagnostic HUD Card */}
            <div className="rounded-2xl border border-white/10 bg-[#0e1310]/80 p-6 backdrop-blur-xl">
              <div className="flex items-center justify-between border-b border-white/10 pb-4">
                <div>
                  <h3 className="font-display text-lg text-white">Sanctuary Health &amp; Readiness</h3>
                  <p className="font-mono text-[11px] text-[#cf8f2e]">Mount Elgon High-Altitude Station</p>
                </div>
                <Radio className="size-4 text-emerald-400 animate-pulse" />
              </div>

              {/* Progress Bar */}
              <div className="mt-5">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-white/70">Gateway Architecture &amp; Sync</span>
                  <span className="font-mono font-semibold text-[#cf8f2e]">96% Complete</span>
                </div>
                <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-white/10">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-[#b83b3b] via-[#cf8f2e] to-emerald-400 transition-all duration-1000"
                    style={{ width: '96%' }}
                  />
                </div>
              </div>

              {/* Live Diagnostics List */}
              <div className="mt-5 grid gap-3 font-mono text-xs">
                <div className="flex items-center justify-between rounded-xl bg-white/[0.03] p-2.5">
                  <span className="text-white/70">Front Desk &amp; Concierge</span>
                  <span className="inline-flex items-center gap-1.5 text-emerald-400">
                    <span className="size-2 rounded-full bg-emerald-400" /> Operational 24/7
                  </span>
                </div>
                <div className="flex items-center justify-between rounded-xl bg-white/[0.03] p-2.5">
                  <span className="text-white/70">High-Altitude Suites</span>
                  <span className="inline-flex items-center gap-1.5 text-emerald-400">
                    <span className="size-2 rounded-full bg-emerald-400" /> Open for Enquiries
                  </span>
                </div>
                <div className="flex items-center justify-between rounded-xl bg-white/[0.03] p-2.5">
                  <span className="text-white/70">Escarpment Weather</span>
                  <span className="text-white/90">19°C · Crisp Mountain Air</span>
                </div>
                <div className="flex items-center justify-between rounded-xl bg-white/[0.03] p-2.5">
                  <span className="text-white/70">Public Booking Engine</span>
                  <span className="inline-flex items-center gap-1.5 text-[#cf8f2e]">
                    <span className="size-2 rounded-full bg-[#cf8f2e] animate-ping" /> Security Calibration
                  </span>
                </div>
              </div>

              {/* Check-in / Location footer */}
              <div className="mt-5 flex items-center justify-between pt-4 border-t border-white/10 text-xs text-white/50">
                <span>Elevation: 1,900 m</span>
                <span>Above Sipi Falls</span>
                <span>East Africa (EAT)</span>
              </div>
            </div>
          </div>
        </div>

        {/* Interactive Feature Console Section */}
        <section id="feature-tabs" className="mt-12">
          {/* Tab Navigation Controls */}
          <div className="flex flex-wrap items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/[0.03] p-1.5 backdrop-blur-md sm:justify-start">
            <button
              type="button"
              onClick={() => setActiveTab('waitlist')}
              className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-semibold transition cursor-pointer ${
                activeTab === 'waitlist'
                  ? 'bg-[#cf8f2e] text-[#080b09] shadow-md'
                  : 'text-white/70 hover:bg-white/5 hover:text-white'
              }`}
            >
              <Sparkles className="size-3.5" />
              <span>Priority Launch Waitlist</span>
              <span className="rounded-full bg-black/20 px-1.5 py-0.2 font-mono text-[10px]">VIP</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('suites')}
              className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-semibold transition cursor-pointer ${
                activeTab === 'suites'
                  ? 'bg-[#cf8f2e] text-[#080b09] shadow-md'
                  : 'text-white/70 hover:bg-white/5 hover:text-white'
              }`}
            >
              <Bed className="size-3.5" />
              <span>Suites &amp; Sanctuary Preview</span>
              <span className="rounded-full bg-black/20 px-1.5 py-0.2 font-mono text-[10px]">{allRooms.length || 4} Rooms</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('concierge')}
              className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-semibold transition cursor-pointer ${
                activeTab === 'concierge'
                  ? 'bg-[#cf8f2e] text-[#080b09] shadow-md'
                  : 'text-white/70 hover:bg-white/5 hover:text-white'
              }`}
            >
              <Compass className="size-3.5" />
              <span>24/7 Concierge Desk</span>
              <span className="rounded-full bg-black/20 px-1.5 py-0.2 font-mono text-[10px]">Direct</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('enquiry')}
              className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-semibold transition cursor-pointer ${
                activeTab === 'enquiry'
                  ? 'bg-[#cf8f2e] text-[#080b09] shadow-md'
                  : 'text-white/70 hover:bg-white/5 hover:text-white'
              }`}
            >
              <Send className="size-3.5" />
              <span>Direct Booking &amp; Event Request</span>
              <span className="rounded-full bg-black/20 px-1.5 py-0.2 font-mono text-[10px]">Enquiry</span>
            </button>
          </div>

          {/* TAB 1: PRIORITY LAUNCH WAITLIST */}
          {activeTab === 'waitlist' && (
            <div className="mt-6 grid gap-8 lg:grid-cols-[1.1fr_1.3fr]">
              <div className="rounded-3xl border border-white/10 bg-white/[0.02] p-6 backdrop-blur-xl sm:p-8">
                <span className="font-mono text-xs uppercase tracking-widest text-[#cf8f2e]">Inaugural Access</span>
                <h2 className="mt-2 font-display text-2xl font-normal text-white sm:text-3xl">
                  Claim your place on the First-Stay List.
                </h2>
                <p className="mt-4 text-sm leading-relaxed text-white/70">
                  When our live reservation calendar unlocks, names on the priority waitlist are contacted personally before dates become available to the general public.
                </p>

                <div className="mt-8 space-y-4">
                  <div className="flex items-start gap-3.5 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                    <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-[#cf8f2e]/15 text-[#cf8f2e]">
                      <Sparkles className="size-4" />
                    </div>
                    <div>
                      <h4 className="font-semibold text-sm text-white">Inaugural Highland Pricing</h4>
                      <p className="text-xs text-white/60">Waitlist guests receive special launch privileges and mountain coffee degustations.</p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3.5 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                    <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-[#cf8f2e]/15 text-[#cf8f2e]">
                      <Calendar className="size-4" />
                    </div>
                    <div>
                      <h4 className="font-semibold text-sm text-white">First Calendar Access</h4>
                      <p className="text-xs text-white/60">Priority choice of peak weekend suites, holiday stays, and marathon training camp dates.</p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3.5 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                    <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-[#cf8f2e]/15 text-[#cf8f2e]">
                      <ShieldCheck className="size-4" />
                    </div>
                    <div>
                      <h4 className="font-semibold text-sm text-white">Zero Obligation</h4>
                      <p className="text-xs text-white/60">Joining the waitlist requires no payment. Confirmation is only required when dates are agreed.</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Waitlist Form Card */}
              <div className="rounded-3xl border border-white/12 bg-[#0e1310]/90 p-6 backdrop-blur-2xl sm:p-8">
                {waitlistState.status === 'success' && waitlistState.reference ? (
                  <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-6 text-center sm:p-8">
                    <div className="mx-auto grid size-12 place-items-center rounded-full bg-emerald-500/20 text-emerald-400">
                      <CheckCircle2 className="size-6" />
                    </div>
                    <h3 className="mt-4 font-display text-2xl text-white">You are on the First-Stay List</h3>
                    <p className="mt-2 text-sm text-white/75">
                      Your priority reservation hold has been registered with the Kapchorwa front desk.
                    </p>

                    <div className="mt-6 inline-flex items-center gap-3 rounded-2xl border border-white/15 bg-black/40 px-5 py-3 font-mono text-sm">
                      <span className="text-white/60">Reference:</span>
                      <strong className="text-[#cf8f2e]">{waitlistState.reference}</strong>
                      <button
                        type="button"
                        onClick={() => handleCopyReference(waitlistState.reference!)}
                        className="rounded-md p-1 text-white/60 hover:text-white transition cursor-pointer"
                        title="Copy reference code"
                      >
                        {copiedRef === waitlistState.reference ? <Check className="size-4 text-emerald-400" /> : <Copy className="size-4" />}
                      </button>
                    </div>

                    <p className="mt-6 text-xs text-white/55">
                      A member of our reservations desk will contact you via WhatsApp or phone when the calendar opens for booking.
                    </p>
                  </div>
                ) : (
                  <form action={waitlistAction} className="grid gap-4.5" noValidate>
                    <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
                    {/* Honeypot anti-spam */}
                    <input type="text" name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden="true" />

                    <div>
                      <h3 className="font-display text-xl text-white">Join the Priority List</h3>
                      <p className="text-xs text-white/60">Fill in your travel preferences below.</p>
                    </div>

                    {waitlistState.status === 'error' && waitlistState.message && (
                      <div role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300">
                        {waitlistState.message}
                      </div>
                    )}

                    <div className="grid gap-4 sm:grid-cols-2">
                      <label className="grid gap-1.5 text-xs">
                        <span className="font-medium text-white/80">
                          Your Name <span className="text-[#cf8f2e]">*</span>
                        </span>
                        <input
                          type="text"
                          name="name"
                          required
                          autoComplete="name"
                          defaultValue={waitlistState.values?.name}
                          placeholder="e.g. Sarah Chelangat"
                          className="h-11 rounded-xl border border-white/15 bg-black/40 px-3.5 text-sm text-white placeholder:text-white/30 focus:border-[#cf8f2e] focus:outline-none"
                        />
                        {waitlistState.fieldErrors?.name && (
                          <span className="text-[11px] text-red-400">{waitlistState.fieldErrors.name}</span>
                        )}
                      </label>

                      <label className="grid gap-1.5 text-xs">
                        <span className="font-medium text-white/80">
                          Phone or WhatsApp <span className="text-[#cf8f2e]">*</span>
                        </span>
                        <input
                          type="tel"
                          name="phone"
                          required
                          inputMode="tel"
                          autoComplete="tel"
                          defaultValue={waitlistState.values?.phone}
                          placeholder="07xx xxx xxx or +256..."
                          className="h-11 rounded-xl border border-white/15 bg-black/40 px-3.5 text-sm text-white placeholder:text-white/30 focus:border-[#cf8f2e] focus:outline-none"
                        />
                        {waitlistState.fieldErrors?.phone && (
                          <span className="text-[11px] text-red-400">{waitlistState.fieldErrors.phone}</span>
                        )}
                      </label>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                      <label className="grid gap-1.5 text-xs">
                        <span className="font-medium text-white/80">Email Address (Optional)</span>
                        <input
                          type="email"
                          name="email"
                          autoComplete="email"
                          defaultValue={waitlistState.values?.email}
                          placeholder="you@example.com"
                          className="h-11 rounded-xl border border-white/15 bg-black/40 px-3.5 text-sm text-white placeholder:text-white/30 focus:border-[#cf8f2e] focus:outline-none"
                        />
                      </label>

                      <label className="grid gap-1.5 text-xs">
                        <span className="font-medium text-white/80">Preferred Suite</span>
                        <select
                          name="roomTypeSlug"
                          defaultValue={waitlistState.values?.roomTypeSlug ?? ''}
                          className="h-11 rounded-xl border border-white/15 bg-[#121614] px-3 text-sm text-white focus:border-[#cf8f2e] focus:outline-none"
                        >
                          <option value="">Any available room / No preference</option>
                          {allRooms.map((r) => (
                            <option key={r.slug} value={r.slug}>
                              {t(r.name)} (Sleeps {r.sleepsAdults})
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                      <label className="grid gap-1.5 text-xs">
                        <span className="font-medium text-white/80">Preferred Arrival</span>
                        <input
                          type="date"
                          name="preferredFrom"
                          defaultValue={waitlistState.values?.preferredFrom}
                          className="h-11 rounded-xl border border-white/15 bg-black/40 px-3.5 text-sm text-white focus:border-[#cf8f2e] focus:outline-none"
                        />
                      </label>

                      <label className="grid gap-1.5 text-xs">
                        <span className="font-medium text-white/80">Preferred Departure</span>
                        <input
                          type="date"
                          name="preferredTo"
                          defaultValue={waitlistState.values?.preferredTo}
                          className="h-11 rounded-xl border border-white/15 bg-black/40 px-3.5 text-sm text-white focus:border-[#cf8f2e] focus:outline-none"
                        />
                      </label>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-3 items-center">
                      <label className="flex items-center gap-2 text-xs text-white/80 cursor-pointer pt-2">
                        <input
                          type="checkbox"
                          name="flexibleDates"
                          defaultChecked={waitlistState.values?.flexibleDates === 'on'}
                          className="size-4 rounded border-white/20 bg-black/40 text-[#cf8f2e] focus:ring-0"
                        />
                        <span>My dates are flexible</span>
                      </label>

                      <label className="grid gap-1 text-xs">
                        <span className="font-medium text-white/80">Adults</span>
                        <input
                          type="number"
                          name="adults"
                          min={1}
                          max={20}
                          defaultValue={waitlistState.values?.adults ?? '2'}
                          className="h-10 rounded-xl border border-white/15 bg-black/40 px-3 text-sm text-white focus:border-[#cf8f2e] focus:outline-none"
                        />
                      </label>

                      <label className="grid gap-1 text-xs">
                        <span className="font-medium text-white/80">Children</span>
                        <input
                          type="number"
                          name="children"
                          min={0}
                          max={20}
                          defaultValue={waitlistState.values?.children ?? '0'}
                          className="h-10 rounded-xl border border-white/15 bg-black/40 px-3 text-sm text-white focus:border-[#cf8f2e] focus:outline-none"
                        />
                      </label>
                    </div>

                    <label className="grid gap-1.5 text-xs">
                      <span className="font-medium text-white/80">Special Requests / Occasion (Optional)</span>
                      <textarea
                        name="note"
                        rows={2}
                        defaultValue={waitlistState.values?.note}
                        placeholder="e.g. High-altitude running retreat, anniversary weekend, Sipi Falls guided hike..."
                        className="rounded-xl border border-white/15 bg-black/40 p-3 text-sm text-white placeholder:text-white/30 focus:border-[#cf8f2e] focus:outline-none"
                      />
                    </label>

                    {/* Required Consent Checkbox */}
                    <label className="flex items-start gap-2.5 text-xs text-white/70 cursor-pointer pt-1">
                      <input
                        type="checkbox"
                        name="consent"
                        defaultChecked
                        required
                        className="mt-0.5 size-4 rounded border-white/20 bg-black/40 text-[#cf8f2e] focus:ring-0"
                      />
                      <span>
                        I agree to receive a notification on WhatsApp or email when Reberon Hotel reservation dates open.
                      </span>
                    </label>
                    {waitlistState.fieldErrors?.consent && (
                      <span className="text-[11px] text-red-400">{waitlistState.fieldErrors.consent}</span>
                    )}

                    <button
                      type="submit"
                      disabled={waitlistPending}
                      className="mt-2 inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-[#cf8f2e] px-6 text-sm font-semibold text-[#080b09] transition hover:bg-[#deb041] disabled:opacity-50 cursor-pointer"
                    >
                      {waitlistPending ? (
                        <>
                          <LoaderCircle className="size-4 animate-spin" />
                          <span>Securing your priority place…</span>
                        </>
                      ) : (
                        <>
                          <Sparkles className="size-4" />
                          <span>Submit VIP Waitlist Request</span>
                        </>
                      )}
                    </button>
                  </form>
                )}
              </div>
            </div>
          )}

          {/* TAB 2: SUITES & SANCTUARY PREVIEW */}
          {activeTab === 'suites' && (
            <div className="mt-6">
              <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-5">
                <div>
                  <h2 className="font-display text-2xl text-white sm:text-3xl">Suites &amp; Accommodations</h2>
                  <p className="mt-1 text-xs text-white/60">
                    High-altitude rest above the clouds at 1,900 metres elevation.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-white/60">Currency:</span>
                  <div className="inline-flex rounded-full border border-white/15 bg-white/5 p-0.5 text-xs">
                    <button
                      type="button"
                      onClick={() => setCurrency('UGX')}
                      className={`rounded-full px-3 py-1 font-semibold transition cursor-pointer ${
                        currency === 'UGX' ? 'bg-[#cf8f2e] text-[#080b09]' : 'text-white/60 hover:text-white'
                      }`}
                    >
                      UGX
                    </button>
                    <button
                      type="button"
                      onClick={() => setCurrency('USD')}
                      className={`rounded-full px-3 py-1 font-semibold transition cursor-pointer ${
                        currency === 'USD' ? 'bg-[#cf8f2e] text-[#080b09]' : 'text-white/60 hover:text-white'
                      }`}
                    >
                      USD
                    </button>
                  </div>
                </div>
              </div>

              {/* Room Cards Grid */}
              <div className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {allRooms.map((room) => {
                  const useUsd = currency === 'USD' && room.fromPrice?.usd;
                  const priceMinor = useUsd ? room.fromPrice.usd : room.fromPrice?.ugx;
                  const priceStr = priceMinor ? formatMoney(priceMinor, useUsd ? 'USD' : 'UGX').replace(/\.00$/, '') : null;

                  return (
                    <div
                      key={room.slug}
                      className="group flex flex-col justify-between overflow-hidden rounded-3xl border border-white/12 bg-white/[0.03] transition hover:border-[#cf8f2e]/40 hover:bg-white/[0.05]"
                    >
                      <div className="p-6">
                        {/* Header & Badges */}
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <span className="font-mono text-[10px] uppercase tracking-wider text-[#cf8f2e]">
                              {room.roomCount ? `${room.roomCount} Available` : 'Sanctuary Suite'}
                            </span>
                            <h3 className="mt-1 font-display text-xl text-white group-hover:text-[#cf8f2e] transition">
                              {t(room.name)}
                            </h3>
                          </div>
                        </div>

                        {room.tagline && (
                          <p className="mt-2 text-xs leading-relaxed text-white/70 line-clamp-2">
                            {t(room.tagline)}
                          </p>
                        )}

                        {/* Room Amenities & Specs */}
                        <div className="mt-5 grid grid-cols-2 gap-2 border-y border-white/10 py-4 font-mono text-[11px] text-white/75">
                          <div className="flex items-center gap-1.5">
                            <Users className="size-3.5 text-[#cf8f2e]" />
                            <span>Sleeps {room.sleepsAdults}</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <Bed className="size-3.5 text-[#cf8f2e]" />
                            <span>{t(room.bedConfig) || 'King / Twin'}</span>
                          </div>
                          {room.sizeSqm && (
                            <div className="flex items-center gap-1.5">
                              <Layers className="size-3.5 text-[#cf8f2e]" />
                              <span>{room.sizeSqm} m²</span>
                            </div>
                          )}
                          <div className="flex items-center gap-1.5">
                            <Mountain className="size-3.5 text-[#cf8f2e]" />
                            <span>{room.view ? t(room.view) : 'Highland View'}</span>
                          </div>
                        </div>

                        {/* Signature High Altitude Perks */}
                        <ul className="mt-4 space-y-1.5 text-xs text-white/60">
                          <li className="flex items-center gap-2">
                            <Check className="size-3 text-[#cf8f2e]" /> Fresh Mount Elgon Arabica French Press
                          </li>
                          <li className="flex items-center gap-2">
                            <Check className="size-3 text-[#cf8f2e]" /> High-pressure hot water rain shower
                          </li>
                          <li className="flex items-center gap-2">
                            <Check className="size-3 text-[#cf8f2e]" /> Escarpment balcony &amp; birding vistas
                          </li>
                        </ul>
                      </div>

                      {/* Card Footer: Price & Direct Enquiry Hold */}
                      <div className="border-t border-white/10 bg-black/30 p-5 flex items-center justify-between">
                        <div>
                          <span className="font-mono text-[10px] uppercase tracking-wider text-white/45">Starting from</span>
                          <div className="font-display text-lg font-semibold text-white">
                            {priceStr ? `${priceStr}` : 'Contact Desk'}
                            <span className="text-xs font-normal text-white/50 font-sans"> / night</span>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleEnquireForRoom(room.slug)}
                          className="inline-flex items-center gap-1.5 rounded-full bg-[#cf8f2e]/15 px-3.5 py-2 text-xs font-semibold text-[#cf8f2e] border border-[#cf8f2e]/30 transition hover:bg-[#cf8f2e] hover:text-[#080b09] cursor-pointer"
                        >
                          <span>Reserve Hold</span>
                          <ArrowRight className="size-3" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* TAB 3: 24/7 CONCIERGE & DESK */}
          {activeTab === 'concierge' && (
            <div className="mt-6 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {/* Phone Desk Card */}
              <div className="rounded-3xl border border-white/12 bg-white/[0.03] p-6 backdrop-blur-xl">
                <div className="grid size-12 place-items-center rounded-2xl bg-[#cf8f2e]/15 text-[#cf8f2e]">
                  <Phone className="size-6" />
                </div>
                <h3 className="mt-4 font-display text-xl text-white">Front Desk Hotline</h3>
                <p className="mt-2 text-xs leading-relaxed text-white/65">
                  Direct telephone support with front desk duty managers in Kapchorwa. Available 24 hours for arrivals, directions, and immediate reservations.
                </p>
                <div className="mt-6">
                  <a
                    href={`tel:${phone.replace(/\s+/g, '')}`}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-white/10 px-4 py-3 text-sm font-semibold text-white hover:bg-white/20 transition"
                  >
                    <Phone className="size-4 text-[#cf8f2e]" />
                    <span>Call {phone}</span>
                  </a>
                </div>
              </div>

              {/* WhatsApp Concierge Card */}
              <div className="rounded-3xl border border-emerald-500/30 bg-emerald-500/[0.04] p-6 backdrop-blur-xl">
                <div className="grid size-12 place-items-center rounded-2xl bg-emerald-500/20 text-emerald-400">
                  <MessageCircle className="size-6" />
                </div>
                <h3 className="mt-4 font-display text-xl text-white">WhatsApp Guest Desk</h3>
                <p className="mt-2 text-xs leading-relaxed text-white/65">
                  Instant messaging channel for itinerary planning, high-altitude running camp logistics, photos of rooms, and menu previews.
                </p>
                <div className="mt-6">
                  {wa ? (
                    <a
                      href={whatsappLink(wa, 'Hello Reberon Hotel Concierge, I am contacting you for assistance with upcoming accommodation.')}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-3 text-sm font-semibold text-[#080b09] hover:bg-emerald-400 transition"
                    >
                      <MessageCircle className="size-4" />
                      <span>Open WhatsApp Chat</span>
                    </a>
                  ) : null}
                </div>
              </div>

              {/* Physical Address & Directions Card */}
              <div className="rounded-3xl border border-white/12 bg-white/[0.03] p-6 backdrop-blur-xl md:col-span-2 lg:col-span-1">
                <div className="grid size-12 place-items-center rounded-2xl bg-[#cf8f2e]/15 text-[#cf8f2e]">
                  <MapPin className="size-6" />
                </div>
                <h3 className="mt-4 font-display text-xl text-white">Location &amp; Coordinates</h3>
                <p className="mt-2 text-xs leading-relaxed text-white/65">
                  {addressText}
                </p>
                <p className="mt-2 font-mono text-[11px] text-[#cf8f2e]">
                  GPS: 1°23&apos;55&quot; N, 34°27&apos;01&quot; E · 1,900 m ASL
                </p>
                <div className="mt-6">
                  <a
                    href="https://maps.google.com/?q=Kapchorwa,Uganda"
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-sm font-semibold text-white hover:border-white/30 hover:bg-white/10 transition"
                  >
                    <Compass className="size-4 text-[#cf8f2e]" />
                    <span>Get Directions on Maps</span>
                  </a>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: DIRECT BOOKING & EVENT ENQUIRY */}
          {activeTab === 'enquiry' && (
            <div className="mt-6 grid gap-8 lg:grid-cols-[1.1fr_1.3fr]">
              <div className="rounded-3xl border border-white/10 bg-white/[0.02] p-6 backdrop-blur-xl sm:p-8">
                <span className="font-mono text-xs uppercase tracking-widest text-[#cf8f2e]">Direct Request</span>
                <h2 className="mt-2 font-display text-2xl font-normal text-white sm:text-3xl">
                  Send an Enquiry Directly to the Desk.
                </h2>
                <p className="mt-4 text-sm leading-relaxed text-white/70">
                  Whether you are planning a corporate retreat, private wedding anniversary, high-altitude athletic camp, or need immediate weekend rooms, send your message here.
                </p>

                <div className="mt-8 space-y-4">
                  <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-xs text-white/70">
                    <strong className="block text-white font-medium mb-1">Human Reception Promise</strong>
                    A real front desk staff member in Kapchorwa reviews and responds to every direct enquiry within a few hours.
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-xs text-white/70">
                    <strong className="block text-white font-medium mb-1">Official Email Desk</strong>
                    <span className="font-mono text-white/90">{officialEmail}</span>
                  </div>
                </div>
              </div>

              {/* Enquiry Form */}
              <div className="rounded-3xl border border-white/12 bg-[#0e1310]/90 p-6 backdrop-blur-2xl sm:p-8">
                {enquiryState.status === 'success' && enquiryState.reference ? (
                  <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-6 text-center sm:p-8">
                    <div className="mx-auto grid size-12 place-items-center rounded-full bg-emerald-500/20 text-emerald-400">
                      <CheckCircle2 className="size-6" />
                    </div>
                    <h3 className="mt-4 font-display text-2xl text-white">Your Request Has Reached the Desk</h3>
                    <p className="mt-2 text-sm text-white/75">
                      Our front desk team has received your enquiry and will reply shortly on your preferred contact method.
                    </p>

                    <div className="mt-6 inline-flex items-center gap-3 rounded-2xl border border-white/15 bg-black/40 px-5 py-3 font-mono text-sm">
                      <span className="text-white/60">Reference:</span>
                      <strong className="text-[#cf8f2e]">{enquiryState.reference}</strong>
                      <button
                        type="button"
                        onClick={() => handleCopyReference(enquiryState.reference!)}
                        className="rounded-md p-1 text-white/60 hover:text-white transition cursor-pointer"
                        title="Copy reference code"
                      >
                        {copiedRef === enquiryState.reference ? <Check className="size-4 text-emerald-400" /> : <Copy className="size-4" />}
                      </button>
                    </div>
                  </div>
                ) : (
                  <form action={enquiryAction} className="grid gap-4.5" noValidate>
                    <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
                    <input type="hidden" name="pagePath" value="/maintenance" />
                    <input type="text" name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden="true" />

                    <div>
                      <h3 className="font-display text-xl text-white">Direct Reservation Request</h3>
                      <p className="text-xs text-white/60">Fill in your requirements below.</p>
                    </div>

                    {enquiryState.status === 'error' && enquiryState.message && (
                      <div role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300">
                        {enquiryState.message}
                      </div>
                    )}

                    <div className="grid gap-4 sm:grid-cols-2">
                      <label className="grid gap-1.5 text-xs">
                        <span className="font-medium text-white/80">
                          Your Name <span className="text-[#cf8f2e]">*</span>
                        </span>
                        <input
                          type="text"
                          name="name"
                          required
                          defaultValue={enquiryState.values?.name}
                          placeholder="Your Full Name"
                          className="h-11 rounded-xl border border-white/15 bg-black/40 px-3.5 text-sm text-white focus:border-[#cf8f2e] focus:outline-none"
                        />
                        {enquiryState.fieldErrors?.name && (
                          <span className="text-[11px] text-red-400">{enquiryState.fieldErrors.name}</span>
                        )}
                      </label>

                      <label className="grid gap-1.5 text-xs">
                        <span className="font-medium text-white/80">Inquiry Subject</span>
                        <select
                          name="intent"
                          defaultValue={enquiryState.values?.intent ?? 'STAY'}
                          className="h-11 rounded-xl border border-white/15 bg-[#121614] px-3 text-sm text-white focus:border-[#cf8f2e] focus:outline-none"
                        >
                          <option value="STAY">A Room or Suite Stay</option>
                          <option value="EVENT">Event, Wedding or Hall</option>
                          <option value="GROUP">Group / Athletic Training Camp</option>
                          <option value="GENERAL">General Concierge Enquiry</option>
                        </select>
                      </label>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                      <label className="grid gap-1.5 text-xs">
                        <span className="font-medium text-white/80">Phone or WhatsApp</span>
                        <input
                          type="tel"
                          name="phone"
                          defaultValue={enquiryState.values?.phone}
                          placeholder="07xx xxx xxx"
                          className="h-11 rounded-xl border border-white/15 bg-black/40 px-3.5 text-sm text-white focus:border-[#cf8f2e] focus:outline-none"
                        />
                        {enquiryState.fieldErrors?.phone && (
                          <span className="text-[11px] text-red-400">{enquiryState.fieldErrors.phone}</span>
                        )}
                      </label>

                      <label className="grid gap-1.5 text-xs">
                        <span className="font-medium text-white/80">Email</span>
                        <input
                          type="email"
                          name="email"
                          defaultValue={enquiryState.values?.email}
                          placeholder="you@domain.com"
                          className="h-11 rounded-xl border border-white/15 bg-black/40 px-3.5 text-sm text-white focus:border-[#cf8f2e] focus:outline-none"
                        />
                      </label>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                      <label className="grid gap-1.5 text-xs">
                        <span className="font-medium text-white/80">Room Preference</span>
                        <select
                          name="roomTypeSlug"
                          defaultValue={enquiryRoomSlug || enquiryState.values?.roomTypeSlug || ''}
                          className="h-11 rounded-xl border border-white/15 bg-[#121614] px-3 text-sm text-white focus:border-[#cf8f2e] focus:outline-none"
                        >
                          <option value="">No preference / Custom setup</option>
                          {allRooms.map((r) => (
                            <option key={r.slug} value={r.slug}>
                              {t(r.name)}
                            </option>
                          ))}
                        </select>
                      </label>

                      <div className="grid grid-cols-2 gap-2">
                        <label className="grid gap-1 text-xs">
                          <span className="font-medium text-white/80">Arrival</span>
                          <input
                            type="date"
                            name="arrival"
                            defaultValue={enquiryState.values?.arrival}
                            className="h-11 rounded-xl border border-white/15 bg-black/40 px-2.5 text-xs text-white focus:border-[#cf8f2e] focus:outline-none"
                          />
                        </label>
                        <label className="grid gap-1 text-xs">
                          <span className="font-medium text-white/80">Departure</span>
                          <input
                            type="date"
                            name="departure"
                            defaultValue={enquiryState.values?.departure}
                            className="h-11 rounded-xl border border-white/15 bg-black/40 px-2.5 text-xs text-white focus:border-[#cf8f2e] focus:outline-none"
                          />
                        </label>
                      </div>
                    </div>

                    <label className="grid gap-1.5 text-xs">
                      <span className="font-medium text-white/80">
                        Your Message <span className="text-[#cf8f2e]">*</span>
                      </span>
                      <textarea
                        name="message"
                        rows={3}
                        required
                        defaultValue={enquiryState.values?.message}
                        placeholder="Please describe your requested dates, number of guests, or special arrangement..."
                        className="rounded-xl border border-white/15 bg-black/40 p-3 text-sm text-white placeholder:text-white/30 focus:border-[#cf8f2e] focus:outline-none"
                      />
                      {enquiryState.fieldErrors?.message && (
                        <span className="text-[11px] text-red-400">{enquiryState.fieldErrors.message}</span>
                      )}
                    </label>

                    {/* Required Consent */}
                    <label className="flex items-start gap-2.5 text-xs text-white/70 cursor-pointer pt-1">
                      <input
                        type="checkbox"
                        name="consent"
                        defaultChecked
                        required
                        className="mt-0.5 size-4 rounded border-white/20 bg-black/40 text-[#cf8f2e] focus:ring-0"
                      />
                      <span>
                        I agree to be contacted by Reberon Hotel staff regarding this request.
                      </span>
                    </label>
                    {enquiryState.fieldErrors?.consent && (
                      <span className="text-[11px] text-red-400">{enquiryState.fieldErrors.consent}</span>
                    )}

                    <button
                      type="submit"
                      disabled={enquiryPending}
                      className="mt-2 inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-[#cf8f2e] px-6 text-sm font-semibold text-[#080b09] transition hover:bg-[#deb041] disabled:opacity-50 cursor-pointer"
                    >
                      {enquiryPending ? (
                        <>
                          <LoaderCircle className="size-4 animate-spin" />
                          <span>Dispatching to desk…</span>
                        </>
                      ) : (
                        <>
                          <Send className="size-4" />
                          <span>Send Enquiry to Front Desk</span>
                        </>
                      )}
                    </button>
                  </form>
                )}
              </div>
            </div>
          )}
        </section>
      </main>

      {/* Footer */}
      <footer className="relative z-20 mt-16 border-t border-white/10 bg-[#080b09]/90 px-4 py-8 text-xs text-white/50 backdrop-blur-xl sm:px-8">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="font-display font-medium text-white/80">{site.name}</span>
            <span>·</span>
            <span>Kapchorwa, Mount Elgon, Uganda</span>
            <span>·</span>
            <span>© {new Date().getFullYear()} All rights reserved.</span>
          </div>

          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => setLoginOpen(true)}
              className="text-white/60 hover:text-white transition underline-offset-4 hover:underline cursor-pointer"
            >
              Staff Sign In
            </button>
            <span>·</span>
            <a
              href="https://ecadelgroup.com"
              target="_blank"
              rel="noreferrer"
              className="text-white/60 hover:text-white transition"
            >
              Engineered by ECADEL GROUP LIMITED
            </a>
          </div>
        </div>
      </footer>

      {/* Authorized Staff Sign-In Modal */}
      {loginOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
          <div
            className="fixed inset-0 bg-black/80 backdrop-blur-md"
            onClick={() => setLoginOpen(false)}
          />
          <div className="relative z-10 w-full max-w-md overflow-hidden rounded-3xl border border-white/15 bg-[#101512] p-6 shadow-2xl sm:p-8">
            <div className="flex items-center justify-between border-b border-white/10 pb-4">
              <div className="flex items-center gap-2.5">
                <div className="grid size-9 place-items-center rounded-xl bg-[#cf8f2e]/15 text-[#cf8f2e]">
                  <ShieldCheck className="size-5" />
                </div>
                <div>
                  <h3 className="font-display text-lg text-white">Authorized Access</h3>
                  <p className="font-mono text-[10px] text-white/50">Reberon Hotel Private Preview</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setLoginOpen(false)}
                className="rounded-full p-2 text-white/50 hover:bg-white/10 hover:text-white transition cursor-pointer"
                aria-label="Close dialog"
              >
                <X className="size-4" />
              </button>
            </div>

            <p className="mt-4 text-xs leading-relaxed text-white/65">
              Sign in with your official Reberon Hotel staff credentials to unlock the full interactive website and live booking engine while maintenance mode is active.
            </p>

            <form onSubmit={handleSignIn} className="mt-6 grid gap-4">
              {loginError && (
                <div role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300">
                  {loginError}
                </div>
              )}

              <label className="grid gap-1.5 text-xs">
                <span className="font-medium text-white/80">Staff Email</span>
                <input
                  type="email"
                  required
                  autoFocus
                  autoComplete="email"
                  placeholder="name@reberonhotel.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="h-11 rounded-xl border border-white/15 bg-black/40 px-3.5 text-sm text-white placeholder:text-white/30 focus:border-[#cf8f2e] focus:outline-none"
                />
              </label>

              <label className="grid gap-1.5 text-xs">
                <span className="font-medium text-white/80">Password</span>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    autoComplete="current-password"
                    placeholder="••••••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="h-11 w-full rounded-xl border border-white/15 bg-black/40 pl-3.5 pr-10 text-sm text-white placeholder:text-white/30 focus:border-[#cf8f2e] focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white transition cursor-pointer"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
              </label>

              <div className="flex items-center justify-between text-xs text-white/60">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={rememberEmail}
                    onChange={(e) => setRememberEmail(e.target.checked)}
                    className="size-3.5 rounded border-white/20 bg-black/40 text-[#cf8f2e] focus:ring-0"
                  />
                  <span>Remember email</span>
                </label>

                <a
                  href="https://reberonhotel.com:8443"
                  target="_blank"
                  rel="noreferrer"
                  className="text-[#cf8f2e] hover:underline"
                >
                  The House (PMS)
                </a>
              </div>

              <button
                type="submit"
                disabled={busy || !email || !password}
                className="mt-2 inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#cf8f2e] px-5 text-sm font-semibold text-[#080b09] transition hover:bg-[#deb041] disabled:opacity-50 cursor-pointer"
              >
                {busy ? (
                  <>
                    <LoaderCircle className="size-4 animate-spin" />
                    <span>Verifying session…</span>
                  </>
                ) : (
                  <>
                    <KeyRound className="size-4" />
                    <span>Unlock Live Preview</span>
                  </>
                )}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export function StaffPreviewBar({ userName, userEmail }: { userName: string; userEmail: string }) {
  const [busy, setBusy] = useState(false);

  async function signOut() {
    setBusy(true);
    try {
      await fetch(`${API}/v1/admin/auth/logout`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'x-reberon-client': 'admin' },
      });
    } catch {}
    window.location.reload();
  }

  return (
    <div className="fixed bottom-4 left-4 z-[70] flex items-center gap-3 rounded-full border border-white/15 bg-[#121614]/95 py-2 pl-4 pr-2 text-xs text-white shadow-2xl backdrop-blur-md print:hidden">
      <span className="relative flex size-2.5">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
        <span className="relative inline-flex size-2.5 rounded-full bg-emerald-400" />
      </span>
      <span className="font-medium">
        Preview Mode <span className="hidden text-white/60 sm:inline">({userName || userEmail})</span>
      </span>
      <a
        href="https://reberonhotel.com:8443"
        target="_blank"
        rel="noreferrer"
        className="rounded-full bg-white/10 px-3 py-1 font-medium text-white hover:bg-white/20 transition"
      >
        The House
      </a>
      <button
        type="button"
        disabled={busy}
        onClick={signOut}
        className="inline-flex items-center gap-1.5 rounded-full bg-red-500/20 px-3 py-1 font-medium text-red-200 hover:bg-red-500/30 transition cursor-pointer"
        title="Exit preview and return to Maintenance view"
      >
        {busy ? <LoaderCircle className="size-3 animate-spin" /> : <LogOut className="size-3" />}
        <span>Lock</span>
      </button>
    </div>
  );
}
