'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { Mail, Phone, X } from 'lucide-react';
import { t } from '@reberon/contracts/text';
import { whatsappLink } from '@reberon/utils';
import { WhatsAppGlyph } from '@/components/ui/whatsapp-glyph';
import { Logo } from './logo';
import { useSite } from './site-provider';
import { CurrencyToggle } from './price';
import { ThemeToggle } from './theme-toggle';

export function MobileNav({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { site } = useSite();
  const ref = useRef<HTMLDialogElement>(null);
  const pathname = usePathname();

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  useEffect(() => {
    onClose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  const phone = site.contact.phones[0];
  return (
    <dialog ref={ref} className="sheet" onClose={onClose} aria-label="Menu">
      <div className="sheet-panel flex h-full flex-col overflow-y-auto bg-bg text-fg">
        <div className="container-x flex h-[4.5rem] shrink-0 items-center justify-between">
          <Logo site={site} />
          <button type="button" onClick={onClose} className="grid size-11 place-items-center rounded-full border border-line" aria-label="Close menu">
            <X className="size-5" strokeWidth={1.6} />
          </button>
        </div>
        <nav aria-label="Mobile" className="container-x flex-1 py-6">
          <ul className="divide-y divide-line border-y border-line">
            {site.nav.MOBILE.map((item, i) => (
              <li key={item.id} style={{ ['--i' as string]: i }} className="fade-up" >
                <Link href={item.href} className="flex items-baseline justify-between py-4 font-display text-[1.9rem] leading-tight" aria-current={pathname === item.href ? 'page' : undefined}>
                  {t(item.label)}
                  <span className="font-sans text-xs text-fg-subtle tabular">{String(i + 1).padStart(2, '0')}</span>
                </Link>
              </li>
            ))}
            <li style={{ ['--i' as string]: site.nav.MOBILE.length }} className="fade-up">
              <Link href="/concierge" className="flex items-baseline justify-between py-4 font-display text-[1.9rem] leading-tight text-amber-600 dark:text-amber-400" aria-current={pathname === '/concierge' ? 'page' : undefined}>
                Sipi Concierge AI
                <span className="font-sans text-xs text-fg-subtle tabular">{String(site.nav.MOBILE.length + 1).padStart(2, '0')}</span>
              </Link>
            </li>
          </ul>
          <Link href={site.features.bookingEnabled ? '/book' : '/first-stay'} className="btn btn-lg mt-8 w-full">
            {site.features.bookingEnabled ? 'Book a stay' : 'Claim a first stay'}
          </Link>
        </nav>
        <div className="container-x grid shrink-0 gap-3 border-t border-line py-6 text-sm">
          <div className="flex flex-wrap gap-2">
            {site.contact.whatsapp && (
              <a href={whatsappLink(site.contact.whatsapp, 'Hello Reberon Hotel,')} className="btn btn-secondary" target="_blank" rel="noopener noreferrer">
                <WhatsAppGlyph className="size-4" /> WhatsApp
              </a>
            )}
            {phone && (
              <a href={`tel:${phone.replace(/\s/g, '')}`} className="btn btn-secondary">
                <Phone className="size-4" aria-hidden /> Call
              </a>
            )}
            {site.contact.email && (
              <a href={`mailto:${site.contact.email}`} className="btn btn-secondary">
                <Mail className="size-4" aria-hidden /> Email
              </a>
            )}
          </div>
          <div className="flex items-center justify-between">
            <CurrencyToggle />
            <ThemeToggle />
          </div>
        </div>
      </div>
    </dialog>
  );
}
