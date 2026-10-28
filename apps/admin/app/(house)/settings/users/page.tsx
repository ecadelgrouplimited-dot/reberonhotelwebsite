'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Clock, Copy, Eye, EyeOff, KeyRound, Lock, Mail, Search, Sparkles, Trash2, UserPlus, UserRound } from 'lucide-react';
import { ROLES, ROLE_DESCRIPTIONS, ROLE_PERMISSIONS, type Role, type UserDTO } from '@reberon/contracts';
import { ApiError, del, get, post } from '@/lib/api';
import { ago } from '@/lib/format';
import { cn } from '@/lib/cn';
import { useMe } from '@/lib/providers';
import { Button } from '@/components/ui/button';
import { Empty, PageHeader, Pill, Skeleton } from '@/components/ui/bits';
import { Dialog } from '@/components/ui/dialog';
import { DeleteConfirmDialog } from '@/components/ui/delete-dialog';
import { SelectInput, Switch, TextInput } from '@/components/ui/field';
import { ROLE_LABEL } from '@/components/people/access-matrix';

function accessSummary(u: UserDTO) {
  const preset = ROLE_PERMISSIONS[u.role];
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

export default function PeoplePage() {
  const router = useRouter();
  const qc = useQueryClient();
  const me = useMe();
  const isOwner = me.role === 'OWNER';
  const { data, isLoading } = useQuery({ queryKey: ['users'], queryFn: () => get<UserDTO[]>('/users') });
  const [tab, setTab] = useState('all');
  const [q, setQ] = useState('');
  const [adding, setAdding] = useState(false);
  const [deletingUser, setDeletingUser] = useState<UserDTO | null>(null);

  const deleteMutation = useMutation({
    mutationFn: (id: string) => del(`/users/${id}`),
    onSuccess: () => {
      toast.success('Staff account permanently deleted');
      qc.invalidateQueries({ queryKey: ['users'] });
      setDeletingUser(null);
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : 'Could not delete staff member');
    },
  });

  const allUsers = data ?? [];
  const counts = {
    all: allUsers.filter((u) => u.status !== 'DISABLED').length,
    signin: allUsers.filter((u) => u.canSignIn && u.status !== 'DISABLED').length,
    records: allUsers.filter((u) => !u.canSignIn && u.status !== 'DISABLED').length,
    off: allUsers.filter((u) => u.status === 'DISABLED').length,
  };

  const term = q.trim().toLowerCase();
  const rows = allUsers.filter((u) => {
    if (tab === 'signin' && (!u.canSignIn || u.status === 'DISABLED')) return false;
    if (tab === 'records' && (u.canSignIn || u.status === 'DISABLED')) return false;
    if (tab === 'off' && u.status !== 'DISABLED') return false;
    if (tab === 'all' && u.status === 'DISABLED') return false;
    if (term) {
      const hay = `${u.name} ${u.email ?? ''} ${u.phone ?? ''} ${u.jobTitle ?? ''} ${ROLE_LABEL[u.role]}`.toLowerCase();
      if (!hay.includes(term)) return false;
    }
    return true;
  });

  return (
    <div className="fade-in">
      <PageHeader
        title="People & Access"
        description="Staff directory, role permissions, password management, and credential dispatch via alerts@reberonhotel.com"
        actions={<Button size="sm" variant="primary" icon={<UserPlus className="size-3.5" />} onClick={() => setAdding(true)}>Add Staff Member</Button>}
      />

      {/* Compact 4-KPI Strip */}
      <div className="mb-4 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        {([
          { k: 'all', label: 'Active Staff', count: counts.all, cls: 'text-fg' },
          { k: 'signin', label: 'Sign-In Enabled', count: counts.signin, cls: 'text-success' },
          { k: 'records', label: 'Staff Records (No Login)', count: counts.records, cls: 'text-info' },
          { k: 'off', label: 'Disabled / Off', count: counts.off, cls: 'text-fg-muted' },
        ] as const).map((item) => (
          <button
            key={item.k}
            type="button"
            onClick={() => setTab(item.k)}
            className={cn(
              'card flex flex-col items-start justify-between p-3 text-left transition',
              tab === item.k ? '!border-fg ring-1 ring-fg bg-surface-2/40' : 'hover:border-line-strong',
            )}
          >
            <span className="text-[11px] font-semibold uppercase tracking-wider text-fg-subtle">{item.label}</span>
            <span className={cn('mt-1 text-lg font-bold leading-none tabular', item.cls)}>{item.count}</span>
          </button>
        ))}
      </div>

      <div className="card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-surface-2/40 px-3 py-2">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex rounded-lg border border-line bg-surface p-0.5 text-[11px]">
              {([
                ['all', `Active (${counts.all})`],
                ['signin', `Sign-In (${counts.signin})`],
                ['records', `No Login (${counts.records})`],
                ['off', `Disabled (${counts.off})`],
              ] as const).map(([v, l]) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setTab(v)}
                  className={cn('rounded-md px-2.5 py-1 font-medium transition', tab === v ? 'bg-fg text-bg' : 'text-fg-muted hover:text-fg')}
                >
                  {l}
                </button>
              ))}
            </div>
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
          <span className="text-[11px] font-medium text-fg-muted">{rows.length} person{rows.length === 1 ? '' : 's'}</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-line bg-surface-2/50 text-[11px] font-semibold uppercase tracking-wider text-fg-subtle">
              <tr>
                <th className="px-3 py-2">Person</th>
                <th className="px-3 py-2">Official Email / Phone</th>
                <th className="px-3 py-2">Role</th>
                <th className="px-3 py-2">Access & Credentials</th>
                <th className="px-3 py-2">Last Sign-In</th>
                <th className="px-3 py-2 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {isLoading && Array.from({ length: 6 }, (_, i) => <tr key={i}><td colSpan={6} className="px-3 py-2.5"><Skeleton className="h-5" /></td></tr>)}
              {rows.map((u) => {
                const s = accessSummary(u);
                const expired = u.accessExpiresAt && new Date(u.accessExpiresAt) < new Date();
                return (
                  <tr key={u.id} className={cn('cursor-pointer hover:bg-surface-2/40 transition-colors', u.status === 'DISABLED' && 'opacity-55')} onClick={() => router.push(`/settings/users/${u.id}`)}>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <span className="grid size-7 shrink-0 place-items-center rounded-full bg-surface-2 text-[10.5px] font-bold">
                          {u.name.split(' ').map((x) => x[0]).slice(0, 2).join('')}
                        </span>
                        <div>
                          <p className="font-semibold text-fg">{u.name}</p>
                          {u.jobTitle && <p className="text-[11px] text-fg-muted">{u.jobTitle}</p>}
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      {u.email ? <span className="font-mono text-fg">{u.email}</span> : <span className="text-fg-subtle">—</span>}
                      {u.phone && <span className="block text-[11px] text-fg-muted">{u.phone}</span>}
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap font-medium">{ROLE_LABEL[u.role]}</td>
                    <td className="px-3 py-2.5">
                      <span className="flex flex-wrap gap-1">
                        {u.status === 'DISABLED' ? (
                          <Pill>Switched off</Pill>
                        ) : !u.canSignIn ? (
                          <Pill><UserRound className="size-3" /> Staff record only</Pill>
                        ) : u.status === 'INVITED' ? (
                          <Pill tone="blue">Invited (Pending)</Pill>
                        ) : (
                          <Pill tone="green" dot>Signs in</Pill>
                        )}
                        {u.canSignIn && u.hasPassword && <Pill><KeyRound className="size-2.5" /> Password set</Pill>}
                        {u.role !== 'OWNER' && (s.added > 0 || s.removed > 0) && (
                          <Pill tone="amber">{s.added ? `+${s.added}` : ''}{s.added && s.removed ? ' ' : ''}{s.removed ? `−${s.removed}` : ''}</Pill>
                        )}
                        {u.signInFrom && <Pill><Clock className="size-2.5" /> {u.signInFrom}–{u.signInUntil}</Pill>}
                        {u.accessExpiresAt && (
                          <Pill tone={expired ? 'red' : 'neutral'}>
                            <Lock className="size-2.5" /> {expired ? 'Ended' : 'Until'} {new Date(u.accessExpiresAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                          </Pill>
                        )}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap text-fg-muted">
                      {u.canSignIn ? (u.lastLoginAt ? ago(u.lastLoginAt) : 'Never') : '—'}
                    </td>
                    <td className="px-3 py-2.5 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-1.5">
                        <Link href={`/settings/users/${u.id}`} className="inline-flex items-center gap-1 rounded-md border border-line px-2 py-1 text-[11px] font-medium hover:bg-surface-2">
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

      <AddDialog open={adding} onClose={() => setAdding(false)} />

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

function AddDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const router = useRouter();
  const [f, setF] = useState({
    name: '',
    jobTitle: '',
    phone: '',
    email: '',
    role: 'DESK' as Role,
    canSignIn: true,
    credentialMode: 'password' as 'password' | 'invite',
    password: generateStrongPassword(),
    sendCredentials: true,
  });
  const [showPw, setShowPw] = useState(true);
  const [link, setLink] = useState<string | null>(null);

  const m = useMutation({
    mutationFn: () =>
      post<{ user: UserDTO; inviteUrl?: string; credentialsEmailed?: boolean }>('/users', {
        name: f.name,
        jobTitle: f.jobTitle || undefined,
        phone: f.phone || undefined,
        email: f.email || undefined,
        role: f.role,
        canSignIn: f.canSignIn,
        password: f.canSignIn && f.credentialMode === 'password' ? f.password : undefined,
        sendCredentials: f.canSignIn && f.credentialMode === 'password' ? f.sendCredentials : true,
      }),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['users'] });
      if (!f.canSignIn) {
        toast.success(`${f.name} added to staff directory`);
      } else if (f.credentialMode === 'password') {
        toast.success(r.credentialsEmailed ? `Account active & credentials emailed to ${f.email}` : `Account active with password set`);
      } else {
        toast.success(`Invitation sent to ${f.email}`);
      }
      if (r.inviteUrl) setLink(r.inviteUrl);
      else { close(); router.push(`/settings/users/${r.user.id}`); }
    },
    onError: (e) => toast.error(e instanceof ApiError ? (e.errors[0]?.message ?? e.message) : 'Could not add staff member'),
  });

  const close = () => {
    setF({
      name: '',
      jobTitle: '',
      phone: '',
      email: '',
      role: 'DESK',
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
      description="Create a staff profile, assign role permissions, and set or email their official @reberonhotel.com credentials."
      footer={
        link ? (
          <Button onClick={close}>Done</Button>
        ) : (
          <>
            <Button variant="ghost" onClick={close}>Cancel</Button>
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
          <p>Invitation dispatched from <b>alerts@reberonhotel.com</b>. Direct link:</p>
          <button
            type="button"
            className="flex items-center gap-2 break-all rounded-lg bg-surface-2 px-3 py-2 text-left font-mono text-xs"
            onClick={() => { navigator.clipboard.writeText(link); toast.success('Copied'); }}
          >
            <Copy className="size-3.5 shrink-0" /> {link}
          </button>
        </div>
      ) : (
        <div className="grid gap-3.5">
          <div className="grid gap-3 sm:grid-cols-2">
            <TextInput label="Full Name" required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="e.g. Brian Cheptoek" />
            <TextInput label="Job Title" value={f.jobTitle} onChange={(e) => setF({ ...f, jobTitle: e.target.value })} placeholder="Receptionist, Bar Attendant, Chef…" />
            <TextInput label="Phone" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} placeholder="+256 700 000 000" />
            <SelectInput label="Role (Starting Preset)" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value as Role })}>
              {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
            </SelectInput>
          </div>
          <p className="-mt-1 text-xs text-fg-muted">{ROLE_DESCRIPTIONS[f.role]}</p>

          <Switch
            label="Signs in to the House"
            hint={f.canSignIn ? 'Grants portal login access with an official email and password.' : 'Staff record only (can be assigned housekeeping tasks & shifts without a login).'}
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
                    className={cn('rounded-md px-2 py-0.5 font-medium transition', f.credentialMode === 'password' ? 'bg-fg text-bg' : 'text-fg-muted hover:text-fg')}
                  >
                    Set Password Now
                  </button>
                  <button
                    type="button"
                    onClick={() => setF({ ...f, credentialMode: 'invite' })}
                    className={cn('rounded-md px-2 py-0.5 font-medium transition', f.credentialMode === 'invite' ? 'bg-fg text-bg' : 'text-fg-muted hover:text-fg')}
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
                          onClick={() => { navigator.clipboard.writeText(f.password); toast.success('Password copied'); }}
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
                      <span className="font-semibold text-fg">Send login credentials to their official email</span>
                      <span className="block text-[11px] text-fg-muted">
                        Emails their login URL, official email, and password via <b>alerts@reberonhotel.com</b>. They can change or reset their password anytime after signing in.
                      </span>
                    </span>
                  </label>
                </>
              ) : (
                <p className="flex items-center gap-1.5 text-xs text-fg-muted">
                  <Mail className="size-3.5 shrink-0" /> Sends a 7-day setup link from <b>alerts@reberonhotel.com</b> so they choose their own password.
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </Dialog>
  );
}
