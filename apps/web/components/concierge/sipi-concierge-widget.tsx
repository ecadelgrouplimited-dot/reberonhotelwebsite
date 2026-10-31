'use client';

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import {
  Sparkles,
  X,
  Send,
  RotateCcw,
  User,
  Maximize2,
  Minimize2,
  ChevronRight,
  CheckCircle2,
  ShieldCheck,
  Compass,
  BedDouble,
  Coffee,
  Mountain,
  MessageCircle,
  ExternalLink,
  MapPin,
  Check,
  Copy,
  Printer,
  CreditCard,
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  Car,
  Utensils,
  Search,
  QrCode,
  CalendarPlus,
  FileText,
  Activity,
  Zap,
  UserCheck,
  Edit3,
  RefreshCw,
  BellRing,
  BookOpen,
  ArrowRight,
} from 'lucide-react';
import type {
  ConciergeChatResponseDTO,
  ConciergeMessageDTO,
  ConciergeCardDTO,
  ConciergeGuestIdentityDTO,
  ConciergeGuestDossierDTO,
  ConciergeDocumentItemDTO,
} from '@reberon/contracts';
import { cn } from '@/lib/cn';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
const IDENTITY_STORAGE_KEY = 'reberon_concierge_identity_v2';

const QUICK_ACTIONS = [
  { id: 'activity', label: 'My Activity', icon: Activity, prompt: 'Check my most recent actions, bookings, and activities with Reberon Hotel.' },
  { id: 'docs', label: 'Receipts & Invoices', icon: FileText, prompt: 'Fetch all my official receipts, tax invoices, and quotations.' },
  { id: 'lookup', label: 'Check Booking', icon: Search, prompt: 'Look up my current reservation status and balance.' },
  { id: 'suites', label: 'Suites & Hold', icon: BedDouble, prompt: 'Show available suites and rates for this upcoming weekend.' },
  { id: 'request', label: 'In-Stay Request', icon: BellRing, prompt: 'I want to submit a guest service request (such as late check-out or a trail guide).' },
  { id: 'dining', label: 'Dining & POS Menu', icon: Utensils, prompt: 'Show me the Highland Restaurant menu, Mount Elgon trout, and Arabica coffee.' },
  { id: 'hikes', label: 'Sipi Falls Hikes', icon: Compass, prompt: 'Show the Sipi Falls waterfall hike and Mount Elgon trekking options.' },
  { id: 'transfers', label: '4x4 Transfer', icon: Car, prompt: 'Arrange a private 4x4 sanctuary transfer from Entebbe or Kampala.' },
];

export interface SipiConciergeWidgetProps {
  initialStaffUser?: { name: string; email?: string | null } | null;
}

export function SipiConciergeWidget({ initialStaffUser }: SipiConciergeWidgetProps = {}) {
  const [isOpen, setIsOpen] = useState(false);
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [activeTab, setActiveTab] = useState<'chat' | 'actions' | 'dossier'>('chat');
  const [hasInteracted, setHasInteracted] = useState(false);
  const [messages, setMessages] = useState<ConciergeMessageDTO[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string>('');
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [previewDoc, setPreviewDoc] = useState<ConciergeDocumentItemDTO | null>(null);
  const [previewPaper, setPreviewPaper] = useState<'A4' | '80MM'>('A4');
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [hasSpeechRec, setHasSpeechRec] = useState(false);

  // Guest Identity & Real-Time System Dossier State
  const [identity, setIdentity] = useState<ConciergeGuestIdentityDTO | null>(null);
  const [dossier, setDossier] = useState<ConciergeGuestDossierDTO | null>(null);
  const [showIdentityForm, setShowIdentityForm] = useState(false);
  const [idForm, setIdForm] = useState({ name: '', phone: '', email: '', bookingCode: '' });
  const [isSyncingIdentity, setIsSyncingIdentity] = useState(false);

  // Action Center Quick-Form States
  const [quickHold, setQuickHold] = useState({
    roomSlug: 'elgon-view-king',
    arrival: new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10),
    departure: new Date(Date.now() + 4 * 86400000).toISOString().slice(0, 10),
  });
  const [quickVerify, setQuickVerify] = useState({ number: '', checkCode: '' });
  const [quickRequest, setQuickRequest] = useState({ kind: 'LATE_CHECKOUT', note: '', code: '' });

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<any>(null);
  const docIframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      setHasSpeechRec(Boolean(SpeechRecognition));
    }
  }, []);

  const playChime = () => {
    try {
      if (typeof window === 'undefined') return;
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.12);
      gain.gain.setValueAtTime(0.035, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.3);
    } catch {}
  };

  const buildWelcomeMessage = useCallback(
    (guest: ConciergeGuestIdentityDTO, guestDossier?: ConciergeGuestDossierDTO | null): ConciergeMessageDTO => {
      const firstName = guest.name.split(' ')[0] || guest.name;
      const resCount = guestDossier?.summary.reservationsCount ?? 0;
      const docCount = guestDossier?.summary.documentsCount ?? 0;
      const actCount = guestDossier?.summary.activitiesCount ?? 0;

      const statusLine =
        resCount > 0 || docCount > 0
          ? `I have synced your profile: **${resCount} booking(s)**, **${docCount} official receipt(s)/invoice(s)**, and **${actCount} recent hotel activity record(s)** are ready.`
          : `Your guest session is active. I can check live suites, lock a 48h complimentary hold, pull receipts & invoices, or submit desk requests.`;

      return {
        id: `msg_welcome_${Date.now()}`,
        role: 'assistant',
        content: `Muraho, **${firstName}**. Welcome to **Sipi Concierge** (1,900 m ASL).\n\n${statusLine} Select an action below or ask me anything:`,
        cards:
          guestDossier && guestDossier.recentActivities.length > 0
            ? [
                {
                  type: 'activity_log',
                  guestName: guest.name,
                  summary: {
                    reservationsCount: resCount,
                    documentsCount: docCount,
                    activitiesCount: actCount,
                  },
                  activities: guestDossier.recentActivities.slice(0, 4),
                  documents: guestDossier.documents.slice(0, 3),
                },
              ]
            : undefined,
        followUpQuestions:
          resCount > 0 || docCount > 0
            ? [
                '🧾 My Receipts & Invoices',
                '📋 My Recent Activity',
                '🔍 Check Booking Status',
                '🛎️ Request Late Checkout',
              ]
            : [
                '🏔️ Suites & Weekend Rates',
                '🔒 Place 48h Suite Hold',
                '🧾 Find My Receipts',
                '🥾 Sipi Falls Hike Guide',
              ],
        createdAt: new Date().toISOString(),
      };
    },
    [],
  );

  // Sync guest identity with backend & load live dossier
  const syncIdentityWithBackend = useCallback(
    async (sid: string, targetIdentity: ConciergeGuestIdentityDTO, updateWelcome = false) => {
      if (!sid || !targetIdentity.name.trim()) return null;
      setIsSyncingIdentity(true);
      try {
        const res = await fetch(`${API}/v1/public/concierge/identify`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId: sid,
            guestName: targetIdentity.name.trim(),
            phone: targetIdentity.phone?.trim() || undefined,
            email: targetIdentity.email?.trim() || undefined,
            bookingCode: targetIdentity.bookingCode?.trim().toUpperCase() || undefined,
          }),
        });
        if (res.ok) {
          const data: ConciergeGuestDossierDTO = await res.json();
          setIdentity(data.identity);
          setDossier(data);
          try {
            localStorage.setItem(IDENTITY_STORAGE_KEY, JSON.stringify(data.identity));
          } catch {}
          if (updateWelcome) {
            setMessages([buildWelcomeMessage(data.identity, data)]);
          }
          return data;
        }
      } catch {} finally {
        setIsSyncingIdentity(false);
      }
      // Fallback if offline
      setIdentity(targetIdentity);
      try {
        localStorage.setItem(IDENTITY_STORAGE_KEY, JSON.stringify(targetIdentity));
      } catch {}
      if (updateWelcome) {
        setMessages([buildWelcomeMessage(targetIdentity, null)]);
      }
      return null;
    },
    [buildWelcomeMessage],
  );

  // Initialize session and check stored identity
  useEffect(() => {
    let sid = '';
    try {
      sid = sessionStorage.getItem('reberon_concierge_sid') || '';
    } catch {}
    if (!sid) {
      sid = 'cs_' + Math.random().toString(36).substring(2, 11) + '_' + Date.now().toString(36);
      try {
        sessionStorage.setItem('reberon_concierge_sid', sid);
      } catch {}
    }
    setSessionId(sid);

    let savedId: ConciergeGuestIdentityDTO | null = null;
    try {
      const raw = localStorage.getItem(IDENTITY_STORAGE_KEY);
      if (raw) savedId = JSON.parse(raw);
    } catch {}

    if (savedId && savedId.name) {
      setIdentity(savedId);
      setIdForm({
        name: savedId.name || '',
        phone: savedId.phone || '',
        email: savedId.email || '',
        bookingCode: savedId.bookingCode || '',
      });
      void syncIdentityWithBackend(sid, savedId, true);
    } else if (initialStaffUser?.name) {
      // Pre-fill form with active staff session if present, or let them 1-tap confirm
      setIdForm((prev) => ({
        ...prev,
        name: initialStaffUser.name,
        email: initialStaffUser.email || '',
      }));
    }
  }, [initialStaffUser, syncIdentityWithBackend]);

  const handleSend = useCallback(
    async (textToSend?: string, overrideIdentity?: ConciergeGuestIdentityDTO | null) => {
      const prompt = (textToSend ?? input).trim();
      if (!prompt || isLoading) return;

      const activeId = overrideIdentity ?? identity;

      // If user has no identity yet and types their name or a short introduction in the chat box, treat it as setting their identity!
      if (!activeId && !showIdentityForm) {
        const cleanedName = prompt
          .replace(/^(hi|hello|hey|muraho|my name is|i am|i'm|call me|this is)\s+/i, '')
          .trim();
        if (cleanedName.length >= 2 && cleanedName.split(' ').length <= 4 && !cleanedName.includes('?')) {
          const newId: ConciergeGuestIdentityDTO = {
            name: cleanedName,
            identifiedAt: new Date().toISOString(),
          };
          setInput('');
          await syncIdentityWithBackend(sessionId, newId, true);
          return;
        }
      }

      setInput('');
      setHasInteracted(true);
      setActiveTab('chat');

      const userMessage: ConciergeMessageDTO = {
        id: `usr_${Date.now()}`,
        role: 'user',
        content: prompt,
        createdAt: new Date().toISOString(),
      };

      setMessages((prev) => [...prev, userMessage]);
      setIsLoading(true);

      try {
        const res = await fetch(`${API}/v1/public/concierge/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId,
            message: prompt,
            guestName: activeId?.name,
            phone: activeId?.phone,
            email: activeId?.email,
            bookingCode: activeId?.bookingCode,
          }),
        });

        if (!res.ok) {
          throw new Error(`Concierge status: ${res.status}`);
        }

        const data: ConciergeChatResponseDTO = await res.json();
        playChime();

        if (data.identity) {
          setIdentity(data.identity);
          try {
            localStorage.setItem(IDENTITY_STORAGE_KEY, JSON.stringify(data.identity));
          } catch {}
        }
        if (data.dossier) {
          setDossier(data.dossier);
        }

        if (data.messages && data.messages.length > 0) {
          setMessages(data.messages);
        } else {
          setMessages((prev) => [
            ...prev,
            {
              id: `ast_${Date.now()}`,
              role: 'assistant',
              content: data.reply,
              cards: data.cards,
              followUpQuestions: data.followUpQuestions,
              createdAt: new Date().toISOString(),
            },
          ]);
        }
      } catch {
        setMessages((prev) => [
          ...prev,
          {
            id: `err_${Date.now()}`,
            role: 'assistant',
            content:
              'Connection is refreshing. You can reach Denis Mayamba & Front Desk directly on WhatsApp at **+256 760 512 691**.',
            cards: [
              {
                type: 'handover',
                phone: '+256 760 512 691',
                whatsappUrl:
                  'https://wa.me/256760512691?text=Hello%20Denis%2C%20I%20am%20inquiring%20about%20Reberon%20Hotel',
                message: 'Direct priority line to Denis Mayamba & Front Desk.',
                actionUrl:
                  'https://wa.me/256760512691?text=Hello%20Denis%2C%20I%20am%20inquiring%20about%20Reberon%20Hotel',
                actionLabel: 'Open WhatsApp Concierge',
              },
            ],
            followUpQuestions: ['🏔️ View Suites', '🧾 Check Receipts'],
            createdAt: new Date().toISOString(),
          },
        ]);
      } finally {
        setIsLoading(false);
      }
    },
    [identity, input, isLoading, sessionId, showIdentityForm, syncIdentityWithBackend],
  );

  // Global custom event listener so any page (like /concierge) can trigger Sipi Concierge
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ open?: boolean; fullScreen?: boolean; tab?: 'chat' | 'actions' | 'dossier'; prompt?: string }>).detail;
      setIsOpen(true);
      if (detail?.fullScreen !== undefined) setIsFullScreen(detail.fullScreen);
      if (detail?.tab) setActiveTab(detail.tab);
      if (detail?.prompt) {
        setTimeout(() => {
          void handleSend(detail.prompt);
        }, 120);
      }
    };
    window.addEventListener('reberon:concierge', handler);
    return () => window.removeEventListener('reberon:concierge', handler);
  }, [handleSend]);

  useEffect(() => {
    if (isOpen && activeTab === 'chat') {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isLoading, isOpen, activeTab]);

  useEffect(() => {
    if (isOpen && identity && activeTab === 'chat' && !showIdentityForm) {
      setTimeout(() => inputRef.current?.focus(), 150);
    }
  }, [isOpen, identity, activeTab, showIdentityForm]);

  const toggleListening = () => {
    if (typeof window === 'undefined') return;
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    if (isListening) {
      try {
        recognitionRef.current?.stop();
      } catch {}
      setIsListening(false);
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.lang = 'en-US';
      recognition.interimResults = true;
      recognition.continuous = false;
      recognition.onstart = () => setIsListening(true);
      recognition.onresult = (event: any) => {
        const transcript = Array.from(event.results)
          .map((r: any) => r[0].transcript)
          .join('');
        setInput(transcript);
      };
      recognition.onerror = () => setIsListening(false);
      recognition.onend = () => setIsListening(false);
      recognitionRef.current = recognition;
      recognition.start();
    } catch {
      setIsListening(false);
    }
  };

  const speakMessage = (text: string) => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return;
    if (isSpeaking) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
      return;
    }
    const clean = text
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/[#*`_~|]/g, '')
      .slice(0, 400);

    const utterance = new SpeechSynthesisUtterance(clean);
    utterance.rate = 0.96;
    utterance.pitch = 1.0;
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);
    setIsSpeaking(true);
    window.speechSynthesis.speak(utterance);
  };

  const handleIdentitySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!idForm.name.trim()) return;
    const newId: ConciergeGuestIdentityDTO = {
      name: idForm.name.trim(),
      phone: idForm.phone.trim() || undefined,
      email: idForm.email.trim() || undefined,
      bookingCode: idForm.bookingCode.trim().toUpperCase() || undefined,
      identifiedAt: new Date().toISOString(),
    };
    setShowIdentityForm(false);
    await syncIdentityWithBackend(sessionId, newId, messages.length <= 1);
  };

  const resetChat = () => {
    const newSid = 'cs_' + Math.random().toString(36).substring(2, 11) + '_' + Date.now().toString(36);
    try {
      sessionStorage.setItem('reberon_concierge_sid', newSid);
    } catch {}
    setSessionId(newSid);
    if (identity) {
      void syncIdentityWithBackend(newSid, identity, true);
    } else {
      setMessages([]);
    }
  };

  const activeCard = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const cards = messages[i]?.cards;
      if (cards && cards.length > 0) return cards[0];
    }
    return null;
  }, [messages]);

  const totalDossierBadge = (dossier?.summary.reservationsCount ?? 0) + (dossier?.summary.documentsCount ?? 0);

  return (
    <>
      {/* Floating Trigger Launcher */}
      <div className="fixed bottom-5 right-5 z-[65] flex items-center gap-2.5 print:hidden">
        {!isOpen && !hasInteracted && (
          <button
            type="button"
            onClick={() => setIsOpen(true)}
            className="hidden sm:flex cursor-pointer items-center gap-2 rounded-full border border-amber-500/35 bg-surface/95 px-3.5 py-2 text-xs font-medium text-fg shadow-lg backdrop-blur-md transition-all duration-300 hover:border-amber-500/70 hover:shadow-xl"
          >
            <span className="relative flex size-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
            </span>
            <span>
              {identity?.name
                ? `Sipi Concierge · ${identity.name.split(' ')[0]}`
                : 'Sipi Concierge · Bookings, Receipts & Hikes'}
            </span>
          </button>
        )}

        <button
          type="button"
          onClick={() => setIsOpen((prev) => !prev)}
          className={cn(
            'group relative flex size-13 items-center justify-center rounded-full shadow-2xl transition-all duration-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/50 cursor-pointer',
            isOpen
              ? 'bg-surface-2 text-fg border border-line scale-95'
              : 'bg-linear-to-tr from-amber-700 via-amber-600 to-amber-500 text-white hover:scale-105',
          )}
          aria-label={isOpen ? 'Close Sipi Concierge' : 'Open Sipi Concierge'}
        >
          {isOpen ? (
            <X className="size-5" />
          ) : (
            <>
              <Sparkles className="size-5" />
              <span className="absolute -top-0.5 -right-0.5 flex size-3">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex size-3 rounded-full bg-emerald-500" />
              </span>
            </>
          )}
        </button>
      </div>

      {/* Concierge Modal / Fullscreen Command Center */}
      {isOpen && (
        <div
          role="dialog"
          aria-label="Sipi Concierge AI"
          className={cn(
            'fixed z-[75] flex flex-col bg-surface/98 backdrop-blur-xl shadow-2xl overflow-hidden transition-all duration-300 border border-line-strong text-fg print:hidden',
            isFullScreen
              ? 'inset-2 sm:inset-5 rounded-2xl'
              : 'bottom-20 right-3 sm:right-5 w-[calc(100vw-1.5rem)] sm:w-[500px] h-[660px] max-h-[84vh] rounded-2xl',
          )}
        >
          {/* Compact Top Header */}
          <div className="border-b border-line bg-surface-2/90 px-3.5 py-2.5 backdrop-blur-md shrink-0">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-linear-to-tr from-amber-700 to-amber-500 text-white shadow-xs">
                  <Sparkles className="size-4" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <h3 className="font-serif text-sm font-semibold tracking-tight truncate">Sipi Concierge</h3>
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-1.5 py-0.5 text-[9.5px] font-semibold text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                      <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
                      LIVE PMS
                    </span>
                  </div>
                  <p className="text-[10.5px] text-fg-muted truncate">
                    Reberon Hotel · 1,900 m ASL
                  </p>
                </div>
              </div>

              {/* Active Guest Identity Pill in Header */}
              <div className="flex items-center gap-1">
                {identity && (
                  <button
                    type="button"
                    onClick={() => {
                      setIdForm({
                        name: identity.name || '',
                        phone: identity.phone || '',
                        email: identity.email || '',
                        bookingCode: identity.bookingCode || '',
                      });
                      setShowIdentityForm((p) => !p);
                    }}
                    title="Guest Identity & Session Profile"
                    className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-[11px] font-medium text-fg hover:border-amber-500/60 transition-colors cursor-pointer max-w-[160px]"
                  >
                    <UserCheck className="size-3 text-amber-600 dark:text-amber-400 shrink-0" />
                    <span className="truncate">{identity.name.split(' ')[0]}</span>
                    <Edit3 className="size-2.5 text-fg-muted shrink-0" />
                  </button>
                )}

                <Link
                  href="/concierge"
                  onClick={() => setIsOpen(false)}
                  title="About Sipi Concierge & Capabilities"
                  className="rounded-lg p-1.5 text-fg-muted hover:bg-surface hover:text-fg transition-colors"
                >
                  <BookOpen className="size-3.5" />
                </Link>

                <button
                  type="button"
                  onClick={() => setIsFullScreen((prev) => !prev)}
                  title={isFullScreen ? 'Compact view' : 'Full-screen command view'}
                  className="rounded-lg p-1.5 text-fg-muted hover:bg-surface hover:text-fg transition-colors cursor-pointer"
                  aria-label="Toggle full screen"
                >
                  {isFullScreen ? <Minimize2 className="size-3.5" /> : <Maximize2 className="size-3.5" />}
                </button>

                <button
                  type="button"
                  onClick={resetChat}
                  title="Reset session"
                  className="rounded-lg p-1.5 text-fg-muted hover:bg-surface hover:text-fg transition-colors cursor-pointer"
                  aria-label="Reset session"
                >
                  <RotateCcw className="size-3.5" />
                </button>

                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="rounded-lg p-1.5 text-fg-muted hover:bg-surface hover:text-fg transition-colors cursor-pointer"
                  aria-label="Close concierge"
                >
                  <X className="size-3.5" />
                </button>
              </div>
            </div>

            {/* Mode Switcher Bar (Chat · Action Center · My Activity & Receipts) */}
            {identity && !showIdentityForm && (
              <div className="mt-2 flex items-center justify-between gap-1 rounded-lg bg-surface p-1 border border-line text-[11px]">
                <button
                  type="button"
                  onClick={() => setActiveTab('chat')}
                  className={cn(
                    'flex-1 flex items-center justify-center gap-1.5 rounded-md py-1 px-2 font-medium transition-colors cursor-pointer',
                    activeTab === 'chat'
                      ? 'bg-surface-2 text-fg border border-line-strong shadow-2xs'
                      : 'text-fg-muted hover:text-fg',
                  )}
                >
                  <Sparkles className="size-3 text-amber-500/80" />
                  <span>Concierge</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('actions')}
                  className={cn(
                    'flex-1 flex items-center justify-center gap-1.5 rounded-md py-1 px-2 font-medium transition-colors cursor-pointer',
                    activeTab === 'actions'
                      ? 'bg-surface-2 text-fg border border-line-strong shadow-2xs'
                      : 'text-fg-muted hover:text-fg',
                  )}
                >
                  <Zap className="size-3 text-amber-500/80" />
                  <span>Quick Actions</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab('dossier');
                    if (identity) void syncIdentityWithBackend(sessionId, identity, false);
                  }}
                  className={cn(
                    'flex-1 flex items-center justify-center gap-1.5 rounded-md py-1 px-2 font-medium transition-colors cursor-pointer',
                    activeTab === 'dossier'
                      ? 'bg-surface-2 text-fg border border-line-strong shadow-2xs'
                      : 'text-fg-muted hover:text-fg',
                  )}
                >
                  <FileText className="size-3 text-amber-500/80" />
                  <span>Activity & Docs</span>
                  {totalDossierBadge > 0 && (
                    <span
                      className={cn(
                        'rounded-full px-1.5 py-0.2 text-[9.5px] font-mono font-bold',
                        'bg-surface text-fg border border-line',
                      )}
                    >
                      {totalDossierBadge}
                    </span>
                  )}
                </button>
              </div>
            )}
          </div>

          {/* ── GUEST IDENTITY GATE / PROFILE MODAL (When No Identity Active or Editing) ── */}
          {(!identity || showIdentityForm) ? (
            <div className="flex-1 overflow-y-auto p-4 sm:p-5 flex flex-col justify-center">
              <div className="mx-auto w-full max-w-md rounded-2xl border border-amber-500/30 bg-surface-2/60 p-4 sm:p-5 shadow-lg space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-600 dark:text-amber-400">
                      <UserCheck className="size-5" />
                    </div>
                    <div>
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-amber-600 dark:text-amber-400">
                        Personal Guest Identity
                      </span>
                      <h4 className="font-serif text-base font-bold text-fg">
                        {identity ? 'Update Your Guest Profile' : 'Who am I speaking with today?'}
                      </h4>
                    </div>
                  </div>
                  {identity && (
                    <button
                      type="button"
                      onClick={() => setShowIdentityForm(false)}
                      className="rounded-lg p-1 text-fg-muted hover:text-fg"
                    >
                      <X className="size-4" />
                    </button>
                  )}
                </div>

                <p className="text-xs text-fg-muted leading-relaxed">
                  Introduce yourself once so Sipi Concierge knows who it is assisting, links your reservations, and fetches your official Reberon Hotel receipts & invoices in real time.
                </p>

                {/* 1-Tap Staff / Active Session Shortcut if detected */}
                {initialStaffUser?.name && !identity && (
                  <button
                    type="button"
                    onClick={() => {
                      const staffId: ConciergeGuestIdentityDTO = {
                        name: initialStaffUser.name,
                        email: initialStaffUser.email || undefined,
                        identifiedAt: new Date().toISOString(),
                      };
                      void syncIdentityWithBackend(sessionId, staffId, true);
                    }}
                    className="w-full flex items-center justify-between rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-3.5 py-2.5 text-xs font-semibold text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/20 transition-colors cursor-pointer"
                  >
                    <span className="flex items-center gap-2">
                      <CheckCircle2 className="size-4 text-emerald-500" />
                      <span>Continue as {initialStaffUser.name} (Active Session)</span>
                    </span>
                    <ArrowRight className="size-3.5" />
                  </button>
                )}

                <form onSubmit={handleIdentitySubmit} className="space-y-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-fg mb-1">
                      Your Full Name <span className="text-amber-600">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={idForm.name}
                      onChange={(e) => setIdForm({ ...idForm, name: e.target.value })}
                      placeholder="e.g. Denis Mayamba or Sarah Namono"
                      className="w-full rounded-xl border border-line bg-surface px-3 py-2 text-xs text-fg placeholder:text-fg-muted/60 focus:border-amber-500 focus:outline-none"
                      autoFocus
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <div>
                      <label className="block text-[11px] font-medium text-fg-muted mb-1">
                        Phone / WhatsApp <span className="text-[10px]">(for bookings/docs)</span>
                      </label>
                      <input
                        type="tel"
                        value={idForm.phone}
                        onChange={(e) => setIdForm({ ...idForm, phone: e.target.value })}
                        placeholder="+256 7xx xxx xxx"
                        className="w-full rounded-xl border border-line bg-surface px-3 py-2 text-xs text-fg placeholder:text-fg-muted/60 focus:border-amber-500 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-medium text-fg-muted mb-1">
                        Booking / Receipt Code <span className="text-[10px]">(optional)</span>
                      </label>
                      <input
                        type="text"
                        value={idForm.bookingCode}
                        onChange={(e) => setIdForm({ ...idForm, bookingCode: e.target.value.toUpperCase() })}
                        placeholder="RB-XXXXX or RCT-..."
                        className="w-full rounded-xl border border-line bg-surface px-3 py-2 font-mono text-xs uppercase text-fg placeholder:text-fg-muted/60 focus:border-amber-500 focus:outline-none"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-medium text-fg-muted mb-1">
                      Email Address <span className="text-[10px]">(optional, for receipts)</span>
                    </label>
                    <input
                      type="email"
                      value={idForm.email}
                      onChange={(e) => setIdForm({ ...idForm, email: e.target.value })}
                      placeholder="you@example.com"
                      className="w-full rounded-xl border border-line bg-surface px-3 py-2 text-xs text-fg placeholder:text-fg-muted/60 focus:border-amber-500 focus:outline-none"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={!idForm.name.trim() || isSyncingIdentity}
                    className="w-full flex items-center justify-center gap-2 rounded-xl bg-linear-to-r from-amber-700 to-amber-600 py-2.5 px-4 text-xs font-semibold text-white shadow-md hover:opacity-95 disabled:opacity-40 transition-opacity cursor-pointer"
                  >
                    {isSyncingIdentity ? (
                      <>
                        <RefreshCw className="size-3.5 animate-spin" />
                        <span>Syncing Profile & Hotel Records...</span>
                      </>
                    ) : (
                      <>
                        <span>{identity ? 'Save & Sync My Records' : 'Start Concierge Session'}</span>
                        <ChevronRight className="size-3.5" />
                      </>
                    )}
                  </button>
                </form>
              </div>
            </div>
          ) : (
            /* ── IDENTIFIED WORKSPACE: CHAT / QUICK ACTIONS / MY ACTIVITY & DOCS ── */
            <div className="flex-1 flex overflow-hidden">
              {/* Left / Main Column */}
              <div className="flex-1 flex flex-col min-w-0">
                {/* Compact Action Strip (Always visible in Chat mode) */}
                {activeTab === 'chat' && (
                  <div className="border-b border-line/60 bg-surface/60 px-2.5 py-1.5 overflow-x-auto scrollbar-none flex items-center gap-1 shrink-0">
                    {QUICK_ACTIONS.map((act) => {
                      const Icon = act.icon;
                      return (
                        <button
                          key={act.id}
                          type="button"
                          disabled={isLoading}
                          onClick={() => void handleSend(act.prompt)}
                          className="shrink-0 text-nowrap rounded-lg border border-line bg-surface hover:bg-surface-2 hover:border-amber-500/40 px-2 py-1 text-[10.5px] font-medium text-fg flex items-center gap-1 transition-colors cursor-pointer"
                        >
                          <Icon className="size-3 text-amber-600 dark:text-amber-400" />
                          <span>{act.label}</span>
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* TAB 1: COMPACT ACTION-BASED CHAT */}
                {activeTab === 'chat' && (
                  <>
                    <div className="flex-1 overflow-y-auto px-3.5 py-3 space-y-3.5 text-[13px] leading-snug">
                      {messages.map((m) => (
                        <div
                          key={m.id}
                          className={cn(
                            'flex gap-2 max-w-[96%]',
                            m.role === 'user' ? 'ml-auto flex-row-reverse' : 'mr-auto',
                          )}
                        >
                          {m.role === 'assistant' ? (
                            <button
                              type="button"
                              onClick={() => speakMessage(m.content)}
                              className="size-6 shrink-0 rounded-md bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 grid place-items-center mt-0.5 hover:bg-amber-500/25 transition-colors cursor-pointer"
                              title={isSpeaking ? 'Stop voice' : 'Listen'}
                            >
                              {isSpeaking ? (
                                <VolumeX className="size-3 animate-pulse text-amber-600" />
                              ) : (
                                <Volume2 className="size-3" />
                              )}
                            </button>
                          ) : (
                            <div className="size-6 shrink-0 rounded-md bg-surface-2 border border-line text-fg-muted grid place-items-center mt-0.5 text-[10px] font-bold">
                              {identity.name.slice(0, 1).toUpperCase()}
                            </div>
                          )}

                          <div className="space-y-2 flex-1 min-w-0">
                            <div
                              className={cn(
                                'rounded-xl px-3.5 py-2.5 shadow-2xs font-sans border',
                                m.role === 'user'
                                  ? 'bg-surface-2 border-line-strong text-fg rounded-tr-xs'
                                  : 'bg-surface/90 border-line rounded-tl-xs text-fg',
                              )}
                            >
                              <ConciergeMarkdown content={m.content} />
                            </div>

                            {/* Action Cards Emitted by Tools */}
                            {m.cards && m.cards.length > 0 && (
                              <div className="space-y-2">
                                {m.cards.map((card, idx) => (
                                  <ConciergeCardView
                                    key={idx}
                                    card={card}
                                    guestName={identity.name}
                                    onPromptSelect={(p) => void handleSend(p)}
                                    onImageClick={(url) => setSelectedImage(url)}
                                    onOpenDocument={(doc) => setPreviewDoc(doc)}
                                  />
                                ))}
                              </div>
                            )}

                            {/* Follow-up Action Chips */}
                            {m.role === 'assistant' && m.followUpQuestions && m.followUpQuestions.length > 0 && (
                              <div className="flex flex-wrap items-center gap-1 pt-0.5">
                                {m.followUpQuestions.map((q, idx) => (
                                  <button
                                    key={idx}
                                    type="button"
                                    disabled={isLoading}
                                    onClick={() => void handleSend(q)}
                                    className="rounded-full border border-amber-500/30 bg-amber-500/5 hover:border-amber-500/60 hover:bg-amber-500/15 px-2.5 py-1 text-[11px] font-medium text-amber-800 dark:text-amber-300 transition-colors cursor-pointer"
                                  >
                                    {q}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      ))}

                      {isLoading && (
                        <div className="flex gap-2 max-w-[90%] mr-auto">
                          <div className="size-6 shrink-0 rounded-md bg-amber-500/10 border border-amber-500/20 text-amber-600 grid place-items-center mt-0.5">
                            <Sparkles className="size-3 animate-spin" />
                          </div>
                          <div className="rounded-xl rounded-tl-xs bg-surface-2/90 border border-line px-3.5 py-2 text-fg-muted flex items-center gap-2">
                            <span className="flex space-x-1">
                              <span className="size-1.5 rounded-full bg-amber-500 animate-bounce" />
                              <span className="size-1.5 rounded-full bg-amber-500 animate-bounce [animation-delay:150ms]" />
                              <span className="size-1.5 rounded-full bg-amber-500 animate-bounce [animation-delay:300ms]" />
                            </span>
                            <span className="text-[11.5px]">Executing live PMS action for {identity.name.split(' ')[0]}...</span>
                          </div>
                        </div>
                      )}

                      <div ref={messagesEndRef} />
                    </div>

                    {/* Compact Input Bar */}
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        void handleSend();
                      }}
                      className="border-t border-line bg-surface p-2.5 shrink-0"
                    >
                      <div className="relative flex items-center">
                        <input
                          ref={inputRef}
                          type="text"
                          value={input}
                          onChange={(e) => setInput(e.target.value)}
                          placeholder={
                            isListening
                              ? '🎙️ Listening...'
                              : `Ask Sipi Concierge (${identity.name.split(' ')[0]}) — bookings, receipts, holds...`
                          }
                          disabled={isLoading}
                          className="w-full rounded-xl border border-line bg-surface-2/60 pl-3 pr-18 py-2 text-xs text-fg placeholder:text-fg-muted/70 focus:border-amber-500/60 focus:bg-surface focus:outline-none"
                        />
                        <div className="absolute right-1.5 flex items-center gap-1">
                          {hasSpeechRec && (
                            <button
                              type="button"
                              onClick={toggleListening}
                              className={cn(
                                'rounded-lg p-1.5 transition-colors cursor-pointer',
                                isListening
                                  ? 'bg-red-500 text-white animate-pulse'
                                  : 'text-fg-muted hover:text-fg hover:bg-surface-2',
                              )}
                              title="Voice input"
                            >
                              {isListening ? <MicOff className="size-3.5" /> : <Mic className="size-3.5" />}
                            </button>
                          )}
                          <button
                            type="submit"
                            disabled={!input.trim() || isLoading}
                            className="rounded-lg bg-brand text-brand-fg p-1.5 disabled:opacity-30 hover:opacity-90 transition-opacity cursor-pointer"
                            aria-label="Send"
                          >
                            <Send className="size-3.5" />
                          </button>
                        </div>
                      </div>
                    </form>
                  </>
                )}

                {/* TAB 2: DIRECT ACTION CENTER (Zero-Typing Forms) */}
                {activeTab === 'actions' && (
                  <div className="flex-1 overflow-y-auto p-3.5 space-y-3.5 text-xs">
                    {/* 1. Instant 48h Complimentary Suite Hold */}
                    <div className="rounded-xl border border-line bg-surface-2/50 p-3.5 space-y-2.5">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-fg flex items-center gap-1.5">
                          <BedDouble className="size-3.5 text-amber-600" />
                          <span>Instant 48-Hour Suite Hold</span>
                        </span>
                        <span className="text-[10px] font-mono text-emerald-600 dark:text-emerald-400">No upfront card needed</span>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        <select
                          value={quickHold.roomSlug}
                          onChange={(e) => setQuickHold({ ...quickHold, roomSlug: e.target.value })}
                          className="rounded-lg border border-line bg-surface px-2.5 py-1.5 text-xs text-fg"
                        >
                          <option value="elgon-view-king">Elgon View King</option>
                          <option value="sipi-twin">Sipi Twin</option>
                          <option value="coffee-terrace-family">Coffee Terrace Family</option>
                          <option value="summit-suite">Summit Suite</option>
                        </select>
                        <input
                          type="date"
                          value={quickHold.arrival}
                          onChange={(e) => setQuickHold({ ...quickHold, arrival: e.target.value })}
                          className="rounded-lg border border-line bg-surface px-2.5 py-1.5 text-xs text-fg"
                        />
                        <input
                          type="date"
                          value={quickHold.departure}
                          onChange={(e) => setQuickHold({ ...quickHold, departure: e.target.value })}
                          className="rounded-lg border border-line bg-surface px-2.5 py-1.5 text-xs text-fg"
                        />
                      </div>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            void handleSend(
                              `Calculate a stay quote for ${quickHold.roomSlug} from ${quickHold.arrival} to ${quickHold.departure}.`,
                            )
                          }
                          className="flex-1 rounded-lg border border-line bg-surface py-1.5 font-semibold text-fg hover:bg-surface-2 cursor-pointer"
                        >
                          Calculate Quote
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            void handleSend(
                              `Place a 48-hour complimentary reservation hold for ${quickHold.roomSlug} from ${quickHold.arrival} to ${quickHold.departure} for ${identity.name}${identity.phone ? ` (Phone: ${identity.phone})` : ''}.`,
                            )
                          }
                          className="flex-1 rounded-lg bg-amber-600 text-white py-1.5 font-semibold hover:bg-amber-700 cursor-pointer"
                        >
                          Lock 48h Hold Now
                        </button>
                      </div>
                    </div>

                    {/* 2. Submit In-Stay or Pre-Arrival Guest Request */}
                    <div className="rounded-xl border border-line bg-surface-2/50 p-3.5 space-y-2.5">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-fg flex items-center gap-1.5">
                          <BellRing className="size-3.5 text-amber-600" />
                          <span>Submit Live PMS Guest Request</span>
                        </span>
                        <span className="text-[10px] text-fg-muted">Direct to Front Desk</span>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <select
                          value={quickRequest.kind}
                          onChange={(e) => setQuickRequest({ ...quickRequest, kind: e.target.value })}
                          className="rounded-lg border border-line bg-surface px-2.5 py-1.5 text-xs text-fg"
                        >
                          <option value="LATE_CHECKOUT">Late Check-Out</option>
                          <option value="GUIDE">Private Sipi Falls Trail Guide</option>
                          <option value="TRANSFER">4x4 Sanctuary Transfer</option>
                          <option value="EXTRA">Extra Bed / Cot / Linen</option>
                          <option value="ADD_NIGHT">Extend Stay (Add Night)</option>
                          <option value="OTHER">Room Service / Special Note</option>
                        </select>
                        <input
                          type="text"
                          value={quickRequest.code}
                          onChange={(e) => setQuickRequest({ ...quickRequest, code: e.target.value.toUpperCase() })}
                          placeholder={dossier?.summary.activeStayCode || identity.bookingCode || 'Booking Code (RB-...)'}
                          className="rounded-lg border border-line bg-surface px-2.5 py-1.5 font-mono text-xs uppercase text-fg"
                        />
                      </div>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={quickRequest.note}
                          onChange={(e) => setQuickRequest({ ...quickRequest, note: e.target.value })}
                          placeholder="Request details (e.g. Late checkout at 2 PM, or 8 AM waterfall guide)..."
                          className="flex-1 rounded-lg border border-line bg-surface px-2.5 py-1.5 text-xs text-fg"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            void handleSend(
                              `Submit a ${quickRequest.kind} guest request${quickRequest.code ? ` for booking ${quickRequest.code}` : ''}: "${quickRequest.note || quickRequest.kind}".`,
                            )
                          }
                          className="rounded-lg bg-brand text-brand-fg px-3 py-1.5 font-semibold cursor-pointer"
                        >
                          Send
                        </button>
                      </div>
                    </div>

                    {/* 3. Verify Official Receipt / Invoice / Quotation */}
                    <div className="rounded-xl border border-line bg-surface-2/50 p-3.5 space-y-2.5">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-fg flex items-center gap-1.5">
                          <ShieldCheck className="size-3.5 text-emerald-500" />
                          <span>Verify Receipt, Invoice or Quotation</span>
                        </span>
                        <span className="text-[10px] font-mono text-fg-muted">RCT · INV · QUO</span>
                      </div>
                      <div className="flex flex-col sm:flex-row gap-2">
                        <input
                          type="text"
                          value={quickVerify.number}
                          onChange={(e) => setQuickVerify({ ...quickVerify, number: e.target.value.toUpperCase() })}
                          placeholder="Document No (e.g. RCT-2026-00001)"
                          className="flex-1 rounded-lg border border-line bg-surface px-2.5 py-1.5 font-mono text-xs uppercase text-fg"
                        />
                        <input
                          type="text"
                          value={quickVerify.checkCode}
                          onChange={(e) => setQuickVerify({ ...quickVerify, checkCode: e.target.value.toUpperCase() })}
                          placeholder="Check Code (optional)"
                          className="sm:w-36 rounded-lg border border-line bg-surface px-2.5 py-1.5 font-mono text-xs uppercase text-fg"
                        />
                        <button
                          type="button"
                          disabled={!quickVerify.number.trim()}
                          onClick={() =>
                            void handleSend(
                              `Verify official hotel document ${quickVerify.number}${quickVerify.checkCode ? ` with check code ${quickVerify.checkCode}` : ''}.`,
                            )
                          }
                          className="rounded-lg bg-emerald-600 text-white px-3 py-1.5 font-semibold disabled:opacity-40 cursor-pointer"
                        >
                          Verify
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* TAB 3: LIVE GUEST DOSSIER (MY ACTIVITY, BOOKINGS, RECEIPTS & INVOICES) */}
                {activeTab === 'dossier' && (
                  <div className="flex-1 overflow-y-auto p-3.5 space-y-4 text-xs">
                    {/* Guest Summary Header Card */}
                    <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3.5 flex items-center justify-between gap-3">
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                          <span className="font-serif text-sm font-bold text-fg">{identity.name}</span>
                          {identity.isVerified && (
                            <span className="rounded-full bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.2 text-[9.5px] font-semibold text-emerald-600 dark:text-emerald-400">
                              Verified Profile
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-fg-muted">
                          {[identity.phone, identity.email, identity.bookingCode].filter(Boolean).join(' · ') ||
                            'Add your phone or booking code to link more hotel records'}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => void syncIdentityWithBackend(sessionId, identity, false)}
                          className="rounded-lg border border-line bg-surface p-1.5 text-fg-muted hover:text-fg cursor-pointer"
                          title="Refresh live hotel records"
                        >
                          <RefreshCw className={cn('size-3.5', isSyncingIdentity && 'animate-spin')} />
                        </button>
                        <button
                          type="button"
                          onClick={() => setShowIdentityForm(true)}
                          className="rounded-lg border border-line bg-surface px-2.5 py-1.5 text-[11px] font-medium text-fg hover:bg-surface-2 cursor-pointer"
                        >
                          Edit Profile
                        </button>
                      </div>
                    </div>

                    {/* Official Receipts, Invoices & Quotations Section */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-semibold uppercase tracking-wider text-fg-muted">
                          Official Receipts, Invoices & Quotations ({dossier?.documents.length ?? 0})
                        </span>
                        <button
                          type="button"
                          onClick={() => void handleSend('Fetch all my official receipts, tax invoices, and quotations.')}
                          className="text-[11px] text-amber-600 dark:text-amber-400 hover:underline cursor-pointer"
                        >
                          Search by Code →
                        </button>
                      </div>

                      {dossier?.documents && dossier.documents.length > 0 ? (
                        <div className="space-y-2">
                          {dossier.documents.map((doc) => (
                            <div
                              key={doc.id}
                              className="rounded-xl border border-line bg-surface p-3 flex items-center justify-between gap-3 hover:border-amber-500/40 transition-colors"
                            >
                              <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="rounded bg-amber-500/15 px-1.5 py-0.5 font-mono text-[10px] font-bold text-amber-700 dark:text-amber-300">
                                    {doc.kind}
                                  </span>
                                  <span className="font-mono font-bold text-xs text-fg">{doc.number}</span>
                                  <span className="font-mono text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                                    {doc.amount}
                                  </span>
                                </div>
                                <div className="text-[10.5px] text-fg-muted mt-0.5">
                                  Issued {doc.issuedAt.slice(0, 10)} · Check Code: <code className="font-mono">{doc.checkCode}</code>
                                  {doc.reservationCode ? ` · Stay ${doc.reservationCode}` : ''}
                                </div>
                              </div>
                              <div className="flex items-center gap-1.5 shrink-0">
                                {doc.printUrl && (
                                  <button
                                    type="button"
                                    onClick={() => setPreviewDoc(doc)}
                                    className="inline-flex items-center gap-1 rounded-lg bg-primary text-primary-fg px-2.5 py-1.5 text-[11px] font-semibold hover:opacity-90 cursor-pointer"
                                  >
                                    <Printer className="size-3" />
                                    <span>View & Print</span>
                                  </button>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="rounded-xl border border-dashed border-line p-4 text-center text-fg-muted">
                          No receipts or invoices linked yet. Add your booking phone or code in{' '}
                          <button
                            type="button"
                            onClick={() => setShowIdentityForm(true)}
                            className="text-amber-600 underline cursor-pointer"
                          >
                            Edit Profile
                          </button>{' '}
                          to pull your documents.
                        </div>
                      )}
                    </div>

                    {/* Recent Activity Timeline */}
                    <div className="space-y-2">
                      <span className="text-[11px] font-semibold uppercase tracking-wider text-fg-muted block">
                        Recent Actions & Activities with Reberon Hotel ({dossier?.recentActivities.length ?? 0})
                      </span>

                      {dossier?.recentActivities && dossier.recentActivities.length > 0 ? (
                        <div className="space-y-2">
                          {dossier.recentActivities.map((act) => (
                            <div
                              key={act.id}
                              className="rounded-xl border border-line bg-surface p-3 flex items-start justify-between gap-3"
                            >
                              <div className="space-y-0.5 min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="font-semibold text-fg truncate">{act.title}</span>
                                  {act.reference && (
                                    <span className="font-mono text-[10px] rounded bg-surface-2 px-1.5 py-0.2 border border-line">
                                      {act.reference}
                                    </span>
                                  )}
                                </div>
                                <p className="text-[11px] text-fg-muted">{act.subtitle}</p>
                                <span className="text-[10px] text-fg-subtle font-mono">
                                  {act.timestamp.slice(0, 10)} · {act.status}
                                  {act.amount ? ` · ${act.amount}` : ''}
                                </span>
                              </div>
                              {act.actionUrl && (
                                <a
                                  href={act.actionUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="shrink-0 rounded-lg border border-line bg-surface-2 px-2.5 py-1 text-[10.5px] font-medium text-fg hover:border-amber-500/40"
                                >
                                  {act.actionLabel || 'Open'}
                                </a>
                              )}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="rounded-xl border border-dashed border-line p-4 text-center text-fg-muted">
                          No recent hotel activities found under this name/phone yet.
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Right Column in Fullscreen Desktop: Live Guest Dossier & Active Card Monitor */}
              {isFullScreen && (
                <div className="hidden lg:flex w-[370px] xl:w-[410px] flex-col border-l border-line bg-surface-2/40 p-4 overflow-y-auto space-y-4">
                  <div className="rounded-xl border border-line bg-surface p-3.5 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-amber-600 dark:text-amber-400">
                        Active Guest Session
                      </span>
                      <button
                        type="button"
                        onClick={() => setShowIdentityForm(true)}
                        className="text-[10.5px] text-amber-600 hover:underline cursor-pointer"
                      >
                        Switch / Edit
                      </button>
                    </div>
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="font-serif text-base font-bold text-fg">{identity.name}</h4>
                        <p className="text-[11px] text-fg-muted">
                          {identity.phone || identity.email || 'Connected to Reberon PMS'}
                        </p>
                      </div>
                      <div className="text-right font-mono text-xs">
                        <div className="font-bold text-fg">{dossier?.summary.reservationsCount ?? 0} Stays</div>
                        <div className="text-[10.5px] text-emerald-600 dark:text-emerald-400">
                          {dossier?.summary.documentsCount ?? 0} Docs
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Active Focus Card */}
                  {activeCard ? (
                    <div className="space-y-1.5">
                      <span className="text-[10px] font-semibold text-fg-muted uppercase tracking-wider">
                        Live System Card
                      </span>
                      <ConciergeCardView
                        card={activeCard}
                        guestName={identity.name}
                        onPromptSelect={(p) => void handleSend(p)}
                        onImageClick={(url) => setSelectedImage(url)}
                        onOpenDocument={(doc) => setPreviewDoc(doc)}
                      />
                    </div>
                  ) : null}

                  {/* Quick Dossier Documents List in Sidebar */}
                  {dossier && dossier.documents.length > 0 && (
                    <div className="space-y-2 border-t border-line/60 pt-3">
                      <span className="text-[10px] font-semibold text-fg-muted uppercase tracking-wider block">
                        Your Official Documents ({dossier.documents.length})
                      </span>
                      <div className="space-y-1.5">
                        {dossier.documents.slice(0, 4).map((d) => (
                          <button
                            key={d.id}
                            type="button"
                            onClick={() => setPreviewDoc(d)}
                            className="w-full flex items-center justify-between rounded-lg border border-line bg-surface p-2 text-left text-xs hover:border-amber-500/40 transition-colors cursor-pointer"
                          >
                            <div>
                              <span className="font-mono font-bold text-[11px] text-fg block">{d.number}</span>
                              <span className="text-[10px] text-fg-muted">{d.kind} · {d.issuedAt.slice(0, 10)}</span>
                            </div>
                            <span className="font-mono text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                              <span>{d.amount}</span>
                              <Printer className="size-3" />
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Direct Sanctuary Shortcuts */}
                  <div className="border-t border-line/60 pt-3 space-y-1.5 mt-auto">
                    <span className="text-[10px] font-semibold text-fg-muted uppercase tracking-wider block">
                      Direct System Portals
                    </span>
                    <Link
                      href="/concierge"
                      onClick={() => setIsOpen(false)}
                      className="flex items-center justify-between rounded-lg border border-amber-500/30 bg-amber-500/5 p-2.5 text-xs font-medium text-amber-700 dark:text-amber-300 hover:bg-amber-500/10 transition-colors"
                    >
                      <span className="flex items-center gap-2">
                        <Sparkles className="size-3.5" />
                        <span>Sipi Concierge Capabilities Guide</span>
                      </span>
                      <ChevronRight className="size-3.5" />
                    </Link>
                    <Link
                      href="/book"
                      onClick={() => setIsOpen(false)}
                      className="flex items-center justify-between rounded-lg border border-line bg-surface p-2.5 text-xs font-medium hover:border-amber-500/40 transition-colors"
                    >
                      <span className="flex items-center gap-2">
                        <BedDouble className="size-3.5 text-amber-600" />
                        <span>Direct Booking Engine</span>
                      </span>
                      <ChevronRight className="size-3.5 text-fg-muted" />
                    </Link>
                    <Link
                      href="/verify"
                      onClick={() => setIsOpen(false)}
                      className="flex items-center justify-between rounded-lg border border-line bg-surface p-2.5 text-xs font-medium hover:border-amber-500/40 transition-colors"
                    >
                      <span className="flex items-center gap-2">
                        <ShieldCheck className="size-3.5 text-emerald-500" />
                        <span>Receipt & Quotation Verification</span>
                      </span>
                      <ChevronRight className="size-3.5 text-fg-muted" />
                    </Link>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Embedded Official Receipt / Invoice / Quotation Preview & Print Modal ── */}
      {previewDoc && previewDoc.printUrl && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Document ${previewDoc.number}`}
          className="fixed inset-0 z-[85] flex items-center justify-center p-3 sm:p-6 bg-basalt-950/80 backdrop-blur-sm"
        >
          <div className="relative flex flex-col w-full max-w-4xl max-h-[90vh] rounded-2xl border border-line bg-surface shadow-2xl overflow-hidden text-fg">
            <div className="flex items-center justify-between border-b border-line px-4 py-3 bg-surface-2">
              <div className="flex items-center gap-2.5">
                <FileText className="size-4 text-amber-600" />
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm">{previewDoc.kind}</span>
                    <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-surface border border-line">
                      {previewDoc.number}
                    </span>
                    <span className="font-mono text-xs text-emerald-600 dark:text-emerald-400 font-semibold">
                      {previewDoc.amount}
                    </span>
                  </div>
                  <p className="text-[11px] text-fg-muted">
                    Check Code: <code className="font-mono">{previewDoc.checkCode}</code> · Issued {previewDoc.issuedAt.slice(0, 10)}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <div className="inline-flex rounded-lg border border-line p-0.5 bg-surface text-xs">
                  <button
                    type="button"
                    onClick={() => setPreviewPaper('A4')}
                    className={cn(
                      'px-2.5 py-1 rounded-md font-medium cursor-pointer',
                      previewPaper === 'A4' ? 'bg-amber-600 text-white' : 'text-fg-muted hover:text-fg',
                    )}
                  >
                    A4
                  </button>
                  <button
                    type="button"
                    onClick={() => setPreviewPaper('80MM')}
                    className={cn(
                      'px-2.5 py-1 rounded-md font-medium cursor-pointer',
                      previewPaper === '80MM' ? 'bg-amber-600 text-white' : 'text-fg-muted hover:text-fg',
                    )}
                  >
                    80mm Thermal
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    if (docIframeRef.current?.contentWindow) {
                      docIframeRef.current.contentWindow.focus();
                      docIframeRef.current.contentWindow.print();
                    } else {
                      window.open(`${previewDoc.printUrl}&paper=${previewPaper}`, '_blank');
                    }
                  }}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-fg text-bg px-3 py-1.5 text-xs font-semibold hover:opacity-90 cursor-pointer"
                >
                  <Printer className="size-3.5" />
                  <span>Print</span>
                </button>

                <button
                  type="button"
                  onClick={() => setPreviewDoc(null)}
                  className="rounded-lg p-1.5 text-fg-muted hover:bg-surface hover:text-fg cursor-pointer"
                >
                  <X className="size-4" />
                </button>
              </div>
            </div>

            <div className="flex-1 bg-stone-200/60 p-2 sm:p-4 overflow-auto">
              <iframe
                ref={docIframeRef}
                src={`${previewDoc.printUrl}${previewDoc.printUrl.includes('?') ? '&' : '?'}paper=${previewPaper}`}
                title={`${previewDoc.kind} ${previewDoc.number}`}
                className="w-full h-[68vh] border-0 rounded-xl shadow-sm bg-white"
              />
            </div>
          </div>
        </div>
      )}

      {/* Image Zoom Lightbox */}
      {selectedImage && (
        <div
          role="dialog"
          aria-label="Image Preview"
          onClick={() => setSelectedImage(null)}
          className="fixed inset-0 z-[85] grid place-items-center bg-basalt-950/90 p-4 backdrop-blur-md cursor-zoom-out"
        >
          <div className="relative max-h-[85vh] max-w-[90vw] overflow-hidden rounded-2xl shadow-2xl">
            <Image src={selectedImage} alt="Sanctuary View" width={1200} height={800} className="object-contain" />
          </div>
        </div>
      )}
    </>
  );
}

/* ── Rich Markdown & Structured Table Renderer ── */
function ConciergeMarkdown({ content }: { content: string }) {
  const blocks = useMemo(() => {
    const lines = content.split('\n');
    const result: Array<
      | { type: 'table'; headers: string[]; rows: string[][] }
      | { type: 'heading'; level: number; text: string }
      | { type: 'list'; items: string[] }
      | { type: 'paragraph'; text: string }
    > = [];

    let i = 0;
    while (i < lines.length) {
      const line = lines[i]!.trim();

      if (line.startsWith('|') && line.endsWith('|')) {
        const tableLines: string[] = [];
        while (i < lines.length && lines[i]!.trim().startsWith('|') && lines[i]!.trim().endsWith('|')) {
          tableLines.push(lines[i]!.trim());
          i++;
        }
        if (tableLines.length >= 2) {
          const parseRow = (r: string) =>
            r
              .split('|')
              .slice(1, -1)
              .map((c) => c.trim());
          const headers = parseRow(tableLines[0]!);
          const dataRows = tableLines.slice(tableLines[1]?.includes('---') ? 2 : 1).map(parseRow);
          result.push({ type: 'table', headers, rows: dataRows });
          continue;
        }
      }

      if (line.startsWith('### ')) {
        result.push({ type: 'heading', level: 3, text: line.slice(4) });
        i++;
        continue;
      }
      if (line.startsWith('## ')) {
        result.push({ type: 'heading', level: 2, text: line.slice(3) });
        i++;
        continue;
      }
      if (line.startsWith('# ')) {
        result.push({ type: 'heading', level: 1, text: line.slice(2) });
        i++;
        continue;
      }

      if (line.startsWith('- ') || line.startsWith('* ') || line.startsWith('• ')) {
        const listItems: string[] = [];
        while (
          i < lines.length &&
          (lines[i]!.trim().startsWith('- ') || lines[i]!.trim().startsWith('* ') || lines[i]!.trim().startsWith('• '))
        ) {
          listItems.push(lines[i]!.trim().slice(2));
          i++;
        }
        result.push({ type: 'list', items: listItems });
        continue;
      }

      if (line.length > 0) {
        result.push({ type: 'paragraph', text: line });
      }
      i++;
    }

    return result;
  }, [content]);

  return (
    <div className="space-y-2">
      {blocks.map((block, idx) => {
        if (block.type === 'heading') {
          return (
            <h4
              key={idx}
              className={cn(
                'font-serif font-bold text-fg tracking-tight',
                block.level === 1 && 'text-sm',
                block.level === 2 && 'text-[13.5px]',
                block.level === 3 && 'text-xs font-semibold text-amber-700 dark:text-amber-400',
              )}
            >
              <InlineMarkdown text={block.text} />
            </h4>
          );
        }

        if (block.type === 'table') {
          return (
            <div key={idx} className="my-1.5 overflow-x-auto rounded-lg border border-line bg-surface/90">
              <table className="w-full text-left text-[11.5px] border-collapse">
                <thead>
                  <tr className="border-b border-line bg-surface-2 text-fg font-semibold">
                    {block.headers.map((h, hIdx) => (
                      <th key={hIdx} className="px-2.5 py-1.5 font-serif">
                        <InlineMarkdown text={h} />
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-line/60 font-sans">
                  {block.rows.map((row, rIdx) => (
                    <tr key={rIdx} className="hover:bg-amber-500/5">
                      {row.map((cell, cIdx) => (
                        <td key={cIdx} className="px-2.5 py-1.5 text-fg/90">
                          <InlineMarkdown text={cell} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }

        if (block.type === 'list') {
          return (
            <ul key={idx} className="space-y-1 pl-0.5">
              {block.items.map((item, lIdx) => (
                <li key={lIdx} className="flex items-start gap-1.5 text-[12.5px]">
                  <span className="size-1.5 rounded-full bg-amber-500 shrink-0 mt-1.5" />
                  <span>
                    <InlineMarkdown text={item} />
                  </span>
                </li>
              ))}
            </ul>
          );
        }

        return (
          <p key={idx} className="text-[13px] leading-snug">
            <InlineMarkdown text={block.text} />
          </p>
        );
      })}
    </div>
  );
}

function InlineMarkdown({ text }: { text: string }) {
  const tokens = useMemo(() => {
    const parts: Array<{ type: 'text' | 'bold' | 'link' | 'code'; content: string; url?: string }> = [];
    const linkRegex = /\[(.*?)\]\((.*?)\)/g;
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = linkRegex.exec(text)) !== null) {
      if (match.index > lastIndex) {
        parseFormatting(text.substring(lastIndex, match.index), parts);
      }
      parts.push({
        type: 'link',
        content: match[1] || '',
        url: match[2] || '',
      });
      lastIndex = linkRegex.lastIndex;
    }

    if (lastIndex < text.length) {
      parseFormatting(text.substring(lastIndex), parts);
    }

    return parts;
  }, [text]);

  return (
    <>
      {tokens.map((tok, i) => {
        if (tok.type === 'link') {
          const isInternal = tok.url?.startsWith('/');
          if (isInternal) {
            return (
              <Link
                key={i}
                href={tok.url!}
                className="font-medium text-amber-600 dark:text-amber-400 underline decoration-amber-500/40 hover:decoration-amber-500"
              >
                {tok.content}
              </Link>
            );
          }
          return (
            <a
              key={i}
              href={tok.url!}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-0.5 font-medium text-amber-600 dark:text-amber-400 underline decoration-amber-500/40 hover:decoration-amber-500"
            >
              <span>{tok.content}</span>
              <ExternalLink className="size-2.5 inline" />
            </a>
          );
        }

        if (tok.type === 'bold') {
          return (
            <strong key={i} className="font-semibold text-fg">
              {tok.content}
            </strong>
          );
        }

        if (tok.type === 'code') {
          return (
            <code
              key={i}
              className="rounded bg-surface-2 px-1 py-0.2 font-mono text-[11px] text-amber-700 dark:text-amber-300"
            >
              {tok.content}
            </code>
          );
        }

        return <span key={i}>{tok.content}</span>;
      })}
    </>
  );
}

function parseFormatting(
  raw: string,
  parts: Array<{ type: 'text' | 'bold' | 'link' | 'code'; content: string; url?: string }>,
) {
  const boldParts = raw.split(/(\*\*.*?\*\*|`.*?`)/g);
  for (const p of boldParts) {
    if (p.startsWith('**') && p.endsWith('**')) {
      parts.push({ type: 'bold', content: p.slice(2, -2) });
    } else if (p.startsWith('`') && p.endsWith('`')) {
      parts.push({ type: 'code', content: p.slice(1, -1) });
    } else if (p.length > 0) {
      parts.push({ type: 'text', content: p });
    }
  }
}

const downloadIcs = (code: string, roomName: string, arrival: string, departure: string) => {
  const start = (arrival || '').replace(/-/g, '');
  const end = (departure || '').replace(/-/g, '');
  const ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Reberon Hotel//Sipi Concierge//EN',
    'BEGIN:VEVENT',
    `UID:reberon-${code}@reberonhotel.com`,
    `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').split('.')[0]}Z`,
    `DTSTART;VALUE=DATE:${start}`,
    `DTEND;VALUE=DATE:${end}`,
    `SUMMARY:Stay at Reberon Hotel Kapchorwa (${roomName})`,
    `DESCRIPTION:Reservation ${code} at Reberon Hotel, Mount Elgon sanctuary (1,900 m ASL).\\nReceipt & Stay Portal: https://reberonhotel.com/stay?code=${code}`,
    'LOCATION:Reberon Hotel, Kapchorwa, Mount Elgon, Uganda',
    'STATUS:CONFIRMED',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');

  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `reberon-stay-${code}.ics`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

/* ── Compact Action-First Card Component for All 15 System Card Types ── */
function ConciergeCardView({
  card,
  guestName,
  onPromptSelect,
  onImageClick,
  onOpenDocument,
}: {
  card: ConciergeCardDTO;
  guestName?: string;
  onPromptSelect: (prompt: string) => void;
  onImageClick?: (url: string) => void;
  onOpenDocument?: (doc: ConciergeDocumentItemDTO) => void;
}) {
  const [copiedLink, setCopiedLink] = useState(false);

  switch (card.type) {
    case 'documents':
      return (
        <div className="rounded-xl border border-amber-500/35 bg-amber-500/5 p-3.5 space-y-2.5 shadow-2xs">
          <div className="flex items-center justify-between border-b border-amber-500/20 pb-2">
            <div className="flex items-center gap-2">
              <FileText className="size-4 text-amber-600 dark:text-amber-400" />
              <div>
                <span className="text-[10px] font-semibold uppercase tracking-wider text-amber-600 dark:text-amber-400 block">
                  Official Receipts & Tax Invoices
                </span>
                <h4 className="font-serif text-xs font-bold text-fg">
                  {card.guestName} · {card.documents.length} Document{card.documents.length === 1 ? '' : 's'}
                </h4>
              </div>
            </div>
            <Link
              href="/verify"
              className="rounded-md border border-line bg-surface px-2 py-1 text-[10px] font-medium text-fg-muted hover:text-fg"
            >
              Verify Portal
            </Link>
          </div>

          {card.documents.length > 0 ? (
            <div className="space-y-1.5">
              {card.documents.map((doc) => (
                <div
                  key={doc.id}
                  className="rounded-lg border border-line bg-surface p-2.5 flex items-center justify-between gap-2 text-xs"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="rounded bg-amber-500/15 px-1.5 py-0.2 font-mono text-[9.5px] font-bold text-amber-700 dark:text-amber-300">
                        {doc.kind}
                      </span>
                      <span className="font-mono font-bold text-fg">{doc.number}</span>
                      <span className="font-mono font-semibold text-emerald-600 dark:text-emerald-400">{doc.amount}</span>
                    </div>
                    <div className="text-[10px] text-fg-muted mt-0.5">
                      {doc.issuedAt.slice(0, 10)} · Check: <code className="font-mono">{doc.checkCode}</code>
                      {doc.reservationCode ? ` · ${doc.reservationCode}` : ''}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {doc.printUrl && (
                      <button
                        type="button"
                        onClick={() => onOpenDocument?.(doc)}
                        className="inline-flex items-center gap-1 rounded-md bg-primary text-primary-fg px-2.5 py-1 text-[10.5px] font-semibold hover:opacity-90 cursor-pointer"
                      >
                        <Printer className="size-3" />
                        <span>View / Print</span>
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-fg-muted">
              No issued documents found yet. Share your booking code (e.g. <code className="font-mono">RB-XXXXX</code>) or document number (<code className="font-mono">RCT-...</code>) to pull it up.
            </p>
          )}
        </div>
      );

    case 'activity_log':
      return (
        <div className="rounded-xl border border-line bg-surface p-3.5 space-y-2.5 shadow-2xs">
          <div className="flex items-center justify-between border-b border-line pb-2">
            <div className="flex items-center gap-2">
              <Activity className="size-4 text-amber-600 dark:text-amber-400" />
              <div>
                <span className="text-[10px] font-semibold uppercase tracking-wider text-amber-600 dark:text-amber-400 block">
                  Live Guest Activity Dossier
                </span>
                <h4 className="font-serif text-xs font-bold text-fg">{card.guestName}</h4>
              </div>
            </div>
            <div className="flex items-center gap-1.5 font-mono text-[10px]">
              <span className="rounded bg-surface-2 px-1.5 py-0.5 border border-line">
                {card.summary.reservationsCount} Stays
              </span>
              <span className="rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 px-1.5 py-0.5 border border-emerald-500/20">
                {card.summary.documentsCount} Docs
              </span>
            </div>
          </div>

          {card.activities.length > 0 ? (
            <div className="space-y-1.5 max-h-52 overflow-y-auto pr-0.5">
              {card.activities.slice(0, 5).map((act) => (
                <div
                  key={act.id}
                  className="rounded-lg border border-line/70 bg-surface-2/50 p-2 flex items-center justify-between gap-2 text-xs"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="font-semibold text-[11.5px] text-fg truncate">{act.title}</span>
                      {act.reference && (
                        <span className="font-mono text-[9.5px] rounded bg-surface px-1 py-0.2 border border-line">
                          {act.reference}
                        </span>
                      )}
                    </div>
                    <p className="text-[10.5px] text-fg-muted truncate">{act.subtitle}</p>
                  </div>
                  <div className="text-right shrink-0">
                    {act.amount && <div className="font-mono text-[10.5px] font-bold text-fg">{act.amount}</div>}
                    <span className="text-[9.5px] font-mono text-amber-600 dark:text-amber-400">{act.status}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-fg-muted">No recent bookings or POS orders recorded under this identity yet.</p>
          )}

          {card.documents && card.documents.length > 0 && (
            <div className="pt-1 border-t border-line flex flex-wrap gap-1.5">
              {card.documents.slice(0, 3).map((d) => (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => onOpenDocument?.(d)}
                  className="inline-flex items-center gap-1 rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-[10.5px] font-mono font-semibold text-amber-700 dark:text-amber-300 hover:bg-amber-500/20 cursor-pointer"
                >
                  <Printer className="size-2.5" />
                  <span>{d.number}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      );

    case 'document_verify':
      return (
        <div
          className={cn(
            'rounded-xl border p-3.5 space-y-2 shadow-2xs text-xs',
            card.valid
              ? card.voided
                ? 'border-amber-500/40 bg-amber-500/10'
                : 'border-emerald-500/40 bg-emerald-500/10'
              : 'border-red-500/40 bg-red-500/10',
          )}
        >
          <div className="flex items-center justify-between">
            <span className="font-semibold flex items-center gap-1.5 text-fg">
              <ShieldCheck className={cn('size-4', card.valid ? 'text-emerald-500' : 'text-red-500')} />
              <span>
                {card.valid
                  ? card.voided
                    ? 'Genuine Document (Voided/Expired)'
                    : `Verified Genuine ${card.kind}`
                  : 'Document Not Verified'}
              </span>
            </span>
            <span className="font-mono font-bold">{card.number}</span>
          </div>
          {card.valid && (
            <div className="text-[11px] text-fg-muted flex flex-wrap gap-x-4 gap-y-1">
              <span>Amount: <strong className="text-fg font-mono">{card.amount}</strong></span>
              <span>Issued: <strong className="text-fg">{card.issuedAt}</strong></span>
              {card.checkCode && <span>Check Code: <code className="font-mono text-fg">{card.checkCode}</code></span>}
            </div>
          )}
          <Link
            href={card.verifyUrl}
            target="_blank"
            className="inline-flex items-center gap-1 text-[11px] font-semibold underline"
          >
            <span>Open Official Verification Certificate</span>
            <ExternalLink className="size-3" />
          </Link>
        </div>
      );

    case 'guest_request':
      return (
        <div className="rounded-xl border border-emerald-500/35 bg-emerald-500/5 p-3.5 space-y-2 text-xs">
          <div className="flex items-center justify-between">
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="size-3.5" /> Logged in Reberon PMS
            </span>
            <span className="font-mono font-bold text-fg">{card.reservationCode}</span>
          </div>
          <div className="font-semibold text-fg">{card.kind} Request — {card.guestName}</div>
          <p className="text-[11.5px] text-fg-muted">"{card.note}"</p>
          {card.stayUrl && (
            <Link
              href={card.stayUrl}
              target="_blank"
              className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300 hover:underline"
            >
              <span>View on Stay Portal</span>
              <ChevronRight className="size-3" />
            </Link>
          )}
        </div>
      );

    case 'room':
      return (
        <div className="rounded-xl border border-line bg-surface p-3 shadow-2xs space-y-2.5">
          {card.imageUrl && (
            <div
              onClick={() => onImageClick?.(card.imageUrl!)}
              className="relative h-28 w-full overflow-hidden rounded-lg bg-surface-2 cursor-pointer group"
            >
              <Image
                src={card.imageUrl}
                alt={card.name || 'Suite'}
                fill
                sizes="420px"
                className="object-cover group-hover:scale-105 transition-transform duration-500"
              />
              <div className="absolute inset-0 bg-linear-to-t from-basalt-950/75 via-transparent to-transparent" />
              <div className="absolute bottom-2 left-2.5 right-2.5 flex items-center justify-between text-white text-xs">
                <span className="font-semibold">{card.name}</span>
                <span className="font-mono bg-amber-600/90 px-2 py-0.5 rounded-full text-[11px] font-semibold">
                  {card.price}
                </span>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between text-[11px] text-fg-muted">
            <span>{card.bedSetup || 'Mountain Sanctuary Suite'}</span>
            <span>{card.viewAspect || '1,900 m Ridge View'}</span>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => onPromptSelect(`Calculate a 2-night quote for ${card.name}.`)}
              className="flex-1 rounded-lg bg-amber-600/10 border border-amber-600/30 px-2.5 py-1.5 text-center text-[11.5px] font-semibold text-amber-700 dark:text-amber-400 hover:bg-amber-600/20 cursor-pointer"
            >
              2-Night Quote
            </button>
            <button
              type="button"
              onClick={() =>
                onPromptSelect(
                  `Place a 48-hour complimentary hold for ${card.name} for this upcoming weekend${guestName ? ` under ${guestName}` : ''}.`,
                )
              }
              className="flex-1 rounded-lg bg-amber-600 text-white px-2.5 py-1.5 text-center text-[11.5px] font-semibold hover:bg-amber-700 cursor-pointer"
            >
              48h Hold
            </button>
            <Link
              href={card.actionUrl || `/rooms/${card.slug || ''}`}
              className="rounded-lg border border-line px-2.5 py-1.5 text-[11.5px] font-medium text-fg-muted hover:text-fg"
            >
              Suite
            </Link>
          </div>
        </div>
      );

    case 'quote':
      return (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3.5 space-y-2.5 shadow-2xs">
          <div className="flex items-center justify-between border-b border-amber-500/20 pb-2">
            <div>
              <span className="text-[9.5px] font-semibold uppercase tracking-wider text-amber-600 dark:text-amber-400">
                Stay Quote ({card.nights} Night{card.nights > 1 ? 's' : ''})
              </span>
              <h4 className="font-serif text-sm font-bold">{card.roomName}</h4>
            </div>
            <div className="text-right">
              <div className="font-mono text-sm font-bold text-fg">{card.total}</div>
              <div className="text-[10px] text-amber-600 dark:text-amber-400">30% Deposit: {card.deposit}</div>
            </div>
          </div>

          <div className="text-[11.5px] flex justify-between text-fg-muted">
            <span>Dates:</span>
            <span className="font-semibold text-fg">{card.arrival} → {card.departure}</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() =>
                onPromptSelect(
                  `Place a 48-hour complimentary hold for ${card.roomName} from ${card.arrival} to ${card.departure} for ${guestName || 'me'}.`,
                )
              }
              className="flex-1 rounded-lg bg-linear-to-r from-amber-700 to-amber-600 text-white py-1.5 px-3 text-xs font-semibold hover:opacity-95 text-center cursor-pointer"
            >
              Lock 48-Hour Complimentary Hold →
            </button>
          </div>
        </div>
      );

    case 'reservation':
      return (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3.5 space-y-2.5 shadow-2xs">
          <div className="flex items-center justify-between border-b border-emerald-500/20 pb-2">
            <div className="flex items-center gap-2">
              <QrCode className="size-4 text-emerald-600 dark:text-emerald-400" />
              <div>
                <span className="text-[9.5px] font-semibold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 block">
                  Confirmed in PMS
                </span>
                <h4 className="font-mono text-sm font-bold text-fg">{card.code}</h4>
              </div>
            </div>
            <span className="rounded-full bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
              {card.status}
            </span>
          </div>

          <div className="text-[11.5px] space-y-1 text-fg-muted">
            <div className="flex justify-between">
              <span>Suite:</span>
              <span className="font-semibold text-fg">{card.roomName}</span>
            </div>
            <div className="flex justify-between">
              <span>Dates:</span>
              <span className="font-semibold text-fg">{card.arrival} → {card.departure}</span>
            </div>
            <div className="flex justify-between">
              <span>Total:</span>
              <span className="font-mono font-bold text-fg">{card.total}</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-1.5">
            {(card.stayUrl || card.receiptUrl) && (
              <Link
                href={card.stayUrl || card.receiptUrl!}
                target="_blank"
                className="inline-flex items-center justify-center gap-1 rounded-lg bg-primary text-primary-fg py-1.5 px-2.5 text-[11px] font-semibold text-center"
              >
                <Printer className="size-3" /> Stay Voucher & Receipt
              </Link>
            )}
            {card.paymentUrl && (
              <Link
                href={card.paymentUrl}
                target="_blank"
                className="inline-flex items-center justify-center gap-1 rounded-lg border border-emerald-600/30 bg-emerald-600/10 text-emerald-700 dark:text-emerald-300 py-1.5 px-2.5 text-[11px] font-semibold text-center"
              >
                <CreditCard className="size-3" /> Pay Deposit
              </Link>
            )}
          </div>

          <div className="flex items-center justify-between pt-1 border-t border-emerald-500/15 text-[10.5px]">
            <button
              type="button"
              onClick={() => downloadIcs(card.code, card.roomName, card.arrival, card.departure)}
              className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-300 hover:underline cursor-pointer"
            >
              <CalendarPlus className="size-3" /> Add to Calendar
            </button>
            <button
              type="button"
              onClick={() => {
                if (typeof navigator !== 'undefined' && navigator.clipboard) {
                  void navigator.clipboard.writeText(card.stayUrl || `https://reberonhotel.com/stay?code=${card.code}`);
                  setCopiedLink(true);
                  setTimeout(() => setCopiedLink(false), 2000);
                }
              }}
              className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-300 hover:underline cursor-pointer"
            >
              {copiedLink ? <Check className="size-3" /> : <Copy className="size-3" />}
              {copiedLink ? 'Copied' : 'Copy Link'}
            </button>
          </div>
        </div>
      );

    case 'lookup':
      return (
        <div className="rounded-xl border border-line-strong bg-surface-2/70 p-3.5 space-y-2.5 shadow-2xs">
          <div className="flex items-center justify-between border-b border-line pb-2">
            <div>
              <span className="text-[9.5px] font-semibold uppercase tracking-wider text-fg-muted block">
                Live Booking Record · {card.guestName}
              </span>
              <h4 className="font-mono text-sm font-bold text-fg">{card.code} · {card.roomName}</h4>
            </div>
            <span className="rounded-full bg-surface border border-line px-2 py-0.5 text-[10px] font-semibold text-fg">
              {card.status}
            </span>
          </div>

          <div className="text-[11.5px] space-y-1 text-fg-muted">
            <div className="flex justify-between">
              <span>Stay Dates:</span>
              <span className="font-semibold text-fg">{card.arrival} → {card.departure} ({card.nights}n)</span>
            </div>
            <div className="flex justify-between">
              <span>Total / Paid:</span>
              <span className="font-mono font-semibold text-fg">{card.total} (Paid: {card.paid})</span>
            </div>
            <div className="flex justify-between">
              <span>Balance:</span>
              <span className="font-mono font-bold text-fg">{card.balance}</span>
            </div>
          </div>

          {/* Attached Official Receipts & Invoices */}
          {card.documents && card.documents.length > 0 && (
            <div className="space-y-1 border-t border-line pt-2">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-fg-muted block">
                Official Receipts & Invoices ({card.documents.length})
              </span>
              {card.documents.map((doc) => (
                <div key={doc.id} className="flex items-center justify-between rounded-lg bg-surface p-2 border border-line text-[11px]">
                  <div>
                    <span className="font-mono font-bold text-fg">{doc.number}</span>{' '}
                    <span className="text-fg-muted">({doc.kind} · {doc.amount})</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => onOpenDocument?.(doc)}
                    className="inline-flex items-center gap-1 rounded bg-surface-2 border border-line text-fg px-2 py-0.5 text-[10px] font-semibold cursor-pointer hover:bg-surface"
                  >
                    <Printer className="size-2.5" /> Print
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="flex gap-1.5 pt-1">
            <Link
              href={card.stayUrl}
              target="_blank"
              className="flex-1 inline-flex items-center justify-center gap-1 rounded-lg border border-line bg-surface text-fg py-1.5 px-2.5 text-[11px] font-semibold text-center hover:bg-surface-2"
            >
              <Printer className="size-3" /> Stay Portal & Voucher
            </Link>
            {card.paymentUrl && (
              <Link
                href={card.paymentUrl}
                target="_blank"
                className="flex-1 inline-flex items-center justify-center gap-1 rounded-lg border border-amber-500/35 bg-amber-500/10 text-fg py-1.5 px-2.5 text-[11px] font-semibold text-center hover:bg-amber-500/20"
              >
                <CreditCard className="size-3 text-amber-500" /> Pay Balance
              </Link>
            )}
          </div>
        </div>
      );

    case 'transfer':
      return (
        <div className="rounded-xl border border-line bg-surface-2/60 p-3.5 space-y-2 text-xs">
          <div className="flex items-center justify-between border-b border-line pb-2">
            <div>
              <span className="text-[9.5px] font-semibold uppercase tracking-wider text-fg-muted block">
                Private 4x4 Sanctuary Transfer
              </span>
              <h4 className="font-serif text-xs font-bold text-fg">{card.pickupLocation} → Reberon</h4>
            </div>
            <span className="font-mono font-bold text-xs text-fg">{card.estimatedCost}</span>
          </div>
          <p className="text-[11px] text-fg-muted">{card.notes}</p>
          {card.actionUrl && (
            <a
              href={card.actionUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-line-strong bg-surface text-fg py-1.5 px-3 text-[11.5px] font-semibold hover:bg-surface-2"
            >
              <MessageCircle className="size-3.5 text-amber-500" />
              <span>{card.actionLabel || 'Confirm Transfer on WhatsApp'}</span>
            </a>
          )}
        </div>
      );

    case 'dining':
      return (
        <div className="rounded-xl border border-line bg-surface-2/60 p-3.5 space-y-2.5 text-xs">
          <div className="flex items-center justify-between border-b border-line pb-2">
            <div>
              <span className="text-[9.5px] font-semibold uppercase tracking-wider text-fg-muted block">
                Highland Dining & Live POS Menu
              </span>
              <h4 className="font-serif text-xs font-bold text-fg">{card.venue}</h4>
            </div>
            <span className="text-[10px] font-mono text-fg-muted">{card.hours}</span>
          </div>

          {card.menuItems && card.menuItems.length > 0 && (
            <div className="grid grid-cols-1 gap-1 max-h-36 overflow-y-auto pr-0.5">
              {card.menuItems.slice(0, 5).map((item, i) => (
                <div key={i} className="flex items-center justify-between rounded bg-surface px-2 py-1 border border-line/60 text-[11px]">
                  <span className="font-medium text-fg truncate">{item.name}</span>
                  <span className="font-mono text-fg font-semibold shrink-0">{item.price}</span>
                </div>
              ))}
            </div>
          )}

          <div className="flex flex-wrap gap-1">
            {card.dietaryOptions.map((opt, i) => (
              <span key={i} className="rounded bg-surface border border-line px-1.5 py-0.5 text-[9.5px] font-medium text-fg-muted">
                ✓ {opt}
              </span>
            ))}
          </div>
        </div>
      );

    case 'weather':
      return (
        <div className="rounded-xl border border-line bg-surface-2/60 p-3.5 space-y-2 text-xs">
          <div className="flex items-center justify-between border-b border-line pb-2">
            <span className="font-serif font-bold text-fg">{card.altitude}</span>
            <span className="font-mono font-bold text-fg">{card.temperatureRange}</span>
          </div>
          <div className="space-y-1 text-[11px] text-fg-muted">
            {card.packingChecklist.slice(0, 4).map((item, i) => (
              <div key={i} className="flex items-center gap-1.5">
                <Check className="size-3 text-amber-500 shrink-0" />
                <span>{item}</span>
              </div>
            ))}
          </div>
        </div>
      );

    case 'waitlist':
      return (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 space-y-1.5 text-xs">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-semibold uppercase text-amber-600">Priority First-Stay Claim</span>
            <span className="font-mono font-bold">{card.reference}</span>
          </div>
          <p className="text-[11.5px] text-fg-muted">
            Registered for <strong className="text-fg">{card.guestName}</strong> ({card.roomType} · {card.preferredDates}).
          </p>
        </div>
      );

    case 'facility':
    case 'activity':
      return (
        <div className="rounded-xl border border-line bg-surface p-3 space-y-2 text-xs">
          {card.imageUrl && (
            <div
              onClick={() => onImageClick?.(card.imageUrl!)}
              className="relative h-24 w-full overflow-hidden rounded-lg bg-surface-2 cursor-pointer"
            >
              <Image src={card.imageUrl} alt="Sanctuary" fill sizes="380px" className="object-cover" />
            </div>
          )}
          <div className="font-serif font-bold text-fg">
            {card.type === 'facility' ? card.name : card.title}
          </div>
          <p className="text-[11px] text-fg-muted">
            {card.type === 'facility' ? card.features[0] : card.notes}
          </p>
          {card.actionUrl && (
            <Link
              href={card.actionUrl}
              className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-600 dark:text-amber-400 hover:underline"
            >
              <span>{card.actionLabel || 'Open Guide'}</span>
              <ChevronRight className="size-3" />
            </Link>
          )}
        </div>
      );

    case 'handover':
      return (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3.5 space-y-2 text-xs">
          <div className="font-semibold text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5">
            <MessageCircle className="size-4" />
            <span>Denis Mayamba & Front Desk ({card.phone})</span>
          </div>
          <p className="text-[11px] text-fg-muted">{card.message}</p>
          <a
            href={card.whatsappUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-emerald-600 text-white py-2 text-xs font-semibold hover:bg-emerald-700"
          >
            <MessageCircle className="size-3.5" />
            <span>{card.actionLabel || 'Chat on WhatsApp'}</span>
          </a>
        </div>
      );

    default:
      return null;
  }
}
