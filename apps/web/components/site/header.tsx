'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Menu, Sparkles } from 'lucide-react';
import { t } from '@reberon/contracts/text';
import { cn } from '@/lib/cn';
import { Logo } from './logo';
import { MobileNav } from './mobile-nav';
import { useSite } from './site-provider';

/**
 * Transparent over overlay heroes, glass once scrolled, hides on scroll-down
 * and returns on scroll-up. Pages opt in to the overlay with [data-hero-overlay].
 */
export function Header() {
  const { site } = useSite();
  const pathname = usePathname();
  const [overlay, setOverlay] = useState(false);
  const [solid, setSolid] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const last = useRef(0);

  useEffect(() => {
    setOverlay(!!document.querySelector('[data-hero-overlay]'));
  }, [pathname]);

  useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY;
      setSolid(y > 24);
      setHidden(y > 320 && y > last.current + 4);
      if (y < last.current - 4 || y < 320) setHidden(false);
      last.current = y;
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const light = overlay && !solid && !menuOpen;
  const primary = site.features.bookingEnabled ? { label: 'Book', href: '/book' } : { label: 'Claim a first stay', href: '/first-stay' };

  return (
    <>
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:rounded-full focus:bg-fg focus:px-4 focus:py-2 focus:text-bg">
        Skip to content
      </a>
      <header
        data-solid={solid}
        data-hidden={hidden && !menuOpen}
        className={cn('site-header fixed inset-x-0 top-0 z-50 border-b border-transparent', light ? 'text-mist-50' : 'text-fg')}
      >
        <div className="container-x flex h-[4.5rem] items-center justify-between gap-6">
          <Link href="/" className="relative z-10 -m-2 p-2" aria-label={`${site.name} — home`}>
            <Logo site={site} />
          </Link>

          <nav aria-label="Main" className="hidden lg:block">
            <ul className="flex items-center gap-1">
              {site.nav.HEADER.map((item) => {
                const active = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href + '/'));
                return (
                  <li key={item.id} className="group relative">
                    <Link
                      href={item.href}
                      aria-current={pathname === item.href ? 'page' : undefined}
                      className={cn('relative flex items-center gap-1 rounded-full px-3.5 py-2 text-[0.92rem] font-medium transition-opacity', active ? 'opacity-100' : 'opacity-80 hover:opacity-100')}
                    >
                      {t(item.label)}
                      {item.children.length > 0 && <ChevronDown className="size-3.5 transition-transform group-hover:rotate-180" aria-hidden />}
                      {active && <span className="absolute inset-x-3.5 -bottom-0.5 h-px bg-current" />}
                    </Link>
                    {item.children.length > 0 && (
                      <div className="invisible absolute left-1/2 top-full -translate-x-1/2 translate-y-2 pt-3 opacity-0 transition-all duration-300 group-focus-within:visible group-focus-within:translate-y-0 group-focus-within:opacity-100 group-hover:visible group-hover:translate-y-0 group-hover:opacity-100">
                        <ul className="min-w-60 rounded-[var(--r-lg)] border border-line bg-surface p-2 text-fg shadow-[var(--shadow-lift)]">
                          {item.children.map((c) => (
                            <li key={c.id}>
                              <Link href={c.href} className="block rounded-[var(--r-md)] px-4 py-2.5 text-sm transition-colors hover:bg-surface-2">
                                {t(c.label)}
                              </Link>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </li>
                );
              })}
              <li>
                <Link
                  href="/concierge"
                  aria-current={pathname === '/concierge' ? 'page' : undefined}
                  className={cn(
                    'relative flex items-center gap-1.5 rounded-full px-3.5 py-2 text-[0.92rem] font-medium transition-opacity',
                    pathname === '/concierge' ? 'opacity-100' : 'opacity-85 hover:opacity-100',
                  )}
                >
                  <Sparkles className="size-3.5 text-amber-500" aria-hidden />
                  <span>Sipi Concierge</span>
                  {pathname === '/concierge' && <span className="absolute inset-x-3.5 -bottom-0.5 h-px bg-current" />}
                </Link>
              </li>
            </ul>
          </nav>

          <div className="flex items-center gap-2">
            <Link href={primary.href} className={cn('btn hidden sm:inline-flex', light && 'shadow-[0_8px_30px_-10px_rgb(0_0_0/.5)]')}>
              <span className="btn-label">{primary.label}</span>
            </Link>
            <button
              type="button"
              onClick={() => setMenuOpen(true)}
              className="grid size-11 place-items-center rounded-full border border-current/25 lg:hidden"
              aria-label="Open menu"
              aria-expanded={menuOpen}
            >
              <Menu className="size-5" strokeWidth={1.6} />
            </button>
          </div>
        </div>
      </header>
      <MobileNav open={menuOpen} onClose={() => setMenuOpen(false)} />
    </>
  );
}
