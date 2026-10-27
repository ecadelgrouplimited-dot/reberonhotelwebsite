'use client';
import { Command } from 'cmdk';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { FileText, Hammer, Inbox, Plus, Upload, BedDouble } from 'lucide-react';
import type { AdminPageSummaryDTO, ConversationSummaryDTO } from '@reberon/contracts';
import { t } from '@reberon/contracts/text';
import { get } from '@/lib/api';
import { useMeQuery } from '@/lib/providers';
import { NAV } from './nav';

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const { data: me } = useMeQuery();
  const [q, setQ] = useState('');
  const can = (p: string) => !!me?.permissions.includes(p);
  const pages = useQuery({ queryKey: ['pages'], queryFn: () => get<AdminPageSummaryDTO[]>('/pages'), enabled: open && can('content:read') });
  const rooms = useQuery({ queryKey: ['room-types'], queryFn: () => get<{ id: string; name: Record<string, string> }[]>('/room-types'), enabled: open && can('content:read') });
  const convs = useQuery({
    queryKey: ['palette-convs', q],
    queryFn: () => get<{ data: ConversationSummaryDTO[] }>(`/conversations?limit=6&q=${encodeURIComponent(q)}`),
    enabled: open && can('inbox:read') && q.length > 1,
  });
  useEffect(() => {
    if (!open) setQ('');
  }, [open]);
  if (!open) return null;
  const go = (href: string) => {
    onClose();
    router.push(href);
  };
  const item = 'flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-[13px] data-[selected=true]:bg-surface-2';
  return (
    <div className="fixed inset-0 z-[60] grid place-items-start bg-black/35 px-4 pt-[12vh] backdrop-blur-[2px]" onClick={onClose}>
      <Command label="Command palette" className="fade-in mx-auto w-full max-w-xl overflow-hidden rounded-2xl border border-line bg-surface shadow-[var(--shadow-lift)]" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.key === 'Escape' && onClose()}>
        <Command.Input autoFocus value={q} onValueChange={setQ} placeholder="Type a page, a room, a guest name, an EQ- reference…" className="h-14 w-full border-b border-line bg-transparent px-5 text-[15px] outline-none placeholder:text-fg-subtle" />
        <Command.List className="scrollbar-thin max-h-[60vh] overflow-y-auto p-2">
          <Command.Empty className="px-3 py-8 text-center text-[13px] text-fg-muted">Nothing matches.</Command.Empty>
          <Command.Group heading="Quick actions" className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-fg-subtle">
            {can('content:write') && (
              <Command.Item className={item} onSelect={() => go('/website/rising/new')}>
                <Hammer className="size-4 text-fg-subtle" /> Post a progress update
              </Command.Item>
            )}
            {can('media:upload') && (
              <Command.Item className={item} onSelect={() => go('/media?upload=1')}>
                <Upload className="size-4 text-fg-subtle" /> Upload photos
              </Command.Item>
            )}
            {can('content:write') && (
              <Command.Item className={item} onSelect={() => go('/website/pages?new=1')}>
                <Plus className="size-4 text-fg-subtle" /> New page
              </Command.Item>
            )}
          </Command.Group>
          <Command.Group heading="Go to" className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-fg-subtle">
            {NAV.flatMap((g) => g.items)
              .filter((i) => !i.later && (!i.perm || can(i.perm)))
              .map((i) => (
                <Command.Item key={i.href} className={item} onSelect={() => go(i.href)}>
                  <i.icon className="size-4 text-fg-subtle" /> {i.label}
                </Command.Item>
              ))}
          </Command.Group>
          {!!pages.data?.length && (
            <Command.Group heading="Pages" className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-fg-subtle">
              {pages.data.map((p) => (
                <Command.Item key={p.id} value={`page ${t(p.title)} /${p.slug}`} className={item} onSelect={() => go(`/website/pages/${p.id}`)}>
                  <FileText className="size-4 text-fg-subtle" /> {t(p.title)} <span className="ml-auto font-mono text-[11px] text-fg-subtle">/{p.slug}</span>
                </Command.Item>
              ))}
            </Command.Group>
          )}
          {!!rooms.data?.length && (
            <Command.Group heading="Rooms" className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-fg-subtle">
              {rooms.data.map((r) => (
                <Command.Item key={r.id} value={`room ${t(r.name)}`} className={item} onSelect={() => go(`/website/rooms/${r.id}`)}>
                  <BedDouble className="size-4 text-fg-subtle" /> {t(r.name)}
                </Command.Item>
              ))}
            </Command.Group>
          )}
          {!!convs.data?.data.length && (
            <Command.Group heading="Conversations" className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-fg-subtle">
              {convs.data.data.map((c) => (
                <Command.Item key={c.id} value={`${q} ${c.reference} ${c.contact.name}`} className={item} onSelect={() => go(`/inbox/${c.id}`)}>
                  <Inbox className="size-4 text-fg-subtle" /> {c.contact.name} <span className="ml-auto font-mono text-[11px] text-fg-subtle">{c.reference}</span>
                </Command.Item>
              ))}
            </Command.Group>
          )}
        </Command.List>
      </Command>
    </div>
  );
}
