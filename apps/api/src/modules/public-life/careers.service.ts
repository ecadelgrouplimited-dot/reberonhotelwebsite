import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { randomBytes } from 'node:crypto';
import type { z } from 'zod';
import {
  APPLICATION_STATUS_LABEL,
  CV_MAX_BYTES,
  t,
  type ApplicationDTO,
  type ApplicationResultDTO,
  type ApplicationStatus,
  type CareersOverviewDTO,
  type JobAdminRowDTO,
  type JobCardDTO,
  type JobDetailDTO,
  type zApplicationInput,
  type zApplicationStatusInput,
  type zJobInput,
} from '@reberon/contracts';
import { referenceCode, slugify } from '@reberon/utils';
import { createStorage } from '@reberon/media';
import { Prisma, type JobApplication, type JobApplicationNote, type JobPosting } from '@reberon/db';
import { PrismaService } from '../../common/prisma.service.js';
import { AuditService } from '../../common/audit.service.js';
import { CacheService } from '../../common/cache.service.js';
import { Events } from '../../common/events.js';
import type { AuthUser } from '../../common/auth.js';
import { badRequest, conflict, notFound } from '../../common/errors.js';
import { env } from '../../config.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { ResolverService } from '../content/resolver.service.js';
import { lr, lt } from '../content/mappers.js';
import { jobCard, jobOpen } from './cards.js';

const TTL = 60;
const RETENTION_DAYS = 365;

/** What the file really is, from its first bytes — never trust the name or the browser's type. */
function sniffCv(buf: Buffer): { ext: 'pdf' | 'doc' | 'docx'; mime: string } | null {
  if (buf.length > 4 && buf.subarray(0, 5).toString('latin1') === '%PDF-') return { ext: 'pdf', mime: 'application/pdf' };
  if (buf.length > 8 && buf.subarray(0, 8).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]))) return { ext: 'doc', mime: 'application/msword' };
  if (buf.length > 4 && buf[0] === 0x50 && buf[1] === 0x4b && buf.includes(Buffer.from('word/'))) return { ext: 'docx', mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' };
  return null;
}

/** Default wording for status emails; the House can edit before sending. */
export const STATUS_EMAIL: Partial<Record<ApplicationStatus, (first: string, job: string) => { subject: string; heading: string; body: string }>> = {
  SHORTLISTED: (first, job) => ({ subject: `Your application: ${job}`, heading: 'You are on our shortlist', body: `Hello ${first},\n\nThank you for applying for ${job}. We liked your application and you are on our shortlist. We will be in touch soon about next steps.` }),
  INTERVIEW: (first, job) => ({ subject: `Interview: ${job}`, heading: 'We would like to meet you', body: `Hello ${first},\n\nWe would like to invite you to an interview for ${job}. We will call you to agree a time that suits you.` }),
  OFFERED: (first, job) => ({ subject: `An offer: ${job}`, heading: 'We would like you to join us', body: `Hello ${first},\n\nWe are delighted to offer you the role of ${job}. We will share the details with you shortly.` }),
  REJECTED: (first, job) => ({ subject: `Your application: ${job}`, heading: 'Thank you for applying', body: `Hello ${first},\n\nThank you for your interest in ${job} and for the time you took to apply. After careful thought we will not be taking your application further this time.\n\nWe will keep your details for future openings for up to a year, unless you ask us not to. We wish you every success.` }),
};

@Injectable()
export class CareersService {
  private readonly log = new Logger('Careers');
  private readonly storage = createStorage();

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly cache: CacheService,
    private readonly bus: EventEmitter2,
    private readonly resolver: ResolverService,
    private readonly notifications: NotificationsService,
  ) {}

  private async changed() {
    await this.cache.bust(['jobs']);
    await this.bus.emitAsync(Events.ContentChanged, { tags: ['jobs'] });
  }

  private async departments() {
    const rows = await this.prisma.hotelDepartment.findMany({ select: { code: true, name: true }, orderBy: { name: 'asc' } });
    return rows;
  }

  private isOpen(j: JobPosting) {
    return jobOpen(j);
  }

  private card(j: JobPosting, deptName: Map<string, string>): JobCardDTO {
    return jobCard(j, deptName);
  }

  private async cards(rows: JobPosting[]) {
    const depts = new Map((await this.departments()).map((d) => [d.code, d.name]));
    return rows.map((r) => this.card(r, depts));
  }

  /* ───────────────────────── public ───────────────────────── */

  publicList(): Promise<JobCardDTO[]> {
    return this.cache.wrap('jobs:list', ['jobs'], TTL, async () => {
      const rows = await this.prisma.jobPosting.findMany({ where: { status: 'OPEN', deletedAt: null }, orderBy: [{ publishedAt: 'desc' }, { createdAt: 'desc' }] });
      return (await this.cards(rows)).filter((j) => j.open);
    });
  }

  publicDetail(slug: string): Promise<JobDetailDTO> {
    return this.cache.wrap(`job:${slug}`, ['jobs', `job:${slug}`, 'media'], TTL, async () => {
      const j = await this.prisma.jobPosting.findFirst({ where: { slug, status: { in: ['OPEN', 'CLOSED'] }, deletedAt: null } });
      if (!j) throw notFound('Job');
      const [[card], more, media] = await Promise.all([
        this.cards([j]),
        this.prisma.jobPosting.findMany({ where: { status: 'OPEN', deletedAt: null, id: { not: j.id } }, orderBy: { publishedAt: 'desc' }, take: 4 }),
        this.resolver.mediaMap(j.coverId ? [j.coverId] : []),
      ]);
      const seo = (j.seo ?? {}) as JobDetailDTO['seo'];
      return {
        ...card!,
        description: lr(j.description),
        requirements: lr(j.requirements),
        benefits: lr(j.benefits),
        questions: this.questions(j),
        cover: j.coverId ? (media.get(j.coverId) ?? null) : null,
        // A closed role stays readable for people with the link, but leaves search results.
        seo: { ...seo, noindex: seo.noindex || !card!.open },
        more: (await this.cards(more)).filter((m) => m.open).slice(0, 3),
      };
    });
  }

  private questions(j: Pick<JobPosting, 'questions'>) {
    return Array.isArray(j.questions) ? (j.questions as { id: string; label: string; required?: boolean }[]).map((q) => ({ id: String(q.id), label: String(q.label), required: !!q.required })) : [];
  }

  /** An application, with an optional CV (sniffed, size-checked, kept in private storage). `slug` null = open application. */
  async apply(slug: string | null, body: z.infer<typeof zApplicationInput>, file: Express.Multer.File | undefined): Promise<ApplicationResultDTO> {
    const job = slug ? await this.prisma.jobPosting.findFirst({ where: { slug, deletedAt: null } }) : null;
    if (slug && !job) throw notFound('Job');
    if (job && !this.isOpen(job)) throw badRequest('This role is no longer taking applications.');
    // Required questions answered?
    if (job) {
      for (const q of this.questions(job).filter((q) => q.required)) {
        if (!body.answers.find((a) => a.id === q.id && a.answer.trim())) throw badRequest(`Please answer: ${q.label}`, [{ path: `answers.${q.id}`, message: 'Required' }]);
      }
    }
    let cv: { buf: Buffer; ext: string; mime: string; name: string } | null = null;
    if (file) {
      if (file.size > CV_MAX_BYTES) throw badRequest('Your CV is larger than 5 MB — please send a smaller file.', [{ path: 'cv', message: 'Too large' }]);
      const kind = sniffCv(file.buffer);
      if (!kind) throw badRequest('Please send your CV as a PDF or Word document.', [{ path: 'cv', message: 'PDF or Word only' }]);
      const base = (file.originalname || 'cv').replace(/\.[^.]+$/, '').replace(/[^\w.-]+/g, '_').slice(0, 60) || 'cv';
      cv = { buf: file.buffer, ext: kind.ext, mime: kind.mime, name: `${base}.${kind.ext}` };
    }
    // The same person applying twice for the same role within 30 days: keep the first.
    const dup = await this.prisma.jobApplication.findFirst({ where: { email: body.email, jobId: job?.id ?? null, createdAt: { gte: new Date(Date.now() - 30 * 86_400_000) }, status: { not: 'WITHDRAWN' } } });
    if (dup) throw conflict(`We already have your application${job ? ' for this role' : ''} (${dup.code}). We will be in touch — there is no need to apply again.`);

    const app = await this.prisma.jobApplication.create({
      data: {
        code: referenceCode('AP', 5),
        jobId: job?.id ?? null,
        name: body.name,
        email: body.email,
        phone: body.phone,
        location: body.location ?? null,
        coverLetter: body.coverLetter ?? null,
        answers: body.answers as Prisma.InputJsonValue,
        consentAt: new Date(),
        source: body.source ?? null,
      },
    });
    if (cv) {
      const key = `private/applications/${app.id}/${randomBytes(6).toString('hex')}-${cv.name}`;
      await this.storage.put(key, cv.buf, cv.mime);
      await this.prisma.jobApplication.update({ where: { id: app.id }, data: { cvKey: key, cvName: cv.name, cvMime: cv.mime, cvSize: cv.buf.length } });
    }
    const title = job ? t(lt(job.title)) : 'an open application';
    await this.prisma.jobApplicationNote.create({ data: { applicationId: app.id, authorName: 'Website', body: `Applied${job ? ` for ${title}` : ' (open application)'}${cv ? ' with a CV' : ''}`, kind: 'EVENT' } });
    await this.audit.record({ actorType: 'GUEST', action: 'careers.application', entityType: 'JobApplication', entityId: app.id, summary: `${app.name} applied for ${title} (${app.code})` });
    await this.notifications.email({
      to: app.email,
      subject: job ? `We have your application: ${title}` : 'We have your application',
      heading: 'Thank you for applying',
      paragraphs: [
        `Hello ${app.name.split(' ')[0]},`,
        job ? `Thank you for applying for ${title} at Reberon Hotel. Every application is read by a person.` : 'Thank you for sending us your details. We will look at them whenever a role that fits you opens.',
        'If we would like to take things further we will contact you by phone or email. We keep applications for up to a year and then delete them, unless you join us.',
      ],
      facts: [['Reference', app.code], ...(job ? ([['Role', title]] as [string, string][]) : [])],
      footnote: 'To withdraw your application or ask for your data to be deleted, reply to this email.',
    });
    return { code: app.code, jobTitle: job ? lt(job.title) : null };
  }

  /* ───────────────────────── House ───────────────────────── */

  private appDTO(a: JobApplication & { job: Pick<JobPosting, 'id' | 'title' | 'slug' | 'questions'> | null; notes?: JobApplicationNote[] }): ApplicationDTO {
    const qs = a.job ? this.questions(a.job) : [];
    const answers = Array.isArray(a.answers) ? (a.answers as { id: string; answer: string }[]) : [];
    return {
      id: a.id,
      code: a.code,
      job: a.job ? { id: a.job.id, title: lt(a.job.title), slug: a.job.slug } : null,
      name: a.name,
      email: a.email,
      phone: a.phone,
      location: a.location,
      coverLetter: a.coverLetter,
      answers: answers.map((x) => ({ id: x.id, question: qs.find((q) => q.id === x.id)?.label ?? x.id, answer: x.answer })),
      cv: a.cvKey && a.cvName && a.cvMime ? { name: a.cvName, mime: a.cvMime, size: a.cvSize ?? 0 } : null,
      status: a.status,
      rating: a.rating,
      source: a.source,
      staffProfileId: a.staffProfileId,
      createdAt: a.createdAt.toISOString(),
      updatedAt: a.updatedAt.toISOString(),
      notes: a.notes?.map((n) => ({ id: n.id, authorName: n.authorName, body: n.body, kind: n.kind === 'EVENT' ? 'EVENT' : 'NOTE', createdAt: n.createdAt.toISOString() })),
    };
  }

  async overview(): Promise<CareersOverviewDTO> {
    const [jobs, apps, departments] = await Promise.all([
      this.prisma.jobPosting.findMany({ where: { deletedAt: null }, orderBy: [{ status: 'asc' }, { createdAt: 'desc' }] }),
      this.prisma.jobApplication.findMany({ include: { job: { select: { id: true, title: true, slug: true, questions: true } } }, orderBy: { createdAt: 'desc' }, take: 1000 }),
      this.departments(),
    ]);
    const depts = new Map(departments.map((d) => [d.code, d.name]));
    const counts = Object.fromEntries(Object.keys(APPLICATION_STATUS_LABEL).map((s) => [s, apps.filter((a) => a.status === s).length])) as CareersOverviewDTO['counts'];
    return {
      jobs: jobs.map((j): JobAdminRowDTO => ({ ...this.card(j, depts), applications: apps.filter((a) => a.jobId === j.id).length, newApplications: apps.filter((a) => a.jobId === j.id && a.status === 'NEW').length })),
      applications: apps.map((a) => this.appDTO(a)),
      counts,
      departments,
    };
  }

  async adminGetJob(id: string) {
    const j = await this.prisma.jobPosting.findFirst({ where: { id, deletedAt: null } });
    if (!j) throw notFound('Job');
    const media = await this.resolver.mediaMap(j.coverId ? [j.coverId] : []);
    return {
      ...j,
      salaryMinMinor: j.salaryMinMinor?.toString() ?? null,
      salaryMaxMinor: j.salaryMaxMinor?.toString() ?? null,
      closesOn: j.closesOn?.toISOString().slice(0, 10) ?? null,
      cover: j.coverId ? (media.get(j.coverId) ?? null) : null,
    };
  }

  private jobData(body: Partial<z.infer<typeof zJobInput>>): Prisma.JobPostingUncheckedUpdateInput {
    const { salaryMinMinor, salaryMaxMinor, closesOn, seo, questions, slug: _s, ...rest } = body;
    const d: Prisma.JobPostingUncheckedUpdateInput = { ...rest } as Prisma.JobPostingUncheckedUpdateInput;
    if (salaryMinMinor !== undefined) d.salaryMinMinor = salaryMinMinor && salaryMinMinor !== '0' ? BigInt(salaryMinMinor) : null;
    if (salaryMaxMinor !== undefined) d.salaryMaxMinor = salaryMaxMinor && salaryMaxMinor !== '0' ? BigInt(salaryMaxMinor) : null;
    if (closesOn !== undefined) d.closesOn = closesOn ? new Date(`${closesOn}T00:00:00Z`) : null;
    if (seo !== undefined) d.seo = seo as Prisma.InputJsonValue;
    if (questions !== undefined) d.questions = questions as Prisma.InputJsonValue;
    for (const k of ['summary', 'description', 'requirements', 'benefits'] as const) if (body[k] === null) d[k] = Prisma.JsonNull;
    return d;
  }

  async createJob(body: z.infer<typeof zJobInput>, actor: AuthUser) {
    let slug = body.slug ?? slugify(body.title.en ?? Object.values(body.title)[0] ?? 'job');
    // "apply" and "open" are pages of their own on the website.
    if (['apply', 'open'].includes(slug)) slug = `${slug}-role`;
    if (await this.prisma.jobPosting.findUnique({ where: { slug } })) slug = `${slug}-${randomBytes(2).toString('hex')}`;
    const j = await this.prisma.jobPosting.create({ data: { ...(this.jobData(body) as Prisma.JobPostingUncheckedCreateInput), slug, publishedAt: body.status === 'OPEN' ? new Date() : null } });
    await this.audit.record({ actor, action: 'careers.job_create', entityType: 'JobPosting', entityId: j.id, summary: `Created job "${t(lt(j.title))}" (${j.status.toLowerCase()})` });
    await this.changed();
    return this.adminGetJob(j.id);
  }

  async updateJob(id: string, body: Partial<z.infer<typeof zJobInput>>, actor: AuthUser) {
    const before = await this.prisma.jobPosting.findFirst({ where: { id, deletedAt: null } });
    if (!before) throw notFound('Job');
    const d = this.jobData(body);
    if (body.slug && ['apply', 'open'].includes(body.slug)) throw badRequest('That address is used by the careers pages — choose another', [{ path: 'slug', message: 'Reserved' }]);
    if (body.slug && body.slug !== before.slug) {
      if (await this.prisma.jobPosting.findFirst({ where: { slug: body.slug, id: { not: id } } })) throw conflict('Another job already uses that address');
      d.slug = body.slug;
    }
    if (body.status === 'OPEN' && before.status !== 'OPEN') d.publishedAt = new Date();
    const j = await this.prisma.jobPosting.update({ where: { id }, data: d });
    await this.audit.record({ actor, action: 'careers.job_update', entityType: 'JobPosting', entityId: id, summary: `Updated job "${t(lt(j.title))}"${before.status !== j.status ? ` (${before.status.toLowerCase()} → ${j.status.toLowerCase()})` : ''}` });
    await this.cache.bust([`job:${before.slug}`, `job:${j.slug}`]);
    await this.changed();
    return this.adminGetJob(id);
  }

  async removeJob(id: string, actor: AuthUser) {
    const j = await this.prisma.jobPosting.findFirst({ where: { id, deletedAt: null } });
    if (!j) throw notFound('Job');
    await this.prisma.jobPosting.update({ where: { id }, data: { deletedAt: new Date(), status: 'CLOSED', slug: `${j.slug}--deleted-${Date.now()}` } });
    await this.audit.record({ actor, action: 'careers.job_delete', entityType: 'JobPosting', entityId: id, summary: `Deleted job "${t(lt(j.title))}" (applications kept)` });
    await this.cache.bust([`job:${j.slug}`]);
    await this.changed();
  }

  private async loadApp(id: string) {
    const a = await this.prisma.jobApplication.findUnique({ where: { id }, include: { job: { select: { id: true, title: true, slug: true, questions: true } }, notes: { orderBy: { createdAt: 'asc' } } } });
    if (!a) throw notFound('Application');
    return a;
  }

  async getApplication(id: string, actor: AuthUser) {
    const a = await this.loadApp(id);
    // Opening a new application moves it to "Reviewing" — the applicant is no longer unread.
    if (a.status === 'NEW') {
      await this.prisma.jobApplication.update({ where: { id }, data: { status: 'REVIEWING' } });
      await this.prisma.jobApplicationNote.create({ data: { applicationId: id, authorId: actor.id, authorName: actor.name, body: `${actor.name.split(' ')[0]} opened it — now reviewing`, kind: 'EVENT' } });
      return this.appDTO(await this.loadApp(id));
    }
    return this.appDTO(a);
  }

  async setStatus(id: string, body: z.infer<typeof zApplicationStatusInput>, actor: AuthUser) {
    const a = await this.loadApp(id);
    if (a.status === body.status && !body.notify) return this.appDTO(a);
    await this.prisma.jobApplication.update({ where: { id }, data: { status: body.status } });
    const jobTitle = a.job ? t(lt(a.job.title)) : 'an open application';
    let emailed = false;
    if (body.notify) {
      const tpl = STATUS_EMAIL[body.status]?.(a.name.split(' ')[0]!, a.job ? t(lt(a.job.title)) : 'a role at Reberon Hotel');
      const text = body.message?.trim() || tpl?.body;
      if (!text) throw badRequest('Write the message to send');
      await this.notifications.email({
        to: a.email,
        subject: tpl?.subject ?? `Your application to Reberon Hotel`,
        heading: tpl?.heading ?? 'About your application',
        paragraphs: text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean),
        facts: [['Reference', a.code]],
        footnote: 'Reply to this email with any questions.',
      });
      emailed = true;
    }
    await this.prisma.jobApplicationNote.create({
      data: { applicationId: id, authorId: actor.id, authorName: actor.name, kind: 'EVENT', body: `${a.status !== body.status ? `Moved to ${APPLICATION_STATUS_LABEL[body.status]}` : 'Emailed the applicant'}${emailed ? ' — applicant emailed' : ''}` },
    });
    await this.audit.record({ actor, action: 'careers.application_status', entityType: 'JobApplication', entityId: id, summary: `${a.name} (${a.code}, ${jobTitle}): ${APPLICATION_STATUS_LABEL[a.status]} → ${APPLICATION_STATUS_LABEL[body.status]}${emailed ? ', emailed' : ''}` });
    return this.appDTO(await this.loadApp(id));
  }

  async addNote(id: string, text: string, actor: AuthUser) {
    await this.loadApp(id);
    await this.prisma.jobApplicationNote.create({ data: { applicationId: id, authorId: actor.id, authorName: actor.name, body: text, kind: 'NOTE' } });
    await this.prisma.jobApplication.update({ where: { id }, data: { updatedAt: new Date() } });
    return this.appDTO(await this.loadApp(id));
  }

  async rate(id: string, rating: number | null, actor: AuthUser) {
    const a = await this.loadApp(id);
    await this.prisma.jobApplication.update({ where: { id }, data: { rating } });
    await this.audit.record({ actor, action: 'careers.application_rate', entityType: 'JobApplication', entityId: id, summary: `Rated ${a.name} ${rating ?? 'none'}/5` });
    return this.appDTO(await this.loadApp(id));
  }

  /** The CV itself — only through the House, and every opening is recorded. */
  async cv(id: string, actor: AuthUser) {
    const a = await this.prisma.jobApplication.findUnique({ where: { id } });
    if (!a?.cvKey || !a.cvMime || !a.cvName) throw notFound('CV');
    const body = await this.storage.get(a.cvKey);
    await this.audit.record({ actor, action: 'careers.cv_open', entityType: 'JobApplication', entityId: id, summary: `Opened the CV of ${a.name} (${a.code})` });
    return { body, mime: a.cvMime, name: a.cvName };
  }

  /** Link a hire to the staff profile HR created for them. */
  async linkStaff(id: string, staffProfileId: string, actor: AuthUser) {
    const a = await this.loadApp(id);
    const staff = await this.prisma.staffProfile.findUnique({ where: { id: staffProfileId }, select: { id: true, employeeNumber: true } });
    if (!staff) throw notFound('Staff profile');
    await this.prisma.jobApplication.update({ where: { id }, data: { staffProfileId, status: 'HIRED' } });
    await this.prisma.jobApplicationNote.create({ data: { applicationId: id, authorId: actor.id, authorName: actor.name, kind: 'EVENT', body: `Hired — staff profile ${staff.employeeNumber}` } });
    await this.audit.record({ actor, action: 'careers.hired', entityType: 'JobApplication', entityId: id, summary: `${a.name} hired (${staff.employeeNumber})` });
    return this.appDTO(await this.loadApp(id));
  }

  /** Privacy: applications are deleted a year after the role closes (or a year after an open application), unless hired. */
  @Cron('30 3 * * *', { timeZone: 'Africa/Kampala' })
  async retention() {
    const cutoff = new Date(Date.now() - RETENTION_DAYS * 86_400_000);
    const old = await this.prisma.jobApplication.findMany({
      where: {
        status: { not: 'HIRED' },
        createdAt: { lt: cutoff },
        OR: [{ jobId: null }, { job: { OR: [{ status: 'CLOSED' }, { deletedAt: { not: null } }, { closesOn: { lt: cutoff } }] } }],
      },
      select: { id: true, cvKey: true },
      take: 500,
    });
    for (const a of old) {
      if (a.cvKey) await this.storage.remove(`private/applications/${a.id}`).catch(() => undefined);
      await this.prisma.jobApplication.delete({ where: { id: a.id } });
    }
    if (old.length) {
      this.log.log(`Deleted ${old.length} application(s) past the one-year retention`);
      await this.audit.record({ actorType: 'SYSTEM', action: 'careers.retention', entityType: 'JobApplication', entityId: null, summary: `Deleted ${old.length} application(s) older than a year (privacy retention)` });
    }
  }
}

export const careersPublicUrl = (slug: string) => `${env.WEB_URL}/careers/${slug}`;
