import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Briefcase, CalendarClock, MapPin, Users, Wallet } from 'lucide-react';
import { t } from '@reberon/contracts';
import { api, orNull } from '@/lib/api';
import { buildMetadata, JsonLd, WEB_URL } from '@/lib/seo';
import { RichText } from '@/components/ui/rich-text';
import { JobRow } from '@/components/blocks/life';
import { ShareSheet } from '@/components/site/share-sheet';
import { ApplyForm } from '@/components/forms/apply-form';
import { jobCloses, jobPay, jobType } from '@/lib/life-format';

export const revalidate = 60;
type Props = { params: Promise<{ slug: string }> };

export async function generateStaticParams() {
  const jobs = await api.jobs().catch(() => []);
  return jobs.map((j) => ({ slug: j.slug }));
}

export async function generateMetadata({ params }: Props) {
  const { slug } = await params;
  const [site, j] = await Promise.all([api.site(), orNull(api.job(slug))]);
  if (!j) return {};
  return buildMetadata(site, {
    title: `${t(j.title)} — Careers`,
    seo: j.seo,
    path: `/careers/${slug}`,
    image: j.cover,
    description: j.summary ? t(j.summary) : `${jobType(j)} role at ${site.name}, ${j.location}.`,
  });
}

const EMPLOYMENT: Record<string, string> = { FULL_TIME: 'FULL_TIME', PART_TIME: 'PART_TIME', CONTRACT: 'CONTRACTOR', INTERNSHIP: 'INTERN', SEASONAL: 'TEMPORARY', VOLUNTEER: 'VOLUNTEER' };

export default async function JobPage({ params }: Props) {
  const { slug } = await params;
  const [site, j] = await Promise.all([api.site(), orNull(api.job(slug))]);
  if (!j) notFound();
  const url = `${WEB_URL}/careers/${j.slug}`;
  const pay = jobPay(j);
  const closes = jobCloses(j);
  const major = (v: string | null) => (v ? (j.salary?.currency === 'USD' ? Number(v) / 100 : Number(v)) : undefined);

  // Google for Jobs: https://developers.google.com/search/docs/appearance/structured-data/job-posting
  const ld = j.open
    ? {
        '@context': 'https://schema.org',
        '@type': 'JobPosting',
        title: t(j.title),
        description: [j.summary ? t(j.summary) : '', 'Apply online at ' + url].filter(Boolean).join('\n\n'),
        datePosted: j.publishedAt ?? undefined,
        validThrough: j.closesOn ? `${j.closesOn}T23:59:59+03:00` : undefined,
        employmentType: EMPLOYMENT[j.employmentType],
        hiringOrganization: { '@type': 'Organization', name: site.name, sameAs: WEB_URL },
        jobLocation: { '@type': 'Place', address: { '@type': 'PostalAddress', addressLocality: j.location.split(',')[0], addressCountry: 'UG' } },
        directApply: true,
        totalJobOpenings: j.openings,
        baseSalary: j.salary
          ? { '@type': 'MonetaryAmount', currency: j.salary.currency, value: { '@type': 'QuantitativeValue', minValue: major(j.salary.min), maxValue: major(j.salary.max), unitText: j.salary.period ?? 'MONTH' } }
          : undefined,
      }
    : null;

  return (
    <article className="pb-24 pt-28 md:pt-36">
      {ld && <JsonLd data={ld} />}
      <div className="container-x">
        <Link href="/careers" className="inline-flex items-center gap-2 text-sm text-fg-muted hover:text-fg">
          <ArrowLeft className="size-4" /> All roles
        </Link>
        <p className="eyebrow mt-8">{j.department ?? 'Careers'}</p>
        <h1 className="mt-4 max-w-4xl text-step-5">{t(j.title)}</h1>
        {j.summary && <p className="mt-5 max-w-2xl text-[1.15rem] text-fg-muted">{t(j.summary)}</p>}
        <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-fg-muted">
          <li className="inline-flex items-center gap-2"><Briefcase className="size-4" /> {jobType(j)}</li>
          <li className="inline-flex items-center gap-2"><MapPin className="size-4" /> {j.location}</li>
          {j.openings > 1 && <li className="inline-flex items-center gap-2"><Users className="size-4" /> {j.openings} openings</li>}
          {pay && <li className="inline-flex items-center gap-2 font-medium text-fg"><Wallet className="size-4" /> {pay}</li>}
          {closes && j.open && <li className="inline-flex items-center gap-2 font-medium text-accent"><CalendarClock className="size-4" /> {closes}</li>}
        </ul>
      </div>

      {!j.open && (
        <div className="container-x mt-8">
          <p role="status" className="rounded-[var(--r-md)] border border-line-strong bg-surface-2 px-5 py-4">
            This role is no longer taking applications. <Link href="/careers" className="underline underline-offset-4">See open roles</Link> or <Link href="/careers/apply" className="underline underline-offset-4">send an open application</Link>.
          </p>
        </div>
      )}

      <div className="container-x mt-12 grid gap-14 lg:grid-cols-[1fr_28rem] lg:gap-20">
        <div className="min-w-0 grid gap-12">
          {j.description && (
            <section aria-labelledby="role">
              <h2 id="role" className="mb-4 text-step-2">The role</h2>
              <RichText value={j.description} className="text-[1.08rem]" />
            </section>
          )}
          {j.requirements && (
            <section aria-labelledby="you">
              <h2 id="you" className="mb-4 text-step-2">What we look for</h2>
              <RichText value={j.requirements} className="text-[1.08rem]" />
            </section>
          )}
          {j.benefits && (
            <section aria-labelledby="give">
              <h2 id="give" className="mb-4 text-step-2">What we offer</h2>
              <RichText value={j.benefits} className="text-[1.08rem]" />
            </section>
          )}
          <ShareSheet url={url} title={`${t(j.title)} at ${site.name}`} text={`${jobType(j)} · ${j.location}`} />
        </div>
        {j.open && (
          <aside className="lg:sticky lg:top-28 lg:self-start" id="apply">
            <div className="rounded-[var(--r-lg)] border border-line bg-surface p-6 md:p-7">
              <h2 className="mb-1 text-step-2">Apply</h2>
              <p className="mb-6 text-sm text-fg-muted">Takes about five minutes. We reply to everyone.</p>
              <ApplyForm slug={j.slug} jobTitle={t(j.title)} questions={j.questions} />
            </div>
          </aside>
        )}
      </div>

      {j.more.length > 0 && (
        <section className="container-x mt-24" aria-labelledby="more-roles">
          <h2 id="more-roles" className="mb-8 text-step-3">Other open roles</h2>
          <div className="grid gap-4">
            {j.more.map((m) => (
              <JobRow key={m.id} j={m} />
            ))}
          </div>
        </section>
      )}
    </article>
  );
}
