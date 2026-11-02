'use client';
import { Banknote, Lock, RotateCcw } from 'lucide-react';
import { OWNER_ONLY, PERMISSION_INFO, ROLE_LABELS, ROLE_PERMISSIONS, type Permission, type Role } from '@reberon/contracts';
import { cn } from '@/lib/cn';

export const ROLE_LABEL: Record<Role, string> = ROLE_LABELS;

export const ROLE_COLOR_CLASSES: Record<string, string> = {
  violet: 'border-violet-500/30 bg-violet-500/12 text-violet-700 dark:text-violet-300',
  indigo: 'border-indigo-500/30 bg-indigo-500/12 text-indigo-700 dark:text-indigo-300',
  rose: 'border-rose-500/30 bg-rose-500/12 text-rose-700 dark:text-rose-300',
  emerald: 'border-emerald-500/30 bg-emerald-500/12 text-emerald-700 dark:text-emerald-300',
  sky: 'border-sky-500/30 bg-sky-500/12 text-sky-700 dark:text-sky-300',
  amber: 'border-amber-500/30 bg-amber-500/12 text-amber-700 dark:text-amber-300',
  orange: 'border-orange-500/30 bg-orange-500/12 text-orange-700 dark:text-orange-300',
  teal: 'border-teal-500/30 bg-teal-500/12 text-teal-700 dark:text-teal-300',
  slate: 'border-slate-500/30 bg-slate-500/12 text-slate-700 dark:text-slate-300',
};

export const ROLE_DEFAULT_TONE: Record<Role, string> = {
  OWNER: 'violet',
  MANAGER: 'indigo',
  HR: 'rose',
  ACCOUNTANT: 'emerald',
  DESK: 'sky',
  KITCHEN: 'amber',
  BAR: 'orange',
  GYM: 'teal',
  HOUSEKEEPING: 'slate',
};

/**
 * Every permission, grouped, with what the role gives shown as the default.
 * A switch that differs from the role is marked "added" or "removed".
 */
export function AccessMatrix({
  role,
  customRoleName,
  grants,
  revokes,
  onChange,
  disabled,
}: {
  role: Role;
  customRoleName?: string | null;
  grants: string[];
  revokes: string[];
  onChange: (next: { grants: string[]; revokes: string[] }) => void;
  disabled?: boolean;
}) {
  const preset = new Set<string>(ROLE_PERMISSIONS[role] ?? []);
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
      {isOwner && (
        <p className="rounded-lg bg-surface-2 px-3 py-2 text-xs text-fg-muted">
          Owners hold full system access. Assign the Manager or another role to restrict individual permissions.
        </p>
      )}
      {!isOwner && changed && (
        <p className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-xs">
          <span>
            Custom overrides vs. {customRoleName || ROLE_LABEL[role]} preset:{' '}
            {grants.length ? `+${grants.length} granted` : ''}
            {grants.length && revokes.length ? ', ' : ''}
            {revokes.length ? `−${revokes.length} revoked` : ''}.
          </span>
          {!disabled && (
            <button
              type="button"
              className="flex items-center gap-1 font-semibold underline-offset-4 hover:underline"
              onClick={() => onChange({ grants: [], revokes: [] })}
            >
              <RotateCcw className="size-3" /> Reset to role preset
            </button>
          )}
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
                  <label
                    className={cn(
                      'flex items-center gap-3 px-3 py-2.5 transition',
                      locked ? 'cursor-default' : 'cursor-pointer hover:bg-surface-2/50',
                      removed && 'bg-danger/[0.03]',
                      added && 'bg-success/[0.04]',
                    )}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-1.5 text-xs font-semibold">
                        {p.label}
                        {p.money && <Banknote className="size-3 text-warning" aria-label="Touches money" />}
                        {ownerOnly && (
                          <span className="inline-flex items-center gap-0.5 text-[10.5px] font-semibold text-fg-subtle">
                            <Lock className="size-2.5" /> Owner only
                          </span>
                        )}
                        {added && (
                          <span className="rounded bg-success/15 px-1.5 py-0.5 text-[10px] font-semibold text-success">
                            +Added
                          </span>
                        )}
                        {removed && (
                          <span className="rounded bg-danger/10 px-1.5 py-0.5 text-[10px] font-semibold text-danger">
                            −Removed
                          </span>
                        )}
                      </span>
                      <span className="block text-[11px] text-fg-muted">{p.description}</span>
                    </span>
                    <input
                      type="checkbox"
                      role="switch"
                      className="peer sr-only"
                      checked={on}
                      disabled={locked}
                      onChange={() => toggle(p.key)}
                    />
                    <span
                      aria-hidden
                      className={cn(
                        'relative h-5 w-9 shrink-0 rounded-full transition peer-focus-visible:ring-2 peer-focus-visible:ring-fg',
                        on ? 'bg-success' : 'bg-line-strong',
                        locked && 'opacity-50',
                      )}
                    >
                      <span
                        className={cn(
                          'absolute top-0.5 size-4 rounded-full bg-white shadow transition-all',
                          on ? 'left-[18px]' : 'left-0.5',
                        )}
                      />
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

/**
 * Interactive permission matrix for creating or editing a RoleDefinition's default permissions.
 */
export function RolePermissionsEditor({
  permissions,
  onChange,
  disabled,
}: {
  permissions: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
}) {
  const activeSet = new Set(permissions);
  const groups = [...new Set(PERMISSION_INFO.map((p) => p.group))].filter((g) => g !== 'Owner only');

  const toggle = (key: Permission) => {
    if (disabled || OWNER_ONLY.includes(key)) return;
    if (activeSet.has(key)) {
      onChange(permissions.filter((x) => x !== key));
    } else {
      onChange([...permissions, key]);
    }
  };

  const toggleGroup = (group: string) => {
    if (disabled) return;
    const groupKeys = PERMISSION_INFO.filter((p) => p.group === group && !OWNER_ONLY.includes(p.key)).map((p) => p.key);
    const allOn = groupKeys.every((k) => activeSet.has(k));
    if (allOn) {
      onChange(permissions.filter((k) => !groupKeys.includes(k as Permission)));
    } else {
      const merged = new Set([...permissions, ...groupKeys]);
      onChange([...merged]);
    }
  };

  return (
    <div className="grid gap-3.5">
      {groups.map((g) => {
        const items = PERMISSION_INFO.filter((p) => p.group === g && !OWNER_ONLY.includes(p.key));
        if (!items.length) return null;
        const enabledCount = items.filter((i) => activeSet.has(i.key)).length;
        return (
          <section key={g} className="overflow-hidden rounded-xl border border-line bg-surface">
            <div className="flex items-center justify-between border-b border-line bg-surface-2/60 px-3 py-2">
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-fg">{g}</span>
                <span className="rounded-full bg-surface px-2 py-0.5 text-[10px] font-semibold text-fg-muted">
                  {enabledCount}/{items.length} enabled
                </span>
              </div>
              {!disabled && (
                <button
                  type="button"
                  onClick={() => toggleGroup(g)}
                  className="text-[11px] font-semibold text-brand hover:underline"
                >
                  {enabledCount === items.length ? 'Clear group' : 'Enable all'}
                </button>
              )}
            </div>
            <ul className="divide-y divide-line">
              {items.map((p) => {
                const on = activeSet.has(p.key);
                return (
                  <li key={p.key}>
                    <label
                      className={cn(
                        'flex items-center gap-3 px-3 py-2 transition',
                        disabled ? 'cursor-default' : 'cursor-pointer hover:bg-surface-2/40',
                        on && 'bg-emerald-500/[0.03]',
                      )}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-1.5 text-xs font-semibold text-fg">
                          {p.label}
                          {p.money && <Banknote className="size-3 text-warning" aria-label="Touches money" />}
                        </span>
                        <span className="block text-[11px] text-fg-muted">{p.description}</span>
                      </span>
                      <input
                        type="checkbox"
                        role="switch"
                        className="peer sr-only"
                        checked={on}
                        disabled={disabled}
                        onChange={() => toggle(p.key)}
                      />
                      <span
                        aria-hidden
                        className={cn(
                          'relative h-5 w-9 shrink-0 rounded-full transition peer-focus-visible:ring-2 peer-focus-visible:ring-fg',
                          on ? 'bg-success' : 'bg-line-strong',
                          disabled && 'opacity-50',
                        )}
                      >
                        <span
                          className={cn(
                            'absolute top-0.5 size-4 rounded-full bg-white shadow transition-all',
                            on ? 'left-[18px]' : 'left-0.5',
                          )}
                        />
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
