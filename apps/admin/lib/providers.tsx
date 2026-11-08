'use client';
import { MutationCache, QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { createContext, useContext, useState, type ReactNode } from 'react';
import { toast, Toaster } from 'sonner';
import { QUEUED_MESSAGE } from './offline/outbox';
import type { MeDTO, Permission } from '@reberon/contracts';
import { TypographyApplier } from './typography';
import { ApiError, get, OfflineQueuedError } from './api';

export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        // Every screen gets the "saved on this device" notice, even ones without their own error handler.
        mutationCache: new MutationCache({
          onError: (e) => {
            if (e instanceof OfflineQueuedError) toast.info('Saved on this device', { id: 'rb-queued', description: 'You’re offline — it will sync automatically when the connection is back.' });
          },
        }),
        defaultOptions: {
          // 'always': offline, requests still run and the service worker answers from the saved copy.
          queries: { staleTime: 20_000, refetchOnWindowFocus: true, networkMode: 'always', retry: (n, e) => !(e instanceof ApiError && (e.status < 500 || e.code.startsWith('OFFLINE'))) && n < 2 },
          mutations: { retry: false, networkMode: 'always' },
        },
      }),
  );
  return (
    <QueryClientProvider client={client}>
      <TypographyApplier />
      {children}
      <Toaster position="bottom-right" richColors closeButton toastOptions={{ className: 'font-sans' }} />
    </QueryClientProvider>
  );
}

/**
 * Screens report failures with toast.error(e.message). A change kept for later
 * sync is not a failure, so that one message is shown as a calm notice instead.
 */
if (typeof window !== 'undefined' && !(toast as unknown as { __rbPatched?: boolean }).__rbPatched) {
  const original = toast.error.bind(toast);
  toast.error = ((message: Parameters<typeof toast.error>[0], data?: Parameters<typeof toast.error>[1]) =>
    message === QUEUED_MESSAGE
      ? toast.info('Saved on this device', { ...data, id: 'rb-queued', description: 'You’re offline — it will sync automatically when the connection is back.' })
      : original(message, data)) as typeof toast.error;
  (toast as unknown as { __rbPatched?: boolean }).__rbPatched = true;
}

const MeCtx = createContext<MeDTO | null>(null);

export function useMeQuery() {
  return useQuery({ queryKey: ['me'], queryFn: () => get<MeDTO>('/auth/me'), staleTime: 5 * 60_000 });
}

export function MeProvider({ me, children }: { me: MeDTO; children: ReactNode }) {
  return <MeCtx.Provider value={me}>{children}</MeCtx.Provider>;
}

export function useMe() {
  const me = useContext(MeCtx);
  if (!me) throw new Error('useMe outside MeProvider');
  return me;
}

export function useCan() {
  const me = useMe();
  return (p: Permission) => me.permissions.includes(p);
}
