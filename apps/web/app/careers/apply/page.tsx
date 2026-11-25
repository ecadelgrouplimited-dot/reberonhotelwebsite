import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { api } from '@/lib/api';
import { buildMetadata } from '@/lib/seo';
import { ApplyForm } from '@/components/forms/apply-form';

export const revalidate = 300;

export async function generateMetadata() {
  const site = await api.site();
  return buildMetadata(site, { title: 'Open application — Careers', path: '/careers/apply', description: `Send ${site.name} your CV for future roles.` });
}

export default function OpenApplication() {
  return (
    <section className="container-x grid max-w-6xl gap-14 pb-24 pt-28 md:pt-36 lg:grid-cols-[1fr_28rem] lg:gap-20">
      <div>
        <Link href="/careers" className="inline-flex items-center gap-2 text-sm text-fg-muted hover:text-fg">
          <ArrowLeft className="size-4" /> All roles
        </Link>
        <p className="eyebrow mt-8">Open application</p>
        <h1 className="mt-4 text-step-5">Not seeing your role? Tell us about you.</h1>
        <p className="mt-5 max-w-xl text-[1.1rem] text-fg-muted">
          We are a young hotel and new roles open as we grow — in the kitchen, the gardens, the front desk, the spa and on the trails. Send your details and CV, and we will contact you when something fits.
        </p>
        <p className="mt-4 max-w-xl text-fg-muted">We keep open applications for a year, then delete them. You can ask us to remove yours sooner at any time.</p>
      </div>
      <div className="rounded-[var(--r-lg)] border border-line bg-surface p-6 md:p-7 lg:self-start">
        <ApplyForm slug="open" jobTitle={null} />
      </div>
    </section>
  );
}
