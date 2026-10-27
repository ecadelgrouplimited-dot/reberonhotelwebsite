'use client';
import Link from 'next/link';
import { useMutation, useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Send } from 'lucide-react';
import { get, post } from '@/lib/api';
import { useCan } from '@/lib/providers';
import { dateShort } from '@/lib/format';
import { money } from '@/lib/money';
import { Button } from '@/components/ui/button';
import { Empty, PageHeader, Section, Skeleton, Status } from '@/components/ui/bits';
import { StatTile } from '@/components/charts/charts';

type Brief = {
  date: string; tomorrow: string;
  arrivals: { id: string; code: string; name: string; status: string; eta: string | null; rooms: string; balance: string }[];
  occupancy: { tonight: number; total: number; percent: number };
  clearedToday: { UGX: string; USD: string; count: number };
  promised: { id: string; code: string; name: string; status: string; arrival: string; balance: string }[];
};

export default function BriefPage() {
  const can = useCan();
  const { data: b, isLoading } = useQuery({ queryKey: ['brief'], queryFn: () => get<Brief>('/owner/brief'), refetchInterval: 60_000 });
  const send = useMutation({ mutationFn: () => post('/owner/brief/send'), onSuccess: () => toast.success('Brief emailed to directors') });
  if (isLoading || !b) return <Skeleton className="h-80" />;
  return (
    <div className="fade-in">
      <PageHeader
        title="Owner Brief"
        description={`${dateShort(b.date)} · Daily executive snapshot (auto-dispatched at 19:00 EAT)`}
        actions={can('settings:features') && <Button size="sm" icon={<Send className="size-3.5" />} loading={send.isPending} onClick={() => send.mutate()}>Dispatch Email Now</Button>}
      />
      <div className="grid gap-2.5 sm:grid-cols-3">
        <StatTile label="Occupied Tonight" value={`${b.occupancy.tonight} / ${b.occupancy.total}`} note={`${b.occupancy.percent}% occupancy`} />
        <StatTile label="Arriving Tomorrow" value={b.arrivals.length} note={dateShort(b.tomorrow)} />
        <StatTile label="Cleared Today" value={money(b.clearedToday.UGX, 'UGX')} note={`${BigInt(b.clearedToday.USD) > 0n ? `+ ${money(b.clearedToday.USD, 'USD')} · ` : ''}${b.clearedToday.count} payment(s)`} />
      </div>
      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <Section title="Tomorrow's Arrivals">
          {!b.arrivals.length ? <Empty title="No arrivals scheduled tomorrow" /> : (
            <ul className="-my-1 divide-y divide-line text-xs">
              {b.arrivals.map((a) => (
                <li key={a.id}>
                  <Link href={`/reservations/${a.id}`} className="flex flex-wrap items-center gap-2.5 py-2 hover:underline">
                    <span className="font-mono text-fg-muted">{a.code}</span>
                    <span className="font-semibold">{a.name}</span>
                    <span className="text-fg-muted">{a.rooms}{a.eta ? ` · ETA ${a.eta}` : ''}</span>
                    <span className="ml-auto font-mono tabular">{a.balance} due</span>
                    <Status value={a.status} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Section>
        <Section title="Receivables Due (Next 7 Days)">
          {!b.promised.length ? <Empty title="No outstanding receivables" /> : (
            <ul className="-my-1 divide-y divide-line text-xs">
              {b.promised.map((p) => (
                <li key={p.id}>
                  <Link href={`/reservations/${p.id}`} className="flex flex-wrap items-center gap-2.5 py-2 hover:underline">
                    <span className="font-mono text-fg-muted">{p.code}</span>
                    <span className="font-semibold">{p.name}</span>
                    <span className="text-fg-muted">Arrives {dateShort(p.arrival)}</span>
                    <span className="ml-auto font-mono font-semibold tabular text-warning">{p.balance}</span>
                    <Status value={p.status} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>
    </div>
  );
}
