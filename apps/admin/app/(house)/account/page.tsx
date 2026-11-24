'use client';
import { useCallback, useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Grid3x3, KeyRound, Lock, Users } from 'lucide-react';
import { toast } from 'sonner';
import type { PinCheckDTO } from '@reberon/contracts';
import { PinSetter } from '@/components/forms/pin-setter';
import { useConfirm } from '@/components/ui/confirm';
import { ApiError, del, post, put } from '@/lib/api';
import { AUTOLOCK_CHOICES, lockShortcut, readAutoLock, writeAutoLock } from '@/components/os/lock-screen';
import { shellAction } from '@/components/os/actions';
import { Pill } from '@/components/ui/bits';
import { SelectInput } from '@/components/ui/field';
import { useCan, useMe } from '@/lib/providers';
import { Button } from '@/components/ui/button';
import { PageHeader, Section } from '@/components/ui/bits';
import { TextInput } from '@/components/ui/field';

export default function AccountPage() {
  const me = useMe();
  const can = useCan();
  const [f, setF] = useState({ currentPassword: '', newPassword: '', again: '' });
  const [err, setErr] = useState<Record<string, string>>({});
  const m = useMutation({
    mutationFn: () => post('/auth/password', { currentPassword: f.currentPassword, newPassword: f.newPassword }),
    onSuccess: () => {
      toast.success('Password updated');
      setF({ currentPassword: '', newPassword: '', again: '' });
      setErr({});
    },
    onError: (e) => {
      if (e instanceof ApiError) setErr(e.fieldErrors());
      toast.error(e instanceof ApiError ? e.message : 'Could not change password');
    },
  });

  return (
    <div className="fade-in grid max-w-lg gap-5">
      <PageHeader
        title="Your account"
        description={`${me.name} · ${me.email} · ${me.role.toLowerCase()}`}
        actions={
          can('users:manage') ? (
            <Button size="sm" href="/settings/users" variant="secondary" icon={<Users className="size-3.5" />}>
              People & Access
            </Button>
          ) : undefined
        }
      />

      <PinSection />
      <DeviceSection />

      <Section title="Change password" description="At least 12 characters. Other signed-in devices will be signed out.">
        <form
          className="grid gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (f.newPassword !== f.again) return setErr({ again: 'Passwords do not match' });
            m.mutate();
          }}
        >
          <TextInput
            label="Current password"
            type="password"
            autoComplete="current-password"
            value={f.currentPassword}
            onChange={(e) => setF({ ...f, currentPassword: e.target.value })}
            error={err.currentPassword}
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <TextInput
              label="New password"
              type="password"
              autoComplete="new-password"
              value={f.newPassword}
              onChange={(e) => setF({ ...f, newPassword: e.target.value })}
              error={err.newPassword}
            />
            <TextInput
              label="Repeat new password"
              type="password"
              autoComplete="new-password"
              value={f.again}
              onChange={(e) => setF({ ...f, again: e.target.value })}
              error={err.again}
            />
          </div>
          <Button type="submit" variant="primary" className="justify-self-start" icon={<KeyRound className="size-3.5" />} loading={m.isPending}>
            Change password
          </Button>
        </form>
      </Section>
    </div>
  );
}

/** Quick-switch PIN for shared terminals. */
function PinSection() {
  const me = useMe();
  const qc = useQueryClient();
  const confirm = useConfirm();
  const [editing, setEditing] = useState(false);
  const remove = useMutation({
    mutationFn: () => del('/auth/me/pin'),
    onSuccess: () => {
      toast.success('PIN removed — you will use your password on the lock screen');
      void qc.invalidateQueries({ queryKey: ['me'] });
    },
  });
  const check = useCallback((pin: string) => post<PinCheckDTO>('/auth/me/pin/check', { pin }), []);

  return (
    <Section
      title="Quick PIN"
      description="A 4-digit PIN of your own for the shared front-desk and bar computers: lock the screen when you step away, and come back — or hand over — without typing your full password. Your PIN belongs to your account, is yours alone, and only works on computers where you have signed in with your password. Some PINs are held back by the hotel — if one is not available, just pick another."
      actions={me.hasPin ? <Pill tone="green" dot>PIN set</Pill> : <Pill>No PIN yet</Pill>}
    >
      {editing ? (
        <PinSetter
          needPassword
          check={check}
          submitLabel={me.hasPin ? 'Change PIN' : 'Save PIN'}
          onCancel={() => setEditing(false)}
          onSubmit={async (pin, password) => {
            await put('/auth/me/pin', { pin, password });
            toast.success(me.hasPin ? 'PIN changed' : 'PIN saved', { description: 'On the lock screen, tap your name and type your 4 digits.' });
            setEditing(false);
            await qc.invalidateQueries({ queryKey: ['me'] });
          }}
        />
      ) : (
        <div className="grid gap-3">
          <div className="flex items-center gap-3 rounded-xl border border-line bg-surface-2/60 p-3">
            <span className={me.hasPin ? 'grid size-9 place-items-center rounded-full bg-emerald-500/15 text-emerald-600' : 'grid size-9 place-items-center rounded-full bg-surface-2 text-fg-subtle'}>
              <Grid3x3 className="size-4" />
            </span>
            <div className="text-[13px] leading-snug">
              <p className="font-semibold">{me.hasPin ? 'Your PIN is ready' : 'You have no PIN yet'}</p>
              <p className="text-fg-muted">
                {me.hasPin
                  ? `Set ${me.pinSetAt ? new Date(me.pinSetAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Africa/Kampala' }) : 'earlier'}. Forgot it? Choose a new one here, or tap “Forgot PIN?” on the lock screen for an email link.`
                  : 'Until you set one, the lock screen asks for your password.'}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant={me.hasPin ? 'secondary' : 'primary'} icon={<Grid3x3 className="size-3.5" />} onClick={() => setEditing(true)}>
              {me.hasPin ? 'Choose a new PIN' : 'Set your PIN'}
            </Button>
            {me.hasPin && (
              <Button
                variant="ghost"
                loading={remove.isPending}
                onClick={async () => {
                  if (await confirm({ title: 'Remove your PIN?', body: 'You will sign in with your password on the lock screen until you set a new PIN.', confirm: 'Remove PIN' })) remove.mutate();
                }}
              >
                Remove PIN
              </Button>
            )}
          </div>
        </div>
      )}
    </Section>
  );
}

/** Settings that belong to this computer or tablet, whoever is signed in. */
function DeviceSection() {
  const [min, setMin] = useState(0);
  useEffect(() => setMin(readAutoLock()), []);
  return (
    <Section title="This device" description="Applies to this computer or tablet for everyone who uses it — useful on the front desk and at the bar.">
      <div className="grid items-end gap-3 sm:grid-cols-[1fr_auto]">
        <SelectInput
          label="Lock the screen when nobody has touched it for"
          value={min}
          onChange={(e) => {
            const v = Number(e.target.value);
            setMin(v);
            writeAutoLock(v);
            toast.success(v ? `This device locks after ${v} minutes without use` : 'Auto-lock is off on this device');
          }}
        >
          {AUTOLOCK_CHOICES.map((m) => (
            <option key={m} value={m}>
              {m ? `${m} minutes` : 'Never (lock by hand)'}
            </option>
          ))}
        </SelectInput>
        <Button variant="secondary" icon={<Lock className="size-3.5" />} onClick={() => shellAction('lock')}>
          Lock now <span className="ml-1 text-[11px] text-fg-subtle">{lockShortcut()}</span>
        </Button>
      </div>
    </Section>
  );
}
