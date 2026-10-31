'use client';
import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Frown, Mail, Meh, Merge, MessageSquareText, Phone, Smile, Star, Trash2, X } from 'lucide-react';
import type { GuestProfileDTO } from '@reberon/contracts';
import { whatsappLink } from '@reberon/utils';
import { ApiError, del, get, patch, post } from '@/lib/api';
import { useCan, useMe } from '@/lib/providers';
import { money } from '@/lib/money';
import { ago, dateRange, dateShort } from '@/lib/format';
import { cn } from '@/lib/cn';
import { Button } from '@/components/ui/button';
import { PageHeader, Pill, Section, Skeleton, Status } from '@/components/ui/bits';
import { Dialog } from '@/components/ui/dialog';
import { Switch, TextArea, TextInput } from '@/components/ui/field';
import { useConfirm } from '@/components/ui/confirm';

const FACE = { GOOD: Smile, OK: Meh, BAD: Frown } as const;

export default function GuestPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const qc = useQueryClient();
  const router = useRouter();
  const can = useCan();
  const me = useMe();
  const isOwner = me.role === 'OWNER';
  const canDelete = me.role === 'OWNER' || me.role === 'MANAGER';
  const confirm = useConfirm();
  const { data: g, isLoading } = useQuery({ queryKey: ['guest', id], queryFn: () => get<GuestProfileDTO>(`/guests/${id}`) });
  const { data: guestAudit } = useQuery({
    queryKey: ['guest-audit', id],
    queryFn: () => get<{ data: { id: string; action: string; summary: string | null; actor: { name: string; role?: string } | null; createdAt: string }[] }>(`/audit?entityType=Contact&entityId=${id}`),
    enabled: isOwner,
  });
  const [form, setForm] = useState({ name: '', phone: '', email: '', country: '', nationality: '', guestNotes: '', tags: [] as string[], isVip: false, idDocType: '', idDocNumber: '' });
  const [tag, setTag] = useState('');
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteReason, setDeleteReason] = useState('');
  useEffect(() => {
    if (g) setForm({ name: g.name, phone: g.phone ?? '', email: g.email ?? '', country: g.country ?? '', nationality: g.nationality ?? '', guestNotes: g.guestNotes ?? '', tags: g.tags, isVip: g.isVip, idDocType: g.idDocType ?? '', idDocNumber: '' });
  }, [g]);
  const save = useMutation({
    mutationFn: () => patch<GuestProfileDTO>(`/guests/${id}`, { ...form, phone: form.phone || null, email: form.email || null, country: form.country || null, nationality: form.nationality || null, guestNotes: form.guestNotes || null, idDocType: form.idDocType || null, idDocNumber: form.idDocNumber || undefined }),
    onSuccess: (d) => { qc.setQueryData(['guest', id], d); qc.invalidateQueries({ queryKey: ['guests'] }); qc.invalidateQueries({ queryKey: ['guest-audit', id] }); toast.success('Saved'); },
    onError: (e) => toast.error(e instanceof ApiError ? (e.errors[0]?.message ?? e.message) : 'Could not save'),
  });
  const deleteMut = useMutation({
    mutationFn: () => del<{ ok: boolean; name: string }>(`/guests/${id}`, { reason: deleteReason.trim() || `Deleted by ${me.role}` }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['guests'] });
      toast.success('Guest profile deleted');
      router.push('/guests');
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Could not delete guest'),
  });
  const merge = useMutation({
    mutationFn: (mergeId: string) => post<GuestProfileDTO>('/guests/merge', { keepId: id, mergeId }),
    onSuccess: (d) => { qc.setQueryData(['guest', id], d); qc.invalidateQueries({ queryKey: ['guests'] }); toast.success('Merged. One guest, one history.'); },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Could not merge'),
  });

  useEffect(() => {
    if (g && g.id !== id) router.replace(`/guests/${g.id}`); // a merged record points at the one it joined
  }, [g, id, router]);

  if (isLoading || !g) return <Skeleton className="h-96" />;
  const edit = can('guests:write');
  const dirty = JSON.stringify(form) !== JSON.stringify({ name: g.name, phone: g.phone ?? '', email: g.email ?? '', country: g.country ?? '', nationality: g.nationality ?? '', guestNotes: g.guestNotes ?? '', tags: g.tags, isVip: g.isVip, idDocType: g.idDocType ?? '', idDocNumber: '' });
  const addTag = () => { const t = tag.trim().toLowerCase(); if (t && !form.tags.includes(t)) setForm({ ...form, tags: [...form.tags, t] }); setTag(''); };

  return (
    <div className="fade-in">
      <PageHeader
        crumbs={[{ label: 'Guests', href: '/guests' }, { label: g.name }]}
        title={<span className="flex flex-wrap items-center gap-3">{g.name}{g.isVip && <Pill tone="dark"><Star className="size-3" /> VIP</Pill>}{g.stays >= 2 && <Pill tone="blue">Regular</Pill>}</span>}
        description={`Guest since ${dateShort(g.createdAt)} · first came through ${g.source.toLowerCase().replace('_', ' ')}`}
        actions={
          <>
            {can('bookings:write') && <Button variant="primary" href={`/reservations/new`}>New booking</Button>}
            {canDelete && (
              <Button variant="danger" icon={<Trash2 className="size-4" />} onClick={() => setDeleteOpen(true)}>
                Delete Guest
              </Button>
            )}
          </>
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          ['Stays', String(g.stays)],
          ['Nights', String(g.nights)],
          ['Last here', g.lastStay ? dateShort(g.lastStay) : '—'],
          g.spent ? ['Paid in total', money(g.spent.UGX, 'UGX') + (g.spent.USD !== '0' ? ` + ${money(g.spent.USD, 'USD')}` : '')] : ['Next stay', g.nextStay ? dateShort(g.nextStay) : '—'],
        ].map(([l, v]) => <div key={l} className="card p-4"><p className="text-[12.5px] text-fg-muted">{l}</p><p className="mt-1.5 text-[1.4rem] font-semibold leading-tight tabular">{v}</p></div>)}
      </div>

      <div className="grid items-start gap-5 xl:grid-cols-[1fr_24rem]">
        <div className="grid gap-5">
          {g.possibleDuplicates.length > 0 && can('guests:merge') && (
            <Section title="Might be the same person" description="Merging moves every booking, conversation and note onto this profile. The other record stays behind as a pointer.">
              <ul className="-my-2 divide-y divide-line text-[13px]">
                {g.possibleDuplicates.map((d) => (
                  <li key={d.id} className="flex flex-wrap items-center gap-3 py-2.5">
                    <Link href={`/guests/${d.id}`} className="font-medium hover:underline">{d.name}</Link>
                    <span className="text-fg-muted">{[d.phone, d.email].filter(Boolean).join(' · ')} · {d.stays} stay{d.stays === 1 ? '' : 's'}</span>
                    <Pill tone="amber">{d.why}</Pill>
                    <Button size="sm" className="ml-auto" icon={<Merge className="size-3.5" />} loading={merge.isPending && merge.variables === d.id}
                      onClick={async () => { if (await confirm({ title: `Merge “${d.name}” into “${g.name}”?`, body: 'Their bookings and messages move here. This cannot be split again automatically.', confirm: 'Merge' })) merge.mutate(d.id); }}>Merge into this guest</Button>
                  </li>
                ))}
              </ul>
            </Section>
          )}

          <Section title="Stays" description={`${g.reservations.length} booking${g.reservations.length === 1 ? '' : 's'}`}>
            <ol className="-my-2 divide-y divide-line text-[13px]">
              {g.reservations.map((r) => (
                <li key={r.id}>
                  <Link href={`/reservations/${r.id}`} className="-mx-2 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg px-2 py-2.5 hover:bg-surface-2/60">
                    <span className="w-44 font-medium tabular">{dateRange(r.arrival, r.departure)}</span>
                    <span className="text-fg-muted">{r.roomSummary}{r.roomNumbers.length > 0 && ` · room ${r.roomNumbers.join(', ')}`}</span>
                    <span className="font-mono text-[12px] text-fg-subtle">{r.code}</span>
                    <span className="ml-auto flex items-center gap-3">{g.spent && <span className="tabular">{money(r.totalMinor, r.currency)}</span>}<Status value={r.status} /></span>
                  </Link>
                </li>
              ))}
            </ol>
          </Section>

          {g.feedback.length > 0 && (
            <Section title="What they told us">
              <ul className="grid gap-3">
                {g.feedback.map((f) => {
                  const Icon = FACE[f.score];
                  return (
                    <li key={f.id} className="flex gap-3 text-[13px]">
                      <Icon className={cn('mt-0.5 size-5 shrink-0', f.score === 'GOOD' ? 'text-success' : f.score === 'OK' ? 'text-warning' : 'text-danger')} aria-label={f.score} />
                      <div><p>{f.comment ?? <span className="text-fg-muted">No words, just a tap.</span>}</p><p className="mt-0.5 text-[12px] text-fg-subtle">{f.code} · {dateShort(f.createdAt)}</p></div>
                    </li>
                  );
                })}
              </ul>
            </Section>
          )}

          {g.conversations.length > 0 && (
            <Section title="Conversations">
              <ul className="-my-2 divide-y divide-line text-[13px]">
                {g.conversations.map((c) => <li key={c.id}><Link className="flex items-center justify-between gap-3 py-2.5 hover:underline" href={`/inbox?c=${c.id}`}><span>{c.subject ?? 'Message'}</span><span className="flex items-center gap-2 text-fg-subtle">{dateShort(c.lastMessageAt)} <Status value={c.status} /></span></Link></li>)}
              </ul>
            </Section>
          )}

          {isOwner && guestAudit?.data && guestAudit.data.length > 0 && (
            <Section title="Super Admin Profile Audit Log" description="Strictly visible only to the Hotel Owner (Super Admin)">
              <ul className="-my-2 divide-y divide-line text-[13px]">
                {guestAudit.data.map((log) => (
                  <li key={log.id} className="flex items-center justify-between gap-3 py-2.5">
                    <div>
                      <span className="font-medium text-fg">{log.summary ?? log.action}</span>
                      <span className="ml-2 text-xs text-fg-muted">
                        by {log.actor?.name ?? 'Staff'}{log.actor?.role ? ` (${log.actor.role})` : ''}
                      </span>
                    </div>
                    <span className="text-xs text-fg-subtle">{ago(log.createdAt)}</span>
                  </li>
                ))}
              </ul>
            </Section>
          )}
        </div>

        <aside className="grid gap-5 xl:sticky xl:top-20">
          <div className="card grid gap-3 p-5 text-[13px]">
            {g.phone && <a className="flex items-center gap-2 hover:underline" href={`tel:${g.phone}`}><Phone className="size-4 text-fg-subtle" /> {g.phone}</a>}
            {g.email && <a className="flex items-center gap-2 truncate hover:underline" href={`mailto:${g.email}`}><Mail className="size-4 text-fg-subtle" /> {g.email}</a>}
            {g.phone && <a className="flex items-center gap-2 hover:underline" target="_blank" rel="noreferrer" href={whatsappLink(g.phone, `Hello ${g.name.split(' ')[0]}, this is Reberon Hotel.`)}><MessageSquareText className="size-4 text-fg-subtle" /> WhatsApp</a>}
            {g.preferredRoomType && <p className="text-fg-muted">Usually stays in <b className="text-fg">{g.preferredRoomType.name}</b></p>}
            {g.idDocLast4 && <p className="text-fg-muted">{g.idDocType ?? 'ID'} ending <b className="font-mono text-fg">{g.idDocLast4}</b></p>}
          </div>

          <div className="card grid gap-4 p-5">
            <p className="font-semibold">What the house should remember</p>
            <TextArea label="Notes" rows={4} value={form.guestNotes} onChange={(e) => setForm({ ...form, guestNotes: e.target.value })} disabled={!edit} placeholder="Coffee black at 6. Prefers the upper floor. Allergic to nuts." />
            <div className="grid gap-1.5">
              <span className="label">Tags</span>
              <div className="flex flex-wrap gap-1.5">
                {form.tags.map((t) => <span key={t} className="inline-flex items-center gap-1 rounded-full bg-surface-2 py-1 pl-2.5 pr-1.5 text-[12px]">{t}{edit && <button type="button" aria-label={`Remove ${t}`} onClick={() => setForm({ ...form, tags: form.tags.filter((x) => x !== t) })}><X className="size-3" /></button>}</span>)}
                {edit && <input className="input !min-h-7 !w-28 !rounded-full !py-0 text-[12px]" placeholder="+ tag" value={tag} onChange={(e) => setTag(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTag(); } }} onBlur={addTag} />}
              </div>
            </div>
            <Switch label="VIP" hint="Shown to the desk on arrival." checked={form.isVip} onChange={(v) => setForm({ ...form, isVip: v })} disabled={!edit} />
            <details className="group" open>
              <summary className="cursor-pointer text-[13px] font-medium text-fg-muted">Contact and identity</summary>
              <div className="mt-3 grid gap-3">
                <TextInput label="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} disabled={!edit} />
                <TextInput label="Phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} disabled={!edit} />
                <TextInput label="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} disabled={!edit} />
                <div className="grid grid-cols-2 gap-3">
                  <TextInput label="Country" value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} disabled={!edit} />
                  <TextInput label="Nationality" value={form.nationality} onChange={(e) => setForm({ ...form, nationality: e.target.value })} disabled={!edit} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <TextInput label="ID document" value={form.idDocType} onChange={(e) => setForm({ ...form, idDocType: e.target.value })} disabled={!edit} />
                  <TextInput label="New number" value={form.idDocNumber} onChange={(e) => setForm({ ...form, idDocNumber: e.target.value })} disabled={!edit} placeholder={g.idDocLast4 ? `•••• ${g.idDocLast4}` : ''} autoComplete="off" />
                </div>
              </div>
            </details>
            {edit && <Button variant="dark" loading={save.isPending} disabled={!dirty} onClick={() => save.mutate()}>Save</Button>}
          </div>
        </aside>
      </div>

      {canDelete && (
        <Dialog
          open={deleteOpen}
          onClose={() => setDeleteOpen(false)}
          title={`Delete guest profile "${g.name}"?`}
          description="Removes this guest profile and any associated reservations. Logged in the Super Admin Audit Trail."
          footer={
            <>
              <Button variant="ghost" onClick={() => setDeleteOpen(false)}>Cancel</Button>
              <Button variant="danger" icon={<Trash2 className="size-4" />} loading={deleteMut.isPending} onClick={() => deleteMut.mutate()}>
                Delete Guest Profile
              </Button>
            </>
          }
        >
          <div className="grid gap-4 text-[13px]">
            <TextInput label="Reason for deletion (recorded in Owner Audit Log)" value={deleteReason} onChange={(e) => setDeleteReason(e.target.value)} placeholder="e.g. Duplicate test guest or erroneous entry" />
          </div>
        </Dialog>
      )}
    </div>
  );
}
