'use client';
import { toast } from 'sonner';
import { Copy, ExternalLink, Mail, MessageCircle, Phone } from 'lucide-react';
import { whatsappLink } from '@reberon/utils';
import type { MenuItem } from './context-menu';

const copy = (text: string, what: string) => void navigator.clipboard.writeText(text).then(() => toast.success(`${what} copied`));

/** Call, WhatsApp, email and copy — whatever the guest record has. */
export function contactItems(g: { name: string; phone?: string | null; email?: string | null }, hello?: string): MenuItem[] {
  const first = g.name.split(' ')[0];
  return [
    ...(g.phone
      ? ([
          { label: `Call ${first}`, icon: Phone, onSelect: () => (window.location.href = `tel:${g.phone!.replace(/\s/g, '')}`) },
          { label: `WhatsApp ${first}`, icon: MessageCircle, onSelect: () => window.open(whatsappLink(g.phone!, hello ?? `Hello ${first},`), '_blank', 'noopener') },
          { label: 'Copy phone number', icon: Copy, onSelect: () => copy(g.phone!, 'Phone number') },
        ] as MenuItem[])
      : []),
    ...(g.email ? ([{ label: `Email ${first}`, icon: Mail, onSelect: () => (window.location.href = `mailto:${g.email}`) }] as MenuItem[]) : []),
  ];
}

/** Open / new tab / copy code for a booking. */
export function bookingItems(r: { id: string; code: string }, push: (href: string) => void): MenuItem[] {
  return [
    { label: 'Open booking', icon: ExternalLink, onSelect: () => push(`/reservations/${r.id}`) },
    { label: 'Open in a new tab', icon: ExternalLink, onSelect: () => window.open(`/reservations/${r.id}`, '_blank', 'noopener') },
    { label: `Copy code ${r.code}`, icon: Copy, onSelect: () => copy(r.code, 'Booking code') },
  ];
}
