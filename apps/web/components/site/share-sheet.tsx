'use client';
import { useEffect, useState } from 'react';
import { Check, Copy, Mail, Share2 } from 'lucide-react';
import { WhatsAppGlyph } from '@/components/ui/whatsapp-glyph';
import { cn } from '@/lib/cn';

const FacebookGlyph = (p: { className?: string }) => (
  <svg viewBox="0 0 24 24" aria-hidden className={p.className} fill="currentColor"><path d="M13.5 21v-7.5H16l.4-3H13.5V8.6c0-.9.3-1.5 1.5-1.5h1.6V4.4c-.3 0-1.2-.1-2.3-.1-2.3 0-3.8 1.4-3.8 3.9v2.3H8v3h2.5V21h3Z" /></svg>
);
const LinkedinGlyph = (p: { className?: string }) => (
  <svg viewBox="0 0 24 24" aria-hidden className={p.className} fill="currentColor"><path d="M4.98 3.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5ZM3 9.75h4V21H3V9.75Zm6.5 0h3.83v1.54h.05c.53-1 1.84-2.06 3.79-2.06 4.05 0 4.8 2.67 4.8 6.14V21h-4v-5.04c0-1.2-.02-2.75-1.68-2.75-1.68 0-1.94 1.31-1.94 2.66V21h-4V9.75Z" /></svg>
);
const XGlyph = (p: { className?: string }) => (
  <svg viewBox="0 0 24 24" aria-hidden className={p.className} fill="currentColor"><path d="M17.7 3h3.1l-6.8 7.8L22 21h-6.3l-4.9-6.4L5.2 21H2.1l7.3-8.3L1.7 3h6.4l4.4 5.9L17.7 3Zm-1.1 16.2h1.7L7.4 4.7H5.6l11 14.5Z" /></svg>
);

/**
 * Share a page: the phone's own share sheet when there is one, and plain links
 * everywhere (no third-party scripts, nothing loaded until clicked).
 */
export function ShareSheet({ url, title, text, className }: { url: string; title: string; text?: string; className?: string }) {
  const [canShare, setCanShare] = useState(false);
  const [copied, setCopied] = useState(false);
  useEffect(() => setCanShare(typeof navigator !== 'undefined' && typeof navigator.share === 'function'), []);
  const msg = text ? `${title} — ${text}` : title;
  const e = encodeURIComponent;
  const links = [
    { label: 'WhatsApp', href: `https://wa.me/?text=${e(`${msg}\n${url}`)}`, icon: WhatsAppGlyph },
    { label: 'Facebook', href: `https://www.facebook.com/sharer/sharer.php?u=${e(url)}`, icon: FacebookGlyph },
    { label: 'LinkedIn', href: `https://www.linkedin.com/sharing/share-offsite/?url=${e(url)}`, icon: LinkedinGlyph },
    { label: 'X', href: `https://x.com/intent/post?text=${e(msg)}&url=${e(url)}`, icon: XGlyph },
    { label: 'Email', href: `mailto:?subject=${e(title)}&body=${e(`${msg}\n\n${url}`)}`, icon: Mail },
  ];
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard blocked */
    }
  };
  const btn = 'grid size-10 place-items-center rounded-full border border-line-strong text-fg-muted transition-colors hover:border-fg hover:text-fg';
  return (
    <div className={cn('flex flex-wrap items-center gap-2', className)}>
      <span className="mr-1 text-sm text-fg-muted">Share</span>
      {canShare && (
        <button type="button" className={btn} aria-label="Share" onClick={() => void navigator.share({ title, text: text ?? title, url }).catch(() => undefined)}>
          <Share2 className="size-4" />
        </button>
      )}
      {links.map((l) => (
        <a key={l.label} href={l.href} target={l.label === 'Email' ? undefined : '_blank'} rel="noopener noreferrer" className={btn} aria-label={`Share on ${l.label}`} title={l.label}>
          <l.icon className="size-4" />
        </a>
      ))}
      <button type="button" className={btn} onClick={() => void copy()} aria-label={copied ? 'Link copied' : 'Copy link'} title="Copy link">
        {copied ? <Check className="size-4 text-accent" /> : <Copy className="size-4" />}
      </button>
      <span role="status" aria-live="polite" className="sr-only">
        {copied ? 'Link copied' : ''}
      </span>
    </div>
  );
}
