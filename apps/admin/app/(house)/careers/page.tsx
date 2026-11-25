'use client';
import { Suspense, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Briefcase, Download, ExternalLink, FileText, Mail, MessageSquarePlus, Phone, Plus, Search, Star, UserPlus } from 'lucide-react';
import { APPLICATION_STATUSES, APPLICATION_STATUS_LABEL, JOB_TYPE_LABEL, type ApplicationDTO, type ApplicationStatus, type CareersOverviewDTO, type StaffProfileDTO } from '@reberon/contracts';
import { t } from '@reberon/contracts/text';
import { ApiError, WEB_URL, get, post } from '@/lib/api';
import { useCan } from '@/lib/providers';
import { ago, dateTime } from '@/lib/format';
import { cn } from '@/lib/cn';
import { Button, buttonClass } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Empty, PageHeader, Pill, Skeleton } from '@/components/ui/bits';
import { SelectInput, TextArea } from '@/components/ui/field';
import { useScreenActions } from '@/components/os/screen-actions';

type Tone = 'green' | 'amber' | 'neutral' | 'blue' | 'red';
const TONE: Record<ApplicationStatus, Tone> = { NEW: 'red', REVIEWING: 'amber', SHORTLISTED: 'blue', INTERVIEW: 'blue', OFFERED: 'green', HIRED: 'green', REJECTED: 'neutral', WITHDRAWN: 'neutral' };
/** Stages that send the applicant an email by default when chosen. */
const NOTIFY_DEFAULT: ApplicationStatus[] = ['SHORTLISTED', 'INTERVIEW', 'OFFERED', 'REJECTED'];
const ACTIVE: ApplicationStatus[] = ['NEW', 'REVIEWING', 'SHORTLISTED', 'INTERVIEW', 'OFFERED'];

function CareersInner() {
  const can = useCan();
  const router = useRouter();
  const params = useSearchParams();
  const [tab, setTab] = useState<'applications' | 'jobs'>(params.get('tab') === 'jobs' ? 'jobs' : 'applications');
  const [stage, setStage] = useState<ApplicationStatus | 'ACTIVE' | 'ALL'>('ACTIVE');
  const [job, setJob] = useState<string>('');
  const [q, setQ] = useState('');
  const openId = params.get('open');
  const { data, isLoading } = useQuery({ queryKey: ['careers'], queryFn: () => get<CareersOverviewDTO>('/careers'), refetchInterval: 60_000 });

  const apps = useMemo(() => {
    let list = data?.applications ?? [];
    if (stage === 'ACTIVE') list = list.filter((a) => ACTIVE.includes(a.status));
    else if (stage !== 'ALL') list = list.filter((a) => a.status === stage);
    if (job) list = list.filter((a) => (job === 'open' ? !a.job : a.job?.id === job));
    const n = q.trim().toLowerCase();
    if (n) list = list.filter((a) => [a.name, a.email, a.phone, a.code, a.location].some((x) => x?.toLowerCase().includes(n)));
    return list;
  }, [data, stage, job, q]);

  const show = (id: string | null) => router.replace(id ? `/careers?open=${id}` : '/careers', { scroll: false });
  useScreenActions('Careers', [
    ...(can('careers:manage') ? [{ label: 'Post a job', icon: Plus, key: 'n', onSelect: () => router.push('/careers/new') }] : []),
    { label: 'Applications', icon: UserPlus, key: 'a', onSelect: () => setTab('applications') },
    { label: 'Jobs', icon: Briefcase, key: 'j', onSelect: () => setTab('jobs') },
  ]);

  const counts = data?.counts;
  const activeCount = counts ? ACTIVE.reduce((n, s) => n + (counts[s] ?? 0), 0) : 0;

  return (
    <div className="fade-in mx-auto max-w-6xl">
      <PageHeader
        title="Careers"
        description="Post jobs to the website, read applications and CVs, and move people from first look to hired."
        actions={
          <>
            <a className={buttonClass('secondary')} href={`${WEB_URL}/careers`} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="size-3.5" /> Careers page
            </a>
            <Button variant="primary" href="/careers/new" icon={<Plus className="size-3.5" />}>
              Post a job
            </Button>
          </>
        }
      />
      <div className="mb-4 flex rounded-lg border border-line bg-surface p-0.5 sm:w-fit">
        {(
          [
            ['applications', `Applications${counts?.NEW ? ` · ${counts.NEW} new` : ''}`],
            ['jobs', `Jobs${data ? ` · ${data.jobs.filter((j) => j.open).length} open` : ''}`],
          ] as const
        ).map(([v, label]) => (
          <button key={v} type="button" onClick={() => setTab(v)} className={cn('rounded-md px-3 py-1.5 text-[12.5px] font-semibold', tab === v ? 'bg-fg text-bg' : 'text-fg-muted hover:text-fg')}>
            {label}
          </button>
        ))}
      </div>

      {isLoading || !data ? (
        <Skeleton className="h-80" />
      ) : tab === 'jobs' ? (
        <div className="card overflow-hidden">
          {!data.jobs.length ? (
            <Empty icon={<Briefcase className="size-4" />} title="No jobs posted yet" body="Post the first role — it appears on the website's careers page and can be shared on WhatsApp, LinkedIn and Facebook." action={<Button size="sm" variant="primary" href="/careers/new" icon={<Plus className="size-3.5" />}>Post a job</Button>} />
          ) : (
            <ul className="divide-y divide-line">
              {data.jobs.map((j) => (
                <li key={j.id} className="flex flex-wrap items-center gap-3 px-4 py-3 hover:bg-surface-2/60">
                  <Link href={`/careers/${j.id}`} className="min-w-0 flex-1">
                    <span className="block font-medium">{t(j.title)}</span>
                    <span className="text-[12.5px] text-fg-muted">
                      {j.department ?? 'No department'} · {JOB_TYPE_LABEL[j.employmentType]} · {j.location}
                      {j.closesOn ? ` · closes ${new Date(`${j.closesOn}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })}` : ''}
                    </span>
                  </Link>
                  <button type="button" onClick={() => (setTab('applications'), setJob(j.id), setStage('ALL'))} className="text-[12.5px] text-fg-muted hover:text-fg">
                    {j.applications} application{j.applications === 1 ? '' : 's'}
                    {j.newApplications ? <span className="ml-1 font-semibold text-rose-600">· {j.newApplications} new</span> : null}
                  </button>
                  <Pill tone={j.open ? 'green' : j.status === 'DRAFT' ? 'neutral' : 'amber'} dot>
                    {j.open ? 'Open' : j.status === 'DRAFT' ? 'Draft' : j.status === 'OPEN' ? 'Past closing date' : 'Closed'}
                  </Pill>
                  {j.status !== 'DRAFT' && (
                    <a href={`${WEB_URL}/careers/${j.slug}`} target="_blank" rel="noopener noreferrer" className="text-fg-subtle hover:text-fg" aria-label="Open on the website">
                      <ExternalLink className="size-4" />
                    </a>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <>
          <div className="mb-3 flex flex-wrap items-center gap-1.5">
            {(['ACTIVE', ...APPLICATION_STATUSES, 'ALL'] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setStage(s)}
                className={cn('rounded-full border px-3 py-1 text-[12px] font-medium', stage === s ? 'border-fg bg-fg text-bg' : 'border-line text-fg-muted hover:text-fg')}
              >
                {s === 'ACTIVE' ? `In progress · ${activeCount}` : s === 'ALL' ? 'All' : `${APPLICATION_STATUS_LABEL[s]} · ${counts?.[s] ?? 0}`}
              </button>
            ))}
          </div>
          <div className="mb-3 flex flex-wrap gap-2">
            <select className="input h-8 w-auto text-[12.5px]" value={job} onChange={(e) => setJob(e.target.value)} aria-label="Filter by job">
              <option value="">Every job</option>
              {data.jobs.map((j) => (
                <option key={j.id} value={j.id}>
                  {t(j.title)}
                </option>
              ))}
              <option value="open">Open applications</option>
            </select>
            <label className="relative ml-auto w-full sm:w-64">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-fg-subtle" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, phone, reference…" aria-label="Search applications" className="input h-8 pl-8 text-[12.5px]" />
            </label>
          </div>
          <div className="card overflow-hidden">
            {!apps.length ? (
              <Empty icon={<UserPlus className="size-4" />} title="No applications here" body="When people apply on the website, they appear here — newest first." />
            ) : (
              <ul className="divide-y divide-line">
                {apps.map((a) => (
                  <li key={a.id}>
                    <button type="button" onClick={() => show(a.id)} className="flex w-full flex-wrap items-center gap-3 px-4 py-3 text-left hover:bg-surface-2/60">
                      <span className={cn('grid size-9 shrink-0 place-items-center rounded-full text-[12px] font-semibold', a.status === 'NEW' ? 'bg-rose-500/15 text-rose-600' : 'bg-surface-2 text-fg-muted')}>
                        {a.name.split(' ').slice(0, 2).map((p) => p[0]?.toUpperCase()).join('')}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className={cn('block truncate', a.status === 'NEW' ? 'font-semibold' : 'font-medium')}>{a.name}</span>
                        <span className="text-[12px] text-fg-muted">
                          {a.job ? t(a.job.title) : 'Open application'} · {ago(a.createdAt)}
                          {a.location ? ` · ${a.location}` : ''}
                        </span>
                      </span>
                      {a.cv && <FileText className="size-4 text-fg-subtle" aria-label="Has a CV" />}
                      {a.rating && (
                        <span className="inline-flex items-center gap-0.5 text-[12px] text-amber-600">
                          <Star className="size-3.5 fill-current" /> {a.rating}
                        </span>
                      )}
                      <Pill tone={TONE[a.status]} dot>
                        {APPLICATION_STATUS_LABEL[a.status]}
                      </Pill>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
      {openId && <ApplicationDrawer id={openId} onClose={() => show(null)} />}
    </div>
  );
}

function ApplicationDrawer({ id, onClose }: { id: string; onClose: () => void }) {
  const qc = useQueryClient();
  const can = useCan();
  const { data: a } = useQuery({ queryKey: ['application', id], queryFn: () => get<ApplicationDTO>(`/careers/applications/${id}`) });
  const [moving, setMoving] = useState<ApplicationStatus | null>(null);
  const [notify, setNotify] = useState(false);
  const [message, setMessage] = useState('');
  const [note, setNote] = useState('');
  const [staffId, setStaffId] = useState('');
  const refresh = (d: ApplicationDTO) => {
    qc.setQueryData(['application', id], d);
    qc.invalidateQueries({ queryKey: ['careers'] });
    qc.invalidateQueries({ queryKey: ['admin-pulse'] });
  };
  const fail = (e: unknown) => toast.error(e instanceof ApiError ? e.message : 'Could not save');
  const move = useMutation({
    mutationFn: () => post<ApplicationDTO>(`/careers/applications/${id}/status`, { status: moving, notify, message: message.trim() || undefined }),
    onSuccess: (d) => {
      refresh(d);
      toast.success(`${d.name}: ${APPLICATION_STATUS_LABEL[d.status]}${notify ? ' — emailed' : ''}`);
      setMoving(null);
      setMessage('');
    },
    onError: fail,
  });
  const rate = useMutation({ mutationFn: (rating: number | null) => post<ApplicationDTO>(`/careers/applications/${id}/rating`, { rating }), onSuccess: refresh, onError: fail });
  const addNote = useMutation({
    mutationFn: () => post<ApplicationDTO>(`/careers/applications/${id}/notes`, { body: note }),
    onSuccess: (d) => {
      refresh(d);
      setNote('');
    },
    onError: fail,
  });
  const staff = useQuery({ queryKey: ['hr-staff-lite'], queryFn: () => get<StaffProfileDTO[] | { items: StaffProfileDTO[] }>('/hr/staff'), enabled: !!a && (a.status === 'OFFERED' || a.status === 'HIRED') && can('hr:manage') });
  const link = useMutation({
    mutationFn: () => post<ApplicationDTO>(`/careers/applications/${id}/hired`, { staffProfileId: staffId }),
    onSuccess: (d) => {
      refresh(d);
      toast.success(`${d.name} linked to their staff profile`);
    },
    onError: fail,
  });
  const staffList = staff.data ? (Array.isArray(staff.data) ? staff.data : staff.data.items) : [];
  const cvUrl = `/v1/admin/careers/applications/${id}/cv`;
  const wa = a?.phone ? `https://wa.me/${a.phone.replace(/\D/g, '').replace(/^0/, '256')}` : null;

  return (
    <Dialog open onClose={onClose} drawer size="lg" title={a ? a.name : 'Loading…'} description={a ? `${a.job ? t(a.job.title) : 'Open application'} · ${a.code} · applied ${dateTime(a.createdAt)}` : undefined}>
      {!a ? (
        <Skeleton className="h-80" />
      ) : (
        <div className="grid gap-5">
          <div className="flex flex-wrap items-center gap-2">
            <Pill tone={TONE[a.status]} dot>
              {APPLICATION_STATUS_LABEL[a.status]}
            </Pill>
            <span className="ml-auto inline-flex items-center gap-0.5" role="radiogroup" aria-label="Rating">
              {[1, 2, 3, 4, 5].map((n) => (
                <button key={n} type="button" role="radio" aria-checked={a.rating === n} aria-label={`${n} star${n > 1 ? 's' : ''}`} onClick={() => rate.mutate(a.rating === n ? null : n)} className="p-0.5 text-amber-500">
                  <Star className={cn('size-4', (a.rating ?? 0) >= n && 'fill-current')} />
                </button>
              ))}
            </span>
          </div>

          <div className="flex flex-wrap gap-2">
            <a className={buttonClass('secondary', 'sm')} href={`mailto:${a.email}`}>
              <Mail className="size-3.5" /> {a.email}
            </a>
            <a className={buttonClass('secondary', 'sm')} href={`tel:${a.phone}`}>
              <Phone className="size-3.5" /> {a.phone}
            </a>
            {wa && (
              <a className={buttonClass('secondary', 'sm')} href={wa} target="_blank" rel="noopener noreferrer">
                WhatsApp
              </a>
            )}
          </div>
          {a.location && <p className="text-[13px] text-fg-muted">Lives in {a.location}</p>}

          {a.cv ? (
            <section className="grid gap-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[12.5px] font-semibold">
                  CV · {a.cv.name} <span className="font-normal text-fg-subtle">({Math.max(1, Math.round(a.cv.size / 1024))} KB)</span>
                </p>
                <a className={buttonClass('ghost', 'sm')} href={`${cvUrl}?download=1`}>
                  <Download className="size-3.5" /> Download
                </a>
              </div>
              {a.cv.mime === 'application/pdf' ? (
                <iframe src={cvUrl} title={`CV of ${a.name}`} className="h-[28rem] w-full rounded-xl border border-line bg-white" />
              ) : (
                <p className="rounded-xl bg-surface-2/60 p-3 text-[12.5px] text-fg-muted">A Word document — download it to read.</p>
              )}
            </section>
          ) : (
            <p className="rounded-xl bg-surface-2/60 p-3 text-[12.5px] text-fg-muted">No CV attached.</p>
          )}

          {a.answers.length > 0 && (
            <section className="grid gap-3">
              {a.answers.map((x) => (
                <div key={x.id}>
                  <p className="text-[12px] font-semibold text-fg-subtle">{x.question}</p>
                  <p className="whitespace-pre-wrap text-[13px]">{x.answer}</p>
                </div>
              ))}
            </section>
          )}
          {a.coverLetter && (
            <section>
              <p className="mb-1 text-[12px] font-semibold text-fg-subtle">In their words</p>
              <p className="whitespace-pre-wrap rounded-xl bg-surface-2/60 p-3 text-[13px]">{a.coverLetter}</p>
            </section>
          )}

          <section className="grid gap-2 rounded-xl border border-line p-3">
            <p className="text-[12px] font-semibold text-fg-subtle">Move to</p>
            <div className="flex flex-wrap gap-1.5">
              {APPLICATION_STATUSES.filter((s) => s !== a.status && s !== 'NEW').map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => {
                    setMoving(s);
                    setNotify(NOTIFY_DEFAULT.includes(s));
                  }}
                  className={cn('rounded-full border px-3 py-1 text-[12px] font-medium', moving === s ? 'border-fg bg-fg text-bg' : 'border-line hover:border-fg/40')}
                >
                  {APPLICATION_STATUS_LABEL[s]}
                </button>
              ))}
            </div>
            {moving && (
              <div className="grid gap-2 pt-1">
                <label className="flex items-center gap-2 text-[12.5px]">
                  <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} /> Email {a.name.split(' ')[0]} about it
                </label>
                {notify && <TextArea label="Message (optional)" rows={4} placeholder="Leave empty to send our standard, friendly wording for this stage." value={message} onChange={(e) => setMessage(e.target.value)} />}
                <div className="flex gap-2">
                  <Button variant="primary" loading={move.isPending} onClick={() => move.mutate()}>
                    Move to {APPLICATION_STATUS_LABEL[moving]}
                    {notify ? ' & email' : ''}
                  </Button>
                  <Button variant="ghost" onClick={() => setMoving(null)}>
                    Back
                  </Button>
                </div>
              </div>
            )}
          </section>

          {(a.status === 'OFFERED' || a.status === 'HIRED') && can('hr:manage') && (
            <section className="grid gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3 text-[12.5px]">
              <p className="font-semibold">{a.staffProfileId ? 'Linked to their staff profile' : 'Joining the team?'}</p>
              {!a.staffProfileId && (
                <>
                  <p className="text-fg-muted">
                    Create their profile in the <Link href="/hr" className="underline">Staff Directory</Link> (name {a.name}, phone {a.phone}, email {a.email}), then link it here.
                  </p>
                  <div className="flex gap-2">
                    <SelectInput aria-label="Staff profile" value={staffId} onChange={(e) => setStaffId(e.target.value)} wrapClassName="flex-1">
                      <option value="">Pick their staff profile…</option>
                      {staffList.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.fullName} — {s.employeeNumber}
                        </option>
                      ))}
                    </SelectInput>
                    <Button variant="primary" disabled={!staffId} loading={link.isPending} onClick={() => link.mutate()}>
                      Mark hired
                    </Button>
                  </div>
                </>
              )}
            </section>
          )}

          <section>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-fg-subtle">History</p>
            <ol className="grid gap-2.5 border-l border-line pl-4">
              {a.notes?.map((n) => (
                <li key={n.id} className="relative text-[12.5px]">
                  <span className={cn('absolute -left-[21px] top-1.5 size-2.5 rounded-full border-2 border-surface', n.kind === 'NOTE' ? 'bg-accent' : 'bg-fg-subtle')} />
                  {n.kind === 'NOTE' ? (
                    <div className="rounded-lg bg-surface-2/70 px-3 py-2">
                      <p className="whitespace-pre-wrap">{n.body}</p>
                      <p className="mt-0.5 text-[11px] text-fg-subtle">
                        {n.authorName} · {ago(n.createdAt)}
                      </p>
                    </div>
                  ) : (
                    <p className="text-fg-muted">
                      {n.body} <span className="text-[11px] text-fg-subtle">· {ago(n.createdAt)}</span>
                    </p>
                  )}
                </li>
              ))}
            </ol>
            <form
              className="mt-3 flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (note.trim()) addNote.mutate();
              }}
            >
              <input className="input h-9 flex-1 text-[12.5px]" placeholder="Private note — impressions, interview notes…" value={note} onChange={(e) => setNote(e.target.value)} aria-label="Add a note" />
              <Button type="submit" variant="secondary" icon={<MessageSquarePlus className="size-3.5" />} loading={addNote.isPending} disabled={!note.trim()}>
                Add
              </Button>
            </form>
          </section>
          <p className="text-[11.5px] text-fg-subtle">Applications and CVs are deleted automatically a year after the role closes, unless the person is hired. Opening a CV is recorded in the audit log.</p>
        </div>
      )}
    </Dialog>
  );
}

export default function CareersPage() {
  return (
    <Suspense>
      <CareersInner />
    </Suspense>
  );
}
