'use client';
import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Grid3x3, KeyRound, Lock, Users } from 'lucide-react';
import { toast } from 'sonner';
import { zPin } from '@reberon/contracts';
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
  const [f, setF] = useState({ pin: '', again: '', password: '' });
  const [err, setErr] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState(false);
  const save = useMutation({
    mutationFn: () => put('/auth/me/pin', { pin: f.pin, password: f.password }),
    onSuccess: () => {
      toast.success(me.hasPin ? 'PIN changed' : 'PIN set', { description: 'On devices you have signed in on, tap your name on the lock screen and enter it.' });
      setF({ pin: '', again: '', password: '' });
      setErr({});
      setEditing(false);
      void qc.invalidateQueries({ queryKey: ['me'] });
    },
    onError: (e) => {
      if (e instanceof ApiError) setErr(e.fieldErrors());
      toast.error(e instanceof ApiError ? e.message : 'Could not save the PIN');
    },
  });
  const remove = useMutation({
    mutationFn: () => del('/auth/me/pin'),
    onSuccess: () => {
      toast.success('PIN removed — you will use your password on the lock screen');
      void qc.invalidateQueries({ queryKey: ['me'] });
    },
  });
  const digits = (v: string) => v.replace(/\D/g, '').slice(0, 6);

  return (
    <Section
      title="Quick PIN"
      description="For shared front-desk and bar computers: lock the screen when you step away, and come back — or hand over — with a 4–6 digit PIN instead of your full password. A PIN only works on a device where you have signed in with your password."
      actions={me.hasPin ? <Pill tone="green" dot>PIN set</Pill> : <Pill>No PIN</Pill>}
    >
      {!editing ? (
        <div className="flex flex-wrap gap-2">
          <Button variant={me.hasPin ? 'secondary' : 'primary'} icon={<Grid3x3 className="size-3.5" />} onClick={() => setEditing(true)}>
            {me.hasPin ? 'Change PIN' : 'Set a PIN'}
          </Button>
          {me.hasPin && (
            <Button variant="ghost" loading={remove.isPending} onClick={() => remove.mutate()}>
              Remove PIN
            </Button>
          )}
        </div>
      ) : (
        <form
          className="grid gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            const ok = zPin.safeParse(f.pin);
            if (!ok.success) return setErr({ pin: ok.error.issues[0]?.message ?? 'Use 4 to 6 digits' });
            if (f.pin !== f.again) return setErr({ again: 'The PINs do not match' });
            save.mutate();
          }}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <TextInput label="New PIN" inputMode="numeric" type="password" autoComplete="off" autoFocus value={f.pin} onChange={(e) => setF({ ...f, pin: digits(e.target.value) })} error={err.pin} hint="4–6 digits, not 1234 or 0000" />
            <TextInput label="Repeat PIN" inputMode="numeric" type="password" autoComplete="off" value={f.again} onChange={(e) => setF({ ...f, again: digits(e.target.value) })} error={err.again} />
          </div>
          <TextInput label="Your password" type="password" autoComplete="current-password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} error={err.password} hint="To prove it is you" />
          <div className="flex gap-2">
            <Button type="submit" variant="primary" loading={save.isPending} icon={<Grid3x3 className="size-3.5" />}>
              Save PIN
            </Button>
            <Button type="button" variant="ghost" onClick={() => { setEditing(false); setErr({}); }}>
              Cancel
            </Button>
          </div>
        </form>
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
