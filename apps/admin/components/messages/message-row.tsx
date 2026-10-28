'use client';
import { useState } from 'react';
import Link from 'next/link';
import {
  Check, ChevronDown, ChevronUp, Copy, ExternalLink, Mail,
  MessageSquare, MessageSquareText, RefreshCw, Send, Smartphone,
} from 'lucide-react';
import { toast } from 'sonner';
import { TEMPLATES, type MessageChannel, type OutboundMessageDTO } from '@reberon/contracts';
import { dateTime } from '@/lib/format';
import { cn } from '@/lib/cn';
import { Button, buttonClass } from '@/components/ui/button';
import { Pill, type Tone } from '@/components/ui/bits';

export const CHANNEL_ICON: Record<MessageChannel, typeof Mail> = {
  EMAIL: Mail,
  SMS: Smartphone,
  WHATSAPP: MessageSquareText,
};

export const OUT_STATUS: Record<string, [string, Tone]> = {
  SENT: ['Sent', 'green'],
  QUEUED: ['Sending', 'blue'],
  FAILED: ['Failed', 'red'],
  NOT_CONNECTED: ['Not sent — not connected', 'amber'],
  SKIPPED: ['Skipped', 'neutral'],
};

export const templateLabel = (k: string | null) =>
  TEMPLATES.find((t) => t.key === k)?.label ?? k ?? 'Message';

export function MessageRow({
  m,
  onRetry,
  compact,
}: {
  m: OutboundMessageDTO;
  onRetry?: () => void;
  compact?: boolean;
}) {
  const I = CHANNEL_ICON[m.channel] ?? Mail;
  const [label, tone] = OUT_STATUS[m.status] ?? [m.status, 'neutral'];
  const [open, setOpen] = useState(m.status === 'NOT_CONNECTED' || m.status === 'FAILED');
  const [copied, setCopied] = useState(false);

  const copyBody = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(m.body);
    setCopied(true);
    toast.success('Message copied to clipboard');
    setTimeout(() => setCopied(false), 2000);
  };

  const inboxHref = `/inbox?q=${encodeURIComponent(m.to)}`;

  return (
    <li
      className={cn(
        'group transition-colors rounded-lg border border-transparent hover:border-line hover:bg-surface-2/30',
        compact ? 'p-2.5' : 'p-3.5',
        open && 'bg-surface-2/20 border-line',
      )}
    >
      {/* Clickable Header Bar */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => setOpen(!open)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setOpen(!open);
          }
        }}
        className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 cursor-pointer select-none"
      >
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[13px]">
          <div className="flex size-7 shrink-0 items-center justify-center rounded-md border border-line bg-surface">
            <I className="size-3.5 text-fg-muted" aria-label={m.channel} />
          </div>

          <span className="font-semibold text-fg">
            {m.subject?.startsWith('[TEST]') ? 'Test: ' : ''}
            {templateLabel(m.templateKey)}
          </span>

          <span className="text-fg-muted">
            to <span className="font-mono text-[12px] text-fg">{m.to}</span>
          </span>

          {!compact && m.reservation && (
            <Link
              href={`/reservations/${m.reservation.id}`}
              onClick={(e) => e.stopPropagation()}
              className="inline-flex items-center gap-1 font-mono text-[11px] font-medium text-fg-subtle hover:text-fg bg-surface px-1.5 py-0.5 rounded border border-line"
              title="Open Reservation"
            >
              {m.reservation.code}
              <ExternalLink className="size-2.5" />
            </Link>
          )}

          {m.sentBy && <span className="text-[11.5px] text-fg-subtle">by {m.sentBy}</span>}
        </div>

        {/* Right side status, date, and quick action */}
        <div className="flex items-center gap-2">
          <span className="text-[11.5px] text-fg-subtle">{dateTime(m.sentAt ?? m.createdAt)}</span>
          <Pill tone={tone} dot>
            {label}
          </Pill>

          {/* Direct link to open this conversation in Inbox */}
          <Link
            href={inboxHref}
            onClick={(e) => e.stopPropagation()}
            className="inline-flex items-center gap-1 rounded-md border border-line bg-surface px-2 py-1 text-[11px] font-medium text-fg-muted hover:bg-surface-2 hover:text-fg transition-colors"
            title="Open conversation in Inbox"
          >
            <MessageSquare className="size-3 text-fg-subtle" />
            <span>Conversation</span>
          </Link>

          <span className="text-fg-subtle">
            {open ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
          </span>
        </div>
      </div>

      {/* Expanded Message Content */}
      {open && (
        <div className="mt-3 pl-9 pr-1 grid gap-2.5 fade-in">
          {m.subject && (
            <div className="text-xs text-fg-muted">
              <span className="font-medium text-fg">Subject:</span> {m.subject}
            </div>
          )}

          <div className="relative rounded-xl border border-line bg-surface-2/60 p-3.5">
            <button
              type="button"
              onClick={copyBody}
              className="absolute right-2 top-2 inline-flex items-center gap-1 rounded border border-line bg-surface px-2 py-0.5 text-[10.5px] font-medium text-fg-subtle hover:text-fg transition-colors"
              title="Copy message body"
            >
              {copied ? <Check className="size-3 text-success" /> : <Copy className="size-3" />}
              {copied ? 'Copied' : 'Copy'}
            </button>
            <p className="whitespace-pre-line text-[12.5px] leading-relaxed text-fg">{m.body}</p>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            <div className="flex flex-wrap items-center gap-2">
              <Link
                href={inboxHref}
                className={buttonClass('secondary', 'sm')}
                title="Jump directly to inbox conversation"
              >
                <MessageSquareText className="size-3.5" />
                Open in Conversation
              </Link>

              {m.reservation && (
                <Link
                  href={`/reservations/${m.reservation.id}`}
                  className={buttonClass('ghost', 'sm')}
                >
                  <ExternalLink className="size-3.5" />
                  Open Booking ({m.reservation.code})
                </Link>
              )}

              {m.status === 'NOT_CONNECTED' && m.fallbackUrl && (
                <a
                  href={m.fallbackUrl}
                  target="_blank"
                  rel="noreferrer"
                  className={buttonClass('primary', 'sm')}
                >
                  <Send className="size-3.5" /> Send from WhatsApp
                </a>
              )}

              {onRetry && (m.status === 'FAILED' || m.status === 'NOT_CONNECTED') && (
                <Button
                  size="sm"
                  icon={<RefreshCw className="size-3.5" />}
                  onClick={(e) => {
                    e.stopPropagation();
                    onRetry();
                  }}
                >
                  Try again
                </Button>
              )}
            </div>

            {m.error && m.status !== 'SENT' && (
              <span className="text-[11.5px] text-danger font-medium">{m.error}</span>
            )}
          </div>
        </div>
      )}
    </li>
  );
}
