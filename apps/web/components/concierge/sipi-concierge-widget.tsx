'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
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
  Phone,
  MessageCircle,
  ExternalLink,
  Calendar,
  Clock,
  MapPin,
  Check,
  Copy,
  ChevronLeft,
  Info,
  Printer,
  CreditCard,
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  Car,
  Utensils,
  Search,
  Share2,
  Download,
  QrCode,
  CalendarPlus,
} from 'lucide-react';
import type { ConciergeChatResponseDTO, ConciergeMessageDTO, ConciergeCardDTO } from '@reberon/contracts';
import { cn } from '@/lib/cn';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

const INTENT_TABS = [
  { id: 'suites', label: 'Suites & Rates', icon: Mountain, prompt: 'What suites are available next weekend, and what are the rates?' },
  { id: 'hikes', label: 'Sipi Falls Hikes', icon: Compass, prompt: 'Tell me about guided hiking at Sipi Falls and Mount Elgon.' },
  { id: 'dining', label: 'Dining & Trout', icon: Utensils, prompt: 'What does the Highland Restaurant serve, and tell me about the Mount Elgon river trout.' },
  { id: 'transfers', label: '4x4 Transfers', icon: Car, prompt: 'Can I arrange a private 4x4 airport transfer from Entebbe or Kampala to Kapchorwa?' },
  { id: 'lookup', label: 'Check Booking', icon: Search, prompt: 'Can you look up my reservation status?' },
  { id: 'weather', label: 'Weather & Packing', icon: MapPin, prompt: 'What is the altitude weather like and what should I pack for my stay?' },
  { id: 'whatsapp', label: 'WhatsApp Desk', icon: MessageCircle, prompt: 'I want to speak directly with Denis Mayamba on WhatsApp.' },
];

const INITIAL_SUGGESTIONS = [
  { label: 'Check suite rates & availability', prompt: 'What suites are available next weekend, and what are the rates?' },
  { label: 'Hold a suite (48h complimentary)', prompt: 'I want to hold an Elgon View King suite for my upcoming stay.' },
  { label: 'Sipi Falls & hiking guide', prompt: 'Tell me about hiking the 3 waterfalls at Sipi Falls and what guides cost.' },
  { label: 'Highland dining & coffee', prompt: 'What local food and Arabica coffee experiences do you serve?' },
  { label: 'Private 4x4 airport transfer', prompt: 'Can you arrange a private 4x4 transfer from Entebbe Airport to Kapchorwa?' },
  { label: 'Driving directions from Kampala', prompt: 'How do I drive from Kampala to Reberon Hotel and what is the road like?' },
  { label: 'WhatsApp concierge', prompt: 'Can I connect with Denis Mayamba or the team on WhatsApp?' },
];

export function SipiConciergeWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [hasInteracted, setHasInteracted] = useState(false);
  const [messages, setMessages] = useState<ConciergeMessageDTO[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string>('');
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [hasSpeechRec, setHasSpeechRec] = useState(false);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<any>(null);

  // Check speech recognition support
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      setHasSpeechRec(Boolean(SpeechRecognition));
    }
  }, []);

  // Play subtle mountain chime on message received
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
      osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.15);
      gain.gain.setValueAtTime(0.04, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.35);
    } catch {}
  };

  // Toggle voice speech recognition
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

  // Speak assistant message aloud
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
    utterance.rate = 0.95;
    utterance.pitch = 1.0;
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);
    setIsSpeaking(true);
    window.speechSynthesis.speak(utterance);
  };

  // Initialize session
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

    setMessages([
      {
        id: 'msg_welcome',
        role: 'assistant',
        content:
          'Muraho & Karibu to Reberon Hotel. I am **Sipi Concierge**, your autonomous highland host at 1,900 m on Mount Elgon.\n\nI can check live room availability, calculate stay quotes, create complimentary 48-hour reservation holds, plan Sipi Falls hikes, or connect you directly with Denis Mayamba on WhatsApp.\n\nHow can I curate your mountain retreat today?',
        followUpQuestions: [
          '📅 Check upcoming weekend rates',
          '🏔️ Tour the Elgon View King',
          '🥾 Sipi Falls hiking guide',
          '☕ Arabica coffee tour',
        ],
        createdAt: new Date().toISOString(),
      },
    ]);
  }, []);

  // Auto-scroll when messages update
  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isLoading, isOpen]);

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 150);
    }
  }, [isOpen]);

  const handleSend = async (textToSend?: string) => {
    const prompt = (textToSend || input).trim();
    if (!prompt || isLoading) return;

    setInput('');
    setHasInteracted(true);

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
        }),
      });

      if (!res.ok) {
        throw new Error(`Concierge status: ${res.status}`);
      }

      const data: ConciergeChatResponseDTO = await res.json();
      playChime();
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
            "I am refreshing our highland mountain connection. Denis Mayamba and the desk team are available 24/7 on WhatsApp at **+256 760 512 691** for immediate arrangements.",
          cards: [
            {
              type: 'handover',
              phone: '+256 760 512 691',
              whatsappUrl: 'https://wa.me/256760512691?text=Hello%20Denis%2C%20I%20am%20inquiring%20about%20staying%20at%20Reberon%20Hotel',
              message: 'Chat directly with Denis Mayamba & Front Desk on WhatsApp',
              actionUrl: 'https://wa.me/256760512691?text=Hello%20Denis%2C%20I%20am%20inquiring%20about%20staying%20at%20Reberon%20Hotel',
              actionLabel: 'Open WhatsApp Concierge',
            },
          ],
          followUpQuestions: ['🏔️ View Available Suites', '🚗 Driving Directions from Kampala'],
          createdAt: new Date().toISOString(),
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const resetChat = () => {
    const newSid = 'cs_' + Math.random().toString(36).substring(2, 11) + '_' + Date.now().toString(36);
    try {
      sessionStorage.setItem('reberon_concierge_sid', newSid);
    } catch {}
    setSessionId(newSid);
    setMessages([
      {
        id: `msg_welcome_${Date.now()}`,
        role: 'assistant',
        content:
          'Welcome back. Sipi Concierge session has been refreshed. How can I assist with your stay, room reservations, or Mount Elgon itinerary today?',
        followUpQuestions: ['📅 Check upcoming weekend rates', '🏔️ Tour the Elgon View King', '🥾 Sipi Falls hiking guide'],
        createdAt: new Date().toISOString(),
      },
    ]);
  };

  // Find latest active card for the full-screen side dossier
  const activeCard = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const cards = messages[i]?.cards;
      if (cards && cards.length > 0) return cards[0];
    }
    return null;
  }, [messages]);

  return (
    <>
      {/* Floating Trigger Launcher */}
      <div className="fixed bottom-5 right-5 z-50 flex items-center gap-3">
        {!isOpen && !hasInteracted && (
          <div
            onClick={() => setIsOpen(true)}
            className="hidden sm:flex cursor-pointer items-center gap-2 rounded-full border border-amber-500/30 bg-surface/95 px-4 py-2 text-xs font-medium text-fg shadow-lg backdrop-blur-md transition-all duration-300 hover:border-amber-500/60 hover:shadow-xl fade-in"
          >
            <span className="relative flex size-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
            </span>
            <span>Ask Sipi Concierge · Rooms, Rates & Hikes</span>
          </div>
        )}

        <button
          type="button"
          onClick={() => setIsOpen((prev) => !prev)}
          className={cn(
            'group relative flex size-14 items-center justify-center rounded-full shadow-2xl transition-all duration-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/50',
            isOpen
              ? 'bg-surface-2 text-fg border border-line rotate-90 scale-95'
              : 'bg-linear-to-tr from-amber-700 via-amber-600 to-amber-500 text-white hover:scale-105 hover:shadow-amber-900/30'
          )}
          aria-label={isOpen ? 'Close Sipi Concierge' : 'Open Sipi Concierge'}
        >
          {isOpen ? (
            <X className="size-6 transition-transform" />
          ) : (
            <>
              <Sparkles className="size-6 animate-pulse" />
              <span className="absolute -top-1 -right-1 flex size-3">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex size-3 rounded-full bg-emerald-500" />
              </span>
            </>
          )}
        </button>
      </div>

      {/* Concierge Modal / Fullscreen Panel */}
      {isOpen && (
        <div
          role="dialog"
          aria-label="Sipi Concierge AI"
          className={cn(
            'fixed z-50 flex flex-col bg-surface/98 backdrop-blur-xl shadow-2xl overflow-hidden transition-all duration-300 border border-line-strong text-fg',
            isFullScreen
              ? 'inset-2 sm:inset-6 rounded-3xl'
              : 'bottom-22 right-4 sm:right-6 w-[calc(100vw-2rem)] sm:w-[480px] h-[680px] max-h-[85vh] rounded-2xl'
          )}
        >
          {/* Header */}
          <div className="relative border-b border-line bg-surface-2/80 px-4 py-3.5 backdrop-blur-md">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-linear-to-tr from-amber-700 to-amber-500 text-white shadow-md">
                  <Sparkles className="size-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-serif text-base font-semibold tracking-tight">Sipi Concierge</h3>
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                      <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
                      Highland Host
                    </span>
                  </div>
                  <p className="text-[11px] text-fg-muted font-sans">
                    Mount Elgon Sanctuary · 1,900 m ASL
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1">
                {/* Print / Export Itinerary */}
                <button
                  type="button"
                  onClick={() => typeof window !== 'undefined' && window.print()}
                  title="Print / Save Itinerary"
                  className="rounded-lg p-2 text-fg-muted hover:bg-surface hover:text-fg transition-colors"
                  aria-label="Print itinerary"
                >
                  <Printer className="size-4" />
                </button>

                {/* Full Screen Toggle */}
                <button
                  type="button"
                  onClick={() => setIsFullScreen((prev) => !prev)}
                  title={isFullScreen ? 'Exit full screen' : 'Expand full screen'}
                  className="rounded-lg p-2 text-fg-muted hover:bg-surface hover:text-fg transition-colors"
                  aria-label={isFullScreen ? 'Exit full screen' : 'Full screen'}
                >
                  {isFullScreen ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
                </button>

                <button
                  type="button"
                  onClick={resetChat}
                  title="Reset conversation"
                  className="rounded-lg p-2 text-fg-muted hover:bg-surface hover:text-fg transition-colors"
                  aria-label="Restart chat"
                >
                  <RotateCcw className="size-4" />
                </button>

                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="rounded-lg p-2 text-fg-muted hover:bg-surface hover:text-fg transition-colors"
                  aria-label="Close concierge"
                >
                  <X className="size-4" />
                </button>
              </div>
            </div>
          </div>

          {/* Quick Intent Navigation Tabs */}
          <div className="border-b border-line/60 bg-surface/50 px-3 py-2 overflow-x-auto scrollbar-none flex items-center gap-1.5 shrink-0">
            {INTENT_TABS.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  type="button"
                  disabled={isLoading}
                  onClick={() => handleSend(tab.prompt)}
                  className="shrink-0 text-nowrap rounded-lg border border-line bg-surface/80 hover:bg-surface-2 hover:border-amber-500/40 px-2.5 py-1 text-[11px] font-medium text-fg flex items-center gap-1.5 transition-colors shadow-2xs"
                >
                  <Icon className="size-3 text-amber-600 dark:text-amber-400" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>

          {/* Body: Split View in Fullscreen Desktop, Single View otherwise */}
          <div className="flex-1 flex overflow-hidden">
            {/* Main Chat Column */}
            <div className="flex-1 flex flex-col min-w-0">
              {/* Messages Scroll Area */}
              <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5 text-[13.5px] leading-relaxed">
                {messages.map((m) => (
                  <div
                    key={m.id}
                    className={cn(
                      'flex gap-2.5 max-w-[95%] sm:max-w-[90%]',
                      m.role === 'user' ? 'ml-auto flex-row-reverse' : 'mr-auto'
                    )}
                  >
                    {m.role === 'assistant' ? (
                      <button
                        type="button"
                        onClick={() => speakMessage(m.content)}
                        className="size-7 shrink-0 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 grid place-items-center mt-0.5 shadow-xs hover:bg-amber-500/25 transition-colors"
                        title={isSpeaking ? 'Stop voice readout' : 'Listen to Highland Host voice'}
                      >
                        {isSpeaking ? <VolumeX className="size-3.5 animate-pulse text-amber-600" /> : <Volume2 className="size-3.5" />}
                      </button>
                    ) : (
                      <div className="size-7 shrink-0 rounded-lg bg-surface-2 border border-line text-fg-muted grid place-items-center mt-0.5">
                        <User className="size-3.5" />
                      </div>
                    )}

                    <div className="space-y-3 flex-1 min-w-0">
                      <div
                        className={cn(
                          'rounded-2xl px-4 py-3.5 shadow-xs font-sans text-pretty',
                          m.role === 'user'
                            ? 'bg-brand text-brand-fg rounded-tr-xs'
                            : 'bg-surface-2/90 border border-line rounded-tl-xs text-fg'
                        )}
                      >
                        {/* Rich Markdown & Structured Table Renderer */}
                        <ConciergeMarkdown content={m.content} />
                      </div>

                      {/* Render Any Cards Emitted by Concierge Tools */}
                      {m.cards && m.cards.length > 0 && (
                        <div className="space-y-2.5 pt-1">
                          {m.cards.map((card, idx) => (
                            <ConciergeCardView
                              key={idx}
                              card={card}
                              onPromptSelect={(p) => handleSend(p)}
                              onImageClick={(url) => setSelectedImage(url)}
                            />
                          ))}
                        </div>
                      )}

                      {/* Follow-up Question Chips */}
                      {m.role === 'assistant' && m.followUpQuestions && m.followUpQuestions.length > 0 && (
                        <div className="flex flex-wrap items-center gap-1.5 pt-1">
                          {m.followUpQuestions.map((q, idx) => (
                            <button
                              key={idx}
                              type="button"
                              disabled={isLoading}
                              onClick={() => handleSend(q)}
                              className="rounded-full border border-amber-500/30 bg-amber-500/5 hover:border-amber-500/60 hover:bg-amber-500/15 px-3 py-1 text-xs font-medium text-amber-800 dark:text-amber-300 transition-colors shadow-2xs"
                            >
                              {q}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))}

                {/* Thinking / Agentic Tool Execution Indicator */}
                {isLoading && (
                  <div className="flex gap-2.5 max-w-[92%] mr-auto fade-in">
                    <div className="size-7 shrink-0 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 grid place-items-center mt-0.5">
                      <Sparkles className="size-3.5 animate-spin" />
                    </div>
                    <div className="rounded-2xl rounded-tl-xs bg-surface-2/90 border border-line px-4 py-3 text-fg-muted flex items-center gap-2.5">
                      <span className="flex space-x-1">
                        <span className="size-1.5 rounded-full bg-amber-500 animate-bounce" style={{ animationDelay: '0ms' }} />
                        <span className="size-1.5 rounded-full bg-amber-500 animate-bounce" style={{ animationDelay: '150ms' }} />
                        <span className="size-1.5 rounded-full bg-amber-500 animate-bounce" style={{ animationDelay: '300ms' }} />
                      </span>
                      <span className="text-xs">Sipi Concierge is checking rooms & mountain availability...</span>
                    </div>
                  </div>
                )}

                <div ref={messagesEndRef} />
              </div>

              {/* Quick Action Suggestion Strip */}
              <div className="border-t border-line/60 bg-surface/70 px-3 py-2 overflow-x-auto scrollbar-none">
                <div className="flex items-center gap-1.5">
                  {INITIAL_SUGGESTIONS.map((s, idx) => (
                    <button
                      key={idx}
                      type="button"
                      disabled={isLoading}
                      onClick={() => handleSend(s.prompt)}
                      className="shrink-0 text-nowrap rounded-full border border-line bg-surface px-2.5 py-1 text-[11px] font-medium text-fg-muted hover:border-amber-500/40 hover:bg-surface-2 hover:text-fg transition-colors"
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Input Form */}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSend();
                }}
                className="border-t border-line bg-surface p-3"
              >
                <div className="relative flex items-center">
                  <input
                    ref={inputRef}
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder={
                      isListening
                        ? '🎙️ Listening... speak naturally to Sipi Concierge...'
                        : 'Ask Sipi Concierge about suites, dates, rates, hikes, transfers...'
                    }
                    disabled={isLoading}
                    className="w-full rounded-xl border border-line bg-surface-2/60 pl-3.5 pr-20 py-2.5 text-xs text-fg placeholder:text-fg-muted/70 focus:border-amber-500/60 focus:bg-surface focus:outline-none transition-colors"
                  />
                  <div className="absolute right-1.5 flex items-center gap-1">
                    {hasSpeechRec && (
                      <button
                        type="button"
                        onClick={toggleListening}
                        className={cn(
                          'rounded-lg p-1.5 transition-colors',
                          isListening
                            ? 'bg-red-500 text-white animate-pulse'
                            : 'text-fg-muted hover:text-fg hover:bg-surface-2'
                        )}
                        title={isListening ? 'Stop listening' : 'Voice input (Speak to Concierge)'}
                        aria-label="Voice input"
                      >
                        {isListening ? <MicOff className="size-3.5" /> : <Mic className="size-3.5" />}
                      </button>
                    )}
                    <button
                      type="submit"
                      disabled={!input.trim() || isLoading}
                      className="rounded-lg bg-brand text-brand-fg p-1.5 disabled:opacity-30 disabled:pointer-events-none hover:opacity-90 transition-opacity"
                      aria-label="Send message"
                    >
                      <Send className="size-3.5" />
                    </button>
                  </div>
                </div>
                <div className="mt-2 flex items-center justify-between text-[10px] text-fg-muted px-1">
                  <span className="flex items-center gap-1">
                    <ShieldCheck className="size-3 text-emerald-500" />
                    Live Reberon PMS · Highland Intelligence
                  </span>
                  <span>Direct booking advantages & complimentary holds</span>
                </div>
              </form>
            </div>

            {/* Fullscreen Intelligence Dossier Side Panel (Desktop only) */}
            {isFullScreen && (
              <div className="hidden lg:flex w-[380px] xl:w-[420px] flex-col border-l border-line bg-surface-2/40 p-5 overflow-y-auto space-y-6">
                <div>
                  <span className="text-[10px] font-semibold tracking-wider uppercase text-amber-600 dark:text-amber-400">
                    Highland Sanctuary Monitor
                  </span>
                  <h4 className="font-serif text-lg font-bold text-fg">Reberon Ridge 1,900 m</h4>
                  <p className="text-xs text-fg-muted mt-1">
                    Kapchorwa northern shoulder of Mount Elgon. Overlooking sunrise escarpment and Arabica valleys.
                  </p>
                </div>

                {/* Weather & Ridge Gauge */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-xl border border-line bg-surface p-3 space-y-1">
                    <div className="flex items-center gap-1.5 text-xs text-fg-muted">
                      <Mountain className="size-3.5 text-amber-600" />
                      <span>Elevation</span>
                    </div>
                    <div className="font-mono text-base font-bold">1,900 m ASL</div>
                    <div className="text-[10px] text-fg-muted">Crisp mountain air</div>
                  </div>

                  <div className="rounded-xl border border-line bg-surface p-3 space-y-1">
                    <div className="flex items-center gap-1.5 text-xs text-fg-muted">
                      <Compass className="size-3.5 text-amber-600" />
                      <span>Climate</span>
                    </div>
                    <div className="font-mono text-base font-bold">21°C / 13°C</div>
                    <div className="text-[10px] text-fg-muted">Fleece recommended</div>
                  </div>
                </div>

                {/* Active Sanctuary Showcase */}
                {activeCard ? (
                  <div className="space-y-2">
                    <span className="text-xs font-semibold text-fg-muted uppercase tracking-wider">
                      Current Focus Dossier
                    </span>
                    <ConciergeCardView
                      card={activeCard}
                      onPromptSelect={(p) => handleSend(p)}
                      onImageClick={(url) => setSelectedImage(url)}
                    />
                  </div>
                ) : (
                  <div className="rounded-2xl border border-dashed border-line p-5 text-center space-y-2 text-fg-muted">
                    <Compass className="size-8 mx-auto text-amber-600/60" />
                    <p className="text-xs">
                      Ask Sipi Concierge about suites, Sipi Falls, or the athletic club to open live media & details here.
                    </p>
                  </div>
                )}

                {/* Direct Sanctuary Shortcuts */}
                <div className="border-t border-line/60 pt-4 space-y-2">
                  <span className="text-xs font-semibold text-fg-muted uppercase tracking-wider">Direct Actions</span>
                  <div className="grid grid-cols-1 gap-2">
                    <Link
                      href="/book"
                      className="flex items-center justify-between rounded-xl border border-line bg-surface p-3 text-xs font-medium hover:border-amber-500/40 transition-colors"
                    >
                      <span className="flex items-center gap-2">
                        <BedDouble className="size-4 text-amber-600" />
                        <span>Online Booking Engine</span>
                      </span>
                      <ChevronRight className="size-3.5 text-fg-muted" />
                    </Link>

                    <a
                      href="https://wa.me/256760512691"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-between rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3 text-xs font-medium text-emerald-700 dark:text-emerald-400 hover:bg-emerald-500/10 transition-colors"
                    >
                      <span className="flex items-center gap-2">
                        <MessageCircle className="size-4" />
                        <span>WhatsApp Denis Mayamba</span>
                      </span>
                      <ExternalLink className="size-3.5" />
                    </a>

                    <a
                      href="https://maps.google.com/?q=Reberon+Hotel+Kapchorwa"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-between rounded-xl border border-line bg-surface p-3 text-xs font-medium hover:border-amber-500/40 transition-colors"
                    >
                      <span className="flex items-center gap-2">
                        <MapPin className="size-4 text-amber-600" />
                        <span>Google Maps Driving Route</span>
                      </span>
                      <ExternalLink className="size-3.5 text-fg-muted" />
                    </a>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Quick Image Zoom Modal */}
      {selectedImage && (
        <div
          role="dialog"
          aria-label="Image Preview"
          onClick={() => setSelectedImage(null)}
          className="fixed inset-0 z-60 grid place-items-center bg-basalt-950/90 p-4 backdrop-blur-md fade-in cursor-zoom-out"
        >
          <div className="relative max-h-[85vh] max-w-[90vw] overflow-hidden rounded-2xl shadow-2xl">
            <Image
              src={selectedImage}
              alt="Sanctuary View"
              width={1200}
              height={800}
              className="object-contain"
            />
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

      // Table Detection (lines starting with '|')
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
          // Skip delimiter line (e.g. |---|---|)
          const dataRows = tableLines.slice(tableLines[1]?.includes('---') ? 2 : 1).map(parseRow);
          result.push({ type: 'table', headers, rows: dataRows });
          continue;
        }
      }

      // Heading Detection (#, ##, ###)
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

      // Bullet List Detection (-, *, •)
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

      // Normal paragraph
      if (line.length > 0) {
        result.push({ type: 'paragraph', text: line });
      }
      i++;
    }

    return result;
  }, [content]);

  return (
    <div className="space-y-3">
      {blocks.map((block, idx) => {
        if (block.type === 'heading') {
          return (
            <h4
              key={idx}
              className={cn(
                'font-serif font-bold text-fg tracking-tight',
                block.level === 1 && 'text-base pt-1',
                block.level === 2 && 'text-[15px] pt-1',
                block.level === 3 && 'text-sm font-semibold text-amber-700 dark:text-amber-400'
              )}
            >
              <InlineMarkdown text={block.text} />
            </h4>
          );
        }

        if (block.type === 'table') {
          return (
            <div key={idx} className="my-2 overflow-x-auto rounded-xl border border-line bg-surface/90 shadow-2xs">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-line bg-surface-2 text-fg font-semibold">
                    {block.headers.map((h, hIdx) => (
                      <th key={hIdx} className="px-3 py-2 font-serif text-[11.5px]">
                        <InlineMarkdown text={h} />
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-line/60 font-sans">
                  {block.rows.map((row, rIdx) => (
                    <tr key={rIdx} className="hover:bg-amber-500/5 transition-colors">
                      {row.map((cell, cIdx) => (
                        <td key={cIdx} className="px-3 py-2 text-fg/90">
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
            <ul key={idx} className="space-y-1.5 pl-1 my-1.5">
              {block.items.map((item, lIdx) => (
                <li key={lIdx} className="flex items-start gap-2 text-[13px]">
                  <span className="size-1.5 rounded-full bg-amber-500 shrink-0 mt-2" />
                  <span>
                    <InlineMarkdown text={item} />
                  </span>
                </li>
              ))}
            </ul>
          );
        }

        return (
          <p key={idx} className="text-[13.5px] leading-relaxed">
            <InlineMarkdown text={block.text} />
          </p>
        );
      })}
    </div>
  );
}

/* ── Inline Token Parser for Bold, Code, and Markdown Links ── */
function InlineMarkdown({ text }: { text: string }) {
  // Regex to match markdown links [label](url), bold **bold**, code `code`, and italics *italic*
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
                className="font-medium text-amber-600 dark:text-amber-400 underline decoration-amber-500/40 hover:decoration-amber-500 transition-colors"
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
              className="inline-flex items-center gap-0.5 font-medium text-amber-600 dark:text-amber-400 underline decoration-amber-500/40 hover:decoration-amber-500 transition-colors"
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
            <code key={i} className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[11px] text-amber-700 dark:text-amber-300">
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
  parts: Array<{ type: 'text' | 'bold' | 'link' | 'code'; content: string; url?: string }>
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

/* ── Rich Card Component for Agentic Tool Deliveries ── */
function ConciergeCardView({
  card,
  onPromptSelect,
  onImageClick,
}: {
  card: ConciergeCardDTO;
  onPromptSelect: (prompt: string) => void;
  onImageClick?: (url: string) => void;
}) {
  const [copiedLink, setCopiedLink] = useState(false);
  switch (card.type) {
    case 'room':
      return (
        <div className="rounded-xl border border-line bg-surface p-3.5 shadow-xs space-y-3">
          {card.imageUrl && (
            <div
              onClick={() => onImageClick?.(card.imageUrl!)}
              className="relative h-32 w-full overflow-hidden rounded-lg bg-surface-2 cursor-pointer group"
            >
              <Image
                src={card.imageUrl}
                alt={card.name || 'Suite'}
                fill
                sizes="(max-width: 600px) 380px, 450px"
                className="object-cover group-hover:scale-105 transition-transform duration-500"
              />
              <div className="absolute inset-0 bg-linear-to-t from-basalt-950/75 via-transparent to-transparent" />
              <div className="absolute bottom-2.5 left-3 right-3 flex items-center justify-between text-white text-xs">
                <span className="font-semibold text-sm drop-shadow-sm">{card.name}</span>
                <span className="font-mono bg-amber-600/90 px-2.5 py-0.5 rounded-full text-xs font-semibold backdrop-blur-xs">
                  From {card.price}
                </span>
              </div>
            </div>
          )}

          {/* Photo Gallery Thumbnails */}
          {card.galleryUrls && card.galleryUrls.length > 0 && (
            <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none">
              {card.galleryUrls.map((url, gIdx) => (
                <div
                  key={gIdx}
                  onClick={() => onImageClick?.(url)}
                  className="relative size-12 shrink-0 rounded-md overflow-hidden bg-surface-2 cursor-pointer hover:opacity-80 transition-opacity"
                >
                  <Image src={url} alt="Photo" fill sizes="48px" className="object-cover" />
                </div>
              ))}
            </div>
          )}

          <div className="space-y-1 text-xs">
            <div className="flex items-center justify-between text-fg-muted font-medium">
              <span>{card.bedSetup || 'En-suite King Sanctuary'}</span>
              <span>{card.viewAspect || 'Mount Elgon Ridge View'}</span>
            </div>
          </div>

          <div className="flex items-center gap-2 pt-1">
            <button
              type="button"
              onClick={() => onPromptSelect(`Please calculate a quote for the ${card.name} for 2 nights.`)}
              className="flex-1 rounded-lg bg-amber-600/10 border border-amber-600/30 px-3 py-2 text-center text-xs font-semibold text-amber-700 dark:text-amber-400 hover:bg-amber-600/20 transition-colors"
            >
              Calculate Quote
            </button>

            <Link
              href={card.actionUrl || `/rooms/${card.slug || ''}`}
              className="rounded-lg border border-line px-3 py-2 text-xs font-medium text-fg-muted hover:text-fg hover:border-fg/40 transition-colors flex items-center gap-1"
            >
              <span>{card.actionLabel || 'Details'}</span>
              <ChevronRight className="size-3" />
            </Link>
          </div>
        </div>
      );

    case 'quote':
      return (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 space-y-3 shadow-xs">
          <div className="flex items-center justify-between border-b border-amber-500/20 pb-2.5">
            <div>
              <span className="text-[10px] font-semibold tracking-wider uppercase text-amber-600 dark:text-amber-400">
                Official Stay Estimate
              </span>
              <h4 className="font-serif text-base font-bold">{card.roomName}</h4>
            </div>
            <div className="text-right">
              <div className="font-mono text-base font-bold text-fg">{card.total}</div>
              <div className="text-[10px] text-fg-muted">{card.nights} night{card.nights && card.nights > 1 ? 's' : ''}</div>
            </div>
          </div>

          <div className="text-xs space-y-1.5">
            <div className="flex justify-between text-fg-muted">
              <span>Stay dates:</span>
              <span className="font-semibold text-fg">{card.arrival} → {card.departure}</span>
            </div>
            <div className="flex justify-between text-fg-muted">
              <span>30% Deposit to confirm:</span>
              <span className="font-semibold text-amber-600 dark:text-amber-400">{card.deposit}</span>
            </div>
          </div>

          {card.inclusions && (
            <div className="space-y-1.5 border-t border-amber-500/20 pt-2 text-xs text-fg-muted">
              {card.inclusions.slice(0, 4).map((inc, i) => (
                <div key={i} className="flex items-center gap-1.5">
                  <CheckCircle2 className="size-3.5 text-emerald-500 shrink-0" />
                  <span>{inc}</span>
                </div>
              ))}
            </div>
          )}

          <div className="flex items-center gap-2 pt-1">
            <button
              type="button"
              onClick={() =>
                onPromptSelect(
                  `Please place a 48-hour complimentary hold for ${card.roomName} from ${card.arrival} to ${card.departure}. My name is Guest.`
                )
              }
              className="flex-1 rounded-lg bg-linear-to-r from-amber-700 to-amber-600 text-white py-2 text-xs font-semibold hover:opacity-95 transition-opacity text-center flex items-center justify-center gap-1.5 shadow-xs"
            >
              <span>Lock rate (48-hour hold)</span>
              <ChevronRight className="size-3.5" />
            </button>

            {card.actionUrl && (
              <Link
                href={card.actionUrl}
                className="rounded-lg border border-line bg-surface px-3 py-2 text-xs font-medium text-fg-muted hover:text-fg transition-colors"
              >
                Book Now
              </Link>
            )}
          </div>
        </div>
      );

    case 'reservation':
      return (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4 space-y-3 shadow-xs">
          <div className="flex items-center justify-between border-b border-emerald-500/20 pb-2.5">
            <div className="flex items-center gap-2">
              <div className="flex size-8 items-center justify-center rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400">
                <QrCode className="size-4" />
              </div>
              <div>
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold tracking-wider uppercase text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 className="size-3" /> Confirmed & Held in PMS
                </span>
                <h4 className="font-mono text-base font-bold tracking-tight text-fg">{card.code}</h4>
              </div>
            </div>
            <span className="rounded-full bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
              {card.status || 'CONFIRMED'}
            </span>
          </div>

          <div className="text-xs space-y-1.5 text-fg-muted">
            <div className="flex justify-between">
              <span>Suite:</span>
              <span className="font-semibold text-fg">{card.roomName}</span>
            </div>
            <div className="flex justify-between">
              <span>Dates:</span>
              <span className="font-semibold text-fg">{card.arrival} to {card.departure}</span>
            </div>
            <div className="flex justify-between">
              <span>Total:</span>
              <span className="font-mono font-bold text-fg">{card.total}</span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
            {(card.stayUrl || card.receiptUrl || card.actionUrl) && (
              <Link
                href={card.stayUrl || card.receiptUrl || card.actionUrl!}
                target="_blank"
                className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-primary text-primary-fg py-2 px-3 text-xs font-semibold hover:opacity-90 transition-opacity shadow-xs text-center"
              >
                <Printer className="size-3.5" /> View & Print Receipt
              </Link>
            )}
            {(card.paymentUrl || card.secondaryActionUrl) && (
              <Link
                href={card.paymentUrl || card.secondaryActionUrl!}
                target="_blank"
                className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-emerald-600/30 bg-emerald-600/10 text-emerald-700 dark:text-emerald-300 py-2 px-3 text-xs font-semibold hover:bg-emerald-600/20 transition-colors shadow-xs text-center"
              >
                <CreditCard className="size-3.5" /> Complete Online Deposit
              </Link>
            )}
          </div>

          <div className="flex items-center justify-between pt-1 border-t border-emerald-500/15 text-[11px]">
            <button
              type="button"
              onClick={() => downloadIcs(card.code, card.roomName, card.arrival, card.departure)}
              className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-300 hover:underline"
            >
              <CalendarPlus className="size-3" /> Add to Calendar (.ics)
            </button>
            <button
              type="button"
              onClick={() => {
                if (typeof navigator !== 'undefined' && navigator.clipboard) {
                  navigator.clipboard.writeText(card.stayUrl || `https://reberonhotel.com/stay?code=${card.code}`);
                  setCopiedLink(true);
                  setTimeout(() => setCopiedLink(false), 2000);
                }
              }}
              className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-300 hover:underline"
            >
              {copiedLink ? <Check className="size-3" /> : <Copy className="size-3" />}
              {copiedLink ? 'Copied Stay Link' : 'Copy Stay Link'}
            </button>
          </div>
        </div>
      );

    case 'lookup':
      return (
        <div className="rounded-xl border border-blue-500/30 bg-blue-500/5 p-4 space-y-3 shadow-xs">
          <div className="flex items-center justify-between border-b border-blue-500/20 pb-2.5">
            <div className="flex items-center gap-2">
              <div className="flex size-8 items-center justify-center rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-600 dark:text-blue-400">
                <Search className="size-4" />
              </div>
              <div>
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold tracking-wider uppercase text-blue-600 dark:text-blue-400">
                  Verified In Reberon PMS
                </span>
                <h4 className="font-mono text-base font-bold tracking-tight text-fg">{card.code}</h4>
              </div>
            </div>
            <span className="rounded-full bg-blue-500/10 border border-blue-500/20 px-2.5 py-0.5 text-[11px] font-semibold text-blue-600 dark:text-blue-400">
              {card.status}
            </span>
          </div>

          <div className="text-xs space-y-1.5 text-fg-muted">
            <div className="flex justify-between">
              <span>Primary Guest:</span>
              <span className="font-semibold text-fg">{card.guestName}</span>
            </div>
            <div className="flex justify-between">
              <span>Suite:</span>
              <span className="font-semibold text-fg">{card.roomName}</span>
            </div>
            <div className="flex justify-between">
              <span>Dates:</span>
              <span className="font-semibold text-fg">{card.arrival} to {card.departure} ({card.nights} nights)</span>
            </div>
            <div className="flex justify-between border-t border-blue-500/15 pt-1.5">
              <span>Total Stay:</span>
              <span className="font-mono font-bold text-fg">{card.total}</span>
            </div>
            <div className="flex justify-between">
              <span>Paid:</span>
              <span className="font-mono font-semibold text-emerald-600 dark:text-emerald-400">{card.paid}</span>
            </div>
            <div className="flex justify-between">
              <span>Balance due:</span>
              <span className="font-mono font-bold text-amber-600 dark:text-amber-400">{card.balance}</span>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-2 pt-1">
            <Link
              href={card.stayUrl || card.receiptUrl}
              target="_blank"
              className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-primary text-primary-fg py-2 px-3 text-xs font-semibold hover:opacity-90 transition-opacity shadow-xs text-center"
            >
              <Printer className="size-3.5" /> View & Print Receipt
            </Link>
            {card.paymentUrl && (
              <Link
                href={card.paymentUrl}
                target="_blank"
                className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-blue-600/30 bg-blue-600/10 text-blue-700 dark:text-blue-300 py-2 px-3 text-xs font-semibold hover:bg-blue-600/20 transition-colors shadow-xs text-center"
              >
                <CreditCard className="size-3.5" /> Pay Balance Online
              </Link>
            )}
          </div>
        </div>
      );

    case 'transfer':
      return (
        <div className="rounded-xl border border-indigo-500/30 bg-indigo-500/5 p-4 space-y-3 shadow-xs">
          <div className="flex items-center justify-between border-b border-indigo-500/20 pb-2.5">
            <div className="flex items-center gap-2">
              <div className="flex size-8 items-center justify-center rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-600 dark:text-indigo-400">
                <Car className="size-4" />
              </div>
              <div>
                <span className="text-[10px] font-semibold tracking-wider uppercase text-indigo-600 dark:text-indigo-400">
                  Private 4x4 Sanctuary Transfer
                </span>
                <h4 className="font-serif text-sm font-bold text-fg">{card.vehicleType}</h4>
              </div>
            </div>
            <span className="font-mono font-bold text-xs text-fg">{card.estimatedCost}</span>
          </div>

          <div className="text-xs space-y-1.5 text-fg-muted">
            <div className="flex justify-between">
              <span>Pickup:</span>
              <span className="font-semibold text-fg">{card.pickupLocation}</span>
            </div>
            <div className="flex justify-between">
              <span>Destination:</span>
              <span className="font-semibold text-fg">{card.destination}</span>
            </div>
            <div className="flex justify-between">
              <span>Scenic Drive:</span>
              <span className="font-semibold text-fg">{card.travelTime}</span>
            </div>
          </div>

          {card.inclusions && (
            <div className="space-y-1 border-t border-indigo-500/15 pt-2 text-xs text-fg-muted">
              {card.inclusions.map((inc, i) => (
                <div key={i} className="flex items-center gap-1.5">
                  <CheckCircle2 className="size-3.5 text-indigo-500 shrink-0" />
                  <span>{inc}</span>
                </div>
              ))}
            </div>
          )}

          {card.actionUrl && (
            <a
              href={card.actionUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 text-white py-2 px-3 text-xs font-semibold hover:bg-indigo-700 transition-colors shadow-xs text-center"
            >
              <MessageCircle className="size-3.5" />
              <span>{card.actionLabel || 'Confirm 4x4 Transfer on WhatsApp'}</span>
            </a>
          )}
        </div>
      );

    case 'dining':
      return (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 space-y-3 shadow-xs">
          <div className="flex items-center justify-between border-b border-amber-500/20 pb-2.5">
            <div className="flex items-center gap-2">
              <div className="flex size-8 items-center justify-center rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400">
                <Utensils className="size-4" />
              </div>
              <div>
                <span className="text-[10px] font-semibold tracking-wider uppercase text-amber-600 dark:text-amber-400">
                  Highland Culinary Experience
                </span>
                <h4 className="font-serif text-sm font-bold text-fg">{card.venue}</h4>
              </div>
            </div>
            <span className="text-[10px] font-mono text-fg-muted bg-surface px-2 py-0.5 rounded-full border border-line">
              {card.hours}
            </span>
          </div>

          <div className="text-xs space-y-1.5">
            <div className="font-medium text-amber-700 dark:text-amber-300">{card.cuisine}</div>
            <div className="space-y-1 text-fg-muted">
              {card.highlights.map((h, i) => (
                <div key={i} className="flex items-start gap-1.5">
                  <Coffee className="size-3 text-amber-600 shrink-0 mt-0.5" />
                  <span>{h}</span>
                </div>
              ))}
            </div>
          </div>

          {card.dietaryOptions && (
            <div className="flex flex-wrap gap-1 border-t border-amber-500/15 pt-2">
              {card.dietaryOptions.map((opt, i) => (
                <span key={i} className="rounded-md bg-amber-600/10 border border-amber-600/20 px-2 py-0.5 text-[10px] font-medium text-amber-800 dark:text-amber-300">
                  ✓ {opt}
                </span>
              ))}
            </div>
          )}

          {card.actionUrl && (
            <Link
              href={card.actionUrl}
              className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-line bg-surface py-2 px-3 text-xs font-semibold text-fg hover:bg-surface-2 transition-colors text-center"
            >
              <span>{card.actionLabel || 'View Full Dining Menu'}</span>
              <ChevronRight className="size-3" />
            </Link>
          )}
        </div>
      );

    case 'weather':
      return (
        <div className="rounded-xl border border-sky-500/30 bg-sky-500/5 p-4 space-y-3 shadow-xs">
          <div className="flex items-center justify-between border-b border-sky-500/20 pb-2.5">
            <div className="flex items-center gap-2">
              <div className="flex size-8 items-center justify-center rounded-lg bg-sky-500/10 border border-sky-500/20 text-sky-600 dark:text-sky-400">
                <Mountain className="size-4" />
              </div>
              <div>
                <span className="text-[10px] font-semibold tracking-wider uppercase text-sky-600 dark:text-sky-400">
                  Elevation Weather & Packing
                </span>
                <h4 className="font-serif text-sm font-bold text-fg">{card.altitude}</h4>
              </div>
            </div>
            <span className="font-mono font-bold text-xs text-fg">{card.temperatureRange}</span>
          </div>

          <div className="text-xs space-y-1 text-fg-muted">
            <div><strong className="text-fg">Day:</strong> {card.dayClimate}</div>
            <div><strong className="text-fg">Night:</strong> {card.nightClimate}</div>
          </div>

          {card.packingChecklist && (
            <div className="space-y-1 border-t border-sky-500/15 pt-2 text-xs text-fg-muted">
              <div className="font-semibold text-fg text-[11px] uppercase tracking-wider">What to Pack:</div>
              {card.packingChecklist.map((item, i) => (
                <div key={i} className="flex items-start gap-1.5">
                  <Check className="size-3 text-sky-500 shrink-0 mt-0.5" />
                  <span>{item}</span>
                </div>
              ))}
            </div>
          )}

          <div className="rounded-lg bg-surface/80 border border-line p-2 text-[11px] text-fg-muted">
            <strong className="text-fg">Road condition:</strong> {card.routeStatus}
          </div>

          {card.actionUrl && (
            <Link
              href={card.actionUrl}
              className="inline-flex w-full items-center justify-center gap-1 text-xs font-semibold text-sky-700 dark:text-sky-400 hover:underline pt-0.5"
            >
              <span>{card.actionLabel || 'Driving Directions from Kampala'}</span>
              <ChevronRight className="size-3" />
            </Link>
          )}
        </div>
      );

    case 'waitlist':
      return (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3.5 space-y-2.5">
          <div className="flex items-center justify-between border-b border-amber-500/20 pb-2">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-amber-600 dark:text-amber-400">
              Priority First-Stay List
            </span>
            <span className="font-mono text-xs font-bold text-fg">{card.reference}</span>
          </div>
          <p className="text-xs text-fg-muted">
            Thank you, <strong className="text-fg">{card.guestName}</strong>. You are registered with preference for{' '}
            <strong className="text-fg">{card.roomType}</strong> ({card.preferredDates}).
          </p>
          {card.actionUrl && (
            <Link
              href={card.actionUrl}
              className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 dark:text-amber-400 hover:underline"
            >
              <span>{card.actionLabel || 'Follow construction progress'}</span>
              <ChevronRight className="size-3" />
            </Link>
          )}
        </div>
      );

    case 'facility':
      return (
        <div className="rounded-xl border border-line bg-surface p-3.5 space-y-2.5 text-xs shadow-xs">
          {card.imageUrl && (
            <div
              onClick={() => onImageClick?.(card.imageUrl!)}
              className="relative h-28 w-full overflow-hidden rounded-lg bg-surface-2 cursor-pointer group"
            >
              <Image src={card.imageUrl} alt={card.name} fill sizes="400px" className="object-cover group-hover:scale-105 transition-transform duration-500" />
              <div className="absolute inset-0 bg-linear-to-t from-basalt-950/70 via-transparent to-transparent" />
              <div className="absolute bottom-2 left-2.5 right-2.5 flex items-center justify-between text-white">
                <span className="font-semibold text-xs">{card.name}</span>
                <span className="text-[10px] font-mono bg-basalt-950/60 px-2 py-0.5 rounded-full">{card.hours || '06:00 – 22:00'}</span>
              </div>
            </div>
          )}

          {card.features && (
            <div className="space-y-1 text-fg-muted pt-0.5">
              {card.features.map((f, i) => (
                <div key={i} className="flex items-center gap-1.5">
                  <span className="size-1.5 rounded-full bg-amber-500 shrink-0" />
                  <span>{f}</span>
                </div>
              ))}
            </div>
          )}

          {card.actionUrl && (
            <Link
              href={card.actionUrl}
              className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700 dark:text-amber-400 hover:underline pt-1"
            >
              <span>{card.actionLabel || 'Explore Facility Details'}</span>
              <ChevronRight className="size-3" />
            </Link>
          )}
        </div>
      );

    case 'activity':
      return (
        <div className="rounded-xl border border-line bg-surface p-3.5 space-y-2.5 text-xs shadow-xs">
          {card.imageUrl && (
            <div
              onClick={() => onImageClick?.(card.imageUrl!)}
              className="relative h-28 w-full overflow-hidden rounded-lg bg-surface-2 cursor-pointer group"
            >
              <Image src={card.imageUrl} alt={card.title} fill sizes="400px" className="object-cover group-hover:scale-105 transition-transform duration-500" />
              <div className="absolute inset-0 bg-linear-to-t from-basalt-950/70 via-transparent to-transparent" />
              <div className="absolute bottom-2 left-2.5 right-2.5 flex items-center justify-between text-white">
                <span className="font-semibold text-xs">{card.title}</span>
                <span className="text-[10px] font-medium bg-amber-600/80 px-2 py-0.5 rounded-full">{card.difficulty}</span>
              </div>
            </div>
          )}

          <p className="text-[11.5px] text-fg-muted">{card.notes}</p>

          <div className="flex items-center justify-between text-[10px] text-fg-muted border-t border-line/60 pt-2 font-mono">
            <span>Duration: {card.duration}</span>
            <span>Best: {card.bestTime}</span>
          </div>

          {card.actionUrl && (
            <div className="pt-1">
              {card.actionUrl.startsWith('http') ? (
                <a
                  href={card.actionUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700 dark:text-amber-400 hover:underline"
                >
                  <span>{card.actionLabel || 'Open Link'}</span>
                  <ExternalLink className="size-3" />
                </a>
              ) : (
                <Link
                  href={card.actionUrl}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700 dark:text-amber-400 hover:underline"
                >
                  <span>{card.actionLabel || 'Read Complete Trail Guide'}</span>
                  <ChevronRight className="size-3" />
                </Link>
              )}
            </div>
          )}
        </div>
      );

    case 'handover':
      return (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4 space-y-3 shadow-xs">
          <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 font-semibold text-xs">
            <MessageCircle className="size-4 shrink-0" />
            <span>Denis Mayamba & Front Desk</span>
          </div>
          <p className="text-xs text-fg-muted">{card.message}</p>
          {card.whatsappUrl && (
            <a
              href={card.whatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 text-white py-2.5 text-xs font-semibold hover:bg-emerald-700 transition-colors shadow-xs"
            >
              <MessageCircle className="size-4" />
              <span>{card.actionLabel || `WhatsApp Concierge (${card.phone})`}</span>
            </a>
          )}
        </div>
      );

    default:
      return null;
  }
}
