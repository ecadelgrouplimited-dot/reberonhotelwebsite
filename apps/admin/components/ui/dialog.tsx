'use client';
import { useEffect, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/cn';

export function Dialog({
  open, onClose, title, description, children, footer, size = 'md', drawer,
}: { open: boolean; onClose: () => void; title?: ReactNode; description?: ReactNode; children: ReactNode; footer?: ReactNode; size?: 'sm' | 'md' | 'lg' | 'xl' | 'full'; drawer?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  // A form whose change was kept for offline sync is done from the user's side — close it like a save.
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    if (!open) return;
    const h = () => closeRef.current();
    window.addEventListener('rb:offline-queued', h);
    return () => window.removeEventListener('rb:offline-queued', h);
  }, [open]);
  const width = { sm: 'w-[min(26rem,94vw)]', md: 'w-[min(36rem,94vw)]', lg: 'w-[min(52rem,96vw)]', xl: 'w-[min(72rem,96vw)]', full: 'w-[96vw]' }[size];
  return (
    <dialog ref={ref} className={cn('modal', drawer && 'drawer')} onClose={onClose} onClick={(e) => e.target === ref.current && onClose()}>
      {open && (
        <div className={cn('panel flex flex-col bg-surface text-fg shadow-[var(--shadow-lift)]', drawer ? 'h-dvh w-[min(34rem,100vw)] border-l border-line' : cn(width, 'max-h-[90dvh] rounded-[20px] border border-line'))}>
          {(title || description) && (
            <header className="flex items-start justify-between gap-4 border-b border-line px-6 py-4">
              <div>
                {title && <h2 className="text-[15px] font-semibold">{title}</h2>}
                {description && <p className="mt-0.5 text-[13px] text-fg-muted">{description}</p>}
              </div>
              <button type="button" onClick={onClose} className="-mr-2 grid size-8 place-items-center rounded-full text-fg-muted hover:bg-surface-2 hover:text-fg" aria-label="Close">
                <X className="size-4" />
              </button>
            </header>
          )}
          <div className="scrollbar-thin flex-1 overflow-y-auto px-6 py-5">{children}</div>
          {footer && <footer className="flex items-center justify-end gap-2 border-t border-line px-6 py-3">{footer}</footer>}
        </div>
      )}
    </dialog>
  );
}
