'use client';
import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Download, FileSpreadsheet, FileText, Printer, Sheet } from 'lucide-react';
import { toast } from 'sonner';
import { exportData, type ExportFormat, type ExportSpec } from '@/lib/export';
import { printScreen, type PrintOptions } from '@/lib/print';
import { Button } from './button';

const OPTIONS: { f: ExportFormat; label: string; hint: string; icon: typeof Sheet }[] = [
  { f: 'xlsx', label: 'Excel', hint: 'Formatted workbook with totals', icon: FileSpreadsheet },
  { f: 'pdf', label: 'PDF / Print', hint: 'Branded A4 document', icon: FileText },
  { f: 'csv', label: 'CSV', hint: 'Plain data for other systems', icon: Sheet },
];

/** One Export button for every list and report: Excel, PDF or CSV, all branded the same way. */
export function ExportMenu({
  spec,
  disabled,
  label = 'Export',
  size = 'sm',
}: {
  /** Built when chosen, so it always reflects the current filters. */
  spec: () => ExportSpec | null | undefined;
  disabled?: boolean;
  label?: string;
  size?: 'sm' | 'md';
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', close);
    };
  }, [open]);

  const run = async (f: ExportFormat) => {
    setOpen(false);
    const s = spec();
    if (!s || !s.rows.length) return toast.info('Nothing to export with the current filters');
    try {
      await exportData(f, s);
      if (f !== 'pdf') toast.success(`${s.title} exported`);
    } catch {
      toast.error('Could not export this list');
    }
  };

  return (
    <div ref={ref} className="no-print relative">
      <Button
        size={size}
        variant="secondary"
        disabled={disabled}
        icon={<Download className="size-3.5" />}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        {label}
        <ChevronDown className="size-3 opacity-60" />
      </Button>
      {open && (
        <div role="menu" className="absolute right-0 z-40 mt-1 w-60 overflow-hidden rounded-xl border border-line bg-surface p-1 shadow-lg">
          {OPTIONS.map((o) => (
            <button
              key={o.f}
              role="menuitem"
              type="button"
              onClick={() => run(o.f)}
              className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition hover:bg-surface-2"
            >
              <o.icon className="size-4 shrink-0 text-fg-muted" />
              <span>
                <span className="block text-[12.5px] font-semibold">{o.label}</span>
                <span className="block text-[11px] text-fg-muted">{o.hint}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Print the screen (or one part of it) as a branded document. */
export function PrintButton({
  label = 'Print',
  size = 'sm',
  options,
}: {
  label?: string;
  size?: 'sm' | 'md';
  /** Title, period and which element to print; defaults to the whole screen. */
  options?: () => Partial<PrintOptions>;
}) {
  return (
    <Button size={size} variant="secondary" icon={<Printer className="size-3.5" />} onClick={() => printScreen(options?.())} className="no-print">
      {label}
    </Button>
  );
}
