'use client';
import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { KeyRound, Users } from 'lucide-react';
import { toast } from 'sonner';
import { ApiError, post } from '@/lib/api';
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
    <div className="fade-in max-w-lg">
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
