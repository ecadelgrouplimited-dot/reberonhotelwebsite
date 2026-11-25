'use client';
import { use } from 'react';
import { Users } from 'lucide-react';
import { EntityEditor } from '@/components/forms/entity-editor';
import { eventConfig } from '@/components/content/configs';
import { useCan } from '@/lib/providers';
import { Button } from '@/components/ui/button';

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const can = useCan();
  return (
    <EntityEditor
      config={{
        ...eventConfig,
        extraSide: (r) =>
          r && can('events:manage') ? (
            <div className="card grid gap-2 p-4 text-[12.5px]">
              <p className="font-semibold uppercase tracking-wider text-fg-subtle">Guests</p>
              <p className="text-fg-muted">{r.seatsLeft === null || r.seatsLeft === undefined ? 'No limit on places.' : `${r.seatsLeft as number} place(s) left.`}</p>
              <Button size="sm" variant="secondary" href={`/website/events/${id}/guests`} icon={<Users className="size-3.5" />}>
                Guest list & check-in
              </Button>
            </div>
          ) : null,
      }}
      id={id}
    />
  );
}
