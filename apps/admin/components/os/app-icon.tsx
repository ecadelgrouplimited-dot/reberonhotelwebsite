'use client';
import { forwardRef, type ReactNode } from 'react';
import type { BadgeInfo } from '@/components/shell/badges';
import { cn } from '@/lib/cn';
import type { HouseApp } from './apps';

const BADGE: Record<BadgeInfo['tone'], string> = {
  red: 'bg-rose-500 text-white',
  amber: 'bg-amber-500 text-white',
  green: 'bg-emerald-500 text-white',
  neutral: 'bg-slate-500/85 text-white',
};

/** The glyph tile used on Home and in the dock. */
export function AppGlyph({ app, size = 56, className }: { app: HouseApp; size?: number; className?: string }) {
  const Icon = app.icon;
  return (
    <span
      aria-hidden
      className={cn('relative grid shrink-0 place-items-center overflow-hidden text-white shadow-[0_6px_16px_-6px_rgb(15_23_42/0.45),inset_0_1px_0_rgb(255_255_255/0.25)]', className)}
      style={{ width: size, height: size, borderRadius: size * 0.27, background: `linear-gradient(145deg, ${app.tint[0]}, ${app.tint[1]})` }}
    >
      <span className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/20 to-transparent" />
      <Icon style={{ width: size * 0.46, height: size * 0.46 }} strokeWidth={1.9} className="relative drop-shadow-sm" />
    </span>
  );
}

export function AppBadge({ badge, className }: { badge?: BadgeInfo; className?: string }) {
  if (!badge || badge.count <= 0) return null;
  return (
    <span className={cn('absolute -right-1.5 -top-1.5 grid h-5 min-w-5 place-items-center rounded-full px-1.5 text-[10.5px] font-bold tabular shadow ring-2 ring-[var(--bg)]', BADGE[badge.tone], className)} title={badge.tooltip}>
      {badge.count > 99 ? '99+' : badge.count}
    </span>
  );
}

/** A labelled launcher tile (Home). */
export const AppTile = forwardRef<HTMLAnchorElement, {
  app: HouseApp; badge?: BadgeInfo; size: number; onOpen: () => void; onMenu: (e: React.MouseEvent) => void; children?: ReactNode;
  tabIndex?: number; onKeyDown?: (e: React.KeyboardEvent) => void; draggable?: boolean; onDragStart?: (e: React.DragEvent) => void;
}>(function AppTile({ app, badge, size, onOpen, onMenu, children, tabIndex, onKeyDown, draggable, onDragStart }, ref) {
  const label = `${app.fullName}${badge?.count ? ` — ${badge.tooltip}` : ''}`;
  return (
    <a
      ref={ref}
      href={app.href}
      tabIndex={tabIndex}
      aria-label={label}
      title={label}
      draggable={draggable}
      onDragStart={onDragStart}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) return;
        e.preventDefault();
        onOpen();
      }}
      onContextMenu={onMenu}
      onKeyDown={onKeyDown}
      className="group flex w-full flex-col items-center gap-2 rounded-2xl p-2 outline-none transition focus-visible:bg-surface-2 focus-visible:ring-2 focus-visible:ring-[var(--focus)] hover:bg-surface-2/70"
    >
      <span className="relative transition-transform duration-200 motion-safe:group-hover:-translate-y-0.5 motion-safe:group-active:scale-95">
        <AppGlyph app={app} size={size} />
        <AppBadge badge={badge} />
        {children}
      </span>
      <span className="line-clamp-2 max-w-full text-center text-[12.5px] font-medium leading-tight text-fg">{app.name}</span>
    </a>
  );
});
