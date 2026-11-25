'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { cancelRsvp } from './actions';

export function CancelRsvpButton({ token, waiting }: { token: string; waiting: boolean }) {
  const [sure, setSure] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  if (!sure)
    return (
      <button type="button" className="btn btn-ghost text-danger" onClick={() => setSure(true)}>
        <span className="btn-label">{waiting ? 'Leave the waiting list' : 'Give my places back'}</span>
      </button>
    );
  return (
    <div className="grid w-full gap-3 rounded-[var(--r-md)] border border-danger/30 bg-danger/5 p-4">
      <p className="text-sm">{waiting ? 'Leave the waiting list for this event?' : 'Cancel your places? They go to the next person on the waiting list.'}</p>
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      <div className="flex gap-2">
        <button
          type="button"
          className="btn"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await cancelRsvp(token);
              if (r.ok) router.refresh();
              else setError(r.message);
            })
          }
        >
          <span className="btn-label">{pending ? 'Cancelling…' : 'Yes, cancel'}</span>
        </button>
        <button type="button" className="btn btn-secondary" onClick={() => setSure(false)}>
          <span className="btn-label">Keep it</span>
        </button>
      </div>
    </div>
  );
}
