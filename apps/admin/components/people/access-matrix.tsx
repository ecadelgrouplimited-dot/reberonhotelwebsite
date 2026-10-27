'use client';
import { Banknote, Lock, RotateCcw } from 'lucide-react';
import { OWNER_ONLY, PERMISSION_INFO, ROLE_PERMISSIONS, type Permission, type Role } from '@reberon/contracts';
import { cn } from '@/lib/cn';

export const ROLE_LABEL: Record<Role, string> = { OWNER: 'Owner', MANAGER: 'Manager', DESK: 'Front desk', HOUSEKEEPING: 'Housekeeping' };

/**
 * Every permission, grouped, with what the role gives shown as the default.
 * A switch that differs from the role is marked "added" or "removed".
 */
export function AccessMatrix({ role, grants, revokes, onChange, disabled }: { role: Role; grants: string[]; revokes: string[]; onChange: (next: { grants: string[]; revokes: string[] }) => void; disabled?: boolean }) {
  const preset = new Set<string>(ROLE_PERMISSIONS[role]);
  const isOwner = role === 'OWNER';
  const has = (p: Permission) => isOwner || (preset.has(p) ? !revokes.includes(p) : grants.includes(p));
  const toggle = (p: Permission) => {
    const on = has(p);
    if (preset.has(p)) onChange({ grants, revokes: on ? [...revokes, p] : revokes.filter((x) => x !== p) });
    else onChange({ grants: on ? grants.filter((x) => x !== p) : [...grants, p], revokes });
  };
  const groups = [...new Set(PERMISSION_INFO.map((p) => p.group))];
  const changed = grants.length + revokes.length > 0;

  return (
    <div className="grid gap-4">
      {isOwner && <p className="rounded-lg bg-surface-2 px-3 py-2 text-xs text-fg-muted">Owners hold full system access. Assign the Manager role to restrict individual permissions.</p>}
      {!isOwner && changed && (
        <p className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-xs">
          <span>Custom overrides vs. {ROLE_LABEL[role]} preset: {grants.length ? `+${grants.length} granted` : ''}{grants.length && revokes.length ? ', ' : ''}{revokes.length ? `−${revokes.length} revoked` : ''}.</span>
          {!disabled && <button type="button" className="flex items-center gap-1 font-semibold underline-offset-4 hover:underline" onClick={() => onChange({ grants: [], revokes: [] })}><RotateCcw className="size-3" /> Reset to role preset</button>}
        </p>
      )}
      {groups.map((g) => (
        <section key={g}>
          <p className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-wider text-fg-subtle">{g}</p>
          <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line">
            {PERMISSION_INFO.filter((p) => p.group === g).map((p) => {
              const on = has(p.key);
              const ownerOnly = OWNER_ONLY.includes(p.key);
              const locked = disabled || isOwner || ownerOnly;
              const added = !isOwner && !preset.has(p.key) && on;
              const removed = !isOwner && preset.has(p.key) && !on;
              return (
                <li key={p.key}>
                  <label className={cn('flex items-center gap-3 px-3 py-2 transition', locked ? 'cursor-default' : 'cursor-pointer hover:bg-surface-2/50', removed && 'bg-danger/[0.03]', added && 'bg-success/[0.04]')}>
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-1.5 text-xs font-semibold">
                        {p.label}
                        {p.money && <Banknote className="size-3 text-warning" aria-label="Touches money" />}
                        {ownerOnly && <span className="inline-flex items-center gap-0.5 text-[10.5px] font-semibold text-fg-subtle"><Lock className="size-2.5" /> Owner only</span>}
                        {added && <span className="rounded bg-success/15 px-1.5 py-0.5 text-[10px] font-semibold text-success">+Added</span>}
                        {removed && <span className="rounded bg-danger/10 px-1.5 py-0.5 text-[10px] font-semibold text-danger">−Removed</span>}
                      </span>
                      <span className="block text-[11px] text-fg-muted">{p.description}</span>
                    </span>
                    <input type="checkbox" role="switch" className="peer sr-only" checked={on} disabled={locked} onChange={() => toggle(p.key)} />
                    <span aria-hidden className={cn('relative h-5 w-9 shrink-0 rounded-full transition peer-focus-visible:ring-2 peer-focus-visible:ring-fg', on ? 'bg-success' : 'bg-line-strong', locked && 'opacity-50')}>
                      <span className={cn('absolute top-0.5 size-4 rounded-full bg-white shadow transition-all', on ? 'left-[18px]' : 'left-0.5')} />
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
