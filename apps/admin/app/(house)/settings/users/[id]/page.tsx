'use client';
import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Copy, Eye, EyeOff, KeyRound, LogOut, Mail, MonitorSmartphone, Send, ShieldCheck, Sparkles, Trash2 } from 'lucide-react';
import { ROLES, ROLE_DESCRIPTIONS, type Role, type SessionDTO, type UserDTO } from '@reberon/contracts';
import { ApiError, del, get, patch, post } from '@/lib/api';
import { useMe } from '@/lib/providers';
import { ago, dateTime } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { PageHeader, Pill, Section, Skeleton } from '@/components/ui/bits';
import { SelectInput, Switch, TextInput } from '@/components/ui/field';
import { useConfirm } from '@/components/ui/confirm';
import { DeleteConfirmDialog } from '@/components/ui/delete-dialog';
import { AccessMatrix, ROLE_LABEL } from '@/components/people/access-matrix';

type Form = {
  name: string;
  jobTitle: string;
  phone: string;
  email: string;
  role: Role;
  canSignIn: boolean;
  hours: boolean;
  signInFrom: string;
  signInUntil: string;
  expires: string;
  grants: string[];
  revokes: string[];
};

const toForm = (u: UserDTO): Form => ({
  name: u.name,
  jobTitle: u.jobTitle ?? '',
  phone: u.phone ?? '',
  email: u.email ?? '',
  role: u.role,
  canSignIn: u.canSignIn,
  hours: !!u.signInFrom,
  signInFrom: u.signInFrom ?? '07:00',
  signInUntil: u.signInUntil ?? '19:00',
  expires: u.accessExpiresAt ? u.accessExpiresAt.slice(0, 10) : '',
  grants: u.grants,
  revokes: u.revokes,
});

function generateStrongPassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  let suffix = '';
  for (let i = 0; i < 6; i++) suffix += chars[Math.floor(Math.random() * chars.length)];
  return `Reberon#${suffix}!26`;
}

export default function PersonPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const qc = useQueryClient();
  const me = useMe();
  const isOwner = me.role === 'OWNER';
  const confirm = useConfirm();
  const { data: u } = useQuery({ queryKey: ['user', id], queryFn: () => get<UserDTO>(`/users/${id}`) });
  const sessions = useQuery({ queryKey: ['user-sessions', id], queryFn: () => get<SessionDTO[]>(`/users/${id}/sessions`), enabled: !!u?.canSignIn });
  const [f, setF] = useState<Form | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [showPw, setShowPw] = useState(true);
  const [sendCredsEmail, setSendCredsEmail] = useState(true);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  useEffect(() => { if (u) setF(toForm(u)); }, [u]);
  const self = id === me.id;

  const deleteAccount = useMutation({
    mutationFn: () => del(`/users/${id}`),
    onSuccess: () => {
      toast.success('Staff account permanently deleted');
      qc.invalidateQueries({ queryKey: ['users'] });
      router.replace('/settings/users');
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : 'Could not delete staff member');
    },
  });

  const save = useMutation({
    mutationFn: () => {
      const body: Record<string, unknown> = {
        name: f!.name,
        jobTitle: f!.jobTitle || null,
        phone: f!.phone || null,
        email: f!.email || null,
      };
      if (!self) {
        Object.assign(body, {
          role: f!.role,
          canSignIn: f!.canSignIn,
          grants: f!.grants,
          revokes: f!.revokes,
          signInFrom: f!.hours ? f!.signInFrom : null,
          signInUntil: f!.hours ? f!.signInUntil : null,
          accessExpiresAt: f!.expires ? new Date(`${f!.expires}T23:59:00+03:00`).toISOString() : null,
        });
      }
      if (newPassword.trim().length >= 12) {
        body.password = newPassword.trim();
        body.sendCredentials = sendCredsEmail;
      }
      return patch<UserDTO>(`/users/${id}`, body);
    },
    onSuccess: (d) => {
      qc.setQueryData(['user', id], d);
      qc.invalidateQueries({ queryKey: ['users'] });
      qc.invalidateQueries({ queryKey: ['user-sessions', id] });
      if (newPassword.trim().length >= 12) {
        setNewPassword('');
        toast.success(sendCredsEmail && d.email ? `Saved changes & emailed credentials to ${d.email}` : 'Saved changes & updated password');
      } else {
        toast.success('Saved — changes apply immediately');
      }
    },
    onError: (e) => toast.error(e instanceof ApiError ? (e.errors[0]?.message ?? e.message) : 'Could not save'),
  });

  const setPasswordMut = useMutation({
    mutationFn: async () => {
      // If email was edited in the form but not yet saved, save email first so credentials go to the right address
      if (f && f.email !== (u?.email ?? '')) {
        await patch<UserDTO>(`/users/${id}`, { email: f.email || null, canSignIn: true });
      }
      return post<{ user: UserDTO; emailed: boolean }>(`/users/${id}/password`, {
        password: newPassword.trim(),
        sendCredentials: sendCredsEmail,
      });
    },
    onSuccess: (r) => {
      qc.setQueryData(['user', id], r.user);
      qc.invalidateQueries({ queryKey: ['users'] });
      setNewPassword('');
      toast.success(
        r.emailed
          ? `Password updated & login credentials sent to ${r.user.email} (via alerts@reberonhotel.com)`
          : `Password updated for ${r.user.name}`,
      );
    },
    onError: (e) => toast.error(e instanceof ApiError ? (e.errors[0]?.message ?? e.message) : 'Could not set password'),
  });

  const setStatus = useMutation({
    mutationFn: (status: 'ACTIVE' | 'DISABLED') => patch<UserDTO>(`/users/${id}`, { status }),
    onSuccess: (d) => {
      qc.setQueryData(['user', id], d);
      qc.invalidateQueries({ queryKey: ['users'] });
      toast.success(d.status === 'DISABLED' ? 'Account disabled and signed out' : 'Account re-enabled');
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Could not change status'),
  });

  const invite = useMutation({
    mutationFn: () => post<{ inviteUrl?: string }>(`/users/${id}/invite`),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['user', id] });
      toast.success('Invitation link sent', r.inviteUrl ? { description: r.inviteUrl, duration: 15000 } : undefined);
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Could not send invite'),
  });

  const signOut = useMutation({
    mutationFn: () => post<{ ended: number }>(`/users/${id}/sign-out`),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['user-sessions', id] });
      toast.success(`Signed out on ${r.ended} device${r.ended === 1 ? '' : 's'}`);
    },
  });

  if (!u || !f) return <Skeleton className="h-96" />;
  const dirty = JSON.stringify(f) !== JSON.stringify(toForm(u)) || newPassword.trim().length >= 12;
  const set = (p: Partial<Form>) => setF({ ...f, ...p });

  return (
    <div className="fade-in">
      <PageHeader
        crumbs={[{ label: 'People & Access', href: '/settings/users' }, { label: u.name }]}
        title={
          <span className="flex flex-wrap items-center gap-2">
            {u.name}
            {u.status === 'DISABLED' ? (
              <Pill>Switched off</Pill>
            ) : !u.canSignIn ? (
              <Pill>No sign-in</Pill>
            ) : u.status === 'INVITED' ? (
              <Pill tone="blue">Invited</Pill>
            ) : (
              <Pill tone="green" dot>Signs in</Pill>
            )}
            {u.canSignIn && u.hasPassword && <Pill><KeyRound className="size-2.5" /> Password set</Pill>}
          </span>
        }
        description={[u.jobTitle, ROLE_LABEL[u.role], u.email, u.canSignIn ? (u.lastLoginAt ? `last in ${ago(u.lastLoginAt)}` : 'never signed in') : null].filter(Boolean).join(' · ')}
        actions={
          <>
            {!self && (
              u.status === 'DISABLED' ? (
                <Button size="sm" onClick={() => setStatus.mutate('ACTIVE')}>Switch Back On</Button>
              ) : (
                <Button
                  size="sm"
                  variant="danger"
                  onClick={async () => {
                    if (await confirm({ title: `Disable ${u.name}?`, body: 'They are signed out immediately and cannot sign in until re-enabled.', confirm: 'Switch off', danger: true })) {
                      setStatus.mutate('DISABLED');
                    }
                  }}
                >
                  Switch Off
                </Button>
              )
            )}
            <Button size="sm" variant="primary" loading={save.isPending} disabled={!dirty} onClick={() => save.mutate()}>
              Save Changes
            </Button>
          </>
        }
      />

      {self && (
        <p className="mb-4 flex items-center gap-2 rounded-lg bg-surface-2 px-3 py-2 text-xs">
          <ShieldCheck className="size-3.5" /> This is your account. Another owner must change your role or access permissions, but you can update your details and password below.
        </p>
      )}

      <div className="grid items-start gap-4 xl:grid-cols-[1fr_24rem]">
        <Section title="Role & Granular Permissions" description="Select a starting role preset or toggle individual permissions for this user.">
          <div className="mb-4 max-w-sm">
            <SelectInput label="Role Preset" value={f.role} disabled={self} onChange={(e) => set({ role: e.target.value as Role, grants: [], revokes: [] })}>
              {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
            </SelectInput>
            <p className="mt-1 text-xs text-fg-muted">
              {ROLE_DESCRIPTIONS[f.role]}
              {f.role !== u.role ? ' Changing the role resets custom permission overrides.' : ''}
            </p>
          </div>
          <AccessMatrix role={f.role} grants={f.grants} revokes={f.revokes} disabled={self} onChange={(n) => set(n)} />
        </Section>

        <aside className="grid gap-4 xl:sticky xl:top-16">
          {/* Password & Credentials Management Card */}
          <div className="card grid gap-3 p-4">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <KeyRound className="size-3.5 text-brand" />
                <p className="text-xs font-semibold uppercase tracking-wider text-fg">Password & Credentials</p>
              </div>
              {u.hasPassword ? <Pill tone="green">Active</Pill> : <Pill tone="amber">Not Set</Pill>}
            </div>

            <p className="text-[11.5px] text-fg-muted">
              Set or change {self ? 'your' : `${u.name.split(' ')[0]}’s`} sign-in password directly. They can reset or change it anytime after logging in.
            </p>

            <div>
              <div className="mb-1 flex items-center justify-between text-xs">
                <span className="font-medium text-fg">New Password (min 12 chars)</span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      const generated = generateStrongPassword();
                      setNewPassword(generated);
                      if (!f.canSignIn && !self) set({ canSignIn: true });
                    }}
                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-brand hover:underline"
                  >
                    <Sparkles className="size-3" /> Generate
                  </button>
                  {newPassword && (
                    <button
                      type="button"
                      onClick={() => { navigator.clipboard.writeText(newPassword); toast.success('Password copied'); }}
                      className="inline-flex items-center gap-1 text-[11px] font-medium text-fg-muted hover:text-fg"
                    >
                      <Copy className="size-3" /> Copy
                    </button>
                  )}
                </div>
              </div>
              <div className="relative">
                <input
                  type={showPw ? 'text' : 'password'}
                  value={newPassword}
                  onChange={(e) => {
                    setNewPassword(e.target.value);
                    if (e.target.value && !f.canSignIn && !self) set({ canSignIn: true });
                  }}
                  placeholder="Enter or generate 12+ char password..."
                  className="input pr-9 font-mono text-xs"
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

            <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-line bg-surface-2/40 p-2.5 text-xs">
              <input
                type="checkbox"
                checked={sendCredsEmail}
                onChange={(e) => setSendCredsEmail(e.target.checked)}
                className="mt-0.5 size-3.5 rounded border-line accent-brand"
              />
              <span>
                <span className="font-semibold text-fg">Send credentials to official email</span>
                <span className="block text-[11px] text-fg-muted">
                  Emails <b className="font-mono text-fg">{f.email || 'their email'}</b> from <b className="font-mono">alerts@reberonhotel.com</b> with their sign-in URL and password.
                </span>
              </span>
            </label>

            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="primary"
                className="flex-1"
                icon={<Send className="size-3.5" />}
                loading={setPasswordMut.isPending}
                disabled={newPassword.trim().length < 12 || (sendCredsEmail && !f.email.trim())}
                onClick={() => setPasswordMut.mutate()}
              >
                {sendCredsEmail ? 'Set Password & Email Credentials' : 'Update Password Only'}
              </Button>
              {u.email && (u.status === 'INVITED' || !u.hasPassword) && (
                <Button size="sm" icon={<Mail className="size-3.5" />} loading={invite.isPending} onClick={() => invite.mutate()}>
                  Send Invite Link
                </Button>
              )}
            </div>
          </div>

          {/* Sign-In Rules Card */}
          <div className="card grid gap-3.5 p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-fg">Sign-In Rules & Schedule</p>
            <Switch
              label="Signs in to the House"
              hint={f.canSignIn ? 'Can sign in with official email & password.' : 'Staff record only (no portal login).'}
              checked={f.canSignIn}
              disabled={self}
              onChange={(v) => set({ canSignIn: v })}
            />
            {f.canSignIn && (
              <>
                <Switch
                  label="Restrict to shift hours"
                  hint="Kampala time (EAT). Owners are never restricted."
                  checked={f.hours}
                  disabled={self || u.role === 'OWNER'}
                  onChange={(v) => set({ hours: v })}
                />
                {f.hours && (
                  <div className="grid grid-cols-2 gap-2.5">
                    <TextInput label="From" type="time" value={f.signInFrom} disabled={self} onChange={(e) => set({ signInFrom: e.target.value })} />
                    <TextInput label="Until" type="time" value={f.signInUntil} disabled={self} onChange={(e) => set({ signInUntil: e.target.value })} hint={f.signInUntil < f.signInFrom ? 'Runs past midnight' : undefined} />
                  </div>
                )}
                <TextInput
                  label="Access expires on (optional)"
                  type="date"
                  value={f.expires}
                  disabled={self}
                  onChange={(e) => set({ expires: e.target.value })}
                  hint="For seasonal or relief staff."
                />
              </>
            )}
          </div>

          {/* Staff Details Card */}
          <div className="card grid gap-3 p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-fg">Staff Profile & Official Email</p>
            <TextInput label="Full Name" value={f.name} onChange={(e) => set({ name: e.target.value })} />
            <TextInput label="Job Title" value={f.jobTitle} onChange={(e) => set({ jobTitle: e.target.value })} />
            <TextInput label="Phone" value={f.phone} onChange={(e) => set({ phone: e.target.value })} />
            <TextInput
              label={f.canSignIn ? 'Official Email (Sign-In ID)' : 'Official Email'}
              type="email"
              placeholder="name@reberonhotel.com"
              value={f.email}
              onChange={(e) => set({ email: e.target.value })}
            />
          </div>

          {/* Active Sessions Card */}
          {u.canSignIn && (
            <div className="card grid gap-2.5 p-4 text-xs">
              <div className="flex items-center justify-between gap-2">
                <p className="font-semibold uppercase tracking-wider text-fg">Active Devices</p>
                {!!sessions.data?.length && (
                  <Button
                    size="sm"
                    variant="danger"
                    icon={<LogOut className="size-3" />}
                    loading={signOut.isPending}
                    onClick={async () => {
                      if (await confirm({ title: `Sign ${u.name} out everywhere?`, body: 'All active browser sessions for this user will be terminated immediately.', confirm: 'Sign out everywhere' })) {
                        signOut.mutate();
                      }
                    }}
                  >
                    Sign Out All
                  </Button>
                )}
              </div>
              {!sessions.data?.length ? (
                <p className="text-fg-muted">No active sessions.</p>
              ) : (
                <ul className="grid gap-2">
                  {sessions.data.map((s) => (
                    <li key={s.id} className="flex items-start gap-2">
                      <MonitorSmartphone className="mt-0.5 size-3.5 text-fg-subtle" />
                      <span>
                        <span className="block font-medium">{s.device}</span>
                        <span className="text-[11px] text-fg-muted">since {dateTime(s.createdAt)}{s.ip ? ` · ${s.ip}` : ''} · active {ago(s.lastUsedAt)}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              <Link href={`/settings/audit?q=${encodeURIComponent(u.name)}`} className="text-xs font-medium text-brand hover:underline">
                View user activity in Audit Log →
              </Link>
            </div>
          )}

          {/* Danger Zone: Only available to the Owner */}
          {isOwner && !self && (
            <div className="card rounded-2xl border border-red-200 dark:border-red-900/40 bg-red-50/20 p-4">
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-red-600 dark:text-red-400">
                  <Trash2 className="size-4" />
                  <p className="text-xs font-bold uppercase tracking-wider">Danger Zone</p>
                </div>
                <p className="text-xs text-fg-muted leading-relaxed">
                  Permanently delete this user account. This terminates access, invalidates all sessions, and soft-deletes the staff profile.
                </p>
                <Button
                  variant="danger"
                  size="sm"
                  icon={<Trash2 className="size-3.5" />}
                  loading={deleteAccount.isPending}
                  onClick={() => setDeleteConfirmOpen(true)}
                  className="w-full justify-center"
                >
                  Delete Account
                </Button>
              </div>
            </div>
          )}
        </aside>
      </div>

      {u && (
        <DeleteConfirmDialog
          open={deleteConfirmOpen}
          onClose={() => setDeleteConfirmOpen(false)}
          onConfirm={() => deleteAccount.mutate()}
          title={`Delete Staff Account · ${u.name}?`}
          itemName={u.name}
          itemType="Staff User Account"
          warning={`This will immediately terminate all active sessions for ${u.name} (${u.email || 'No email'}), revoke their House permissions, and mark their staff record as terminated.`}
          requireMatch="DELETE"
          loading={deleteAccount.isPending}
        />
      )}
    </div>
  );
}
