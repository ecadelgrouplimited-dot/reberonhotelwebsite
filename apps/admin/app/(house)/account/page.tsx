'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useMutation } from '@tanstack/react-query';
import { KeyRound, ShieldCheck, Users, ArrowRight } from 'lucide-react';
import { toast } from 'sonner';
import { ApiError, post } from '@/lib/api';
import { useCan, useMe } from '@/lib/providers';
import { Button } from '@/components/ui/button';
import { PageHeader, Pill, Section } from '@/components/ui/bits';
import { TextInput } from '@/components/ui/field';

const ROLE_LABELS: Record<string, string> = {
  OWNER: 'Director / Super Admin',
  MANAGER: 'Hotel Manager',
  DESK: 'Operations & Front Desk',
  HOUSEKEEPING: 'Housekeeping & Rooms',
};

export default function AccountPage() {
  const me = useMe();
  const can = useCan();
  const [f, setF] = useState({ currentPassword: '', newPassword: '', again: '' });
  const [err, setErr] = useState<Record<string, string>>({});
  const m = useMutation({
    mutationFn: () => post('/auth/password', { currentPassword: f.currentPassword, newPassword: f.newPassword }),
    onSuccess: () => {
      toast.success('Your password has been updated');
      setF({ currentPassword: '', newPassword: '', again: '' });
      setErr({});
    },
    onError: (e) => {
      if (e instanceof ApiError) setErr(e.fieldErrors());
      toast.error(e instanceof ApiError ? e.message : 'Could not change password');
    },
  });

  return (
    <div className="fade-in max-w-2xl">
      <PageHeader
        title="Account & Password"
        description={`${me.name} · ${me.email}`}
        actions={
          can('users:manage') ? (
            <Button size="sm" href="/settings/users" variant="secondary" icon={<Users className="size-3.5" />}>
              Manage Staff Passwords
            </Button>
          ) : undefined
        }
      />

      <div className="grid gap-4">
        <Section title="Your Profile & Access">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold">{me.name}</p>
              <p className="text-xs text-fg-muted">{me.email}</p>
            </div>
            <Pill tone="green">{ROLE_LABELS[me.role] ?? me.role}</Pill>
          </div>
          {can('users:manage') && (
            <div className="mt-3 flex items-center justify-between rounded-lg border border-line bg-surface-2/60 px-3 py-2 text-xs">
              <span className="flex items-center gap-2 text-fg-muted">
                <ShieldCheck className="size-4 text-accent" />
                Need to set or reset a password for another staff member and email their credentials?
              </span>
              <Link href="/settings/users" className="inline-flex items-center gap-1 font-semibold text-fg hover:underline">
                People & Access <ArrowRight className="size-3" />
              </Link>
            </div>
          )}
        </Section>

        <Section title="Change Your Password" description="Choose a strong password of at least 12 characters. Other devices signed in to your account will be signed out.">
          <form
            className="grid gap-3.5"
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
            <div className="grid gap-3.5 sm:grid-cols-2">
              <TextInput
                label="New password"
                type="password"
                autoComplete="new-password"
                hint="At least 12 characters"
                value={f.newPassword}
                onChange={(e) => setF({ ...f, newPassword: e.target.value })}
                error={err.newPassword}
              />
              <TextInput
                label="Confirm new password"
                type="password"
                autoComplete="new-password"
                value={f.again}
                onChange={(e) => setF({ ...f, again: e.target.value })}
                error={err.again}
              />
            </div>
            <div className="pt-1">
              <Button type="submit" variant="primary" icon={<KeyRound className="size-3.5" />} loading={m.isPending}>
                Update password
              </Button>
            </div>
          </form>
        </Section>
      </div>
    </div>
  );
}
