'use client';

import React, { useState, useEffect, useRef } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import {
  Sparkles,
  X,
  Send,
  RotateCcw,
  Bot,
  User,
  Calendar,
  BedDouble,
  Compass,
  ArrowRight,
  ExternalLink,
  MessageCircle,
  Clock,
  MapPin,
  ChevronRight,
  CheckCircle2,
  ShieldCheck,
  Flame,
  Coffee,
} from 'lucide-react';
import type { ConciergeChatResponseDTO, ConciergeMessageDTO, ConciergeCardDTO } from '@reberon/contracts';
import { cn } from '@/lib/cn';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

const SUGGESTIONS = [
  { label: 'Check suite rates & availability', prompt: 'What suites are available next weekend, and what are the rates?' },
  { label: 'Hold a suite (48h complimentary)', prompt: 'I want to hold an Elgon View King suite for my upcoming stay.' },
  { label: 'Sipi Falls & hiking guide', prompt: 'Tell me about hiking the 3 waterfalls at Sipi Falls and what guides cost.' },
  { label: 'Highland dining & coffee', prompt: 'What local food and Arabica coffee experiences do you serve?' },
  { label: 'Driving directions from Kampala', prompt: 'How do I drive from Kampala to Reberon Hotel and what is the road like?' },
  { label: 'WhatsApp concierge', prompt: 'Can I connect with Denis Mayamba or the team on WhatsApp?' },
];

export function SipiConciergeWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [hasInteracted, setHasInteracted] = useState(false);
  const [messages, setMessages] = useState<ConciergeMessageDTO[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string>('');
  const [deepseekStatus, setDeepseekStatus] = useState<'ready' | 'checking'>('checking');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

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

    // Initial greeting if no messages
    setMessages([
      {
        id: 'msg_welcome',
        role: 'assistant',
        content:
          'Muraho & Karibu to Reberon Hotel. I am **Sipi Concierge**, your autonomous highland host at 1,900 m on Mount Elgon. I can query real-time room availability, quote stay pricing, create complimentary 48-hour reservation holds, plan Sipi Falls hikes, or connect you directly with Denis Mayamba.\n\nHow may I curate your mountain retreat today?',
        createdAt: new Date().toISOString(),
      },
    ]);

    // Check backend concierge health
    fetch(`${API}/v1/public/concierge/status`)
      .then((r) => r.json())
      .then(() => setDeepseekStatus('ready'))
      .catch(() => setDeepseekStatus('ready'));
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
            createdAt: new Date().toISOString(),
          },
        ]);
      }
    } catch (err) {
      // Fallback response if network or server error
      setMessages((prev) => [
        ...prev,
        {
          id: `err_${Date.now()}`,
          role: 'assistant',
          content:
            "I am currently refreshing our highland server connection. For immediate room reservations or bespoke itineraries, Denis Mayamba and the desk team are available 24/7 on WhatsApp at **+256 760 512 691**.",
          cards: [
            {
              type: 'handover',
              phone: '+256 760 512 691',
              whatsappUrl: 'https://wa.me/256760512691?text=Hello%20Denis%2C%20I%20am%20inquiring%20about%20staying%20at%20Reberon%20Hotel',
              message: 'Chat directly with Denis Mayamba & Front Desk on WhatsApp',
            },
          ],
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
        createdAt: new Date().toISOString(),
      },
    ]);
  };

  return (
    <>
      {/* Floating Launcher Button */}
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

      {/* Concierge Modal / Panel */}
      {isOpen && (
        <div
          role="dialog"
          aria-label="Sipi Concierge AI"
          className="fixed bottom-22 right-4 sm:right-6 z-50 flex flex-col w-[calc(100vw-2rem)] sm:w-[440px] h-[640px] max-h-[84vh] rounded-2xl border border-line-strong bg-surface/98 backdrop-blur-xl shadow-2xl overflow-hidden fade-up text-fg transition-all"
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
                      Live AI
                    </span>
                  </div>
                  <p className="text-[11px] text-fg-muted font-sans">
                    Mount Elgon Sanctuary · 1,900 m ASL
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1">
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

          {/* Messages Body */}
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 text-[13.5px] leading-relaxed">
            {messages.map((m) => (
              <div
                key={m.id}
                className={cn(
                  'flex gap-2.5 max-w-[92%]',
                  m.role === 'user' ? 'ml-auto flex-row-reverse' : 'mr-auto'
                )}
              >
                {m.role === 'assistant' ? (
                  <div className="size-7 shrink-0 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 grid place-items-center mt-0.5">
                    <Sparkles className="size-3.5" />
                  </div>
                ) : (
                  <div className="size-7 shrink-0 rounded-lg bg-surface-2 border border-line text-fg-muted grid place-items-center mt-0.5">
                    <User className="size-3.5" />
                  </div>
                )}

                <div className="space-y-2.5 flex-1 min-w-0">
                  <div
                    className={cn(
                      'rounded-2xl px-4 py-3 whitespace-pre-line text-pretty',
                      m.role === 'user'
                        ? 'bg-brand text-brand-fg rounded-tr-xs shadow-xs font-sans'
                        : 'bg-surface-2/90 border border-line rounded-tl-xs text-fg'
                    )}
                  >
                    {formatConciergeText(m.content)}
                  </div>

                  {/* Render Any Cards Emitted by Concierge Tools */}
                  {m.cards && m.cards.length > 0 && (
                    <div className="space-y-2 pt-1">
                      {m.cards.map((card, idx) => (
                        <ConciergeCardView
                          key={idx}
                          card={card}
                          onPromptSelect={(p) => handleSend(p)}
                        />
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
                <div className="rounded-2xl rounded-tl-xs bg-surface-2/90 border border-line px-4 py-3 text-fg-muted flex items-center gap-2">
                  <span className="flex space-x-1">
                    <span className="size-1.5 rounded-full bg-amber-500 animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="size-1.5 rounded-full bg-amber-500 animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="size-1.5 rounded-full bg-amber-500 animate-bounce" style={{ animationDelay: '300ms' }} />
                  </span>
                  <span className="text-xs">Sipi Concierge is checking mountain availability...</span>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Quick Suggestion Pills */}
          <div className="border-t border-line/60 bg-surface/70 px-3 py-2 overflow-x-auto scrollbar-none">
            <div className="flex items-center gap-1.5">
              {SUGGESTIONS.map((s, idx) => (
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

          {/* Input Box */}
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
                placeholder="Ask Sipi Concierge about suites, dates, rates, hikes..."
                disabled={isLoading}
                className="w-full rounded-xl border border-line bg-surface-2/60 pl-3.5 pr-11 py-2.5 text-xs text-fg placeholder:text-fg-muted/70 focus:border-amber-500/60 focus:bg-surface focus:outline-none transition-colors"
              />
              <button
                type="submit"
                disabled={!input.trim() || isLoading}
                className="absolute right-1.5 rounded-lg bg-brand text-brand-fg p-1.5 disabled:opacity-30 disabled:pointer-events-none hover:opacity-90 transition-opacity"
                aria-label="Send message"
              >
                <Send className="size-3.5" />
              </button>
            </div>
            <div className="mt-2 flex items-center justify-between text-[10px] text-fg-muted px-1">
              <span className="flex items-center gap-1">
                <ShieldCheck className="size-3 text-emerald-500" />
                Live Reberon PMS & DeepSeek AI
              </span>
              <span>Direct direct booking perks</span>
            </div>
          </form>
        </div>
      )}
    </>
  );
}

/* ── Rich Card Component for Agentic Tool Deliveries ── */
function ConciergeCardView({
  card,
  onPromptSelect,
}: {
  card: ConciergeCardDTO;
  onPromptSelect: (prompt: string) => void;
}) {
  switch (card.type) {
    case 'room':
      return (
        <div className="rounded-xl border border-line bg-surface p-3 shadow-xs space-y-2">
          {card.imageUrl && (
            <div className="relative h-28 w-full overflow-hidden rounded-lg bg-surface-2">
              <Image
                src={card.imageUrl}
                alt={card.name || 'Suite'}
                fill
                sizes="(max-width: 600px) 360px, 400px"
                className="object-cover"
              />
              <div className="absolute inset-0 bg-linear-to-t from-basalt-950/70 via-transparent to-transparent" />
              <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between text-white text-xs">
                <span className="font-semibold">{card.name}</span>
                <span className="font-mono bg-amber-600/80 px-2 py-0.5 rounded-full text-[11px] backdrop-blur-xs">
                  From {card.price}
                </span>
              </div>
            </div>
          )}
          <div className="space-y-1 text-xs">
            <div className="flex items-center justify-between text-fg-muted">
              <span>{card.bedSetup || 'En-suite King Sanctuary'}</span>
              <span>{card.viewAspect || 'Mount Elgon Ridge View'}</span>
            </div>
          </div>
          <div className="flex items-center gap-2 pt-1">
            <button
              type="button"
              onClick={() => onPromptSelect(`Please calculate a quote for the ${card.name} for 2 nights.`)}
              className="flex-1 rounded-lg bg-amber-600/10 border border-amber-600/30 px-2.5 py-1.5 text-center text-xs font-medium text-amber-700 dark:text-amber-400 hover:bg-amber-600/20 transition-colors"
            >
              Get Exact Quote
            </button>
            <Link
              href={`/rooms/${card.slug || ''}`}
              className="rounded-lg border border-line px-2.5 py-1.5 text-xs text-fg-muted hover:text-fg hover:border-fg/40 transition-colors flex items-center gap-1"
            >
              Details <ChevronRight className="size-3" />
            </Link>
          </div>
        </div>
      );

    case 'quote':
      return (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3.5 space-y-2.5 shadow-xs">
          <div className="flex items-center justify-between border-b border-amber-500/20 pb-2">
            <div>
              <span className="text-[10px] font-semibold tracking-wider uppercase text-amber-600 dark:text-amber-400">
                Official Stay Estimate
              </span>
              <h4 className="font-serif text-sm font-semibold">{card.roomName}</h4>
            </div>
            <div className="text-right">
              <div className="font-mono text-sm font-semibold text-fg">{card.total}</div>
              <div className="text-[10px] text-fg-muted">{card.nights} night{card.nights && card.nights > 1 ? 's' : ''}</div>
            </div>
          </div>

          <div className="text-xs space-y-1">
            <div className="flex justify-between text-fg-muted">
              <span>Stay dates:</span>
              <span className="font-medium text-fg">{card.arrival} → {card.departure}</span>
            </div>
            <div className="flex justify-between text-fg-muted">
              <span>30% Deposit to confirm:</span>
              <span className="font-semibold text-amber-600 dark:text-amber-400">{card.deposit}</span>
            </div>
          </div>

          {card.inclusions && (
            <div className="space-y-1 border-t border-amber-500/20 pt-2 text-[11px] text-fg-muted">
              {card.inclusions.slice(0, 3).map((inc, i) => (
                <div key={i} className="flex items-center gap-1.5">
                  <CheckCircle2 className="size-3 text-emerald-500 shrink-0" />
                  <span>{inc}</span>
                </div>
              ))}
            </div>
          )}

          <button
            type="button"
            onClick={() =>
              onPromptSelect(
                `Please place a 48-hour complimentary hold for ${card.roomName} from ${card.arrival} to ${card.departure}. My name is Guest.`
              )
            }
            className="w-full rounded-lg bg-linear-to-r from-amber-700 to-amber-600 text-white py-1.5 text-xs font-medium hover:opacity-95 transition-opacity text-center flex items-center justify-center gap-1.5"
          >
            <span>Lock this rate with 48-hour hold</span>
            <ArrowRight className="size-3.5" />
          </button>
        </div>
      );

    case 'reservation':
      return (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3.5 space-y-2.5 shadow-xs">
          <div className="flex items-center justify-between border-b border-emerald-500/20 pb-2">
            <div>
              <span className="inline-flex items-center gap-1 text-[10px] font-semibold tracking-wider uppercase text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="size-3" /> 48-Hour Hold Confirmed
              </span>
              <h4 className="font-mono text-sm font-bold tracking-tight text-fg">{card.code}</h4>
            </div>
            <span className="rounded-full bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
              HELD
            </span>
          </div>

          <div className="text-xs space-y-1 text-fg-muted">
            <div className="flex justify-between">
              <span>Suite:</span>
              <span className="font-medium text-fg">{card.roomName}</span>
            </div>
            <div className="flex justify-between">
              <span>Dates:</span>
              <span className="font-medium text-fg">{card.arrival} to {card.departure}</span>
            </div>
            <div className="flex justify-between">
              <span>Total:</span>
              <span className="font-mono font-semibold text-fg">{card.total}</span>
            </div>
          </div>

          {card.paymentUrl && (
            <Link
              href={card.paymentUrl}
              target="_blank"
              className="block w-full rounded-lg bg-emerald-600 text-white py-2 text-xs font-semibold text-center hover:bg-emerald-700 transition-colors shadow-xs"
            >
              Complete Online Deposit · Secure Hold
            </Link>
          )}
        </div>
      );

    case 'waitlist':
      return (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3.5 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-amber-600 dark:text-amber-400">
              Priority First-Stay List
            </span>
            <span className="font-mono text-xs font-semibold">{card.reference}</span>
          </div>
          <p className="text-xs text-fg-muted">
            Thank you, <strong className="text-fg">{card.guestName}</strong>. You are registered with preference for{' '}
            <strong className="text-fg">{card.roomType}</strong> ({card.preferredDates}).
          </p>
        </div>
      );

    case 'facility':
      return (
        <div className="rounded-xl border border-line bg-surface p-3 space-y-2 text-xs shadow-xs">
          <div className="flex items-center justify-between">
            <h4 className="font-serif font-semibold text-fg">{card.name}</h4>
            <span className="text-[10px] font-mono text-fg-muted">{card.hours}</span>
          </div>
          {card.features && (
            <div className="space-y-1 text-fg-muted">
              {card.features.map((f, i) => (
                <div key={i} className="flex items-center gap-1.5">
                  <span className="size-1 rounded-full bg-amber-500" />
                  <span>{f}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      );

    case 'activity':
      return (
        <div className="rounded-xl border border-line bg-surface p-3 space-y-2 text-xs shadow-xs">
          <div className="flex items-center justify-between">
            <h4 className="font-serif font-semibold text-fg">{card.title}</h4>
            <span className="rounded-full bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 text-[10px] font-medium text-amber-600 dark:text-amber-400">
              {card.difficulty}
            </span>
          </div>
          <p className="text-[11px] text-fg-muted">{card.notes}</p>
          <div className="flex items-center justify-between text-[10px] text-fg-muted border-t border-line/60 pt-1.5 font-mono">
            <span>Duration: {card.duration}</span>
            <span>Best: {card.bestTime}</span>
          </div>
        </div>
      );

    case 'handover':
      return (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3.5 space-y-2.5">
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
              className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-emerald-600 text-white py-2 text-xs font-semibold hover:bg-emerald-700 transition-colors shadow-xs"
            >
              <MessageCircle className="size-3.5" />
              <span>Open WhatsApp Concierge ({card.phone})</span>
            </a>
          )}
        </div>
      );

    default:
      return null;
  }
}

/** Format markdown asterisks into bold tags */
function formatConciergeText(raw: string): React.ReactNode {
  const parts = raw.split(/(\*\*.*?\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return (
        <strong key={i} className="font-semibold text-fg">
          {part.slice(2, -2)}
        </strong>
      );
    }
    return part;
  });
}
