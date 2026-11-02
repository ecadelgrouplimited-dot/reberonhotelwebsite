'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  CheckCircle2,
  Clock,
  Copy,
  Edit,
  Eye,
  EyeOff,
  KeyRound,
  Lock,
  Mail,
  Plus,
  Search,
  Shield,
  ShieldCheck,
  Sparkles,
  Trash2,
  UserPlus,
  UserRound,
  Users,
} from 'lucide-react';
import {
  PERMISSIONS,
  PERMISSION_INFO,
  ROLES,
  ROLE_DESCRIPTIONS,
  ROLE_PERMISSIONS,
  type Role,
  type RoleDefinitionDTO,
  type UserDTO,
} from '@reberon/contracts';
import { ApiError, del, get, patch, post } from '@/lib/api';
import { ago } from '@/lib/format';
import { cn } from '@/lib/cn';
import { useMe } from '@/lib/providers';
import { Button } from '@/components/ui/button';
import { Empty, PageHeader, Pill, Skeleton } from '@/components/ui/bits';
import { Dialog } from '@/components/ui/dialog';
import { DeleteConfirmDialog } from '@/components/ui/delete-dialog';
import { SelectInput, Switch, TextInput } from '@/components/ui/field';
import {
  ROLE_COLOR_CLASSES,
  ROLE_DEFAULT_TONE,
  ROLE_LABEL,
  RolePermissionsEditor,
} from '@/components/people/access-matrix';

function accessSummary(u: UserDTO, roleDefs?: RoleDefinitionDTO[]) {
  const customDef = u.customRoleKey ? roleDefs?.find((d) => d.key === u.customRoleKey) : undefined;
  const preset = customDef ? customDef.permissions : (ROLE_PERMISSIONS[u.role] ?? []);
  const added = u.permissions.filter((p) => !(preset as string[]).includes(p)).length;
  const removed = (preset as string[]).filter((p) => !u.permissions.includes(p)).length;
  return { added, removed };
}

function generateStrongPassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  let suffix = '';
  for (let i = 0; i < 6; i++) suffix += chars[Math.floor(Math.random() * chars.length)];
  return `Reberon#${suffix}!26`;
}

const COLOR_OPTIONS = [
  { value: 'emerald', label: 'Emerald (Finance / Operations)' },
  { value: 'sky', label: 'Sky Blue (Front Desk / Guest)' },
  { value: 'rose', label: 'Rose (Human Resources / Medical)' },
  { value: 'amber', label: 'Amber (Kitchen / Culinary)' },
  { value: 'orange', label: 'Orange (Bar / Events)' },
  { value: 'teal', label: 'Teal (Health Club / Spa)' },
  { value: 'indigo', label: 'Indigo (Management / Supervision)' },
  { value: 'violet', label: 'Violet (Executive / Security)' },
  { value: 'slate', label: 'Slate (Housekeeping / Support)' },
];

export default function PeoplePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const qc = useQueryClient();
  const me = useMe();
  const isOwner = me.role === 'OWNER';

  const viewParam = searchParams.get('view');
  const [mainView, setMainView] = useState<'staff' | 'roles'>(viewParam === 'roles' ? 'roles' : 'staff');

  useEffect(() => {
    if (viewParam === 'roles') setMainView('roles');
    else if (viewParam === 'staff') setMainView('staff');
  }, [viewParam]);

  const { data, isLoading } = useQuery({ queryKey: ['users'], queryFn: () => get<UserDTO[]>('/users') });
  const { data: rolesData, isLoading: rolesLoading } = useQuery({
    queryKey: ['user-roles'],
    queryFn: () => get<RoleDefinitionDTO[]>('/users/roles'),
  });

  const [tab, setTab] = useState('all');
  const [roleFilter, setRoleFilter] = useState<string>('ALL');
  const [q, setQ] = useState('');
  const [adding, setAdding] = useState(false);
  const [preselectedRoleKey, setPreselectedRoleKey] = useState<string>('DESK');
  const [deletingUser, setDeletingUser] = useState<UserDTO | null>(null);

  // Role modal states
  const [creatingRole, setCreatingRole] = useState(false);
  const [editingRole, setEditingRole] = useState<RoleDefinitionDTO | null>(null);
  const [deletingRole, setDeletingRole] = useState<RoleDefinitionDTO | null>(null);

  const deleteMutation = useMutation({
    mutationFn: (id: string) => del(`/users/${id}`),
    onSuccess: () => {
      toast.success('Staff account permanently deleted');
      qc.invalidateQueries({ queryKey: ['users'] });
      qc.invalidateQueries({ queryKey: ['user-roles'] });
      setDeletingUser(null);
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : 'Could not delete staff member');
    },
  });

  const deleteRoleMutation = useMutation({
    mutationFn: (key: string) => del(`/users/roles/${encodeURIComponent(key)}`),
    onSuccess: () => {
      toast.success('Custom role deleted');
      qc.invalidateQueries({ queryKey: ['user-roles'] });
      qc.invalidateQueries({ queryKey: ['users'] });
      setDeletingRole(null);
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : 'Could not delete role');
    },
  });

  const allUsers = data ?? [];
  const allRoles = rolesData ?? [];

  const counts = {
    all: allUsers.filter((u) => u.status !== 'DISABLED').length,
    signin: allUsers.filter((u) => u.canSignIn && u.status !== 'DISABLED').length,
    records: allUsers.filter((u) => !u.canSignIn && u.status !== 'DISABLED').length,
    off: allUsers.filter((u) => u.status === 'DISABLED').length,
  };

  const getUserRoleKey = (u: UserDTO) => u.customRoleKey || u.role;
  const getUserRoleDisplay = (u: UserDTO) => {
    if (u.customRoleKey) {
      const def = allRoles.find((r) => r.key === u.customRoleKey);
      return {
        label: def?.name || u.customRoleName || u.customRoleKey,
        color: def?.color || 'emerald',
      };
    }
    const sysDef = allRoles.find((r) => r.key === u.role);
    return {
      label: sysDef?.name || ROLE_LABEL[u.role] || u.role,
      color: sysDef?.color || ROLE_DEFAULT_TONE[u.role] || 'slate',
    };
  };

  const term = q.trim().toLowerCase();
  const rows = allUsers.filter((u) => {
    if (tab === 'signin' && (!u.canSignIn || u.status === 'DISABLED')) return false;
    if (tab === 'records' && (u.canSignIn || u.status === 'DISABLED')) return false;
    if (tab === 'off' && u.status !== 'DISABLED') return false;
    if (tab === 'all' && u.status === 'DISABLED') return false;
    if (roleFilter !== 'ALL' && getUserRoleKey(u) !== roleFilter) return false;
    if (term) {
      const rDisp = getUserRoleDisplay(u).label;
      const hay = `${u.name} ${u.email ?? ''} ${u.phone ?? ''} ${u.jobTitle ?? ''} ${rDisp}`.toLowerCase();
      if (!hay.includes(term)) return false;
    }
    return true;
  });

  return (
    <div className="fade-in space-y-4">
      <PageHeader
        title="People, Roles & Access"
        description="Manage hotel roles, granular departmental permissions, staff accounts, and credential dispatch via alerts@reberonhotel.com"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant="secondary"
              icon={<Shield className="size-3.5" />}
              onClick={() => {
                setMainView('roles');
                setCreatingRole(true);
              }}
            >
              + New Role
            </Button>
            <Button
              size="sm"
              variant="primary"
              icon={<UserPlus className="size-3.5" />}
              onClick={() => {
                setPreselectedRoleKey('DESK');
                setAdding(true);
              }}
            >
              Add Staff Member
            </Button>
          </div>
        }
      />

      {/* Primary View Switcher: Staff Directory vs Roles & Permissions */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-surface p-1.5 shadow-2xs">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setMainView('staff')}
            className={cn(
              'inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-xs font-semibold transition-all',
              mainView === 'staff'
                ? 'bg-fg text-bg shadow-xs'
                : 'text-fg-muted hover:bg-surface-2 hover:text-fg',
            )}
          >
            <Users className="size-3.5" />
            <span>Staff & Access Directory</span>
            <span
              className={cn(
                'rounded-full px-1.5 py-0.2 text-[10px] font-bold tabular',
                mainView === 'staff' ? 'bg-bg/20 text-bg' : 'bg-surface-2 text-fg-muted',
              )}
            >
              {counts.all}
            </span>
          </button>
          <button
            type="button"
            onClick={() => setMainView('roles')}
            className={cn(
              'inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-xs font-semibold transition-all',
              mainView === 'roles'
                ? 'bg-fg text-bg shadow-xs'
                : 'text-fg-muted hover:bg-surface-2 hover:text-fg',
            )}
          >
            <ShieldCheck className="size-3.5" />
            <span>Roles & Permissions Matrix</span>
            <span
              className={cn(
                'rounded-full px-1.5 py-0.2 text-[10px] font-bold tabular',
                mainView === 'roles' ? 'bg-bg/20 text-bg' : 'bg-surface-2 text-fg-muted',
              )}
            >
              {allRoles.length || ROLES.length}
            </span>
          </button>
        </div>
        <div className="hidden items-center gap-2 pr-2 text-[11px] text-fg-muted sm:flex">
          <span>{allRoles.filter((r) => r.isSystem).length || ROLES.length} built-in hotel roles</span>
          <span>·</span>
          <span>{allRoles.filter((r) => !r.isSystem).length} custom roles</span>
        </div>
      </div>

      {mainView === 'roles' ? (
        <div className="space-y-4">
          <div className="card flex flex-wrap items-center justify-between gap-3 bg-surface-2/30 px-4 py-3">
            <div>
              <h2 className="text-sm font-bold text-fg">Hotel Role Presets & Custom Roles</h2>
              <p className="text-xs text-fg-muted">
                Every staff member starts with a Role preset (such as Human Resources, Kitchen & Culinary, Front Desk, or a Custom Role). Edit any role below to update its permissions across the House.
              </p>
            </div>
            <Button
              size="sm"
              variant="primary"
              icon={<Plus className="size-3.5" />}
              onClick={() => setCreatingRole(true)}
            >
              Create Custom Role
            </Button>
          </div>

          {rolesLoading ? (
            <div className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 6 }, (_, i) => (
                <Skeleton key={i} className="h-48" />
              ))}
            </div>
          ) : (
            <div className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-3">
              {allRoles.map((roleDef) => {
                const badgeCls =
                  ROLE_COLOR_CLASSES[roleDef.color] ?? ROLE_COLOR_CLASSES.emerald;
                const isOwnerRole = roleDef.key === 'OWNER';
                const sampleGroups = [
                  ...new Set(
                    PERMISSION_INFO.filter((p) => roleDef.permissions.includes(p.key)).map(
                      (p) => p.group,
                    ),
                  ),
                ];

                return (
                  <div
                    key={roleDef.key}
                    className="card flex flex-col justify-between p-4 transition hover:border-line-strong"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={cn(
                              'inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-bold',
                              badgeCls,
                            )}
                          >
                            <Shield className="size-3" />
                            {roleDef.name}
                          </span>
                          {roleDef.isSystem ? (
                            <span className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-fg-subtle">
                              SYSTEM · {roleDef.key}
                            </span>
                          ) : (
                            <span className="rounded bg-brand/15 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-brand">
                              CUSTOM · {roleDef.key}
                            </span>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setRoleFilter(roleDef.key);
                            setMainView('staff');
                          }}
                          className="shrink-0 rounded-full border border-line bg-surface-2 px-2.5 py-0.5 text-[11px] font-semibold text-fg hover:border-line-strong"
                          title="View staff assigned to this role"
                        >
                          {roleDef.usersCount} staff
                        </button>
                      </div>

                      <p className="mt-2.5 text-xs leading-relaxed text-fg-muted">
                        {roleDef.description || 'Custom operational role preset.'}
                      </p>

                      <div className="mt-3 flex flex-wrap items-center gap-1">
                        <span className="mr-1 text-[10.5px] font-bold uppercase tracking-wider text-fg-subtle">
                          Access ({roleDef.permissions.length}/{PERMISSIONS.length}):
                        </span>
                        {isOwnerRole ? (
                          <span className="rounded bg-violet-500/15 px-2 py-0.5 text-[10.5px] font-semibold text-violet-600 dark:text-violet-300">
                            All 48 House Permissions
                          </span>
                        ) : sampleGroups.length > 0 ? (
                          sampleGroups.map((g) => (
                            <span
                              key={g}
                              className="rounded border border-line bg-surface-2/60 px-1.5 py-0.5 text-[10.5px] font-medium text-fg-muted"
                            >
                              {g}
                            </span>
                          ))
                        ) : (
                          <span className="text-[11px] text-fg-subtle">No permissions enabled</span>
                        )}
                      </div>
                    </div>

                    <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3">
                      <Button
                        size="sm"
                        variant="secondary"
                        icon={<UserPlus className="size-3" />}
                        onClick={() => {
                          setPreselectedRoleKey(roleDef.key);
                          setAdding(true);
                        }}
                      >
                        Add Staff in Role
                      </Button>
                      <div className="flex items-center gap-1.5">
                        {!isOwnerRole && (
                          <Button
                            size="sm"
                            variant="ghost"
                            icon={<Edit className="size-3" />}
                            onClick={() => setEditingRole(roleDef)}
                          >
                            Permissions
                          </Button>
                        )}
                        {!roleDef.isSystem && isOwner && (
                          <Button
                            size="sm"
                            variant="danger"
                            icon={<Trash2 className="size-3" />}
                            onClick={() => setDeletingRole(roleDef)}
                            title="Delete custom role"
                          />
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        <>
          {/* Compact 4-KPI Strip */}
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            {(
              [
                { k: 'all', label: 'Active Staff', count: counts.all, cls: 'text-fg' },
                { k: 'signin', label: 'Sign-In Enabled', count: counts.signin, cls: 'text-success' },
                { k: 'records', label: 'Staff Records (No Login)', count: counts.records, cls: 'text-info' },
                { k: 'off', label: 'Disabled / Off', count: counts.off, cls: 'text-fg-muted' },
              ] as const
            ).map((item) => (
              <button
                key={item.k}
                type="button"
                onClick={() => setTab(item.k)}
                className={cn(
                  'card flex flex-col items-start justify-between p-3.5 text-left transition',
                  tab === item.k
                    ? '!border-fg ring-1 ring-fg bg-surface-2/40'
                    : 'hover:border-line-strong',
                )}
              >
                <span className="text-[11px] font-semibold uppercase tracking-wider text-fg-subtle">
                  {item.label}
                </span>
                <span className={cn('mt-1 text-2xl font-extrabold leading-none tabular', item.cls)}>
                  {item.count}
                </span>
              </button>
            ))}
          </div>

          <div className="card overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-surface-2/40 px-3 py-2.5">
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex rounded-lg border border-line bg-surface p-0.5 text-[11px]">
                  {(
                    [
                      ['all', `Active (${counts.all})`],
                      ['signin', `Sign-In (${counts.signin})`],
                      ['records', `No Login (${counts.records})`],
                      ['off', `Disabled (${counts.off})`],
                    ] as const
                  ).map(([v, l]) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setTab(v)}
                      className={cn(
                        'rounded-md px-2.5 py-1 font-medium transition',
                        tab === v ? 'bg-fg text-bg' : 'text-fg-muted hover:text-fg',
                      )}
                    >
                      {l}
                    </button>
                  ))}
                </div>

                {/* Role Filter Dropdown */}
                <select
                  value={roleFilter}
                  onChange={(e) => setRoleFilter(e.target.value)}
                  className="input !h-7 !min-h-0 w-auto px-2.5 py-0 text-xs font-medium"
                >
                  <option value="ALL">All Roles ({allRoles.length || ROLES.length})</option>
                  {allRoles.map((r) => (
                    <option key={r.key} value={r.key}>
                      {r.name} ({r.usersCount})
                    </option>
                  ))}
                </select>

                <div className="relative">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-fg-subtle" />
                  <input
                    className="input !h-7 !min-h-0 w-56 pl-8 text-xs"
                    placeholder="Search name, @reberonhotel.com, role..."
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                  />
                </div>
              </div>
              <span className="text-[11px] font-medium text-fg-muted">
                {rows.length} person{rows.length === 1 ? '' : 's'}
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-line bg-surface-2/50 text-[11px] font-semibold uppercase tracking-wider text-fg-subtle">
                  <tr>
                    <th className="px-3 py-2.5">Person</th>
                    <th className="px-3 py-2.5">Official Email / Phone</th>
                    <th className="px-3 py-2.5">Assigned Role</th>
                    <th className="px-3 py-2.5">Access & Credentials</th>
                    <th className="px-3 py-2.5">Last Sign-In</th>
                    <th className="px-3 py-2.5 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {isLoading &&
                    Array.from({ length: 6 }, (_, i) => (
                      <tr key={i}>
                        <td colSpan={6} className="px-3 py-2.5">
                          <Skeleton className="h-5" />
                        </td>
                      </tr>
                    ))}
                  {rows.map((u) => {
                    const s = accessSummary(u, allRoles);
                    const expired = u.accessExpiresAt && new Date(u.accessExpiresAt) < new Date();
                    const rDisp = getUserRoleDisplay(u);
                    const roleBadgeCls =
                      ROLE_COLOR_CLASSES[rDisp.color] ?? ROLE_COLOR_CLASSES.slate;

                    return (
                      <tr
                        key={u.id}
                        className={cn(
                          'cursor-pointer hover:bg-surface-2/40 transition-colors',
                          u.status === 'DISABLED' && 'opacity-55',
                        )}
                        onClick={() => router.push(`/settings/users/${u.id}`)}
                      >
                        <td className="px-3 py-2.5 whitespace-nowrap">
                          <div className="flex items-center gap-2.5">
                            <span className="grid size-8 shrink-0 place-items-center rounded-full bg-surface-2 text-[11px] font-bold">
                              {u.name
                                .split(' ')
                                .map((x) => x[0])
                                .slice(0, 2)
                                .join('')}
                            </span>
                            <div>
                              <p className="font-semibold text-fg">{u.name}</p>
                              {u.jobTitle && <p className="text-[11px] text-fg-muted">{u.jobTitle}</p>}
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-2.5 whitespace-nowrap">
                          {u.email ? (
                            <span className="font-mono text-fg">{u.email}</span>
                          ) : (
                            <span className="text-fg-subtle">—</span>
                          )}
                          {u.phone && <span className="block text-[11px] text-fg-muted">{u.phone}</span>}
                        </td>
                        <td className="px-3 py-2.5 whitespace-nowrap">
                          <span
                            className={cn(
                              'inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-semibold',
                              roleBadgeCls,
                            )}
                          >
                            {rDisp.label}
                          </span>
                        </td>
                        <td className="px-3 py-2.5">
                          <span className="flex flex-wrap gap-1">
                            {u.status === 'DISABLED' ? (
                              <Pill>Switched off</Pill>
                            ) : !u.canSignIn ? (
                              <Pill>
                                <UserRound className="size-3" /> Staff record only
                              </Pill>
                            ) : u.status === 'INVITED' ? (
                              <Pill tone="blue">Invited (Pending)</Pill>
                            ) : (
                              <Pill tone="green" dot>
                                Signs in
                              </Pill>
                            )}
                            {u.canSignIn && u.hasPassword && (
                              <Pill>
                                <KeyRound className="size-2.5" /> Password set
                              </Pill>
                            )}
                            {u.role !== 'OWNER' && (s.added > 0 || s.removed > 0) && (
                              <Pill tone="amber">
                                {s.added ? `+${s.added}` : ''}
                                {s.added && s.removed ? ' ' : ''}
                                {s.removed ? `−${s.removed}` : ''}
                              </Pill>
                            )}
                            {u.signInFrom && (
                              <Pill>
                                <Clock className="size-2.5" /> {u.signInFrom}–{u.signInUntil}
                              </Pill>
                            )}
                            {u.accessExpiresAt && (
                              <Pill tone={expired ? 'red' : 'neutral'}>
                                <Lock className="size-2.5" /> {expired ? 'Ended' : 'Until'}{' '}
                                {new Date(u.accessExpiresAt).toLocaleDateString('en-GB', {
                                  day: 'numeric',
                                  month: 'short',
                                })}
                              </Pill>
                            )}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 whitespace-nowrap text-fg-muted">
                          {u.canSignIn ? (u.lastLoginAt ? ago(u.lastLoginAt) : 'Never') : '—'}
                        </td>
                        <td
                          className="px-3 py-2.5 text-right whitespace-nowrap"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="flex items-center justify-end gap-1.5">
                            <Link
                              href={`/settings/users/${u.id}`}
                              className="inline-flex items-center gap-1 rounded-md border border-line px-2.5 py-1 text-[11px] font-semibold hover:bg-surface-2"
                            >
                              Manage Access →
                            </Link>
                            {isOwner && u.id !== me.id && (
                              <Button
                                variant="danger"
                                size="sm"
                                icon={<Trash2 className="size-3" />}
                                onClick={() => setDeletingUser(u)}
                                title="Delete staff account"
                              />
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {!isLoading && !rows.length && <Empty title="No staff members match filter" />}
            </div>
          </div>
        </>
      )}

      <AddDialog
        open={adding}
        onClose={() => setAdding(false)}
        roles={allRoles}
        initialRoleKey={preselectedRoleKey}
      />

      {creatingRole && (
        <RoleEditorDialog
          open={creatingRole}
          onClose={() => setCreatingRole(false)}
          mode="create"
        />
      )}

      {editingRole && (
        <RoleEditorDialog
          open={!!editingRole}
          onClose={() => setEditingRole(null)}
          mode="edit"
          roleDef={editingRole}
        />
      )}

      {deletingRole && (
        <DeleteConfirmDialog
          open={!!deletingRole}
          onClose={() => setDeletingRole(null)}
          onConfirm={() => deleteRoleMutation.mutate(deletingRole.key)}
          title={`Delete Custom Role · ${deletingRole.name}?`}
          itemName={deletingRole.name}
          itemType="Custom Hotel Role"
          warning={`Deleting "${deletingRole.name}" will remove this custom role preset. Any staff members currently assigned to it (${deletingRole.usersCount}) will retain their current permissions under their base role (${ROLE_LABEL[deletingRole.baseRole]}).`}
          requireMatch="DELETE"
          loading={deleteRoleMutation.isPending}
        />
      )}

      {deletingUser && (
        <DeleteConfirmDialog
          open={!!deletingUser}
          onClose={() => setDeletingUser(null)}
          onConfirm={() => deleteMutation.mutate(deletingUser.id)}
          title={`Delete Staff Account · ${deletingUser.name}?`}
          itemName={deletingUser.name}
          itemType="Staff User Account"
          warning={`This will immediately terminate all active sessions for ${deletingUser.name} (${deletingUser.email || 'No email'}), revoke their House permissions, and mark their staff record as terminated.`}
          requireMatch="DELETE"
          loading={deleteMutation.isPending}
        />
      )}
    </div>
  );
}

function RoleEditorDialog({
  open,
  onClose,
  mode,
  roleDef,
}: {
  open: boolean;
  onClose: () => void;
  mode: 'create' | 'edit';
  roleDef?: RoleDefinitionDTO;
}) {
  const qc = useQueryClient();
  const [name, setName] = useState(roleDef?.name ?? '');
  const [description, setDescription] = useState(roleDef?.description ?? '');
  const [color, setColor] = useState(roleDef?.color ?? 'emerald');
  const [baseRole, setBaseRole] = useState<Role>(roleDef?.baseRole ?? 'DESK');
  const [permissions, setPermissions] = useState<string[]>(
    roleDef?.permissions ?? [...ROLE_PERMISSIONS.HR],
  );
  const [syncToUsers, setSyncToUsers] = useState(true);

  const applyTemplate = (r: Role) => {
    setBaseRole(r);
    setPermissions([...ROLE_PERMISSIONS[r]]);
  };

  const mut = useMutation({
    mutationFn: () => {
      if (mode === 'create') {
        return post<RoleDefinitionDTO>('/users/roles', {
          name,
          description,
          color,
          baseRole,
          permissions,
        });
      }
      return patch<RoleDefinitionDTO>(`/users/roles/${encodeURIComponent(roleDef!.key)}`, {
        name,
        description,
        color,
        baseRole,
        permissions,
        syncToUsers,
      });
    },
    onSuccess: (saved) => {
      toast.success(
        mode === 'create'
          ? `Created role "${saved.name}" with ${saved.permissions.length} permissions`
          : `Updated role "${saved.name}"${syncToUsers ? ' and synced to assigned staff' : ''}`,
      );
      qc.invalidateQueries({ queryKey: ['user-roles'] });
      qc.invalidateQueries({ queryKey: ['users'] });
      onClose();
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.message : 'Failed to save role'),
  });

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={mode === 'create' ? 'Create New Hotel Role' : `Edit Role · ${roleDef?.name}`}
      description={
        mode === 'create'
          ? 'Define a new role (e.g. Human Resource Officer, Security Supervisor, Procurement Lead) and select its exact House permissions.'
          : 'Customize this role’s name, description, badge color, and default permissions.'
      }
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            loading={mut.isPending}
            disabled={name.trim().length < 2}
            onClick={() => mut.mutate()}
          >
            {mode === 'create' ? 'Create Role' : 'Save Role & Permissions'}
          </Button>
        </>
      }
    >
      <div className="grid max-h-[70vh] gap-4 overflow-y-auto pr-1">
        <div className="grid gap-3 sm:grid-cols-2">
          <TextInput
            label="Role Name"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Human Resources, Security Lead, Storekeeper…"
          />
          <SelectInput
            label="Badge Color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
          >
            {COLOR_OPTIONS.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </SelectInput>
        </div>

        <TextInput
          label="Role Description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="What responsibilities and areas of the hotel does this role cover?"
        />

        {mode === 'create' && (
          <div className="rounded-xl border border-line bg-surface-2/40 p-3">
            <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-fg-subtle">
              Quick-Fill Permissions from Template:
            </p>
            <div className="flex flex-wrap gap-1.5">
              {ROLES.filter((r) => r !== 'OWNER').map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => applyTemplate(r)}
                  className={cn(
                    'rounded-lg border px-2.5 py-1 text-xs font-semibold transition',
                    baseRole === r
                      ? 'border-fg bg-fg text-bg'
                      : 'border-line bg-surface text-fg-muted hover:text-fg',
                  )}
                >
                  {ROLE_LABEL[r]}
                </button>
              ))}
            </div>
          </div>
        )}

        {mode === 'edit' && (roleDef?.usersCount ?? 0) > 0 && (
          <label className="flex cursor-pointer items-center gap-2.5 rounded-xl border border-emerald-500/30 bg-emerald-500/8 px-3 py-2.5 text-xs">
            <input
              type="checkbox"
              checked={syncToUsers}
              onChange={(e) => setSyncToUsers(e.target.checked)}
              className="size-4 rounded border-line accent-brand"
            />
            <span>
              <span className="font-semibold text-fg">
                Immediately apply updated permissions to all {roleDef?.usersCount} assigned staff
              </span>
              <span className="block text-[11px] text-fg-muted">
                Ensures everyone holding this role receives these exact permissions right away.
              </span>
            </span>
          </label>
        )}

        <div>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-fg">
              Role Permissions ({permissions.length} selected)
            </span>
          </div>
          <RolePermissionsEditor permissions={permissions} onChange={setPermissions} />
        </div>
      </div>
    </Dialog>
  );
}

function AddDialog({
  open,
  onClose,
  roles,
  initialRoleKey = 'DESK',
}: {
  open: boolean;
  onClose: () => void;
  roles: RoleDefinitionDTO[];
  initialRoleKey?: string;
}) {
  const qc = useQueryClient();
  const router = useRouter();
  const [f, setF] = useState({
    name: '',
    jobTitle: '',
    phone: '',
    email: '',
    selectedRoleKey: initialRoleKey,
    canSignIn: true,
    credentialMode: 'password' as 'password' | 'invite',
    password: generateStrongPassword(),
    sendCredentials: true,
  });
  const [showPw, setShowPw] = useState(true);
  const [link, setLink] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setF((prev) => ({ ...prev, selectedRoleKey: initialRoleKey }));
    }
  }, [open, initialRoleKey]);

  const selectedDef = roles.find((r) => r.key === f.selectedRoleKey);
  const isCustom = selectedDef ? !selectedDef.isSystem : false;
  const resolvedBaseRole: Role = selectedDef
    ? selectedDef.baseRole
    : (ROLES.includes(f.selectedRoleKey as Role) ? (f.selectedRoleKey as Role) : 'DESK');

  const m = useMutation({
    mutationFn: () =>
      post<{ user: UserDTO; inviteUrl?: string; credentialsEmailed?: boolean }>('/users', {
        name: f.name,
        jobTitle: f.jobTitle || undefined,
        phone: f.phone || undefined,
        email: f.email || undefined,
        role: resolvedBaseRole,
        customRoleKey: isCustom ? f.selectedRoleKey : null,
        canSignIn: f.canSignIn,
        password: f.canSignIn && f.credentialMode === 'password' ? f.password : undefined,
        sendCredentials: f.canSignIn && f.credentialMode === 'password' ? f.sendCredentials : true,
      }),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['users'] });
      qc.invalidateQueries({ queryKey: ['user-roles'] });
      if (!f.canSignIn) {
        toast.success(`${f.name} added to staff directory`);
      } else if (f.credentialMode === 'password') {
        toast.success(
          r.credentialsEmailed
            ? `Account active & credentials emailed to ${f.email}`
            : `Account active with password set`,
        );
      } else {
        toast.success(`Invitation sent to ${f.email}`);
      }
      if (r.inviteUrl) setLink(r.inviteUrl);
      else {
        close();
        router.push(`/settings/users/${r.user.id}`);
      }
    },
    onError: (e) =>
      toast.error(
        e instanceof ApiError
          ? (e.errors[0]?.message ?? e.message)
          : 'Could not add staff member',
      ),
  });

  const close = () => {
    setF({
      name: '',
      jobTitle: '',
      phone: '',
      email: '',
      selectedRoleKey: 'DESK',
      canSignIn: true,
      credentialMode: 'password',
      password: generateStrongPassword(),
      sendCredentials: true,
    });
    setLink(null);
    onClose();
  };

  const passwordValid = !f.canSignIn || f.credentialMode === 'invite' || f.password.length >= 12;

  return (
    <Dialog
      open={open}
      onClose={close}
      title="Add Staff Member"
      description="Create a staff profile, assign a built-in or custom hotel role, and set or email their official @reberonhotel.com credentials."
      footer={
        link ? (
          <Button onClick={close}>Done</Button>
        ) : (
          <>
            <Button variant="ghost" onClick={close}>
              Cancel
            </Button>
            <Button
              variant="primary"
              loading={m.isPending}
              disabled={f.name.trim().length < 2 || (f.canSignIn && !f.email) || !passwordValid}
              onClick={() => m.mutate()}
            >
              {!f.canSignIn
                ? 'Add Staff Record'
                : f.credentialMode === 'password'
                  ? f.sendCredentials
                    ? 'Create & Email Credentials'
                    : 'Create with Password'
                  : 'Add & Send Invite Link'}
            </Button>
          </>
        )
      }
    >
      {link ? (
        <div className="grid gap-3 text-xs">
          <p>
            Invitation dispatched from <b>alerts@reberonhotel.com</b>. Direct link:
          </p>
          <button
            type="button"
            className="flex items-center gap-2 break-all rounded-lg bg-surface-2 px-3 py-2 text-left font-mono text-xs"
            onClick={() => {
              navigator.clipboard.writeText(link);
              toast.success('Copied');
            }}
          >
            <Copy className="size-3.5 shrink-0" /> {link}
          </button>
        </div>
      ) : (
        <div className="grid gap-3.5">
          <div className="grid gap-3 sm:grid-cols-2">
            <TextInput
              label="Full Name"
              required
              value={f.name}
              onChange={(e) => setF({ ...f, name: e.target.value })}
              placeholder="e.g. Mercy Chekwoti"
            />
            <TextInput
              label="Job Title"
              value={f.jobTitle}
              onChange={(e) => setF({ ...f, jobTitle: e.target.value })}
              placeholder="HR Manager, Receptionist, Head Chef…"
            />
            <TextInput
              label="Phone"
              value={f.phone}
              onChange={(e) => setF({ ...f, phone: e.target.value })}
              placeholder="+256 700 000 000"
            />
            <SelectInput
              label="Role (Preset)"
              value={f.selectedRoleKey}
              onChange={(e) => setF({ ...f, selectedRoleKey: e.target.value })}
            >
              {roles.length > 0 ? (
                <>
                  <optgroup label="Built-In Hotel Roles">
                    {roles
                      .filter((r) => r.isSystem)
                      .map((r) => (
                        <option key={r.key} value={r.key}>
                          {r.name}
                        </option>
                      ))}
                  </optgroup>
                  {roles.some((r) => !r.isSystem) && (
                    <optgroup label="Custom Hotel Roles">
                      {roles
                        .filter((r) => !r.isSystem)
                        .map((r) => (
                          <option key={r.key} value={r.key}>
                            {r.name} (Custom)
                          </option>
                        ))}
                    </optgroup>
                  )}
                </>
              ) : (
                ROLES.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABEL[r]}
                  </option>
                ))
              )}
            </SelectInput>
          </div>
          <p className="-mt-1 text-xs text-fg-muted">
            {selectedDef?.description || ROLE_DESCRIPTIONS[resolvedBaseRole]}
          </p>

          <Switch
            label="Signs in to the House"
            hint={
              f.canSignIn
                ? 'Grants portal login access with an official email and password.'
                : 'Staff record only (can be assigned housekeeping tasks & shifts without a login).'
            }
            checked={f.canSignIn}
            onChange={(v) => setF({ ...f, canSignIn: v })}
          />

          <TextInput
            label={f.canSignIn ? 'Official Email (Sign-In ID)' : 'Email (Optional)'}
            type="email"
            required={f.canSignIn}
            placeholder="name@reberonhotel.com"
            value={f.email}
            onChange={(e) => setF({ ...f, email: e.target.value })}
          />

          {f.canSignIn && (
            <div className="grid gap-3 rounded-xl border border-line bg-surface-2/40 p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold">Password & Credential Setup</span>
                <div className="flex rounded-lg border border-line bg-surface p-0.5 text-[11px]">
                  <button
                    type="button"
                    onClick={() => setF({ ...f, credentialMode: 'password' })}
                    className={cn(
                      'rounded-md px-2 py-0.5 font-medium transition',
                      f.credentialMode === 'password'
                        ? 'bg-fg text-bg'
                        : 'text-fg-muted hover:text-fg',
                    )}
                  >
                    Set Password Now
                  </button>
                  <button
                    type="button"
                    onClick={() => setF({ ...f, credentialMode: 'invite' })}
                    className={cn(
                      'rounded-md px-2 py-0.5 font-medium transition',
                      f.credentialMode === 'invite'
                        ? 'bg-fg text-bg'
                        : 'text-fg-muted hover:text-fg',
                    )}
                  >
                    Send Invite Link
                  </button>
                </div>
              </div>

              {f.credentialMode === 'password' ? (
                <>
                  <div>
                    <div className="mb-1 flex items-center justify-between text-xs">
                      <span className="font-medium text-fg">Initial Password (min 12 chars)</span>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setF({ ...f, password: generateStrongPassword() })}
                          className="inline-flex items-center gap-1 text-[11px] font-semibold text-brand hover:underline"
                        >
                          <Sparkles className="size-3" /> Generate
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            navigator.clipboard.writeText(f.password);
                            toast.success('Password copied');
                          }}
                          className="inline-flex items-center gap-1 text-[11px] font-medium text-fg-muted hover:text-fg"
                        >
                          <Copy className="size-3" /> Copy
                        </button>
                      </div>
                    </div>
                    <div className="relative">
                      <input
                        type={showPw ? 'text' : 'password'}
                        value={f.password}
                        onChange={(e) => setF({ ...f, password: e.target.value })}
                        className="input pr-9 font-mono text-xs"
                        placeholder="At least 12 characters"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPw((v) => !v)}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-fg-subtle hover:text-fg"
                        aria-label={showPw ? 'Hide password' : 'Show password'}
                      >
                        {showPw ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                      </button>
                    </div>
                  </div>

                  <label className="flex cursor-pointer items-start gap-2.5 text-xs">
                    <input
                      type="checkbox"
                      checked={f.sendCredentials}
                      onChange={(e) => setF({ ...f, sendCredentials: e.target.checked })}
                      className="mt-0.5 size-4 rounded border-line accent-brand"
                    />
                    <span>
                      <span className="font-semibold text-fg">
                        Send login credentials to their official email
                      </span>
                      <span className="block text-[11px] text-fg-muted">
                        Emails their login URL, official email, and password via{' '}
                        <b>alerts@reberonhotel.com</b>. They can change or reset their password
                        anytime after signing in.
                      </span>
                    </span>
                  </label>
                </>
              ) : (
                <p className="flex items-center gap-1.5 text-xs text-fg-muted">
                  <Mail className="size-3.5 shrink-0" /> Sends a 7-day setup link from{' '}
                  <b>alerts@reberonhotel.com</b> so they choose their own password.
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </Dialog>
  );
}
