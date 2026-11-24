'use client';
import { Suspense, useCallback, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2 } from 'lucide-react';
import type { PinCheckDTO } from '@reberon/contracts';
import { ApiError, get, post } from '@/lib/api';
import { PinSetter } from '@/components/forms/pin-setter';

function ResetPin() {
  const token = useSearchParams().get('token') ?? '';
  const [done, setDone] = useState(false);
  const info = useQuery({
    queryKey: ['pin-reset', token],
    queryFn: () => get<{ name: string; hasPin: boolean; expiresAt: string }>(`/auth/pin/reset?token=${encodeURIComponent(token)}`),
    enabled: token.length >= 20,
    retry: false,
  });
  const check = useCallback((pin: string) => post<PinCheckDTO>('/auth/pin/check', { pin, token }), [token]);

  if (done) {
    return (
      <div className="grid gap-4 text-center">
        <CheckCircle2 className="mx-auto size-12 text-emerald-500" />
        <h1 className="display text-[2rem]">Your new PIN is ready</h1>
        <p className="text-[13.5px] text-fg-muted">Go back to the House computer, tap your name on the lock screen and type your 4 digits.</p>
        <Link href="/login" className="text-[13px] font-semibold text-brand hover:underline">
          Go to sign in
        </Link>
      </div>
    );
  }

  if (!token || info.isError) {
    return (
      <div className="grid gap-3">
        <h1 className="display text-[2rem]">Link not valid</h1>
        <p className="text-[13.5px] text-fg-muted">{info.error instanceof ApiError ? info.error.message : 'This link is not complete.'} On the lock screen, tap your name and “Forgot PIN?” to get a new one.</p>
        <Link href="/login" className="text-[13px] font-semibold text-brand hover:underline">
          Go to sign in
        </Link>
      </div>
    );
  }

  if (!info.data) return <div className="h-64" />;

  return (
    <div className="grid gap-5">
      <div>
        <h1 className="display text-[2rem]">Choose a new PIN</h1>
        <p className="mt-1 text-[13.5px] text-fg-muted">
          For {info.data.name}. Four digits, only yours. If a PIN is not available, just pick another. Your password does not change.
        </p>
      </div>
      <PinSetter
        check={check}
        submitLabel="Save my new PIN"
        onSubmit={async (pin) => {
          await post('/auth/pin/reset', { token, pin });
          setDone(true);
        }}
      />
    </div>
  );
}

export default function ResetPinPage() {
  return (
    <Suspense>
      <ResetPin />
    </Suspense>
  );
}
