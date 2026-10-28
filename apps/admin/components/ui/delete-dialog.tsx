'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, ShieldAlert, Trash2 } from 'lucide-react';
import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { TextInput } from '@/components/ui/field';
import { Pill } from '@/components/ui/bits';

export interface DeleteConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  title?: string;
  itemName: string;
  itemType?: string;
  warning?: string;
  requireMatch?: string; // e.g. "DELETE" or item code/name
  loading?: boolean;
}

export function DeleteConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  itemName,
  itemType = 'item',
  warning,
  requireMatch,
  loading = false,
}: DeleteConfirmDialogProps) {
  const [typedConfirm, setTypedConfirm] = useState('');

  // Reset confirmation input on modal open/close
  useEffect(() => {
    if (open) {
      setTypedConfirm('');
    }
  }, [open]);

  const isMatchMet = !requireMatch || typedConfirm.trim() === requireMatch;

  const handleConfirm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isMatchMet || loading) return;
    await onConfirm();
  };

  const dialogTitle = title || `Delete ${itemType}?`;

  return (
    <Dialog
      open={open}
      onClose={loading ? () => {} : onClose}
      size="sm"
      title={
        <div className="flex items-center gap-2 text-red-600 dark:text-red-400">
          <Trash2 className="size-4" />
          <span>{dialogTitle}</span>
        </div>
      }
      description={
        <span className="flex items-center gap-1.5 pt-0.5">
          <Pill tone="amber">
            <ShieldAlert className="size-3 mr-1 inline" />
            Owner Action Only
          </Pill>
        </span>
      }
      footer={
        <div className="flex w-full items-center justify-between gap-2">
          <Button
            type="button"
            variant="ghost"
            onClick={onClose}
            disabled={loading}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="danger"
            loading={loading}
            disabled={!isMatchMet || loading}
            onClick={handleConfirm}
          >
            Permanently Delete
          </Button>
        </div>
      }
    >
      <form onSubmit={handleConfirm} className="space-y-4">
        <div className="rounded-xl border border-red-200 dark:border-red-900/40 bg-red-50/70 dark:bg-red-950/20 p-3.5 text-xs text-red-900 dark:text-red-300">
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="size-4 shrink-0 text-red-600 dark:text-red-400 mt-0.5" />
            <div className="space-y-1">
              <p className="font-semibold text-[13px]">
                Are you sure you want to delete <span className="underline font-bold">{itemName}</span>?
              </p>
              <p className="text-[12px] opacity-90 leading-relaxed">
                {warning ||
                  `This action cannot be undone. This ${itemType} will be permanently removed from the system and recorded in the executive audit log.`}
              </p>
            </div>
          </div>
        </div>

        {requireMatch && (
          <div className="space-y-1.5 pt-1">
            <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300">
              To confirm, type <span className="font-mono font-bold text-red-600 dark:text-red-400">{requireMatch}</span> below:
            </label>
            <TextInput
              value={typedConfirm}
              onChange={(e) => setTypedConfirm(e.target.value)}
              placeholder={`Type "${requireMatch}" to enable deletion`}
              disabled={loading}
              autoFocus
            />
          </div>
        )}
      </form>
    </Dialog>
  );
}
