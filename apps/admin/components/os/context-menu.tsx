'use client';
import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/cn';

/**
 * Right-click menus for the whole House.
 *
 * Any element can open its own menu with `useContextMenu().open(event, items)`.
 * Keyboard: the Menu key or Shift+F10 opens the menu for the focused element,
 * arrows move, Enter chooses, Esc closes. Shift+right-click always gives the
 * browser's own menu.
 */
export type MenuItem =
  | { kind?: 'item'; label: string; icon?: LucideIcon; hint?: string; danger?: boolean; disabled?: boolean; onSelect: () => void; /** single-key shortcut on its screen */ key?: string }
  | { kind: 'separator' }
  | { kind: 'label'; label: string };

type MenuState = { x: number; y: number; items: MenuItem[]; title?: string; returnFocus?: HTMLElement | null } | null;
type Ctx = { open: (at: { clientX: number; clientY: number; preventDefault?: () => void } | { x: number; y: number }, items: MenuItem[], title?: string) => void; close: () => void };

const MenuCtx = createContext<Ctx | null>(null);

/** A modal dialog makes the rest of the page inert, so a menu opened inside one must live in it. */
function menuHost(): HTMLElement {
  const dialogs = [...document.querySelectorAll<HTMLDialogElement>('dialog[open]')].filter((d) => d.matches(':modal'));
  return dialogs.at(-1) ?? document.body;
}

export function useContextMenu() {
  const c = useContext(MenuCtx);
  if (!c) throw new Error('useContextMenu outside ContextMenuProvider');
  return c;
}

export function ContextMenuProvider({ children }: { children: ReactNode }) {
  const [menu, setMenu] = useState<MenuState>(null);
  const open = useCallback<Ctx['open']>((at, items, title) => {
    if ('preventDefault' in at && at.preventDefault) at.preventDefault();
    const x = 'clientX' in at ? at.clientX : at.x;
    const y = 'clientY' in at ? at.clientY : at.y;
    setMenu({ x, y, items: items.filter((it, i, arr) => !(it.kind === 'separator' && (i === 0 || arr[i - 1]?.kind === 'separator' || i === arr.length - 1))), title, returnFocus: document.activeElement as HTMLElement | null });
  }, []);
  const close = useCallback(() => {
    setMenu((m) => {
      m?.returnFocus?.focus?.();
      return null;
    });
  }, []);
  return (
    <MenuCtx.Provider value={{ open, close }}>
      {children}
      {menu && typeof document !== 'undefined' && createPortal(<Menu state={menu} onClose={close} />, menuHost())}
    </MenuCtx.Provider>
  );
}

function Menu({ state, onClose }: { state: NonNullable<MenuState>; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: state.x, top: state.y });
  const actionable = state.items.map((it, i) => ((it.kind ?? 'item') === 'item' && !(it as { disabled?: boolean }).disabled ? i : -1)).filter((i) => i >= 0);
  const [active, setActive] = useState(actionable[0] ?? -1);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setPos({ left: Math.max(8, Math.min(state.x, innerWidth - r.width - 8)), top: Math.max(8, state.y + r.height > innerHeight - 8 ? state.y - r.height : state.y) });
    el.focus();
  }, [state]);

  useEffect(() => {
    const opened = Date.now();
    const away = (e: Event) => !ref.current?.contains(e.target as Node) && onClose();
    const esc = () => onClose();
    // Scrolling closes the menu — but not the scroll that brought the item into view as it opened.
    const scrolled = () => Date.now() - opened > 250 && onClose();
    window.addEventListener('mousedown', away, true);
    window.addEventListener('resize', esc);
    window.addEventListener('blur', esc);
    document.addEventListener('scroll', scrolled, true);
    return () => {
      window.removeEventListener('mousedown', away, true);
      window.removeEventListener('resize', esc);
      window.removeEventListener('blur', esc);
      document.removeEventListener('scroll', scrolled, true);
    };
  }, [onClose]);

  const choose = (i: number) => {
    const it = state.items[i];
    if (!it || (it.kind ?? 'item') !== 'item' || (it as { disabled?: boolean }).disabled) return;
    onClose();
    // Let the menu close (and focus return) before the action runs.
    setTimeout(() => (it as { onSelect: () => void }).onSelect(), 0);
  };

  return (
    <div
      ref={ref}
      role="menu"
      aria-label={state.title ?? 'Actions'}
      tabIndex={-1}
      onContextMenu={(e) => e.preventDefault()}
      onKeyDown={(e) => {
        const at = actionable.indexOf(active);
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          setActive(actionable[(at + 1) % actionable.length] ?? -1);
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          setActive(actionable[(at - 1 + actionable.length) % actionable.length] ?? -1);
        } else if (e.key === 'Home') setActive(actionable[0] ?? -1);
        else if (e.key === 'End') setActive(actionable.at(-1) ?? -1);
        else if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          choose(active);
        } else if (e.key === 'Escape' || e.key === 'Tab') {
          e.preventDefault();
          onClose();
        }
      }}
      style={{ left: pos.left, top: pos.top }}
      className="fade-in fixed z-[100] min-w-56 max-w-80 rounded-xl border border-line bg-surface/95 p-1 text-[13px] shadow-[var(--shadow-lift)] outline-none backdrop-blur-xl"
    >
      {state.title && <p className="truncate px-2.5 pb-1 pt-1.5 text-[11px] font-semibold uppercase tracking-wider text-fg-subtle">{state.title}</p>}
      {state.items.map((it, i) => {
        if (it.kind === 'separator') return <div key={i} role="separator" className="my-1 h-px bg-line" />;
        if (it.kind === 'label') return <p key={i} className="px-2.5 pb-0.5 pt-1.5 text-[11px] font-semibold text-fg-subtle">{it.label}</p>;
        const Icon = it.icon;
        return (
          <button
            key={i}
            type="button"
            role="menuitem"
            disabled={it.disabled}
            tabIndex={-1}
            onMouseEnter={() => setActive(i)}
            onClick={() => choose(i)}
            className={cn(
              'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left transition-colors disabled:opacity-40',
              active === i && (it.danger ? 'bg-danger/10 text-danger' : 'bg-accent text-accent-fg'),
              active !== i && it.danger && 'text-danger',
            )}
          >
            {Icon ? <Icon className="size-4 shrink-0 opacity-80" /> : <span className="size-4 shrink-0" />}
            <span className="flex-1 truncate">{it.label}</span>
            {(it.hint ?? it.key) && <kbd className={cn('font-sans text-[11px]', active === i ? 'opacity-80' : 'text-fg-subtle')}>{it.hint ?? it.key!.toUpperCase()}</kbd>}
          </button>
        );
      })}
    </div>
  );
}
