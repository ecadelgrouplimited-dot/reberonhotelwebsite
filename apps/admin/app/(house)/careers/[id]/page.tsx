'use client';
import { use } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { CareersOverviewDTO } from '@reberon/contracts';
import { get } from '@/lib/api';
import { EntityEditor } from '@/components/forms/entity-editor';
import { jobConfig } from '@/components/content/configs';
import { Skeleton } from '@/components/ui/bits';

export default function JobEditor({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data } = useQuery({ queryKey: ['careers'], queryFn: () => get<CareersOverviewDTO>('/careers') });
  if (!data) return <Skeleton className="h-96" />;
  return <EntityEditor config={jobConfig(data.departments)} id={id} />;
}
